import { DescMessage, MessageShape, toBinary } from '@bufbuild/protobuf';
import { crc32 } from 'crc';

/**
 * Calculate the checksum for a message.
 *
 * @param schema the schema of the message
 * @param message the message to calculate the checksum for
 * @returns a checksum for the message
 */
export function calculateMessageCheckSum<Desc extends DescMessage = DescMessage>(
  schema: Desc,
  message: MessageShape<Desc>
) {
  const bin = toBinary(schema, message);
  return crc32(bin);
}
