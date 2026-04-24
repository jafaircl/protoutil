import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { ConformanceEvents } from "./gen/protoutil/pubsub/testing/v1/events_pb.js";
import { createPublisher } from "./publisher.js";
import { createRouter } from "./router.js";
import type { PubSubTransport } from "./types.js";

const DEFAULT_BENCHMARK_EVENT_COUNT = 1_000;
const DEFAULT_BENCHMARK_PUBLISH_CONCURRENCY = 50;
const DEFAULT_BENCHMARK_SUBSCRIBE_CONCURRENCY = 32;
const DEFAULT_BENCHMARK_NOT_BEFORE_MS = 1_000;
const DEFAULT_BENCHMARK_SCHEDULER_ONLY_NOT_BEFORE_MS = 0;
const DEFAULT_BENCHMARK_TIMEOUT_MS = 120_000;

/** Context supplied by each transport benchmark adapter. */
export interface PubSubBenchmarkContext {
  /** Display name for the transport under test. */
  transportName: string;
  /** Create a transport instance for a benchmark scenario. */
  transport(options?: BenchmarkTransportOptions): PubSubTransport;
  /** Create an isolated topic name for this run. */
  topic(name: string): string;
  /** Create isolated scheduler topic names for this run. */
  scheduler(name: string): BenchmarkSchedulerOptions;
}

/** Transport options needed by shared benchmark scenarios. */
export interface BenchmarkTransportOptions {
  /** Topics consumed by the transport. */
  subscribeTopics?: string[];
  /** Scheduler topic configuration for delayed delivery scenarios. */
  scheduler?: BenchmarkSchedulerOptions;
}

/** Scheduler topic names needed by shared benchmark scenarios. */
export interface BenchmarkSchedulerOptions {
  /** Durable schedule state topic. */
  schedulesTopic: string;
  /** Append-only schedule history topic. */
  historyTopic: string;
  /** Scheduler consumer group. */
  consumerGroup?: string;
}

/** One measured benchmark row. */
export interface PubSubBenchmarkResult {
  /** Transport display name. */
  transport: string;
  /** Scenario display name. */
  scenario: string;
  /** Whether the scenario was measured cold or warm. */
  mode: string;
  /** Number of messages delivered. */
  messages: number;
  /** Publish concurrency used by the benchmark. */
  publishConcurrency: number;
  /** Subscriber concurrency requested by the benchmark. */
  subscribeConcurrency: number;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Delivered messages per second. */
  messagesPerSecond: number;
  /** End-to-end latency p50 in milliseconds. */
  p50Ms: number;
  /** End-to-end latency p95 in milliseconds. */
  p95Ms: number;
  /** End-to-end latency p99 in milliseconds. */
  p99Ms: number;
  /** Duplicate delivery count observed by message id. */
  duplicates: number;
  /** Time spent establishing the subscription before measurement. */
  subscribeSetupMs: number;
  /** Optional warmup duration before the measured run. */
  warmupMs: number;
  /** Time spent issuing all publish calls for the measured run. */
  publishPhaseMs: number;
  /** Time spent waiting for remaining deliveries after publish calls completed. */
  deliveryDrainMs: number;
  /** Time from benchmark start to the first handled event. */
  firstDeliveryMs: number;
}

/** Shared transport-neutral pubsub benchmark scenarios. */
export const benchmarkCases = [
  {
    name: "immediate publish/consume (cold start)",
    async run(ctx: PubSubBenchmarkContext): Promise<PubSubBenchmarkResult> {
      return runPublishConsumeBenchmark(ctx, {
        scenario: "immediate publish/consume",
        scheduled: false,
        notBeforeMs: 0,
        warmup: false,
      });
    },
  },
  {
    name: "immediate publish/consume (warmed up)",
    async run(ctx: PubSubBenchmarkContext): Promise<PubSubBenchmarkResult> {
      return runPublishConsumeBenchmark(ctx, {
        scenario: "immediate publish/consume",
        scheduled: false,
        notBeforeMs: 0,
        warmup: true,
      });
    },
  },
  {
    name: "scheduled publish/consume (cold start)",
    async run(ctx: PubSubBenchmarkContext): Promise<PubSubBenchmarkResult> {
      return runPublishConsumeBenchmark(ctx, {
        scenario: "scheduled publish/consume",
        scheduled: true,
        notBeforeMs: benchmarkDelayMs(),
        warmup: false,
      });
    },
  },
  {
    name: "scheduled publish/consume (warmed up)",
    async run(ctx: PubSubBenchmarkContext): Promise<PubSubBenchmarkResult> {
      return runPublishConsumeBenchmark(ctx, {
        scenario: "scheduled publish/consume",
        scheduled: true,
        notBeforeMs: benchmarkDelayMs(),
        warmup: true,
      });
    },
  },
  {
    name: "scheduled publish/consume (scheduler only, cold start)",
    async run(ctx: PubSubBenchmarkContext): Promise<PubSubBenchmarkResult> {
      return runPublishConsumeBenchmark(ctx, {
        scenario: "scheduled publish/consume (scheduler only)",
        scheduled: true,
        notBeforeMs: schedulerOnlyDelayMs(),
        warmup: false,
      });
    },
  },
  {
    name: "scheduled publish/consume (scheduler only, warmed up)",
    async run(ctx: PubSubBenchmarkContext): Promise<PubSubBenchmarkResult> {
      return runPublishConsumeBenchmark(ctx, {
        scenario: "scheduled publish/consume (scheduler only)",
        scheduled: true,
        notBeforeMs: schedulerOnlyDelayMs(),
        warmup: true,
      });
    },
  },
];

/** Render benchmark results as a human-readable Markdown table. */
export function benchmarkMarkdown(results: PubSubBenchmarkResult[]): string {
  const summaryRows = [
    "| Transport | Scenario | Mode | Messages | Publish Concurrency | Subscribe Concurrency | Duration ms | Msg/s | p50 ms | p95 ms | p99 ms | Duplicates |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...results.map(
      (result) =>
        `| ${result.transport} | ${result.scenario} | ${result.mode} | ${result.messages} | ${result.publishConcurrency} | ${result.subscribeConcurrency} | ${result.durationMs.toFixed(0)} | ${result.messagesPerSecond.toFixed(2)} | ${result.p50Ms.toFixed(2)} | ${result.p95Ms.toFixed(2)} | ${result.p99Ms.toFixed(2)} | ${result.duplicates} |`,
    ),
  ];
  const phaseRows = [
    "| Transport | Scenario | Mode | Subscribe Setup ms | Warmup ms | Publish Phase ms | Delivery Drain ms | First Delivery ms |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...results.map(
      (result) =>
        `| ${result.transport} | ${result.scenario} | ${result.mode} | ${result.subscribeSetupMs.toFixed(2)} | ${result.warmupMs.toFixed(2)} | ${result.publishPhaseMs.toFixed(2)} | ${result.deliveryDrainMs.toFixed(2)} | ${result.firstDeliveryMs.toFixed(2)} |`,
    ),
  ];
  return `${summaryRows.join("\n")}\n\n| Phase Breakdown |\n| --- |\n\n${phaseRows.join("\n")}`;
}

/** Run one end-to-end benchmark scenario against a shared transport adapter. */
async function runPublishConsumeBenchmark(
  ctx: PubSubBenchmarkContext,
  options: { scenario: string; scheduled: boolean; notBeforeMs: number; warmup: boolean },
): Promise<PubSubBenchmarkResult> {
  const messages = positiveIntegerEnv(
    "PUBSUB_BENCHMARK_EVENT_COUNT",
    DEFAULT_BENCHMARK_EVENT_COUNT,
  );
  const publishConcurrency = positiveIntegerEnv(
    "PUBSUB_BENCHMARK_PUBLISH_CONCURRENCY",
    DEFAULT_BENCHMARK_PUBLISH_CONCURRENCY,
  );
  const subscribeConcurrency = positiveIntegerEnv(
    "PUBSUB_BENCHMARK_SUBSCRIBE_CONCURRENCY",
    DEFAULT_BENCHMARK_SUBSCRIBE_CONCURRENCY,
  );
  const timeoutMs = positiveIntegerEnv("PUBSUB_BENCHMARK_TIMEOUT_MS", DEFAULT_BENCHMARK_TIMEOUT_MS);
  const scenarioKey = `${sanitizeScenarioKey(options.scenario)}_${options.warmup ? "warm" : "cold"}`;
  const topic = ctx.topic(scenarioKey);
  const scheduler = ctx.scheduler(scenarioKey);
  const transport = ctx.transport({ subscribeTopics: [topic], scheduler });
  const publisher = createPublisher(ConformanceEvents, transport, {
    source: "benchmark",
  });
  const router = createRouter(transport);
  const publishedAt = new Map<string, number>();
  const latencies: number[] = [];
  let warmupEventId = "";
  let warmupHandled: (() => void) | undefined;
  let delivered = 0;
  let duplicates = 0;
  let currentBenchmarkStartedAt = 0;
  let firstDeliveryMs = 0;

  router.service(ConformanceEvents, {
    async alphaHappened(request, handlerContext) {
      // Warmup traffic primes the exact transport path without contaminating the
      // measured benchmark counts and latency percentiles.
      if (request.eventId === warmupEventId && warmupHandled) {
        const handled = warmupHandled;
        warmupHandled = undefined;
        handled();
        await handlerContext.ack();
        return;
      }
      const startedAt = publishedAt.get(request.eventId);
      if (startedAt === undefined) {
        duplicates += 1;
      } else {
        publishedAt.delete(request.eventId);
        latencies.push(performance.now() - startedAt);
      }
      if (currentBenchmarkStartedAt > 0 && firstDeliveryMs === 0) {
        firstDeliveryMs = performance.now() - currentBenchmarkStartedAt;
      }
      delivered += 1;
      await handlerContext.ack();
    },
  });

  const subscribeStartedAt = performance.now();
  const subscription = await router.subscribe({
    consumerGroup: ctx.topic(
      `${options.scheduled ? "scheduled" : "immediate"}_${options.warmup ? "warm" : "cold"}_benchmark_workers`,
    ),
    concurrency: subscribeConcurrency,
  });
  const subscribeSetupMs = performance.now() - subscribeStartedAt;

  try {
    let warmupMs = 0;
    if (options.warmup) {
      const warmupStartedAt = performance.now();
      warmupEventId = `warmup_${options.scheduled ? "scheduled" : "immediate"}`;
      const warmupCompleted = new Promise<void>((resolve) => {
        warmupHandled = resolve;
      });
      const warmupNotBefore = timestampFromDate(
        new Date(Date.now() + Math.max(0, options.notBeforeMs)),
      );
      await publisher.alphaHappened(
        { eventId: warmupEventId, name: "warmup", count: -1 },
        options.scheduled ? { topic, notBefore: warmupNotBefore } : { topic },
      );
      await waitFor(() => warmupHandled === undefined, timeoutMs);
      await warmupCompleted;
      warmupEventId = "";
      warmupMs = performance.now() - warmupStartedAt;
    }

    const benchmarkStartedAt = performance.now();
    currentBenchmarkStartedAt = benchmarkStartedAt;
    firstDeliveryMs = 0;
    // Reuse one due time per scenario so the scheduled benchmark is measuring
    // scheduler behavior, not variance in per-message timestamps.
    const notBefore = timestampFromDate(new Date(Date.now() + Math.max(0, options.notBeforeMs)));
    await runConcurrent(messages, publishConcurrency, async (index) => {
      const eventId = `benchmark_${index}`;
      publishedAt.set(eventId, performance.now());
      await publisher.alphaHappened(
        { eventId, name: "benchmark", count: index },
        options.scheduled ? { topic, notBefore } : { topic },
      );
    });
    const publishPhaseMs = performance.now() - benchmarkStartedAt;
    await waitFor(() => delivered >= messages, timeoutMs);
    const durationMs = performance.now() - benchmarkStartedAt;
    const deliveryDrainMs = durationMs - publishPhaseMs;

    return {
      transport: ctx.transportName,
      scenario: options.scenario,
      mode: options.warmup ? "warmed up" : "cold start",
      messages,
      publishConcurrency,
      subscribeConcurrency,
      durationMs,
      messagesPerSecond: (messages / durationMs) * 1_000,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      p99Ms: percentile(latencies, 0.99),
      duplicates,
      subscribeSetupMs,
      warmupMs,
      publishPhaseMs,
      deliveryDrainMs,
      firstDeliveryMs,
    };
  } finally {
    await subscription.unsubscribe();
  }
}

/** Run `task` across a bounded number of worker loops. */
async function runConcurrent(
  count: number,
  concurrency: number,
  task: (index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  // Shared worker loops keep the benchmark portable across transports while
  // still driving concurrent publish pressure.
  const workers = Array.from({ length: Math.min(count, concurrency) }, async () => {
    while (next < count) {
      const index = next;
      next += 1;
      await task(index);
    }
  });
  await Promise.all(workers);
}

/** Poll until a benchmark condition becomes true or the timeout expires. */
async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`benchmark timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Compute one percentile from a set of latency samples. */
function percentile(values: number[], percentileRank: number): number {
  if (!values.length) {
    return 0;
  }
  // Copy before sorting so callers can keep appending latency samples while the
  // current percentile calculation stays stable.
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentileRank));
  return sorted[index] ?? 0;
}

/** Read a positive integer benchmark setting from the environment. */
function positiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Read a non-negative integer benchmark setting from the environment. */
function nonNegativeIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Resolve the scheduled benchmark delay from environment or default settings. */
function benchmarkDelayMs(): number {
  return nonNegativeIntegerEnv("PUBSUB_BENCHMARK_NOT_BEFORE_MS", DEFAULT_BENCHMARK_NOT_BEFORE_MS);
}

/** Resolve the scheduler-only benchmark delay from environment or default settings. */
function schedulerOnlyDelayMs(): number {
  return nonNegativeIntegerEnv(
    "PUBSUB_BENCHMARK_SCHEDULER_ONLY_NOT_BEFORE_MS",
    DEFAULT_BENCHMARK_SCHEDULER_ONLY_NOT_BEFORE_MS,
  );
}

/** Convert a scenario name into a topic-safe identifier segment. */
function sanitizeScenarioKey(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
}
