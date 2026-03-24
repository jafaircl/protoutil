import type { DescMessage, MessageInitShape, MessageShape } from "@bufbuild/protobuf";
import { clone, create, merge } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
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
import type { Engine } from "./engine.js";
import { buildBatchFilter, buildFilter } from "./filter.js";
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

/** Wildcard field mask — selects all fields. */
const WILDCARD_MASK = create(FieldMaskSchema, { paths: ["*"] });

function isWildcard(mask: { paths: string[] }): boolean {
  return mask.paths.length === 1 && mask.paths[0] === "*";
}

/**
 * Derive a default table name from the proto message's full type name.
 * Dots become underscores, CamelCase becomes snake_case.
 *
 * `protoutil.repo.v1.TestUser` → `protoutil_repo_v1_test_user`
 */
function defaultTableName(schema: DescMessage): string {
  return schema.typeName
    .replace(/\./g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * Map a FieldMask's proto field paths to database column names using
 * the columnMap, falling back to the proto field's `jsonName`.
 */
function maskToColumns(
  schema: DescMessage,
  mask: { paths: string[] },
  columnMap?: Record<string, string>,
): string[] {
  const columns: string[] = [];
  for (const path of mask.paths) {
    const field = schema.fields.find((f) => f.name === path);
    if (field) {
      columns.push(columnMap?.[field.name] ?? field.jsonName);
    }
  }
  return columns;
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
  const { engine, columnMap, filterDecls } = opts;
  const tableName = opts.tableName ?? defaultTableName(schema);
  const defaultReadMask = opts.defaultReadMask ?? WILDCARD_MASK;
  const defaultPageSize = opts.defaultPageSize ?? 30;
  const maxPageSize = opts.maxPageSize ?? 100;
  const defaultUpdateMask = opts.defaultUpdateMask ?? WILDCARD_MASK;
  const etagFieldName = opts.etagField ?? "etag";
  const etagFieldDesc = schema.fields.find((f) => f.name === etagFieldName);
  const computeEtag =
    opts.etag ??
    ((s: Desc, m: MessageShape<Desc>) =>
      defaultEtagFn(s, m, opts.etagMask ? { fieldMask: opts.etagMask } : undefined));
  const identifierFields = schema.fields.filter((f) =>
    hasFieldBehavior(f, FieldBehavior.IDENTIFIER),
  );

  return {
    schema,
    tableName,

    async get(query: QueryInput<Desc>, options?: GetOptions): Promise<MessageShape<Desc>> {
      const eng: Engine = options?.transaction ?? engine;
      const readMask = options?.readMask ?? defaultReadMask;

      // Build the checked filter expression
      const filter = buildFilter(schema, query, {
        columnMap,
        extraDecls: filterDecls,
      });

      // Determine columns to select
      const columns = isWildcard(readMask) ? undefined : maskToColumns(schema, readMask, columnMap);

      // Query the database
      const row = await eng.findOne<Record<string, unknown>>({
        table: tableName,
        filter,
        columns,
      });

      if (!row) {
        throw new NotFoundError({ message: "Resource not found." });
      }

      // Deserialize the row into a protobuf message
      let message = deserializeRow(schema, row, columnMap);

      // Apply read mask if not wildcard
      if (!isWildcard(readMask)) {
        message = applyFieldMask(schema, message, readMask, { strict: false });
      }

      return message;
    },

    async create(
      resource: MessageInitShape<Desc>,
      options?: CreateOptions,
    ): Promise<MessageShape<Desc>> {
      const eng: Engine = options?.transaction ?? engine;
      const readMask = options?.readMask ?? defaultReadMask;

      // Create a full message from the init shape
      const msg = create(schema, resource);

      // Validate required fields per AIP-203
      validateRequiredFields(schema, msg);

      // Check for duplicate IDENTIFIER fields
      if (identifierFields.length > 0) {
        const idPartial: Record<string, unknown> = {};
        let hasId = false;
        for (const f of identifierFields) {
          const val = (msg as Record<string, unknown>)[f.localName];
          if (val !== undefined && val !== "" && val !== 0 && val !== false) {
            idPartial[f.localName] = val;
            hasId = true;
          }
        }
        if (hasId) {
          const idFilter = buildFilter(schema, idPartial as Partial<MessageShape<Desc>>, {
            columnMap,
            extraDecls: filterDecls,
          });
          const existing = await eng.findOne({ table: tableName, filter: idFilter });
          if (existing) {
            throw new AlreadyExistsError({ message: "Resource already exists." });
          }
        }
      }

      // Compute and set etag if the schema has an etag field
      if (etagFieldDesc) {
        (msg as Record<string, unknown>)[etagFieldDesc.localName] = computeEtag(schema, msg);
      }

      // Serialize to a database row
      const row = serializeMessage(schema, msg, columnMap);

      // If validateOnly, return the prepared message without inserting
      if (options?.validateOnly) {
        let result = msg;
        if (!isWildcard(readMask)) {
          result = applyFieldMask(schema, result, readMask, { strict: false });
        }
        return result;
      }

      // Insert into the database
      const inserted = await eng.insertOne<Record<string, unknown>>({
        table: tableName,
        row,
      });

      // Deserialize the returned row
      let result = deserializeRow(schema, inserted, columnMap);

      // Apply read mask if not wildcard
      if (!isWildcard(readMask)) {
        result = applyFieldMask(schema, result, readMask, { strict: false });
      }

      return result;
    },

    async list(query?: QueryInput<Desc>, options?: ListOptions): Promise<ListResult<Desc>> {
      const eng: Engine = options?.transaction ?? engine;
      const readMask = options?.readMask ?? defaultReadMask;
      const pageSize = Math.min(options?.pageSize ?? defaultPageSize, maxPageSize);
      const offset = options?.pageToken?.offset ?? 0;

      // Parse, validate, and remap orderBy field names via columnMap
      let orderBy: OrderBy | undefined;
      if (options?.orderBy) {
        const parsed = parseOrderBy(options.orderBy);
        validateOrderBy(parsed, schema);
        if (columnMap) {
          orderBy = new OrderBy(
            parsed.fields.map((f) => new OrderByField(columnMap[f.path] ?? f.path, f.desc)),
          );
        } else {
          orderBy = parsed;
        }
      }

      // Build filter (undefined = match all)
      const filter = query
        ? buildFilter(schema, query, { columnMap, extraDecls: filterDecls })
        : undefined;

      // Optional total count
      let totalSize: number | undefined;
      if (options?.showTotalSize) {
        totalSize = await eng.count({ table: tableName, filter });
      }

      // Fetch pageSize+1 to detect next page
      const rows = await eng.findMany<Record<string, unknown>>({
        table: tableName,
        filter,
        columns: isWildcard(readMask) ? undefined : maskToColumns(schema, readMask, columnMap),
        limit: pageSize + 1,
        offset,
        orderBy,
      });

      const hasMore = rows.length > pageSize;
      const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

      // Deserialize and apply read mask
      let results = pageRows.map((row) => deserializeRow(schema, row, columnMap));
      if (!isWildcard(readMask)) {
        results = results.map((msg) => applyFieldMask(schema, msg, readMask, { strict: false }));
      }

      // Next page token (preserve checksum from input token)
      const nextPageToken = hasMore
        ? encodePageToken(
            new PageToken(offset + pageSize, options?.pageToken?.requestChecksum ?? 0),
          )
        : "";

      return { results, nextPageToken, ...(totalSize !== undefined && { totalSize }) };
    },

    async update(
      query: QueryInput<Desc>,
      resource: MessageInitShape<Desc>,
      options?: UpdateOptions,
    ): Promise<MessageShape<Desc>> {
      const eng: Engine = options?.transaction ?? engine;
      const readMask = options?.readMask ?? defaultReadMask;
      const updateMask = options?.updateMask ?? defaultUpdateMask;

      // Fetch existing resource
      const filter = buildFilter(schema, query, { columnMap, extraDecls: filterDecls });
      const existingRow = await eng.findOne<Record<string, unknown>>({ table: tableName, filter });
      if (!existingRow) {
        throw new NotFoundError({ message: "Resource not found." });
      }
      const existing = deserializeRow(schema, existingRow, columnMap);

      // Create update message from init shape
      const updateMsg = create(schema, resource);

      // Validate immutable fields are not in the update mask
      validateImmutableFields(schema, updateMsg, { fieldMask: updateMask });

      // Merge: clone existing, apply masked update fields
      // For wildcard: use outputOnlyMask to exclude OUTPUT_ONLY fields (AIP-134)
      const effectiveMask = isWildcard(updateMask) ? outputOnlyMask(schema) : updateMask;
      const maskedUpdate = applyFieldMask(schema, updateMsg, effectiveMask, { strict: false });
      const merged = clone(schema, existing);
      merge(schema, merged, maskedUpdate);

      // Recompute etag on merged message
      if (etagFieldDesc) {
        (merged as Record<string, unknown>)[etagFieldDesc.localName] = computeEtag(schema, merged);
      }

      // validateOnly: return merged message without persisting
      if (options?.validateOnly) {
        let result = merged;
        if (!isWildcard(readMask)) {
          result = applyFieldMask(schema, result, readMask, { strict: false });
        }
        return result;
      }

      // Serialize only updated columns for DB
      const fullRow = serializeMessage(schema, merged, columnMap);
      let updateRow: Record<string, unknown>;
      if (isWildcard(updateMask)) {
        updateRow = fullRow;
      } else {
        const updateCols = maskToColumns(schema, updateMask, columnMap);
        updateRow = Object.fromEntries(
          Object.entries(fullRow).filter(([k]) => updateCols.includes(k)),
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
      let result = deserializeRow(schema, updatedRow, columnMap);
      if (!isWildcard(readMask)) {
        result = applyFieldMask(schema, result, readMask, { strict: false });
      }
      return result;
    },

    async delete(query: QueryInput<Desc>, options?: DeleteOptions): Promise<void> {
      const eng: Engine = options?.transaction ?? engine;
      const filter = buildFilter(schema, query, { columnMap, extraDecls: filterDecls });

      // Verify the resource exists
      const existing = await eng.findOne({ table: tableName, filter });
      if (!existing) {
        throw new NotFoundError({ message: "Resource not found." });
      }

      // If validateOnly, return without deleting
      if (options?.validateOnly) {
        return;
      }

      await eng.deleteOne({ table: tableName, filter });
    },

    async count(query?: QueryInput<Desc>, options?: CountOptions): Promise<number> {
      const eng: Engine = options?.transaction ?? engine;
      const filter = query
        ? buildFilter(schema, query, { columnMap, extraDecls: filterDecls })
        : undefined;
      return eng.count({ table: tableName, filter });
    },

    async batchGet(
      queries: QueryInput<Desc>[],
      options?: BatchGetOptions,
    ): Promise<MessageShape<Desc>[]> {
      const eng: Engine = options?.transaction ?? engine;
      const readMask = options?.readMask ?? defaultReadMask;

      const run = async (e: Engine) => {
        // Combine into a single OR filter for one round-trip
        const combinedFilter = buildBatchFilter(schema, queries, {
          columnMap,
          extraDecls: filterDecls,
        });

        const columns = isWildcard(readMask)
          ? undefined
          : maskToColumns(schema, readMask, columnMap);

        const rows = await e.findMany<Record<string, unknown>>({
          table: tableName,
          filter: combinedFilter,
          columns,
        });

        if (rows.length < queries.length) {
          throw new NotFoundError({
            message: `${queries.length - rows.length} resource(s) not found.`,
          });
        }

        // Deserialize all rows
        let results = rows.map((row) => deserializeRow(schema, row, columnMap));

        // Apply read mask
        if (!isWildcard(readMask)) {
          results = results.map((msg) => applyFieldMask(schema, msg, readMask, { strict: false }));
        }

        // Reorder results to match input query order using identifier fields
        if (identifierFields.length > 0) {
          // Build a lookup map: identifier key → result message
          const resultsByKey = new Map<string, MessageShape<Desc>>();
          for (const msg of results) {
            const key = identifierFields
              .map((f) => String((msg as Record<string, unknown>)[f.localName]))
              .join("\0");
            resultsByKey.set(key, msg);
          }

          // For each query, extract identifier values and look up
          const reordered: MessageShape<Desc>[] = [];
          for (const query of queries) {
            // Extract identifier values from the query
            let key: string | undefined;
            if (typeof query !== "string") {
              key = identifierFields
                .map((f) => String((query as Record<string, unknown>)[f.localName]))
                .join("\0");
            } else {
              // For string queries, fetch individually to find the match
              const filter = buildFilter(schema, query, { columnMap, extraDecls: filterDecls });
              const row = await e.findOne<Record<string, unknown>>({
                table: tableName,
                filter,
                columns,
              });
              if (!row) {
                throw new NotFoundError({ message: "Resource not found." });
              }
              const msg = deserializeRow(schema, row, columnMap);
              key = identifierFields
                .map((f) => String((msg as Record<string, unknown>)[f.localName]))
                .join("\0");
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
      if (options?.transaction) {
        return run(eng);
      }
      return engine.transaction((tx) => run(tx));
    },

    async batchCreate(
      resources: MessageInitShape<Desc>[],
      options?: BatchCreateOptions,
    ): Promise<MessageShape<Desc>[]> {
      const eng: Engine = options?.transaction ?? engine;
      const readMask = options?.readMask ?? defaultReadMask;

      const run = async (e: Engine) => {
        // Phase 1: Validate all resources
        const messages = resources.map((r) => create(schema, r));
        for (const msg of messages) {
          validateRequiredFields(schema, msg);
        }

        // Phase 2: Check for duplicate IDENTIFIER fields
        if (identifierFields.length > 0) {
          const idQueries: Partial<MessageShape<Desc>>[] = [];
          for (const msg of messages) {
            const idPartial: Record<string, unknown> = {};
            let hasId = false;
            for (const f of identifierFields) {
              const val = (msg as Record<string, unknown>)[f.localName];
              if (val !== undefined && val !== "" && val !== 0 && val !== false) {
                idPartial[f.localName] = val;
                hasId = true;
              }
            }
            if (hasId) {
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
          if (etagFieldDesc) {
            (msg as Record<string, unknown>)[etagFieldDesc.localName] = computeEtag(schema, msg);
          }
        }

        // Phase 4: Serialize all rows
        const rows = messages.map((msg) => serializeMessage(schema, msg, columnMap));

        // If validateOnly, return prepared messages
        if (options?.validateOnly) {
          let results = messages;
          if (!isWildcard(readMask)) {
            results = results.map((msg) =>
              applyFieldMask(schema, msg, readMask, { strict: false }),
            );
          }
          return results;
        }

        // Phase 5: Bulk insert
        const insertedRows = await e.insertMany<Record<string, unknown>>({
          table: tableName,
          rows,
        });

        // Deserialize and apply readMask
        let results = insertedRows.map((row) => deserializeRow(schema, row, columnMap));
        if (!isWildcard(readMask)) {
          results = results.map((msg) => applyFieldMask(schema, msg, readMask, { strict: false }));
        }
        return results;
      };

      if (options?.transaction) {
        return run(eng);
      }
      return engine.transaction((tx) => run(tx));
    },

    async batchUpdate(
      updates: BatchUpdateItem<Desc>[],
      options?: BatchUpdateOptions,
    ): Promise<MessageShape<Desc>[]> {
      const eng: Engine = options?.transaction ?? engine;
      const readMask = options?.readMask ?? defaultReadMask;

      const run = async (e: Engine) => {
        // Phase 1: Fetch all existing resources in one round-trip
        const queries = updates.map((u) => u.query);
        const combinedFilter = buildBatchFilter(schema, queries, {
          columnMap,
          extraDecls: filterDecls,
        });

        const existingRows = await e.findMany<Record<string, unknown>>({
          table: tableName,
          filter: combinedFilter,
        });

        if (existingRows.length < updates.length) {
          throw new NotFoundError({
            message: `${updates.length - existingRows.length} resource(s) not found.`,
          });
        }

        // Build a lookup map from identifier fields
        const existingMessages = existingRows.map((row) => deserializeRow(schema, row, columnMap));
        const existingByKey = new Map<string, MessageShape<Desc>>();
        for (const msg of existingMessages) {
          const key = identifierFields
            .map((f) => String((msg as Record<string, unknown>)[f.localName]))
            .join("\0");
          existingByKey.set(key, msg);
        }

        // Phase 2: Merge each update with its existing resource
        const merged: MessageShape<Desc>[] = [];
        for (const update of updates) {
          const updateMask = update.updateMask ?? defaultUpdateMask;
          const updateMsg = create(schema, update.resource);

          // Find the matching existing resource
          let existing: MessageShape<Desc> | undefined;
          if (identifierFields.length > 0) {
            // Try to match by identifier fields from the update message
            const key = identifierFields
              .map((f) => String((updateMsg as Record<string, unknown>)[f.localName]))
              .join("\0");
            existing = existingByKey.get(key);
          }
          if (!existing) {
            // Fall back to filter-based matching
            const filter = buildFilter(schema, update.query, {
              columnMap,
              extraDecls: filterDecls,
            });
            const row = await e.findOne<Record<string, unknown>>({ table: tableName, filter });
            if (!row) {
              throw new NotFoundError({ message: "Resource not found." });
            }
            existing = deserializeRow(schema, row, columnMap);
          }

          validateImmutableFields(schema, updateMsg, { fieldMask: updateMask });

          const effectiveMask = isWildcard(updateMask) ? outputOnlyMask(schema) : updateMask;
          const maskedUpdate = applyFieldMask(schema, updateMsg, effectiveMask, { strict: false });
          const result = clone(schema, existing);
          merge(schema, result, maskedUpdate);

          if (etagFieldDesc) {
            (result as Record<string, unknown>)[etagFieldDesc.localName] = computeEtag(
              schema,
              result,
            );
          }

          merged.push(result);
        }

        // If validateOnly, return merged messages
        if (options?.validateOnly) {
          let results = merged;
          if (!isWildcard(readMask)) {
            results = results.map((msg) =>
              applyFieldMask(schema, msg, readMask, { strict: false }),
            );
          }
          return results;
        }

        // Phase 3: Bulk replace
        const fullRows = merged.map((msg) => serializeMessage(schema, msg, columnMap));
        const keyColumns = identifierFields.map((f) => columnMap?.[f.name] ?? f.jsonName);

        const updatedRows = await e.replaceMany<Record<string, unknown>>({
          table: tableName,
          rows: fullRows,
          keyColumns,
        });

        if (updatedRows.length < updates.length) {
          throw new NotFoundError({
            message: `${updates.length - updatedRows.length} resource(s) not found.`,
          });
        }

        // Deserialize and apply readMask, reorder to match input order
        let results = updatedRows.map((row) => deserializeRow(schema, row, columnMap));
        if (!isWildcard(readMask)) {
          results = results.map((msg) => applyFieldMask(schema, msg, readMask, { strict: false }));
        }

        // Reorder to match input order
        if (identifierFields.length > 0) {
          const resultsByKey = new Map<string, MessageShape<Desc>>();
          for (const msg of results) {
            const key = identifierFields
              .map((f) => String((msg as Record<string, unknown>)[f.localName]))
              .join("\0");
            resultsByKey.set(key, msg);
          }
          return merged.map((msg) => {
            const key = identifierFields
              .map((f) => String((msg as Record<string, unknown>)[f.localName]))
              .join("\0");
            return resultsByKey.get(key) ?? msg;
          });
        }

        return results;
      };

      if (options?.transaction) {
        return run(eng);
      }
      return engine.transaction((tx) => run(tx));
    },

    async batchDelete(queries: QueryInput<Desc>[], options?: BatchDeleteOptions): Promise<void> {
      const eng: Engine = options?.transaction ?? engine;

      const run = async (e: Engine) => {
        // Verify all resources exist
        const combinedFilter = buildBatchFilter(schema, queries, {
          columnMap,
          extraDecls: filterDecls,
        });

        const existing = await e.findMany({ table: tableName, filter: combinedFilter });
        if (existing.length < queries.length) {
          throw new NotFoundError({
            message: `${queries.length - existing.length} resource(s) not found.`,
          });
        }

        if (options?.validateOnly) {
          return;
        }

        const deleted = await e.deleteMany({ table: tableName, filter: combinedFilter });
        if (deleted < queries.length) {
          throw new NotFoundError({
            message: `${queries.length - deleted} resource(s) not found.`,
          });
        }
      };

      if (options?.transaction) {
        return run(eng);
      }
      return engine.transaction((tx) => run(tx));
    },
  };
}
