import type { CheckedExpr } from "@protoutil/aip/filtering";
import { TranslationError } from "../errors.js";
import type { SqlFunctionHandler, SqliteOptions, SqlOutput } from "../types.js";
import { assertBoolOutput, durationConstNanos } from "../utils.js";
import { SqlTranslator, sqlStdlib } from "./sql-base.js";

// ---------------------------------------------------------------------------
// Stdlib
//
// SQLite differences from Postgres:
//   - Params are ? not $N
//   - LIKE is case-insensitive for ASCII by default — no ILIKE needed or available
//   - No native regex operator — `matches` is intentionally excluded from the
//     stdlib. Callers must register their own handler pointing at a SQLite
//     user-defined function (e.g. registered via better-sqlite3's .function()).
//
// Overload IDs match BUILTIN_DECLS:
//   string_starts_with, string_ends_with, string_contains
// ---------------------------------------------------------------------------

/**
 * Built-in SQLite function handlers for translating supported AIP-160 functions.
 */
export const stdlibSqlite: Record<string, SqlFunctionHandler> = {
  ...sqlStdlib,
  // string_matches intentionally absent — no built-in regex in SQLite.
  // Register a handler in options.functions pointing at your UDF.

  ago_duration(_target, args, ctx) {
    if (args.length !== 1) throw new TranslationError("ago: requires exactly one argument");
    const nanos = durationConstNanos(args[0]);
    const seconds = Number(nanos) / 1e9;
    ctx.write(`datetime('now', ${ctx.pushParam(`-${seconds} seconds`)})`);
  },
};

// ---------------------------------------------------------------------------
// Translator
// ---------------------------------------------------------------------------

class SqliteTranslator extends SqlTranslator {
  constructor(checkedExpr: CheckedExpr, opts?: SqliteOptions) {
    super(checkedExpr, stdlibSqlite, "LIKE", `"`, opts?.functions);
  }

  // SQLite uses ? placeholders — no index needed
  protected pushParam(value: unknown): string {
    this.params.push(value);
    return "?";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Translates a checked AIP-160 filter expression into SQLite SQL and bind parameters.
 *
 * Uses `?` placeholders and the built-in SQLite dialect helpers. Custom function
 * handlers can be provided with `opts.functions`.
 */
export function sqlite(expr: CheckedExpr, opts?: SqliteOptions): SqlOutput {
  assertBoolOutput(expr);
  return new SqliteTranslator(expr, opts).translate(expr.expr);
}
