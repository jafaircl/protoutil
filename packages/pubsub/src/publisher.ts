import {
  create,
  type DescMessage,
  type DescMethodUnary,
  type MessageInitShape,
} from "@bufbuild/protobuf";
import type { GenService, GenServiceMethods } from "@bufbuild/protobuf/codegenv2";
import { buildCloudEvent } from "./cloudevents.js";
import { resolvePublisherOptions } from "./options.js";
import { unaryMethods } from "./service.js";
import type {
  EventPublisher,
  PublisherOptions,
  PublisherTransport,
  PublishOptions,
} from "./types.js";

/**
 * Create a method-shaped event publisher for a generated protobuf service.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | CloudEvents specification}
 */
export function createPublisher<TService extends GenService<GenServiceMethods>>(
  service: TService,
  transport: PublisherTransport,
  options?: PublisherOptions<TService>,
): EventPublisher<TService> {
  const publisher = {} as EventPublisher<TService>;
  for (const method of unaryMethods(service)) {
    // Mirror the generated service surface so publishers feel like method calls
    // even though the transport underneath is event driven.
    Object.assign(publisher, {
      [method.localName]: async (
        payload: MessageInitShape<DescMessage>,
        publishOptions?: PublishOptions,
      ) => {
        await publish(method, transport, options, payload, publishOptions);
      },
    });
  }
  return publisher;
}

/** Publish one protobuf method payload as a fully resolved CloudEvent. */
async function publish(
  method: DescMethodUnary,
  transport: PublisherTransport,
  clientOptions: PublisherOptions<GenService<GenServiceMethods>> | undefined,
  payload: MessageInitShape<DescMessage>,
  options?: PublishOptions,
) {
  const resolved = resolvePublisherOptions(method, transport, clientOptions, options);
  const event = buildCloudEvent(method.input, create(method.input, payload), {
    ...options,
    source: resolved.source,
    type: resolved.type,
  });
  await transport.publish({ topic: resolved.topic, event, notBefore: options?.notBefore });
}
