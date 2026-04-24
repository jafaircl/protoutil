import { afterEach, describe, it } from "vitest";
import { loadGroups } from "./test-cases.js";
import { closeTrackedTransports, testTransportAdapters } from "./test-transports.js";

// Run with:
//   pnpm moon run pubsub:load-test
//
// Optional environment variables:
//   PUBSUB_LOAD_EVENT_COUNT: number of delayed events to publish; default 1000.
//   PUBSUB_LOAD_NOT_BEFORE_MS: delay before scheduled delivery; default 1000.
//   PUBSUB_LOAD_PUBLISH_CONCURRENCY: concurrent publish calls; default 50.
//   PUBSUB_LOAD_SUBSCRIBE_CONCURRENCY: requested subscriber concurrency; default 32.
//   PUBSUB_LOAD_TIMEOUT_MS: delivery assertion timeout; default max(60000, eventCount * 25).
//   PUBSUB_LOAD_TEST_TIMEOUT_MS: Vitest timeout for this file; default 120000.
//
// The entrypoint is shared for all transports. Each transport contributes an
// adapter through src/test-transports.ts.
const LOAD_TEST_TIMEOUT_MS = Number(process.env.PUBSUB_LOAD_TEST_TIMEOUT_MS ?? "120000");

afterEach(async () => {
  await closeTrackedTransports();
});

for (const adapter of testTransportAdapters) {
  describe(`${adapter.name} pubsub transport load`, () => {
    for (const { group, cases } of loadGroups) {
      describe(group, () => {
        for (const testCase of cases) {
          it(
            testCase.name,
            async () => {
              // The shared load suite fans out through registered adapters so
              // every backend exercises the same sustained-traffic scenarios.
              await testCase.run(adapter.testContext(testSuffix()));
            },
            LOAD_TEST_TIMEOUT_MS,
          );
        }
      });
    }
  });
}

/** Build a unique suffix for isolated load-test topic names. */
function testSuffix(): string {
  return `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
}
