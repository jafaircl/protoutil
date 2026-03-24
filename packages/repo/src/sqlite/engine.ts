import {
  AlreadyExistsError,
  FailedPreconditionError,
  InternalError,
  InvalidArgumentError,
} from "@protoutil/aip/errors";
import type { CheckedExpr } from "@protoutil/aip/filtering";
import type { SqlOutput } from "@protoutil/aipql";
import { sqlite } from "@protoutil/aipql";
import type Database from "better-sqlite3";
import type {
  Dialect,
  Engine,
  EngineCountOptions,
  EngineDeleteManyOptions,
  EngineDeleteOptions,
  EngineFindOptions,
  EngineInsertManyOptions,
  EngineInsertOptions,
  EngineReplaceManyOptions,
  EngineUpdateOptions,
} from "../engine.js";

export interface SQLiteEngineConfig {
  /** A `better-sqlite3` {@link Database} instance. */
  client: Database.Database;

  /**
   * Override the default dialect used to translate AIP-160 filter
   * expressions into SQLite SQL. Defaults to `@protoutil/aipql`'s
   * `sqlite` function.
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
  dialect?: Dialect;
}

const READ_PREFIXES = ["SELECT", "WITH", "PRAGMA", "EXPLAIN"];

function isRead(sql: string): boolean {
  const trimmed = sql.trimStart().toUpperCase();
  return READ_PREFIXES.some((p) => trimmed.startsWith(p));
}

/**
 * Map a SQLite error to the appropriate AIP status error.
 *
 * - UNIQUE constraint → AlreadyExistsError
 * - NOT NULL / CHECK constraint → InvalidArgumentError
 * - FOREIGN KEY constraint → FailedPreconditionError
 * - Everything else → InternalError
 */
function wrapDbError(err: unknown): never {
  if (!(err instanceof Error)) {
    throw new InternalError({ message: String(err) });
  }
  const msg = err.message;
  switch (true) {
    case msg.includes("UNIQUE constraint"):
      throw new AlreadyExistsError({
        message: msg,
        debugInfo: { detail: msg },
      });
    case msg.includes("NOT NULL constraint"):
    case msg.includes("CHECK constraint"):
      throw new InvalidArgumentError({
        message: msg,
        debugInfo: { detail: msg },
      });
    case msg.includes("FOREIGN KEY constraint"):
      throw new FailedPreconditionError({
        message: msg,
        debugInfo: { detail: msg },
      });
    default:
      throw new InternalError({
        message: msg,
        debugInfo: { detail: msg },
      });
  }
}

function rawExec<T>(db: Database.Database, query: string | object, params?: unknown[]): T[] {
  if (typeof query !== "string") {
    throw new Error("SQLite engine only supports string queries");
  }
  try {
    const stmt = db.prepare(query);
    const coerced = coerceParams(params ?? []);
    if (isRead(query) || query.toUpperCase().includes("RETURNING")) {
      return stmt.all(...coerced) as T[];
    }
    stmt.run(...coerced);
    return [] as T[];
  } catch (err) {
    wrapDbError(err);
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Coerce a value for SQLite binding. SQLite does not support boolean
 * values natively, so booleans are converted to integers (0/1).
 */
function coerceParam(value: unknown): unknown {
  switch (typeof value) {
    case "boolean":
      return value ? 1 : 0;
    default:
      return value;
  }
}

/** Coerce all values in an array for SQLite binding. */
function coerceParams(params: unknown[]): unknown[] {
  return params.map(coerceParam);
}

function translateFilter(dialect: Dialect, filter: CheckedExpr): SqlOutput {
  return dialect(filter) as SqlOutput;
}

function buildSelectSql(
  opts: EngineFindOptions,
  dialect: Dialect,
): { sql: string; params: unknown[] } {
  const cols = opts.columns?.length ? opts.columns.map(quoteIdent).join(", ") : "*";
  let sql = `SELECT ${cols} FROM ${quoteIdent(opts.table)}`;
  let params: unknown[] = [];

  if (opts.filter) {
    const where = translateFilter(dialect, opts.filter);
    sql += ` WHERE ${where.sql}`;
    params = where.params;
  }
  if (opts.orderBy?.fields.length) {
    const clauses = opts.orderBy.fields.map(
      (f) => `${quoteIdent(f.path)} ${f.desc ? "DESC" : "ASC"}`,
    );
    sql += ` ORDER BY ${clauses.join(", ")}`;
  }
  if (opts.limit != null) {
    if (!Number.isInteger(opts.limit) || opts.limit < 0) {
      throw new InvalidArgumentError({ message: "limit must be a non-negative integer" });
    }
    sql += ` LIMIT ${opts.limit}`;
  }
  if (opts.offset != null) {
    if (!Number.isInteger(opts.offset) || opts.offset < 0) {
      throw new InvalidArgumentError({ message: "offset must be a non-negative integer" });
    }
    sql += ` OFFSET ${opts.offset}`;
  }

  return { sql, params };
}

/** Compute the union of keys across all rows for consistent column sets. */
function unionKeys(rows: Record<string, unknown>[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      set.add(k);
    }
  }
  return [...set];
}

function createSQLiteEngineImpl(client: Database.Database, dialect: Dialect): Engine {
  const engine: Engine = {
    dialect,
    maxParams: 999,

    async findOne<T = Record<string, unknown>>(opts: EngineFindOptions): Promise<T | undefined> {
      const { sql, params } = buildSelectSql({ ...opts, limit: 1 }, dialect);
      const rows = rawExec<T>(client, sql, params);
      return rows[0];
    },

    async findMany<T = Record<string, unknown>>(opts: EngineFindOptions): Promise<T[]> {
      const { sql, params } = buildSelectSql(opts, dialect);
      return rawExec<T>(client, sql, params);
    },

    async insertOne<T = Record<string, unknown>>(opts: EngineInsertOptions): Promise<T> {
      const keys = Object.keys(opts.row);
      const cols = keys.map(quoteIdent).join(", ");
      const placeholders = keys.map(() => "?").join(", ");
      const values = keys.map((k) => coerceParam(opts.row[k]));

      const sql = `INSERT INTO ${quoteIdent(opts.table)} (${cols}) VALUES (${placeholders}) RETURNING *`;
      const rows = rawExec<T>(client, sql, values);
      return rows[0];
    },

    async updateOne<T = Record<string, unknown>>(
      opts: EngineUpdateOptions,
    ): Promise<T | undefined> {
      const keys = Object.keys(opts.row);
      const setClauses = keys.map((k) => `${quoteIdent(k)} = ?`).join(", ");
      const setValues = keys.map((k) => coerceParam(opts.row[k]));
      const { sql: where, params: whereParams } = translateFilter(dialect, opts.filter);

      const sql = `UPDATE ${quoteIdent(opts.table)} SET ${setClauses} WHERE ${where} RETURNING *`;
      const rows = rawExec<T>(client, sql, [...setValues, ...whereParams]);
      return rows[0];
    },

    async deleteOne(opts: EngineDeleteOptions): Promise<boolean> {
      const { sql: where, params } = translateFilter(dialect, opts.filter);
      const sql = `DELETE FROM ${quoteIdent(opts.table)} WHERE ${where}`;
      try {
        const stmt = client.prepare(sql);
        const result = stmt.run(...params);
        return result.changes > 0;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async insertMany<T = Record<string, unknown>>(opts: EngineInsertManyOptions): Promise<T[]> {
      if (opts.rows.length === 0) return [];
      const keys = unionKeys(opts.rows);
      const cols = keys.map(quoteIdent).join(", ");
      const rowPlaceholder = `(${keys.map(() => "?").join(", ")})`;
      const chunkSize = Math.floor(999 / keys.length);
      const results: T[] = [];

      for (let i = 0; i < opts.rows.length; i += chunkSize) {
        const chunk = opts.rows.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => rowPlaceholder).join(", ");
        const values = chunk.flatMap((row) => keys.map((k) => coerceParam(row[k] ?? null)));
        const sql = `INSERT INTO ${quoteIdent(opts.table)} (${cols}) VALUES ${placeholders} RETURNING *`;
        const rows = rawExec<T>(client, sql, values);
        results.push(...rows);
      }

      return results;
    },

    async replaceMany<T = Record<string, unknown>>(opts: EngineReplaceManyOptions): Promise<T[]> {
      if (opts.rows.length === 0) return [];
      const keys = unionKeys(opts.rows);
      const nonKeyColumns = keys.filter((k) => !opts.keyColumns.includes(k));
      // params per row: one per non-key column (CASE WHEN) + one for WHERE IN
      const paramsPerRow = nonKeyColumns.length + opts.keyColumns.length;
      const chunkSize = Math.floor(999 / paramsPerRow);
      const results: T[] = [];

      for (let i = 0; i < opts.rows.length; i += chunkSize) {
        const chunk = opts.rows.slice(i, i + chunkSize);
        const params: unknown[] = [];

        // Build CASE expressions for each non-key column
        // For composite keys we use: CASE WHEN k1=? AND k2=? THEN ? ...
        const setClauses = nonKeyColumns.map((col) => {
          const cases = chunk.map((row) => {
            const whenParts = opts.keyColumns.map((kc) => {
              params.push(coerceParam(row[kc]));
              return `${quoteIdent(kc)} = ?`;
            });
            params.push(coerceParam(row[col] ?? null));
            return `WHEN ${whenParts.join(" AND ")} THEN ?`;
          });
          return `${quoteIdent(col)} = CASE ${cases.join(" ")} ELSE ${quoteIdent(col)} END`;
        });

        // WHERE IN clause
        let whereIn: string;
        if (opts.keyColumns.length === 1) {
          const kc = opts.keyColumns[0];
          const placeholders = chunk.map((row) => {
            params.push(coerceParam(row[kc]));
            return "?";
          });
          whereIn = `${quoteIdent(kc)} IN (${placeholders.join(", ")})`;
        } else {
          const tuples = chunk.map((row) => {
            const vals = opts.keyColumns.map((kc) => {
              params.push(coerceParam(row[kc]));
              return "?";
            });
            return `(${vals.join(", ")})`;
          });
          whereIn = `(${opts.keyColumns.map(quoteIdent).join(", ")}) IN (${tuples.join(", ")})`;
        }

        const sql = `UPDATE ${quoteIdent(opts.table)} SET ${setClauses.join(", ")} WHERE ${whereIn} RETURNING *`;
        const rows = rawExec<T>(client, sql, params);
        results.push(...rows);
      }

      return results;
    },

    async deleteMany(opts: EngineDeleteManyOptions): Promise<number> {
      const { sql: where, params } = translateFilter(dialect, opts.filter);
      const sql = `DELETE FROM ${quoteIdent(opts.table)} WHERE ${where}`;
      try {
        const stmt = client.prepare(sql);
        const result = stmt.run(...params);
        return result.changes;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async count(opts: EngineCountOptions): Promise<number> {
      let sql: string;
      let params: unknown[];
      if (opts.filter) {
        const translated = translateFilter(dialect, opts.filter);
        sql = `SELECT COUNT(*) as count FROM ${quoteIdent(opts.table)} WHERE ${translated.sql}`;
        params = translated.params;
      } else {
        sql = `SELECT COUNT(*) as count FROM ${quoteIdent(opts.table)}`;
        params = [];
      }
      const rows = rawExec<{ count: number }>(client, sql, params);
      return rows[0]?.count ?? 0;
    },

    async execute<T = Record<string, unknown>>(
      query: string | object,
      params?: unknown[],
    ): Promise<T[]> {
      return rawExec<T>(client, query, params);
    },

    async transaction<T>(fn: (tx: Engine) => Promise<T>): Promise<T> {
      client.exec("BEGIN");
      const txEngine = createSQLiteEngineImpl(client, dialect);
      // Override transaction to use savepoints for nesting
      txEngine.transaction = async <U>(innerFn: (tx: Engine) => Promise<U>): Promise<U> => {
        const id = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        client.exec(`SAVEPOINT ${id}`);
        try {
          const result = await innerFn(txEngine);
          client.exec(`RELEASE SAVEPOINT ${id}`);
          return result;
        } catch (err) {
          client.exec(`ROLLBACK TO SAVEPOINT ${id}`);
          throw err;
        }
      };
      txEngine.close = () => engine.close();
      try {
        const result = await fn(txEngine);
        client.exec("COMMIT");
        return result;
      } catch (err) {
        client.exec("ROLLBACK");
        throw err;
      }
    },

    async close(): Promise<void> {
      client.close();
    },
  };

  return engine;
}

/**
 * Create an {@link Engine} backed by `better-sqlite3`.
 *
 * ```ts
 * import Database from "better-sqlite3";
 * import { createSQLiteEngine } from "@protoutil/repo/sqlite";
 *
 * const engine = createSQLiteEngine({ client: new Database("app.db") });
 * ```
 */
export function createSQLiteEngine(config: SQLiteEngineConfig): Engine {
  const dialect: Dialect = config.dialect ?? sqlite;
  return createSQLiteEngineImpl(config.client, dialect);
}
