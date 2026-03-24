import type { DescField, DescMessage, JsonValue, MessageShape } from "@bufbuild/protobuf";
import { fromJson, ScalarType, toJson } from "@bufbuild/protobuf";

/**
 * Build a reverse mapping from database column names back to proto field
 * descriptors, keyed by the database column name.
 */
function buildReverseMap(
  schema: DescMessage,
  columnMap?: Record<string, string>,
): Record<string, DescField> {
  const reverse: Record<string, DescField> = {};
  for (const field of schema.fields) {
    const dbCol = columnMap?.[field.name] ?? field.jsonName;
    reverse[dbCol] = field;
  }
  return reverse;
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
 * @param schema    The message descriptor.
 * @param message   The message to serialize.
 * @param columnMap Map of proto field names (snake_case) to database
 *                  column names.
 */
export function serializeMessage<Desc extends DescMessage>(
  schema: Desc,
  message: MessageShape<Desc>,
  columnMap?: Record<string, string>,
): Record<string, unknown> {
  const json = toJson(schema, message) as Record<string, unknown>;
  if (!columnMap) {
    return json;
  }
  const row: Record<string, unknown> = {};
  for (const field of schema.fields) {
    const jsonKey = field.jsonName;
    if (!(jsonKey in json)) {
      continue;
    }
    const dbCol = columnMap[field.name] ?? jsonKey;
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
 * @param schema    The message descriptor.
 * @param row       The database row as a plain object.
 * @param columnMap Map of proto field names (snake_case) to database
 *                  column names.
 */
export function deserializeRow<Desc extends DescMessage>(
  schema: Desc,
  row: Record<string, unknown>,
  columnMap?: Record<string, string>,
): MessageShape<Desc> {
  const reverseMap = buildReverseMap(schema, columnMap);
  const json: Record<string, unknown> = {};
  for (const [colName, value] of Object.entries(row)) {
    const field = reverseMap[colName];
    if (!field) {
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }
    json[field.jsonName] = coerceValue(field, value);
  }
  return fromJson(schema, json as JsonValue);
}
