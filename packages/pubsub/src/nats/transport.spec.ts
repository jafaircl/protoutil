import { afterEach, describe, it } from "vitest";
import { groups, type PubSubTransportTestContext } from "../test-cases.js";
import type { PubSubTransport } from "../types.js";
import { createNatsScheduler, createNatsTransport } from "./index.js";

const NATS_SERVERS = process.env.NATS_SERVERS ?? "nats://127.0.0.1:14222";
const NATS_EVENT_STREAM = "PROTOUTIL_PUBSUB_TEST";

const transports: PubSubTransport[] = [];

afterEach(async () => {
  for (const transport of transports.splice(0)) {
    await transport.close();
  }
});

describe("NATS pubsub transport", () => {
  for (const { group, cases } of groups) {
    describe(group, () => {
      for (const testCase of cases) {
        it(testCase.name, async () => {
          await testCase.run(context(testSuffix()));
        }, 30_000);
      }
    });
  }
});

/** Build one isolated NATS transport test context for a spec run. */
function context(suffix: string): PubSubTransportTestContext {
  return {
    topic(name) {
      return `protoutil.events.${suffix}.${name}`;
    },
    scheduler(name) {
      return {
        schedulesTopic: `protoutil.scheduler.${suffix}.${name}.wake`,
        historyTopic: `protoutil.scheduler.${suffix}.${name}.history`,
        consumerGroup: `protoutil.scheduler.${suffix}.${name}`,
      };
    },
    transport(options) {
      const transport = createNatsTransport({
        servers: NATS_SERVERS,
        interceptors: options?.interceptors,
        stream: {
          name: NATS_EVENT_STREAM,
          subjects: ["protoutil.events.>", "protoutil.pubsub.testing.>"],
        },
        scheduler: options?.scheduler
          ? createNatsScheduler({
              servers: NATS_SERVERS,
              options: {
                streamName: `PROTOUTIL_PUBSUB_SCHED_${suffix.replaceAll(".", "_").toUpperCase()}`,
                subject: `protoutil.scheduler.${suffix}.wake`,
                kvBucket: `protoutil_pubsub_sched_${suffix.replaceAll(/[^a-zA-Z0-9]+/g, "_")}`,
                consumerName: options.scheduler.consumerGroup ?? `protoutil.scheduler.${suffix}`,
              },
              interceptors: options.interceptors,
            })
          : undefined,
      });
      transports.push(transport);
      return transport;
    },
  };
}

/** Build a unique suffix for isolated NATS integration-test subjects. */
function testSuffix(): string {
  return `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
}
