import type { DescMethodUnary } from "@bufbuild/protobuf";
import type { PublisherOptions, PublisherTransport, PublishOptions } from "./types.js";

/** Library fallback CloudEvent source when no publish, publisher, or transport source is set. */
export const DEFAULT_SOURCE = "protoutil.pubsub";

/** Resolve the transport topic for a publish call. */
export function resolveTopic(method: DescMethodUnary, options?: PublishOptions): string {
  // Topic is for broker routing. CloudEvent type remains the semantic identity
  // that subscribers use to select handlers.
  return options?.topic ?? method.name ?? method.input.typeName;
}

/**
 * Resolve the semantic CloudEvent type for a publish call.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#type | CloudEvents type}
 */
export function resolveCloudEventType(method: DescMethodUnary, options?: PublishOptions): string {
  return options?.type ?? method.name ?? method.input.typeName;
}

/**
 * Resolve the CloudEvent source from publish, publisher, transport, then library defaults.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#source-1 | CloudEvents source}
 */
export function resolveCloudEventSource(
  transport: PublisherTransport,
  clientOptions?: PublisherOptions,
  publishOptions?: PublishOptions,
): string {
  return (
    publishOptions?.source ?? clientOptions?.source ?? transport.defaultSource ?? DEFAULT_SOURCE
  );
}
