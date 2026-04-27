import type { PubSubInterceptor } from "../types.js";

/** Options for creating a RabbitMQ-backed pubsub transport. */
export interface RabbitMqTransportOptions {
  /** AMQP connection URL. */
  url: string;
  /** Durable topic exchange used for normal event delivery. Defaults to `protoutil.pubsub`. */
  exchange?: string;
  /** Durable queue used to hold delayed publish and retry requests. */
  scheduleQueue?: string;
  /** Topics consumed by this subscriber transport. */
  subscribeTopics?: string[];
  /** Routing key used for rejected or dead-lettered CloudEvents. Defaults to no dead-letter publish. */
  deadLetterTopic?: string;
  /** Durable queue prefix used for subscription queues. Defaults to `protoutil.pubsub.queue`. */
  queuePrefix?: string;
  /** Optional timeout for broker publish confirms in milliseconds. */
  publishTimeoutMs?: number;
  /** Default CloudEvent source for publishers using this transport. */
  defaultSource?: string;
  /** Optional interceptors for transport operations. */
  interceptors?: PubSubInterceptor[];
}
