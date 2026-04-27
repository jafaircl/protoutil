import type { KafkaJS } from "@confluentinc/kafka-javascript";
import type { PubSubInterceptor } from "../types.js";
/** Topic configuration entry used by Kafka admin APIs. */
export interface KafkaTopicConfigEntry {
  /** Kafka topic config name. */
  name: string;
  /** Kafka topic config value. */
  value: string;
}

/** Topic creation request used by the Kafka transport. */
export interface KafkaTopicSpec {
  /** Topic name. */
  topic: string;
  /** Number of topic partitions. */
  numPartitions?: number;
  /** Topic replication factor. */
  replicationFactor?: number;
  /** Topic-level Kafka config entries. */
  configEntries?: KafkaTopicConfigEntry[];
}

/** Kafka consumer client options, with `groupId` supplied from subscribe options when present. */
export interface KafkaConsumerOptions extends Omit<KafkaJS.ConsumerConstructorConfig, "kafkaJS"> {
  /** KafkaJS-compatible consumer options. */
  kafkaJS?: Omit<KafkaJS.ConsumerConfig, "groupId"> & {
    /** Default consumer group used when subscribe options do not provide one. */
    groupId?: string;
  };
}

/** Durable scheduler topic names and topology settings for Kafka delayed delivery. */
export interface KafkaSchedulerOptions {
  /** Compacted schedule state topic. */
  schedulesTopic: string;
  /** Append-only schedule history topic. */
  historyTopic: string;
  /** Scheduler consumer group. Defaults to a stable group derived from `schedulesTopic`. */
  consumerGroup?: string;
  /** Retention for the scheduler history topic in milliseconds. Uses broker defaults when unset. */
  historyRetentionMs?: number;
  /** Maximum number of due schedules delivered at once. Defaults to 16. */
  deliveryConcurrency?: number;
  /** In-process retry delay after a scheduler delivery failure in milliseconds. Defaults to 1000. */
  deliveryRetryDelayMs?: number;
  /** Number of partitions for scheduler topics. Defaults to 1. */
  partitions?: number;
  /** Replication factor for scheduler topics. Defaults to 1. */
  replicationFactor?: number;
  /** Create scheduler topics automatically before first publish or subscribe. Defaults to true. */
  autoCreateTopology?: boolean;
}

/** Options for creating a Kafka-backed pubsub transport. */
export interface KafkaTransportOptions {
  /** `@confluentinc/kafka-javascript` Kafka client. */
  client: KafkaJS.Kafka;
  /** Optional Kafka admin constructor config. */
  adminConfig?: KafkaJS.AdminConstructorConfig;
  /** Optional Kafka producer constructor config. */
  producerConfig?: KafkaJS.ProducerConstructorConfig;
  /** Optional timeout for Kafka producer sends in milliseconds. */
  publishTimeoutMs?: number;
  /** Optional Kafka consumer constructor config. */
  consumerConfig?: KafkaConsumerOptions;
  /** Topics consumed by this subscriber transport. */
  subscribeTopics?: string[];
  /** Topic for rejected or dead-lettered CloudEvents. Defaults to no dead-letter publish. */
  deadLetterTopic?: string;
  /** Scheduler topic configuration for `notBefore` and retry delay support. */
  scheduler: KafkaSchedulerOptions;
  /** Default CloudEvent source for publishers using this transport. */
  defaultSource?: string;
  /** Optional interceptors for transport operations. */
  interceptors?: PubSubInterceptor[];
}
