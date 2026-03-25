/**
 * Protobuf repositories for the Library API.
 *
 * Each repository wraps a database engine and provides type-safe CRUD
 * operations for a single protobuf message type. The API is identical
 * regardless of the underlying database — Shelves use Postgres while
 * Books use MongoDB.
 */
import type { DescMessage } from "@bufbuild/protobuf";
import { createRepository, type Interceptor } from "@protoutil/repo";
import { mongoEngine, postgresEngine } from "./engines.js";
import { BookSchema, ShelfSchema } from "./gen/library/v1/library_pb.js";

// --- Logging interceptor ---

/** Logs every repository operation with its duration. */
function logger<Desc extends DescMessage>(): Interceptor<Desc> {
  return (next) => async (ctx) => {
    const start = performance.now();
    try {
      const result = await next(ctx);
      console.log(
        `[repo] ${ctx.tableName}.${ctx.operation} (${(performance.now() - start).toFixed(1)}ms)`,
      );
      return result;
    } catch (err) {
      console.error(
        `[repo] ${ctx.tableName}.${ctx.operation} FAILED (${(performance.now() - start).toFixed(1)}ms)`,
        err,
      );
      throw err;
    }
  };
}

// --- Repositories ---

/** Shelf repository — backed by Postgres. */
export const shelfRepo = createRepository(ShelfSchema, {
  engine: postgresEngine,
  interceptors: [logger()],
});

/** Book repository — backed by MongoDB. */
export const bookRepo = createRepository(BookSchema, {
  engine: mongoEngine,
  interceptors: [logger()],
});
