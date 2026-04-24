import { fromBinary, toBinary } from "@bufbuild/protobuf";
import type { KafkaJS } from "@confluentinc/kafka-javascript";
import { type CloudEvent, CloudEventSchema } from "../gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  CLOUD_EVENT_HEADER_ID,
  CLOUD_EVENT_HEADER_SOURCE,
  CLOUD_EVENT_HEADER_SPEC_VERSION,
  CLOUD_EVENT_HEADER_TYPE,
  KAFKA_CONTENT_TYPE_PROTOBUF,
  KAFKA_HEADER_CONTENT_TYPE,
} from "./headers.js";

/** Convert a CloudEvent protobuf message into a Kafka message. */
export function cloudEventMessage(event: CloudEvent, headers?: KafkaJS.IHeaders): KafkaJS.Message {
  return {
    key: event.id,
    value: cloudEventBytes(event),
    headers: {
      // Mirror key CloudEvent attributes into Kafka headers so operators and
      // tooling can inspect records without decoding protobuf bytes.
      [KAFKA_HEADER_CONTENT_TYPE]: KAFKA_CONTENT_TYPE_PROTOBUF,
      [CLOUD_EVENT_HEADER_SPEC_VERSION]: event.specVersion,
      [CLOUD_EVENT_HEADER_TYPE]: event.type,
      [CLOUD_EVENT_HEADER_SOURCE]: event.source,
      [CLOUD_EVENT_HEADER_ID]: event.id,
      ...headers,
    },
  };
}

/** Encode a CloudEvent protobuf message as bytes. */
export function cloudEventBytes(event: CloudEvent): Buffer {
  return Buffer.from(toBinary(CloudEventSchema, event));
}

/** Decode a CloudEvent protobuf message from Kafka message bytes. */
export function cloudEventFromBytes(value: Uint8Array): CloudEvent {
  return fromBinary(CloudEventSchema, value);
}
