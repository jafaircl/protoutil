import type { DescMessage } from "@bufbuild/protobuf";
import type { ColumnConfigMap, ColumnKey } from "./types.js";

export function resolveColumnMap<Desc extends DescMessage>(
  schema: Desc,
  columns?: ColumnConfigMap<Desc>,
): Record<string, string> | undefined {
  if (!columns) return undefined;
  const map: Record<string, string> = {};
  let hasEntries = false;
  for (const field of schema.fields) {
    const key = field.localName as ColumnKey<Desc>;
    const config = columns[key];
    if (!config?.name) {
      continue;
    }
    map[field.name] = config.name;
    hasEntries = true;
  }
  return hasEntries ? map : undefined;
}

export function defaultTableName(schema: DescMessage): string {
  return schema.typeName
    .replace(/\./g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}
