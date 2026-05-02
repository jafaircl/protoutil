import type { DescMethodUnary } from "@bufbuild/protobuf";
import type { GenService, GenServiceMethods } from "@bufbuild/protobuf/codegenv2";
import type { CreateRouterOptions, PublisherOptions, TopicConfig } from "./types.js";

/** Resolve the fully qualified protobuf method name used for semantic defaults. */
export function methodEventType(method: DescMethodUnary): string {
  const parentTypeName = (method as DescMethodUnary & { parent?: { typeName?: string } }).parent
    ?.typeName;
  return parentTypeName ? `${parentTypeName}.${method.name}` : method.name;
}

/** Resolve the broker topic for a protobuf method from a shared topic config. */
export function methodTopic<TService extends GenService<GenServiceMethods>>(
  method: DescMethodUnary,
  topicConfig?: TopicConfig<TService>,
): string {
  if (typeof topicConfig === "string") {
    return topicConfig;
  }
  const topic = topicConfig?.[method.localName as keyof typeof topicConfig];
  return topic ?? methodEventType(method);
}

/** Resolve the dead-letter topic for one service registration. */
export function serviceDeadLetterTopic(
  service: GenService<GenServiceMethods>,
  options?: CreateRouterOptions,
): string {
  return options?.deadLetterTopic ?? `${service.typeName}.__deadletter`;
}

/** Resolve a publish topic with per-call override precedence. */
export function publisherMethodTopic<TService extends GenService<GenServiceMethods>>(
  method: DescMethodUnary,
  options?: PublisherOptions<TService>,
  publishTopic?: string,
): string {
  return publishTopic ?? methodTopic(method, options?.topic);
}

/** Deduplicate topics while preserving first occurrence order. */
export function uniqueTopics(topics: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const topic of topics) {
    if (seen.has(topic)) {
      continue;
    }
    seen.add(topic);
    result.push(topic);
  }
  return result;
}
