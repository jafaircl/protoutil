import type { ConnectionOptions, StorageType } from "nats";
import type { PubSubInterceptor, PubSubScheduler } from "../types.js";

/** JetStream stream settings for normal event subjects. */
export interface NatsEventStreamOptions {
  /** Durable JetStream stream name used for event delivery. */
  name: string;
  /** Subjects captured by the event stream. */
  subjects: string[];
  /** Optional JetStream storage mode. Defaults to file storage. */
  storage?: StorageType;
  /** Optional JetStream replica count. */
  replicas?: number;
}

/** Durable scheduler settings for delayed publish and retry handling. */
export interface NatsSchedulerOptions {
  /** Durable JetStream stream name used for schedule wake-up messages. */
  streamName: string;
  /** Subject used for delayed publish and retry wake-up messages. */
  subject: string;
  /** Key-value bucket used to keep the latest schedule state per CloudEvent id. */
  kvBucket: string;
  /** Durable consumer name shared by scheduler workers. */
  consumerName?: string;
  /** Optional JetStream storage mode. Defaults to file storage. */
  storage?: StorageType;
  /** Optional JetStream replica count. */
  replicas?: number;
  /** Ack wait in milliseconds for scheduler wake-up messages. */
  ackWaitMs?: number;
  /** Delay in milliseconds before retrying a failed scheduled delivery attempt. */
  deliveryRetryDelayMs?: number;
}

/** Options for creating a NATS JetStream-backed pubsub transport. */
export interface NatsTransportOptions {
  /** NATS server URLs passed to the client. */
  servers?: string | string[];
  /** Additional NATS connection options. */
  connectionOptions?: Omit<ConnectionOptions, "servers">;
  /** Event stream configuration for normal publishes and subscribes. */
  stream: NatsEventStreamOptions;
  /**
   * Optional scheduler used for durable `notBefore` publish and delayed retry.
   *
   * Immediate publish/subscribe does not require a scheduler. If a publish call
   * provides `notBefore`, or a handler returns `ctx.retry({ delay })`, the
   * transport throws unless a scheduler was supplied.
   */
  scheduler?: PubSubScheduler;
  /** Optional timeout for JetStream publish acknowledgements in milliseconds. */
  publishTimeoutMs?: number;
  /** Default CloudEvent source for publishers using this transport. */
  defaultSource?: string;
  /** Optional interceptors for transport operations. */
  interceptors?: PubSubInterceptor[];
  /** Optional signal that closes this transport when aborted. */
  signal?: AbortSignal;
}
