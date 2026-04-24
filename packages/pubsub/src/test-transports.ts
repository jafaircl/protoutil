import {
  closeTrackedTransports as closeTrackedKafkaTransports,
  testTransportAdapters as kafkaTransportAdapters,
} from "./kafka/test-transport.js";
import {
  closeTrackedRabbitMqTransports,
  rabbitTestTransportAdapter,
} from "./rabbitmq/test-transport.js";

// Shared spec entrypoints import adapters from here so transport-specific setup
// stays behind one small registry.
export const testTransportAdapters = [...kafkaTransportAdapters, rabbitTestTransportAdapter];

/** Close all tracked transports created by shared load and benchmark specs. */
export async function closeTrackedTransports(): Promise<void> {
  await closeTrackedKafkaTransports();
  await closeTrackedRabbitMqTransports();
}

export type { PubSubTestTransportAdapter } from "./test-transport-types.js";
