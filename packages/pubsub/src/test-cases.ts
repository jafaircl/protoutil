import { durationFromMs, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { expect } from "vitest";
import { createContextKey, createContextValues, withReentryGuard } from "./context-values.js";
import { ConformanceEvents } from "./gen/protoutil/pubsub/testing/v1/events_pb.js";
import { createPublisher } from "./publisher.js";
import { createRouter } from "./router.js";
import type { PubSubInterceptor, PubSubTransport } from "./types.js";

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
  scheduler?: SchedulerOptions;
  interceptors?: PubSubInterceptor[];
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
    group: "portable application contract",
    cases: [
      {
        name: "keeps queue logic transport-neutral across immediate, delayed, retry, and dead-letter flows",
        async run(ctx) {
          const topic = ctx.topic("portable_events");
          const deadLetterTopic = ctx.topic("portable_dead_letter");
          const scheduler = ctx.scheduler("portable");
          const transport = ctx.transport({ scheduler });
          const deadLetterTransport = ctx.transport();
          const queue = createPortableQueueModule(transport, { topic, deadLetterTopic });
          const deadLetterQueue = createPortableQueueModule(deadLetterTransport, {
            topic: deadLetterTopic,
          });
          const scheduledNotBefore = new Date(Date.now() + 500);
          let scheduledDeliveredAt = 0;
          const handledEventIds: string[] = [];
          const handledAttempts = new Map<string, number>();
          const retryCounts = new Map<string, number>();
          let deadLetterEventId = "";

          queue.router.service({
            async alphaHappened(request, handlerContext) {
              if (request.name === "dead-letter") {
                await handlerContext.deadLetter();
                return;
              }
              if (request.name === "retry-once") {
                const retries = retryCounts.get(request.eventId) ?? 0;
                retryCounts.set(request.eventId, retries + 1);
                if (retries === 0) {
                  await handlerContext.retry({ delay: durationFromMs(500) });
                  return;
                }
              }
              if (request.eventId === "evt_portable_scheduled") {
                scheduledDeliveredAt = Date.now();
              }
              handledEventIds.push(request.eventId);
              handledAttempts.set(request.eventId, handlerContext.attempt);
              await handlerContext.ack();
            },
          });

          deadLetterQueue.router.service({
            async alphaHappened(request, handlerContext) {
              deadLetterEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await queue.router.subscribe({
            consumerGroup: ctx.topic("portable_workers"),
            maxAttempts: 2,
          });
          const deadLetterSubscription = await deadLetterQueue.router.subscribe({
            consumerGroup: ctx.topic("portable_dead_letter_workers"),
          });

          try {
            await queue.publisher.alphaHappened(
              { eventId: "evt_portable_ack", name: "ack", count: 1 },
              undefined,
            );
            await queue.publisher.alphaHappened(
              { eventId: "evt_portable_scheduled", name: "scheduled", count: 2 },
              { notBefore: timestampFromDate(scheduledNotBefore) },
            );
            await queue.publisher.alphaHappened(
              { eventId: "evt_portable_retry", name: "retry-once", count: 3 },
              undefined,
            );
            await queue.publisher.alphaHappened(
              { eventId: "evt_portable_dead_letter", name: "dead-letter", count: 4 },
              undefined,
            );
            await expect
              .poll(() => handledEventIds.includes("evt_portable_ack"), {
                timeout: DELIVERY_TIMEOUT_MS,
              })
              .toBe(true);
            await expect
              .poll(() => handledEventIds.includes("evt_portable_scheduled"), {
                timeout: DELIVERY_TIMEOUT_MS,
              })
              .toBe(true);
            await expect
              .poll(() => handledEventIds.includes("evt_portable_retry"), {
                timeout: DELIVERY_TIMEOUT_MS,
              })
              .toBe(true);
            await expect
              .poll(() => deadLetterEventId, { timeout: DELIVERY_TIMEOUT_MS })
              .toBe("evt_portable_dead_letter");

            expect(scheduledDeliveredAt).toBeGreaterThanOrEqual(scheduledNotBefore.getTime());
            expect(handledAttempts.get("evt_portable_ack")).toBe(1);
            expect(handledAttempts.get("evt_portable_scheduled")).toBe(1);
            expect(handledAttempts.get("evt_portable_retry")).toBe(2);
          } finally {
            await subscription.unsubscribe();
            await deadLetterSubscription.unsubscribe();
          }
        },
      },
    ],
  },
  {
    group: "publish and subscribe",
    cases: [
      {
        name: "publishes and consumes events through the pubsub API",
        async run(ctx) {
          const topic = ctx.topic("events");
          const { publisher, router } = createConformanceModule(ctx, { topic });
          let handledEventId = "";
          let handledAttempt = 0;

          router.service({
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

          await publisher.alphaHappened({ eventId: "evt_1", name: "alpha", count: 7 });

          await expect.poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS }).toBe("evt_1");
          expect(handledAttempt).toBe(1);
          await subscription.unsubscribe();
        },
      },
      {
        name: "stops consuming after unsubscribe",
        async run(ctx) {
          const topic = ctx.topic("events");
          const { publisher, router } = createConformanceModule(ctx, { topic });
          let handledEventId = "";

          router.service({
            async alphaHappened(request, handlerContext) {
              handledEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await publisher.alphaHappened({ eventId: "evt_1", name: "alpha", count: 7 });
          await expect.poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS }).toBe("evt_1");

          await subscription.unsubscribe();
          await publisher.alphaHappened({ eventId: "evt_2", name: "after unsubscribe", count: 8 });

          await wait(300);
          expect(handledEventId).toBe("evt_1");
        },
      },
      {
        name: "publishes dead-letter dispositions to the configured dead-letter topic",
        async run(ctx) {
          const topic = ctx.topic("events");
          const deadLetterTopic = ctx.topic("dead_letter");
          const { publisher, router } = createConformanceModule(ctx, { topic, deadLetterTopic });
          const { router: deadLetterRouter } = createConformanceModule(ctx, {
            topic: deadLetterTopic,
          });
          let deadLetterEventId = "";

          router.service({
            async alphaHappened(_request, handlerContext) {
              await handlerContext.deadLetter();
            },
          });
          deadLetterRouter.service({
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

          await publisher.alphaHappened({
            eventId: "evt_dead_letter",
            name: "dead letter",
            count: 15,
          });

          await expect
            .poll(() => deadLetterEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_dead_letter");
          await subscription.unsubscribe();
          await deadLetterSubscription.unsubscribe();
        },
      },
      {
        name: "uses the fully qualified protobuf method name as the default topic and CloudEvent type",
        async run(ctx) {
          const topic = "protoutil.pubsub.testing.v1.ConformanceEvents.AlphaHappened";
          let publishedTopic = "";
          const transport = ctx.transport({
            interceptors: [
              (next) => async (ctx) => {
                if (ctx.operation === "publish") {
                  publishedTopic = ctx.request.topic;
                }
                return next(ctx);
              },
            ],
          });
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "test-suite",
          });
          const router = createRouter(ConformanceEvents, transport);
          let handledEventId = "";
          let handledEventType = "";

          router.service({
            async alphaHappened(request, handlerContext) {
              handledEventId = request.eventId;
              handledEventType = handlerContext.event.type;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("fq_workers"),
          });

          await publisher.alphaHappened({ eventId: "evt_fq", name: "fq", count: 1 });

          await expect.poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS }).toBe("evt_fq");
          expect(publishedTopic).toBe(topic);
          expect(handledEventType).toBe(topic);
          await subscription.unsubscribe();
        },
      },
      {
        name: "supports publisher and router topic overrides without transport construction topics",
        async run(ctx) {
          const topic = ctx.topic("overridden_events");
          let publishedTopic = "";
          const transport = ctx.transport({
            interceptors: [
              (next) => async (ctx) => {
                if (ctx.operation === "publish") {
                  publishedTopic = ctx.request.topic;
                }
                return next(ctx);
              },
            ],
          });
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "test-suite",
            topic: { alphaHappened: topic },
          });
          const router = createRouter(ConformanceEvents, transport, {
            topic: { alphaHappened: topic },
          });
          let handledEventId = "";

          router.service({
            async alphaHappened(request, handlerContext) {
              handledEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("override_workers"),
          });

          await publisher.alphaHappened({ eventId: "evt_override", name: "override", count: 1 });

          await expect
            .poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_override");
          expect(publishedTopic).toBe(topic);
          await subscription.unsubscribe();
        },
      },
      {
        name: "keeps CloudEvent type semantic when broker topic is overridden per call",
        async run(ctx) {
          const topic = ctx.topic("override_per_call");
          const transport = ctx.transport();
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "test-suite",
          });
          const router = createRouter(ConformanceEvents, transport, { topic });
          let handledType = "";

          router.service({
            async alphaHappened(_request, handlerContext) {
              handledType = handlerContext.event.type;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("override_call_workers"),
          });

          await publisher.alphaHappened(
            { eventId: "evt_override_call", name: "override call", count: 1 },
            { topic },
          );

          await expect
            .poll(() => handledType, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("protoutil.pubsub.testing.v1.ConformanceEvents.AlphaHappened");
          await subscription.unsubscribe();
        },
      },
    ],
  },
  {
    group: "scheduling",
    cases: [
      {
        name: "throws a helpful error when delayed publish is requested without a scheduler",
        async run(ctx) {
          const transport = ctx.transport();
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "test-suite",
          });

          await expect(
            publisher.alphaHappened(
              { eventId: "evt_no_scheduler_publish", name: "no scheduler", count: 1 },
              {
                topic: ctx.topic("no_scheduler_publish"),
                notBefore: timestampFromDate(new Date(Date.now() + 500)),
              },
            ),
          ).rejects.toThrow(/Delayed publish requires a scheduler/);
        },
      },
      {
        name: "delivers scheduled publishes no earlier than notBefore",
        async run(ctx) {
          const topic = ctx.topic("events");
          const { publisher, router } = createConformanceModule(ctx, {
            topic,
            transportOptions: { scheduler: ctx.scheduler("scheduled_publish") },
          });
          const notBefore = new Date(Date.now() + 1_000);
          let deliveredAt = 0;
          let handledEventId = "";

          router.service({
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
            { notBefore: timestampFromDate(notBefore) },
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
          const { publisher, router } = createConformanceModule(ctx, {
            topic,
            transportOptions: { scheduler: ctx.scheduler("replace_schedule") },
          });
          const firstNotBefore = new Date(Date.now() + 1_500);
          const secondNotBefore = new Date(Date.now() + 2_500);
          let deliveredAt = 0;
          let handledName = "";

          router.service({
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
            { id: "same-cloud-event-id", notBefore: timestampFromDate(firstNotBefore) },
          );
          // Reusing the same CloudEvent id should replace the active durable
          // schedule record instead of creating two delayed deliveries.
          await publisher.alphaHappened(
            { eventId: "evt_replaced", name: "second", count: 2 },
            { id: "same-cloud-event-id", notBefore: timestampFromDate(secondNotBefore) },
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
          const publishingTransport = ctx.transport({ scheduler });
          const publisher = createPublisher(ConformanceEvents, publishingTransport, {
            source: "test-suite",
            topic,
          });
          const notBefore = new Date(Date.now() + 1_000);

          await publisher.alphaHappened(
            { eventId: "evt_recovered", name: "recovered", count: 10 },
            { notBefore: timestampFromDate(notBefore) },
          );
          // Closing before notBefore forces the second transport instance to
          // recover delivery from broker state instead of process memory.
          await publishingTransport.close();

          const consumingTransport = ctx.transport({ scheduler });
          const router = createRouter(ConformanceEvents, consumingTransport, { topic });
          let deliveredAt = 0;
          let handledEventId = "";

          router.service({
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
          const publishingTransport = ctx.transport({ scheduler });
          const publisher = createPublisher(ConformanceEvents, publishingTransport, {
            source: "test-suite",
            topic,
          });

          await publisher.alphaHappened(
            { eventId: "evt_due", name: "already due", count: 12 },
            { notBefore: timestampFromDate(new Date(Date.now() - 1_000)) },
          );
          await publishingTransport.close();

          const consumingTransport = ctx.transport({ scheduler });
          const router = createRouter(ConformanceEvents, consumingTransport, { topic });
          let handledEventId = "";

          router.service({
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
            scheduler,
            interceptors: [
              (next) => async (ctx) => {
                if (ctx.operation === "tombstoned") {
                  tombstoned += 1;
                }
                return next(ctx);
              },
            ],
          });
          const publisher = createPublisher(ConformanceEvents, firstTransport, {
            source: "test-suite",
            topic,
          });
          const router = createRouter(ConformanceEvents, firstTransport, { topic });
          let handledEventId = "";

          router.service({
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
            { notBefore: timestampFromDate(new Date(Date.now() + 500)) },
          );
          await expect
            .poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_tombstoned");
          await expect.poll(() => tombstoned, { timeout: DELIVERY_TIMEOUT_MS }).toBe(1);
          await subscription.unsubscribe();
          await firstTransport.close();

          let recoveredDeliveries = 0;
          const restartedTransport = ctx.transport({
            scheduler,
            interceptors: [
              (next) => async (ctx) => {
                if (ctx.operation === "delivered") {
                  recoveredDeliveries += 1;
                }
                return next(ctx);
              },
            ],
          });
          const restartedRouter = createRouter(ConformanceEvents, restartedTransport, { topic });
          restartedRouter.service({
            async alphaHappened(_request, handlerContext) {
              await handlerContext.ack();
            },
          });
          const restartedSubscription = await restartedRouter.subscribe({
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
          const { publisher, router } = createConformanceModule(ctx, {
            topic,
            transportOptions: { scheduler: ctx.scheduler("retry_delay") },
          });
          const retryDelayMs = 1_000;
          let attempts = 0;
          let retryDueAt = 0;
          let retryDeliveredAt = 0;
          let handledEventId = "";
          let handledAttempt = 0;

          router.service({
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

          await publisher.alphaHappened({ eventId: "evt_3", name: "retry", count: 11 });

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
        name: "throws a helpful error when delayed retry is requested without a scheduler",
        async run(ctx) {
          const topic = ctx.topic("retry_without_scheduler");
          const { publisher, router } = createConformanceModule(ctx, { topic });
          let attempts = 0;

          router.service({
            async alphaHappened(_request, handlerContext) {
              attempts += 1;
              await handlerContext.retry({ delay: durationFromMs(500) });
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("retry_without_scheduler_workers"),
          });

          await publisher.alphaHappened({
            eventId: "evt_retry_without_scheduler",
            name: "retry without scheduler",
            count: 1,
          });

          await expect.poll(() => attempts, { timeout: DELIVERY_TIMEOUT_MS }).toBe(1);
          await subscription.unsubscribe();
        },
      },
      {
        name: "dead letters retries after maxAttempts is reached",
        async run(ctx) {
          const topic = ctx.topic("events");
          const deadLetterTopic = ctx.topic("retry_exhausted");
          let retryExhausted = 0;
          const transportOptions = {
            scheduler: ctx.scheduler("retry_exhausted"),
            interceptors: [
              (next) => async (ctx) => {
                if (ctx.operation === "retryExhausted") {
                  retryExhausted += 1;
                }
                return next(ctx);
              },
            ],
          } satisfies TransportOptions;
          const { publisher, router } = createConformanceModule(ctx, {
            topic,
            deadLetterTopic,
            transportOptions,
          });
          const { router: deadLetterRouter } = createConformanceModule(ctx, {
            topic: deadLetterTopic,
          });
          let deadLetterEventId = "";

          router.service({
            async alphaHappened(_request, handlerContext) {
              await handlerContext.retry({ delay: durationFromMs(1_000) });
            },
          });
          deadLetterRouter.service({
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

          await publisher.alphaHappened({
            eventId: "evt_retry_exhausted",
            name: "retry exhausted",
            count: 16,
          });

          await expect
            .poll(() => deadLetterEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_retry_exhausted");
          expect(retryExhausted).toBe(1);
          await subscription.unsubscribe();
          await deadLetterSubscription.unsubscribe();
        },
      },
      {
        name: "uses the service dead-letter topic default when none is configured",
        async run(ctx) {
          const topic = ctx.topic("default_dead_letter_source");
          const deadLetterTopic = "protoutil.pubsub.testing.v1.ConformanceEvents.__deadletter";
          const { publisher, router } = createConformanceModule(ctx, {
            topic,
            transportOptions: { scheduler: ctx.scheduler("default_dead_letter") },
          });
          const { router: deadLetterRouter } = createConformanceModule(ctx, {
            topic: deadLetterTopic,
          });
          let deadLetterEventId = "";

          router.service({
            async alphaHappened(_request, handlerContext) {
              await handlerContext.deadLetter();
            },
          });
          deadLetterRouter.service({
            async alphaHappened(request, handlerContext) {
              deadLetterEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("default_dead_letter_workers"),
          });
          const deadLetterSubscription = await deadLetterRouter.subscribe({
            consumerGroup: ctx.topic("default_dead_letter_dlq_workers"),
          });

          await publisher.alphaHappened({
            eventId: "evt_default_dead_letter",
            name: "default dead letter",
            count: 1,
          });

          await expect
            .poll(() => deadLetterEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_default_dead_letter");
          await subscription.unsubscribe();
          await deadLetterSubscription.unsubscribe();
        },
      },
    ],
  },
  {
    group: "interceptors",
    cases: [
      {
        name: "calls interceptors with correct operation names for publish and handle",
        async run(ctx) {
          const topic = ctx.topic("events");
          const operations: string[] = [];
          const { publisher, router } = createConformanceModule(ctx, {
            topic,
            transportOptions: {
              interceptors: [
                (next) => async (ctx) => {
                  operations.push(ctx.operation);
                  return next(ctx);
                },
              ],
            },
          });
          let handledEventId = "";

          router.service({
            async alphaHappened(request, handlerContext) {
              handledEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await publisher.alphaHappened({ eventId: "evt_ops", name: "ops", count: 1 });

          await expect.poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS }).toBe("evt_ops");
          expect(operations).toContain("publish");
          expect(operations).toContain("handle");
          expect(operations).toContain("committed");
          await subscription.unsubscribe();
        },
      },
      {
        name: "chains interceptors in order (first = outermost)",
        async run(ctx) {
          const topic = ctx.topic("events");
          const order: string[] = [];
          const { publisher, router } = createConformanceModule(ctx, {
            topic,
            transportOptions: {
              interceptors: [
                (next) => async (ctx) => {
                  if (ctx.operation === "handle") {
                    order.push("first-before");
                  }
                  const result = await next(ctx);
                  if (ctx.operation === "handle") {
                    order.push("first-after");
                  }
                  return result;
                },
                (next) => async (ctx) => {
                  if (ctx.operation === "handle") {
                    order.push("second-before");
                  }
                  const result = await next(ctx);
                  if (ctx.operation === "handle") {
                    order.push("second-after");
                  }
                  return result;
                },
              ],
            },
          });
          let handledEventId = "";

          router.service({
            async alphaHappened(request, handlerContext) {
              handledEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await publisher.alphaHappened({ eventId: "evt_chain", name: "chain", count: 1 });

          await expect
            .poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_chain");
          expect(order).toEqual(["first-before", "second-before", "second-after", "first-after"]);
          await subscription.unsubscribe();
        },
      },
      {
        name: "passes publish request in interceptor context",
        async run(ctx) {
          const topic = ctx.topic("events");
          let publishTopic = "";
          let publishEventId = "";
          const { publisher, router } = createConformanceModule(ctx, {
            topic,
            transportOptions: {
              interceptors: [
                (next) => async (ctx) => {
                  if (ctx.operation === "publish") {
                    publishTopic = ctx.request.topic;
                    publishEventId = ctx.request.event.id;
                  }
                  return next(ctx);
                },
              ],
            },
          });
          let handledEventId = "";

          router.service({
            async alphaHappened(request, handlerContext) {
              handledEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await publisher.alphaHappened(
            { eventId: "evt_pub_ctx", name: "pub ctx", count: 1 },
            { topic, id: "cloud-event-id-123" },
          );

          await expect
            .poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_pub_ctx");
          expect(publishTopic).toBe(topic);
          expect(publishEventId).toBe("cloud-event-id-123");
          await subscription.unsubscribe();
        },
      },
      {
        name: "passes delivery in interceptor context",
        async run(ctx) {
          const topic = ctx.topic("events");
          let deliveryTopic = "";
          let deliveryAttempt = 0;
          const { publisher, router } = createConformanceModule(ctx, {
            topic,
            transportOptions: {
              interceptors: [
                (next) => async (ctx) => {
                  if (ctx.operation === "handle") {
                    deliveryTopic = ctx.delivery.topic ?? "";
                    deliveryAttempt = ctx.delivery.attempt ?? 0;
                  }
                  return next(ctx);
                },
              ],
            },
          });
          let handledEventId = "";

          router.service({
            async alphaHappened(request, handlerContext) {
              handledEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await publisher.alphaHappened({ eventId: "evt_del_ctx", name: "del ctx", count: 1 });

          await expect
            .poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_del_ctx");
          expect(deliveryTopic).toBe(topic);
          expect(deliveryAttempt).toBe(1);
          await subscription.unsubscribe();
        },
      },
      {
        name: "does not break delivery when lifecycle interceptor throws",
        async run(ctx) {
          const topic = ctx.topic("events");
          const { publisher, router } = createConformanceModule(ctx, {
            topic,
            transportOptions: {
              interceptors: [
                (next) => async (ctx) => {
                  if (ctx.operation === "committed") {
                    throw new Error("lifecycle interceptor failed");
                  }
                  return next(ctx);
                },
              ],
            },
          });
          let handledEventId = "";

          router.service({
            async alphaHappened(request, handlerContext) {
              handledEventId = request.eventId;
              await handlerContext.ack();
            },
          });

          const subscription = await router.subscribe({
            consumerGroup: ctx.topic("workers"),
          });

          await publisher.alphaHappened({ eventId: "evt_lifecycle", name: "lifecycle", count: 1 });

          await expect
            .poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS })
            .toBe("evt_lifecycle");
          await subscription.unsubscribe();
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
            const interceptors: PubSubInterceptor[] = [
              (next) => async (ctx) => {
                if (ctx.operation === "delivered") {
                  schedulerDeliveries += 1;
                }
                return next(ctx);
              },
            ];
            // Two scheduler workers share one scheduler group. Exactly one owner
            // should deliver the due record for a partition.
            const firstSchedulerTransport = ctx.transport({ scheduler, interceptors });
            const secondSchedulerTransport = ctx.transport({ scheduler, interceptors });

            await createPublisher(ConformanceEvents, secondSchedulerTransport, {
              source: "test-suite",
            }).betaHappened(
              { eventId: "wake_scheduler", detail: "start", active: true },
              { topic: ctx.topic("wake") },
            );

            const subscriberTransport = ctx.transport({
              scheduler: ctx.scheduler("subscriber"),
            });
            const router = createRouter(ConformanceEvents, subscriberTransport, { topic });
            let handledCount = 0;

            router.service({
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
              topic,
            }).alphaHappened(
              { eventId: "evt_once", name: "once", count: 14 },
              { notBefore: timestampFromDate(new Date(Date.now() + 500)) },
            );

            await expect.poll(() => handledCount, { timeout: DELIVERY_TIMEOUT_MS }).toBe(1);
            await wait(500);
            expect(handledCount).toBe(1);
            expect(schedulerDeliveries).toBe(1);
            await subscription.unsubscribe();
          },
        },
        {
          name: "interceptor failures do not break scheduled delivery",
          async run(ctx) {
            const topic = ctx.topic("events");
            const { publisher, router } = createConformanceModule(ctx, {
              topic,
              transportOptions: {
                scheduler: ctx.scheduler("scheduled_interceptor"),
                interceptors: [
                  (next) => async (ctx) => {
                    if (ctx.operation === "delivered") {
                      throw new Error("interceptor failed");
                    }
                    return next(ctx);
                  },
                ],
              },
            });
            let handledEventId = "";

            router.service({
              async alphaHappened(request, handlerContext) {
                handledEventId = request.eventId;
                await handlerContext.ack();
              },
            });

            const subscription = await router.subscribe({
              consumerGroup: ctx.topic("workers"),
            });

            await publisher.alphaHappened(
              { eventId: "evt_interceptor", name: "interceptor", count: 17 },
              { notBefore: timestampFromDate(new Date(Date.now() + 500)) },
            );

            await expect
              .poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS })
              .toBe("evt_interceptor");
            await subscription.unsubscribe();
          },
        },
        {
          name: "passes context values from handle interceptor to handler",
          async run(ctx) {
            const topic = ctx.topic("events");
            const kTestValue = createContextKey("default", { description: "test value" });

            const { publisher, router } = createConformanceModule(ctx, {
              topic,
              transportOptions: {
                interceptors: [
                  (next) => async (ctx) => {
                    if (ctx.operation === "handle") {
                      ctx.contextValues?.set(kTestValue, "set-by-interceptor");
                    }
                    return next(ctx);
                  },
                ],
              },
            });
            let handledEventId = "";
            let observedInHandler = "";

            router.service({
              async alphaHappened(request, handlerContext) {
                handledEventId = request.eventId;
                observedInHandler = handlerContext.contextValues.get(kTestValue);
                await handlerContext.ack();
              },
            });

            const subscription = await router.subscribe({
              consumerGroup: ctx.topic("workers"),
            });

            await publisher.alphaHappened({ eventId: "evt_ctx", name: "ctx", count: 1 });

            await expect
              .poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS })
              .toBe("evt_ctx");
            expect(observedInHandler).toBe("set-by-interceptor");
            await subscription.unsubscribe();
          },
        },
        {
          name: "shares context values between interceptor and handler via delivery",
          async run(ctx) {
            const topic = ctx.topic("events");
            const kTraceId = createContextKey("", { description: "trace id" });
            const traceId = `trace-${Math.random().toString(36).slice(2)}`;

            const { publisher, router } = createConformanceModule(ctx, {
              topic,
              transportOptions: {
                interceptors: [
                  (next) => async (ctx) => {
                    if (ctx.operation === "handle") {
                      ctx.contextValues?.set(kTraceId, traceId);
                    }
                    return next(ctx);
                  },
                ],
              },
            });
            let handledEventId = "";
            let deliveredTraceId = "";

            router.service({
              async alphaHappened(request, handlerContext) {
                handledEventId = request.eventId;
                deliveredTraceId = handlerContext.contextValues.get(kTraceId);
                await handlerContext.ack();
              },
            });

            const subscription = await router.subscribe({
              consumerGroup: ctx.topic("workers"),
            });

            await publisher.alphaHappened({
              eventId: "evt_delivery_ctx",
              name: "delivery_ctx",
              count: 1,
            });

            await expect
              .poll(() => handledEventId, { timeout: DELIVERY_TIMEOUT_MS })
              .toBe("evt_delivery_ctx");
            expect(deliveredTraceId).toBe(traceId);
            await subscription.unsubscribe();
          },
        },
        {
          name: "supports reentry guard to prevent nested publishes",
          async run(ctx) {
            const topic = ctx.topic("events");
            const kPublishing = createContextKey(false, { description: "publishing guard" });
            const values = createContextValues();

            const transport = ctx.transport({
              interceptors: [
                (next) => async (ctx) => {
                  if (ctx.operation === "publish" && ctx.contextValues?.get(kPublishing)) {
                    throw new Error("nested publish not allowed");
                  }
                  return next(ctx);
                },
              ],
            });
            const nestedPublisher = createPublisher(ConformanceEvents, transport, {
              source: "test-suite",
              contextValues: values,
              topic,
            });
            const router = createRouter(ConformanceEvents, transport, { topic });
            let outerPublished = false;

            router.service({
              async alphaHappened(_, handlerContext) {
                outerPublished = true;
                await withReentryGuard(values, kPublishing, async () => {
                  await nestedPublisher.alphaHappened({
                    eventId: "nested",
                    name: "nested",
                    count: 1,
                  });
                });
                await handlerContext.ack();
              },
            });

            const subscription = await router.subscribe({
              consumerGroup: ctx.topic("workers"),
            });

            await createPublisher(ConformanceEvents, transport, {
              source: "test-suite",
              topic,
            }).alphaHappened({ eventId: "evt_outer", name: "outer", count: 1 });

            await expect.poll(() => outerPublished, { timeout: DELIVERY_TIMEOUT_MS }).toBe(true);
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
          const transport = ctx.transport({ scheduler });
          const publisher = createPublisher(ConformanceEvents, transport, {
            source: "load-test",
            topic,
          });
          const router = createRouter(ConformanceEvents, transport, { topic });
          const delivered = new Set<string>();
          let deliveryCount = 0;

          router.service({
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
                { notBefore },
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

/** Build one transport-neutral queue module that only depends on the core pubsub API. */
function createPortableQueueModule(
  transport: PubSubTransport,
  options: { topic: string; deadLetterTopic?: string },
) {
  return {
    publisher: createPublisher(ConformanceEvents, transport, {
      source: "portable-app",
      topic: options.topic,
    }),
    router: createRouter(ConformanceEvents, transport, options),
  };
}

interface ConformanceModuleOptions {
  topic: string | Record<string, string>;
  deadLetterTopic?: string;
  source?: string;
  transportOptions?: TransportOptions;
}

function createConformanceModule(
  ctx: PubSubTransportTestContext,
  options: ConformanceModuleOptions,
) {
  const transport = ctx.transport(options.transportOptions);
  return {
    transport,
    publisher: createPublisher(ConformanceEvents, transport, {
      source: options.source ?? "test-suite",
      topic: options.topic,
    }),
    router: createRouter(ConformanceEvents, transport, {
      topic: options.topic,
      deadLetterTopic: options.deadLetterTopic,
    }),
  };
}
