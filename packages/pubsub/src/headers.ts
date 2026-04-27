/** Content-type header used for protobuf-encoded CloudEvent messages. */
export const HEADER_CONTENT_TYPE = "content-type";
/** Content-type value for protobuf-encoded CloudEvent messages. */
export const CONTENT_TYPE_PROTOBUF = "application/protobuf";

/** Header mirroring the CloudEvent specversion attribute. */
export const CLOUD_EVENT_HEADER_SPEC_VERSION = "ce-specversion";
/** Header mirroring the CloudEvent type attribute. */
export const CLOUD_EVENT_HEADER_TYPE = "ce-type";
/** Header mirroring the CloudEvent source attribute. */
export const CLOUD_EVENT_HEADER_SOURCE = "ce-source";
/** Header mirroring the CloudEvent id attribute. */
export const CLOUD_EVENT_HEADER_ID = "ce-id";

/** Header containing the scheduler record kind. */
export const PROTOUTIL_HEADER_KIND = "protoutil-pubsub-kind";
/** Header containing the scheduler record format version. */
export const PROTOUTIL_HEADER_SCHEDULE_VERSION = "protoutil-pubsub-schedule-version";
/** Header containing the RFC 3339 not-before timestamp for a scheduled record. */
export const PROTOUTIL_HEADER_NOT_BEFORE = "protoutil-pubsub-not-before";
/** Header containing the target topic for a scheduled record. */
export const PROTOUTIL_HEADER_TARGET_TOPIC = "protoutil-pubsub-target-topic";
/** Header containing the target message key for a scheduled record. */
export const PROTOUTIL_HEADER_TARGET_KEY = "protoutil-pubsub-target-key";
/** Header containing the timestamp when a scheduled record was delivered. */
export const PROTOUTIL_HEADER_DELIVERED_AT = "protoutil-pubsub-delivered-at";
/** Header containing the one-based delivery attempt count. */
export const PROTOUTIL_HEADER_ATTEMPT = "protoutil-pubsub-attempt";

/** Header containing the final disposition written to a dead-letter record. */
export const PROTOUTIL_HEADER_DISPOSITION = "protoutil-pubsub-disposition";
/** Header containing the original topic for a dead-letter record. */
export const PROTOUTIL_HEADER_ORIGINAL_TOPIC = "protoutil-pubsub-original-topic";
/** Header containing the original partition for a dead-letter record. */
export const PROTOUTIL_HEADER_ORIGINAL_PARTITION = "protoutil-pubsub-original-partition";
/** Header containing the original offset for a dead-letter record. */
export const PROTOUTIL_HEADER_ORIGINAL_OFFSET = "protoutil-pubsub-original-offset";

/** Header map where values may be strings, Buffers, or arrays of either. */
export type HeaderRecord = Record<string, string | Buffer | (string | Buffer)[] | undefined>;

/** Read a header value as a string regardless of the transport representation. */
export function stringHeader(headers: HeaderRecord | undefined, key: string): string | undefined {
  const value = headers?.[key];
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  if (Array.isArray(value)) {
    const first = value[0];
    return Buffer.isBuffer(first) ? first.toString("utf8") : first;
  }
  return undefined;
}

/** Read a positive integer header value. */
export function numberHeader(headers: HeaderRecord | undefined, key: string): number | undefined {
  const value = stringHeader(headers, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
