import type { CheckedExpr } from "@protoutil/aip/filtering";
import type { SqlFunctionHandler, SqliteOptions, SqlOutput } from "../types.js";
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

export const stdlibSqlite: Record<string, SqlFunctionHandler> = {
  ...sqlStdlib,
  // string_matches intentionally absent — no built-in regex in SQLite.
  // Register a handler in options.functions pointing at your UDF.
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

export function sqlite(expr: CheckedExpr, opts?: SqliteOptions): SqlOutput {
  return new SqliteTranslator(expr, opts).translate(expr.expr);
}
