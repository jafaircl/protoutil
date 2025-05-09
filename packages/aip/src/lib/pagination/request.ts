import { clearField, clone, DescMessage, Message } from '@bufbuild/protobuf';
import { calculateMessageCheckSum } from '@protoutil/core';

/**
 * Request is an interface for paginated request messages.
 *
 * See: https://google.aip.dev/158 (Pagination).
 */
export interface RequestMessage<T extends string = string> extends Message<T> {
  /**
   * GetPageToken returns the page token of the request.
   */
  pageSize?: number;
  /**
   * GetPageSize returns the page size of the request.
   */
  pageToken?: string;
  /**
   * GetSkip returns the skip of the request.
   *
   * See: https://google.aip.dev/158#skipping-results
   */
  skip?: number;
}

/**
 * calculateRequestChecksum calculates a checksum for all fields of the request
 * that must be the same across calls.
 *
 * @param schema the schema of the request message
 * @param request the request message to calculate the checksum for
 * @returns a checksum for the request message
 */
export function calculateRequestCheckSum<T extends string = string>(
  schema: DescMessage,
  request: RequestMessage<T>
): number {
  const clonedRequest = clone(schema, request) as RequestMessage<T>;
  // Clear the page token, page size, and skip fields from the request message.
  if (schema.field.pageToken) {
    clearField(clonedRequest, schema.field.pageToken);
  }
  if (schema.field.pageSize) {
    clearField(clonedRequest, schema.field.pageSize);
  }
  if (schema.field.skip) {
    clearField(clonedRequest, schema.field.skip);
  }
  return calculateMessageCheckSum(schema, clonedRequest);
}
