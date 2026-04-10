import {
  AlreadyExistsError,
  FailedPreconditionError,
  InternalError,
  InvalidArgumentError,
} from "@protoutil/aip/errors";
import type { CheckedExpr } from "@protoutil/aip/filtering";
import type { SqlOutput } from "@protoutil/aipql";
import { mysql } from "@protoutil/aipql";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
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

export interface MySQLEngineConfig {
  /** A `mysql2/promise` {@link Pool} instance. */
  client: Pool;

  /**
   * Override the default dialect used to translate AIP-160 filter
   * expressions into MySQL SQL. Defaults to `@protoutil/aipql`'s
   * `mysql` function.
   *
   * ```ts
   * import { mysql } from "@protoutil/aipql";
   *
   * const engine = createMySQLEngine({
   *   client: pool,
   *   dialect: (expr) => mysql(expr, { functions: { string_matches: myHandler } }),
   * });
   * ```
   */
  dialect?: Dialect;
}

function quoteIdent(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

/**
 * Map a MySQL error to the appropriate AIP status error using
 * MySQL error numbers (errno).
 *
 * - 1062 (ER_DUP_ENTRY) → AlreadyExistsError
 * - 1048 (ER_BAD_NULL_ERROR) → InvalidArgumentError
 * - 3819 (ER_CHECK_CONSTRAINT_VIOLATED) → InvalidArgumentError
 * - 1452 (ER_NO_REFERENCED_ROW_2) → FailedPreconditionError
 * - Everything else → InternalError
 */
function wrapDbError(err: unknown): never {
  if (!(err instanceof Error)) {
    throw new InternalError({ message: String(err) });
  }
  const errno = (err as { errno?: number }).errno;
  const msg = err.message;
  switch (errno) {
    case 1062:
      throw new AlreadyExistsError({
        message: msg,
        debugInfo: { detail: msg },
      });
    case 1048:
    case 1364:
    case 3819:
      throw new InvalidArgumentError({
        message: msg,
        debugInfo: { detail: msg },
      });
    case 1452:
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

/** Queryable interface shared by Pool and PoolConnection. */
interface Queryable {
  execute<T extends RowDataPacket[]>(sql: string, values?: unknown[]): Promise<[T, unknown]>;
  execute<T extends ResultSetHeader>(sql: string, values?: unknown[]): Promise<[T, unknown]>;
}

const READ_PREFIXES = ["SELECT", "WITH", "SHOW", "DESCRIBE", "EXPLAIN"];

function isRead(sql: string): boolean {
  const trimmed = sql.trimStart().toUpperCase();
  return READ_PREFIXES.some((p) => trimmed.startsWith(p));
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

function buildRowMatchWhere(
  keys: string[],
  row: Record<string, unknown>,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses = keys.map((key) => {
    const value = row[key];
    if (value === null || value === undefined) {
      return `${quoteIdent(key)} IS NULL`;
    }
    params.push(value);
    return `${quoteIdent(key)} = ?`;
  });
  return {
    sql: clauses.join(" AND "),
    params,
  };
}

function buildRowsMatchWhere(
  keys: string[],
  rows: Record<string, unknown>[],
): { sql: string; params: unknown[] } {
  const matches = rows.map((row) => buildRowMatchWhere(keys, row));
  return {
    sql: matches.map((match) => `(${match.sql})`).join(" OR "),
    params: matches.flatMap((match) => match.params),
  };
}

function createMySQLEngineImpl(pool: Pool, dialect: Dialect, conn?: PoolConnection): Engine {
  const queryable: Queryable = (conn ?? pool) as Queryable;

  const engine: Engine = {
    dialect,
    maxParams: 65535,

    async findOne<T = Record<string, unknown>>(opts: EngineFindOptions): Promise<T | undefined> {
      const { sql, params } = buildSelectSql({ ...opts, limit: 1 }, dialect);
      try {
        const [rows] = await queryable.execute<RowDataPacket[]>(sql, params);
        return rows[0] as T | undefined;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async findMany<T = Record<string, unknown>>(opts: EngineFindOptions): Promise<T[]> {
      const { sql, params } = buildSelectSql(opts, dialect);
      try {
        const [rows] = await queryable.execute<RowDataPacket[]>(sql, params);
        return rows as T[];
      } catch (err) {
        wrapDbError(err);
      }
    },

    async insertOne<T = Record<string, unknown>>(opts: EngineInsertOptions): Promise<T> {
      const keys = Object.keys(opts.row);
      const cols = keys.map(quoteIdent).join(", ");
      const placeholders = keys.map(() => "?").join(", ");
      const values = keys.map((k) => opts.row[k] ?? null);

      // MySQL doesn't support RETURNING — insert then fetch back
      const insertSql = `INSERT INTO ${quoteIdent(opts.table)} (${cols}) VALUES (${placeholders})`;
      try {
        await queryable.execute<ResultSetHeader>(insertSql, values);

        // Fetch the inserted row back using LAST_INSERT_ID or the provided values
        // Build a filter from the inserted values to fetch it back
        const match = buildRowMatchWhere(keys, opts.row);
        const selectSql = `SELECT * FROM ${quoteIdent(opts.table)} WHERE ${match.sql} LIMIT 1`;
        const [rows] = await queryable.execute<RowDataPacket[]>(selectSql, match.params);
        return rows[0] as T;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async updateOne<T = Record<string, unknown>>(
      opts: EngineUpdateOptions,
    ): Promise<T | undefined> {
      const keys = Object.keys(opts.row);
      const setClauses = keys.map((k) => `${quoteIdent(k)} = ?`).join(", ");
      const setValues = keys.map((k) => opts.row[k]);
      const { sql: where, params: whereParams } = translateFilter(dialect, opts.filter);

      // MySQL doesn't support RETURNING — update then fetch back
      const updateSql = `UPDATE ${quoteIdent(opts.table)} SET ${setClauses} WHERE ${where}`;
      try {
        const [result] = await queryable.execute<ResultSetHeader>(updateSql, [
          ...setValues,
          ...whereParams,
        ]);

        if (result.affectedRows === 0) {
          return undefined;
        }

        // Fetch the updated row using the original filter
        const selectSql = `SELECT * FROM ${quoteIdent(opts.table)} WHERE ${where} LIMIT 1`;
        const [rows] = await queryable.execute<RowDataPacket[]>(selectSql, whereParams);
        return rows[0] as T | undefined;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async deleteOne(opts: EngineDeleteOptions): Promise<boolean> {
      const { sql: where, params } = translateFilter(dialect, opts.filter);
      const sql = `DELETE FROM ${quoteIdent(opts.table)} WHERE ${where}`;
      try {
        const [result] = await queryable.execute<ResultSetHeader>(sql, params);
        return result.affectedRows > 0;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async insertMany<T = Record<string, unknown>>(opts: EngineInsertManyOptions): Promise<T[]> {
      if (opts.rows.length === 0) return [];
      const keys = unionKeys(opts.rows);
      const cols = keys.map(quoteIdent).join(", ");
      const rowPlaceholder = `(${keys.map(() => "?").join(", ")})`;
      const chunkSize = Math.floor(65535 / keys.length);
      const results: T[] = [];

      for (let i = 0; i < opts.rows.length; i += chunkSize) {
        const chunk = opts.rows.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => rowPlaceholder).join(", ");
        const values = chunk.flatMap((row) => keys.map((k) => row[k] ?? null));
        const insertSql = `INSERT INTO ${quoteIdent(opts.table)} (${cols}) VALUES ${placeholders}`;
        try {
          await queryable.execute<ResultSetHeader>(insertSql, values);

          // MySQL has no RETURNING — fetch back using all inserted values
          const match = buildRowsMatchWhere(keys, chunk);
          const selectSql = `SELECT * FROM ${quoteIdent(opts.table)} WHERE ${match.sql}`;
          const [rows] = await queryable.execute<RowDataPacket[]>(selectSql, match.params);
          results.push(...(rows as T[]));
        } catch (err) {
          wrapDbError(err);
        }
      }

      return results;
    },

    async replaceMany<T = Record<string, unknown>>(opts: EngineReplaceManyOptions): Promise<T[]> {
      if (opts.rows.length === 0) return [];
      const keys = unionKeys(opts.rows);
      const nonKeyColumns = keys.filter((k) => !opts.keyColumns.includes(k));
      const paramsPerRow = nonKeyColumns.length + opts.keyColumns.length;
      const chunkSize = Math.floor(65535 / paramsPerRow);
      const results: T[] = [];

      for (let i = 0; i < opts.rows.length; i += chunkSize) {
        const chunk = opts.rows.slice(i, i + chunkSize);
        const params: unknown[] = [];

        // Build CASE expressions for each non-key column
        const setClauses = nonKeyColumns.map((col) => {
          const cases = chunk.map((row) => {
            const whenParts = opts.keyColumns.map((kc) => {
              params.push(row[kc]);
              return `${quoteIdent(kc)} = ?`;
            });
            params.push(row[col] ?? null);
            return `WHEN ${whenParts.join(" AND ")} THEN ?`;
          });
          return `${quoteIdent(col)} = CASE ${cases.join(" ")} ELSE ${quoteIdent(col)} END`;
        });

        // WHERE IN clause
        let whereIn: string;
        if (opts.keyColumns.length === 1) {
          const kc = opts.keyColumns[0];
          const placeholders = chunk.map((row) => {
            params.push(row[kc]);
            return "?";
          });
          whereIn = `${quoteIdent(kc)} IN (${placeholders.join(", ")})`;
        } else {
          const tuples = chunk.map((row) => {
            const vals = opts.keyColumns.map((kc) => {
              params.push(row[kc]);
              return "?";
            });
            return `(${vals.join(", ")})`;
          });
          whereIn = `(${opts.keyColumns.map(quoteIdent).join(", ")}) IN (${tuples.join(", ")})`;
        }

        const updateSql = `UPDATE ${quoteIdent(opts.table)} SET ${setClauses.join(", ")} WHERE ${whereIn}`;
        try {
          await queryable.execute<ResultSetHeader>(updateSql, params);

          // Fetch back updated rows
          const selectParams: unknown[] = [];
          let selectWhereIn: string;
          if (opts.keyColumns.length === 1) {
            const kc = opts.keyColumns[0];
            const ph = chunk.map((row) => {
              selectParams.push(row[kc]);
              return "?";
            });
            selectWhereIn = `${quoteIdent(kc)} IN (${ph.join(", ")})`;
          } else {
            const tuples = chunk.map((row) => {
              const vals = opts.keyColumns.map((kc) => {
                selectParams.push(row[kc]);
                return "?";
              });
              return `(${vals.join(", ")})`;
            });
            selectWhereIn = `(${opts.keyColumns.map(quoteIdent).join(", ")}) IN (${tuples.join(", ")})`;
          }
          const selectSql = `SELECT * FROM ${quoteIdent(opts.table)} WHERE ${selectWhereIn}`;
          const [rows] = await queryable.execute<RowDataPacket[]>(selectSql, selectParams);
          results.push(...(rows as T[]));
        } catch (err) {
          wrapDbError(err);
        }
      }

      return results;
    },

    async deleteMany(opts: EngineDeleteManyOptions): Promise<number> {
      const { sql: where, params } = translateFilter(dialect, opts.filter);
      const sql = `DELETE FROM ${quoteIdent(opts.table)} WHERE ${where}`;
      try {
        const [result] = await queryable.execute<ResultSetHeader>(sql, params);
        return result.affectedRows;
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
      try {
        const [rows] = await queryable.execute<RowDataPacket[]>(sql, params);
        return Number(rows[0]?.count ?? 0);
      } catch (err) {
        wrapDbError(err);
      }
    },

    async execute<T = Record<string, unknown>>(
      query: string | object,
      params?: unknown[],
    ): Promise<T[]> {
      if (typeof query !== "string") {
        throw new Error("MySQL engine only supports string queries");
      }
      try {
        if (isRead(query)) {
          const [rows] = await queryable.execute<RowDataPacket[]>(query, params);
          return rows as T[];
        }
        await queryable.execute(query, params);
        return [] as T[];
      } catch (err) {
        wrapDbError(err);
      }
    },

    async transaction<T>(fn: (tx: Engine) => Promise<T>): Promise<T> {
      // If already in a transaction (conn is set), use savepoints.
      // SAVEPOINT commands are not supported via the prepared statement
      // protocol in MySQL, so we use query() instead of execute().
      if (conn) {
        const id = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await conn.query(`SAVEPOINT ${id}`);
        try {
          const result = await fn(engine);
          await conn.query(`RELEASE SAVEPOINT ${id}`);
          return result;
        } catch (err) {
          await conn.query(`ROLLBACK TO SAVEPOINT ${id}`);
          throw err;
        }
      }

      // Top-level transaction: acquire a dedicated connection from the pool
      const txConn = await pool.getConnection();
      try {
        await txConn.beginTransaction();
        const txEngine = createMySQLEngineImpl(pool, dialect, txConn);
        const result = await fn(txEngine);
        await txConn.commit();
        return result;
      } catch (err) {
        await txConn.rollback();
        throw err;
      } finally {
        txConn.release();
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };

  return engine;
}

/**
 * Create an {@link Engine} backed by `mysql2` (promise API).
 *
 * ```ts
 * import mysql from "mysql2/promise";
 * import { createMySQLEngine } from "@protoutil/repo/mysql";
 *
 * const engine = createMySQLEngine({
 *   client: mysql.createPool({ host: "localhost", user: "root", database: "app" }),
 * });
 * ```
 */
export function createMySQLEngine(config: MySQLEngineConfig): Engine {
  const dialect: Dialect = config.dialect ?? mysql;
  return createMySQLEngineImpl(config.client, dialect);
}
