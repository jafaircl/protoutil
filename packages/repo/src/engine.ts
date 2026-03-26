import type { CheckedExpr } from "@protoutil/aip/filtering";
import type { OrderBy } from "@protoutil/aip/orderby";
import type { MongoOutput, SqlOutput } from "@protoutil/aipql";

/**
 * A function that translates an AIP-160 checked filter expression into a
 * database-specific query.
 *
 * Each engine provides a sensible default dialect (e.g. the SQLite engine
 * uses `@protoutil/aipql`'s `sqlite` function). Users can override the
 * dialect to inject custom function handlers or other translation options.
 *
 * ```ts
 * import { sqlite } from "@protoutil/aipql";
 *
 * const engine = createSQLiteEngine({
 *   client: db,
 *   dialect: (expr) => sqlite(expr, { functions: { string_matches: myHandler } }),
 * });
 * ```
 */
export type Dialect = (expr: CheckedExpr) => SqlOutput | MongoOutput;

/**
 * Options for {@link Engine.findOne} and {@link Engine.findMany}.
 */
export interface EngineFindOptions {
  /** The table or collection name. */
  table: string;

  /**
   * Columns or fields to return. When omitted or empty, all columns
   * are returned.
   */
  columns?: string[];

  /**
   * A checked AIP-160 filter expression for the WHERE/filter clause.
   * When omitted, all rows are matched.
   */
  filter?: CheckedExpr;

  /** Maximum number of rows to return. */
  limit?: number;

  /** Number of rows to skip (for pagination). */
  offset?: number;

  /**
   * Ordering directive parsed from an AIP-132 order_by string.
   * The engine translates this into database-specific ordering.
   */
  orderBy?: OrderBy;
}

/**
 * Options for {@link Engine.insertOne}.
 */
export interface EngineInsertOptions {
  /** The table or collection name. */
  table: string;

  /** The row/document to insert as key-value pairs. */
  row: Record<string, unknown>;
}

/**
 * Options for {@link Engine.updateOne}.
 */
export interface EngineUpdateOptions {
  /** The table or collection name. */
  table: string;

  /** A checked AIP-160 filter expression identifying the row to update. */
  filter: CheckedExpr;

  /** The fields to set as key-value pairs. */
  row: Record<string, unknown>;
}

/**
 * Options for {@link Engine.deleteOne}.
 */
export interface EngineDeleteOptions {
  /** The table or collection name. */
  table: string;

  /** A checked AIP-160 filter expression identifying the row to delete. */
  filter: CheckedExpr;
}

/**
 * Options for {@link Engine.count}.
 */
export interface EngineCountOptions {
  /** The table or collection name. */
  table: string;

  /** A checked AIP-160 filter expression for the WHERE/filter clause. */
  filter?: CheckedExpr;
}

/**
 * Options for {@link Engine.insertMany}.
 */
export interface EngineInsertManyOptions {
  /** The table or collection name. */
  table: string;

  /** The rows/documents to insert as key-value pairs. */
  rows: Record<string, unknown>[];
}

/**
 * Options for {@link Engine.replaceMany}.
 */
export interface EngineReplaceManyOptions {
  /** The table or collection name. */
  table: string;

  /**
   * The full replacement rows as key-value pairs. Each row must include
   * the key columns so the engine can match them to existing rows.
   */
  rows: Record<string, unknown>[];

  /**
   * The database column names that uniquely identify each row (derived
   * from IDENTIFIER fields). Used to build the WHERE IN clause and
   * CASE expressions for the bulk UPDATE.
   */
  keyColumns: string[];
}

/**
 * Options for {@link Engine.deleteMany}.
 */
export interface EngineDeleteManyOptions {
  /** The table or collection name. */
  table: string;

  /** A checked AIP-160 filter expression identifying the rows to delete. */
  filter: CheckedExpr;
}

/**
 * Database engine interface. All dialect-specific engines (SQLite, Postgres,
 * MySQL, MongoDB) implement this contract so repositories can work
 * against any backend without code changes.
 */
export interface Engine {
  /**
   * The dialect function used to translate checked filter expressions
   * into database-specific queries. Set by each engine with a sensible
   * default and optionally overridden by the user at engine creation.
   */
  readonly dialect: Dialect;

  /**
   * Maximum number of bind parameters the engine supports per statement.
   * Used by the repository layer to chunk batch operations.
   *
   * - SQLite: 999
   * - Postgres: 65535
   * - MySQL: 65535
   * - MongoDB: Infinity (no parameter limit)
   */
  readonly maxParams: number;

  /**
   * Find a single row/document matching the filter.
   * Returns `undefined` if no match is found.
   */
  findOne<T = Record<string, unknown>>(opts: EngineFindOptions): Promise<T | undefined>;

  /**
   * Find all rows/documents matching the filter.
   */
  findMany<T = Record<string, unknown>>(opts: EngineFindOptions): Promise<T[]>;

  /**
   * Insert a single row/document and return the inserted record.
   */
  insertOne<T = Record<string, unknown>>(opts: EngineInsertOptions): Promise<T>;

  /**
   * Update a single row/document matching the filter and return the
   * updated record.
   */
  updateOne<T = Record<string, unknown>>(opts: EngineUpdateOptions): Promise<T | undefined>;

  /**
   * Delete a single row/document matching the filter. Returns `true`
   * if a row was deleted, `false` otherwise.
   */
  deleteOne(opts: EngineDeleteOptions): Promise<boolean>;

  /**
   * Insert multiple rows/documents and return all inserted records.
   * The engine automatically chunks the operation based on
   * {@link maxParams} to stay within bind-parameter limits.
   */
  insertMany<T = Record<string, unknown>>(opts: EngineInsertManyOptions): Promise<T[]>;

  /**
   * Replace multiple existing rows/documents identified by their key
   * columns and return all updated records. Uses CASE-based UPDATE
   * for SQL engines, which physically cannot create new rows.
   *
   * The engine automatically chunks the operation based on
   * {@link maxParams} to stay within bind-parameter limits.
   */
  replaceMany<T = Record<string, unknown>>(opts: EngineReplaceManyOptions): Promise<T[]>;

  /**
   * Delete multiple rows/documents matching the filter. Returns the
   * number of rows deleted.
   */
  deleteMany(opts: EngineDeleteManyOptions): Promise<number>;

  /**
   * Count rows/documents matching the filter.
   */
  count(opts: EngineCountOptions): Promise<number>;

  /**
   * Execute a raw query against the underlying database. This is the
   * escape hatch for queries that cannot be expressed through the
   * higher-level methods.
   *
   * For SQL engines, `query` is a SQL string and `params` contains bind
   * values. For document engines (e.g. MongoDB), `query` is a command
   * object and `params` is unused.
   */
  execute<T = Record<string, unknown>>(query: string | object, params?: unknown[]): Promise<T[]>;

  /**
   * Execute a function within a transaction. All engine method calls
   * made through the transactional engine share the same transaction
   * context. The transaction is committed when the callback resolves
   * and rolled back if it throws.
   */
  transaction<T>(fn: (tx: Engine) => Promise<T>): Promise<T>;

  /**
   * Close the underlying connection or client. After calling this method
   * the engine must not be used.
   */
  close(): Promise<void>;
}
