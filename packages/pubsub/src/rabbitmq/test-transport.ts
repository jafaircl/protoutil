import type { PubSubBenchmarkContext } from "../benchmark-cases.js";
import type { PubSubTransportTestContext, TransportOptions } from "../test-cases.js";
import type { PubSubTestTransportAdapter } from "../test-transport-types.js";
import type { PubSubTransport } from "../types.js";
import { createRabbitMqScheduler, createRabbitMqTransport } from "./index.js";

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@127.0.0.1:5673";

/** Registered RabbitMQ shared test adapter. */
export const rabbitTestTransportAdapter: PubSubTestTransportAdapter = {
  name: "rabbitmq",
  /** Build the shared test context for one isolated RabbitMQ-backed run. */
  testContext(suffix) {
    return testContext(suffix);
  },
  /** Build the shared benchmark context for one isolated RabbitMQ-backed run. */
  benchmarkContext(suffix) {
    return { transportName: "rabbitmq", ...testContext(suffix) };
  },
};

const transports: PubSubTransport[] = [];

/** Close all tracked RabbitMQ transports created for load and benchmark specs. */
export async function closeTrackedRabbitMqTransports(): Promise<void> {
  for (const transport of transports.splice(0)) {
    await transport.close();
  }
}

/** Build one tracked RabbitMQ transport instance for shared tests and benchmarks. */
function createTrackedRabbitMqTransport(
  suffix: string,
  options?:
    | Parameters<PubSubTransportTestContext["transport"]>[0]
    | Parameters<PubSubBenchmarkContext["transport"]>[0],
): PubSubTransport {
  const testOptions = transportTestOptions(options);
  const transport = createRabbitMqTransport({
    url: RABBITMQ_URL,
    interceptors: testOptions?.interceptors,
    signal: testOptions?.signal,
    queuePrefix: `protoutil.pubsub.queue.${suffix}`,
    scheduler: options?.scheduler
      ? createRabbitMqScheduler({
          url: RABBITMQ_URL,
          scheduleQueue: options.scheduler.schedulesTopic,
          interceptors: testOptions?.interceptors,
          signal: testOptions?.signal,
        })
      : undefined,
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
  if (
    !options ||
    (!("scheduler" in options) && !("interceptors" in options) && !("signal" in options))
  ) {
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
      return createTrackedRabbitMqTransport(suffix, options);
    },
  };
}
