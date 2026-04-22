import type { CheckedExpr } from "@protoutil/aip/filtering";
import { TranslationError } from "../errors.js";
import type { PostgresOptions, SqlFunctionHandler, SqlOutput } from "../types.js";
import { assertBoolOutput, constStringValue, durationConstNanos } from "../utils.js";
import { SqlTranslator, sqlStdlib } from "./sql-base.js";

// ---------------------------------------------------------------------------
// Stdlib — extends shared sqlStdlib with Postgres-specific handlers.
//
// Overload IDs match BUILTIN_DECLS:
//   string_starts_with, string_ends_with, string_contains, string_matches
// ---------------------------------------------------------------------------

/**
 * Built-in PostgreSQL function handlers for translating supported AIP-160 functions.
 */
export const stdlibPostgres: Record<string, SqlFunctionHandler> = {
  ...sqlStdlib,

  string_matches(target, args, ctx) {
    if (!target || args.length !== 1)
      throw new TranslationError("matches: requires a target and one argument");
    ctx.write(`${ctx.emitIdent(target)} ~ ${ctx.pushParam(constStringValue(args[0], "matches"))}`);
  },

  ago_duration(_target, args, ctx) {
    if (args.length !== 1) throw new TranslationError("ago: requires exactly one argument");
    const nanos = durationConstNanos(args[0]);
    const micros = nanos / 1000n;
    ctx.write(`NOW() - INTERVAL ${ctx.pushParam(`${micros} microseconds`)}`);
  },
};

// ---------------------------------------------------------------------------
// Translator
// ---------------------------------------------------------------------------

class PgTranslator extends SqlTranslator {
  constructor(checkedExpr: CheckedExpr, opts?: PostgresOptions) {
    super(
      checkedExpr,
      stdlibPostgres,
      (opts?.caseInsensitive ?? true) ? "ILIKE" : "LIKE",
      `"`,
      opts?.functions,
    );
  }

  protected pushParam(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Translates a checked AIP-160 filter expression into PostgreSQL SQL and bind parameters.
 *
 * Uses numbered `$N` placeholders and enables case-insensitive string matching
 * by default via `ILIKE`.
 */
export function postgres(expr: CheckedExpr, opts?: PostgresOptions): SqlOutput {
  assertBoolOutput(expr);
  return new PgTranslator(expr, opts).translate(expr.expr);
}
