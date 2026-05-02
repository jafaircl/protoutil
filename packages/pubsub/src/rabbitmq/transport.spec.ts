import { afterEach, describe, expect, it } from "vitest";
import { groups, type PubSubTransportTestContext } from "../test-cases.js";
import { stableTopicHash } from "../transport-utils.js";
import type { PubSubTransport } from "../types.js";
import { createRabbitMqScheduler, createRabbitMqTransport } from "./index.js";

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@127.0.0.1:5673";
const RABBITMQ_MANAGEMENT_URL = process.env.RABBITMQ_MANAGEMENT_URL ?? "http://127.0.0.1:15673";

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

  it("closes RabbitMQ consumer channel on unsubscribe", async () => {
    const suffix = testSuffix();
    const ctx = context(suffix);
    const topic = ctx.topic("unsubscribe_probe");
    const consumerGroup = ctx.topic("unsubscribe_probe_workers");
    const queueName = rabbitSubscriptionQueue(suffix, consumerGroup, [topic]);
    const transport = ctx.transport();

    const subscription = await transport.subscribe(async () => ({ kind: "ack" }), {
      topics: [topic],
      consumerGroup,
    });
    await waitFor(async () => (await rabbitQueueConsumers(queueName)) > 0);
    await subscription.unsubscribe();
    await waitFor(async () => (await rabbitQueueConsumers(queueName)) === 0);
    expect(await rabbitQueueConsumers(queueName)).toBe(0);
  }, 30_000);

  it("closes RabbitMQ consumer channel on transport close", async () => {
    const suffix = testSuffix();
    const ctx = context(suffix);
    const topic = ctx.topic("close_probe");
    const consumerGroup = ctx.topic("close_probe_workers");
    const queueName = rabbitSubscriptionQueue(suffix, consumerGroup, [topic]);
    const transport = ctx.transport();

    await transport.subscribe(async () => ({ kind: "ack" }), {
      topics: [topic],
      consumerGroup,
    });
    await waitFor(async () => (await rabbitQueueConsumers(queueName)) > 0);
    await transport.close();
    await waitFor(async () => (await rabbitQueueConsumers(queueName)) === 0);
    expect(await rabbitQueueConsumers(queueName)).toBe(0);
  }, 30_000);

  it("closes RabbitMQ consumer channel on abort signal", async () => {
    const suffix = testSuffix();
    const ctx = context(suffix);
    const topic = ctx.topic("abort_probe");
    const consumerGroup = ctx.topic("abort_probe_workers");
    const queueName = rabbitSubscriptionQueue(suffix, consumerGroup, [topic]);
    const controller = new AbortController();
    const transport = ctx.transport({ signal: controller.signal });

    await transport.subscribe(async () => ({ kind: "ack" }), {
      topics: [topic],
      consumerGroup,
      signal: controller.signal,
    });
    await waitFor(async () => (await rabbitQueueConsumers(queueName)) > 0);
    controller.abort();
    await waitFor(async () => (await rabbitQueueConsumers(queueName)) === 0);
    expect(await rabbitQueueConsumers(queueName)).toBe(0);
  }, 30_000);
});

async function waitFor(
  predicate: () => Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 100;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`timed out after ${timeoutMs}ms`);
}

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
        signal: options?.signal,
        queuePrefix: `protoutil.pubsub.queue.${suffix}`,
        scheduler: options?.scheduler
          ? createRabbitMqScheduler({
              url: RABBITMQ_URL,
              scheduleQueue: options.scheduler.schedulesTopic,
              interceptors: options.interceptors,
              signal: options.signal,
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

function rabbitSubscriptionQueue(suffix: string, consumerGroup: string, topics: string[]): string {
  return `protoutil.pubsub.queue.${suffix}.${rabbitTopicKey(consumerGroup)}.${stableTopicHash(topics)}`;
}

function rabbitTopicKey(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ".")
    .replaceAll(/^\.+|\.+$/g, "");
}

async function rabbitQueueConsumers(queueName: string): Promise<number> {
  const encodedQueue = encodeURIComponent(queueName);
  const endpoint = `${RABBITMQ_MANAGEMENT_URL}/api/queues/%2F/${encodedQueue}`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Basic ${Buffer.from("guest:guest").toString("base64")}`,
    },
  });
  if (!response.ok) {
    throw new Error(`RabbitMQ management API returned ${response.status} for ${queueName}`);
  }
  const queue = (await response.json()) as { consumers?: number };
  return queue.consumers ?? 0;
}
