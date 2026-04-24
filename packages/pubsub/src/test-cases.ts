import { durationFromMs, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { expect } from "vitest";
import { ConformanceEvents } from "./gen/protoutil/pubsub/testing/v1/events_pb.js";
import { createPublisher } from "./publisher.js";
import { createRouter } from "./router.js";
import type { PubSubTransport, PubSubTransportObserver } from "./types.js";

const DELIVERY_TIMEOUT_MS = 10_000;
const DEFAULT_LOAD_EVENT_COUNT = 1_000;
const DEFAULT_LOAD_NOT_BEFORE_MS = 1_000;
const DEFAULT_LOAD_PUBLISH_CONCURRENCY = 50;
const DEFAULT_LOAD_SUBSCRIBE_CONCURRENCY = 32;

export interface PubSubTransportTestContext {
  transport(options?: TransportOptions): PubSubTransport;
  topic(name: string): string;
  scheduler(name: string): SchedulerOptions;
}

export interface TransportOptions {
  subscribeTopics?: string[];
  scheduler?: SchedulerOptions;
  deadLetterTopic?: string;
  observer?: PubSubTransportObserver;
}

export interface SchedulerOptions {
  schedulesTopic: string;
  historyTopic: string;
  consumerGroup?: string;
}

export interface PubSubTransportCase {
  name: string;
  run(ctx: PubSubTransportTestContext): Promise<void> | void;
}

export interface PubSubTransportCaseGroup {
  group: string;
  cases: PubSubTransportCase[];
}

export const groups: PubSubTransportCaseGroup[] = [
  {
    group: "publish and subscribe",
    cases: [
      {
        name: "publishes and consumes events through the pubsub API",
        async run(ctx) {
          const topic = ctx.topic("events");
          const transport = ctx.transport({ subscribeTopics: [topic] });
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "test-suite",
          });
          const router = createRouter(transport);
          let handledEventId = "";
          let handledAttempt = 0;

          router.service(ConformanceEvents, {
            async alphaHappened(request, handlerContext) {
              // These shared cases intentionally exercise the public API shape:
              // create publisher, create router, subscribe, publish, assert.
              handledEventId = request.eventId;
              handledAttempt = handlerContext.attempt;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await publisher.alphaHappened({ eventId: "evt_1", name: "alpha", count: 7 }, { topic });

          await expect.poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS }).toBe("evt_1");
          expect(handledAttempt).toBe(1);
          await subscription.unsubscribe();
        },
      },
      {
        name: "stops consuming after unsubscribe",
        async run(ctx) {
          const topic = ctx.topic("events");
          const transport = ctx.transport({ subscribeTopics: [topic] });
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "test-suite",
          });
          const router = createRouter(transport);
          let handledEventId = "";

          router.service(ConformanceEvents, {
            async alphaHappened(request, handlerContext) {
              handledEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await publisher.alphaHappened({ eventId: "evt_1", name: "alpha", count: 7 }, { topic });
          await expect.poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS }).toBe("evt_1");

          await subscription.unsubscribe();
          await publisher.alphaHappened(
            { eventId: "evt_2", name: "after unsubscribe", count: 8 },
            { topic },
          );

          await wait(300);
          expect(handledEventId).toBe("evt_1");
        },
      },
      {
        name: "publishes dead-letter dispositions to the configured dead-letter topic",
        async run(ctx) {
          const topic = ctx.topic("events");
          const deadLetterTopic = ctx.topic("dead_letter");
          const transport = ctx.transport({ subscribeTopics: [topic], deadLetterTopic });
          const deadLetterTransport = ctx.transport({ subscribeTopics: [deadLetterTopic] });
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "test-suite",
          });
          const router = createRouter(transport);
          const deadLetterRouter = createRouter(deadLetterTransport);
          let deadLetterEventId = "";

          router.service(ConformanceEvents, {
            async alphaHappened(_request, handlerContext) {
              await handlerContext.deadLetter();
            },
          });
          deadLetterRouter.service(ConformanceEvents, {
            async alphaHappened(request, handlerContext) {
              deadLetterEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });
          const deadLetterSubscription = await deadLetterRouter.subscribe({
            consumerGroup: ctx.topic("dead_letter_workers"),
          });

          await publisher.alphaHappened(
            { eventId: "evt_dead_letter", name: "dead letter", count: 15 },
            { topic },
          );

          await expect
            .poll(() => deadLetterEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_dead_letter");
          await subscription.unsubscribe();
          await deadLetterSubscription.unsubscribe();
        },
      },
    ],
  },
  {
    group: "scheduling",
    cases: [
      {
        name: "delivers scheduled publishes no earlier than notBefore",
        async run(ctx) {
          const topic = ctx.topic("events");
          const transport = ctx.transport({ subscribeTopics: [topic] });
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "test-suite",
          });
          const router = createRouter(transport);
          const notBefore = new Date(Date.now() + 1_000);
          let deliveredAt = 0;
          let handledEventId = "";

          router.service(ConformanceEvents, {
            async alphaHappened(request, handlerContext) {
              deliveredAt = Date.now();
              handledEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await publisher.alphaHappened(
            { eventId: "evt_2", name: "scheduled", count: 9 },
            { topic, notBefore: timestampFromDate(notBefore) },
          );

          await wait(300);
          expect(deliveredAt).toBe(0);

          await expect.poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS }).toBe("evt_2");
          expect(deliveredAt).toBeGreaterThanOrEqual(notBefore.getTime());
          await subscription.unsubscribe();
        },
      },
      {
        name: "uses the latest schedule for the same CloudEvent id",
        async run(ctx) {
          const topic = ctx.topic("events");
          const transport = ctx.transport({ subscribeTopics: [topic] });
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "test-suite",
          });
          const router = createRouter(transport);
          const firstNotBefore = new Date(Date.now() + 1_500);
          const secondNotBefore = new Date(Date.now() + 2_500);
          let deliveredAt = 0;
          let handledName = "";

          router.service(ConformanceEvents, {
            async alphaHappened(request, handlerContext) {
              deliveredAt = Date.now();
              handledName = request.name;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await publisher.alphaHappened(
            { eventId: "evt_replaced", name: "first", count: 1 },
            { id: "same-cloud-event-id", topic, notBefore: timestampFromDate(firstNotBefore) },
          );
          // Reusing the same CloudEvent id should replace the active durable
          // schedule record instead of creating two delayed deliveries.
          await publisher.alphaHappened(
            { eventId: "evt_replaced", name: "second", count: 2 },
            { id: "same-cloud-event-id", topic, notBefore: timestampFromDate(secondNotBefore) },
          );

          await wait(2_000);
          expect(deliveredAt).toBe(0);

          await expect.poll(() => handledName, { timeout: DELIVERY_TIMEOUT_MS }).toBe("second");
          expect(deliveredAt).toBeGreaterThanOrEqual(secondNotBefore.getTime());
          await subscription.unsubscribe();
        },
      },
      {
        name: "recovers scheduled publishes after transport restart",
        async run(ctx) {
          const topic = ctx.topic("events");
          const scheduler = ctx.scheduler("restart");
          const publishingTransport = ctx.transport({ subscribeTopics: [topic], scheduler });
          const publisher = createPublisher(ConformanceEvents, publishingTransport, {
            source: "test-suite",
          });
          const notBefore = new Date(Date.now() + 1_000);

          await publisher.alphaHappened(
            { eventId: "evt_recovered", name: "recovered", count: 10 },
            { topic, notBefore: timestampFromDate(notBefore) },
          );
          // Closing before notBefore forces the second transport instance to
          // recover delivery from broker state instead of process memory.
          await publishingTransport.close();

          const consumingTransport = ctx.transport({ subscribeTopics: [topic], scheduler });
          const router = createRouter(consumingTransport);
          let deliveredAt = 0;
          let handledEventId = "";

          router.service(ConformanceEvents, {
            async alphaHappened(request, handlerContext) {
              deliveredAt = Date.now();
              handledEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await expect
            .poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_recovered");
          expect(deliveredAt).toBeGreaterThanOrEqual(notBefore.getTime());
          await subscription.unsubscribe();
        },
      },
      {
        name: "recovers already-due scheduled publishes after transport restart",
        async run(ctx) {
          const topic = ctx.topic("events");
          const scheduler = ctx.scheduler("already_due");
          const publishingTransport = ctx.transport({ subscribeTopics: [topic], scheduler });
          const publisher = createPublisher(ConformanceEvents, publishingTransport, {
            source: "test-suite",
          });

          await publisher.alphaHappened(
            { eventId: "evt_due", name: "already due", count: 12 },
            { topic, notBefore: timestampFromDate(new Date(Date.now() - 1_000)) },
          );
          await publishingTransport.close();

          const consumingTransport = ctx.transport({ subscribeTopics: [topic], scheduler });
          const router = createRouter(consumingTransport);
          let handledEventId = "";

          router.service(ConformanceEvents, {
            async alphaHappened(request, handlerContext) {
              handledEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await expect.poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS }).toBe("evt_due");
          await subscription.unsubscribe();
        },
      },
      {
        name: "does not redeliver tombstoned schedules after transport restart",
        async run(ctx) {
          const topic = ctx.topic("events");
          const scheduler = ctx.scheduler("tombstone");
          let tombstoned = 0;
          const firstTransport = ctx.transport({
            subscribeTopics: [topic],
            scheduler,
            observer: {
              tombstoned() {
                tombstoned += 1;
              },
            },
          });
          const publisher = createPublisher(ConformanceEvents, firstTransport, {
            source: "test-suite",
          });
          const router = createRouter(firstTransport);
          let handledEventId = "";

          router.service(ConformanceEvents, {
            async alphaHappened(request, handlerContext) {
              handledEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await publisher.alphaHappened(
            { eventId: "evt_tombstoned", name: "tombstoned", count: 13 },
            { topic, notBefore: timestampFromDate(new Date(Date.now() + 500)) },
          );
          await expect
            .poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_tombstoned");
          await expect.poll(() => tombstoned, { timeout: DELIVERY_TIMEOUT_MS }).toBe(1);
          await subscription.unsubscribe();
          await firstTransport.close();

          let recoveredDeliveries = 0;
          const restartedTransport = ctx.transport({
            subscribeTopics: [topic],
            scheduler,
            observer: {
              delivered() {
                recoveredDeliveries += 1;
              },
            },
          });
          const restartedSubscription = await createRouter(restartedTransport).subscribe({
            consumerGroup: ctx.topic("restart_workers"),
          });

          await wait(800);
          expect(recoveredDeliveries).toBe(0);
          await restartedSubscription.unsubscribe();
        },
      },
      {
        name: "redelivers retries no earlier than delay",
        async run(ctx) {
          const topic = ctx.topic("events");
          const transport = ctx.transport({ subscribeTopics: [topic] });
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "test-suite",
          });
          const router = createRouter(transport);
          const retryDelayMs = 1_000;
          let attempts = 0;
          let retryDueAt = 0;
          let retryDeliveredAt = 0;
          let handledEventId = "";
          let handledAttempt = 0;

          router.service(ConformanceEvents, {
            async alphaHappened(request, handlerContext) {
              attempts += 1;
              if (attempts === 1) {
                // First delivery schedules the retry; the second delivery proves
                // the transport preserved both timing and attempt count.
                retryDueAt = Date.now() + retryDelayMs;
                await handlerContext.retry({ delay: durationFromMs(retryDelayMs) });
                return;
              }
              retryDeliveredAt = Date.now();
              handledEventId = request.eventId;
              handledAttempt = handlerContext.attempt;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await publisher.alphaHappened({ eventId: "evt_3", name: "retry", count: 11 }, { topic });

          await expect.poll(() => attempts, { timeout: DELIVERY_TIMEOUT_MS }).toBe(1);
          await wait(300);
          expect(retryDeliveredAt).toBe(0);

          await expect.poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS }).toBe("evt_3");
          expect(retryDeliveredAt).toBeGreaterThanOrEqual(retryDueAt);
          expect(handledAttempt).toBe(2);
          await subscription.unsubscribe();
        },
      },
      {
        name: "dead letters retries after maxAttempts is reached",
        async run(ctx) {
          const topic = ctx.topic("events");
          const deadLetterTopic = ctx.topic("retry_exhausted");
          let retryExhausted = 0;
          const transport = ctx.transport({
            subscribeTopics: [topic],
            deadLetterTopic,
            observer: {
              retryExhausted() {
                retryExhausted += 1;
              },
            },
          });
          const deadLetterTransport = ctx.transport({ subscribeTopics: [deadLetterTopic] });
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "test-suite",
          });
          const router = createRouter(transport);
          const deadLetterRouter = createRouter(deadLetterTransport);
          let deadLetterEventId = "";

          router.service(ConformanceEvents, {
            async alphaHappened(_request, handlerContext) {
              await handlerContext.retry({ delay: durationFromMs(1_000) });
            },
          });
          deadLetterRouter.service(ConformanceEvents, {
            async alphaHappened(request, handlerContext) {
              deadLetterEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
            maxAttempts: 1,
          });
          const deadLetterSubscription = await deadLetterRouter.subscribe({
            consumerGroup: ctx.topic("dead_letter_workers"),
          });

          await publisher.alphaHappened(
            { eventId: "evt_retry_exhausted", name: "retry exhausted", count: 16 },
            { topic },
          );

          await expect
            .poll(() => deadLetterEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_retry_exhausted");
          expect(retryExhausted).toBe(1);
          await subscription.unsubscribe();
          await deadLetterSubscription.unsubscribe();
        },
      },
    ],
  },
];

export const backendSpecificGroups: Record<string, PubSubTransportCaseGroup[]> = {
  kafka: [
    {
      group: "scheduler ownership",
      cases: [
        {
          name: "does not duplicate scheduled delivery with multiple scheduler instances",
          async run(ctx) {
            const topic = ctx.topic("events");
            const scheduler = ctx.scheduler("shared_scheduler");
            let schedulerDeliveries = 0;
            const observer = {
              delivered() {
                schedulerDeliveries += 1;
              },
            };
            // Two scheduler workers share one scheduler group. Exactly one owner
            // should deliver the due record for a partition.
            const firstSchedulerTransport = ctx.transport({ scheduler, observer });
            const secondSchedulerTransport = ctx.transport({ scheduler, observer });

            await createPublisher(ConformanceEvents, secondSchedulerTransport, {
              source: "test-suite",
            }).betaHappened(
              { eventId: "wake_scheduler", detail: "start", active: true },
              { topic: ctx.topic("wake") },
            );

            const subscriberTransport = ctx.transport({
              subscribeTopics: [topic],
              scheduler: ctx.scheduler("subscriber"),
            });
            const router = createRouter(subscriberTransport);
            let handledCount = 0;

            router.service(ConformanceEvents, {
              async alphaHappened(_request, handlerContext) {
                handledCount += 1;
                await handlerContext.ack();
              },
            });

            const subscription = await router.subscribe({
              consumerGroup: ctx.topic("workers"),
            });

            await createPublisher(ConformanceEvents, firstSchedulerTransport, {
              source: "test-suite",
            }).alphaHappened(
              { eventId: "evt_once", name: "once", count: 14 },
              { topic, notBefore: timestampFromDate(new Date(Date.now() + 500)) },
            );

            await expect.poll(() => handledCount, { timeout: DELIVERY_TIMEOUT_MS }).toBe(1);
            await wait(500);
            expect(handledCount).toBe(1);
            expect(schedulerDeliveries).toBe(1);
            await subscription.unsubscribe();
          },
        },
        {
          name: "observer failures do not break scheduled delivery",
          async run(ctx) {
            const topic = ctx.topic("events");
            const transport = ctx.transport({
              subscribeTopics: [topic],
              observer: {
                delivered() {
                  throw new Error("observer failed");
                },
              },
            });
            const publisher = createPublisher(ConformanceEvents, transport, {
              source: "test-suite",
            });
            const router = createRouter(transport);
            let handledEventId = "";

            router.service(ConformanceEvents, {
              async alphaHappened(request, handlerContext) {
                handledEventId = request.eventId;
                await handlerContext.ack();
              },
            });

            const subscription = await router.subscribe({
              consumerGroup: ctx.topic("workers"),
            });

            await publisher.alphaHappened(
              { eventId: "evt_observer", name: "observer", count: 17 },
              { topic, notBefore: timestampFromDate(new Date(Date.now() + 500)) },
            );

            await expect
              .poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS })
              .toBe("evt_observer");
            await subscription.unsubscribe();
          },
        },
      ],
    },
  ],
};

export const loadGroups: PubSubTransportCaseGroup[] = [
  {
    group: "scheduled load",
    cases: [
      {
        name: "schedules and delivers many delayed events",
        async run(ctx) {
          const eventCount = positiveIntegerEnv(
            "PUBSUB_LOAD_EVENT_COUNT",
            DEFAULT_LOAD_EVENT_COUNT,
          );
          const notBeforeMs = positiveIntegerEnv(
            "PUBSUB_LOAD_NOT_BEFORE_MS",
            DEFAULT_LOAD_NOT_BEFORE_MS,
          );
          const publishConcurrency = positiveIntegerEnv(
            "PUBSUB_LOAD_PUBLISH_CONCURRENCY",
            DEFAULT_LOAD_PUBLISH_CONCURRENCY,
          );
          const subscribeConcurrency = positiveIntegerEnv(
            "PUBSUB_LOAD_SUBSCRIBE_CONCURRENCY",
            DEFAULT_LOAD_SUBSCRIBE_CONCURRENCY,
          );
          const timeoutMs = positiveIntegerEnv(
            "PUBSUB_LOAD_TIMEOUT_MS",
            Math.max(60_000, eventCount * 25),
          );
          const topic = ctx.topic("load_events");
          const scheduler = ctx.scheduler("load");
          const transport = ctx.transport({ subscribeTopics: [topic], scheduler });
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "load-test",
          });
          const router = createRouter(transport);
          const delivered = new Set<string>();
          let deliveryCount = 0;

          router.service(ConformanceEvents, {
            async alphaHappened(request, handlerContext) {
              // Track both unique ids and raw deliveries so the load test can
              // catch duplicate delivery under sustained scheduled traffic.
              delivered.add(request.eventId);
              deliveryCount += 1;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("load_workers"),
            concurrency: subscribeConcurrency,
          });

          try {
            const notBefore = timestampFromDate(new Date(Date.now() + notBeforeMs));
            await runConcurrent(eventCount, publishConcurrency, async (index) => {
              await publisher.alphaHappened(
                {
                  eventId: `load_${index}`,
                  name: "load",
                  count: index,
                },
                { topic, notBefore },
              );
            });

            await expect.poll(() => delivered.size, { timeout: timeoutMs }).toBe(eventCount);
            expect(deliveryCount).toBe(eventCount);
          } finally {
            await subscription.unsubscribe();
          }
        },
      },
    ],
  },
];

/** Wait for a small amount of wall-clock time in integration tests. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run `task` across a bounded number of worker loops. */
async function runConcurrent(
  count: number,
  concurrency: number,
  task: (index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(count, concurrency) }, async () => {
    while (next < count) {
      const index = next;
      next += 1;
      await task(index);
    }
  });
  await Promise.all(workers);
}

/** Read a positive integer load-test setting from the environment. */
function positiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
