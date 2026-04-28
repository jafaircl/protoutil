import type { DescMethodUnary } from "@bufbuild/protobuf";
import type { GenService, GenServiceMethods } from "@bufbuild/protobuf/codegenv2";
import { DEFAULT_SOURCE } from "./resolvers.js";
import {
  methodEventType,
  methodTopic,
  publisherMethodTopic,
  serviceDeadLetterTopic,
  uniqueTopics,
} from "./topics.js";
import type {
  CreateRouterOptions,
  PublisherOptions,
  PublisherTransport,
  PublishOptions,
  SubscribeOptions,
  SubscribeRequest,
} from "./types.js";

export function resolvePublisherOptions<TService extends GenService<GenServiceMethods>>(
  method: DescMethodUnary,
  transport: PublisherTransport,
  publisherOptions: PublisherOptions<TService> | undefined,
  publishOptions: PublishOptions | undefined,
) {
  return {
    topic: publisherMethodTopic(method, publisherOptions, publishOptions?.topic),
    type: publishOptions?.type ?? methodEventType(method),
    source:
      publishOptions?.source ??
      publisherOptions?.source ??
      transport.defaultSource ??
      DEFAULT_SOURCE,
  };
}

export function resolveRouterOptions<TService extends GenService<GenServiceMethods>>(
  service: TService,
  method: DescMethodUnary,
  routerOptions: CreateRouterOptions<TService> | undefined,
) {
  return {
    topic: methodTopic(method, routerOptions?.topic),
    deadLetterTopic: serviceDeadLetterTopic(service, routerOptions),
    type: methodEventType(method),
  };
}

export function resolveSubscribeRequest(
  routes: Iterable<{ topic: string; deadLetterTopic: string }>,
  options?: SubscribeOptions,
): SubscribeRequest {
  const routeList = [...routes];
  return {
    ...options,
    topics: uniqueTopics(routeList.map((route) => route.topic)),
    deadLetterTopic: routeList[0]?.deadLetterTopic,
  };
}
