import type { DescMessage, MessageInitShape, MessageShape } from "@bufbuild/protobuf";
import type { FieldMask } from "@bufbuild/protobuf/wkt";
import type { Decl } from "@protoutil/aip/filtering";
import type { PageToken } from "@protoutil/aip/pagination";
import type { Engine } from "./engine.js";

/** A filter string (AIP-160) or a partial resource used to query the database. */
export type QueryInput<Desc extends DescMessage> = string | Partial<MessageShape<Desc>>;

/**
 * Per-field configuration for database column behavior.
 *
 * Keys in the `columns` record are proto field names (snake_case).
 *
 * ```ts
 * const repo = createRepository(UserSchema, {
 *   engine,
 *   columns: {
 *     uid: { name: "user_id" },
 *     computed_score: { ignore: true },
 *     settings: { serialize: "json" },
 *     create_time: { timestamp: "create" },
 *     update_time: { timestamp: "update" },
 *   },
 * });
 * ```
 */
export interface ColumnConfig {
  /**
   * Override the database column name for this field. Defaults to
   * the field's JSON name (camelCase).
   *
   * ```ts
   * { name: "user_id" }  // proto field "uid" → DB column "user_id"
   * ```
   */
  name?: string;

  /**
   * When `true`, the field is excluded from database serialization
   * entirely. On reads, the field will have its proto3 default value.
   *
   * Useful for fields that exist in the proto schema but have no
   * corresponding database column (e.g. computed or virtual fields).
   */
  ignore?: boolean;

  /**
   * Serialize nested messages or repeated fields for storage in a
   * single database column.
   *
   * - `"json"` — uses `toJsonString` / `fromJsonString` from
   *   `@bufbuild/protobuf` for human-readable JSON storage.
   * - `"binary"` — uses `toBinary` / `fromBinary` from
   *   `@bufbuild/protobuf` for compact binary storage.
   */
  serialize?: "json" | "binary";

  /**
   * Auto-populate this `google.protobuf.Timestamp` field on the
   * specified lifecycle event using `timestampNow()`.
   *
   * - `"create"` — set on `create` and `batchCreate` only.
   * - `"update"` — set on `create`, `batchCreate`, `update`, and
   *   `batchUpdate`.
   */
  timestamp?: "create" | "update";
}

/** Base fields shared by every {@link InterceptorContext} variant. */
interface InterceptorContextBase<Desc extends DescMessage> {
  /** The proto schema this repository manages. */
  schema: Desc;
  /** The database table or collection name. */
  tableName: string;
}

/**
 * Context passed to each {@link Interceptor} in the chain.
 *
 * This is a discriminated union keyed on `operation`. Narrowing on
 * `ctx.operation` gives access to the operation-specific fields
 * (`query`, `resource`, `options`, etc.).
 */
export type InterceptorContext<Desc extends DescMessage> =
  | (InterceptorContextBase<Desc> & {
      operation: "get";
      query: QueryInput<Desc>;
      options?: GetOptions;
    })
  | (InterceptorContextBase<Desc> & {
      operation: "create";
      resource: MessageInitShape<Desc>;
      options?: CreateOptions;
    })
  | (InterceptorContextBase<Desc> & {
      operation: "list";
      query?: QueryInput<Desc>;
      options?: ListOptions;
    })
  | (InterceptorContextBase<Desc> & {
      operation: "update";
      query: QueryInput<Desc>;
      resource: MessageInitShape<Desc>;
      options?: UpdateOptions;
    })
  | (InterceptorContextBase<Desc> & {
      operation: "delete";
      query: QueryInput<Desc>;
      options?: DeleteOptions;
    })
  | (InterceptorContextBase<Desc> & {
      operation: "count";
      query?: QueryInput<Desc>;
      options?: CountOptions;
    })
  | (InterceptorContextBase<Desc> & {
      operation: "batchGet";
      queries: QueryInput<Desc>[];
      options?: BatchGetOptions;
    })
  | (InterceptorContextBase<Desc> & {
      operation: "batchCreate";
      resources: MessageInitShape<Desc>[];
      options?: BatchCreateOptions;
    })
  | (InterceptorContextBase<Desc> & {
      operation: "batchUpdate";
      updates: BatchUpdateItem<Desc>[];
      options?: BatchUpdateOptions;
    })
  | (InterceptorContextBase<Desc> & {
      operation: "batchDelete";
      queries: QueryInput<Desc>[];
      options?: BatchDeleteOptions;
    });

/**
 * The inner function that an {@link Interceptor} wraps.
 */
export type InterceptorFn<Desc extends DescMessage> = (
  ctx: InterceptorContext<Desc>,
) => Promise<unknown>;

/**
 * A connectrpc-style interceptor for repository operations.
 *
 * Interceptors form a middleware chain around every repository method.
 * Each interceptor receives a `next` function and returns a new function
 * that can run logic before and/or after calling `next`.
 *
 * ```ts
 * const logger: Interceptor<any> = (next) => async (ctx) => {
 *   const start = performance.now();
 *   try {
 *     const result = await next(ctx);
 *     console.log(`${ctx.operation}: ${performance.now() - start}ms`);
 *     return result;
 *   } catch (err) {
 *     console.error(`${ctx.operation} failed:`, err);
 *     throw err;
 *   }
 * };
 *
 * // Narrowing on operation:
 * const auditor: Interceptor<any> = (next) => async (ctx) => {
 *   if (ctx.operation === "create") {
 *     console.log("Creating resource:", ctx.resource);
 *   }
 *   return next(ctx);
 * };
 * ```
 */
export type Interceptor<Desc extends DescMessage> = (
  next: InterceptorFn<Desc>,
) => InterceptorFn<Desc>;

export interface RepositoryOptions<Desc extends DescMessage> {
  /** The database engine to use. */
  engine: Engine;

  /**
   * Override the database table name. Defaults to the proto message's
   * full type name converted to snake_case (e.g.
   * `protoutil.repo.v1.TestUser` → `protoutil_repo_v1_test_user`).
   */
  tableName?: string;

  /**
   * Per-field column configuration. Keys are proto field names
   * (snake_case). See {@link ColumnConfig} for available options.
   *
   * ```ts
   * columns: {
   *   uid: { name: "user_id" },
   *   display_name: { name: "name" },
   *   settings: { serialize: "json" },
   *   create_time: { timestamp: "create" },
   * }
   * ```
   */
  columns?: Record<string, ColumnConfig>;

  /**
   * Additional AIP-160 filter declarations merged with the auto-generated
   * declarations from `contextDecls(schema)`. Use this to register custom
   * functions (e.g. `ago()`) or additional identifiers.
   */
  filterDecls?: Decl[];

  /**
   * Interceptors applied to every repository operation. Forms a
   * middleware chain in array order (first interceptor is outermost).
   * See {@link Interceptor} for the function signature.
   *
   * ```ts
   * interceptors: [loggingInterceptor, otelInterceptor]
   * ```
   */
  interceptors?: Interceptor<Desc>[];

  /**
   * Etag configuration. When the proto schema has an etag field,
   * the repository computes and stores etags on create and update.
   *
   * ```ts
   * etag: {
   *   field: "etag",
   *   mask: fieldMask(MySchema, ["update_time"]),
   *   fn: (schema, msg) => customEtag(schema, msg),
   * }
   * ```
   */
  etag?: {
    /**
     * Proto field name (snake_case) of the etag field. Defaults to
     * `"etag"`.
     */
    field?: string;

    /**
     * A {@link FieldMask} applied to the resource before calculating
     * its etag. Useful for excluding fields like `update_time` that
     * change on every write but don't represent a semantic change.
     */
    mask?: FieldMask;

    /**
     * Custom etag generation function. Defaults to the `etag`
     * function from `@protoutil/aip/etag`.
     */
    fn?: (schema: Desc, msg: MessageShape<Desc>) => string;
  };

  /**
   * Pagination defaults for list operations.
   *
   * ```ts
   * pagination: { defaultSize: 25, maxSize: 200 }
   * ```
   */
  pagination?: {
    /** Default number of results per page. Defaults to 30. */
    defaultSize?: number;

    /** Maximum allowed page size. Defaults to 100. */
    maxSize?: number;
  };

  /**
   * Default field masks applied to operations when no per-call mask
   * is provided.
   *
   * ```ts
   * fieldMasks: {
   *   read: fieldMask(MySchema, ["uid", "display_name", "email"]),
   *   update: fieldMask(MySchema, ["display_name", "email"]),
   * }
   * ```
   */
  fieldMasks?: {
    /**
     * Default {@link FieldMask} for read operations (get, list).
     * Per-call `readMask` overrides this. Defaults to `"*"` (all fields).
     */
    read?: FieldMask;

    /**
     * Default {@link FieldMask} for update operations.
     * Per-call `updateMask` overrides this. Defaults to `"*"` (all fields).
     */
    update?: FieldMask;
  };
}

export interface GetOptions {
  /**
   * A {@link FieldMask} controlling which fields are returned. Overrides
   * the repository's default read mask. Defaults to `"*"`.
   */
  readMask?: FieldMask;

  /** Run the operation within a transaction. */
  transaction?: Engine;
}

export interface CreateOptions {
  /**
   * A {@link FieldMask} controlling which fields are returned on the
   * created resource. Overrides the repository's default read mask.
   * Defaults to `"*"`.
   */
  readMask?: FieldMask;

  /**
   * If `true`, the resource is validated but not persisted. The
   * returned message reflects what would have been created (including
   * the computed etag), but no database write occurs.
   *
   * @see https://google.aip.dev/163
   */
  validateOnly?: boolean;

  /** Run the operation within a transaction. */
  transaction?: Engine;
}

export interface ListOptions {
  /**
   * Maximum number of results to return per page. Clamped to the
   * repository's `maxSize`. Defaults to `defaultSize`.
   */
  pageSize?: number;

  /**
   * A {@link PageToken} for offset-based pagination. Obtain this by
   * calling `parse()` from `@protoutil/aip/pagination` on the raw
   * page token string from the client request.
   */
  pageToken?: PageToken;

  /**
   * An AIP-132 order_by string (e.g. `"age desc, display_name"`).
   * Fields are validated against the proto schema.
   */
  orderBy?: string;

  /**
   * When `true`, the result includes a `totalSize` field with the
   * total number of matching resources (before pagination).
   */
  showTotalSize?: boolean;

  /**
   * A {@link FieldMask} controlling which fields are returned.
   * Overrides the repository's default read mask. Defaults to `"*"`.
   */
  readMask?: FieldMask;

  /** Run the operation within a transaction. */
  transaction?: Engine;
}

export interface UpdateOptions {
  /**
   * A {@link FieldMask} controlling which fields from the input are
   * applied to the existing resource. Overrides the repository's
   * default update mask. Defaults to `"*"` (all non-OUTPUT_ONLY fields).
   */
  updateMask?: FieldMask;

  /**
   * A {@link FieldMask} controlling which fields are returned.
   * Overrides the repository's default read mask. Defaults to `"*"`.
   */
  readMask?: FieldMask;

  /**
   * If `true`, the resource is validated and merged but not persisted.
   * The returned message reflects what would have been updated
   * (including the recomputed etag), but no database write occurs.
   *
   * @see https://google.aip.dev/163
   */
  validateOnly?: boolean;

  /** Run the operation within a transaction. */
  transaction?: Engine;
}

export interface DeleteOptions {
  /**
   * If `true`, the resource is validated for existence but not deleted.
   * No database mutation occurs.
   *
   * @see https://google.aip.dev/163
   */
  validateOnly?: boolean;

  /** Run the operation within a transaction. */
  transaction?: Engine;
}

export interface CountOptions {
  /** Run the operation within a transaction. */
  transaction?: Engine;
}

export interface BatchGetOptions {
  /**
   * A {@link FieldMask} controlling which fields are returned. Overrides
   * the repository's default read mask. Defaults to `"*"`.
   */
  readMask?: FieldMask;

  /**
   * Run the operation within a transaction. When provided, the batch
   * operation participates in the caller's transaction rather than
   * opening a new one. The caller is responsible for committing or
   * rolling back.
   */
  transaction?: Engine;
}

export interface BatchCreateOptions {
  /**
   * A {@link FieldMask} controlling which fields are returned on the
   * created resources. Overrides the repository's default read mask.
   * Defaults to `"*"`.
   */
  readMask?: FieldMask;

  /**
   * If `true`, all resources are validated but not persisted. The
   * returned messages reflect what would have been created (including
   * computed etags), but no database writes occur.
   *
   * @see https://google.aip.dev/163
   */
  validateOnly?: boolean;

  /**
   * Run the operation within a transaction. When provided, the batch
   * operation participates in the caller's transaction rather than
   * opening a new one. The caller is responsible for committing or
   * rolling back.
   */
  transaction?: Engine;
}

export interface BatchUpdateItem<Desc extends DescMessage> {
  /** An AIP-160 filter string or partial resource identifying the resource to update. */
  query: QueryInput<Desc>;

  /** The fields to update. */
  resource: MessageInitShape<Desc>;

  /**
   * A {@link FieldMask} controlling which fields from the input are
   * applied to the existing resource. Overrides the repository's
   * default update mask. Defaults to `"*"` (all non-OUTPUT_ONLY fields).
   */
  updateMask?: FieldMask;
}

export interface BatchUpdateOptions {
  /**
   * A {@link FieldMask} controlling which fields are returned.
   * Overrides the repository's default read mask. Defaults to `"*"`.
   */
  readMask?: FieldMask;

  /**
   * If `true`, all resources are validated and merged but not persisted.
   * The returned messages reflect what would have been updated
   * (including recomputed etags), but no database writes occur.
   *
   * @see https://google.aip.dev/163
   */
  validateOnly?: boolean;

  /**
   * Run the operation within a transaction. When provided, the batch
   * operation participates in the caller's transaction rather than
   * opening a new one. The caller is responsible for committing or
   * rolling back.
   */
  transaction?: Engine;
}

export interface BatchDeleteOptions {
  /**
   * If `true`, all resources are validated for existence but not deleted.
   * No database mutations occur.
   *
   * @see https://google.aip.dev/163
   */
  validateOnly?: boolean;

  /**
   * Run the operation within a transaction. When provided, the batch
   * operation participates in the caller's transaction rather than
   * opening a new one. The caller is responsible for committing or
   * rolling back.
   */
  transaction?: Engine;
}

export interface ListResult<Desc extends DescMessage> {
  /** The page of results. */
  results: MessageShape<Desc>[];

  /**
   * An opaque page token for fetching the next page. Empty string
   * when there are no more results.
   */
  nextPageToken: string;

  /**
   * Total number of matching resources (before pagination). Only
   * present when `showTotalSize` was set to `true`.
   */
  totalSize?: number;
}
