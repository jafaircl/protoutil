import type { DescField, DescMessage, JsonValue, MessageShape } from "@bufbuild/protobuf";
import { fromJson, ScalarType, toJson } from "@bufbuild/protobuf";
import { getField } from "@protoutil/core";
import { type ContextValues, createContextValues } from "./context-values.js";
import type {
  ColumnConfigMap,
  ColumnDeserializeOperation,
  ColumnFieldValue,
  ColumnKey,
  ColumnSerializeOperation,
} from "./types.js";

type SerializeFieldEntry = {
  key: string;
  dbCol: string;
  jsonKey: string;
};

type SerializationMetadata = {
  serializeFields: SerializeFieldEntry[];
  reverseMap: Record<string, DescField>;
};

type SerializationCacheEntry = {
  columnMap?: Record<string, string>;
  columns?: ColumnConfigMap<DescMessage>;
  metadata: SerializationMetadata;
};

const metadataCache = new WeakMap<DescMessage, SerializationCacheEntry[]>();

function getSchemaField<Desc extends DescMessage, K extends ColumnKey<Desc>>(
  schema: Desc,
  key: K,
): Desc["field"][K] {
  return schema.field[key] as Desc["field"][K];
}

function buildSerializationMetadata<Desc extends DescMessage>(
  schema: Desc,
  columnMap?: Record<string, string>,
  columns?: ColumnConfigMap<Desc>,
): SerializationMetadata {
  const serializeFields: SerializeFieldEntry[] = [];
  const reverseMap: Record<string, DescField> = {};
  for (const schemaField of schema.fields) {
    const key = schemaField.localName as ColumnKey<Desc>;
    const config = columns?.[key];
    if (config?.ignore) {
      continue;
    }
    const dbCol = columnMap?.[schemaField.name] ?? schemaField.jsonName;
    serializeFields.push({
      key,
      dbCol,
      jsonKey: schemaField.jsonName,
    });
    reverseMap[dbCol] = schemaField;
  }
  return { serializeFields, reverseMap };
}

function getSerializationMetadata<Desc extends DescMessage>(
  schema: Desc,
  columnMap?: Record<string, string>,
  columns?: ColumnConfigMap<Desc>,
): SerializationMetadata {
  const entries = metadataCache.get(schema) ?? [];
  const match = entries.find((entry) => entry.columnMap === columnMap && entry.columns === columns);
  if (match) {
    return match.metadata;
  }
  const metadata = buildSerializationMetadata(schema, columnMap, columns);
  entries.push({
    columnMap,
    columns: columns as ColumnConfigMap<DescMessage> | undefined,
    metadata,
  });
  metadataCache.set(schema, entries);
  return metadata;
}

/**
 * Coerce a database value to the type expected by `fromJson` for the
 * given field. Databases like SQLite store booleans as integers (0/1),
 * which `fromJson` rejects — this converts them to proper booleans.
 */
function coerceValue(field: DescField, value: unknown): unknown {
  if (field.scalar === ScalarType.BOOL && typeof value === "number") {
    return value !== 0;
  }
  return value;
}

/**
 * Convert a protobuf message into a plain object suitable for database
 * insertion. Uses `@bufbuild/protobuf`'s `toJson` for type-safe
 * serialization (bigints as strings, Timestamps as RFC 3339, etc.),
 * then remaps keys via the optional `columnMap`.
 *
 * When a `columns` config is provided:
 * - Fields with `ignore: true` are excluded from the output.
 * - Fields with `serialize` are transformed before being written.
 * - Fields with `name` overrides use the specified database column name.
 *
 * @param schema    The message descriptor.
 * @param message   The message to serialize.
 * @param columnMap Map of proto field names (snake_case) to database column names.
 * @param columns   Per-field column configuration.
 */
export function serializeMessage<Desc extends DescMessage>(
  schema: Desc,
  message: MessageShape<Desc>,
  columnMap?: Record<string, string>,
  columns?: ColumnConfigMap<Desc>,
  operation: ColumnSerializeOperation = "create",
  contextValues: ContextValues = createContextValues(),
): Record<string, unknown> {
  const json = toJson(schema, message) as Record<string, unknown>;
  if (!columnMap && !columns) {
    return json;
  }
  const metadata = getSerializationMetadata(schema, columnMap, columns);
  const row: Record<string, unknown> = {};
  for (const entry of metadata.serializeFields) {
    const key = entry.key as ColumnKey<Desc>;
    const field = getSchemaField(schema, key);
    const { dbCol, jsonKey } = entry;
    const config = columns?.[key];
    const rawValue = getField(message, field) as ColumnFieldValue<Desc, typeof key>;

    if (config?.serialize) {
      row[dbCol] = config.serialize({
        field,
        operation,
        value: rawValue,
        contextValues,
      });
      continue;
    }

    if (!(jsonKey in json)) {
      continue;
    }
    row[dbCol] = json[jsonKey];
  }
  return row;
}

/**
 * Convert a plain database row object into a protobuf message. Database
 * column names are mapped back to proto JSON field names, then
 * `@bufbuild/protobuf`'s `fromJson` handles type conversion (strings
 * back to bigints, RFC 3339 to Timestamps, etc.).
 *
 * Boolean fields are coerced from integers (0/1) to booleans, since
 * databases like SQLite lack a native boolean type.
 *
 * When a `columns` config is provided:
 * - Fields with `ignore: true` are skipped (they get proto3 defaults).
 * - Fields with `deserialize` are transformed before being assigned.
 *
 * @param schema    The message descriptor.
 * @param row       The database row as a plain object.
 * @param columnMap Map of proto field names (snake_case) to database column names.
 * @param columns   Per-field column configuration.
 */
export function deserializeRow<Desc extends DescMessage>(
  schema: Desc,
  row: Record<string, unknown>,
  columnMap?: Record<string, string>,
  columns?: ColumnConfigMap<Desc>,
  operation: ColumnDeserializeOperation = "get",
  contextValues: ContextValues = createContextValues(),
): MessageShape<Desc> {
  const metadata = getSerializationMetadata(schema, columnMap, columns);
  const json: Record<string, unknown> = {};
  const transformed: Array<{ field: DescField; value: unknown }> = [];
  for (const [colName, value] of Object.entries(row)) {
    const field = metadata.reverseMap[colName];
    if (!field) {
      continue;
    }
    const key = field.localName as ColumnKey<Desc>;
    const typedField = getSchemaField(schema, key);
    const config = columns?.[key];

    if (config?.deserialize) {
      transformed.push({
        field,
        value: config.deserialize({ field: typedField, operation, value, contextValues }),
      });
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    json[field.jsonName] = coerceValue(field, value);
  }
  const message = fromJson(schema, json as JsonValue);
  for (const item of transformed) {
    if (item.value === null || item.value === undefined) {
      continue;
    }
    (message as Record<string, unknown>)[item.field.localName] = item.value;
  }
  return message;
}
