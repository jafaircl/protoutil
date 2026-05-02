import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { create, fromJson, toJson } from "@bufbuild/protobuf";
import { anyPack, anyUnpack } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import {
  type CloudEvent_CloudEventAttributeValue,
  CloudEventSchema,
} from "../../pubsub/src/gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  AlphaEventSchema,
  BetaEventSchema,
  ConformanceEvents,
} from "../../pubsub/src/gen/protoutil/pubsub/testing/v1/events_pb.js";
import {
  createPublisher,
  createRouter,
  type DeliveryHandler,
  type DispositionKind,
  InMemoryPubSubTransport,
  InvalidInputPubSubError,
  type PublishRequest,
  type PubSubTransport,
  type SubscribeRequest,
  type Subscription,
  TransientPubSubError,
  UnrecoverablePubSubError,
} from "../../pubsub/src/index.js";
import {
  type Case,
  CaseKind,
  HandlerBehavior,
  type Metadata,
  type PublishOptions,
  SuiteSchema,
} from "./gen/protoutil/conformance/pubsub/v1/cases_pb.js";

const DELAYED_PUBLISH_ERROR = "Delayed publish requires a scheduler";
const DELAYED_RETRY_ERROR = "Delayed retry requires a scheduler";

describe("pubsub conformance", async () => {
  const suites = await loadSuites();

  for (const suite of suites) {
    describe(suite.name, () => {
      for (const section of suite.section) {
        describe(section.name, () => {
          for (const testCase of section.test) {
            it(testCase.name, async () => {
              await runCase(testCase);
            });
          }
        });
      }
    });
  }
});

async function loadSuites() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const dir = join(repoRoot, "conformance/generated/pubsub");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const suites = [];
  for (const file of files) {
    const json = JSON.parse(await readFile(join(dir, file), "utf8"));
    suites.push(fromJson(SuiteSchema, json));
  }
  return suites;
}

async function runCase(test: Case) {
  switch (test.kind) {
    case CaseKind.CLOUDEVENT_MATERIALIZATION:
    case CaseKind.METADATA_PROPAGATION:
    case CaseKind.TOPIC_PRECEDENCE:
    case CaseKind.TYPE_PRECEDENCE:
    case CaseKind.DELAYED_PUBLISH:
      await runPublishCase(test);
      return;
    case CaseKind.SOURCE_PRECEDENCE:
      await runSourceCase(test);
      return;
    case CaseKind.ROUTE_BY_TYPE:
      await runRouteCase(test);
      return;
    case CaseKind.DISPOSITION:
    case CaseKind.DELAYED_RETRY:
      await runDispositionCase(test);
      return;
    case CaseKind.CLOUDEVENT_PARSE_FAILURE:
      await runParseFailureCase(test);
      return;
    case CaseKind.SUBSCRIBE_RESOLUTION:
      await runSubscribeResolutionCase(test);
      return;
    default:
      throw new Error(`${test.name}: unsupported case kind ${test.kind}`);
  }
}

async function runPublishCase(test: Case) {
  expect(test.publish, `${test.name}: missing publish`).toBeDefined();
  if (!test.publish) return;
  const transport = new ConformanceTransport({
    schedulerAvailable: test.transportFeatures?.schedulerAvailable,
  });
  const client = createPublisher(ConformanceEvents, transport, {
    source: "client-source",
    topic: publisherTopicConfig(test),
  });
  const publish = publishFixture(client, test);
  if (test.expectedErrorContains) {
    await expect(publish).rejects.toThrow(test.expectedErrorContains);
    return;
  }
  await publish;
  const published = transport.published[0];

  if (test.expectedTopic) {
    expect(published.topic).toBe(test.expectedTopic);
  }
  if (test.expectedValue && test.kind === CaseKind.TYPE_PRECEDENCE) {
    expect(published.event.type).toBe(test.expectedValue);
  }
  if (test.expectedEvent) {
    const expected = test.expectedEvent;
    if (expected.source) expect(published.event.source).toBe(expected.source);
    if (expected.specversion) expect(published.event.specVersion).toBe(expected.specversion);
    if (expected.type) expect(published.event.type).toBe(expected.type);
    if (expected.dataschema)
      expect(stringAttr(published.event.attributes.dataschema)).toBe(expected.dataschema);
    if (expected.datacontenttype) {
      expect(stringAttr(published.event.attributes.datacontenttype)).toBe(expected.datacontenttype);
    }
    if (expected.dataJson) {
      expect(published.event.data.case).toBe("protoData");
      if (published.event.data.case === "protoData") {
        const schema = test.publish.method === "betaHappened" ? BetaEventSchema : AlphaEventSchema;
        const message = anyUnpack(published.event.data.value, schema);
        expect(message).toBeDefined();
        if (message) {
          expect(JSON.stringify(toJson(schema, message))).toBe(expected.dataJson);
        }
      }
    }
    for (const metadata of expected.metadata) {
      expect(attributeValue(published.event.attributes[metadata.key])).toEqual(
        metadataValue(metadata),
      );
    }
    if (expected.notBefore) {
      expect(published.notBefore).toEqual(expected.notBefore);
      expect(published.event.attributes.notbefore.attr.value).toEqual(expected.notBefore);
    }
  }
}

async function runSourceCase(test: Case) {
  const transport = new InMemoryPubSubTransport({
    defaultSource: test.sourceDefaults?.transportDefault || undefined,
  });
  const client = createPublisher(ConformanceEvents, transport, {
    source: test.sourceDefaults?.clientDefault || undefined,
  });
  await client.alphaHappened(
    { eventId: "evt_123", name: "alpha" },
    publishOptions(test.publish?.options),
  );
  expect(transport.published[0].event.source).toBe(test.expectedValue);
}

async function runRouteCase(test: Case) {
  expect(test.publish, `${test.name}: missing publish`).toBeDefined();
  if (!test.publish) return;
  const transport = new ConformanceTransport();
  const router = createRouter(ConformanceEvents, transport, routerConfig(test));
  let routed = false;
  router.service({
    async alphaHappened(request) {
      routed = request.eventId === "evt_123";
    },
  });
  await router.subscribe();
  const client = createPublisher(ConformanceEvents, transport, { source: "conformance-service" });
  await client.alphaHappened(alphaPayload(test), publishOptions(test.publish.options));
  expect(routed).toBe(true);
  assertDisposition(transport.dispositions[0], test.expectedDisposition?.kind ?? "ack", test.name);
}

async function runDispositionCase(test: Case) {
  if (test.expectedErrorContains) {
    const transport = new ConformanceTransport({
      schedulerAvailable: test.transportFeatures?.schedulerAvailable,
    });
    const router = createRouter(ConformanceEvents, transport, routerConfig(test));
    router.service({
      async alphaHappened(_request, context) {
        await context.retry({ delay: test.expectedDisposition?.delay });
      },
    });
    await router.subscribe();
    const client = createPublisher(ConformanceEvents, transport, {
      source: "conformance-service",
      topic: publisherTopicConfig(test),
    });
    await expect(client.alphaHappened({ eventId: "evt_123", name: "alpha" })).rejects.toThrow(
      test.expectedErrorContains,
    );
    return;
  }

  const router = createRouter(ConformanceEvents, new InMemoryPubSubTransport());
  if (test.handlerBehavior !== HandlerBehavior.UNKNOWN_ROUTE) {
    router.service({
      async alphaHappened(_request, context) {
        switch (test.handlerBehavior) {
          case HandlerBehavior.SUCCESS:
            return;
          case HandlerBehavior.TRANSIENT:
            throw new TransientPubSubError("try again");
          case HandlerBehavior.INVALID:
            throw new InvalidInputPubSubError("bad payload");
          case HandlerBehavior.UNRECOVERABLE:
            throw new UnrecoverablePubSubError("stop");
          case HandlerBehavior.RETRY_DELAY:
            await context.retry({ delay: test.expectedDisposition?.delay });
            return;
          case HandlerBehavior.ACK:
            await context.ack();
            return;
          case HandlerBehavior.REJECT:
            await context.reject();
            return;
          case HandlerBehavior.DEAD_LETTER:
            await context.deadLetter();
            return;
          default:
            return;
        }
      },
    });
  }

  const clientTransport = new InMemoryPubSubTransport();
  const client = createPublisher(ConformanceEvents, clientTransport, {
    source: "conformance-service",
  });
  await client.alphaHappened({ eventId: "evt_123", name: "alpha" });
  const event = clientTransport.published[0].event;
  if (test.handlerBehavior === HandlerBehavior.UNKNOWN_ROUTE) {
    event.type = "Missing";
  }
  const disposition = await router.dispatch({ event });
  assertDisposition(disposition, test.expectedDisposition?.kind ?? "ack", test.name);
  if (test.expectedDisposition?.delay) {
    expect(disposition.delay).toEqual(test.expectedDisposition.delay);
  }
}

async function runSubscribeResolutionCase(test: Case) {
  const transport = new ConformanceTransport();
  const router = createRouter(ConformanceEvents, transport, routerConfig(test));
  router.service({
    async alphaHappened() {},
    async betaHappened() {},
  });

  await router.subscribe();
  const request = transport.subscribeRequests[0];
  expect(request, `${test.name}: expected one subscribe request`).toBeDefined();
  if (!request) {
    return;
  }
  if (test.expectedSubscribe?.topics.length) {
    expect(request.topics).toEqual(test.expectedSubscribe.topics);
  }
  if (test.expectedSubscribe?.deadLetterTopic) {
    expect(request.deadLetterTopic).toBe(test.expectedSubscribe.deadLetterTopic);
  }
}

async function runParseFailureCase(test: Case) {
  const router = createRouter(ConformanceEvents, new InMemoryPubSubTransport());
  router.service({
    async alphaHappened() {},
  });

  const event = test.publish
    ? create(CloudEventSchema, {
        id: "wrong-proto-data",
        source: "conformance-service",
        specVersion: "1.0",
        type: "protoutil.pubsub.testing.v1.ConformanceEvents.AlphaHappened",
        data: {
          case: "protoData",
          value: anyPack(
            BetaEventSchema,
            create(BetaEventSchema, {
              eventId: test.publish.payload?.eventId || "evt_456",
              detail: test.publish.payload?.detail || "beta-detail",
              active: test.publish.payload?.active,
            }),
          ),
        },
      })
    : create(CloudEventSchema, {
        id: "text-data",
        source: "conformance-service",
        specVersion: "1.0",
        type: "protoutil.pubsub.testing.v1.ConformanceEvents.AlphaHappened",
        data: { case: "textData", value: "not protobuf" },
      });

  const disposition = await router.dispatch({ event });
  assertDisposition(disposition, test.expectedDisposition?.kind ?? "reject", test.name);
}

async function publishFixture(
  client: ReturnType<typeof createPublisher<typeof ConformanceEvents>>,
  test: Case,
) {
  if (test.publish?.method === "betaHappened") {
    await client.betaHappened(betaPayload(test), publishOptions(test.publish.options));
    return;
  }
  await client.alphaHappened(alphaPayload(test), publishOptions(test.publish?.options));
}

function alphaPayload(test: Case) {
  return {
    eventId: test.publish?.payload?.eventId ?? "evt_123",
    name: test.publish?.payload?.name ?? "alpha",
    count: test.publish?.payload?.count,
  };
}

function betaPayload(test: Case) {
  return {
    eventId: test.publish?.payload?.eventId ?? "evt_456",
    detail: test.publish?.payload?.detail ?? "beta-detail",
    active: test.publish?.payload?.active,
  };
}

function publishOptions(options?: PublishOptions) {
  if (!options) return undefined;
  return {
    topic: options.topic || undefined,
    type: options.type || undefined,
    source: options.source || undefined,
    metadata: Object.fromEntries(
      options.metadata.map((metadata) => [metadata.key, metadataValue(metadata)]),
    ),
    notBefore: options.notBefore,
  };
}

function publisherTopicConfig(test: Case) {
  const defaults = test.publisherDefaults;
  const topicByMethod = Object.fromEntries(
    (defaults?.topicByMethod ?? []).map((binding) => [binding.method, binding.topic]),
  );
  const hasMethodBindings = Object.keys(topicByMethod).length > 0;
  if (hasMethodBindings) {
    return defaults?.topic ? { ...topicByMethod } : topicByMethod;
  }
  return defaults?.topic || undefined;
}

function routerConfig(test: Case) {
  const config = test.routerConfig;
  const topicByMethod = Object.fromEntries(
    (config?.topicByMethod ?? []).map((binding) => [binding.method, binding.topic]),
  );
  const hasMethodBindings = Object.keys(topicByMethod).length > 0;
  return {
    topic: hasMethodBindings ? topicByMethod : (config?.topic || undefined),
    deadLetterTopic: config?.deadLetterTopic || undefined,
  };
}

function stringAttr(value: CloudEvent_CloudEventAttributeValue | undefined) {
  return value?.attr.value;
}

function attributeValue(value: CloudEvent_CloudEventAttributeValue | undefined) {
  return value?.attr.value;
}

function metadataValue(metadata: Metadata) {
  switch (metadata.value.case) {
    case "boolValue":
    case "intValue":
    case "stringValue":
      return metadata.value.value;
    default:
      return "";
  }
}

function assertDisposition(
  disposition: { kind: DispositionKind },
  expected: string,
  _name: string,
) {
  expect(disposition.kind).toBe(expected);
}

class ConformanceTransport implements PubSubTransport {
  public readonly published: PublishRequest[] = [];
  public readonly dispositions: { kind: DispositionKind }[] = [];
  public readonly subscribeRequests: SubscribeRequest[] = [];
  public defaultSource?: string;
  #handler?: DeliveryHandler;
  #schedulerAvailable: boolean;

  public constructor(options?: { defaultSource?: string; schedulerAvailable?: boolean }) {
    this.defaultSource = options?.defaultSource;
    this.#schedulerAvailable = options?.schedulerAvailable ?? true;
  }

  public async publish(request: PublishRequest): Promise<void> {
    if (request.notBefore && !this.#schedulerAvailable) {
      throw new Error(DELAYED_PUBLISH_ERROR);
    }
    this.published.push(request);
    if (!this.#handler) {
      return;
    }
    const disposition = await this.#handler({ event: request.event, topic: request.topic });
    if (disposition.kind === "retry" && disposition.delay && !this.#schedulerAvailable) {
      throw new Error(DELAYED_RETRY_ERROR);
    }
    this.dispositions.push(disposition);
  }

  public async subscribe(
    handler: DeliveryHandler,
    request: SubscribeRequest,
  ): Promise<Subscription> {
    this.subscribeRequests.push(request);
    this.#handler = handler;
    return {
      unsubscribe: async () => {
        this.#handler = undefined;
      },
    };
  }

  public async close(): Promise<void> {
    this.#handler = undefined;
  }
}
