import type { DescMethodUnary } from "@bufbuild/protobuf";
import type { GenService, GenServiceMethods } from "@bufbuild/protobuf/codegenv2";
import { methodEventType, publisherMethodTopic } from "./topics.js";
import type { PublisherOptions, PublisherTransport, PublishOptions } from "./types.js";

/** Library fallback CloudEvent source when no publish, publisher, or transport source is set. */
export const DEFAULT_SOURCE = "protoutil.pubsub";

/** Resolve the transport topic for a publish call. */
export function resolveTopic(method: DescMethodUnary, options?: PublishOptions): string {
  return publisherMethodTopic(method, undefined, options?.topic);
}

/**
 * Resolve the semantic CloudEvent type for a publish call.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#type | CloudEvents type}
 */
export function resolveCloudEventType(method: DescMethodUnary, options?: PublishOptions): string {
  return options?.type ?? methodEventType(method);
}

/**
 * Resolve the CloudEvent source from publish, publisher, transport, then library defaults.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#source-1 | CloudEvents source}
 */
export function resolveCloudEventSource(
  transport: PublisherTransport,
  clientOptions?: PublisherOptions<GenService<GenServiceMethods>>,
  publishOptions?: PublishOptions,
): string {
  return (
    publishOptions?.source ?? clientOptions?.source ?? transport.defaultSource ?? DEFAULT_SOURCE
  );
}
