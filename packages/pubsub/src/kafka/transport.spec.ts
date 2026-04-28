import { KafkaJS } from "@confluentinc/kafka-javascript";
import { afterEach, describe, it } from "vitest";
import { backendSpecificGroups, groups, type PubSubTransportTestContext } from "../test-cases.js";
import type { PubSubTransport } from "../types.js";
import { createKafkaScheduler, createKafkaTransport } from "./index.js";

const BOOTSTRAP_SERVER = process.env.KAFKA_BOOTSTRAP_SERVER ?? "localhost:19092";

const transports: PubSubTransport[] = [];

afterEach(async () => {
  for (const transport of transports.splice(0)) {
    await transport.close();
  }
});

describe("Kafka pubsub transport", () => {
  for (const { group, cases } of groups) {
    describe(group, () => {
      for (const testCase of cases) {
        it(testCase.name, async () => {
          await testCase.run(context(testSuffix()));
        }, 30_000);
      }
    });
  }

  for (const { group, cases } of backendSpecificGroups.kafka ?? []) {
    describe(group, () => {
      for (const testCase of cases) {
        it(testCase.name, async () => {
          await testCase.run(context(testSuffix()));
        }, 30_000);
      }
    });
  }
});

/** Build one isolated Kafka transport test context for a spec run. */
function context(suffix: string): PubSubTransportTestContext {
  return {
    topic(name) {
      return `protoutil.${name}.${suffix}`;
    },
    scheduler(name) {
      return {
        schedulesTopic: `protoutil.pubsub.${name}.schedules.${suffix}`,
        historyTopic: `protoutil.pubsub.${name}.history.${suffix}`,
        consumerGroup: `protoutil.pubsub.${name}.scheduler.${suffix}`,
      };
    },
    transport(options) {
      const transport = createKafkaTransport({
        client: kafkaClient(),
        interceptors: options?.interceptors,
        consumerConfig: {
          kafkaJS: {
            fromBeginning: true,
            logLevel: KafkaJS.logLevel.NOTHING,
          },
        },
        scheduler: options?.scheduler
          ? createKafkaScheduler({
              client: kafkaClient(),
              options: options.scheduler,
              interceptors: options.interceptors,
            })
          : undefined,
      });
      transports.push(transport);
      return transport;
    },
  };
}

/** Create a low-noise Kafka client for integration tests. */
function kafkaClient(): KafkaJS.Kafka {
  return new KafkaJS.Kafka({
    "bootstrap.servers": BOOTSTRAP_SERVER,
    kafkaJS: { logLevel: KafkaJS.logLevel.NOTHING } as KafkaJS.KafkaConfig,
  });
}

/** Build a unique suffix for isolated Kafka integration-test topics. */
function testSuffix(): string {
  return `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
}
