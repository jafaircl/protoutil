import { create, type MessageShape } from "@bufbuild/protobuf";
import { anyUnpack } from "@bufbuild/protobuf/wkt";
import { AnsiSqlDialect } from "./ansisql.js";
import type { Expr } from "./gen/cel/expr/syntax_pb.js";
import { ConstantSchema } from "./gen/cel/expr/syntax_pb.js";
import {
  PostgreSqlConfigurationSchema,
  PostgreSqlParameterSchema,
  PostgreSqlPredicateSchema,
} from "./gen/protoutil/celql/postgresql/v1/postgresql_pb.js";
import {
  DialectCapabilityProfileSchema,
  OperandShape,
  OperationCapabilitySchema,
  ParameterStyle,
  RegexSupport,
  TranslationErrorCode,
  TranslationLimitsSchema,
} from "./gen/protoutil/celql/v1/celql_pb.js";
import { SqlDialect } from "./sql-dialect.js";
import { CelqlError } from "./translator.js";
import type { DialectContext } from "./types.js";

const profileName = "protoutil.celql.postgresql";
const outputTypeName = "protoutil.celql.postgresql.v1.PostgreSqlPredicate";
const baseCapability = AnsiSqlDialect.capability;
const baseLimits = baseCapability.defaultLimits!;

const operations = baseCapability.operations.map((operation) => {
  if (operation.overloadId !== "in_list") return operation;
  return create(OperationCapabilitySchema, {
    overloadId: operation.overloadId,
    operands: [
      {
        celType: "dyn",
        allowedShapes: [OperandShape.QUERY_FIELD_PATH, OperandShape.CONSTANT_VALUE],
      },
      {
        celType: "list(dyn)",
        allowedShapes: [OperandShape.CONSTANT_VALUE, OperandShape.QUERY_FIELD_PATH],
      },
    ],
    resultType: "bool",
    additionalRestrictions: [
      "Accepted pairs are a query field path with a list literal, or a constant with a list query field path.",
    ],
  });
});
operations.push(
  create(OperationCapabilitySchema, {
    overloadId: "matches_string",
    operands: [
      { celType: "string", allowedShapes: [OperandShape.QUERY_FIELD_PATH] },
      { celType: "string", allowedShapes: [OperandShape.CONSTANT_VALUE] },
    ],
    resultType: "bool",
  }),
);

const capability = create(DialectCapabilityProfileSchema, {
  profile: { name: profileName, majorVersion: 1 },
  outputTypeName,
  supportedCelTypes: [
    ...baseCapability.supportedCelTypes,
    "list(bool)",
    "list(int)",
    "list(uint)",
    "list(double)",
    "list(string)",
    "list(bytes)",
    "list(google.protobuf.Timestamp)",
    "list(google.protobuf.Duration)",
  ],
  operations,
  supportedComprehensionForms: baseCapability.supportedComprehensionForms,
  nullSemantics: baseCapability.nullSemantics,
  absenceSemantics: baseCapability.absenceSemantics,
  regexSupport: RegexSupport.RE2_SUBSET,
  parameterStyle: ParameterStyle.NUMBERED,
  parameterComposition: {
    supportsStartPosition: true,
    supportsNamePrefix: false,
    documentation:
      "PostgreSqlConfiguration.start_position selects the first generated $n placeholder.",
  },
  outputGrowthUnit: baseCapability.outputGrowthUnit,
  defaultMaxOutputGrowth: baseCapability.defaultMaxOutputGrowth,
  defaultLimits: create(TranslationLimitsSchema, {
    maxDepth: baseLimits.maxDepth,
    maxNodes: baseLimits.maxNodes,
    maxParameters: baseLimits.maxParameters,
    maxConstantBytes: baseLimits.maxConstantBytes,
    maxTotalConstantBytes: baseLimits.maxTotalConstantBytes,
    maxComprehensionNesting: baseLimits.maxComprehensionNesting,
    maxRegexPatternBytes: 1024n,
    maxOutputGrowth: baseLimits.maxOutputGrowth,
  }),
  nullAndAbsenceDocumentation: baseCapability.nullAndAbsenceDocumentation,
  regexDocumentation:
    'Accepts the shared ASCII Boolean-language subset of RE2 and PostgreSQL ARE syntax, using pg_catalog."C" collation and the (?p) option.',
  patternLanguageDocumentation: baseCapability.patternLanguageDocumentation,
  outputGrowthDocumentation:
    "Output growth counts Unicode code points after numbered placeholders are emitted.",
  costAndRejectionDocumentation:
    "Array membership uses array_position. Regular expressions require a database statement timeout in addition to translation limits.",
  baseProfile: baseCapability.profile,
});

/**
 * PostgreSQL major version 1.
 *
 * PostgreSQL inherits the shared ANSI-compatible SQL visitor and replaces only
 * numbered parameters, output construction, array forms, and regular expressions.
 */
export class PostgreSqlDialect extends SqlDialect<typeof PostgreSqlPredicateSchema> {
  /** Machine-readable PostgreSQL version 1 capability declaration. */
  public static readonly capability = capability;

  /** Protobuf schema emitted by the PostgreSQL dialect. */
  public static readonly outputSchema = PostgreSqlPredicateSchema;

  private firstPosition = 1n;

  /** Reads and validates PostgreSQL-specific trusted configuration. */
  protected override validateConfiguration(): void {
    this.firstPosition = startPosition(this.context);
  }

  /** Uses PostgreSQL's numbered parameter markers. */
  protected override parameterMarker(position: bigint): string {
    return `$${this.firstPosition + position - 1n}`;
  }

  /** Creates a PostgreSQL predicate from the state accumulated by the shared visitor. */
  protected override createPredicate(sql: string): MessageShape<typeof PostgreSqlPredicateSchema> {
    return create(PostgreSqlPredicateSchema, {
      sql,
      parameters: this.parameters.map((parameter) => create(PostgreSqlParameterSchema, parameter)),
    });
  }

  /** Visits PostgreSQL calls before delegating unchanged calls to ANSI SQL. */
  protected override visitCall(expression: Expr, overloadId: string): string {
    if (overloadId === "matches_string") {
      return this.visitRegex(expression, this.operands(expression));
    }
    if (overloadId === "in_list") {
      const arrayMembership = this.visitArrayMembership(expression, this.operands(expression));
      if (arrayMembership !== undefined) return arrayMembership;
    }
    return super.visitCall(expression, overloadId);
  }

  /** Visits PostgreSQL array comprehensions before delegating literal-list forms. */
  protected override visitComprehension(expression: Expr): string {
    const arrayExists = this.visitArrayExists(expression);
    return arrayExists ?? super.visitComprehension(expression);
  }

  /** Emits only the regular-expression syntax shared by CEL RE2 and PostgreSQL ARE. */
  private visitRegex(expression: Expr, operands: readonly Expr[]): string {
    if (operands.length !== 2) throw unsupportedOverload(expression, "matches_string");
    const pathExpression = operands[0]!;
    const pattern = operands[1]!;
    if (
      (pathExpression.exprKind.case !== "identExpr" &&
        pathExpression.exprKind.case !== "selectExpr") ||
      pattern.exprKind.case !== "constExpr" ||
      pattern.exprKind.value.constantKind.case !== "stringValue"
    ) {
      throw unsupportedOverload(expression, "matches_string");
    }
    const value = pattern.exprKind.value.constantKind.value;
    const bytes = BigInt(new TextEncoder().encode(value).byteLength);
    if (bytes > this.context.limits.maxRegexPatternBytes) {
      throw new CelqlError(TranslationErrorCode.RESOURCE_LIMIT_EXCEEDED, {
        expressionNodeId: pattern.id,
        message: "The regular-expression pattern limit was exceeded.",
        details: {
          limit: "max_regex_pattern_bytes",
          configured: this.context.limits.maxRegexPatternBytes.toString(),
          observed: bytes.toString(),
        },
      });
    }
    if (!isCompatibleRegex(value)) throw unsupportedExpression(pattern);
    const marker = this.bindConstant(
      pattern,
      create(ConstantSchema, {
        constantKind: { case: "stringValue", value: `(?p)${value}` },
      }),
    );
    const path = this.visitFieldPath(pathExpression);
    return `(${path} COLLATE pg_catalog."C") ~ ${marker}`;
  }

  /** Preserves CEL's null-list result while searching a PostgreSQL array column. */
  private visitArrayMembership(expression: Expr, operands: readonly Expr[]): string | undefined {
    if (operands.length !== 2 || operands[0] === undefined || operands[1] === undefined) {
      throw unsupportedOverload(expression, "in_list");
    }
    const constant = operands[0];
    const array = operands[1];
    const isPath = array.exprKind.case === "identExpr" || array.exprKind.case === "selectExpr";
    const arrayType = this.typeOf(array);
    if (
      constant.exprKind.case !== "constExpr" ||
      !isPath ||
      arrayType.typeKind.case !== "listType"
    ) {
      return undefined;
    }
    const elementType = arrayType.typeKind.value.elemType;
    const constantType = this.typeName(this.typeOf(constant));
    if (
      elementType === undefined ||
      constantType === "unsupported" ||
      constantType !== this.typeName(elementType)
    ) {
      throw unsupportedOverload(expression, "in_list");
    }
    const marker = this.bindConstant(constant);
    const path = this.visitFieldPath(array);
    return `CASE WHEN ${path} IS NULL THEN NULL ELSE array_position(${path}, ${marker}) IS NOT NULL END`;
  }

  /** Recognizes equality `exists` over an array field and emits one array search. */
  private visitArrayExists(expression: Expr): string | undefined {
    if (expression.exprKind.case !== "comprehensionExpr") return undefined;
    const comprehension = expression.exprKind.value;
    const array = comprehension.iterRange;
    const isPath = array?.exprKind.case === "identExpr" || array?.exprKind.case === "selectExpr";
    if (array === undefined || !isPath || this.typeOf(array).typeKind.case !== "listType") {
      return undefined;
    }
    if (
      comprehension.iterVar2.length > 0 ||
      comprehension.iterVar === comprehension.accuVar ||
      !isBooleanConstant(comprehension.accuInit, false) ||
      !this.isExistsCondition(comprehension.loopCondition, comprehension.accuVar) ||
      !isIdent(comprehension.result, comprehension.accuVar) ||
      comprehension.loopStep?.exprKind.case !== "callExpr" ||
      this.overloadId(comprehension.loopStep) !== "logical_or"
    ) {
      throw unsupportedExpression(expression);
    }
    const step = comprehension.loopStep.exprKind.value.args;
    const predicate = step[1];
    if (
      step.length !== 2 ||
      !isIdent(step[0], comprehension.accuVar) ||
      predicate?.exprKind.case !== "callExpr" ||
      this.overloadId(predicate) !== "equals"
    ) {
      throw unsupportedExpression(expression);
    }
    const equality = predicate.exprKind.value.args;
    const constant = isIdent(equality[0], comprehension.iterVar)
      ? equality[1]
      : isIdent(equality[1], comprehension.iterVar)
        ? equality[0]
        : undefined;
    if (equality.length !== 2 || constant?.exprKind.case !== "constExpr") {
      throw unsupportedExpression(expression);
    }
    const arrayType = this.typeOf(array);
    const elementType =
      arrayType.typeKind.case === "listType" ? arrayType.typeKind.value.elemType : undefined;
    const constantType = this.typeName(this.typeOf(constant));
    if (
      elementType === undefined ||
      constantType === "unsupported" ||
      this.typeName(elementType) !== constantType
    ) {
      throw unsupportedExpression(expression);
    }
    const marker = this.bindConstant(constant);
    const path = this.visitFieldPath(array);
    return `CASE WHEN ${path} IS NULL THEN NULL ELSE array_position(${path}, ${marker}) IS NOT NULL END`;
  }
}

/** Returns the first parameter number after validating the trusted configuration type. */
function startPosition(context: DialectContext): bigint {
  if (context.profileConfiguration === undefined) return 1n;
  const configuration = anyUnpack(context.profileConfiguration, PostgreSqlConfigurationSchema);
  if (configuration === undefined || configuration.startPosition === 0n) {
    throw new CelqlError(TranslationErrorCode.INVALID_PROFILE_CONFIGURATION, {
      message: "PostgreSQL configuration requires a positive start position.",
    });
  }
  return configuration.startPosition;
}

/** Accepts the deliberately small ASCII syntax intersection promised by the profile. */
function isCompatibleRegex(pattern: string): boolean {
  if (
    [...pattern].some((character) => character === "\0" || character.codePointAt(0)! > 0x7f) ||
    pattern.includes("[[:") ||
    pattern.includes("[[.") ||
    pattern.includes("[[=") ||
    hasOversizedQuantifier(pattern)
  ) {
    return false;
  }
  if (/\(\?/.test(pattern) || /\\[A-Za-z0-9]/.test(pattern)) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/** Detects numeric bounds above PostgreSQL's supported repetition limit. */
function hasOversizedQuantifier(pattern: string): boolean {
  let isCharacterClass = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "\\") {
      index += 1;
    } else if (character === "[") {
      isCharacterClass = true;
    } else if (character === "]") {
      isCharacterClass = false;
    } else if (!isCharacterClass && character === "{" && /\d/.test(pattern[index + 1] ?? "")) {
      const end = pattern.indexOf("}", index + 1);
      if (end < 0) return false;
      const bounds = pattern.slice(index + 1, end).split(",");
      if (bounds.some((bound) => bound.length > 0 && Number(bound) > 255)) return true;
      index = end;
    }
  }
  return false;
}

function isBooleanConstant(expression: Expr | undefined, value: boolean): boolean {
  return (
    expression?.exprKind.case === "constExpr" &&
    expression.exprKind.value.constantKind.case === "boolValue" &&
    expression.exprKind.value.constantKind.value === value
  );
}

function isIdent(expression: Expr | undefined, name: string): boolean {
  return expression?.exprKind.case === "identExpr" && expression.exprKind.value.name === name;
}

function unsupportedExpression(expression: Expr): CelqlError {
  return new CelqlError(TranslationErrorCode.UNSUPPORTED_EXPRESSION, {
    expressionNodeId: expression.id,
    message: "The expression form is not supported by the PostgreSQL profile.",
  });
}

function unsupportedOverload(expression: Expr, overloadId: string): CelqlError {
  return new CelqlError(TranslationErrorCode.UNSUPPORTED_OVERLOAD, {
    expressionNodeId: expression.id,
    message: "The resolved overload is not supported by the PostgreSQL profile.",
    details: overloadId.length === 0 ? {} : { overload_id: overloadId },
  });
}
