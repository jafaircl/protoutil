import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  type ConsumerMessages,
  DeliverPolicy,
  type JetStreamClient,
  type JetStreamManager,
  type JsMsg,
  type KV,
  type StorageType,
} from "nats";
import { cloudEventBytes, cloudEventFromBytes } from "../cloudevents.js";
import type { CloudEvent } from "../gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  CLOUD_EVENT_HEADER_ID,
  PROTOUTIL_HEADER_ATTEMPT,
  PROTOUTIL_HEADER_NOT_BEFORE,
  PROTOUTIL_HEADER_TARGET_TOPIC,
} from "../headers.js";
import { notifyInterceptors } from "../interceptors.js";
import {
  DEFAULT_SCHEDULER_RETRY_DELAY_MS,
  delayToNotBefore,
  parseAttempt,
} from "../transport-utils.js";
import type { PublishRequest, PubSubInterceptor, PubSubScheduler } from "../types.js";
import type { NatsSchedulerOptions } from "./types.js";
import { durableNamePart, safeAck, safeNak } from "./utils.js";

const DEFAULT_SCHEDULER_CONSUMER = "protoutil_pubsub_scheduler";
const DEFAULT_SCHEDULER_ACK_WAIT_MS = 30_000;
const DEFAULT_MAX_ACK_PENDING = 256;
const DEFAULT_SCHEDULER_CONCURRENCY = 64;

interface ScheduledState {
  id: string;
  topic: string;
  notBefore: string;
  attempt: number;
  event: string;
}

interface EncodedScheduledState {
  state: ScheduledState;
  serialized: string;
}

interface NatsSchedulerDependencies {
  jetstream: JetStreamClient;
  manager: JetStreamManager;
  options: NatsSchedulerOptions;
  publishTimeoutMs?: number;
  interceptors?: PubSubInterceptor[];
  publishImmediate: (topic: string, event: CloudEvent, attempt: number) => Promise<void>;
  ensureStream: (
    name: string,
    subjects: string[],
    storage: StorageType | undefined,
  ) => Promise<void>;
  ensureConsumer: (
    stream: string,
    durableName: string,
    filterSubjects: string[],
    ackWaitMs: number,
    maxAckPending: number,
    deliverPolicy: DeliverPolicy,
  ) => Promise<void>;
  publishHeaders: (event: CloudEvent, extra?: Record<string, string>) => import("nats").MsgHdrs;
}

/** Durable NATS JetStream scheduler for `notBefore` and retry delay delivery. */
export class NatsScheduler implements PubSubScheduler {
  readonly #deps: NatsSchedulerDependencies;
  readonly #inFlight = new Set<JsMsg>();
  #messages?: ConsumerMessages;
  #loop?: Promise<void>;
  #bucketPromise?: Promise<KV>;

  public constructor(dependencies: NatsSchedulerDependencies) {
    this.#deps = dependencies;
  }

  /** Start consuming durable schedule records. */
  public async start(): Promise<void> {
    const options = this.#deps.options;
    await this.#deps.ensureStream(options.streamName, [options.subject], options.storage);
    await this.#deps.jetstream.views.kv(options.kvBucket, {
      history: 1,
      storage: options.storage ?? fileStorage(),
      replicas: options.replicas,
    });
    await this.#deps.ensureConsumer(
      options.streamName,
      this.#consumerName(),
      [options.subject],
      options.ackWaitMs ?? DEFAULT_SCHEDULER_ACK_WAIT_MS,
      DEFAULT_MAX_ACK_PENDING,
      DeliverPolicy.All,
    );
    const consumer = await this.#deps.jetstream.consumers.get(
      options.streamName,
      this.#consumerName(),
    );
    this.#messages = await consumer.consume({
      max_messages: 128,
      abort_on_missing_resource: true,
    });
    if (!this.#messages) {
      throw new Error("NATS scheduler consumer was not initialized");
    }
    this.#loop = this.#runLoop(this.#messages);
    await this.#recoverFromKV();
  }

  /** Stop the scheduler consumer and clear in-process state. */
  public async close(): Promise<void> {
    for (const message of this.#inFlight) {
      safeNak(message, 0);
    }
    this.#inFlight.clear();
    await this.#messages?.close();
    await this.#loop?.catch(() => undefined);
    this.#messages = undefined;
    this.#loop = undefined;
    this.#bucketPromise = undefined;
  }

  /** Persist and schedule a delayed publish request. */
  public async publishLater(request: PublishRequest): Promise<void> {
    const eventBytes = cloudEventBytes(request.event);
    const encoded = scheduleState(
      request.topic,
      eventBytes,
      request.event.id,
      request.notBefore ? timestampDate(request.notBefore).toISOString() : new Date().toISOString(),
      1,
    );
    const bucket = await this.#bucket();
    await bucket.put(encoded.state.id, Buffer.from(encoded.serialized, "utf8"));
    await this.#deps.jetstream.publish(this.#deps.options.subject, eventBytes, {
      timeout: this.#deps.publishTimeoutMs,
      headers: this.#deps.publishHeaders(request.event, {
        [PROTOUTIL_HEADER_TARGET_TOPIC]: request.topic,
        [PROTOUTIL_HEADER_NOT_BEFORE]: encoded.state.notBefore,
        [PROTOUTIL_HEADER_ATTEMPT]: "1",
      }),
    });
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
    const notBefore = delayToNotBefore(delayMs);
    const eventBytes = cloudEventBytes(event);
    const encoded = scheduleState(topic, eventBytes, event.id, notBefore, attempt);
    const bucket = await this.#bucket();
    await bucket.put(encoded.state.id, Buffer.from(encoded.serialized, "utf8"));
    await this.#deps.jetstream.publish(this.#deps.options.subject, eventBytes, {
      timeout: this.#deps.publishTimeoutMs,
      headers: this.#deps.publishHeaders(event, {
        [PROTOUTIL_HEADER_TARGET_TOPIC]: topic,
        [PROTOUTIL_HEADER_NOT_BEFORE]: notBefore,
        [PROTOUTIL_HEADER_ATTEMPT]: String(attempt),
      }),
    });
    await notifyInterceptors(this.#deps.interceptors, {
      operation: "scheduled",
      event: { id: event.id, topic, attempt },
    });
  }

  /** Republish wake-up messages for any active KV schedule entries left by a previous instance. */
  async #recoverFromKV(): Promise<void> {
    const bucket = await this.#bucket();
    const keys = await bucket.keys();
    for await (const key of keys) {
      const entry = await bucket.get(key);
      if (!entry || entry.operation !== "PUT") {
        continue;
      }
      try {
        const state: ScheduledState = JSON.parse(entry.string());
        const eventBytes = Buffer.from(state.event, "base64");
        const event = cloudEventFromBytes(eventBytes);
        await this.#deps.jetstream.publish(this.#deps.options.subject, eventBytes, {
          timeout: this.#deps.publishTimeoutMs,
          headers: this.#deps.publishHeaders(event, {
            [PROTOUTIL_HEADER_TARGET_TOPIC]: state.topic,
            [PROTOUTIL_HEADER_NOT_BEFORE]: state.notBefore,
            [PROTOUTIL_HEADER_ATTEMPT]: String(state.attempt),
          }),
        });
      } catch {
        // Recovery is best-effort; the scheduler loop retries on failure.
      }
    }
  }

  /** Run the durable scheduler loop over JetStream wake-up messages. */
  async #runLoop(messages: ConsumerMessages): Promise<void> {
    const inFlight = new Set<Promise<void>>();
    for await (const message of messages) {
      this.#inFlight.add(message);
      const task = this.#handleMessage(message).finally(() => {
        this.#inFlight.delete(message);
        inFlight.delete(task);
      });
      inFlight.add(task);
      if (inFlight.size >= DEFAULT_SCHEDULER_CONCURRENCY) {
        await Promise.race(inFlight);
      }
    }
    await Promise.allSettled(inFlight);
  }

  /** Process one scheduler wake-up message and either delay, deliver, or discard it. */
  async #handleMessage(message: JsMsg): Promise<void> {
    let event: CloudEvent;
    try {
      event = cloudEventFromBytes(message.data);
    } catch (error) {
      await notifyInterceptors(this.#deps.interceptors, {
        operation: "parseFailed",
        event: {
          id: message.headers?.last(CLOUD_EVENT_HEADER_ID) ?? "",
          topic: this.#deps.options.subject,
          error,
        },
      });
      safeAck(message);
      return;
    }

    const encoded = scheduleState(
      scheduleTopic(message),
      message.data,
      event.id,
      scheduleNotBefore(message),
      scheduleAttempt(message),
    );
    const bucket = await this.#bucket();
    const entry = await bucket.get(encoded.state.id);
    if (!entry || entry.operation !== "PUT") {
      safeAck(message);
      return;
    }
    if (entry.string() !== encoded.serialized) {
      safeAck(message);
      return;
    }

    const delayMs = Date.parse(encoded.state.notBefore) - Date.now();
    if (delayMs > 0) {
      message.nak(delayMs);
      return;
    }

    try {
      await this.#deps.publishImmediate(encoded.state.topic, event, encoded.state.attempt);
      await bucket.delete(encoded.state.id);
      safeAck(message);
      await notifyInterceptors(this.#deps.interceptors, {
        operation: "delivered",
        event: { id: encoded.state.id, topic: encoded.state.topic, attempt: encoded.state.attempt },
      });
      await notifyInterceptors(this.#deps.interceptors, {
        operation: "tombstoned",
        event: {
          id: encoded.state.id,
          topic: this.#deps.options.subject,
          attempt: encoded.state.attempt,
        },
      });
    } catch (error) {
      await notifyInterceptors(this.#deps.interceptors, {
        operation: "deliveryFailed",
        event: {
          id: encoded.state.id,
          topic: encoded.state.topic,
          attempt: encoded.state.attempt,
          error,
        },
      });
      message.nak(this.#deps.options.deliveryRetryDelayMs ?? DEFAULT_SCHEDULER_RETRY_DELAY_MS);
    }
  }

  /** Return the configured durable scheduler consumer name. */
  #consumerName(): string {
    return durableNamePart(this.#deps.options.consumerName ?? DEFAULT_SCHEDULER_CONSUMER);
  }

  /** Return the durable KV bucket that tracks the latest schedule state per id. */
  async #bucket(): Promise<KV> {
    this.#bucketPromise ??= this.#deps.jetstream.views.kv(this.#deps.options.kvBucket, {
      history: 1,
      storage: this.#deps.options.storage ?? fileStorage(),
      replicas: this.#deps.options.replicas,
    });
    return this.#bucketPromise;
  }
}

/** Read the transport attempt count from one JetStream message. */
export function scheduleAttempt(message: JsMsg): number {
  return parseAttempt(message.headers?.last(PROTOUTIL_HEADER_ATTEMPT));
}

/** Build one deterministic schedule-state snapshot. */
function scheduleState(
  topic: string,
  eventBytes: Uint8Array,
  eventId: string,
  notBefore: string,
  attempt: number,
): EncodedScheduledState {
  const state: ScheduledState = {
    id: eventId,
    topic,
    notBefore,
    attempt,
    event: Buffer.from(eventBytes).toString("base64"),
  };
  return { state, serialized: serializeScheduleState(state) };
}

/** Serialize one schedule-state snapshot for the KV bucket. */
function serializeScheduleState(state: ScheduledState): string {
  return JSON.stringify({
    id: state.id,
    topic: state.topic,
    notBefore: state.notBefore,
    attempt: state.attempt,
    event: state.event,
  });
}

/** Read the schedule target topic from one JetStream message. */
function scheduleTopic(message: JsMsg): string {
  const value = message.headers?.last(PROTOUTIL_HEADER_TARGET_TOPIC);
  if (!value) {
    throw new Error("NATS scheduled message is missing target topic");
  }
  return value;
}

/** Read the schedule not-before timestamp from one JetStream message. */
function scheduleNotBefore(message: JsMsg): string {
  const value = message.headers?.last(PROTOUTIL_HEADER_NOT_BEFORE);
  if (!value) {
    throw new Error("NATS scheduled message is missing notBefore");
  }
  return value;
}

/** Default to file-backed JetStream storage so delayed delivery survives restarts. */
function fileStorage(): StorageType {
  return "file" as StorageType;
}
