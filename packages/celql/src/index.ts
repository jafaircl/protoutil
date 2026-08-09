import { AnsiSqlDialect } from "./ansisql.js";
import { AnsiSqlPredicateSchema } from "./gen/protoutil/celql/ansisql/v1/ansisql_pb.js";
import { PostgreSqlPredicateSchema } from "./gen/protoutil/celql/postgresql/v1/postgresql_pb.js";
import { PostgreSqlDialect } from "./postgresql.js";
import { SqlDialect } from "./sql-dialect.js";
import { CelqlTranslator, createTranslator as createDialectTranslator } from "./translator.js";
import type { DialectConstructor, DialectOutput } from "./types.js";

export { AnsiSqlDialect, AnsiSqlPredicateSchema, SqlDialect };
export type { Expr } from "./gen/cel/expr/syntax_pb.js";
export {
  type AnsiSqlParameter,
  AnsiSqlParameterSchema,
  type AnsiSqlPredicate,
} from "./gen/protoutil/celql/ansisql/v1/ansisql_pb.js";
export {
  type PostgreSqlConfiguration,
  PostgreSqlConfigurationSchema,
  type PostgreSqlParameter,
  PostgreSqlParameterSchema,
  type PostgreSqlPredicate,
} from "./gen/protoutil/celql/postgresql/v1/postgresql_pb.js";
export {
  AbsenceSemantics,
  AbsenceSemanticsSchema,
  ComprehensionForm,
  ComprehensionFormSchema,
  type ComprehensionSupport,
  ComprehensionSupportSchema,
  type DialectCapabilityProfile,
  DialectCapabilityProfileSchema,
  NullSemantics,
  NullSemanticsSchema,
  type OperandConstraint,
  OperandConstraintSchema,
  OperandShape,
  OperandShapeSchema,
  type OperationCapability,
  OperationCapabilitySchema,
  OutputGrowthUnit,
  OutputGrowthUnitSchema,
  type ParameterComposition,
  ParameterCompositionSchema,
  ParameterStyle,
  ParameterStyleSchema,
  type PortableTranslationOutcome,
  PortableTranslationOutcomeSchema,
  type ProfileReference,
  ProfileReferenceSchema,
  RegexSupport,
  RegexSupportSchema,
  type TranslationError,
  TranslationErrorCode,
  TranslationErrorCodeSchema,
  TranslationErrorSchema,
  type TranslationLimits,
  TranslationLimitsSchema,
} from "./gen/protoutil/celql/v1/celql_pb.js";
export { PostgreSqlDialect, PostgreSqlPredicateSchema };
export {
  CelqlError,
  type CelqlErrorOptions,
} from "./translator.js";
export { CelqlTranslator };
export type {
  DialectConstructor,
  DialectContext,
  EffectiveTranslationLimits,
  TranslationOutcome,
  TranslationRequest,
} from "./types.js";
export { Dialect } from "./types.js";

/** Creates a translator with the concrete output type of a built-in or custom dialect. */
export function createTranslator(
  dialectClass: typeof PostgreSqlDialect,
): CelqlTranslator<typeof PostgreSqlPredicateSchema>;
export function createTranslator(
  dialectClass: typeof AnsiSqlDialect,
): CelqlTranslator<typeof AnsiSqlPredicateSchema>;
export function createTranslator<Constructor extends DialectConstructor>(
  dialectClass: Constructor,
): CelqlTranslator<DialectOutput<Constructor>>;
export function createTranslator(dialectClass: DialectConstructor): CelqlTranslator {
  return createDialectTranslator(dialectClass);
}
