import { durationMs, timestampDate } from "@bufbuild/protobuf/wkt";
import type { Channel, ChannelModel, ConfirmChannel, ConsumeMessage, Options } from "amqplib";
import { connect } from "amqplib";
import { cloudEventBytes, cloudEventFromBytes } from "../cloudevents.js";
import type { CloudEvent } from "../gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  CLOUD_EVENT_HEADER_ID,
  CLOUD_EVENT_HEADER_SOURCE,
  CLOUD_EVENT_HEADER_SPEC_VERSION,
  CLOUD_EVENT_HEADER_TYPE,
  CONTENT_TYPE_PROTOBUF,
  HEADER_CONTENT_TYPE,
  numberHeader,
  PROTOUTIL_HEADER_ATTEMPT,
  PROTOUTIL_HEADER_DISPOSITION,
  PROTOUTIL_HEADER_ORIGINAL_TOPIC,
} from "../headers.js";
import { applyPubSubInterceptors, notifyInterceptors } from "../interceptors.js";
import { retryLimitReached, stableTopicHash } from "../transport-utils.js";
import type {
  DeliveryHandler,
  Disposition,
  PublishRequest,
  PubSubTransport,
  SubscribeOptions,
  Subscription,
} from "../types.js";
import { ackMessage, RabbitMqScheduler } from "./scheduler.js";
import type { RabbitMqTransportOptions } from "./types.js";

const DEFAULT_EXCHANGE = "protoutil.pubsub";
const DEFAULT_QUEUE_PREFIX = "protoutil.pubsub.queue";
const DEFAULT_SCHEDULE_QUEUE = "protoutil.pubsub.schedules";
const DEFAULT_CONSUMER_GROUP = "protoutil.pubsub";

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
  #connection?: ChannelModel;
  #publisher?: ConfirmChannel;
  #scheduler?: RabbitMqScheduler;
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
    // RabbitMQ creates exchanges and queues on demand. The transport owns the
    // durable exchange and scheduler queue topology it needs instead of asking
    // application code to provision them manually first.
    await this.#publisher.assertExchange(this.#exchange(), "topic", { durable: true });
    await this.#publisher.assertQueue(this.#scheduleQueue(), { durable: true });
  }

  /** Start the durable scheduler consumer that manages delayed delivery. */
  async #ensureSchedulerStarted(): Promise<void> {
    this.#schedulerStartup ??= this.#startScheduler();
    await this.#schedulerStartup;
  }

  /** Create the scheduler and start its background delivery loop. */
  async #startScheduler(): Promise<void> {
    await this.#ensureStarted();
    if (!this.#connection || !this.#publisher) {
      throw new Error("RabbitMQ transport connection was not initialized");
    }
    const publisher = this.#publisher;
    const scheduleQueue = this.#scheduleQueue();
    this.#scheduler = new RabbitMqScheduler({
      connection: this.#connection,
      scheduleQueue,
      interceptors: this.#options.interceptors,
      publishImmediate: (topic, event, attempt) => this.#publishImmediate(topic, event, attempt),
      publishToScheduleQueue: (content, options) =>
        publishConfirmed(
          publisher,
          "sendToQueue",
          scheduleQueue,
          "",
          content,
          options,
          this.#options.publishTimeoutMs,
        ),
    });
    await this.#scheduler.start();
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
    if (this.#scheduler) {
      await this.#scheduler.close();
    }
    for (const subscription of this.#subscriptions) {
      await subscription.channel.close();
    }
    this.#subscriptions.clear();
    await this.#publisher?.close();
    await this.#connection?.close();
    this.#scheduler = undefined;
    this.#publisher = undefined;
    this.#connection = undefined;
    this.#startup = undefined;
    this.#schedulerStartup = undefined;
  }

  /** Publish one immediate or delayed CloudEvent through RabbitMQ. */
  public async publish(request: PublishRequest): Promise<void> {
    await this.#ensureStarted();
    await applyPubSubInterceptors(
      this.#options.interceptors,
      { operation: "publish", request },
      async (ctx) => {
        const req = (ctx as Extract<typeof ctx, { operation: "publish" }>).request;
        if (req.notBefore) {
          await this.#ensureSchedulerStarted();
          await this.#scheduler!.publishLater(req);
          return;
        }
        await this.#publishImmediate(req.topic, req.event, 1);
      },
    );
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
    // Subscriber queues are derived from the transport-neutral consumer group
    // plus the subscribed topics. Asserting and binding them here means a
    // missing topic/routing path is created as part of normal startup.
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
    message: ConsumeMessage,
    options: SubscribeOptions | undefined,
  ): Promise<void> {
    let event: CloudEvent;
    try {
      event = cloudEventFromBytes(message.content);
    } catch (error) {
      await notifyInterceptors(this.#options.interceptors, {
        operation: "parseFailed",
        event: {
          id: message.properties.messageId ?? "",
          topic: message.fields.routingKey,
          error,
        },
      });
      ackMessage(channel, message);
      return;
    }

    const attempt = headerAttempt(message.properties.headers) ?? 1;
    const delivery = { event, topic: message.fields.routingKey, attempt };
    const disposition = (await applyPubSubInterceptors(
      this.#options.interceptors,
      { operation: "handle", delivery },
      async (ctx) => {
        const d = (ctx as Extract<typeof ctx, { operation: "handle" }>).delivery;
        return handler(d);
      },
    )) as Disposition;
    await this.#settleDelivery(channel, message, event, disposition, attempt, options);
  }

  /** Map one router disposition onto RabbitMQ ack, retry, or dead-letter behavior. */
  async #settleDelivery(
    channel: Channel,
    message: ConsumeMessage,
    event: CloudEvent,
    disposition: Disposition,
    attempt: number,
    options: SubscribeOptions | undefined,
  ): Promise<void> {
    if (disposition.kind === "retry") {
      if (retryLimitReached(attempt, options?.maxAttempts)) {
        await notifyInterceptors(this.#options.interceptors, {
          operation: "retryExhausted",
          event: { id: event.id, topic: message.fields.routingKey, attempt },
        });
        await this.#publishDeadLetter(message.fields.routingKey, event, attempt, "dead_letter");
        ackMessage(channel, message);
        await notifyInterceptors(this.#options.interceptors, {
          operation: "committed",
          event: { id: event.id, topic: message.fields.routingKey, attempt },
        });
        return;
      }

      const delay = disposition.delay ? durationMs(disposition.delay) : 0;
      if (delay > 0) {
        await this.#scheduler!.retryLater(message.fields.routingKey, event, delay, attempt + 1);
      } else {
        await this.#publishImmediate(message.fields.routingKey, event, attempt + 1);
      }
      ackMessage(channel, message);
      await notifyInterceptors(this.#options.interceptors, {
        operation: "retried",
        event: { id: event.id, topic: message.fields.routingKey, attempt: attempt + 1 },
      });
      await notifyInterceptors(this.#options.interceptors, {
        operation: "committed",
        event: { id: event.id, topic: message.fields.routingKey, attempt },
      });
      return;
    }

    if (disposition.kind === "reject" || disposition.kind === "dead_letter") {
      await this.#publishDeadLetter(message.fields.routingKey, event, attempt, disposition.kind);
    }

    ackMessage(channel, message);
    await notifyInterceptors(this.#options.interceptors, {
      operation: "committed",
      event: { id: event.id, topic: message.fields.routingKey, attempt },
    });
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
    await notifyInterceptors(this.#options.interceptors, {
      operation: "deadLettered",
      event: { id: event.id, topic: this.#options.deadLetterTopic, attempt },
    });
  }
}

/** Build broker message properties from a CloudEvent plus extra transport headers. */
function publishOptions(event: CloudEvent, headers?: Record<string, unknown>): Options.Publish {
  return {
    contentType: CONTENT_TYPE_PROTOBUF,
    persistent: true,
    messageId: event.id,
    timestamp:
      event.attributes.time?.attr.case === "ceTimestamp"
        ? timestampDate(event.attributes.time.attr.value).getTime()
        : Date.now(),
    type: event.type,
    appId: event.source,
    headers: {
      [HEADER_CONTENT_TYPE]: CONTENT_TYPE_PROTOBUF,
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
  options: Options.Publish,
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

/** Read the transport attempt header from RabbitMQ message headers. */
function headerAttempt(headers: Record<string, unknown> | undefined): number | undefined {
  return numberHeader(rabbitHeaders(headers), PROTOUTIL_HEADER_ATTEMPT);
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
