import {
  create,
  type DescMessage,
  type DescMethodUnary,
  type MessageInitShape,
} from "@bufbuild/protobuf";
import type { GenService, GenServiceMethods } from "@bufbuild/protobuf/codegenv2";
import { buildCloudEvent } from "./cloudevents.js";
import { resolveCloudEventSource, resolveCloudEventType, resolveTopic } from "./resolvers.js";
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
  options?: PublisherOptions,
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
  clientOptions: PublisherOptions | undefined,
  payload: MessageInitShape<DescMessage>,
  options?: PublishOptions,
) {
  // Resolve all routing semantics before the transport sees the request so the
  // transport only deals with an explicit topic plus a finished CloudEvent.
  const topic = resolveTopic(method, options);
  const type = resolveCloudEventType(method, options);
  const source = resolveCloudEventSource(transport, clientOptions, options);
  const event = buildCloudEvent(method.input, create(method.input, payload), {
    ...options,
    source,
    type,
  });
  await transport.publish({ topic, event, notBefore: options?.notBefore });
}
