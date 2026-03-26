import {
  AlreadyExistsError,
  FailedPreconditionError,
  InternalError,
  InvalidArgumentError,
} from "@protoutil/aip/errors";
import type { CheckedExpr } from "@protoutil/aip/filtering";
import type { OrderBy } from "@protoutil/aip/orderby";
import type { MongoOutput } from "@protoutil/aipql";
import { mongo } from "@protoutil/aipql";
import type {
  AnyBulkWriteOperation,
  ClientSession,
  Document,
  MongoClient,
  OptionalId,
  Sort,
  UpdateFilter,
} from "mongodb";
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

type MongoDocument = Record<string, unknown>;
type MongoProjection = Record<string, 0 | 1>;
type MongoSort = Sort;

export interface MongoDBEngineConfig {
  /** A `mongodb` {@link MongoClient} instance. */
  client: MongoClient;

  /** Database name passed to `client.db(name)`. */
  database: string;

  /**
   * Override the default dialect used to translate AIP-160 filter
   * expressions into MongoDB filters. Defaults to `@protoutil/aipql`'s
   * `mongo` function.
   *
   * ```ts
   * import { mongo } from "@protoutil/aipql";
   *
   * const engine = createMongoDBEngine({
   *   client,
   *   database: "app",
   *   dialect: (expr) => mongo(expr, { functions: { fuzzy: myHandler } }),
   * });
   * ```
   */
  dialect?: Dialect;
}

function wrapDbError(err: unknown): never {
  if (!(err instanceof Error)) {
    throw new InternalError({ message: String(err) });
  }

  const code = (err as { code?: number | string }).code;
  const msg = err.message;

  switch (code) {
    case 11000:
      throw new AlreadyExistsError({
        message: msg,
        debugInfo: { detail: msg },
      });
    case 121:
    case 2:
    case "BadValue":
      throw new InvalidArgumentError({
        message: msg,
        debugInfo: { detail: msg },
      });
    case 66:
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

function translateFilter(dialect: Dialect, filter: CheckedExpr): MongoOutput {
  return dialect(filter) as MongoOutput;
}

function buildProjection(columns?: string[]): MongoProjection | undefined {
  if (!columns?.length) {
    return undefined;
  }

  const projection = Object.fromEntries(
    columns.map((column) => [column, 1] as const),
  ) as MongoProjection;
  if (!columns.includes("_id")) {
    projection._id = 0;
  }
  return projection;
}

function buildSort(orderBy?: OrderBy): MongoSort | undefined {
  if (!orderBy?.fields.length) {
    return undefined;
  }

  return Object.fromEntries(
    orderBy.fields.map((field) => [field.path, field.desc ? -1 : 1] as const),
  ) as MongoSort;
}

function normalizeUpdateResult(
  result: Document | { value: Document | null } | null,
): Document | undefined {
  if (result == null) {
    return undefined;
  }
  if (typeof result === "object" && "value" in result) {
    return result.value ?? undefined;
  }
  return result;
}

function normalizeCommandResult<T>(result: unknown): T[] {
  if (result == null) {
    return [];
  }
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (typeof result === "object") {
    const maybeCursor = (result as { cursor?: { firstBatch?: unknown } }).cursor;
    if (maybeCursor && Array.isArray(maybeCursor.firstBatch)) {
      return maybeCursor.firstBatch as T[];
    }
    const maybeDocuments = (result as { documents?: unknown }).documents;
    if (Array.isArray(maybeDocuments)) {
      return maybeDocuments as T[];
    }
  }
  return [result as T];
}

function createMongoDBEngineImpl(
  client: MongoClient,
  databaseName: string,
  dialect: Dialect,
  session?: ClientSession,
): Engine {
  const db = client.db(databaseName);

  const engine: Engine = {
    dialect,
    maxParams: Infinity,

    async findOne<T = Record<string, unknown>>(opts: EngineFindOptions): Promise<T | undefined> {
      try {
        const filter = opts.filter ? translateFilter(dialect, opts.filter).filter : {};
        const projection = buildProjection(opts.columns);
        const result = await db.collection<Document>(opts.table).findOne(filter, {
          projection,
          session,
        });
        return result == null ? undefined : (result as T);
      } catch (err) {
        wrapDbError(err);
      }
    },

    async findMany<T = Record<string, unknown>>(opts: EngineFindOptions): Promise<T[]> {
      if (opts.limit != null && (!Number.isInteger(opts.limit) || opts.limit < 0)) {
        throw new InvalidArgumentError({ message: "limit must be a non-negative integer" });
      }
      if (opts.offset != null && (!Number.isInteger(opts.offset) || opts.offset < 0)) {
        throw new InvalidArgumentError({ message: "offset must be a non-negative integer" });
      }
      try {
        const filter = opts.filter ? translateFilter(dialect, opts.filter).filter : {};
        const projection = buildProjection(opts.columns);
        let cursor = db.collection<Document>(opts.table).find(filter, {
          projection,
          session,
        });
        const sort = buildSort(opts.orderBy);
        if (sort) {
          cursor = cursor.sort(sort);
        }
        if (opts.offset != null) {
          cursor = cursor.skip(opts.offset);
        }
        if (opts.limit != null) {
          cursor = cursor.limit(opts.limit);
        }
        return (await cursor.toArray()) as T[];
      } catch (err) {
        wrapDbError(err);
      }
    },

    async insertOne<T = Record<string, unknown>>(opts: EngineInsertOptions): Promise<T> {
      try {
        const doc: MongoDocument = { ...opts.row };
        const collection = db.collection<Document>(opts.table);
        const result = await collection.insertOne(doc as OptionalId<Document>, { session });

        if (result.insertedId !== undefined) {
          const inserted = await collection.findOne({ _id: result.insertedId }, { session });
          if (inserted) {
            return inserted as T;
          }
        }

        if (result.insertedId !== undefined && doc._id === undefined) {
          doc._id = result.insertedId;
        }

        return doc as T;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async updateOne<T = Record<string, unknown>>(
      opts: EngineUpdateOptions,
    ): Promise<T | undefined> {
      try {
        const filter = translateFilter(dialect, opts.filter).filter;
        const result = await db
          .collection<Document>(opts.table)
          .findOneAndUpdate(filter, { $set: { ...opts.row } } as UpdateFilter<Document>, {
            returnDocument: "after",
            session,
          });
        return normalizeUpdateResult(result) as T | undefined;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async deleteOne(opts: EngineDeleteOptions): Promise<boolean> {
      try {
        const filter = translateFilter(dialect, opts.filter).filter;
        const result = await db.collection(opts.table).deleteOne(filter, { session });
        return (result.deletedCount ?? 0) > 0;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async insertMany<T = Record<string, unknown>>(opts: EngineInsertManyOptions): Promise<T[]> {
      if (opts.rows.length === 0) return [];
      try {
        const collection = db.collection<Document>(opts.table);
        const docs = opts.rows.map((row) => ({ ...row })) as OptionalId<Document>[];
        const result = await collection.insertMany(docs, { session });

        // Fetch back all inserted documents by their _ids
        const ids = Object.values(result.insertedIds);
        const inserted = await collection.find({ _id: { $in: ids } }, { session }).toArray();
        return inserted as T[];
      } catch (err) {
        wrapDbError(err);
      }
    },

    async replaceMany<T = Record<string, unknown>>(opts: EngineReplaceManyOptions): Promise<T[]> {
      if (opts.rows.length === 0) return [];
      try {
        const collection = db.collection<Document>(opts.table);

        // Build bulkWrite operations — replaceOne per row
        const ops: AnyBulkWriteOperation<Document>[] = opts.rows.map((row) => {
          const filter = Object.fromEntries(opts.keyColumns.map((kc) => [kc, row[kc]]));
          return {
            replaceOne: {
              filter,
              replacement: { ...row } as Document,
              upsert: false,
            },
          };
        });

        await collection.bulkWrite(ops, { session });

        // Fetch back all updated documents
        const orFilters = opts.rows.map((row) =>
          Object.fromEntries(opts.keyColumns.map((kc) => [kc, row[kc]])),
        );
        const results = await collection.find({ $or: orFilters }, { session }).toArray();
        return results as T[];
      } catch (err) {
        wrapDbError(err);
      }
    },

    async deleteMany(opts: EngineDeleteManyOptions): Promise<number> {
      try {
        const filter = translateFilter(dialect, opts.filter).filter;
        const result = await db.collection(opts.table).deleteMany(filter, { session });
        return result.deletedCount ?? 0;
      } catch (err) {
        wrapDbError(err);
      }
    },

    async count(opts: EngineCountOptions): Promise<number> {
      try {
        const filter = opts.filter ? translateFilter(dialect, opts.filter).filter : {};
        return await db.collection(opts.table).countDocuments(filter, { session });
      } catch (err) {
        wrapDbError(err);
      }
    },

    async execute<T = Record<string, unknown>>(
      query: string | object,
      _params?: unknown[],
    ): Promise<T[]> {
      if (typeof query === "string") {
        throw new Error("MongoDB engine only supports object queries");
      }
      try {
        const result = await db.command(query as MongoDocument, { session });
        return normalizeCommandResult<T>(result);
      } catch (err) {
        wrapDbError(err);
      }
    },

    async transaction<T>(fn: (tx: Engine) => Promise<T>): Promise<T> {
      if (session) {
        throw new FailedPreconditionError({
          message: "MongoDB engine does not support nested transactions.",
        });
      }

      const txSession = await client.startSession();
      try {
        const txEngine = createMongoDBEngineImpl(client, databaseName, dialect, txSession);
        return await txSession.withTransaction(() => fn(txEngine));
      } finally {
        await txSession.endSession();
      }
    },

    async close(): Promise<void> {
      await client.close();
    },
  };

  return engine;
}

/**
 * Create an {@link Engine} backed by MongoDB.
 *
 * ```ts
 * import { MongoClient } from "mongodb";
 * import { createMongoDBEngine } from "@protoutil/repo/mongodb";
 *
 * const client = new MongoClient("mongodb://localhost:27017");
 * await client.connect();
 *
 * const engine = createMongoDBEngine({ client, database: "app" });
 * ```
 */
export function createMongoDBEngine(config: MongoDBEngineConfig): Engine {
  const dialect: Dialect = config.dialect ?? mongo;
  return createMongoDBEngineImpl(config.client, config.database, dialect);
}
