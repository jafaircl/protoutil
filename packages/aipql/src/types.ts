import type { Expr } from "@protoutil/aip/filtering";

export type SqlOutput = {
  sql: string;
  params: unknown[];
};

export type MongoOutput = {
  filter: MongoFilter;
};

// A single MongoDB filter document or sub-document.
// Typed loosely because MongoDB operators nest arbitrarily.
export type MongoFilter = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Shared options
// ---------------------------------------------------------------------------

type BaseOptions = {
  /**
   * Use case-insensitive matching for string comparisons via the has operator
   * (:) and string functions (startsWith, endsWith, contains).
   * Does not affect `matches`, which uses an explicit regex pattern.
   * Defaults to true.
   */
  caseInsensitive?: boolean;
};

// ---------------------------------------------------------------------------
// SQL dialect types
// ---------------------------------------------------------------------------

/**
 * Context passed to SQL function handlers so they can recurse into the
 * translator and push params without needing direct access to internals.
 */
export type SqlEmitContext = {
  /** Emit a sub-expression, appending SQL fragments and params in place. */
  emit(expr: Expr): void;
  /** Resolve a field reference expression to a quoted SQL column reference. */
  emitIdent(expr: Expr): string;
  /** Push a bound parameter and return its placeholder string e.g. "$3". */
  pushParam(value: unknown): string;
  /** Quote a column/field identifier. */
  quoteIdent(name: string): string;
  /** Append a raw SQL fragment to the output. */
  write(sql: string): void;
  /** LIKE or ILIKE depending on caseInsensitive option. */
  like: "LIKE" | "ILIKE";
};

export type SqlFunctionHandler = (
  target: Expr | undefined,
  args: Expr[],
  ctx: SqlEmitContext,
) => void;

export type PostgresOptions = BaseOptions & {
  /**
   * Custom function handlers keyed by overload ID or function name.
   * Merged over the stdlib — use to override or extend.
   */
  functions?: Record<string, SqlFunctionHandler>;
};

export type SqliteOptions = {
  /**
   * Custom function handlers keyed by overload ID or function name.
   * Merged over the stdlib — use to override or extend.
   *
   * Note: SQLite has no native regex operator. To support `matches`, register
   * a handler here pointing at a user-defined SQLite function, e.g.:
   *   db.function("regexp", (pattern, value) => new RegExp(pattern).test(value))
   */
  functions?: Record<string, SqlFunctionHandler>;
  // caseInsensitive is intentionally absent — SQLite LIKE case-sensitivity
  // is controlled at the connection level (SQLITE_CASE_SENSITIVE_LIKE /
  // ICU extension), not per-query. Exposing it here would be misleading.
};

export type MysqlOptions = {
  /**
   * Custom function handlers keyed by overload ID or function name.
   * Merged over the stdlib — use to override or extend.
   */
  functions?: Record<string, SqlFunctionHandler>;
  // caseInsensitive is intentionally absent — MySQL LIKE case-sensitivity
  // is controlled by column/table collation, not per-query.
};

// ---------------------------------------------------------------------------
// Mongo dialect types
// ---------------------------------------------------------------------------

/**
 * Context passed to Mongo function handlers so they can recurse into the
 * translator and build filter objects without access to internals.
 */
export type MongoEmitContext = {
  /** Translate a sub-expression into a MongoFilter object. */
  emit(expr: Expr): MongoFilter;
  /** Resolve a field reference expression to a dotted path string e.g. "address.city". */
  fieldPath(expr: Expr): string;
  /** Whether case-insensitive matching is enabled. */
  caseInsensitive: boolean;
};

export type MongoFunctionHandler = (
  target: Expr | undefined,
  args: Expr[],
  ctx: MongoEmitContext,
) => MongoFilter;

export type MongoOptions = BaseOptions & {
  /**
   * Custom function handlers keyed by CEL function name.
   * Called instead of the built-in handler when present.
   */
  functions?: Record<string, MongoFunctionHandler>;
};
