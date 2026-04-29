import { durationMs } from "@bufbuild/protobuf/wkt";
import {
  AckPolicy,
  DeliverPolicy,
  DiscardPolicy,
  headers,
  type JetStreamClient,
  type JetStreamManager,
  type JsMsg,
  type MsgHdrs,
  nanos,
  ReplayPolicy,
  type StorageType,
} from "nats";
import { cloudEventBytes, cloudEventFromBytes } from "../cloudevents.js";
import { createContextValues } from "../context-values.js";
import type { CloudEvent } from "../gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  CLOUD_EVENT_HEADER_ID,
  CLOUD_EVENT_HEADER_SOURCE,
  CLOUD_EVENT_HEADER_SPEC_VERSION,
  CLOUD_EVENT_HEADER_TYPE,
  CONTENT_TYPE_PROTOBUF,
  HEADER_CONTENT_TYPE,
  PROTOUTIL_HEADER_ATTEMPT,
  PROTOUTIL_HEADER_DISPOSITION,
  PROTOUTIL_HEADER_ORIGINAL_TOPIC,
} from "../headers.js";
import { applyPubSubInterceptors, notifyInterceptors } from "../interceptors.js";
import { retryLaterOrThrow, scheduleOrThrow } from "../scheduler.js";
import { retryLimitReached, stableTopicHash } from "../transport-utils.js";
import type {
  DeliveryHandler,
  Disposition,
  PublishRequest,
  PubSubTransport,
  SubscribeRequest,
  Subscription,
} from "../types.js";
import { acquireSharedNatsConnection, releaseSharedNatsConnection } from "./connection.js";
import { scheduleAttempt } from "./scheduler.js";
import type { NatsTransportOptions } from "./types.js";
import { durableNamePart, safeAck } from "./utils.js";

const DEFAULT_CONSUMER_GROUP = "protoutil.pubsub";
const DEFAULT_ACK_WAIT_MS = 30_000;

interface ActiveSubscription {
  close(): Promise<void>;
}

/**
 * Create a NATS JetStream-backed pubsub transport.
 */
export function createNatsTransport(options: NatsTransportOptions): PubSubTransport {
  return new DefaultNatsTransport(options);
}

class DefaultNatsTransport implements PubSubTransport {
  /** Transport-level default CloudEvent source used when publisher options do not provide one. */
  public readonly defaultSource?: string;
  readonly #options: NatsTransportOptions;
  readonly #subscriptions = new Set<ActiveSubscription>();
  #jetstream?: JetStreamClient;
  #manager?: JetStreamManager;
  #sharedConnectionKey?: string;
  #startup?: Promise<void>;

  /** Create one NATS transport with lazy connection and topology startup. */
  public constructor(options: NatsTransportOptions) {
    this.#options = options;
    this.defaultSource = options.defaultSource;
  }

  /** Connect the shared NATS and JetStream clients once before use. */
  async #ensureStarted(): Promise<void> {
    this.#startup ??= this.#start();
    await this.#startup;
  }

  /** Connect NATS and materialize the shared JetStream client and manager. */
  async #start(): Promise<void> {
    const shared = await acquireSharedNatsConnection({
      servers: this.#options.servers,
      connectionOptions: this.#options.connectionOptions,
    });
    this.#sharedConnectionKey = shared.key;
    this.#jetstream = shared.jetstream;
    this.#manager = shared.manager;
    await this.#ensureStream(
      this.#options.stream.name,
      this.#options.stream.subjects,
      this.#options.stream.storage,
    );
  }

  /** Close owned subscriptions, scheduler state, and the shared NATS connection. */
  public async close(): Promise<void> {
    for (const subscription of this.#subscriptions) {
      await subscription.close();
    }
    this.#subscriptions.clear();
    this.#jetstream = undefined;
    this.#manager = undefined;
    if (this.#sharedConnectionKey) {
      await releaseSharedNatsConnection(this.#sharedConnectionKey);
    }
    this.#sharedConnectionKey = undefined;
    this.#startup = undefined;
  }

  /** Publish one immediate or delayed CloudEvent through JetStream. */
  public async publish(request: PublishRequest): Promise<void> {
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

  /** Start one durable JetStream consumer and return an unsubscribe handle. */
  public async subscribe(
    handler: DeliveryHandler,
    request: SubscribeRequest,
  ): Promise<Subscription> {
    await this.#ensureStarted();
    if (!this.#manager || !request.topics.length) {
      throw new Error("NATS subscriber transport requires at least one subscribe topic");
    }

    const consumerName = subscriptionConsumerName(
      request.consumerGroup ?? DEFAULT_CONSUMER_GROUP,
      request.topics,
    );
    await this.#ensureConsumer(
      this.#options.stream.name,
      consumerName,
      request.topics,
      DEFAULT_ACK_WAIT_MS,
      Math.max(request.concurrency ?? 1, 1),
      DeliverPolicy.All,
    );
    if (!this.#jetstream) {
      throw new Error("NATS transport JetStream client was not initialized");
    }
    const consumer = await this.#jetstream.consumers.get(this.#options.stream.name, consumerName);
    const messages = await consumer.consume({
      max_messages: Math.max(request.concurrency ?? 1, 1),
      abort_on_missing_resource: true,
    });

    let closed = false;
    const inFlight = new Set<Promise<void>>();
    const close = async () => {
      if (closed) {
        return;
      }
      closed = true;
      request.signal?.removeEventListener("abort", abort);
      this.#subscriptions.delete(active);
      await messages.close();
      await Promise.allSettled(inFlight);
    };
    const abort = () => {
      void close();
    };
    const active: ActiveSubscription = { close };
    this.#subscriptions.add(active);

    const loop = (async () => {
      for await (const message of messages) {
        const task = this.#consumeMessage(handler, message, request)
          .catch(async (error) => {
            await notifyInterceptors(this.#options.interceptors, {
              operation: "deliveryFailed",
              event: {
                id: message.headers?.last(CLOUD_EVENT_HEADER_ID) ?? "",
                topic: message.subject,
                error,
              },
            });
            safeAck(message);
          })
          .finally(() => {
            inFlight.delete(task);
          });
        inFlight.add(task);
        if (inFlight.size >= Math.max(request.concurrency ?? 1, 1)) {
          await Promise.race(inFlight);
        }
      }
    })();
    void loop.finally(() => {
      this.#subscriptions.delete(active);
    });

    if (request.signal?.aborted) {
      await close();
      return { unsubscribe: close };
    }
    request.signal?.addEventListener("abort", abort, { once: true });

    return { unsubscribe: close };
  }

  /** Ensure one stream exists with the configured subjects. */
  async #ensureStream(
    name: string,
    subjects: string[],
    storage: StorageType | undefined,
  ): Promise<void> {
    if (!this.#manager) {
      throw new Error("NATS transport manager was not initialized");
    }
    try {
      await this.#manager.streams.info(name);
      await this.#manager.streams.update(name, { subjects });
    } catch {
      await this.#manager.streams.add({
        name,
        subjects,
        storage: storage ?? ("file" as StorageType),
        discard: DiscardPolicy.Old,
      });
    }
  }

  /** Ensure one durable pull consumer exists for the given stream and subjects. */
  async #ensureConsumer(
    stream: string,
    durableName: string,
    filterSubjects: string[],
    ackWaitMs: number,
    maxAckPending: number,
    deliverPolicy: DeliverPolicy,
  ): Promise<void> {
    if (!this.#manager) {
      throw new Error("NATS transport manager was not initialized");
    }
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
      await this.#manager.consumers.info(stream, durableName);
      await this.#manager.consumers.update(stream, durableName, config);
    } catch {
      await this.#manager.consumers.add(stream, config);
    }
  }

  /** Publish one immediate CloudEvent to its target subject. */
  async #publishImmediate(topic: string, event: CloudEvent, attempt: number): Promise<void> {
    if (!this.#jetstream) {
      throw new Error("NATS transport JetStream client was not initialized");
    }
    const eventBytes = cloudEventBytes(event);
    await this.#jetstream.publish(topic, eventBytes, {
      timeout: this.#options.publishTimeoutMs,
      msgID: `${topic}:${event.id}:${attempt}`,
      headers: publishHeaders(event, {
        [PROTOUTIL_HEADER_ATTEMPT]: String(attempt),
      }),
    });
  }

  /** Decode one consumed CloudEvent and settle it through the router disposition. */
  async #consumeMessage(
    handler: DeliveryHandler,
    message: JsMsg,
    request: SubscribeRequest,
  ): Promise<void> {
    let event: CloudEvent;
    try {
      event = cloudEventFromBytes(message.data);
    } catch (error) {
      await notifyInterceptors(this.#options.interceptors, {
        operation: "parseFailed",
        event: {
          id: message.headers?.last(CLOUD_EVENT_HEADER_ID) ?? "",
          topic: message.subject,
          error,
        },
      });
      safeAck(message);
      return;
    }

    const attempt = scheduleAttempt(message);
    const contextValues = createContextValues();
    const delivery = { event, topic: message.subject, attempt, contextValues };
    const disposition = (await applyPubSubInterceptors(
      this.#options.interceptors,
      { operation: "handle", delivery, contextValues },
      async (ctx) => {
        const d = (ctx as Extract<typeof ctx, { operation: "handle" }>).delivery;
        return handler(d);
      },
    )) as Disposition;
    await this.#settleDelivery(
      message,
      event,
      disposition,
      attempt,
      request.maxAttempts,
      request.deadLetterTopic,
    );
  }

  /** Map one router disposition onto JetStream ack, retry, or dead-letter behavior. */
  async #settleDelivery(
    message: JsMsg,
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
          event: { id: event.id, topic: message.subject, attempt },
        });
        await this.#publishDeadLetter(
          deadLetterTopic,
          message.subject,
          event,
          attempt,
          "dead_letter",
        );
        safeAck(message);
        await notifyInterceptors(this.#options.interceptors, {
          operation: "committed",
          event: { id: event.id, topic: message.subject, attempt },
        });
        return;
      }
      const delay = disposition.delay ? durationMs(disposition.delay) : 0;
      if (delay > 0) {
        await retryLaterOrThrow(
          this.#options.scheduler,
          message.subject,
          event,
          disposition,
          attempt + 1,
        );
      } else {
        await this.#publishImmediate(message.subject, event, attempt + 1);
      }
      safeAck(message);
      await notifyInterceptors(this.#options.interceptors, {
        operation: "retried",
        event: { id: event.id, topic: message.subject, attempt: attempt + 1 },
      });
      await notifyInterceptors(this.#options.interceptors, {
        operation: "committed",
        event: { id: event.id, topic: message.subject, attempt },
      });
      return;
    }

    if (disposition.kind === "reject" || disposition.kind === "dead_letter") {
      await this.#publishDeadLetter(
        deadLetterTopic,
        message.subject,
        event,
        attempt,
        disposition.kind,
      );
    }
    safeAck(message);
    await notifyInterceptors(this.#options.interceptors, {
      operation: "committed",
      event: { id: event.id, topic: message.subject, attempt },
    });
  }

  /** Publish one rejected or dead-lettered CloudEvent when a dead-letter topic is configured. */
  async #publishDeadLetter(
    deadLetterTopic: string | undefined,
    topic: string,
    event: CloudEvent,
    attempt: number,
    disposition: Disposition["kind"],
  ): Promise<void> {
    if (!deadLetterTopic || !this.#jetstream) {
      return;
    }
    await this.#jetstream.publish(deadLetterTopic, cloudEventBytes(event), {
      timeout: this.#options.publishTimeoutMs,
      headers: publishHeaders(event, {
        [PROTOUTIL_HEADER_ATTEMPT]: String(attempt),
        [PROTOUTIL_HEADER_DISPOSITION]: disposition,
        [PROTOUTIL_HEADER_ORIGINAL_TOPIC]: topic,
      }),
    });
    await notifyInterceptors(this.#options.interceptors, {
      operation: "deadLettered",
      event: { id: event.id, topic: deadLetterTopic, attempt },
    });
  }
}

/** Build publish headers from a CloudEvent plus extra transport metadata. */
function publishHeaders(event: CloudEvent, extra?: Record<string, string>): MsgHdrs {
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

/** Build a durable consumer name from the consumer group and filtered subjects. */
function subscriptionConsumerName(consumerGroup: string, topics: string[]): string {
  return `${durableNamePart(consumerGroup)}_${stableTopicHash(topics)}`;
}
