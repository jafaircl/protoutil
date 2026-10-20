import { clone, create, type DescMessage, type MessageShape } from "@bufbuild/protobuf";
import { Type_PrimitiveType } from "./gen/cel/expr/checked_pb.js";
import type { Expr } from "./gen/cel/expr/syntax_pb.js";
import {
  type DialectCapabilityProfile,
  DialectCapabilityProfileSchema,
  LibraryReferenceSchema,
  OperationCapabilitySchema,
  type TranslationError,
  TranslationErrorCode,
  TranslationErrorSchema,
} from "./gen/protoutil/celql/v1/celql_pb.js";
import type {
  CreateTranslatorOptions,
  EffectiveTranslationLimits,
  Profile,
  ProfileContext,
  TranslationLibrary,
  TranslationOutcome,
  TranslationRequest,
} from "./types.js";

const reservedProfileName = "celql.reserved.unregistered";
const reservedOverloadPrefix = "celql.reserved.unsupported.";

/**
 * Translates checked CEL expressions through one profile major version.
 *
 * A translator resolves selected libraries at construction time. It is safe to
 * reuse for independent operations because each profile call receives a
 * complete per-call context.
 */
export class CelqlTranslator<Desc extends DescMessage = DescMessage, Translation = unknown> {
  private readonly profile: Profile<Desc, Translation>;
  private readonly capabilityValue: DialectCapabilityProfile;
  private readonly functions: ReadonlyMap<string, Translation>;

  /**
   * Binds a profile and an optional, fixed set of translation libraries.
   *
   * The constructor rejects invalid profile metadata, incompatible libraries,
   * duplicate overload owners, and unsatisfied library dependencies.
   */
  public constructor(
    profile: Profile<Desc, Translation>,
    options: CreateTranslatorOptions<Translation> = {},
  ) {
    if (profile === undefined) {
      throw new Error("a profile is required");
    }
    const reference = profile.capability.profile;
    if (reference === undefined || reference.name.length === 0 || reference.majorVersion === 0) {
      throw new Error("a dialect profile requires a name and major version");
    }
    if (reference.name === reservedProfileName) {
      throw new Error(`${reservedProfileName} is reserved for conformance`);
    }
    if (
      profile.capability.operations.some((operation) =>
        operation.overloadId.startsWith(reservedOverloadPrefix),
      )
    ) {
      throw new Error(`${reservedOverloadPrefix} is reserved for conformance`);
    }
    if (profile.capability.libraries.length > 0) {
      throw new Error("a profile base capability must not contain translation libraries");
    }
    effectiveLimits(profile.capability);
    const materialized = materializeLibraries(profile, options.libraries ?? []);
    this.profile = profile;
    this.capabilityValue = materialized.capability;
    this.functions = materialized.functions;
  }

  /**
   * Returns a copy of the effective capability for the bound profile and libraries.
   *
   * Changes to the returned message do not change this translator.
   */
  public capability(): DialectCapabilityProfile {
    return clone(DialectCapabilityProfileSchema, this.capabilityValue);
  }

  /**
   * Validates one checked expression without producing a predicate.
   *
   * Throws `CelqlError` when the expression, limits, configuration, or selected
   * profile fragment is invalid.
   */
  public validate(request: TranslationRequest): void {
    const limits = mergeLimits(this.capabilityValue, request.limits);
    validateCheckedExpression(request.checkedExpression.expr, request.checkedExpression, limits);
    this.profile.validateConfiguration?.(request.profileConfiguration);
    if (booleanConstant(request.checkedExpression.expr) !== undefined) return;
    const context: ProfileContext = {
      checkedExpression: request.checkedExpression,
      limits,
      profileConfiguration: request.profileConfiguration,
    };
    this.profile.validate(context, this.functions);
  }

  /**
   * Translates one checked CEL Boolean expression to the bound profile output.
   *
   * Boolean literals return `matchAll` or `matchNone`; record-dependent input
   * returns one complete predicate. Throws `CelqlError` on specified rejection.
   */
  public translate(request: TranslationRequest): TranslationOutcome<MessageShape<Desc>> {
    const limits = mergeLimits(this.capabilityValue, request.limits);
    validateCheckedExpression(request.checkedExpression.expr, request.checkedExpression, limits);
    this.profile.validateConfiguration?.(request.profileConfiguration);
    const context: ProfileContext = {
      checkedExpression: request.checkedExpression,
      limits,
      profileConfiguration: request.profileConfiguration,
    };
    const constant = booleanConstant(request.checkedExpression.expr);
    if (constant !== undefined) {
      return { case: constant ? "matchAll" : "matchNone" };
    }
    const predicate = this.profile.translate(context, this.functions);
    if (predicate === undefined || predicate.$typeName !== this.capabilityValue.outputTypeName) {
      throw new CelqlError(TranslationErrorCode.INVALID_PROFILE_OUTPUT, {
        message: "The profile returned an output type that differs from its capability.",
      });
    }
    return { case: "predicate", value: predicate };
  }
}

/**
 * Creates a reusable translator for one profile major version and library set.
 *
 * Select a separate translator when the target profile, profile major version,
 * or library set differs.
 */
export function createTranslator<Desc extends DescMessage, Translation>(
  profile: Profile<Desc, Translation>,
  options: CreateTranslatorOptions<Translation> = {},
): CelqlTranslator<Desc, Translation> {
  return new CelqlTranslator(profile, options);
}

function materializeLibraries<Desc extends DescMessage, Translation>(
  profile: Profile<Desc, Translation>,
  selected: readonly TranslationLibrary<Translation>[],
): {
  capability: DialectCapabilityProfile;
  functions: ReadonlyMap<string, Translation>;
} {
  const profileReference = profile.capability.profile!;
  const librariesByName = new Map<string, TranslationLibrary<Translation>>();
  for (const library of selected) {
    const reference = library.reference;
    if (reference.name.length === 0 || reference.majorVersion === 0) {
      throw invalidLibraryConfiguration("A translation library requires a name and major version.");
    }
    if (
      library.libraryName !== reference.name ||
      library.libraryVersion !== reference.majorVersion
    ) {
      throw invalidLibraryConfiguration(
        "A translation library's CEL and translation identities differ.",
        { library: reference.name },
      );
    }
    if (
      library.profile.name !== profileReference.name ||
      library.profile.majorVersion !== profileReference.majorVersion
    ) {
      throw invalidLibraryConfiguration(
        "A translation library binding does not support the selected profile.",
        { library: reference.name },
      );
    }
    const existing = librariesByName.get(reference.name);
    if (existing !== undefined && existing.reference.majorVersion !== reference.majorVersion) {
      throw invalidLibraryConfiguration("Selected translation-library versions conflict.", {
        library: reference.name,
      });
    }
    if (existing !== undefined && existing !== library) {
      throw invalidLibraryConfiguration("Selected translation-library definitions conflict.", {
        library: reference.name,
      });
    }
    if (existing === undefined) librariesByName.set(reference.name, library);
  }

  const libraries = [...librariesByName.values()].sort((left, right) =>
    left.reference.name.localeCompare(right.reference.name),
  );
  for (const library of libraries) {
    for (const required of library.requiredTranslationLibraries ?? []) {
      const selectedDependency = librariesByName.get(required.name);
      if (
        selectedDependency === undefined ||
        selectedDependency.reference.majorVersion !== required.majorVersion
      ) {
        throw invalidLibraryConfiguration("A required translation library is not selected.", {
          library: library.reference.name,
          required_library: required.name,
        });
      }
    }
  }

  const capability = clone(DialectCapabilityProfileSchema, profile.capability);
  const overloadOwners = new Map(
    capability.operations.map((operation) => [operation.overloadId, profileReference.name]),
  );
  const functions = new Map<string, Translation>();
  for (const library of libraries) {
    capability.libraries.push(
      create(LibraryReferenceSchema, {
        name: library.reference.name,
        majorVersion: library.reference.majorVersion,
      }),
    );
    for (const fn of library.functions) {
      const overloadId = fn.capability.overloadId;
      if (overloadId.length === 0 || overloadId.startsWith(reservedOverloadPrefix)) {
        throw invalidLibraryConfiguration("A translation library declares an invalid overload.", {
          library: library.reference.name,
        });
      }
      const owner = overloadOwners.get(overloadId);
      if (owner !== undefined) {
        throw invalidLibraryConfiguration("Two translation components own one overload.", {
          overload_id: overloadId,
          owner,
          library: library.reference.name,
        });
      }
      overloadOwners.set(overloadId, library.reference.name);
      functions.set(overloadId, fn.translate);
      capability.operations.push(clone(OperationCapabilitySchema, fn.capability));
    }
  }
  return { capability, functions };
}

function invalidLibraryConfiguration(
  message: string,
  details: Record<string, string> = {},
): CelqlError {
  return new CelqlError(TranslationErrorCode.INVALID_LIBRARY_CONFIGURATION, { message, details });
}

/** Options for one machine-readable celql failure. */
export interface CelqlErrorOptions {
  /** Expression node that uniquely caused the failure. */
  expressionNodeId?: bigint;
  /** Informational message that contains no bound value. */
  message?: string;
  /** Non-secret structured diagnostic context. */
  details?: Record<string, string>;
}

/** Error thrown for a specified celql rejection or translation failure. */
export class CelqlError extends Error {
  /** Stable machine-readable failure code. */
  public readonly code: TranslationErrorCode;

  /** Expression node that uniquely caused the failure. */
  public readonly expressionNodeId?: bigint;

  /** Non-secret structured diagnostic context. */
  public readonly details: Record<string, string>;

  /**
   * Creates an error with a stable code and safe diagnostic metadata.
   *
   * Callers should use `code`, `expressionNodeId`, and `details` for handling;
   * the message is informational and is not a stable API.
   */
  public constructor(code: TranslationErrorCode, options: CelqlErrorOptions = {}) {
    super(options.message ?? "Translation was rejected.");
    this.name = "CelqlError";
    this.code = code;
    this.expressionNodeId = options.expressionNodeId;
    this.details = options.details ?? {};
  }

  /** Returns the language-independent protobuf representation of this error. */
  public toProto(): TranslationError {
    return create(TranslationErrorSchema, {
      code: this.code,
      expressionNodeId: this.expressionNodeId,
      message: this.message,
      details: this.details,
    });
  }
}

function effectiveLimits(capability: DialectCapabilityProfile): EffectiveTranslationLimits {
  const limits = capability.defaultLimits;
  if (limits === undefined) {
    throw new Error("a dialect capability profile requires default limits");
  }
  const maxOutputGrowth = limits.maxOutputGrowth ?? capability.defaultMaxOutputGrowth;
  if (
    limits.maxDepth === undefined ||
    limits.maxNodes === undefined ||
    limits.maxParameters === undefined ||
    limits.maxConstantBytes === undefined ||
    limits.maxTotalConstantBytes === undefined ||
    limits.maxComprehensionNesting === undefined ||
    limits.maxRegexPatternBytes === undefined ||
    maxOutputGrowth === undefined
  ) {
    throw new Error("a dialect capability profile must define every default limit");
  }
  return {
    maxDepth: limits.maxDepth,
    maxNodes: limits.maxNodes,
    maxParameters: limits.maxParameters,
    maxConstantBytes: limits.maxConstantBytes,
    maxTotalConstantBytes: limits.maxTotalConstantBytes,
    maxComprehensionNesting: limits.maxComprehensionNesting,
    maxRegexPatternBytes: limits.maxRegexPatternBytes,
    maxOutputGrowth,
  };
}

function mergeLimits(
  capability: DialectCapabilityProfile,
  configured: TranslationRequest["limits"],
): EffectiveTranslationLimits {
  const defaults = effectiveLimits(capability);
  return {
    maxDepth: configured?.maxDepth ?? defaults.maxDepth,
    maxNodes: configured?.maxNodes ?? defaults.maxNodes,
    maxParameters: configured?.maxParameters ?? defaults.maxParameters,
    maxConstantBytes: configured?.maxConstantBytes ?? defaults.maxConstantBytes,
    maxTotalConstantBytes: configured?.maxTotalConstantBytes ?? defaults.maxTotalConstantBytes,
    maxComprehensionNesting:
      configured?.maxComprehensionNesting ?? defaults.maxComprehensionNesting,
    maxRegexPatternBytes: configured?.maxRegexPatternBytes ?? defaults.maxRegexPatternBytes,
    maxOutputGrowth: configured?.maxOutputGrowth ?? defaults.maxOutputGrowth,
  };
}

function validateCheckedExpression(
  root: Expr | undefined,
  checkedExpression: TranslationRequest["checkedExpression"],
  limits: EffectiveTranslationLimits,
): void {
  if (root === undefined) {
    throw new CelqlError(TranslationErrorCode.INVALID_CHECKED_EXPRESSION, {
      message: "The checked expression has no root expression.",
    });
  }
  const stack: Array<{ expression: Expr; depth: number; comprehensionDepth: number }> = [
    { expression: root, depth: 1, comprehensionDepth: 0 },
  ];
  const identifiers = new Set<bigint>();
  let nodeCount = 0n;
  let totalConstantBytes = 0n;
  while (stack.length > 0) {
    const current = stack.pop()!;
    const expression = current.expression;
    nodeCount += 1n;
    if (nodeCount > limits.maxNodes) {
      throwLimitError("max_nodes", limits.maxNodes, nodeCount);
    }
    if (current.depth > limits.maxDepth) {
      throwLimitError("max_depth", BigInt(limits.maxDepth), BigInt(current.depth));
    }
    if (expression.id <= 0n || identifiers.has(expression.id)) {
      throw new CelqlError(TranslationErrorCode.INVALID_CHECKED_EXPRESSION, {
        expressionNodeId: expression.id > 0n ? expression.id : undefined,
        message: "A reachable expression node identifier is invalid or duplicated.",
      });
    }
    identifiers.add(expression.id);
    if (expression.exprKind.case === undefined) {
      throw new CelqlError(TranslationErrorCode.INVALID_CHECKED_EXPRESSION, {
        expressionNodeId: expression.id,
        message: "A reachable expression node has no expression kind.",
      });
    }
    if (checkedExpression.typeMap[expression.id.toString()] === undefined) {
      throw new CelqlError(TranslationErrorCode.INVALID_CHECKED_EXPRESSION, {
        expressionNodeId: expression.id,
        message: "A reachable expression node has no resolved type.",
      });
    }
    const reference = checkedExpression.referenceMap[expression.id.toString()];
    if (
      (expression.exprKind.case === "identExpr" || expression.exprKind.case === "callExpr") &&
      reference === undefined
    ) {
      throw new CelqlError(TranslationErrorCode.INVALID_CHECKED_EXPRESSION, {
        expressionNodeId: expression.id,
        message: "A reachable identifier or call has no resolved reference.",
      });
    }
    if (expression.exprKind.case === "constExpr") {
      const size = constantSize(expression.exprKind.value);
      if (size > limits.maxConstantBytes) {
        throwLimitError("max_constant_bytes", limits.maxConstantBytes, size);
      }
      totalConstantBytes += size;
      if (totalConstantBytes > limits.maxTotalConstantBytes) {
        throwLimitError(
          "max_total_constant_bytes",
          limits.maxTotalConstantBytes,
          totalConstantBytes,
        );
      }
    }
    const children = childExpressions(expression);
    if (!children.ok) {
      throw new CelqlError(TranslationErrorCode.INVALID_CHECKED_EXPRESSION, {
        expressionNodeId: expression.id,
        message: children.message,
      });
    }
    const comprehensionDepth =
      expression.exprKind.case === "comprehensionExpr"
        ? current.comprehensionDepth + 1
        : current.comprehensionDepth;
    if (comprehensionDepth > limits.maxComprehensionNesting) {
      throwLimitError(
        "max_comprehension_nesting",
        BigInt(limits.maxComprehensionNesting),
        BigInt(comprehensionDepth),
      );
    }
    for (const child of children.values) {
      stack.push({
        expression: child,
        depth: current.depth + 1,
        comprehensionDepth,
      });
    }
  }
  const rootType = checkedExpression.typeMap[root.id.toString()];
  if (
    rootType?.typeKind.case !== "primitive" ||
    rootType.typeKind.value !== Type_PrimitiveType.BOOL
  ) {
    throw new CelqlError(TranslationErrorCode.NON_BOOLEAN_ROOT, {
      expressionNodeId: root.id,
      message: "The root expression type is not bool.",
    });
  }
}

function childExpressions(
  expression: Expr,
): { ok: true; values: Expr[] } | { ok: false; message: string } {
  switch (expression.exprKind.case) {
    case "constExpr":
    case "identExpr":
      return { ok: true, values: [] };
    case "selectExpr":
      return expression.exprKind.value.operand === undefined
        ? { ok: false, message: "A selection has no operand." }
        : { ok: true, values: [expression.exprKind.value.operand] };
    case "callExpr":
      return {
        ok: true,
        values:
          expression.exprKind.value.target === undefined
            ? expression.exprKind.value.args
            : [expression.exprKind.value.target, ...expression.exprKind.value.args],
      };
    case "listExpr":
      return { ok: true, values: expression.exprKind.value.elements };
    case "structExpr": {
      const values: Expr[] = [];
      for (const entry of expression.exprKind.value.entries) {
        if (entry.value === undefined || entry.keyKind.case === undefined) {
          return { ok: false, message: "A structure entry is incomplete." };
        }
        if (entry.keyKind.case === "mapKey") {
          values.push(entry.keyKind.value);
        }
        values.push(entry.value);
      }
      return { ok: true, values };
    }
    case "comprehensionExpr": {
      const value = expression.exprKind.value;
      if (
        value.iterRange === undefined ||
        value.accuInit === undefined ||
        value.loopCondition === undefined ||
        value.loopStep === undefined ||
        value.result === undefined
      ) {
        return { ok: false, message: "A comprehension omits a required subexpression." };
      }
      return {
        ok: true,
        values: [
          value.iterRange,
          value.accuInit,
          value.loopCondition,
          value.loopStep,
          value.result,
        ],
      };
    }
    default:
      return { ok: false, message: "A reachable expression has no supported kind." };
  }
}

function constantSize(constant: Extract<Expr["exprKind"], { case: "constExpr" }>["value"]): bigint {
  switch (constant.constantKind.case) {
    case "nullValue":
    case undefined:
      return 0n;
    case "boolValue":
      return 1n;
    case "int64Value":
    case "uint64Value":
    case "doubleValue":
    case "durationValue":
    case "timestampValue":
      return 8n;
    case "stringValue":
      return BigInt(new TextEncoder().encode(constant.constantKind.value).byteLength);
    case "bytesValue":
      return BigInt(constant.constantKind.value.byteLength);
  }
}

function throwLimitError(name: string, limit: bigint, observed: bigint): never {
  throw new CelqlError(TranslationErrorCode.RESOURCE_LIMIT_EXCEEDED, {
    message: "A translation resource limit was exceeded.",
    details: { limit: name, configured: limit.toString(), observed: observed.toString() },
  });
}

function booleanConstant(root: Expr | undefined): boolean | undefined {
  if (
    root?.exprKind.case === "constExpr" &&
    root.exprKind.value.constantKind.case === "boolValue"
  ) {
    return root.exprKind.value.constantKind.value;
  }
  return undefined;
}
