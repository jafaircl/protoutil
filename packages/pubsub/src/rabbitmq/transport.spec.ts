import { afterEach, describe, it } from "vitest";
import { groups, type PubSubTransportTestContext } from "../test-cases.js";
import type { PubSubTransport } from "../types.js";
import { createRabbitMqScheduler, createRabbitMqTransport } from "./index.js";

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@127.0.0.1:5673";

const transports: PubSubTransport[] = [];

afterEach(async () => {
  for (const transport of transports.splice(0)) {
    await transport.close();
  }
});

describe("RabbitMQ pubsub transport", () => {
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

/** Build one isolated RabbitMQ transport test context for a spec run. */
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
      const transport = createRabbitMqTransport({
        url: RABBITMQ_URL,
        interceptors: options?.interceptors,
        queuePrefix: `protoutil.pubsub.queue.${suffix}`,
        scheduler: options?.scheduler
          ? createRabbitMqScheduler({
              url: RABBITMQ_URL,
              scheduleQueue: options.scheduler.schedulesTopic,
              interceptors: options.interceptors,
            })
          : undefined,
      });
      transports.push(transport);
      return transport;
    },
  };
}

/** Build a unique suffix for isolated RabbitMQ integration-test topics. */
function testSuffix(): string {
  return `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
}
