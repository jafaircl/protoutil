import { create, type MessageShape } from "@bufbuild/protobuf";
import {
  AnsiSqlParameterSchema,
  AnsiSqlPredicateSchema,
} from "./gen/protoutil/celql/ansisql/v1/ansisql_pb.js";
import {
  AbsenceSemantics,
  ComprehensionForm,
  DialectCapabilityProfileSchema,
  NullSemantics,
  OperandShape,
  OperationCapabilitySchema,
  OutputGrowthUnit,
  ParameterStyle,
  RegexSupport,
  TranslationLimitsSchema,
} from "./gen/protoutil/celql/v1/celql_pb.js";
import { SqlDialect } from "./sql-dialect.js";

const ansiSqlName = "protoutil.celql.ansisql";
const ansiSqlVersion = 1;
const ansiSqlOutputType = "protoutil.celql.ansisql.v1.AnsiSqlPredicate";

const comparisonOverloads = [
  "equals",
  "not_equals",
  "less_int64",
  "less_uint64",
  "less_double",
  "less_string",
  "less_equals_int64",
  "less_equals_uint64",
  "less_equals_double",
  "less_equals_string",
  "greater_int64",
  "greater_uint64",
  "greater_double",
  "greater_string",
  "greater_equals_int64",
  "greater_equals_uint64",
  "greater_equals_double",
  "greater_equals_string",
  "less_timestamp",
  "less_duration",
  "less_equals_timestamp",
  "less_equals_duration",
  "greater_timestamp",
  "greater_duration",
  "greater_equals_timestamp",
  "greater_equals_duration",
] as const;

const ansiSqlCapability = create(DialectCapabilityProfileSchema, {
  profile: { name: ansiSqlName, majorVersion: ansiSqlVersion },
  outputTypeName: ansiSqlOutputType,
  supportedCelTypes: [
    "bool",
    "int",
    "uint",
    "double",
    "string",
    "bytes",
    "null_type",
    "google.protobuf.Timestamp",
    "google.protobuf.Duration",
  ],
  operations: [
    operation(
      "logical_and",
      ["bool", "bool"],
      [
        [OperandShape.QUERY_FIELD_PATH, OperandShape.TRANSLATED_EXPRESSION],
        [OperandShape.QUERY_FIELD_PATH, OperandShape.TRANSLATED_EXPRESSION],
      ],
    ),
    operation(
      "logical_or",
      ["bool", "bool"],
      [
        [OperandShape.QUERY_FIELD_PATH, OperandShape.TRANSLATED_EXPRESSION],
        [OperandShape.QUERY_FIELD_PATH, OperandShape.TRANSLATED_EXPRESSION],
      ],
    ),
    operation(
      "logical_not",
      ["bool"],
      [[OperandShape.QUERY_FIELD_PATH, OperandShape.TRANSLATED_EXPRESSION]],
    ),
    ...comparisonOverloads.map((overloadId) =>
      operation(overloadId, comparisonTypes(overloadId), [
        [OperandShape.QUERY_FIELD_PATH, OperandShape.CONSTANT_VALUE],
        [OperandShape.QUERY_FIELD_PATH, OperandShape.CONSTANT_VALUE],
      ]),
    ),
    ...["starts_with_string", "ends_with_string", "contains_string"].map((overloadId) =>
      operation(
        overloadId,
        ["string", "string"],
        [[OperandShape.QUERY_FIELD_PATH], [OperandShape.CONSTANT_VALUE]],
      ),
    ),
    operation(
      "in_list",
      ["dyn", "list(dyn)"],
      [[OperandShape.QUERY_FIELD_PATH], [OperandShape.CONSTANT_VALUE]],
    ),
    operation(
      "string_to_timestamp",
      ["string"],
      [[OperandShape.CONSTANT_VALUE]],
      "google.protobuf.Timestamp",
    ),
    operation(
      "string_to_duration",
      ["string"],
      [[OperandShape.CONSTANT_VALUE]],
      "google.protobuf.Duration",
    ),
  ],
  supportedComprehensionForms: [{ form: ComprehensionForm.EXISTS }],
  nullSemantics: NullSemantics.DISTINCT_NULL,
  absenceSemantics: AbsenceSemantics.REJECTED,
  regexSupport: RegexSupport.NONE,
  parameterStyle: ParameterStyle.POSITIONAL,
  parameterComposition: {
    supportsStartPosition: false,
    supportsNamePrefix: false,
    documentation: "Unnumbered markers compose by binding order.",
  },
  outputGrowthUnit: OutputGrowthUnit.CHARACTERS,
  defaultMaxOutputGrowth: 4096n,
  defaultLimits: create(TranslationLimitsSchema, {
    maxDepth: 32,
    maxNodes: 1000n,
    maxParameters: 100n,
    maxConstantBytes: 8192n,
    maxTotalConstantBytes: 65_536n,
    maxComprehensionNesting: 1,
    maxRegexPatternBytes: 0n,
    maxOutputGrowth: 4096n,
  }),
  nullAndAbsenceDocumentation:
    "SQL NULL carries CEL null. Expressions that observe field absence are rejected.",
  regexDocumentation: "The profile translates no regular-expression operation.",
  patternLanguageDocumentation:
    "LIKE patterns escape backslash, percent, and underscore with backslash.",
  outputGrowthDocumentation: "Output growth counts Unicode code points in the SQL text.",
  costAndRejectionDocumentation:
    "Unsigned constants above the signed 64-bit maximum and constant-to-constant comparisons are rejected.",
});

/** ANSI SQL major version 1. */
export class AnsiSqlDialect extends SqlDialect<typeof AnsiSqlPredicateSchema> {
  /** Machine-readable ANSI SQL version 1 capability declaration. */
  public static readonly capability = ansiSqlCapability;

  /** Protobuf schema emitted by the ANSI SQL dialect. */
  public static readonly outputSchema = AnsiSqlPredicateSchema;

  /** Creates an ANSI SQL predicate from the completed shared SQL visit. */
  protected createPredicate(sql: string): MessageShape<typeof AnsiSqlPredicateSchema> {
    return create(AnsiSqlPredicateSchema, {
      sql,
      parameters: this.parameters.map((parameter) => create(AnsiSqlParameterSchema, parameter)),
    });
  }
}

function operation(
  overloadId: string,
  types: string[],
  shapes: OperandShape[][],
  resultType = "bool",
) {
  return create(OperationCapabilitySchema, {
    overloadId,
    operands: types.map((celType, index) => ({
      celType,
      allowedShapes: shapes[index] ?? [],
    })),
    resultType,
  });
}

function comparisonTypes(overloadId: string): string[] {
  if (overloadId === "equals" || overloadId === "not_equals") return ["dyn", "dyn"];
  if (overloadId.endsWith("_int64")) return ["int", "int"];
  if (overloadId.endsWith("_uint64")) return ["uint", "uint"];
  if (overloadId.endsWith("_double")) return ["double", "double"];
  if (overloadId.endsWith("_string")) return ["string", "string"];
  if (overloadId.endsWith("_timestamp")) {
    return ["google.protobuf.Timestamp", "google.protobuf.Timestamp"];
  }
  return ["google.protobuf.Duration", "google.protobuf.Duration"];
}
