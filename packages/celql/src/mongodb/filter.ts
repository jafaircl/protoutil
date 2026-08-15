import type { Value } from "../gen/cel/expr/value_pb.js";
import type { MongoDbPredicate } from "../gen/protoutil/celql/mongodb/v1/mongodb_pb.js";

/** One value inside a MongoDB filter document. */
export type MongoDbFilterValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | Uint8Array
  | MongoDbFilterValue[]
  | { [field: string]: MongoDbFilterValue };

/**
 * Converts a predicate to the filter document that a MongoDB driver accepts.
 *
 * An integer becomes a `bigint`, which a driver stores as a 64-bit BSON
 * integer. A caller that needs the driver's own `Long` wraps that value.
 *
 * Throws when the predicate carries a value that no profile emits.
 *
 * @param predicate Predicate that the MongoDB profile produced.
 */
export function mongoDbFilter(predicate: MongoDbPredicate): Record<string, MongoDbFilterValue> {
  if (predicate.filter === undefined) {
    throw new Error("A MongoDB predicate carries no filter.");
  }
  const filter = filterValue(predicate.filter);
  if (filter === null || typeof filter !== "object" || Array.isArray(filter)) {
    throw new Error("A MongoDB predicate filter must be a document.");
  }
  return filter as Record<string, MongoDbFilterValue>;
}

function filterValue(value: Value): MongoDbFilterValue {
  switch (value.kind.case) {
    case "boolValue":
    case "doubleValue":
    case "stringValue":
    case "bytesValue":
    case "int64Value":
    case "uint64Value":
      return value.kind.value;
    case "nullValue":
      return null;
    case "listValue":
      return value.kind.value.values.map(filterValue);
    case "mapValue":
      return Object.fromEntries(
        value.kind.value.entries.map((entry) => [
          filterValue(entry.key!) as string,
          filterValue(entry.value!),
        ]),
      );
    default:
      throw new Error(
        `A MongoDB filter carries the unsupported value ${value.kind.case ?? "of no kind"}.`,
      );
  }
}
