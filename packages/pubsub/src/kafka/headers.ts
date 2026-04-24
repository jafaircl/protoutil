import type { KafkaJS } from "@confluentinc/kafka-javascript";

/** Kafka content-type header for protobuf-encoded CloudEvent records. */
export const KAFKA_HEADER_CONTENT_TYPE = "content-type";
/** Kafka content-type value for protobuf-encoded CloudEvent records. */
export const KAFKA_CONTENT_TYPE_PROTOBUF = "application/protobuf";

/** Kafka header mirroring the CloudEvent specversion attribute. */
export const CLOUD_EVENT_HEADER_SPEC_VERSION = "ce-specversion";
/** Kafka header mirroring the CloudEvent type attribute. */
export const CLOUD_EVENT_HEADER_TYPE = "ce-type";
/** Kafka header mirroring the CloudEvent source attribute. */
export const CLOUD_EVENT_HEADER_SOURCE = "ce-source";
/** Kafka header mirroring the CloudEvent id attribute. */
export const CLOUD_EVENT_HEADER_ID = "ce-id";

/** Header containing the scheduler record kind. */
export const PROTOUTIL_HEADER_KIND = "protoutil-pubsub-kind";
/** Header containing the scheduler record format version. */
export const PROTOUTIL_HEADER_SCHEDULE_VERSION = "protoutil-pubsub-schedule-version";
/** Header containing the RFC 3339 not-before timestamp for a scheduled record. */
export const PROTOUTIL_HEADER_NOT_BEFORE = "protoutil-pubsub-not-before";
/** Header containing the target Kafka topic for a scheduled record. */
export const PROTOUTIL_HEADER_TARGET_TOPIC = "protoutil-pubsub-target-topic";
/** Header containing the target Kafka message key for a scheduled record. */
export const PROTOUTIL_HEADER_TARGET_KEY = "protoutil-pubsub-target-key";
/** Header containing the timestamp when a scheduled record was delivered. */
export const PROTOUTIL_HEADER_DELIVERED_AT = "protoutil-pubsub-delivered-at";
/** Header containing the one-based delivery attempt count. */
export const PROTOUTIL_HEADER_ATTEMPT = "protoutil-pubsub-attempt";

/** Header containing the final disposition written to a dead-letter record. */
export const PROTOUTIL_HEADER_DISPOSITION = "protoutil-pubsub-disposition";
/** Header containing the original Kafka topic for a dead-letter record. */
export const PROTOUTIL_HEADER_ORIGINAL_TOPIC = "protoutil-pubsub-original-topic";
/** Header containing the original Kafka partition for a dead-letter record. */
export const PROTOUTIL_HEADER_ORIGINAL_PARTITION = "protoutil-pubsub-original-partition";
/** Header containing the original Kafka offset for a dead-letter record. */
export const PROTOUTIL_HEADER_ORIGINAL_OFFSET = "protoutil-pubsub-original-offset";

/** Current durable scheduler record format version. */
export const SCHEDULE_RECORD_VERSION = "1";
/** Scheduler record kind for a delayed publish. */
export const SCHEDULE_KIND_SCHEDULE = "schedule";
/** Scheduler record kind for a delayed retry. */
export const SCHEDULE_KIND_RETRY = "retry";
/** Scheduler history record kind. */
export const SCHEDULE_KIND_HISTORY = "history";

/** Read a Kafka header as a string regardless of the client representation. */
export function stringHeader(
  headers: KafkaJS.IHeaders | undefined,
  key: string,
): string | undefined {
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

/** Read a positive integer Kafka header. */
export function numberHeader(
  headers: KafkaJS.IHeaders | undefined,
  key: string,
): number | undefined {
  const value = stringHeader(headers, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
