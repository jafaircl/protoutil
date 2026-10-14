import type { Message } from "@bufbuild/protobuf";
import type { TranslationOutcome } from "./types.js";

/** Textual predicate shape that every SQL profile emits. */
export type SqlPredicateShape = Message & { readonly sql: string };

/** Search conditions substituted for an outcome that carries no predicate. */
export interface SqlOutcomeConditions {
  /** Condition emitted for `matchAll`. Defaults to `TRUE`. */
  matchAll?: string;

  /** Condition emitted for `matchNone`. Defaults to `FALSE`. */
  matchNone?: string;
}

/**
 * Returns the search condition for one outcome, including the constant outcomes.
 *
 * `matchAll` and `matchNone` are not predicates, so a caller that branches on
 * the outcome by hand can reach an unrestricted query by forgetting one of
 * them. This substitutes a condition that selects every record or no record,
 * which keeps the emitted query restricted in every case.
 *
 * A target whose dialect has no Boolean literal supplies its own conditions,
 * such as `1 = 1` and `1 = 0`.
 *
 * @param outcome Outcome that a translator produced.
 * @param conditions Conditions substituted for the constant outcomes.
 */
export function sqlWhereClause<Predicate extends SqlPredicateShape>(
  outcome: TranslationOutcome<Predicate>,
  conditions: SqlOutcomeConditions = {},
): string {
  switch (outcome.case) {
    case "matchAll":
      return conditions.matchAll ?? "TRUE";
    case "matchNone":
      return conditions.matchNone ?? "FALSE";
    case "predicate":
      return outcome.value.sql;
  }
}

/**
 * Returns the search condition and bound parameters for one outcome.
 *
 * The constant outcomes bind no parameter, so `parameters` is empty for them.
 * Pass the parameter converter that the selected profile documents, which is
 * `postgreSqlParameters` for PostgreSQL and `parameterValues` over the
 * predicate's parameters for every other SQL profile.
 *
 * @param outcome Outcome that a translator produced.
 * @param bindParameters Converter that the selected profile documents.
 * @param conditions Conditions substituted for the constant outcomes.
 */
export function sqlQuery<Predicate extends SqlPredicateShape, Bound>(
  outcome: TranslationOutcome<Predicate>,
  bindParameters: (predicate: Predicate) => Bound[],
  conditions: SqlOutcomeConditions = {},
): { sql: string; parameters: Bound[] } {
  return {
    sql: sqlWhereClause(outcome, conditions),
    parameters: outcome.case === "predicate" ? bindParameters(outcome.value) : [],
  };
}
