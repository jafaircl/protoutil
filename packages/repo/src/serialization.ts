import type { DescField, DescMessage, JsonValue, MessageShape } from "@bufbuild/protobuf";
import {
  fromBinary,
  fromJson,
  fromJsonString,
  ScalarType,
  toBinary,
  toJson,
  toJsonString,
} from "@bufbuild/protobuf";
import type { ColumnConfig } from "./types.js";

/**
 * Build a reverse mapping from database column names back to proto field
 * descriptors, keyed by the database column name.
 */
function buildReverseMap(
  schema: DescMessage,
  columnMap?: Record<string, string>,
  ignored?: Set<string>,
): Record<string, DescField> {
  const reverse: Record<string, DescField> = {};
  for (const field of schema.fields) {
    if (ignored?.has(field.name)) continue;
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
 * When a `columns` config is provided:
 * - Fields with `ignore: true` are excluded from the output.
 * - Fields with `serialize: "json"` are stored as JSON strings via `toJsonString`.
 * - Fields with `serialize: "binary"` are stored as `Uint8Array` via `toBinary`.
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
  columns?: Record<string, ColumnConfig>,
): Record<string, unknown> {
  const json = toJson(schema, message) as Record<string, unknown>;
  if (!columnMap && !columns) {
    return json;
  }
  const row: Record<string, unknown> = {};
  for (const field of schema.fields) {
    const config = columns?.[field.name];
    if (config?.ignore) continue;

    const jsonKey = field.jsonName;
    if (!(jsonKey in json)) {
      continue;
    }

    const dbCol = columnMap?.[field.name] ?? jsonKey;

    if (config?.serialize && field.message) {
      const value = json[jsonKey];
      if (value === null || value === undefined) {
        row[dbCol] = null;
      } else {
        // Reconstruct the sub-message from its JSON representation
        const subMsg = fromJson(field.message, value as JsonValue);
        if (config.serialize === "json") {
          row[dbCol] = toJsonString(field.message, subMsg);
        } else {
          row[dbCol] = toBinary(field.message, subMsg);
        }
      }
    } else {
      row[dbCol] = json[jsonKey];
    }
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
 * - Fields with `serialize: "json"` are parsed from JSON strings via `fromJsonString`.
 * - Fields with `serialize: "binary"` are parsed from `Uint8Array` via `fromBinary`.
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
  columns?: Record<string, ColumnConfig>,
): MessageShape<Desc> {
  const ignored = columns
    ? new Set(
        Object.entries(columns)
          .filter(([, c]) => c.ignore)
          .map(([k]) => k),
      )
    : undefined;
  const reverseMap = buildReverseMap(schema, columnMap, ignored);
  const json: Record<string, unknown> = {};
  for (const [colName, value] of Object.entries(row)) {
    const field = reverseMap[colName];
    if (!field) {
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }

    const config = columns?.[field.name];

    if (config?.serialize && field.message) {
      if (config.serialize === "json") {
        // Parse JSON string back into a message, then convert to JSON representation
        const str = typeof value === "string" ? value : String(value);
        const subMsg = fromJsonString(field.message, str);
        json[field.jsonName] = toJson(field.message, subMsg);
      } else {
        // binary: parse Uint8Array back into a message
        const bytes = value instanceof Uint8Array ? value : Buffer.from(value as string);
        const subMsg = fromBinary(field.message, bytes);
        json[field.jsonName] = toJson(field.message, subMsg);
      }
    } else {
      json[field.jsonName] = coerceValue(field, value);
    }
  }
  return fromJson(schema, json as JsonValue);
}
