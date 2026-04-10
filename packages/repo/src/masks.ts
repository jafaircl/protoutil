import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import { clearField, create } from "@bufbuild/protobuf";
import { type FieldMask, FieldMaskSchema } from "@bufbuild/protobuf/wkt";

export const WILDCARD_MASK = create(FieldMaskSchema, { paths: ["*"] });

export function isWildcard(mask: { paths: string[] }): boolean {
  return mask.paths.length === 1 && mask.paths[0] === "*";
}

export function maskToColumns(
  schema: DescMessage,
  mask: { paths: string[] },
  columnMap?: Record<string, string>,
): string[] {
  const columns: string[] = [];
  for (const path of mask.paths) {
    const field = schema.fields.find((candidate) => candidate.name === path);
    if (!field) {
      continue;
    }
    columns.push(columnMap?.[field.name] ?? field.jsonName);
  }
  return columns;
}

export function clearMissingMessageFields<Desc extends DescMessage>(
  schema: Desc,
  target: MessageShape<Desc>,
  source: MessageShape<Desc>,
  fieldMask: FieldMask,
) {
  for (const path of fieldMask.paths) {
    const segments = path.split(".");
    if (segments.length !== 1) {
      continue;
    }
    const field = schema.fields.find((candidate) => candidate.name === segments[0]);
    if (!field || field.fieldKind !== "message") {
      continue;
    }
    if ((source as Record<string, unknown>)[field.localName] !== undefined) {
      continue;
    }
    clearField(target, field);
  }
}
