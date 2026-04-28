import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { PubSubBenchmarkContext } from "../benchmark-cases.js";
import type { PubSubTransportTestContext, TransportOptions } from "../test-cases.js";
import type { PubSubTestTransportAdapter } from "../test-transport-types.js";
import type { PubSubTransport } from "../types.js";
import { createKafkaScheduler, createKafkaTransport } from "./index.js";

const BOOTSTRAP_SERVER = process.env.KAFKA_BOOTSTRAP_SERVER ?? "localhost:19092";

/** Registered Kafka shared test adapter. */
export const kafkaTestTransportAdapter: PubSubTestTransportAdapter = {
  name: "kafka",
  /** Build the shared test context for one isolated Kafka-backed run. */
  testContext(suffix) {
    return testContext(suffix);
  },
  /** Build the shared benchmark context for one isolated Kafka-backed run. */
  benchmarkContext(suffix) {
    return { transportName: "kafka", ...testContext(suffix) };
  },
};

const transports: PubSubTransport[] = [];

/** Close all tracked transports created for load and benchmark specs. */
export async function closeTrackedKafkaTransports(): Promise<void> {
  for (const transport of transports.splice(0)) {
    await transport.close();
  }
}

/** Build one tracked Kafka transport instance for shared tests and benchmarks. */
function createTrackedKafkaTransport(
  _suffix: string,
  options?:
    | Parameters<PubSubTransportTestContext["transport"]>[0]
    | Parameters<PubSubBenchmarkContext["transport"]>[0],
): PubSubTransport {
  const testOptions = transportTestOptions(options);
  // Shared specs need isolated topics plus predictable defaults, but they still
  // exercise the public Kafka transport API end to end.
  const transport = createKafkaTransport({
    client: kafkaClient(),
    interceptors: testOptions?.interceptors,
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
          interceptors: testOptions?.interceptors,
        })
      : undefined,
  });
  transports.push(transport);
  return transport;
}

/** Create a low-noise Kafka client pointed at the shared test broker. */
function kafkaClient(): KafkaJS.Kafka {
  return new KafkaJS.Kafka({
    "bootstrap.servers": BOOTSTRAP_SERVER,
    kafkaJS: { logLevel: KafkaJS.logLevel.NOTHING } as KafkaJS.KafkaConfig,
  });
}

/** Narrow shared adapter options to the transport-test-specific subset when present. */
function transportTestOptions(
  options:
    | Parameters<PubSubTransportTestContext["transport"]>[0]
    | Parameters<PubSubBenchmarkContext["transport"]>[0],
): TransportOptions | undefined {
  if (!options || (!("scheduler" in options) && !("interceptors" in options))) {
    return undefined;
  }
  return options;
}

/** Build one isolated shared test context using a deterministic topic suffix. */
function testContext(suffix: string): PubSubTransportTestContext {
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
      return createTrackedKafkaTransport(suffix, options);
    },
  };
}
