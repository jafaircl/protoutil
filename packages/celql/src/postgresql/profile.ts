import { create, type MessageShape } from "@bufbuild/protobuf";
import { type Any, anyUnpack, TimestampSchema } from "@bufbuild/protobuf/wkt";
import { AnsiSqlProfile } from "../ansisql/profile.js";
import { isFullTextQuery } from "../full-text-search.js";
import type { Expr } from "../gen/cel/expr/syntax_pb.js";
import { ConstantSchema } from "../gen/cel/expr/syntax_pb.js";
import {
  PostgreSqlConfigurationSchema,
  PostgreSqlParameterSchema,
  PostgreSqlPredicateSchema,
} from "../gen/protoutil/celql/postgresql/v1/postgresql_pb.js";
import {
  DialectCapabilityProfileSchema,
  OperandShape,
  OperationCapabilitySchema,
  ParameterStyle,
  RegexSupport,
  TranslationErrorCode,
  TranslationLimitsSchema,
} from "../gen/protoutil/celql/v1/celql_pb.js";
import { isPortableRegex } from "../regex.js";
import {
  type SqlLibraryContext,
  type SqlTranslation,
  SqlTranslationContext,
} from "../sql-dialect.js";
import { CelqlError } from "../translator.js";
import type { Profile } from "../types.js";

const profileName = "protoutil.celql.postgresql";
const outputTypeName = "protoutil.celql.postgresql.v1.PostgreSqlPredicate";
const baseCapability = AnsiSqlProfile.capability;
const baseLimits = baseCapability.defaultLimits!;
const timestampRangeTypeName = "protoutil.celql.TimestampRange";
const fullTextIndexTypeName = "protoutil.celql.FullTextIndex";

/** PostgreSQL-only SQL operations exposed to PostgreSQL translation libraries. */
export interface PostgreSqlLibraryContext extends SqlLibraryContext {
  /** Emits a PostgreSQL `tstzrange` constructor from constant timestamp bounds. */
  timestampRange(expression: Expr): string;
  /** Emits containment of a constant timestamp by a range query field. */
  timestampRangeContains(expression: Expr): string;
  /** Emits overlap between a range query field and a translated range value. */
  timestampRangeOverlaps(expression: Expr): string;
  /** Emits simple-configuration full-text matching for a tsvector query field. */
  fullTextSearch(expression: Expr): string;
}

/** A translation function that can use the PostgreSQL-only library context. */
export type PostgreSqlTranslation = SqlTranslation<PostgreSqlLibraryContext>;

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

/** Per-request PostgreSQL SQL generator that subclasses can customize for local syntax. */
class PostgreSqlTranslationContext
  extends SqlTranslationContext<typeof PostgreSqlPredicateSchema, PostgreSqlLibraryContext>
  implements PostgreSqlLibraryContext
{
  private firstPosition = 1n;

  /** Exposes PostgreSQL-only operations solely to PostgreSQL translation libraries. */
  protected libraryContext(): PostgreSqlLibraryContext {
    return this;
  }

  /** Reads and validates PostgreSQL-specific trusted configuration. */
  protected override validateConfiguration(): void {
    this.firstPosition = startPosition(this.context.profileConfiguration);
  }

  /** Uses PostgreSQL's numbered parameter markers. */
  protected override parameterMarker(position: bigint): string {
    return `$${this.firstPosition + position - 1n}`;
  }

  /** Creates a PostgreSQL predicate from the accumulated per-call state. */
  protected override createPredicate(sql: string): MessageShape<typeof PostgreSqlPredicateSchema> {
    return create(PostgreSqlPredicateSchema, {
      sql,
      parameters: this.parameters.map((parameter) => create(PostgreSqlParameterSchema, parameter)),
    });
  }

  /** Translates the PostgreSQL library's trusted half-open timestamp-range constructor. */
  public timestampRange(expression: Expr): string {
    const operands = this.operands(expression);
    if (operands.length !== 2)
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    const start = this.timestampRangeBound(operands[0]!);
    const end = this.timestampRangeBound(operands[1]!);
    if (compareTimestamp(start.value, end.value) > 0) {
      throw this.unsupportedExpression(expression);
    }
    return this.checkedSql(`tstzrange(${start.marker}, ${end.marker}, '[)')`);
  }

  /** Translates containment of a timestamp in a PostgreSQL timestamp-range field. */
  public timestampRangeContains(expression: Expr): string {
    const operands = this.operands(expression);
    if (operands.length !== 2)
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    const range = this.visitOperand(operands[0]!);
    if (range.kind !== "path" || this.typeName(range.type) !== timestampRangeTypeName) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    const value = this.timestampRangeBound(operands[1]!);
    return this.checkedSql(`${range.sql} @> ${value.marker}::timestamptz`);
  }

  /** Translates overlap between a PostgreSQL timestamp-range field and a constructed range. */
  public timestampRangeOverlaps(expression: Expr): string {
    const operands = this.operands(expression);
    if (operands.length !== 2)
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    const range = this.visitOperand(operands[0]!);
    const other = operands[1]!;
    if (
      range.kind !== "path" ||
      this.typeName(range.type) !== timestampRangeTypeName ||
      other.exprKind.case !== "callExpr" ||
      this.overloadId(other) !== "timestamp_range"
    ) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    return this.checkedSql(`${range.sql} && ${this.timestampRange(other)}`);
  }

  /** Translates bounded simple-configuration PostgreSQL full-text search. */
  public fullTextSearch(expression: Expr): string {
    const operands = this.operands(expression);
    if (operands.length !== 2)
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    const vector = this.visitOperand(operands[0]!);
    const query = this.visitOperand(operands[1]!);
    if (
      vector.kind !== "path" ||
      this.typeName(vector.type) !== fullTextIndexTypeName ||
      query.kind !== "constant" ||
      query.constant.constantKind.case !== "stringValue"
    ) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    if (!isFullTextQuery(query.constant.constantKind.value)) {
      throw this.unsupportedExpression(query.expression);
    }
    const marker = this.bindConstant(query.expression, query.constant);
    return this.checkedSql(`${vector.sql} @@ plainto_tsquery('simple', ${marker})`);
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
    if (!isPortableRegex(value)) throw unsupportedExpression(pattern);
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
      predicate?.exprKind.case !== "callExpr"
    ) {
      throw unsupportedExpression(expression);
    }
    const arrayType = this.typeOf(array);
    const elementType =
      arrayType.typeKind.case === "listType" ? arrayType.typeKind.value.elemType : undefined;
    if (elementType === undefined) throw unsupportedExpression(expression);
    const overloadId = this.overloadId(predicate);
    const operands = this.operands(predicate);
    const path = this.visitFieldPath(array);
    if (overloadId === "equals") {
      const constant = isIdent(operands[0], comprehension.iterVar)
        ? operands[1]
        : isIdent(operands[1], comprehension.iterVar)
          ? operands[0]
          : undefined;
      if (operands.length !== 2 || constant?.exprKind.case !== "constExpr") {
        throw unsupportedExpression(expression);
      }
      const constantType = this.typeName(this.typeOf(constant));
      if (constantType === "unsupported" || this.typeName(elementType) !== constantType) {
        throw unsupportedExpression(expression);
      }
      const marker = this.bindConstant(constant);
      return `CASE WHEN ${path} IS NULL THEN NULL ELSE array_position(${path}, ${marker}) IS NOT NULL END`;
    }
    const pattern = isIdent(operands[0], comprehension.iterVar) ? operands[1] : undefined;
    if (
      !["starts_with_string", "ends_with_string", "contains_string"].includes(overloadId) ||
      operands.length !== 2 ||
      this.typeName(elementType) !== "string" ||
      pattern?.exprKind.case !== "constExpr" ||
      pattern.exprKind.value.constantKind.case !== "stringValue"
    ) {
      throw unsupportedExpression(expression);
    }
    const escaped = escapeLike(pattern.exprKind.value.constantKind.value);
    const value =
      overloadId === "starts_with_string"
        ? `${escaped}%`
        : overloadId === "ends_with_string"
          ? `%${escaped}`
          : `%${escaped}%`;
    const marker = this.bindConstant(
      pattern,
      create(ConstantSchema, { constantKind: { case: "stringValue", value } }),
    );
    return `CASE WHEN ${path} IS NULL THEN NULL ELSE EXISTS (SELECT 1 FROM unnest(${path}) AS "__celql_element" WHERE "__celql_element" LIKE ${marker} ESCAPE '\\') END`;
  }

  /** Binds a constant timestamp range bound and returns its value for ordering checks. */
  private timestampRangeBound(expression: Expr): {
    marker: string;
    value: MessageShape<typeof TimestampSchema>;
  } {
    const operand = this.visitOperand(expression);
    if (
      (operand.kind !== "constant" && operand.kind !== "folded") ||
      this.typeName(operand.type) !== "google.protobuf.Timestamp"
    ) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    if (operand.kind === "constant" && operand.constant.constantKind.case === "timestampValue") {
      return {
        marker: this.bindConstant(expression, operand.constant),
        value: operand.constant.constantKind.value,
      };
    }
    if (operand.kind === "folded" && operand.value.kind.case === "objectValue") {
      const value = anyUnpack(operand.value.kind.value, TimestampSchema);
      if (value !== undefined) {
        return { marker: this.bindValue(expression, operand.type, operand.value), value };
      }
    }
    throw this.unsupportedOverload(expression, this.overloadId(expression));
  }
}

/**
 * Translates the ANSI SQL version 1 fragment and PostgreSQL version 1 extensions.
 *
 * The profile emits `PostgreSqlPredicate` with `$n` parameter markers. Its
 * optional libraries add PostgreSQL arrays, a checked RE2-compatible pattern
 * subset, timestamp ranges, and simple full-text search.
 */
export class PostgreSqlProfile
  implements Profile<typeof PostgreSqlPredicateSchema, PostgreSqlTranslation>
{
  /** Capability declaration for PostgreSQL version 1 and its optional libraries. */
  public static readonly capability = capability;

  /** Machine-readable declaration for this profile instance. */
  public readonly capability = PostgreSqlProfile.capability;

  /** Protobuf schema produced by this profile. */
  public readonly outputSchema = PostgreSqlPredicateSchema;

  /** Validates PostgreSQL's optional parameter-start configuration. */
  public readonly validateConfiguration = validatePostgreSqlConfiguration;

  /** Validates one expression through the constructed profile. */
  public validate(
    context: Parameters<Profile["validate"]>[0],
    functions: ReadonlyMap<string, PostgreSqlTranslation>,
  ): void {
    new PostgreSqlTranslationContext(context, functions).validate();
  }

  /** Translates one expression through the constructed profile. */
  public translate(
    context: Parameters<Profile["translate"]>[0],
    functions: ReadonlyMap<string, PostgreSqlTranslation>,
  ): MessageShape<typeof PostgreSqlPredicateSchema> {
    return new PostgreSqlTranslationContext(context, functions).translate();
  }
}

/** Returns the first parameter number after validating the trusted configuration type. */
function startPosition(profileConfiguration?: Any): bigint {
  if (profileConfiguration === undefined) return 1n;
  const configuration = anyUnpack(profileConfiguration, PostgreSqlConfigurationSchema);
  if (configuration === undefined || configuration.startPosition === 0n) {
    throw new CelqlError(TranslationErrorCode.INVALID_PROFILE_CONFIGURATION, {
      message: "PostgreSQL configuration requires a positive start position.",
    });
  }
  return configuration.startPosition;
}

/** Validates PostgreSQL configuration before a translator chooses its outcome. */
function validatePostgreSqlConfiguration(profileConfiguration?: Any): void {
  startPosition(profileConfiguration);
}

function compareTimestamp(
  left: MessageShape<typeof TimestampSchema>,
  right: MessageShape<typeof TimestampSchema>,
): number {
  if (left.seconds !== right.seconds) return left.seconds < right.seconds ? -1 : 1;
  if (left.nanos !== right.nanos) return left.nanos < right.nanos ? -1 : 1;
  return 0;
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

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
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
