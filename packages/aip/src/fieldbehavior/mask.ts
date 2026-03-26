import type { DescMessage } from "@bufbuild/protobuf";
import type { FieldMask } from "@bufbuild/protobuf/wkt";
import { fieldMask } from "@protoutil/core/wkt";
import { FieldBehavior } from "../gen/google/api/field_behavior_pb.js";
import { hasAnyFieldBehavior } from "./fieldbehavior.js";

const DEFAULT_MAX_DEPTH = 5;

export interface FieldMaskFromBehaviorOptions {
  /**
   * Maximum depth to recurse into nested message fields. When the limit is
   * reached the parent field path is included as-is, meaning the entire
   * subtree is kept without further behaviour filtering.
   *
   * @default 5
   */
  maxDepth?: number;
}

/**
 * Creates a {@link FieldMask} containing all fields on the schema that do NOT
 * have any of the specified {@link FieldBehavior} annotations. The function
 * recurses into nested message, repeated message, and map-of-message fields
 * so that excluded behaviours are filtered at every level of the message tree.
 *
 * When `maxDepth` is reached or a self-referential type is encountered the
 * field path is included without further recursion, preserving the entire
 * subtree.
 *
 * The returned mask uses non-strict validation to support wildcard paths
 * for repeated and map fields (e.g. `repeated_child.*.field`).
 *
 * @param schema  The message descriptor to inspect.
 * @param exclude The field behaviors to exclude from the resulting mask.
 * @param opts    Optional settings.
 * @returns A validated {@link FieldMask} with excluded-behaviour fields removed.
 */
export function fieldMaskFromBehavior(
  schema: DescMessage,
  exclude: FieldBehavior[],
  opts?: FieldMaskFromBehaviorOptions,
): FieldMask {
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const paths: string[] = [];
  collectPaths(schema, exclude, "", paths, maxDepth, 0, new Set());
  return fieldMask(schema, paths, false);
}

function collectPaths(
  schema: DescMessage,
  exclude: FieldBehavior[],
  prefix: string,
  paths: string[],
  maxDepth: number,
  depth: number,
  visited: Set<string>,
): void {
  for (const field of schema.fields) {
    if (hasAnyFieldBehavior(field, exclude)) {
      continue;
    }
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    switch (field.fieldKind) {
      case "message": {
        if (depth >= maxDepth || visited.has(field.message.typeName)) {
          paths.push(path);
        } else {
          const nextVisited = new Set(visited);
          nextVisited.add(schema.typeName);
          collectPaths(field.message, exclude, path, paths, maxDepth, depth + 1, nextVisited);
        }
        break;
      }
      case "list": {
        if (field.listKind === "message") {
          const wildcardPath = `${path}.*`;
          if (depth >= maxDepth || visited.has(field.message.typeName)) {
            paths.push(path);
          } else {
            const nextVisited = new Set(visited);
            nextVisited.add(schema.typeName);
            collectPaths(
              field.message,
              exclude,
              wildcardPath,
              paths,
              maxDepth,
              depth + 1,
              nextVisited,
            );
          }
        } else {
          paths.push(path);
        }
        break;
      }
      case "map": {
        if (field.mapKind === "message") {
          const wildcardPath = `${path}.*`;
          if (depth >= maxDepth || visited.has(field.message.typeName)) {
            paths.push(path);
          } else {
            const nextVisited = new Set(visited);
            nextVisited.add(schema.typeName);
            collectPaths(
              field.message,
              exclude,
              wildcardPath,
              paths,
              maxDepth,
              depth + 1,
              nextVisited,
            );
          }
        } else {
          paths.push(path);
        }
        break;
      }
      default:
        paths.push(path);
        break;
    }
  }
}

/**
 * Creates a {@link FieldMask} that excludes fields annotated with
 * {@link FieldBehavior.OUTPUT_ONLY}.
 *
 * Useful as a default mask for write operations (create/update) where
 * server-managed output fields should not be accepted from clients.
 *
 * @param schema The message descriptor to inspect.
 * @param opts   Optional settings (e.g. maxDepth).
 */
export function outputOnlyMask(
  schema: DescMessage,
  opts?: FieldMaskFromBehaviorOptions,
): FieldMask {
  return fieldMaskFromBehavior(schema, [FieldBehavior.OUTPUT_ONLY], opts);
}

/**
 * Creates a {@link FieldMask} that excludes fields annotated with
 * {@link FieldBehavior.INPUT_ONLY}.
 *
 * Useful as a default mask for read operations where client-only
 * fields (e.g. passwords, secrets) should not be returned in responses.
 *
 * @param schema The message descriptor to inspect.
 * @param opts   Optional settings (e.g. maxDepth).
 */
export function inputOnlyMask(schema: DescMessage, opts?: FieldMaskFromBehaviorOptions): FieldMask {
  return fieldMaskFromBehavior(schema, [FieldBehavior.INPUT_ONLY], opts);
}

/**
 * Creates a {@link FieldMask} that excludes fields annotated with
 * {@link FieldBehavior.IMMUTABLE}.
 *
 * Useful as a default mask for update operations where fields that
 * cannot be changed after creation should be excluded.
 *
 * @param schema The message descriptor to inspect.
 * @param opts   Optional settings (e.g. maxDepth).
 */
export function immutableMask(schema: DescMessage, opts?: FieldMaskFromBehaviorOptions): FieldMask {
  return fieldMaskFromBehavior(schema, [FieldBehavior.IMMUTABLE], opts);
}
