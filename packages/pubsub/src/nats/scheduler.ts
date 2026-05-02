import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  AckPolicy,
  type ConsumerMessages,
  DeliverPolicy,
  DiscardPolicy,
  headers,
  type JetStreamClient,
  type JetStreamManager,
  type JsMsg,
  type KV,
  nanos,
  ReplayPolicy,
  type StorageType,
} from "nats";
import { cloudEventBytes, cloudEventFromBytes } from "../cloudevents.js";
import type { CloudEvent } from "../gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  CLOUD_EVENT_HEADER_ID,
  CLOUD_EVENT_HEADER_SOURCE,
  CLOUD_EVENT_HEADER_SPEC_VERSION,
  CLOUD_EVENT_HEADER_TYPE,
  CONTENT_TYPE_PROTOBUF,
  HEADER_CONTENT_TYPE,
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
import { acquireSharedNatsConnection, releaseSharedNatsConnection } from "./connection.js";
import type { NatsSchedulerOptions } from "./types.js";
import { durableNamePart, safeAck, safeNak } from "./utils.js";

const DEFAULT_SCHEDULER_CONSUMER = "protoutil_pubsub_scheduler";
const DEFAULT_SCHEDULER_ACK_WAIT_MS = 30_000;
const DEFAULT_MAX_ACK_PENDING = 256;
const DEFAULT_SCHEDULER_CONCURRENCY = 64;
const NATS_HEADER_SCHEDULE_REVISION = "protoutil-pubsub-schedule-revision";

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

export interface CreateNatsSchedulerOptions {
  servers?: string | string[];
  connectionOptions?: import("nats").ConnectionOptions;
  options: NatsSchedulerOptions;
  publishTimeoutMs?: number;
  interceptors?: PubSubInterceptor[];
  /** Optional signal that closes this scheduler when aborted. */
  signal?: AbortSignal;
}

/** Create a self-contained NATS scheduler that can be shared across transports. */
export function createNatsScheduler(options: CreateNatsSchedulerOptions): PubSubScheduler {
  return new OwnedNatsScheduler(options);
}

class OwnedNatsScheduler implements PubSubScheduler {
  #jetstream?: JetStreamClient;
  #manager?: JetStreamManager;
  #scheduler?: NatsScheduler;
  #sharedConnectionKey?: string;
  #startup?: Promise<void>;
  #aborted = false;
  readonly #removeAbortListener: () => void;

  public constructor(private readonly options: CreateNatsSchedulerOptions) {
    this.#removeAbortListener = onAbortOnce(options.signal, () => {
      this.#aborted = true;
      void this.close();
    });
  }

  #assertNotAborted(): void {
    if (this.#aborted) {
      throw new Error("NATS scheduler has been aborted");
    }
  }

  public async start(): Promise<void> {
    this.#assertNotAborted();
    this.#startup ??= this.#startOnce();
    await this.#startup;
  }

  async #startOnce(): Promise<void> {
    const shared = await acquireSharedNatsConnection({
      servers: this.options.servers,
      connectionOptions: this.options.connectionOptions,
    });
    this.#sharedConnectionKey = shared.key;
    this.#jetstream = shared.jetstream;
    this.#manager = shared.manager;
    this.#scheduler = new NatsScheduler({
      jetstream: this.#jetstream,
      manager: this.#manager,
      options: this.options.options,
      publishTimeoutMs: this.options.publishTimeoutMs,
      interceptors: this.options.interceptors,
      publishImmediate: (topic, event, attempt) =>
        publishImmediate(this.#jetstream!, topic, event, attempt, this.options.publishTimeoutMs),
      ensureStream: (name, subjects, storage) =>
        ensureStream(this.#manager!, name, subjects, storage),
      ensureConsumer: (stream, name, subjects, ackWait, maxPending, policy) =>
        ensureConsumer(this.#manager!, stream, name, subjects, ackWait, maxPending, policy),
      publishHeaders,
    });
    await this.#scheduler.start();
  }

  public async close(): Promise<void> {
    this.#removeAbortListener();
    await this.#scheduler?.close();
    this.#scheduler = undefined;
    this.#manager = undefined;
    this.#jetstream = undefined;
    if (this.#sharedConnectionKey) {
      await releaseSharedNatsConnection(this.#sharedConnectionKey);
    }
    this.#sharedConnectionKey = undefined;
    this.#startup = undefined;
  }

  public async publishLater(request: PublishRequest): Promise<void> {
    this.#assertNotAborted();
    await this.start();
    await this.#scheduler!.publishLater(request);
  }

  public async retryLater(
    topic: string,
    event: CloudEvent,
    delayMs: number,
    attempt: number,
  ): Promise<void> {
    this.#assertNotAborted();
    await this.start();
    await this.#scheduler!.retryLater(topic, event, delayMs, attempt);
  }
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
    // Carry the KV revision in the wake-up message so hot delivery checks can
    // compare one integer instead of rebuilding and stringifying schedule state.
    const revision = await bucket.put(encoded.state.id, Buffer.from(encoded.serialized, "utf8"));
    await this.#deps.jetstream.publish(this.#deps.options.subject, eventBytes, {
      timeout: this.#deps.publishTimeoutMs,
      headers: this.#deps.publishHeaders(request.event, {
        [PROTOUTIL_HEADER_TARGET_TOPIC]: request.topic,
        [PROTOUTIL_HEADER_NOT_BEFORE]: encoded.state.notBefore,
        [PROTOUTIL_HEADER_ATTEMPT]: "1",
        [NATS_HEADER_SCHEDULE_REVISION]: String(revision),
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
    const revision = await bucket.put(encoded.state.id, Buffer.from(encoded.serialized, "utf8"));
    await this.#deps.jetstream.publish(this.#deps.options.subject, eventBytes, {
      timeout: this.#deps.publishTimeoutMs,
      headers: this.#deps.publishHeaders(event, {
        [PROTOUTIL_HEADER_TARGET_TOPIC]: topic,
        [PROTOUTIL_HEADER_NOT_BEFORE]: notBefore,
        [PROTOUTIL_HEADER_ATTEMPT]: String(attempt),
        [NATS_HEADER_SCHEDULE_REVISION]: String(revision),
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
            [NATS_HEADER_SCHEDULE_REVISION]: String(entry.revision),
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

    const topic = scheduleTopic(message);
    const notBefore = scheduleNotBefore(message);
    const attempt = scheduleAttempt(message);
    const revision = scheduleRevision(message);
    const bucket = await this.#bucket();
    const entry = await bucket.get(event.id);
    if (!entry || entry.operation !== "PUT") {
      safeAck(message);
      return;
    }
    if (revision !== undefined && entry.revision !== revision) {
      safeAck(message);
      return;
    }
    if (revision === undefined) {
      // Fall back to the old full-state comparison for wake-up messages that
      // predate the revision header rollout.
      const encoded = scheduleState(topic, message.data, event.id, notBefore, attempt);
      if (entry.string() !== encoded.serialized) {
        safeAck(message);
        return;
      }
    }

    const delayMs = Date.parse(notBefore) - Date.now();
    if (delayMs > 0) {
      message.nak(delayMs);
      return;
    }

    try {
      await this.#deps.publishImmediate(topic, event, attempt);
      await bucket.delete(event.id);
      safeAck(message);
      await notifyInterceptors(this.#deps.interceptors, {
        operation: "delivered",
        event: { id: event.id, topic, attempt },
      });
      await notifyInterceptors(this.#deps.interceptors, {
        operation: "tombstoned",
        event: {
          id: event.id,
          topic: this.#deps.options.subject,
          attempt,
        },
      });
    } catch (error) {
      await notifyInterceptors(this.#deps.interceptors, {
        operation: "deliveryFailed",
        event: {
          id: event.id,
          topic,
          attempt,
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

/** Read the current schedule revision from one JetStream wake-up message. */
function scheduleRevision(message: JsMsg): number | undefined {
  const value = message.headers?.last(NATS_HEADER_SCHEDULE_REVISION);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** Read the transport attempt count from one JetStream message. */
export function scheduleAttempt(message: JsMsg): number {
  return parseAttempt(message.headers?.last(PROTOUTIL_HEADER_ATTEMPT));
}

async function publishImmediate(
  jetstream: JetStreamClient,
  topic: string,
  event: CloudEvent,
  attempt: number,
  timeout: number | undefined,
): Promise<void> {
  await jetstream.publish(topic, cloudEventBytes(event), {
    timeout,
    msgID: `${topic}:${event.id}:${attempt}`,
    headers: publishHeaders(event, {
      [PROTOUTIL_HEADER_ATTEMPT]: String(attempt),
    }),
  });
}

async function ensureStream(
  manager: JetStreamManager,
  name: string,
  subjects: string[],
  storage: StorageType | undefined,
): Promise<void> {
  try {
    await manager.streams.info(name);
    await manager.streams.update(name, { subjects });
  } catch {
    await manager.streams.add({
      name,
      subjects,
      storage: storage ?? fileStorage(),
      discard: DiscardPolicy.Old,
    });
  }
}

async function ensureConsumer(
  manager: JetStreamManager,
  stream: string,
  durableName: string,
  filterSubjects: string[],
  ackWaitMs: number,
  maxAckPending: number,
  deliverPolicy: DeliverPolicy,
): Promise<void> {
  const config = {
    durable_name: durableName,
    name: durableName,
    ack_policy: AckPolicy.Explicit,
    ack_wait: nanos(ackWaitMs),
    max_ack_pending: Math.max(maxAckPending, 1),
    deliver_policy: deliverPolicy,
    replay_policy: ReplayPolicy.Instant,
    filter_subjects: filterSubjects,
  } as const;
  try {
    await manager.consumers.info(stream, durableName);
    await manager.consumers.update(stream, durableName, config);
  } catch {
    await manager.consumers.add(stream, config);
  }
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

function publishHeaders(event: CloudEvent, extra?: Record<string, string>): import("nats").MsgHdrs {
  const result = headers();
  result.set(HEADER_CONTENT_TYPE, CONTENT_TYPE_PROTOBUF);
  result.set(CLOUD_EVENT_HEADER_SPEC_VERSION, event.specVersion);
  result.set(CLOUD_EVENT_HEADER_TYPE, event.type);
  result.set(CLOUD_EVENT_HEADER_SOURCE, event.source);
  result.set(CLOUD_EVENT_HEADER_ID, event.id);
  for (const [key, value] of Object.entries(extra ?? {})) {
    result.set(key, value);
  }
  return result;
}
