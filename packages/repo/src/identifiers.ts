import type { DescField } from "@bufbuild/protobuf";

function hasIdentifierValue(value: unknown): boolean {
  return value !== undefined && value !== "" && value !== 0 && value !== false;
}

export function completeIdentifierKey(
  fields: readonly DescField[],
  value: Record<string, unknown>,
): string | undefined {
  if (fields.length === 0) {
    return undefined;
  }
  for (const field of fields) {
    if (!hasIdentifierValue(value[field.localName])) {
      return undefined;
    }
  }
  return identifierKey(fields, value);
}

export function identifierPartial(
  fields: readonly DescField[],
  value: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const partial: Record<string, unknown> = {};
  let hasValues = false;
  for (const field of fields) {
    const fieldValue = value[field.localName];
    if (!hasIdentifierValue(fieldValue)) {
      continue;
    }
    partial[field.localName] = fieldValue;
    hasValues = true;
  }
  return hasValues ? partial : undefined;
}

export function identifierKey(
  fields: readonly DescField[],
  value: Record<string, unknown>,
): string {
  return fields.map((field) => String(value[field.localName])).join("\0");
}
