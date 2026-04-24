import { toBinary } from "@bufbuild/protobuf";
import { durationMs, timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { Channel, ConfirmChannel, Connection, Message, Options } from "amqplib";
import { connect } from "amqplib";
import { CloudEventSchema, type CloudEvent } from "../gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  notifyTransportFailureObserver,
  notifyTransportObserver,
} from "../transport-observer.js";
import type {
  DeliveryHandler,
  Disposition,
  PublishRequest,
  PubSubTransport,
  SubscribeOptions,
  Subscription,
} from "../types.js";
import { cloudEventFromBytes } from "../kafka/cloud-event.js";
import {
  CLOUD_EVENT_HEADER_ID,
  CLOUD_EVENT_HEADER_SOURCE,
  CLOUD_EVENT_HEADER_SPEC_VERSION,
  CLOUD_EVENT_HEADER_TYPE,
  KAFKA_CONTENT_TYPE_PROTOBUF,
  KAFKA_HEADER_CONTENT_TYPE,
  numberHeader,
  PROTOUTIL_HEADER_ATTEMPT,
  PROTOUTIL_HEADER_DISPOSITION,
  PROTOUTIL_HEADER_NOT_BEFORE,
  PROTOUTIL_HEADER_ORIGINAL_TOPIC,
  PROTOUTIL_HEADER_TARGET_TOPIC,
} from "../kafka/headers.js";
import type { RabbitMqTransportOptions } from "./types.js";

const DEFAULT_EXCHANGE = "protoutil.pubsub";
const DEFAULT_QUEUE_PREFIX = "protoutil.pubsub.queue";
const DEFAULT_SCHEDULE_QUEUE = "protoutil.pubsub.schedules";
const DEFAULT_CONSUMER_GROUP = "protoutil.pubsub";
const DEFAULT_SCHEDULER_RETRY_DELAY_MS = 1_000;

interface ScheduledMessage {
  id: string;
  topic: string;
  notBefore: string;
  attempt: number;
  event: CloudEvent;
  message: Message;
  timer?: NodeJS.Timeout;
}

/**
 * Create a RabbitMQ-backed pubsub transport using `amqplib`.
 */
export function createRabbitMqTransport(options: RabbitMqTransportOptions): PubSubTransport {
  return new DefaultRabbitMqTransport(options);
}

class DefaultRabbitMqTransport implements PubSubTransport {
  /** Transport-level default CloudEvent source used when publisher options do not provide one. */
  public readonly defaultSource?: string;
  readonly #options: RabbitMqTransportOptions;
  readonly #subscriptions = new Set<{ channel: Channel; consumerTag: string }>();
  readonly #scheduled = new Map<string, ScheduledMessage>();
  #connection?: Connection;
  #publisher?: ConfirmChannel;
  #schedulerChannel?: Channel;
  #startup?: Promise<void>;
  #schedulerStartup?: Promise<void>;

  /** Create one RabbitMQ transport with lazy connection, publisher, and scheduler startup. */
  public constructor(options: RabbitMqTransportOptions) {
    this.#options = options;
    this.defaultSource = options.defaultSource;
  }

  /** Connect the AMQP connection and confirm channel once before use. */
  async #ensureStarted(): Promise<void> {
    this.#startup ??= this.#start();
    await this.#startup;
  }

  /** Connect the shared RabbitMQ connection and confirm publisher channel. */
  async #start(): Promise<void> {
    this.#connection = await connect(this.#options.url);
    this.#publisher = await this.#connection.createConfirmChannel();
    await this.#publisher.assertExchange(this.#exchange(), "topic", { durable: true });
    await this.#publisher.assertQueue(this.#scheduleQueue(), { durable: true });
  }

  /** Start the durable scheduler consumer that manages delayed delivery. */
  async #ensureSchedulerStarted(): Promise<void> {
    this.#schedulerStartup ??= this.#startScheduler();
    await this.#schedulerStartup;
  }

  /** Create the scheduler consumer that keeps delayed messages unacked until due. */
  async #startScheduler(): Promise<void> {
    await this.#ensureStarted();
    if (!this.#connection) {
      throw new Error("RabbitMQ transport connection was not initialized");
    }
    this.#schedulerChannel = await this.#connection.createChannel();
    await this.#schedulerChannel.assertQueue(this.#scheduleQueue(), { durable: true });
    await this.#schedulerChannel.prefetch(128);
    await this.#schedulerChannel.consume(
      this.#scheduleQueue(),
      async (message) => {
        if (!message) {
          return;
        }
        await this.#handleScheduledMessage(message);
      },
      { noAck: false },
    );
  }

  /** Return the configured durable topic exchange name. */
  #exchange(): string {
    return this.#options.exchange ?? DEFAULT_EXCHANGE;
  }

  /** Return the configured durable subscriber queue prefix. */
  #queuePrefix(): string {
    return this.#options.queuePrefix ?? DEFAULT_QUEUE_PREFIX;
  }

  /** Return the configured durable schedule queue name. */
  #scheduleQueue(): string {
    return this.#options.scheduleQueue ?? DEFAULT_SCHEDULE_QUEUE;
  }

  /** Close the connection, channels, timers, and subscription state owned by this transport. */
  public async close(): Promise<void> {
    for (const scheduled of this.#scheduled.values()) {
      if (scheduled.timer) {
        clearTimeout(scheduled.timer);
      }
    }
    this.#scheduled.clear();
    for (const subscription of this.#subscriptions) {
      await subscription.channel.close();
    }
    this.#subscriptions.clear();
    await this.#schedulerChannel?.close();
    await this.#publisher?.close();
    await this.#connection?.close();
    this.#schedulerChannel = undefined;
    this.#publisher = undefined;
    this.#connection = undefined;
    this.#startup = undefined;
    this.#schedulerStartup = undefined;
  }

  /** Publish one immediate or delayed CloudEvent through RabbitMQ. */
  public async publish(request: PublishRequest): Promise<void> {
    await this.#ensureStarted();
    const attempt = 1;
    if (request.notBefore) {
      await this.#publishScheduled({
        topic: request.topic,
        event: request.event,
        notBefore: request.notBefore,
        attempt,
      });
      return;
    }
    await this.#publishImmediate(request.topic, request.event, attempt);
  }

  /** Start one RabbitMQ subscription and return an unsubscribe handle. */
  public async subscribe(
    handler: DeliveryHandler,
    options?: SubscribeOptions,
  ): Promise<Subscription> {
    await this.#ensureStarted();
    if (!this.#connection) {
      throw new Error("RabbitMQ transport connection was not initialized");
    }
    if (!this.#options.subscribeTopics?.length) {
      throw new Error("RabbitMQ subscriber transport requires at least one subscribe topic");
    }

    const channel = await this.#connection.createChannel();
    await channel.assertExchange(this.#exchange(), "topic", { durable: true });
    await channel.prefetch(options?.concurrency ?? 1);

    const queue = subscriptionQueueName(
      this.#queuePrefix(),
      options?.consumerGroup ?? DEFAULT_CONSUMER_GROUP,
      this.#options.subscribeTopics,
    );
    await channel.assertQueue(queue, { durable: true });
    for (const topic of this.#options.subscribeTopics) {
      await channel.bindQueue(queue, this.#exchange(), topic);
    }

    if (options?.signal?.aborted) {
      await channel.close();
      return { unsubscribe: async () => undefined };
    }

    let consumerTag = "";
    const unsubscribe = async () => {
      options?.signal?.removeEventListener("abort", abort);
      for (const subscription of this.#subscriptions) {
        if (subscription.channel === channel && subscription.consumerTag === consumerTag) {
          this.#subscriptions.delete(subscription);
          break;
        }
      }
      await channel.cancel(consumerTag);
      await channel.close();
    };
    const abort = () => {
      void unsubscribe();
    };

    const consumeReply = await channel.consume(
      queue,
      async (message) => {
        if (!message) {
          return;
        }
        await this.#consumeMessage(channel, handler, message, options);
      },
      { noAck: false },
    );
    consumerTag = consumeReply.consumerTag;
    this.#subscriptions.add({ channel, consumerTag });
    options?.signal?.addEventListener("abort", abort, { once: true });
    await this.#ensureSchedulerStarted();

    return { unsubscribe };
  }

  /** Decode and settle one consumed RabbitMQ message. */
  async #consumeMessage(
    channel: Channel,
    handler: DeliveryHandler,
    message: Message,
    options: SubscribeOptions | undefined,
  ): Promise<void> {
    let event: CloudEvent;
    try {
      event = cloudEventFromBytes(message.content);
    } catch (error) {
      if (this.#options.observer) {
        notifyTransportFailureObserver(this.#options.observer, "parseFailed", {
          id: message.properties.messageId ?? "",
          topic: message.fields.routingKey,
          error,
        });
      }
      ackMessage(channel, message);
      return;
    }

    const attempt = headerAttempt(message.properties.headers) ?? 1;
    const disposition = await handler({
      event,
      topic: message.fields.routingKey,
      attempt,
    });
    await this.#settleDelivery(channel, message, event, disposition, attempt, options);
  }

  /** Map one router disposition onto RabbitMQ ack, retry, or dead-letter behavior. */
  async #settleDelivery(
    channel: Channel,
    message: Message,
    event: CloudEvent,
    disposition: Disposition,
    attempt: number,
    options: SubscribeOptions | undefined,
  ): Promise<void> {
    if (disposition.kind === "retry") {
      if (retryLimitReached(attempt, options)) {
        if (this.#options.observer) {
          notifyTransportObserver(this.#options.observer, "retryExhausted", {
            id: event.id,
            topic: message.fields.routingKey,
            attempt,
          });
        }
        await this.#publishDeadLetter(message.fields.routingKey, event, attempt, "dead_letter");
        ackMessage(channel, message);
        if (this.#options.observer) {
          notifyTransportObserver(this.#options.observer, "committed", {
            id: event.id,
            topic: message.fields.routingKey,
            attempt,
          });
        }
        return;
      }

      const delay = disposition.delay ? durationMs(disposition.delay) : 0;
      if (delay > 0) {
        await this.#publishScheduled({
          topic: message.fields.routingKey,
          event,
          notBefore: timestampFromDate(new Date(Date.now() + delay)),
          attempt: attempt + 1,
        });
      } else {
        await this.#publishImmediate(message.fields.routingKey, event, attempt + 1);
      }
      ackMessage(channel, message);
      if (this.#options.observer) {
        notifyTransportObserver(this.#options.observer, "retried", {
          id: event.id,
          topic: message.fields.routingKey,
          attempt: attempt + 1,
        });
        notifyTransportObserver(this.#options.observer, "committed", {
          id: event.id,
          topic: message.fields.routingKey,
          attempt,
        });
      }
      return;
    }

    if (disposition.kind === "reject" || disposition.kind === "dead_letter") {
      await this.#publishDeadLetter(message.fields.routingKey, event, attempt, disposition.kind);
    }

    ackMessage(channel, message);
    if (this.#options.observer) {
      notifyTransportObserver(this.#options.observer, "committed", {
        id: event.id,
        topic: message.fields.routingKey,
        attempt,
      });
    }
  }

  /** Publish one immediate CloudEvent to the durable topic exchange. */
  async #publishImmediate(topic: string, event: CloudEvent, attempt: number): Promise<void> {
    await this.#ensureStarted();
    if (!this.#publisher) {
      throw new Error("RabbitMQ publisher channel was not initialized");
    }
    await publishConfirmed(
      this.#publisher,
      "publish",
      this.#exchange(),
      topic,
      cloudEventBytes(event),
      publishOptions(event, {
        [PROTOUTIL_HEADER_ATTEMPT]: String(attempt),
      }),
      this.#options.publishTimeoutMs,
    );
  }

  /** Persist one delayed delivery request to the durable schedules queue. */
  async #publishScheduled(request: {
    topic: string;
    event: CloudEvent;
    notBefore: PublishRequest["notBefore"];
    attempt: number;
  }): Promise<void> {
    await this.#ensureStarted();
    if (!this.#publisher || !request.notBefore) {
      throw new Error("RabbitMQ publisher channel was not initialized");
    }
    await publishConfirmed(
      this.#publisher,
      "sendToQueue",
      this.#scheduleQueue(),
      "",
      cloudEventBytes(request.event),
      publishOptions(request.event, {
        [PROTOUTIL_HEADER_TARGET_TOPIC]: request.topic,
        [PROTOUTIL_HEADER_NOT_BEFORE]: timestampDate(request.notBefore).toISOString(),
        [PROTOUTIL_HEADER_ATTEMPT]: String(request.attempt),
      }),
      this.#options.publishTimeoutMs,
    );
    if (this.#options.observer) {
      notifyTransportObserver(this.#options.observer, "scheduled", {
        id: request.event.id,
        topic: request.topic,
        attempt: request.attempt,
      });
    }
  }

  /** Parse and register one scheduled message consumed from the durable schedules queue. */
  async #handleScheduledMessage(message: Message): Promise<void> {
    if (!this.#schedulerChannel) {
      throw new Error("RabbitMQ scheduler channel was not initialized");
    }
    let event: CloudEvent;
    try {
      event = cloudEventFromBytes(message.content);
    } catch (error) {
      if (this.#options.observer) {
        notifyTransportFailureObserver(this.#options.observer, "parseFailed", {
          id: message.properties.messageId ?? "",
          topic: this.#scheduleQueue(),
          error,
        });
      }
      ackMessage(this.#schedulerChannel, message);
      return;
    }

    const topic = scheduleTopic(message);
    const notBefore = scheduleNotBefore(message);
    const attempt = headerAttempt(message.properties.headers) ?? 1;
    const scheduled: ScheduledMessage = {
      id: event.id,
      topic,
      notBefore,
      attempt,
      event,
      message,
    };

    const existing = this.#scheduled.get(scheduled.id);
    if (existing) {
      if (existing.timer) {
        clearTimeout(existing.timer);
      }
      ackMessage(this.#schedulerChannel, existing.message);
    }
    this.#scheduled.set(scheduled.id, scheduled);
    this.#armScheduledMessage(scheduled);
  }

  /** Arm or immediately run one scheduled message based on its due time. */
  #armScheduledMessage(scheduled: ScheduledMessage): void {
    const delayMs = Math.max(0, Date.parse(scheduled.notBefore) - Date.now());
    scheduled.timer = setTimeout(() => {
      void this.#deliverScheduled(scheduled.id);
    }, delayMs);
  }

  /** Deliver one active scheduled message and acknowledge its schedule record. */
  async #deliverScheduled(id: string): Promise<void> {
    const scheduled = this.#scheduled.get(id);
    if (!scheduled || !this.#schedulerChannel) {
      return;
    }
    if (scheduled.timer) {
      clearTimeout(scheduled.timer);
      scheduled.timer = undefined;
    }
    try {
      await this.#publishImmediate(scheduled.topic, scheduled.event, scheduled.attempt);
      ackMessage(this.#schedulerChannel, scheduled.message);
      this.#scheduled.delete(id);
      if (this.#options.observer) {
        notifyTransportObserver(this.#options.observer, "delivered", {
          id: scheduled.id,
          topic: scheduled.topic,
          attempt: scheduled.attempt,
        });
        notifyTransportObserver(this.#options.observer, "tombstoned", {
          id: scheduled.id,
          topic: scheduled.topic,
          attempt: scheduled.attempt,
        });
      }
    } catch (error) {
      if (this.#options.observer) {
        notifyTransportFailureObserver(this.#options.observer, "deliveryFailed", {
          id: scheduled.id,
          topic: scheduled.topic,
          attempt: scheduled.attempt,
          error,
        });
      }
      scheduled.notBefore = new Date(Date.now() + DEFAULT_SCHEDULER_RETRY_DELAY_MS).toISOString();
      this.#armScheduledMessage(scheduled);
    }
  }

  /** Publish one rejected or dead-lettered CloudEvent when a dead-letter topic is configured. */
  async #publishDeadLetter(
    topic: string,
    event: CloudEvent,
    attempt: number,
    disposition: Disposition["kind"],
  ): Promise<void> {
    if (!this.#options.deadLetterTopic) {
      return;
    }
    await this.#ensureStarted();
    if (!this.#publisher) {
      throw new Error("RabbitMQ publisher channel was not initialized");
    }
    await publishConfirmed(
      this.#publisher,
      "publish",
      this.#exchange(),
      this.#options.deadLetterTopic,
      cloudEventBytes(event),
      publishOptions(event, {
        [PROTOUTIL_HEADER_ATTEMPT]: String(attempt),
        [PROTOUTIL_HEADER_DISPOSITION]: disposition,
        [PROTOUTIL_HEADER_ORIGINAL_TOPIC]: topic,
      }),
      this.#options.publishTimeoutMs,
    );
    if (this.#options.observer) {
      notifyTransportObserver(this.#options.observer, "deadLettered", {
        id: event.id,
        topic: this.#options.deadLetterTopic,
        attempt,
      });
    }
  }
}

/** Build broker message properties from a CloudEvent plus extra transport headers. */
function publishOptions(event: CloudEvent, headers?: Record<string, unknown>): Options["publish"] {
  return {
    contentType: KAFKA_CONTENT_TYPE_PROTOBUF,
    persistent: true,
    messageId: event.id,
    timestamp:
      event.attributes.time?.attr.case === "ceTimestamp"
        ? timestampDate(event.attributes.time.attr.value).getTime()
        : Date.now(),
    type: event.type,
    appId: event.source,
    headers: {
      [KAFKA_HEADER_CONTENT_TYPE]: KAFKA_CONTENT_TYPE_PROTOBUF,
      [CLOUD_EVENT_HEADER_SPEC_VERSION]: event.specVersion,
      [CLOUD_EVENT_HEADER_TYPE]: event.type,
      [CLOUD_EVENT_HEADER_SOURCE]: event.source,
      [CLOUD_EVENT_HEADER_ID]: event.id,
      ...headers,
    },
  };
}

/** Publish through a confirm channel and wait for broker confirmation. */
async function publishConfirmed(
  channel: ConfirmChannel,
  method: "publish" | "sendToQueue",
  target: string,
  routingKey: string,
  content: Buffer,
  options: Options["publish"],
  timeoutMs: number | undefined,
): Promise<void> {
  const publish = new Promise<void>((resolve, reject) => {
    if (method === "publish") {
      channel.publish(target, routingKey, content, options, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
      return;
    }
    channel.sendToQueue(target, content, options, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  if (!timeoutMs) {
    await publish;
    return;
  }

  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      publish,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`RabbitMQ publish timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

/** Build a durable subscription queue name from the consumer group and topics. */
function subscriptionQueueName(prefix: string, consumerGroup: string, topics: string[]): string {
  return `${prefix}.${topicKey(consumerGroup)}.${stableTopicHash(topics)}`;
}

/** Build a stable identifier segment from an arbitrary topic-like string. */
function topicKey(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ".")
    .replaceAll(/^\.+|\.+$/g, "");
}

/** Hash a set of topics so queue names remain deterministic and bounded. */
function stableTopicHash(topics: string[]): string {
  return Buffer.from([...topics].sort().join("|")).toString("base64url").slice(0, 24);
}

/** Read the transport attempt header from RabbitMQ message headers. */
function headerAttempt(headers: Record<string, unknown> | undefined): number | undefined {
  return numberHeader(rabbitHeaders(headers), PROTOUTIL_HEADER_ATTEMPT);
}

/** Read the target topic for one scheduled message. */
function scheduleTopic(message: Message): string {
  const headers = rabbitHeaders(message.properties.headers);
  const topic = headers?.[PROTOUTIL_HEADER_TARGET_TOPIC];
  if (typeof topic !== "string") {
    throw new Error("RabbitMQ scheduled message is missing target topic");
  }
  return topic;
}

/** Read the not-before timestamp for one scheduled message. */
function scheduleNotBefore(message: Message): string {
  const headers = rabbitHeaders(message.properties.headers);
  const notBefore = headers?.[PROTOUTIL_HEADER_NOT_BEFORE];
  if (typeof notBefore !== "string") {
    throw new Error("RabbitMQ scheduled message is missing notBefore");
  }
  return notBefore;
}

/** Convert RabbitMQ header values into the string/buffer shape reused by header helpers. */
function rabbitHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string | Buffer> | undefined {
  if (!headers) {
    return undefined;
  }
  const normalized: Record<string, string | Buffer> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      normalized[key] = String(value);
      continue;
    }
    if (Buffer.isBuffer(value)) {
      normalized[key] = value;
    }
  }
  return normalized;
}

/** Acknowledge one RabbitMQ message unless the channel has already closed during shutdown. */
function ackMessage(channel: Channel, message: Message): void {
  try {
    channel.ack(message);
  } catch (error) {
    if (isClosedChannelError(error)) {
      return;
    }
    throw error;
  }
}

/** Check whether a retry disposition has reached the configured attempt limit. */
function retryLimitReached(attempt: number, options: SubscribeOptions | undefined): boolean {
  const maxAttempts = options?.maxAttempts;
  return maxAttempts !== undefined && Number.isInteger(maxAttempts) && maxAttempts > 0 && attempt >= maxAttempts;
}

/** Detect the shutdown race where amqplib rejects an ack because the channel already closed. */
function isClosedChannelError(error: unknown): boolean {
  return error instanceof Error && error.message === "Channel closed";
}

/** Encode a CloudEvent protobuf message as bytes for RabbitMQ delivery. */
function cloudEventBytes(event: CloudEvent): Buffer {
  return Buffer.from(toBinary(CloudEventSchema, event));
}
