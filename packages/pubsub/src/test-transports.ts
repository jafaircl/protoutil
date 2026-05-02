import { closeTrackedKafkaTransports, kafkaTestTransportAdapter } from "./kafka/test-transport.js";
import { closeTrackedNatsTransports, natsTestTransportAdapter } from "./nats/test-transport.js";
import {
  closeTrackedRabbitMqTransports,
  rabbitTestTransportAdapter,
} from "./rabbitmq/test-transport.js";

// Shared spec entrypoints import adapters from here so transport-specific setup
// stays behind one small registry.
export const testTransportAdapters = [
  kafkaTestTransportAdapter,
  rabbitTestTransportAdapter,
  natsTestTransportAdapter,
];

/** Close all tracked transports created by shared load and benchmark specs. */
export async function closeTrackedTransports(): Promise<void> {
  await closeTrackedKafkaTransports();
  await closeTrackedRabbitMqTransports();
  await closeTrackedNatsTransports();
}

export type { PubSubTestTransportAdapter } from "./test-transport-types.js";
