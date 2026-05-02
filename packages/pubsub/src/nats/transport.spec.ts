import { connect } from "nats";
import { afterEach, describe, expect, it } from "vitest";
import { groups, type PubSubTransportTestContext } from "../test-cases.js";
import { stableTopicHash } from "../transport-utils.js";
import type { PubSubTransport } from "../types.js";
import { createNatsScheduler, createNatsTransport } from "./index.js";
import { durableNamePart } from "./utils.js";

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

  it("closes NATS pull consumer on unsubscribe", async () => {
    const suffix = testSuffix();
    const ctx = context(suffix);
    const topic = ctx.topic("unsubscribe_probe");
    const consumerGroup = ctx.topic("unsubscribe_probe_workers");
    const consumerName = natsSubscriptionConsumerName(consumerGroup, [topic]);
    const transport = ctx.transport();

    const subscription = await transport.subscribe(async () => ({ kind: "ack" }), {
      topics: [topic],
      consumerGroup,
    });

    await waitFor(async () => (await natsConsumerNumWaiting(consumerName)) > 0);
    await subscription.unsubscribe();
    await waitFor(async () => (await natsConsumerNumWaiting(consumerName)) === 0);
    expect(await natsConsumerNumWaiting(consumerName)).toBe(0);
  }, 30_000);

  it("closes NATS pull consumer on transport close", async () => {
    const suffix = testSuffix();
    const ctx = context(suffix);
    const topic = ctx.topic("close_probe");
    const consumerGroup = ctx.topic("close_probe_workers");
    const consumerName = natsSubscriptionConsumerName(consumerGroup, [topic]);
    const transport = ctx.transport();

    await transport.subscribe(async () => ({ kind: "ack" }), {
      topics: [topic],
      consumerGroup,
    });

    await waitFor(async () => (await natsConsumerNumWaiting(consumerName)) > 0);
    await transport.close();
    await waitFor(async () => (await natsConsumerNumWaiting(consumerName)) === 0);
    expect(await natsConsumerNumWaiting(consumerName)).toBe(0);
  }, 30_000);

  it("closes NATS pull consumer on abort signal", async () => {
    const suffix = testSuffix();
    const ctx = context(suffix);
    const topic = ctx.topic("abort_probe");
    const consumerGroup = ctx.topic("abort_probe_workers");
    const consumerName = natsSubscriptionConsumerName(consumerGroup, [topic]);
    const controller = new AbortController();
    const transport = ctx.transport({ signal: controller.signal });

    await transport.subscribe(async () => ({ kind: "ack" }), {
      topics: [topic],
      consumerGroup,
      signal: controller.signal,
    });

    await waitFor(async () => (await natsConsumerNumWaiting(consumerName)) > 0);
    controller.abort();
    await waitFor(async () => (await natsConsumerNumWaiting(consumerName)) === 0);
    expect(await natsConsumerNumWaiting(consumerName)).toBe(0);
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
        signal: options?.signal,
        stream: {
          name: NATS_EVENT_STREAM,
          subjects: ["protoutil.events.>", "protoutil.pubsub.testing.>"],
        },
        scheduler: options?.scheduler
          ? createNatsScheduler({
              servers: NATS_SERVERS,
              signal: options.signal,
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

function natsSubscriptionConsumerName(consumerGroup: string, topics: string[]): string {
  return `${durableNamePart(consumerGroup)}_${stableTopicHash(topics)}`;
}

async function natsConsumerNumWaiting(consumerName: string): Promise<number> {
  const connection = await connect({ servers: NATS_SERVERS });
  try {
    const manager = await connection.jetstreamManager();
    const info = await manager.consumers.info(NATS_EVENT_STREAM, consumerName);
    return info.num_waiting;
  } finally {
    await connection.close();
  }
}
