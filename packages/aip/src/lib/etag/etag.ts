import { clearField, clone, DescMessage, MessageShape } from '@bufbuild/protobuf';
import { FieldMask } from '@bufbuild/protobuf/wkt';
import { applyFieldMask, calculateMessageCheckSum, fieldMask } from '@protoutil/core';

/**
 * Calculate the etag for a message. If the field mask is not provided, the
 * etag will be calculated for the entire message. If the field mask is provided,
 * the field mask will be applied to the message before calculating the etag. If
 * the field mask is not a wildcard (`*`), the etag will be weak.
 *
 * @param schema the schema of the message
 * @param message the message to calculate the etag for
 * @param fm the field mask to apply to the message before calculating the etag. If
 * not provided, the entire message will be used.
 * @param inverseFieldMask if true, the field mask will be inverted. This means that
 * the etag will be calculated for all fields except the ones in the field mask.
 * @returns the base64 encoded etag for the message
 */
export function calculateMessageEtag<Desc extends DescMessage = DescMessage>(
  schema: Desc,
  message: MessageShape<Desc>,
  fm: FieldMask = fieldMask(schema, ['*'], false),
  inverseFieldMask = false
) {
  const cloned = clone(schema, message);
  if (schema.field.etag) {
    clearField(cloned, schema.field.etag);
  }
  const isStrong = fm.paths.length === 1 && fm.paths[0] === '*';
  const updated = applyFieldMask(schema, cloned, fm, inverseFieldMask, false);
  const checksum = calculateMessageCheckSum(schema, updated);
  const etag = Buffer.from(checksum.toString()).toString('base64');
  return isStrong ? etag : `W/"${etag}"`;
}
