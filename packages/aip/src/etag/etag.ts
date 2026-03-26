import { clearField, clone, type DescMessage, type MessageShape } from "@bufbuild/protobuf";
import type { FieldMask } from "@bufbuild/protobuf/wkt";
import { checksum } from "@protoutil/core";
import { applyFieldMask, fieldMask } from "@protoutil/core/wkt";

export interface EtagOptions {
  fieldMask?: FieldMask;
  inverse?: boolean;
}

/**
 * Calculate the etag for a message. If the field mask is not provided, the
 * etag will be calculated for the entire message. If the field mask is provided,
 * the field mask will be applied to the message before calculating the etag. If
 * the field mask is not a wildcard (`*`), the etag will be weak.
 */
export function etag<Desc extends DescMessage = DescMessage>(
  schema: Desc,
  message: MessageShape<Desc>,
  opts?: EtagOptions,
) {
  const fm = opts?.fieldMask ?? fieldMask(schema, ["*"], false);
  const inverse = opts?.inverse ?? false;
  const cloned = clone(schema, message);
  if (schema.field.etag) {
    clearField(cloned, schema.field.etag);
  }
  const isStrong = fm.paths.length === 1 && fm.paths[0] === "*";
  const updated = applyFieldMask(schema, cloned, fm, { inverse, strict: false });
  const crc = checksum(schema, updated);
  const tag = Buffer.from(crc.toString()).toString("base64");
  return isStrong ? tag : `W/"${tag}"`;
}
