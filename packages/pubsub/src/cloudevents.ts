import {
  create,
  type DescMessage,
  type DescMethodUnary,
  fromBinary,
  type Message,
  type MessageInitShape,
  type MessageShape,
  toBinary,
} from "@bufbuild/protobuf";
import { anyPack, anyUnpack, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { InvalidInputPubSubError } from "./errors.js";
import {
  type CloudEvent_CloudEventAttributeValue,
  type CloudEvent_CloudEventAttributeValueSchema,
  CloudEventSchema,
} from "./gen/io/cloudevents/v1/cloudevents_pb.js";
import type { CloudEvent, CloudEventMetadataValue, PublishOptions } from "./types.js";

const SPEC_VERSION = "1.0";

/**
 * Content type used for CloudEvents that carry protobuf binary data.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#datacontenttype | CloudEvents datacontenttype}
 */
export const PROTOBUF_CONTENT_TYPE = "application/protobuf";

/**
 * Fully-resolved options required to materialize a CloudEvent.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | CloudEvents specification}
 */
export interface BuildCloudEventOptions extends PublishOptions {
  /** Resolved CloudEvent source. */
  source: string;
  /** Resolved CloudEvent type. */
  type: string;
}

/**
 * Build a CloudEvent protobuf message from a typed protobuf payload.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | CloudEvents specification}
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/formats/protobuf-format.md | CloudEvents protobuf format}
 */
export function buildCloudEvent<TSchema extends DescMessage>(
  schema: TSchema,
  payload: MessageShape<TSchema>,
  options: BuildCloudEventOptions,
): CloudEvent {
  const time = options.time ?? new Date();
  // Build a complete init object first so create() only runs once at the final
  // CloudEvent boundary.
  const attributes: Record<
    string,
    MessageInitShape<typeof CloudEvent_CloudEventAttributeValueSchema>
  > = {
    time: timestampAttribute(typeof time === "string" ? new Date(time) : time),
    datacontenttype: stringAttribute(PROTOBUF_CONTENT_TYPE),
    dataschema: stringAttribute(schema.typeName),
  };

  if (options.metadata) {
    for (const [key, value] of Object.entries(options.metadata)) {
      attributes[key] = extensionAttribute(value);
    }
  }
  if (options.notBefore) {
    attributes.notbefore = attribute({ case: "ceTimestamp", value: options.notBefore });
  }

  return create(CloudEventSchema, {
    id: options.id ?? crypto.randomUUID(),
    source: options.source,
    specVersion: SPEC_VERSION,
    type: options.type,
    attributes,
    data: { case: "protoData", value: anyPack(schema, payload) },
  });
}

/**
 * Decode the protobuf payload from a CloudEvent as the requested message schema.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/formats/protobuf-format.md | CloudEvents protobuf format}
 */
export function parseCloudEventData<TSchema extends DescMessage>(
  schema: TSchema,
  event: CloudEvent,
): Message {
  if (event.data.case !== "protoData") {
    throw new InvalidInputPubSubError(`CloudEvent ${event.id} does not contain protobuf data`);
  }
  const message = anyUnpack(event.data.value, schema);
  if (!message) {
    throw new InvalidInputPubSubError(`CloudEvent ${event.id} data is not ${schema.typeName}`);
  }
  return message;
}

/**
 * Convert a JavaScript Date into a protobuf Timestamp for publish `notBefore`.
 *
 * @see {@link https://protobuf.dev/reference/protobuf/google.protobuf/#timestamp | google.protobuf.Timestamp}
 */
export function notBeforeFromDate(date: Date): ReturnType<typeof timestampFromDate> {
  return timestampFromDate(date);
}

/**
 * Build a CloudEvent for a specific protobuf service method and payload init object.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | CloudEvents specification}
 */
export function cloudEventForMethod<TSchema extends DescMessage>(
  method: DescMethodUnary<TSchema>,
  payload: MessageInitShape<TSchema>,
  options: BuildCloudEventOptions,
): CloudEvent {
  // The public API accepts plain message init objects. Materialize the protobuf
  // payload here, then wrap it as CloudEvent data.
  return buildCloudEvent(method.input, create(method.input, payload), options);
}

/**
 * Create a CloudEvent string attribute init value.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#context-attributes | CloudEvents context attributes}
 */
export function stringAttribute(
  value: string,
): MessageInitShape<typeof CloudEvent_CloudEventAttributeValueSchema> {
  return attribute({ case: "ceString", value });
}

/**
 * Create a CloudEvent timestamp attribute init value from a JavaScript Date.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#time | CloudEvents time}
 */
export function timestampAttribute(
  value: Date,
): MessageInitShape<typeof CloudEvent_CloudEventAttributeValueSchema> {
  return attribute({ case: "ceTimestamp", value: timestampFromDate(value) });
}

/**
 * Convert a supported metadata value into a CloudEvent extension attribute init value.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#extension-context-attributes | CloudEvents extension attributes}
 */
export function extensionAttribute(
  value: CloudEventMetadataValue,
): MessageInitShape<typeof CloudEvent_CloudEventAttributeValueSchema> {
  if (typeof value === "boolean") {
    return attribute({ case: "ceBoolean", value });
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return attribute({ case: "ceInteger", value });
  }
  if (value instanceof Uint8Array) {
    return attribute({ case: "ceBytes", value });
  }
  return stringAttribute(String(value));
}

/** Wrap one CloudEvent attribute union case in the generated init shape. */
function attribute(
  attr: CloudEvent_CloudEventAttributeValue["attr"],
): MessageInitShape<typeof CloudEvent_CloudEventAttributeValueSchema> {
  // Return the init shape so callers can compose larger message trees before
  // the final create() call.
  return { attr };
}

/** Encode a CloudEvent protobuf message as bytes. */
export function cloudEventBytes(event: CloudEvent): Buffer {
  return Buffer.from(toBinary(CloudEventSchema, event));
}

/** Decode a CloudEvent protobuf message from bytes. */
export function cloudEventFromBytes(value: Uint8Array): CloudEvent {
  return fromBinary(CloudEventSchema, value);
}
