import type { KafkaJS } from "@confluentinc/kafka-javascript";
import { cloudEventBytes } from "../cloudevents.js";
import type { CloudEvent } from "../gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  CLOUD_EVENT_HEADER_ID,
  CLOUD_EVENT_HEADER_SOURCE,
  CLOUD_EVENT_HEADER_SPEC_VERSION,
  CLOUD_EVENT_HEADER_TYPE,
  CONTENT_TYPE_PROTOBUF,
  HEADER_CONTENT_TYPE,
} from "../headers.js";

/** Convert a CloudEvent protobuf message into a Kafka message. */
export function cloudEventMessage(event: CloudEvent, headers?: KafkaJS.IHeaders): KafkaJS.Message {
  return {
    key: event.id,
    value: cloudEventBytes(event),
    headers: {
      [HEADER_CONTENT_TYPE]: CONTENT_TYPE_PROTOBUF,
      [CLOUD_EVENT_HEADER_SPEC_VERSION]: event.specVersion,
      [CLOUD_EVENT_HEADER_TYPE]: event.type,
      [CLOUD_EVENT_HEADER_SOURCE]: event.source,
      [CLOUD_EVENT_HEADER_ID]: event.id,
      ...headers,
    },
  };
}
