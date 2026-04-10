import type { DescMessage, MessageInitShape, MessageShape } from "@bufbuild/protobuf";
import { create, merge } from "@bufbuild/protobuf";
import type { FieldMask } from "@bufbuild/protobuf/wkt";
import { AlreadyExistsError, NotFoundError } from "@protoutil/aip/errors";
import { etag as defaultEtagFn } from "@protoutil/aip/etag";
import {
  FieldBehavior,
  hasFieldBehavior,
  outputOnlyMask,
  validateImmutableFields,
  validateRequiredFields,
} from "@protoutil/aip/fieldbehavior";
import {
  OrderBy,
  Field as OrderByField,
  parse as parseOrderBy,
  validate as validateOrderBy,
} from "@protoutil/aip/orderby";
import { encode as encodePageToken, PageToken } from "@protoutil/aip/pagination";
import { applyFieldMask } from "@protoutil/core/wkt";
import { defaultTableName, resolveColumnMap } from "./columns.js";
import { type ContextValues, createContextValues } from "./context-values.js";
import type { Engine } from "./engine.js";
import { buildBatchFilter, buildFilter } from "./filter.js";
import { completeIdentifierKey, identifierKey, identifierPartial } from "./identifiers.js";
import { applyInterceptors, expectOperation } from "./interceptors.js";
import { clearMissingMessageFields, isWildcard, maskToColumns, WILDCARD_MASK } from "./masks.js";
import { deserializeRow, serializeMessage } from "./serialization.js";
import type {
  BatchCreateOptions,
  BatchDeleteOptions,
  BatchGetOptions,
  BatchUpdateItem,
  BatchUpdateOptions,
  CountOptions,
  CreateOptions,
  DeleteOptions,
  GetOptions,
  ListOptions,
  ListResult,
  QueryInput,
  RepositoryOptions,
  UpdateOptions,
} from "./types.js";

/**
 * A thin, database-agnostic data-access layer for a single protobuf
 * message type. Handles serialization, filtering, field masking, and
 * etag generation so callers work with strongly-typed messages.
 */
export interface Repository<Desc extends DescMessage> {
  /** The protobuf message descriptor this repository manages. */
  readonly schema: Desc;

  /** The database table or collection name. */
  readonly tableName: string;

  /**
   * Retrieve a single resource matching the query.
   *
   * @param query An AIP-160 filter string or a partial resource object.
   *              Partial objects are converted to equality filters
   *              (e.g. `{ uid: "abc" }` → `uid = "abc"`).
   * @param options Optional read mask and transaction.
   * @throws {NotFoundError} If no matching resource is found.
   */
  get(query: QueryInput<Desc>, options?: GetOptions): Promise<MessageShape<Desc>>;

  /**
   * Create a new resource. The message is serialized, an etag is
   * computed (if the schema has an etag field), and the row is
   * inserted into the database.
   *
   * @param resource The fully-formed message to insert.
   * @param options Optional read mask and transaction.
   */
  create(resource: MessageInitShape<Desc>, options?: CreateOptions): Promise<MessageShape<Desc>>;

  /**
   * List resources matching an optional query with pagination and
   * ordering support.
   *
   * @param query An AIP-160 filter string, a partial resource object,
   *              or `undefined` to match all resources.
   * @param options Pagination, ordering, read mask, and transaction.
   */
  list(query?: QueryInput<Desc>, options?: ListOptions): Promise<ListResult<Desc>>;

  /**
   * Update an existing resource. The resource is fetched, merged with
   * the update according to the update mask, and persisted. An etag
   * is recomputed if the schema has an etag field.
   *
   * @param query An AIP-160 filter string or partial resource to
   *              identify the resource to update.
   * @param resource The fields to update.
   * @param options Update mask, read mask, validateOnly, and transaction.
   * @throws {NotFoundError} If no matching resource is found.
   */
  update(
    query: QueryInput<Desc>,
    resource: MessageInitShape<Desc>,
    options?: UpdateOptions,
  ): Promise<MessageShape<Desc>>;

  /**
   * Delete a resource matching the query.
   *
   * @param query An AIP-160 filter string or partial resource to
   *              identify the resource to delete.
   * @param options Optional transaction.
   * @throws {NotFoundError} If no matching resource is found.
   */
  delete(query: QueryInput<Desc>, options?: DeleteOptions): Promise<void>;

  /**
   * Count resources matching an optional query.
   *
   * @param query An AIP-160 filter string, a partial resource object,
   *              or `undefined` to count all resources.
   * @param options Optional transaction.
   */
  count(query?: QueryInput<Desc>, options?: CountOptions): Promise<number>;

  /**
   * Retrieve multiple resources matching the given queries. All
   * resources must exist — if any is missing, a {@link NotFoundError}
   * is thrown and no partial results are returned.
   *
   * Results are returned in the same order as the input queries.
   *
   * @param queries An array of AIP-160 filter strings or partial
   *                resource objects.
   * @param options Optional read mask and transaction.
   * @throws {NotFoundError} If any matching resource is not found.
   * @see https://google.aip.dev/231
   */
  batchGet(queries: QueryInput<Desc>[], options?: BatchGetOptions): Promise<MessageShape<Desc>[]>;

  /**
   * Create multiple resources atomically. All resources are validated
   * before any writes occur. If any validation fails, no resources
   * are created.
   *
   * @param resources The fully-formed messages to insert.
   * @param options Optional read mask, validateOnly, and transaction.
   * @throws {AlreadyExistsError} If any resource with the same
   *         IDENTIFIER fields already exists.
   * @see https://google.aip.dev/233
   */
  batchCreate(
    resources: MessageInitShape<Desc>[],
    options?: BatchCreateOptions,
  ): Promise<MessageShape<Desc>[]>;

  /**
   * Update multiple existing resources atomically. Each update item
   * specifies the query to identify the resource, the fields to
   * update, and an optional per-item update mask.
   *
   * @param updates The update items, each with query, resource, and
   *                optional updateMask.
   * @param options Optional read mask, validateOnly, and transaction.
   * @throws {NotFoundError} If any resource is not found.
   * @see https://google.aip.dev/234
   */
  batchUpdate(
    updates: BatchUpdateItem<Desc>[],
    options?: BatchUpdateOptions,
  ): Promise<MessageShape<Desc>[]>;

  /**
   * Delete multiple resources atomically. All resources must exist —
   * if any is missing, a {@link NotFoundError} is thrown and no
   * resources are deleted.
   *
   * @param queries An array of AIP-160 filter strings or partial
   *                resource objects identifying the resources to delete.
   * @param options Optional validateOnly and transaction.
   * @throws {NotFoundError} If any resource is not found.
   * @see https://google.aip.dev/235
   */
  batchDelete(queries: QueryInput<Desc>[], options?: BatchDeleteOptions): Promise<void>;
}

/**
 * Create a {@link Repository} for the given protobuf message schema.
 *
 * ```ts
 * import { createRepository } from "@protoutil/repo";
 * import { createSQLiteEngine } from "@protoutil/repo/sqlite";
 * import { UserSchema } from "./gen/user_pb.js";
 *
 * const engine = createSQLiteEngine({ client: db });
 * const users = createRepository(UserSchema, { engine });
 *
 * const user = await users.get({ uid: "abc-123" });
 * ```
 */
export function createRepository<Desc extends DescMessage>(
  schema: Desc,
  opts: RepositoryOptions<Desc>,
): Repository<Desc> {
  const { engine, filterDecls, columns: columnConfigs, interceptors } = opts;
  const tableName = opts.tableName ?? defaultTableName(schema);
  const columnMap = resolveColumnMap(schema, columnConfigs);
  const defaultReadMask = opts.fieldMasks?.read ?? WILDCARD_MASK;
  const defaultPageSize = opts.pagination?.defaultSize ?? 30;
  const maxPageSize = opts.pagination?.maxSize ?? 100;
  const defaultUpdateMask = opts.fieldMasks?.update ?? WILDCARD_MASK;
  const wildcardUpdateMask = outputOnlyMask(schema);
  const etagFieldName = opts.etag?.field ?? "etag";
  const etagFieldDesc = schema.fields.find((f) => f.name === etagFieldName);
  const computeEtag = opts.etag?.fn ?? ((s: Desc, m: MessageShape<Desc>) => defaultEtagFn(s, m));
  const identifierFields = schema.fields.filter((f) =>
    hasFieldBehavior(f, FieldBehavior.IDENTIFIER),
  );
  const maskColumnsCache = new WeakMap<FieldMask, string[] | undefined>();
  const getContextValues = (options?: { contextValues?: ContextValues }) =>
    options?.contextValues ?? createContextValues();
  const getEngine = (transaction?: Engine) => transaction ?? engine;
  const buildRequiredFilter = (query: QueryInput<Desc>) =>
    buildFilter(schema, query, { columnMap, extraDecls: filterDecls });
  const buildOptionalFilter = (query?: QueryInput<Desc>) =>
    query ? buildRequiredFilter(query) : undefined;
  const columnsForMask = (mask: FieldMask) => {
    if (isWildcard(mask)) {
      return undefined;
    }
    if (maskColumnsCache.has(mask)) {
      return maskColumnsCache.get(mask);
    }
    const columns = maskToColumns(schema, mask, columnMap);
    maskColumnsCache.set(mask, columns);
    return columns;
  };
  const columnsForReadMask = (readMask: FieldMask) => columnsForMask(readMask);
  const applyReadMaskToMessage = (message: MessageShape<Desc>, readMask: FieldMask) =>
    isWildcard(readMask) ? message : applyFieldMask(schema, message, readMask, { strict: false });
  const applyReadMaskToResults = (messages: MessageShape<Desc>[], readMask: FieldMask) =>
    isWildcard(readMask)
      ? messages
      : messages.map((message) => applyFieldMask(schema, message, readMask, { strict: false }));
  const deserializeMessage = (
    row: Record<string, unknown>,
    operation: "get" | "list",
    contextValues: ContextValues,
  ) => deserializeRow(schema, row, columnMap, columnConfigs, operation, contextValues);
  const deserializeAndMask = (
    row: Record<string, unknown>,
    operation: "get" | "list",
    readMask: FieldMask,
    contextValues: ContextValues,
  ) => applyReadMaskToMessage(deserializeMessage(row, operation, contextValues), readMask);
  const deserializeManyAndMask = (
    rows: Record<string, unknown>[],
    operation: "get" | "list",
    readMask: FieldMask,
    contextValues: ContextValues,
  ) =>
    applyReadMaskToResults(
      rows.map((row) => deserializeMessage(row, operation, contextValues)),
      readMask,
    );
  const setEtag = (message: MessageShape<Desc>) => {
    if (etagFieldDesc) {
      (message as Record<string, unknown>)[etagFieldDesc.localName] = computeEtag(schema, message);
    }
  };
  const mergeForUpdate = (
    existing: MessageShape<Desc>,
    updateMessage: MessageShape<Desc>,
    updateMask: FieldMask,
    options?: { cloneExisting?: boolean },
  ) => {
    validateImmutableFields(schema, updateMessage, { fieldMask: updateMask });
    const effectiveMask = isWildcard(updateMask) ? wildcardUpdateMask : updateMask;
    const maskedUpdate = applyFieldMask(schema, updateMessage, effectiveMask, { strict: false });
    const merged = options?.cloneExisting === false ? existing : create(schema, existing);
    merge(schema, merged, maskedUpdate);
    clearMissingMessageFields(schema, merged, updateMessage, effectiveMask);
    setEtag(merged);
    return merged;
  };
  const resultsByIdentifier = (messages: MessageShape<Desc>[]) => {
    const results = new Map<string, MessageShape<Desc>>();
    for (const message of messages) {
      results.set(identifierKey(identifierFields, message as Record<string, unknown>), message);
    }
    return results;
  };
  const lookupIdentifier = (value: Record<string, unknown>) =>
    completeIdentifierKey(identifierFields, value);
  const runWithTransaction = <R>(
    transaction: Engine | undefined,
    run: (eng: Engine) => Promise<R>,
  ) => (transaction ? run(transaction) : engine.transaction((tx) => run(tx)));

  return {
    schema,
    tableName,

    async get(query: QueryInput<Desc>, options?: GetOptions): Promise<MessageShape<Desc>> {
      const contextValues = getContextValues(options);
      return applyInterceptors(
        interceptors,
        { operation: "get", schema, tableName, query, options, contextValues },
        async (ictx) => {
          const ctx = expectOperation(ictx, "get");
          const eng = getEngine(ctx.options?.transaction);
          const readMask = ctx.options?.readMask ?? defaultReadMask;

          // Build the checked filter expression
          const filter = buildRequiredFilter(ctx.query);

          // Query the database
          const row = await eng.findOne<Record<string, unknown>>({
            table: tableName,
            filter,
            columns: columnsForReadMask(readMask),
          });

          if (!row) {
            throw new NotFoundError({ message: "Resource not found." });
          }

          // Deserialize the row into a protobuf message
          return deserializeAndMask(row, "get", readMask, ctx.contextValues);
        },
      );
    },

    async create(
      resource: MessageInitShape<Desc>,
      options?: CreateOptions,
    ): Promise<MessageShape<Desc>> {
      const contextValues = getContextValues(options);
      return applyInterceptors(
        interceptors,
        { operation: "create", schema, tableName, resource, options, contextValues },
        async (ictx) => {
          const ctx = expectOperation(ictx, "create");
          const eng = getEngine(ctx.options?.transaction);
          const readMask = ctx.options?.readMask ?? defaultReadMask;

          // Create a full message from the init shape
          const msg = create(schema, ctx.resource);

          // Validate required fields per AIP-203
          validateRequiredFields(schema, msg);

          // Check for duplicate IDENTIFIER fields
          if (identifierFields.length > 0) {
            const idPartial = identifierPartial(identifierFields, msg as Record<string, unknown>);
            if (idPartial) {
              const idFilter = buildRequiredFilter(idPartial as Partial<MessageShape<Desc>>);
              const existing = await eng.findOne({ table: tableName, filter: idFilter });
              if (existing) {
                throw new AlreadyExistsError({ message: "Resource already exists." });
              }
            }
          }

          // Compute and set etag if the schema has an etag field
          setEtag(msg);

          // Serialize to a database row
          const row = serializeMessage(
            schema,
            msg,
            columnMap,
            columnConfigs,
            "create",
            ctx.contextValues,
          );

          // If validateOnly, return the prepared message without inserting
          if (ctx.options?.validateOnly) {
            return applyReadMaskToMessage(msg, readMask);
          }

          // Insert into the database
          const inserted = await eng.insertOne<Record<string, unknown>>({
            table: tableName,
            row,
          });

          // Deserialize the returned row
          return deserializeAndMask(inserted, "get", readMask, ctx.contextValues);
        },
      );
    },

    async list(query?: QueryInput<Desc>, options?: ListOptions): Promise<ListResult<Desc>> {
      const contextValues = getContextValues(options);
      return applyInterceptors(
        interceptors,
        { operation: "list", schema, tableName, query, options, contextValues },
        async (ictx) => {
          const ctx = expectOperation(ictx, "list");
          const eng = getEngine(ctx.options?.transaction);
          const readMask = ctx.options?.readMask ?? defaultReadMask;
          const pageSize = Math.min(ctx.options?.pageSize ?? defaultPageSize, maxPageSize);
          const offset = ctx.options?.pageToken?.offset ?? 0;

          // Parse, validate, and remap orderBy field names via columnMap
          let orderBy: OrderBy | undefined;
          if (ctx.options?.orderBy) {
            const parsed = parseOrderBy(ctx.options.orderBy);
            validateOrderBy(parsed, schema);
            if (columnMap) {
              orderBy = new OrderBy(
                parsed.fields.map((f) => new OrderByField(columnMap[f.path] ?? f.path, f.desc)),
              );
            } else {
              orderBy = parsed;
            }
          }

          // Build filter
          const filter = buildOptionalFilter(ctx.query);

          // Optional total count
          let totalSize: number | undefined;
          if (ctx.options?.showTotalSize) {
            totalSize = await eng.count({ table: tableName, filter });
          }

          // Fetch pageSize+1 to detect next page
          const rows = await eng.findMany<Record<string, unknown>>({
            table: tableName,
            filter,
            columns: columnsForReadMask(readMask),
            limit: pageSize + 1,
            offset,
            orderBy,
          });

          const hasMore = rows.length > pageSize;
          const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

          // Deserialize and apply read mask
          const results = deserializeManyAndMask(pageRows, "list", readMask, ctx.contextValues);

          // Next page token (preserve checksum from input token)
          const nextPageToken = hasMore
            ? encodePageToken(
                new PageToken(offset + pageSize, ctx.options?.pageToken?.requestChecksum ?? 0),
              )
            : "";

          return { results, nextPageToken, ...(totalSize !== undefined && { totalSize }) };
        },
      );
    },

    async update(
      query: QueryInput<Desc>,
      resource: MessageInitShape<Desc>,
      options?: UpdateOptions,
    ): Promise<MessageShape<Desc>> {
      const contextValues = getContextValues(options);
      return applyInterceptors(
        interceptors,
        { operation: "update", schema, tableName, query, resource, options, contextValues },
        async (ictx) => {
          const ctx = expectOperation(ictx, "update");
          const eng = getEngine(ctx.options?.transaction);
          const readMask = ctx.options?.readMask ?? defaultReadMask;
          const updateMask = ctx.options?.updateMask ?? defaultUpdateMask;
          const updateMessage = create(schema, ctx.resource);

          // Fetch existing resource
          const filter = buildRequiredFilter(ctx.query);
          const existingRow = await eng.findOne<Record<string, unknown>>({
            table: tableName,
            filter,
          });
          if (!existingRow) {
            throw new NotFoundError({ message: "Resource not found." });
          }
          const existing = deserializeMessage(existingRow, "get", ctx.contextValues);
          const merged = mergeForUpdate(existing, updateMessage, updateMask, {
            // This message was deserialized just for this update, so mutating it
            // avoids an extra protobuf create() clone without affecting callers.
            cloneExisting: false,
          });

          // validateOnly: return merged message without persisting
          if (ctx.options?.validateOnly) {
            return applyReadMaskToMessage(merged, readMask);
          }

          // Serialize only updated columns for DB
          const fullRow = serializeMessage(
            schema,
            merged,
            columnMap,
            columnConfigs,
            "update",
            ctx.contextValues,
          );
          let updateRow: Record<string, unknown>;
          if (isWildcard(updateMask)) {
            updateRow = fullRow;
          } else {
            const updateCols = new Set(columnsForMask(updateMask));
            updateRow = Object.fromEntries(
              Object.entries(fullRow).filter(([key]) => updateCols.has(key)),
            );
          }
          // Always include etag column in the update
          if (etagFieldDesc) {
            const etagCol = columnMap?.[etagFieldDesc.name] ?? etagFieldDesc.jsonName;
            updateRow[etagCol] = fullRow[etagCol];
          }

          // Execute update
          const updatedRow = await eng.updateOne<Record<string, unknown>>({
            table: tableName,
            filter,
            row: updateRow,
          });

          if (!updatedRow) {
            throw new NotFoundError({ message: "Resource not found." });
          }

          // Deserialize and apply readMask
          return deserializeAndMask(updatedRow, "get", readMask, ctx.contextValues);
        },
      );
    },

    async delete(query: QueryInput<Desc>, options?: DeleteOptions): Promise<void> {
      const contextValues = getContextValues(options);
      return applyInterceptors(
        interceptors,
        { operation: "delete", schema, tableName, query, options, contextValues },
        async (ictx) => {
          const ctx = expectOperation(ictx, "delete");
          const eng = getEngine(ctx.options?.transaction);
          const filter = buildRequiredFilter(ctx.query);

          // Verify the resource exists
          const existing = await eng.findOne({ table: tableName, filter });
          if (!existing) {
            throw new NotFoundError({ message: "Resource not found." });
          }

          // If validateOnly, return without deleting
          if (ctx.options?.validateOnly) {
            return;
          }

          await eng.deleteOne({ table: tableName, filter });
        },
      );
    },

    async count(query?: QueryInput<Desc>, options?: CountOptions): Promise<number> {
      const contextValues = getContextValues(options);
      return applyInterceptors(
        interceptors,
        { operation: "count", schema, tableName, query, options, contextValues },
        async (ictx) => {
          const ctx = expectOperation(ictx, "count");
          const eng = getEngine(ctx.options?.transaction);
          const filter = buildOptionalFilter(ctx.query);
          return eng.count({ table: tableName, filter });
        },
      );
    },

    async batchGet(
      queries: QueryInput<Desc>[],
      options?: BatchGetOptions,
    ): Promise<MessageShape<Desc>[]> {
      const contextValues = getContextValues(options);
      return applyInterceptors(
        interceptors,
        { operation: "batchGet", schema, tableName, queries, options, contextValues },
        async (ictx) => {
          const ctx = expectOperation(ictx, "batchGet");
          const readMask = ctx.options?.readMask ?? defaultReadMask;

          const run = async (e: Engine) => {
            // Combine into a single OR filter for one round-trip
            const combinedFilter = buildBatchFilter(schema, ctx.queries, {
              columnMap,
              extraDecls: filterDecls,
            });

            const columns = columnsForReadMask(readMask);

            const rows = await e.findMany<Record<string, unknown>>({
              table: tableName,
              filter: combinedFilter,
              columns,
            });

            if (rows.length < ctx.queries.length) {
              throw new NotFoundError({
                message: `${ctx.queries.length - rows.length} resource(s) not found.`,
              });
            }

            // Deserialize all rows
            const results = deserializeManyAndMask(rows, "list", readMask, ctx.contextValues);

            // Reorder results to match input query order using identifier fields
            if (identifierFields.length > 0) {
              // Build a lookup map: identifier key → result message
              const resultsByKey = resultsByIdentifier(results);

              // For each query, extract identifier values and look up
              const reordered: MessageShape<Desc>[] = [];
              for (const query of ctx.queries) {
                // Extract identifier values from the query
                let key: string | undefined;
                if (typeof query !== "string") {
                  key = identifierKey(identifierFields, query as Record<string, unknown>);
                } else {
                  // For string queries, fetch individually to find the match
                  const filter = buildRequiredFilter(query);
                  const row = await e.findOne<Record<string, unknown>>({
                    table: tableName,
                    filter,
                    columns,
                  });
                  if (!row) {
                    throw new NotFoundError({ message: "Resource not found." });
                  }
                  const msg = deserializeMessage(row, "get", ctx.contextValues);
                  key = identifierKey(identifierFields, msg as Record<string, unknown>);
                }

                const match = resultsByKey.get(key);
                if (!match) {
                  throw new NotFoundError({ message: "Resource not found." });
                }
                reordered.push(match);
              }
              return reordered;
            }

            return results;
          };

          // Wrap in transaction if none provided
          return runWithTransaction(ctx.options?.transaction, run);
        },
      );
    },

    async batchCreate(
      resources: MessageInitShape<Desc>[],
      options?: BatchCreateOptions,
    ): Promise<MessageShape<Desc>[]> {
      const contextValues = getContextValues(options);
      return applyInterceptors(
        interceptors,
        { operation: "batchCreate", schema, tableName, resources, options, contextValues },
        async (ictx) => {
          const ctx = expectOperation(ictx, "batchCreate");
          const readMask = ctx.options?.readMask ?? defaultReadMask;

          const run = async (e: Engine) => {
            // Phase 1: Validate all resources
            const messages = ctx.resources.map((r) => create(schema, r));
            for (const msg of messages) {
              validateRequiredFields(schema, msg);
            }

            // Phase 2: Check for duplicate IDENTIFIER fields
            if (identifierFields.length > 0) {
              const idQueries: Partial<MessageShape<Desc>>[] = [];
              for (const msg of messages) {
                const idPartial = identifierPartial(
                  identifierFields,
                  msg as Record<string, unknown>,
                );
                if (idPartial) {
                  idQueries.push(idPartial as Partial<MessageShape<Desc>>);
                }
              }
              if (idQueries.length > 0) {
                const combinedFilter = buildBatchFilter(schema, idQueries, {
                  columnMap,
                  extraDecls: filterDecls,
                });
                const existing = await e.findMany({ table: tableName, filter: combinedFilter });
                if (existing.length > 0) {
                  throw new AlreadyExistsError({ message: "One or more resources already exist." });
                }
              }
            }

            // Phase 3: Compute etags
            for (const msg of messages) {
              setEtag(msg);
            }

            // Phase 4: Serialize all rows
            const rows = messages.map((msg) =>
              serializeMessage(schema, msg, columnMap, columnConfigs, "create", ctx.contextValues),
            );

            // If validateOnly, return prepared messages
            if (ctx.options?.validateOnly) {
              return applyReadMaskToResults(messages, readMask);
            }

            // Phase 5: Bulk insert
            const insertedRows = await e.insertMany<Record<string, unknown>>({
              table: tableName,
              rows,
            });

            // Deserialize and apply readMask
            return deserializeManyAndMask(insertedRows, "list", readMask, ctx.contextValues);
          };

          return runWithTransaction(ctx.options?.transaction, run);
        },
      );
    },

    async batchUpdate(
      updates: BatchUpdateItem<Desc>[],
      options?: BatchUpdateOptions,
    ): Promise<MessageShape<Desc>[]> {
      const contextValues = getContextValues(options);
      return applyInterceptors(
        interceptors,
        { operation: "batchUpdate", schema, tableName, updates, options, contextValues },
        async (ictx) => {
          const ctx = expectOperation(ictx, "batchUpdate");
          const readMask = ctx.options?.readMask ?? defaultReadMask;

          const run = async (e: Engine) => {
            // Phase 1: Fetch all existing resources in one round-trip
            const queries = ctx.updates.map((u) => u.query);
            const combinedFilter = buildBatchFilter(schema, queries, {
              columnMap,
              extraDecls: filterDecls,
            });

            const existingRows = await e.findMany<Record<string, unknown>>({
              table: tableName,
              filter: combinedFilter,
            });

            if (existingRows.length < ctx.updates.length) {
              throw new NotFoundError({
                message: `${ctx.updates.length - existingRows.length} resource(s) not found.`,
              });
            }

            // Build a lookup map from identifier fields
            const existingMessages = existingRows.map((row) =>
              deserializeMessage(row, "list", ctx.contextValues),
            );
            const existingByKey = resultsByIdentifier(existingMessages);

            // Phase 2: Merge each update with its existing resource
            const merged: MessageShape<Desc>[] = [];
            for (const update of ctx.updates) {
              const updateMask = update.updateMask ?? defaultUpdateMask;
              const updateMessage = create(schema, update.resource);
              // Find the matching existing resource
              let existing: MessageShape<Desc> | undefined;
              if (identifierFields.length > 0) {
                // Match by identifiers from the query first. This avoids
                // per-item round-trips when the patch itself omits identifier fields.
                if (typeof update.query !== "string") {
                  const queryKey = lookupIdentifier(update.query as Record<string, unknown>);
                  if (queryKey) {
                    existing = existingByKey.get(queryKey);
                  }
                }
                if (!existing) {
                  const updateKey = lookupIdentifier(updateMessage as Record<string, unknown>);
                  if (updateKey) {
                    existing = existingByKey.get(updateKey);
                  }
                }
              }
              if (!existing) {
                // Fall back to filter-based matching
                const filter = buildRequiredFilter(update.query);
                const row = await e.findOne<Record<string, unknown>>({ table: tableName, filter });
                if (!row) {
                  throw new NotFoundError({ message: "Resource not found." });
                }
                existing = deserializeMessage(row, "get", ctx.contextValues);
              }
              merged.push(mergeForUpdate(existing, updateMessage, updateMask));
            }

            // If validateOnly, return merged messages
            if (ctx.options?.validateOnly) {
              return applyReadMaskToResults(merged, readMask);
            }

            // Phase 3: Bulk replace
            const fullRows = merged.map((msg) =>
              serializeMessage(schema, msg, columnMap, columnConfigs, "update", ctx.contextValues),
            );
            const keyColumns = identifierFields.map((f) => columnMap?.[f.name] ?? f.jsonName);

            const updatedRows = await e.replaceMany<Record<string, unknown>>({
              table: tableName,
              rows: fullRows,
              keyColumns,
            });

            if (updatedRows.length < ctx.updates.length) {
              throw new NotFoundError({
                message: `${ctx.updates.length - updatedRows.length} resource(s) not found.`,
              });
            }

            // Deserialize and apply readMask, reorder to match input order
            const results = deserializeManyAndMask(
              updatedRows,
              "list",
              readMask,
              ctx.contextValues,
            );

            // Reorder to match input order
            if (identifierFields.length > 0) {
              const resultsByKey = resultsByIdentifier(results);
              return merged.map((msg) => {
                const key = identifierKey(identifierFields, msg as Record<string, unknown>);
                return resultsByKey.get(key) ?? msg;
              });
            }

            return results;
          };

          return runWithTransaction(ctx.options?.transaction, run);
        },
      );
    },

    async batchDelete(queries: QueryInput<Desc>[], options?: BatchDeleteOptions): Promise<void> {
      const contextValues = getContextValues(options);
      return applyInterceptors(
        interceptors,
        { operation: "batchDelete", schema, tableName, queries, options, contextValues },
        async (ictx) => {
          const ctx = expectOperation(ictx, "batchDelete");

          const run = async (e: Engine) => {
            // Verify all resources exist
            const combinedFilter = buildBatchFilter(schema, ctx.queries, {
              columnMap,
              extraDecls: filterDecls,
            });

            const existing = await e.findMany({ table: tableName, filter: combinedFilter });
            if (existing.length < ctx.queries.length) {
              throw new NotFoundError({
                message: `${ctx.queries.length - existing.length} resource(s) not found.`,
              });
            }

            if (ctx.options?.validateOnly) {
              return;
            }

            const deleted = await e.deleteMany({ table: tableName, filter: combinedFilter });
            if (deleted < ctx.queries.length) {
              throw new NotFoundError({
                message: `${ctx.queries.length - deleted} resource(s) not found.`,
              });
            }
          };

          return runWithTransaction(ctx.options?.transaction, run);
        },
      );
    },
  };
}
