import { timestampDate } from "@bufbuild/protobuf/wkt";
import type { Channel, ChannelModel, ConsumeMessage, Options } from "amqplib";
import { type ConfirmChannel, connect } from "amqplib";
import { cloudEventBytes, cloudEventFromBytes } from "../cloudevents.js";
import type { CloudEvent } from "../gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  PROTOUTIL_HEADER_ATTEMPT,
  PROTOUTIL_HEADER_NOT_BEFORE,
  PROTOUTIL_HEADER_TARGET_TOPIC,
} from "../headers.js";
import { notifyInterceptors } from "../interceptors.js";
import {
  DEFAULT_SCHEDULER_RETRY_DELAY_MS,
  delayToNotBefore,
  onAbortOnce,
  parseAttempt,
} from "../transport-utils.js";
import type { PublishRequest, PubSubInterceptor, PubSubScheduler } from "../types.js";

const DEFAULT_EXCHANGE = "protoutil.pubsub";
const DEFAULT_SCHEDULE_QUEUE = "protoutil.pubsub.schedules";

export interface CreateRabbitMqSchedulerOptions {
  url: string;
  exchange?: string;
  scheduleQueue?: string;
  publishTimeoutMs?: number;
  interceptors?: PubSubInterceptor[];
  /** Optional signal that closes this scheduler when aborted. */
  signal?: AbortSignal;
}

/** Create a self-contained RabbitMQ scheduler that can be shared across transports. */
export function createRabbitMqScheduler(options: CreateRabbitMqSchedulerOptions): PubSubScheduler {
  return new OwnedRabbitMqScheduler(options);
}

class OwnedRabbitMqScheduler implements PubSubScheduler {
  #connection?: ChannelModel;
  #publisher?: ConfirmChannel;
  #scheduler?: RabbitMqScheduler;
  #startup?: Promise<void>;
  #schedulerStartup?: Promise<void>;
  #schedulerStarted = false;
  #aborted = false;
  readonly #removeAbortListener: () => void;

  public constructor(private readonly options: CreateRabbitMqSchedulerOptions) {
    this.#removeAbortListener = onAbortOnce(options.signal, () => {
      this.#aborted = true;
      void this.close();
    });
  }

  #assertNotAborted(): void {
    if (this.#aborted) {
      throw new Error("RabbitMQ scheduler has been aborted");
    }
  }

  public async start(): Promise<void> {
    this.#assertNotAborted();
    await this.#ensureConnected();
    this.#schedulerStartup ??= this.#startSchedulerOnce();
    await this.#schedulerStartup;
  }

  async #ensureConnected(): Promise<void> {
    this.#startup ??= this.#connectOnce();
    await this.#startup;
  }

  async #connectOnce(): Promise<void> {
    this.#connection = await connect(this.options.url);
    this.#publisher = await this.#connection.createConfirmChannel();
    await this.#publisher.assertExchange(this.#exchange(), "topic", { durable: true });
    await this.#publisher.assertQueue(this.#scheduleQueue(), { durable: true });
    this.#scheduler = new RabbitMqScheduler({
      connection: this.#connection,
      scheduleQueue: this.#scheduleQueue(),
      interceptors: this.options.interceptors,
      publishImmediate: (topic, event, attempt) =>
        publishConfirmed(
          this.#publisher!,
          "publish",
          this.#exchange(),
          topic,
          cloudEventBytes(event),
          publishScheduleOptions(event, {
            [PROTOUTIL_HEADER_ATTEMPT]: String(attempt),
          }),
          this.options.publishTimeoutMs,
        ),
      publishToScheduleQueue: (content, publishOptions) =>
        publishConfirmed(
          this.#publisher!,
          "sendToQueue",
          this.#scheduleQueue(),
          "",
          content,
          publishOptions,
          this.options.publishTimeoutMs,
        ),
    });
  }

  async #startSchedulerOnce(): Promise<void> {
    await this.#scheduler?.start();
    this.#schedulerStarted = true;
  }

  #exchange(): string {
    return this.options.exchange ?? DEFAULT_EXCHANGE;
  }

  #scheduleQueue(): string {
    return this.options.scheduleQueue ?? DEFAULT_SCHEDULE_QUEUE;
  }

  public async close(): Promise<void> {
    this.#removeAbortListener();
    if (this.#schedulerStarted) {
      await this.#scheduler?.close();
    }
    await this.#publisher?.close();
    await this.#connection?.close();
    this.#scheduler = undefined;
    this.#publisher = undefined;
    this.#connection = undefined;
    this.#startup = undefined;
    this.#schedulerStartup = undefined;
    this.#schedulerStarted = false;
  }

  public async publishLater(request: PublishRequest): Promise<void> {
    this.#assertNotAborted();
    await this.#ensureConnected();
    await this.#scheduler!.publishLater(request);
  }

  public async retryLater(
    topic: string,
    event: CloudEvent,
    delayMs: number,
    attempt: number,
  ): Promise<void> {
    this.#assertNotAborted();
    await this.#ensureConnected();
    await this.#scheduler!.retryLater(topic, event, delayMs, attempt);
  }
}

interface ScheduledMessage {
  id: string;
  topic: string;
  notBefore: string;
  attempt: number;
  event: CloudEvent;
  message: ConsumeMessage;
  timer?: NodeJS.Timeout;
}

interface RabbitMqSchedulerDependencies {
  connection: ChannelModel;
  scheduleQueue: string;
  interceptors?: PubSubInterceptor[];
  publishImmediate: (topic: string, event: CloudEvent, attempt: number) => Promise<void>;
  publishToScheduleQueue: (content: Buffer, options: Options.Publish) => Promise<void>;
}

/** Durable RabbitMQ scheduler for `notBefore` and retry delay delivery. */
export class RabbitMqScheduler implements PubSubScheduler {
  readonly #deps: RabbitMqSchedulerDependencies;
  readonly #scheduled = new Map<string, ScheduledMessage>();
  #channel?: Channel;

  public constructor(dependencies: RabbitMqSchedulerDependencies) {
    this.#deps = dependencies;
  }

  /** Start consuming durable schedule records from the schedule queue. */
  public async start(): Promise<void> {
    this.#channel = await this.#deps.connection.createChannel();
    await this.#channel.assertQueue(this.#deps.scheduleQueue, { durable: true });
    await this.#channel.prefetch(128);
    await this.#channel.consume(
      this.#deps.scheduleQueue,
      async (message) => {
        if (!message) {
          return;
        }
        await this.#handleMessage(message);
      },
      { noAck: false },
    );
  }

  /** Stop the scheduler, clear timers, and close the channel. */
  public async close(): Promise<void> {
    for (const scheduled of this.#scheduled.values()) {
      if (scheduled.timer) {
        clearTimeout(scheduled.timer);
      }
    }
    this.#scheduled.clear();
    await this.#channel?.close();
    this.#channel = undefined;
  }

  /** Persist and schedule a delayed publish request. */
  public async publishLater(request: PublishRequest): Promise<void> {
    if (!request.notBefore) {
      throw new Error("RabbitMQ scheduler requires a notBefore timestamp");
    }
    await this.#deps.publishToScheduleQueue(
      cloudEventBytes(request.event),
      publishScheduleOptions(request.event, {
        [PROTOUTIL_HEADER_TARGET_TOPIC]: request.topic,
        [PROTOUTIL_HEADER_NOT_BEFORE]: timestampDate(request.notBefore).toISOString(),
        [PROTOUTIL_HEADER_ATTEMPT]: "1",
      }),
    );
    await notifyInterceptors(this.#deps.interceptors, {
      operation: "scheduled",
      event: { id: request.event.id, topic: request.topic, attempt: 1 },
    });
  }

  /** Persist and schedule a retry for an already delivered CloudEvent. */
  public async retryLater(
    topic: string,
    event: CloudEvent,
    delayMs: number,
    attempt: number,
  ): Promise<void> {
    await this.#deps.publishToScheduleQueue(
      cloudEventBytes(event),
      publishScheduleOptions(event, {
        [PROTOUTIL_HEADER_TARGET_TOPIC]: topic,
        [PROTOUTIL_HEADER_NOT_BEFORE]: delayToNotBefore(delayMs),
        [PROTOUTIL_HEADER_ATTEMPT]: String(attempt),
      }),
    );
  }

  /** Parse and register one scheduled message consumed from the durable schedules queue. */
  async #handleMessage(message: ConsumeMessage): Promise<void> {
    if (!this.#channel) {
      throw new Error("RabbitMQ scheduler channel was not initialized");
    }
    let event: CloudEvent;
    try {
      event = cloudEventFromBytes(message.content);
    } catch (error) {
      await notifyInterceptors(this.#deps.interceptors, {
        operation: "parseFailed",
        event: {
          id: message.properties.messageId ?? "",
          topic: this.#deps.scheduleQueue,
          error,
        },
      });
      ackMessage(this.#channel, message);
      return;
    }

    const topic = scheduleTopic(message);
    const notBefore = scheduleNotBefore(message);
    const attempt = scheduleAttempt(message);
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
      ackMessage(this.#channel, existing.message);
    }
    this.#scheduled.set(scheduled.id, scheduled);
    this.#arm(scheduled);
  }

  /** Arm or immediately run one scheduled message based on its due time. */
  #arm(scheduled: ScheduledMessage): void {
    const delayMs = Math.max(0, Date.parse(scheduled.notBefore) - Date.now());
    scheduled.timer = setTimeout(() => {
      void this.#deliver(scheduled.id);
    }, delayMs);
  }

  /** Deliver one active scheduled message and acknowledge its schedule record. */
  async #deliver(id: string): Promise<void> {
    const scheduled = this.#scheduled.get(id);
    if (!scheduled || !this.#channel) {
      return;
    }
    if (scheduled.timer) {
      clearTimeout(scheduled.timer);
      scheduled.timer = undefined;
    }
    try {
      await this.#deps.publishImmediate(scheduled.topic, scheduled.event, scheduled.attempt);
      ackMessage(this.#channel, scheduled.message);
      this.#scheduled.delete(id);
      await notifyInterceptors(this.#deps.interceptors, {
        operation: "delivered",
        event: { id: scheduled.id, topic: scheduled.topic, attempt: scheduled.attempt },
      });
      await notifyInterceptors(this.#deps.interceptors, {
        operation: "tombstoned",
        event: { id: scheduled.id, topic: scheduled.topic, attempt: scheduled.attempt },
      });
    } catch (error) {
      await notifyInterceptors(this.#deps.interceptors, {
        operation: "deliveryFailed",
        event: { id: scheduled.id, topic: scheduled.topic, attempt: scheduled.attempt, error },
      });
      scheduled.notBefore = delayToNotBefore(DEFAULT_SCHEDULER_RETRY_DELAY_MS);
      this.#arm(scheduled);
    }
  }
}

/** Build minimal publish options for a schedule queue message. */
function publishScheduleOptions(
  event: CloudEvent,
  headers: Record<string, string>,
): Options.Publish {
  return {
    persistent: true,
    messageId: event.id,
    headers,
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

/** Read the target topic from a scheduled RabbitMQ message. */
function scheduleTopic(message: ConsumeMessage): string {
  const topic = message.properties.headers?.[PROTOUTIL_HEADER_TARGET_TOPIC];
  if (typeof topic !== "string") {
    throw new Error("RabbitMQ scheduled message is missing target topic");
  }
  return topic;
}

/** Read the not-before timestamp from a scheduled RabbitMQ message. */
function scheduleNotBefore(message: ConsumeMessage): string {
  const notBefore = message.properties.headers?.[PROTOUTIL_HEADER_NOT_BEFORE];
  if (typeof notBefore !== "string") {
    throw new Error("RabbitMQ scheduled message is missing notBefore");
  }
  return notBefore;
}

/** Read the attempt count from a scheduled RabbitMQ message. */
function scheduleAttempt(message: ConsumeMessage): number {
  const value = message.properties.headers?.[PROTOUTIL_HEADER_ATTEMPT];
  return parseAttempt(typeof value === "string" ? value : undefined);
}

/** Acknowledge one RabbitMQ message unless the channel has already closed during shutdown. */
export function ackMessage(channel: Channel, message: ConsumeMessage): void {
  try {
    channel.ack(message);
  } catch (error) {
    if (isClosedChannelError(error)) {
      return;
    }
    throw error;
  }
}

/** Detect the shutdown race where amqplib rejects an ack because the channel already closed. */
function isClosedChannelError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "Channel closed" || error.message === "Channel closing")
  );
}
