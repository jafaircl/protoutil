// Derives table names and column names from proto descriptors.
// All naming is deterministic and does not require user annotation
// unless the user wants to override the default.

import type { DescField, DescMessage } from "@bufbuild/protobuf";

/**
 * Derives the default table name from a message descriptor.
 *
 * Rule: fully-qualified message name, dots replaced with underscores,
 * converted to snake_case. No pluralization.
 *
 * Examples:
 *   library.v1.Book      -> library_v1_book
 *   library.v1.Shelf     -> library_v1_shelf
 *   myapp.v2.UserProfile -> myapp_v2_user_profile
 */
export function defaultTableName(message: DescMessage): string {
  const fqn = message.typeName;
  const parts = fqn.split(".").map(toSnakeCase);
  return parts.join("_");
}

/**
 * Derives the default column name from a field descriptor.
 * Proto field names are already snake_case by convention.
 */
export function defaultColumnName(field: DescField): string {
  return field.name; // already snake_case in proto
}

/**
 * Converts a snake_case table name to PascalCase for use in query names.
 * "test_v1_book" -> "TestV1Book"
 */
export function toPascalCase(snakeCase: string): string {
  return snakeCase
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
}
