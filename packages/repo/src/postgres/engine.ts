import {
  AlreadyExistsError,
  FailedPreconditionError,
  InternalError,
  InvalidArgumentError,
} from "@protoutil/aip/errors";
import type { CheckedExpr } from "@protoutil/aip/filtering";
import type { SqlOutput } from "@protoutil/aipql";
import { postgres } from "@protoutil/aipql";
import type { Pool, PoolClient } from "pg";
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

/**
 * Configuration for {@link createPostgresEngine}.
 */
export interface PostgresEngineConfig {
  /** A `pg` {@link Pool} instance. */
  client: Pool;

  /**
   * Override the default dialect used to translate AIP-160 filter
   * expressions into PostgreSQL SQL. Defaults to `@protoutil/aipql`'s
   * `postgres` function.
   *
   * ```ts
   * import { postgres } from "@protoutil/aipql";
   *
   * const engine = createPostgresEngine({
   *   client: pool,
   *   dialect: (expr) => postgres(expr, { functions: { string_matches: myHandler } }),
   * });
   * ```
   */
  dialect?: Dialect;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Re-number `$N` placeholders by adding an offset. Used when building
 * UPDATE queries where SET clause params come before WHERE clause params.
 */
function offsetParams(sql: string, offset: number): string {
  if (offset === 0) return sql;
  return sql.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n, 10) + offset}`);
}

/**
 * Map a PostgreSQL error to the appropriate AIP status error using
 * SQLSTATE error codes.
 *
 * - 23505 (unique_violation) → AlreadyExistsError
 * - 23502 (not_null_violation) → InvalidArgumentError
 * - 23514 (check_violation) → InvalidArgumentError
 * - 23503 (foreign_key_violation) → FailedPreconditionError
 * - Everything else → InternalError
 */
function wrapDbError(err: unknown): never {
  if (!(err instanceof Error)) {
    throw new InternalError({ message: String(err) });
  }
  const code = (err as { code?: string }).code;
  const msg = err.message;
  switch (code) {
    case "23505":
      throw new AlreadyExistsError({
        message: msg,
        debugInfo: { detail: msg },
      });
    case "23502":
    case "23514":
      throw new InvalidArgumentError({
        message: msg,
        debugInfo: { detail: msg },
      });
    case "23503":
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

/** Queryable interface shared by Pool and PoolClient. */
interface Queryable {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
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

function createPostgresEngineImpl(pool: Pool, dialect: Dialect, client?: PoolClient): Engine {
  const queryable: Queryable = client ?? pool;

  const engine: Engine = {
    dialect,
    maxParams: 65535,

    async findOne<T = Record<string, unknown>>(opts: EngineFindOptions): Promise<T | undefined> {
      const { sql, params } = buildSelectSql({ ...opts, limit: 1 }, dialect);
      try {
        const result = await queryable.query(sql, params);
        return result.rows[0] as T | undefined;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async findMany<T = Record<string, unknown>>(opts: EngineFindOptions): Promise<T[]> {
      const { sql, params } = buildSelectSql(opts, dialect);
      try {
        const result = await queryable.query(sql, params);
        return result.rows as T[];
      } catch (err) {
        wrapDbError(err);
      }
    },

    async insertOne<T = Record<string, unknown>>(opts: EngineInsertOptions): Promise<T> {
      const keys = Object.keys(opts.row);
      const cols = keys.map(quoteIdent).join(", ");
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const values = keys.map((k) => opts.row[k]);

      const sql = `INSERT INTO ${quoteIdent(opts.table)} (${cols}) VALUES (${placeholders}) RETURNING *`;
      try {
        const result = await queryable.query(sql, values);
        return result.rows[0] as T;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async updateOne<T = Record<string, unknown>>(
      opts: EngineUpdateOptions,
    ): Promise<T | undefined> {
      const keys = Object.keys(opts.row);
      const setClauses = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`).join(", ");
      const setValues = keys.map((k) => opts.row[k]);
      const { sql: where, params: whereParams } = translateFilter(dialect, opts.filter);
      const offsetWhere = offsetParams(where, keys.length);

      const sql = `UPDATE ${quoteIdent(opts.table)} SET ${setClauses} WHERE ${offsetWhere} RETURNING *`;
      try {
        const result = await queryable.query(sql, [...setValues, ...whereParams]);
        return result.rows[0] as T | undefined;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async deleteOne(opts: EngineDeleteOptions): Promise<boolean> {
      const { sql: where, params } = translateFilter(dialect, opts.filter);
      const sql = `DELETE FROM ${quoteIdent(opts.table)} WHERE ${where}`;
      try {
        const result = await queryable.query(sql, params);
        return (result.rowCount ?? 0) > 0;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async insertMany<T = Record<string, unknown>>(opts: EngineInsertManyOptions): Promise<T[]> {
      if (opts.rows.length === 0) return [];
      const keys = unionKeys(opts.rows);
      const cols = keys.map(quoteIdent).join(", ");
      const chunkSize = Math.floor(65535 / keys.length);
      const results: T[] = [];

      for (let i = 0; i < opts.rows.length; i += chunkSize) {
        const chunk = opts.rows.slice(i, i + chunkSize);
        let paramIdx = 1;
        const placeholders = chunk
          .map(() => {
            const row = keys.map(() => `$${paramIdx++}`).join(", ");
            return `(${row})`;
          })
          .join(", ");
        const values = chunk.flatMap((row) => keys.map((k) => row[k] ?? null));
        const sql = `INSERT INTO ${quoteIdent(opts.table)} (${cols}) VALUES ${placeholders} RETURNING *`;
        try {
          const result = await queryable.query(sql, values);
          results.push(...(result.rows as T[]));
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
        let paramIdx = 1;
        const params: unknown[] = [];

        // Build CASE expressions for each non-key column
        const setClauses = nonKeyColumns.map((col) => {
          const cases = chunk.map((row) => {
            const whenParts = opts.keyColumns.map((kc) => {
              params.push(row[kc]);
              return `${quoteIdent(kc)} = $${paramIdx++}`;
            });
            params.push(row[col] ?? null);
            return `WHEN ${whenParts.join(" AND ")} THEN $${paramIdx++}`;
          });
          return `${quoteIdent(col)} = CASE ${cases.join(" ")} ELSE ${quoteIdent(col)} END`;
        });

        // WHERE IN clause
        let whereIn: string;
        if (opts.keyColumns.length === 1) {
          const kc = opts.keyColumns[0];
          const placeholders = chunk.map((row) => {
            params.push(row[kc]);
            return `$${paramIdx++}`;
          });
          whereIn = `${quoteIdent(kc)} IN (${placeholders.join(", ")})`;
        } else {
          const tuples = chunk.map((row) => {
            const vals = opts.keyColumns.map((kc) => {
              params.push(row[kc]);
              return `$${paramIdx++}`;
            });
            return `(${vals.join(", ")})`;
          });
          whereIn = `(${opts.keyColumns.map(quoteIdent).join(", ")}) IN (${tuples.join(", ")})`;
        }

        const sql = `UPDATE ${quoteIdent(opts.table)} SET ${setClauses.join(", ")} WHERE ${whereIn} RETURNING *`;
        try {
          const result = await queryable.query(sql, params);
          results.push(...(result.rows as T[]));
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
        const result = await queryable.query(sql, params);
        return result.rowCount ?? 0;
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
        const result = await queryable.query(sql, params);
        return parseInt(String(result.rows[0]?.count ?? 0), 10);
      } catch (err) {
        wrapDbError(err);
      }
    },

    async execute<T = Record<string, unknown>>(
      query: string | object,
      params?: unknown[],
    ): Promise<T[]> {
      if (typeof query !== "string") {
        throw new Error("PostgreSQL engine only supports string queries");
      }
      try {
        const result = await queryable.query(query, params);
        return result.rows as T[];
      } catch (err) {
        wrapDbError(err);
      }
    },

    async transaction<T>(fn: (tx: Engine) => Promise<T>): Promise<T> {
      // If already in a transaction (client is set), use savepoints
      if (client) {
        const id = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await client.query(`SAVEPOINT ${id}`);
        try {
          const result = await fn(engine);
          await client.query(`RELEASE SAVEPOINT ${id}`);
          return result;
        } catch (err) {
          await client.query(`ROLLBACK TO SAVEPOINT ${id}`);
          throw err;
        }
      }

      // Top-level transaction: acquire a dedicated client from the pool
      const txClient = await pool.connect();
      try {
        await txClient.query("BEGIN");
        const txEngine = createPostgresEngineImpl(pool, dialect, txClient);
        const result = await fn(txEngine);
        await txClient.query("COMMIT");
        return result;
      } catch (err) {
        await txClient.query("ROLLBACK");
        throw err;
      } finally {
        txClient.release();
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };

  return engine;
}

/**
 * Create an {@link Engine} backed by `pg` (node-postgres).
 *
 * ```ts
 * import { Pool } from "pg";
 * import { createPostgresEngine } from "@protoutil/repo/postgres";
 *
 * const engine = createPostgresEngine({ client: new Pool({ connectionString: "..." }) });
 * ```
 */
export function createPostgresEngine(config: PostgresEngineConfig): Engine {
  const dialect: Dialect = config.dialect ?? postgres;
  return createPostgresEngineImpl(config.client, dialect);
}
