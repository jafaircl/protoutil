import { writeFile } from "node:fs/promises";
import { afterEach, describe, it } from "vitest";
import {
  benchmarkCases,
  benchmarkMarkdown,
  type PubSubBenchmarkResult,
} from "./benchmark-cases.js";
import { closeTrackedTransports, testTransportAdapters } from "./test-transports.js";

// Run with:
//   pnpm moon run pubsub:benchmark
//
// Optional environment variables:
//   PUBSUB_BENCHMARK_EVENT_COUNT: number of events per scenario; default 1000.
//   PUBSUB_BENCHMARK_PUBLISH_CONCURRENCY: concurrent publish calls; default 50.
//   PUBSUB_BENCHMARK_SUBSCRIBE_CONCURRENCY: requested subscriber concurrency; default 32.
//   PUBSUB_BENCHMARK_NOT_BEFORE_MS: delay for scheduled scenario; default 1000.
//   PUBSUB_BENCHMARK_SCHEDULER_ONLY_NOT_BEFORE_MS: delay for scheduler-only scenario; default 0.
//   PUBSUB_BENCHMARK_TIMEOUT_MS: scenario delivery timeout; default 120000.
//   PUBSUB_BENCHMARK_TEST_TIMEOUT_MS: Vitest timeout for this file; default 300000.
//
// Methodology notes:
// - Scenarios are end-to-end application benchmarks, not raw broker client microbenchmarks.
//   They include transport lazy startup, topic setup, consumer group join, CloudEvent and protobuf
//   serialization, router dispatch, and scheduler persistence for delayed delivery.
// - Each scenario is measured twice: cold start (first run) and warmed up (transport already initialized).
// - Small runs (1000 events) exaggerate fixed startup costs.
// - Scheduled latency includes the configured `notBefore` delay; subtract it to get scheduler overhead.
//
// The entrypoint is shared for all transports. Each transport contributes an
// adapter through src/test-transports.ts.
const BENCHMARK_TEST_TIMEOUT_MS = Number(process.env.PUBSUB_BENCHMARK_TEST_TIMEOUT_MS ?? "300000");
const BENCHMARK_FILE = new URL("../BENCHMARK.md", import.meta.url);

afterEach(async () => {
  await closeTrackedTransports();
});

describe("Pubsub transport benchmark", () => {
  it(
    "prints benchmark results as Markdown and writes BENCHMARK.md",
    async () => {
      const results: PubSubBenchmarkResult[] = [];
      for (const adapter of testTransportAdapters) {
        // Each registered transport runs the exact same benchmark matrix so the
        // generated file can compare them side by side.
        const context = adapter.benchmarkContext(testSuffix());
        for (const benchmarkCase of benchmarkCases) {
          results.push(await benchmarkCase.run(context));
        }
      }
      const markdown = benchmarkMarkdown(results);
      await writeFile(BENCHMARK_FILE, benchmarkDocument(markdown), "utf8");
      console.log(`\n${markdown}\n`);
    },
    BENCHMARK_TEST_TIMEOUT_MS,
  );
});

/** Build a unique suffix for isolated benchmark topic names. */
function testSuffix(): string {
  return `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
}

/** Wrap the generated benchmark table in a reusable Markdown document. */
function benchmarkDocument(resultsTable: string): string {
  const generatedAt = new Date().toISOString();
  const transports = testTransportAdapters.map((adapter) => adapter.name).join(", ");
  return `# PubSub Transport Benchmarking

This file is rewritten by:

\`\`\`sh
pnpm moon run pubsub:benchmark
\`\`\`

Generated at: \`${generatedAt}\`

## Methodology

These benchmark scenarios are end-to-end application benchmarks, not raw broker client microbenchmarks. This file currently contains results for: ${transports}. They include transport lazy startup, topic setup, consumer group join, CloudEvent and protobuf serialization, router dispatch, and scheduler persistence for delayed delivery.

Each scenario is measured twice: once on a cold path and once after a warm-up event has already exercised the same transport path. Small runs exaggerate fixed startup costs. Scheduled latency also includes the configured \`notBefore\` delay.

## Configuration

| Variable | Value |
| --- | --- |
| \`KAFKA_BOOTSTRAP_SERVER\` | \`${process.env.KAFKA_BOOTSTRAP_SERVER ?? "localhost:19092"}\` |
| \`PUBSUB_BENCHMARK_EVENT_COUNT\` | \`${process.env.PUBSUB_BENCHMARK_EVENT_COUNT ?? "1000"}\` |
| \`PUBSUB_BENCHMARK_PUBLISH_CONCURRENCY\` | \`${process.env.PUBSUB_BENCHMARK_PUBLISH_CONCURRENCY ?? "50"}\` |
| \`PUBSUB_BENCHMARK_SUBSCRIBE_CONCURRENCY\` | \`${process.env.PUBSUB_BENCHMARK_SUBSCRIBE_CONCURRENCY ?? "32"}\` |
| \`PUBSUB_BENCHMARK_NOT_BEFORE_MS\` | \`${process.env.PUBSUB_BENCHMARK_NOT_BEFORE_MS ?? "1000"}\` |
| \`PUBSUB_BENCHMARK_SCHEDULER_ONLY_NOT_BEFORE_MS\` | \`${process.env.PUBSUB_BENCHMARK_SCHEDULER_ONLY_NOT_BEFORE_MS ?? "0"}\` |
| \`PUBSUB_BENCHMARK_TIMEOUT_MS\` | \`${process.env.PUBSUB_BENCHMARK_TIMEOUT_MS ?? "120000"}\` |
| \`PUBSUB_BENCHMARK_TEST_TIMEOUT_MS\` | \`${process.env.PUBSUB_BENCHMARK_TEST_TIMEOUT_MS ?? "300000"}\` |

## Results

Note: Scheduled scenario durations include the configured notBefore delay; subtract it to get scheduler overhead (~100-300ms for most transports).

${resultsTable}
`;
}
