import type { DescMessage, MessageInitShape, MessageShape } from "@bufbuild/protobuf";
import type { FieldMask } from "@bufbuild/protobuf/wkt";
import type { Decl } from "@protoutil/aip/filtering";
import type { PageToken } from "@protoutil/aip/pagination";
import type { Engine } from "./engine.js";

/** A filter string (AIP-160) or a partial resource used to query the database. */
export type QueryInput<Desc extends DescMessage> = string | Partial<MessageShape<Desc>>;

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
   * Map proto field names (snake_case) to database column names.
   * Keys are proto field names, values are database column names.
   *
   * ```ts
   * { uid: "user_id", display_name: "name" }
   * ```
   */
  columnMap?: Record<string, string>;

  /**
   * The proto field name (snake_case) of the etag field. When set, the
   * repository will compute and store an etag on create and update
   * operations. Defaults to `"etag"`.
   */
  etagField?: string;

  /**
   * A {@link FieldMask} applied to the resource before calculating its
   * etag. Useful for excluding fields like `update_time` that change
   * on every write but don't represent a semantic change.
   */
  etagMask?: FieldMask;

  /**
   * Custom etag generation function. Defaults to the `etag` function
   * from `@protoutil/aip/etag`.
   */
  etag?: (schema: Desc, msg: MessageShape<Desc>) => string;

  /**
   * Default {@link FieldMask} applied to read operations (get, list).
   * Per-call `readMask` options override this. Defaults to `"*"` (all
   * fields).
   */
  defaultReadMask?: FieldMask;

  /**
   * Default {@link FieldMask} applied to update operations.
   * Per-call `updateMask` options override this. Defaults to `"*"` (all
   * fields).
   */
  defaultUpdateMask?: FieldMask;

  /** Default page size for list operations. Defaults to 30. */
  defaultPageSize?: number;

  /** Maximum page size for list operations. Defaults to 100. */
  maxPageSize?: number;

  /**
   * Additional AIP-160 filter declarations merged with the auto-generated
   * declarations from `contextDecls(schema)`. Use this to register custom
   * functions (e.g. `ago()`) or additional identifiers.
   */
  filterDecls?: Decl[];
}

export interface GetOptions {
  /**
   * A {@link FieldMask} controlling which fields are returned. Overrides
   * the repository's `defaultReadMask`. Defaults to `"*"`.
   */
  readMask?: FieldMask;

  /** Run the operation within a transaction. */
  transaction?: Engine;
}

export interface CreateOptions {
  /**
   * A {@link FieldMask} controlling which fields are returned on the
   * created resource. Overrides the repository's `defaultReadMask`.
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
   * repository's `maxPageSize`. Defaults to `defaultPageSize`.
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
   * Overrides the repository's `defaultReadMask`. Defaults to `"*"`.
   */
  readMask?: FieldMask;

  /** Run the operation within a transaction. */
  transaction?: Engine;
}

export interface UpdateOptions {
  /**
   * A {@link FieldMask} controlling which fields from the input are
   * applied to the existing resource. Overrides the repository's
   * `defaultUpdateMask`. Defaults to `"*"` (all non-OUTPUT_ONLY fields).
   */
  updateMask?: FieldMask;

  /**
   * A {@link FieldMask} controlling which fields are returned.
   * Overrides the repository's `defaultReadMask`. Defaults to `"*"`.
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
   * the repository's `defaultReadMask`. Defaults to `"*"`.
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
   * created resources. Overrides the repository's `defaultReadMask`.
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
   * `defaultUpdateMask`. Defaults to `"*"` (all non-OUTPUT_ONLY fields).
   */
  updateMask?: FieldMask;
}

export interface BatchUpdateOptions {
  /**
   * A {@link FieldMask} controlling which fields are returned.
   * Overrides the repository's `defaultReadMask`. Defaults to `"*"`.
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
