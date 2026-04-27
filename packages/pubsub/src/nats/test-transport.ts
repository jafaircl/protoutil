import type { PubSubBenchmarkContext } from "../benchmark-cases.js";
import type { PubSubTransportTestContext, TransportOptions } from "../test-cases.js";
import type { PubSubTestTransportAdapter } from "../test-transport-types.js";
import type { PubSubTransport } from "../types.js";
import { createNatsTransport } from "./index.js";

const NATS_SERVERS = process.env.NATS_SERVERS ?? "nats://127.0.0.1:14222";

/** Registered NATS shared test adapter. */
export const natsTestTransportAdapter: PubSubTestTransportAdapter = {
  name: "nats",
  /** Build the shared test context for one isolated NATS-backed run. */
  testContext(suffix) {
    return testContext(suffix);
  },
  /** Build the shared benchmark context for one isolated NATS-backed run. */
  benchmarkContext(suffix) {
    return { transportName: "nats", ...testContext(suffix) };
  },
};

const transports: PubSubTransport[] = [];

/** Close all tracked NATS transports created for load and benchmark specs. */
export async function closeTrackedNatsTransports(): Promise<void> {
  for (const transport of transports.splice(0)) {
    await transport.close();
  }
}

/** Build one tracked NATS transport instance for shared tests and benchmarks. */
function createTrackedNatsTransport(
  suffix: string,
  options?:
    | Parameters<PubSubTransportTestContext["transport"]>[0]
    | Parameters<PubSubBenchmarkContext["transport"]>[0],
): PubSubTransport {
  const testOptions = transportTestOptions(options);
  const eventSubjectPrefix = `protoutil.events.${suffix}`;
  const schedulerSubjectPrefix = `protoutil.scheduler.${suffix}`;
  const transport = createNatsTransport({
    servers: NATS_SERVERS,
    subscribeTopics: options?.subscribeTopics,
    deadLetterTopic: testOptions?.deadLetterTopic,
    interceptors: testOptions?.interceptors,
    stream: {
      name: `PROTOUTIL_PUBSUB_${suffix.replaceAll(".", "_").toUpperCase()}`,
      subjects: [`${eventSubjectPrefix}.>`],
    },
    scheduler: {
      streamName: `PROTOUTIL_PUBSUB_SCHED_${suffix.replaceAll(".", "_").toUpperCase()}`,
      subject: `${schedulerSubjectPrefix}.wake`,
      kvBucket: `protoutil_pubsub_sched_${suffix.replaceAll(/[^a-zA-Z0-9]+/g, "_")}`,
      consumerName: options?.scheduler?.consumerGroup ?? `protoutil.pubsub.scheduler.${suffix}`,
    },
  });
  transports.push(transport);
  return transport;
}

/** Narrow shared adapter options to the transport-test-specific subset when present. */
function transportTestOptions(
  options:
    | Parameters<PubSubTransportTestContext["transport"]>[0]
    | Parameters<PubSubBenchmarkContext["transport"]>[0],
): TransportOptions | undefined {
  if (!options || (!("deadLetterTopic" in options) && !("interceptors" in options))) {
    return undefined;
  }
  return options;
}

/** Build one isolated shared test context using a deterministic subject suffix. */
function testContext(suffix: string): PubSubTransportTestContext {
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
      return createTrackedNatsTransport(suffix, options);
    },
  };
}
