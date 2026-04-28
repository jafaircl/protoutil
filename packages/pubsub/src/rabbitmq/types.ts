import type { PubSubInterceptor, PubSubScheduler } from "../types.js";

/** Options for creating a RabbitMQ-backed pubsub transport. */
export interface RabbitMqTransportOptions {
  /** AMQP connection URL. */
  url: string;
  /** Durable topic exchange used for normal event delivery. Defaults to `protoutil.pubsub`. */
  exchange?: string;
  /** Durable queue prefix used for subscription queues. Defaults to `protoutil.pubsub.queue`. */
  queuePrefix?: string;
  /** Optional timeout for broker publish confirms in milliseconds. */
  publishTimeoutMs?: number;
  /**
   * Optional scheduler used for durable `notBefore` publish and delayed retry.
   *
   * Immediate publish/subscribe does not require a scheduler. If a publish call
   * provides `notBefore`, or a handler returns `ctx.retry({ delay })`, the
   * transport throws unless a scheduler was supplied.
   */
  scheduler?: PubSubScheduler;
  /** Default CloudEvent source for publishers using this transport. */
  defaultSource?: string;
  /** Optional interceptors for transport operations. */
  interceptors?: PubSubInterceptor[];
}
