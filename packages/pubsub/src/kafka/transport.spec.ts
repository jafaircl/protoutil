import { KafkaJS } from "@confluentinc/kafka-javascript";
import { afterEach, describe, expect, it } from "vitest";
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

  it("closes Kafka consumer group membership on abort signal", async () => {
    const suffix = testSuffix();
    const controller = new AbortController();
    const ctx = context(suffix);
    const transport = ctx.transport({ signal: controller.signal });
    const topic = ctx.topic("close_probe");
    const consumerGroup = ctx.topic("close_probe_workers");

    const sub = await transport.subscribe(async () => ({ kind: "ack" }), {
      topics: [topic],
      consumerGroup,
      signal: controller.signal,
    });

    await waitFor(async () => (await kafkaGroupMemberCount(consumerGroup)) > 0);
    controller.abort();
    await sub.unsubscribe().catch(() => undefined);
    await waitFor(async () => (await kafkaGroupMemberCount(consumerGroup)) === 0);
    expect(await kafkaGroupMemberCount(consumerGroup)).toBe(0);
  }, 30_000);

  it("closes Kafka consumer group membership on unsubscribe", async () => {
    const suffix = testSuffix();
    const ctx = context(suffix);
    const transport = ctx.transport();
    const topic = ctx.topic("unsubscribe_probe");
    const consumerGroup = ctx.topic("unsubscribe_probe_workers");

    const sub = await transport.subscribe(async () => ({ kind: "ack" }), {
      topics: [topic],
      consumerGroup,
    });

    await waitFor(async () => (await kafkaGroupMemberCount(consumerGroup)) > 0);
    await sub.unsubscribe();
    await waitFor(async () => (await kafkaGroupMemberCount(consumerGroup)) === 0);
    expect(await kafkaGroupMemberCount(consumerGroup)).toBe(0);
  }, 30_000);

  it("closes Kafka consumer group membership on transport close", async () => {
    const suffix = testSuffix();
    const ctx = context(suffix);
    const transport = ctx.transport();
    const topic = ctx.topic("close_probe");
    const consumerGroup = ctx.topic("close_probe_workers");

    await transport.subscribe(async () => ({ kind: "ack" }), {
      topics: [topic],
      consumerGroup,
    });

    await waitFor(async () => (await kafkaGroupMemberCount(consumerGroup)) > 0);
    await transport.close();
    await waitFor(async () => (await kafkaGroupMemberCount(consumerGroup)) === 0);
    expect(await kafkaGroupMemberCount(consumerGroup)).toBe(0);
  }, 30_000);
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
        signal: options?.signal,
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
              signal: options.signal,
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

async function kafkaGroupMemberCount(groupId: string): Promise<number> {
  const admin = kafkaClient().admin();
  await admin.connect();
  try {
    const described = (await admin.describeGroups([groupId])) as unknown;
    const groups = Array.isArray(described)
      ? described
      : ((described as { groups?: unknown[] }).groups ?? []);
    const group = groups[0] as { members?: unknown[] } | undefined;
    return group?.members?.length ?? 0;
  } finally {
    await admin.disconnect();
  }
}

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

/** Build a unique suffix for isolated Kafka integration-test topics. */
function testSuffix(): string {
  return `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
}
