import { timestampDate } from "@bufbuild/protobuf/wkt";
import type { Channel, ChannelModel, ConfirmChannel, ConsumeMessage, Options } from "amqplib";
import { connect } from "amqplib";
import { cloudEventBytes, cloudEventFromBytes } from "../cloudevents.js";
import { createContextValues } from "../context-values.js";
import {
  AbortedPubSubError,
  InvalidArgumentPubSubError,
  InvalidStatePubSubError,
} from "../errors.js";
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
import { retryLaterOrThrow, scheduleOrThrow } from "../scheduler.js";
import { onAbortOnce, retryLimitReached, stableTopicHash } from "../transport-utils.js";
import type {
  DeliveryHandler,
  Disposition,
  PublishRequest,
  PubSubTransport,
  SubscribeRequest,
  Subscription,
} from "../types.js";
import { ackMessage } from "./scheduler.js";
import type { RabbitMqTransportOptions } from "./types.js";

const DEFAULT_EXCHANGE = "protoutil.pubsub";
const DEFAULT_QUEUE_PREFIX = "protoutil.pubsub.queue";
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
  #startup?: Promise<void>;
  #aborted = false;
  readonly #removeAbortListener: () => void;

  /** Create one RabbitMQ transport with lazy connection, publisher, and scheduler startup. */
  public constructor(options: RabbitMqTransportOptions) {
    this.#options = options;
    this.defaultSource = options.defaultSource;
    this.#removeAbortListener = onAbortOnce(options.signal, () => {
      this.#aborted = true;
      void this.close();
    });
  }

  #assertNotAborted(): void {
    if (this.#aborted) {
      throw new AbortedPubSubError("RabbitMQ transport has been aborted");
    }
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
    // durable exchange topology it needs instead of asking application code to
    // provision it manually first.
    await this.#publisher.assertExchange(this.#exchange(), "topic", { durable: true });
  }

  /** Return the configured durable topic exchange name. */
  #exchange(): string {
    return this.#options.exchange ?? DEFAULT_EXCHANGE;
  }

  /** Return the configured durable subscriber queue prefix. */
  #queuePrefix(): string {
    return this.#options.queuePrefix ?? DEFAULT_QUEUE_PREFIX;
  }

  /** Close the connection, channels, timers, and subscription state owned by this transport. */
  public async close(): Promise<void> {
    this.#removeAbortListener();
    for (const subscription of this.#subscriptions) {
      try {
        await subscription.channel.close();
      } catch (error) {
        if (!isChannelClosingError(error)) {
          throw error;
        }
      }
    }
    this.#subscriptions.clear();
    await this.#publisher?.close();
    await this.#connection?.close();
    this.#publisher = undefined;
    this.#connection = undefined;
    this.#startup = undefined;
  }

  /** Publish one immediate or delayed CloudEvent through RabbitMQ. */
  public async publish(request: PublishRequest): Promise<void> {
    this.#assertNotAborted();
    await applyPubSubInterceptors(
      this.#options.interceptors,
      { operation: "publish", request },
      async (ctx) => {
        const req = (ctx as Extract<typeof ctx, { operation: "publish" }>).request;
        if (req.notBefore) {
          await scheduleOrThrow(this.#options.scheduler, req);
          return;
        }
        await this.#publishImmediate(req.topic, req.event, 1);
      },
    );
  }

  /** Start one RabbitMQ subscription and return an unsubscribe handle. */
  public async subscribe(
    handler: DeliveryHandler,
    request: SubscribeRequest,
  ): Promise<Subscription> {
    this.#assertNotAborted();
    if (request.signal?.aborted) {
      throw new AbortedPubSubError("RabbitMQ subscribe signal has been aborted");
    }
    await this.#ensureStarted();
    if (!this.#connection) {
      throw new InvalidStatePubSubError("RabbitMQ transport connection was not initialized");
    }
    if (!request.topics.length) {
      throw new InvalidArgumentPubSubError(
        "RabbitMQ subscriber transport requires at least one subscribe topic",
      );
    }

    const channel = await this.#connection.createChannel();
    await channel.assertExchange(this.#exchange(), "topic", { durable: true });
    await channel.prefetch(request.concurrency ?? 1);

    const queue = subscriptionQueueName(
      this.#queuePrefix(),
      request.consumerGroup ?? DEFAULT_CONSUMER_GROUP,
      request.topics,
    );
    // Subscriber queues are derived from the transport-neutral consumer group
    // plus the subscribed topics. Asserting and binding them here means a
    // missing topic/routing path is created as part of normal startup.
    await channel.assertQueue(queue, { durable: true });
    for (const topic of request.topics) {
      await channel.bindQueue(queue, this.#exchange(), topic);
    }
    await this.#options.scheduler?.start();

    let consumerTag = "";
    const unsubscribe = async () => {
      request.signal?.removeEventListener("abort", abort);
      for (const subscription of this.#subscriptions) {
        if (subscription.channel === channel && subscription.consumerTag === consumerTag) {
          this.#subscriptions.delete(subscription);
          break;
        }
      }
      try {
        await channel.cancel(consumerTag);
      } catch (error) {
        if (!isChannelClosingError(error)) {
          throw error;
        }
      }
      try {
        await channel.close();
      } catch (error) {
        if (!isChannelClosingError(error)) {
          throw error;
        }
      }
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
        try {
          await this.#consumeMessage(channel, handler, message, request);
        } catch (error) {
          await notifyInterceptors(this.#options.interceptors, {
            operation: "deliveryFailed",
            event: {
              id: message.properties.messageId ?? "",
              topic: message.fields.routingKey,
              error,
            },
          });
          ackMessage(channel, message);
        }
      },
      { noAck: false },
    );
    consumerTag = consumeReply.consumerTag;
    this.#subscriptions.add({ channel, consumerTag });
    request.signal?.addEventListener("abort", abort, { once: true });

    return { unsubscribe };
  }

  /** Decode and settle one consumed RabbitMQ message. */
  async #consumeMessage(
    channel: Channel,
    handler: DeliveryHandler,
    message: ConsumeMessage,
    request: SubscribeRequest,
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
    const contextValues = createContextValues();
    const delivery = { event, topic: message.fields.routingKey, attempt, contextValues };
    const disposition = (await applyPubSubInterceptors(
      this.#options.interceptors,
      { operation: "handle", delivery, contextValues },
      async (ctx) => {
        const d = (ctx as Extract<typeof ctx, { operation: "handle" }>).delivery;
        return handler(d);
      },
    )) as Disposition;
    await this.#settleDelivery(
      channel,
      message,
      event,
      disposition,
      attempt,
      request.maxAttempts,
      request.deadLetterTopic,
    );
  }

  /** Map one router disposition onto RabbitMQ ack, retry, or dead-letter behavior. */
  async #settleDelivery(
    channel: Channel,
    message: ConsumeMessage,
    event: CloudEvent,
    disposition: Disposition,
    attempt: number,
    maxAttempts: number | undefined,
    deadLetterTopic: string | undefined,
  ): Promise<void> {
    if (disposition.kind === "retry") {
      if (retryLimitReached(attempt, maxAttempts)) {
        await notifyInterceptors(this.#options.interceptors, {
          operation: "retryExhausted",
          event: { id: event.id, topic: message.fields.routingKey, attempt },
        });
        await this.#publishDeadLetter(
          deadLetterTopic,
          message.fields.routingKey,
          event,
          attempt,
          "dead_letter",
        );
        ackMessage(channel, message);
        await notifyInterceptors(this.#options.interceptors, {
          operation: "committed",
          event: { id: event.id, topic: message.fields.routingKey, attempt },
        });
        return;
      }

      if (disposition.delay) {
        await retryLaterOrThrow(
          this.#options.scheduler,
          message.fields.routingKey,
          event,
          disposition,
          attempt + 1,
        );
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
      await this.#publishDeadLetter(
        deadLetterTopic,
        message.fields.routingKey,
        event,
        attempt,
        disposition.kind,
      );
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
      throw new InvalidStatePubSubError("RabbitMQ publisher channel was not initialized");
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
    deadLetterTopic: string | undefined,
    topic: string,
    event: CloudEvent,
    attempt: number,
    disposition: Disposition["kind"],
  ): Promise<void> {
    if (!deadLetterTopic) {
      return;
    }
    await this.#ensureStarted();
    if (!this.#publisher) {
      throw new InvalidStatePubSubError("RabbitMQ publisher channel was not initialized");
    }
    await publishConfirmed(
      this.#publisher,
      "publish",
      this.#exchange(),
      deadLetterTopic,
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
      event: { id: event.id, topic: deadLetterTopic, attempt },
    });
  }
}

function isChannelClosingError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "IllegalOperationError" &&
    (error.message.includes("Channel closing") || error.message.includes("Channel closed"))
  );
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
