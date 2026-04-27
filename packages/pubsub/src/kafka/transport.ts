import { durationMs } from "@bufbuild/protobuf/wkt";
import type { KafkaJS } from "@confluentinc/kafka-javascript";
import { cloudEventFromBytes } from "../cloudevents.js";
import type { CloudEvent } from "../gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  numberHeader,
  PROTOUTIL_HEADER_ATTEMPT,
  PROTOUTIL_HEADER_DISPOSITION,
  PROTOUTIL_HEADER_ORIGINAL_OFFSET,
  PROTOUTIL_HEADER_ORIGINAL_PARTITION,
  PROTOUTIL_HEADER_ORIGINAL_TOPIC,
} from "../headers.js";
import { applyPubSubInterceptors, notifyInterceptors } from "../interceptors.js";
import { retryLimitReached as retryLimitReachedWithMaxAttempts } from "../transport-utils.js";
import type {
  DeliveryHandler,
  Disposition,
  PublishRequest,
  PubSubTransport,
  SubscribeOptions,
  Subscription,
} from "../types.js";
import { cloudEventMessage } from "./cloud-event.js";
import { sendWithTimeout } from "./producer.js";
import { KafkaScheduler } from "./scheduler.js";
import { topologyTopics } from "./topology.js";
import type { KafkaTransportOptions } from "./types.js";
import { keyString } from "./utils.js";

const DEFAULT_CONSUMER_GROUP = "protoutil.pubsub";
const CONSUMER_ASSIGNMENT_TIMEOUT_MS = 5_000;
const consumerMaxAttempts = new WeakMap<KafkaJS.Consumer, number>();
const topologyCreation = new Map<string, Promise<void>>();

/** Create a Kafka-backed pubsub transport using `@confluentinc/kafka-javascript`. */
export function createKafkaTransport(options: KafkaTransportOptions): PubSubTransport {
  return new DefaultKafkaTransport(options);
}

class DefaultKafkaTransport implements PubSubTransport {
  public readonly defaultSource?: string;
  readonly #options: KafkaTransportOptions;
  readonly #admin: KafkaJS.Admin;
  readonly #producer: KafkaJS.Producer;
  readonly #scheduler: KafkaScheduler;
  readonly #consumers = new Set<KafkaJS.Consumer>();
  #adminStartup?: Promise<void>;
  #producerStartup?: Promise<void>;
  #schedulerStartup?: Promise<void>;
  #adminStarted = false;
  #producerStarted = false;
  #schedulerStarted = false;

  /** Create one Kafka transport with lazily started producer, admin, and scheduler clients. */
  public constructor(options: KafkaTransportOptions) {
    this.#options = options;
    this.defaultSource = options.defaultSource;
    this.#admin = options.client.admin(options.adminConfig);
    this.#producer = options.client.producer(options.producerConfig);
    this.#scheduler = new KafkaScheduler({
      client: options.client,
      producer: this.#producer,
      options: options.scheduler,
      consumerGroup:
        options.scheduler.consumerGroup ??
        `${DEFAULT_CONSUMER_GROUP}.scheduler.${options.scheduler.schedulesTopic}`,
      publishTimeoutMs: options.publishTimeoutMs,
      interceptors: options.interceptors,
    });
  }

  /** Lazily connect the shared Kafka producer used for immediate and delayed publish paths. */
  async #ensureProducerStarted(): Promise<void> {
    // Immediate publish only needs the producer. Keep that path from paying
    // for scheduler/admin startup unless delayed delivery is actually used.
    this.#producerStartup ??= this.#producer.connect().then(() => {
      this.#producerStarted = true;
    });
    await this.#producerStartup;
  }

  /** Lazily connect the Kafka admin client used for topology creation. */
  async #ensureAdminStarted(): Promise<void> {
    this.#adminStartup ??= this.#admin.connect().then(() => {
      this.#adminStarted = true;
    });
    await this.#adminStartup;
  }

  /** Lazily start the durable scheduler path when subscribe or delay support needs it. */
  async #ensureSchedulerStarted(): Promise<void> {
    // Subscribe, delayed publish, and retry scheduling need the durable
    // topology plus the scheduler worker itself.
    this.#schedulerStartup ??= this.#startScheduler();
    await this.#schedulerStartup;
  }

  /** Start scheduler dependencies in the required order for delayed delivery. */
  async #startScheduler(): Promise<void> {
    await this.#ensureProducerStarted();
    const autoCreateTopology = this.#options.scheduler.autoCreateTopology ?? true;
    if (autoCreateTopology) {
      await this.#ensureTopologyCreated();
    }
    await this.#scheduler.start();
    this.#schedulerStarted = true;
  }

  /** Ensure the Kafka topics required by this transport exist once per process. */
  async #ensureTopologyCreated(): Promise<void> {
    const topics = topologyTopics(this.#options);
    const cacheKey = topologyCacheKey(topics);
    let startup = topologyCreation.get(cacheKey);
    if (!startup) {
      // Avoid a same-process topic creation stampede when multiple transport
      // instances share one topology.
      startup = this.#createTopology(topics);
      topologyCreation.set(cacheKey, startup);
    }
    try {
      await startup;
    } catch (error) {
      topologyCreation.delete(cacheKey);
      throw error;
    }
  }

  /** Create the configured transport topology through the Kafka admin API. */
  async #createTopology(topics: ReturnType<typeof topologyTopics>): Promise<void> {
    await this.#ensureAdminStarted();
    // Topic creation is idempotent from the transport's point of view; locked
    // down environments can disable this and provision topics externally.
    await this.#admin.createTopics({ topics });
  }

  /** Close every Kafka client owned by this transport instance. */
  public async close(): Promise<void> {
    // A transport owns all Kafka clients it creates. Close subscribers first so
    // no handler can race a producer/admin shutdown.
    for (const consumer of this.#consumers) {
      await consumer.disconnect();
    }
    this.#consumers.clear();
    if (this.#schedulerStarted) {
      await this.#scheduler.close();
    }
    if (this.#producerStarted) {
      await this.#producer.disconnect();
    }
    if (this.#adminStarted) {
      await this.#admin.disconnect();
    }
  }

  /** Publish one immediate or delayed CloudEvent through Kafka. */
  public async publish(request: PublishRequest): Promise<void> {
    await applyPubSubInterceptors(
      this.#options.interceptors,
      { operation: "publish", request },
      async (ctx) => {
        const req = (ctx as Extract<typeof ctx, { operation: "publish" }>).request;
        if (req.notBefore) {
          await this.#ensureSchedulerStarted();
          // Delayed publish is accepted only after the durable scheduler write.
          await this.#scheduler.publishLater(req);
          return;
        }

        await this.#ensureProducerStarted();
        await sendWithTimeout(
          this.#producer,
          {
            topic: req.topic,
            messages: [cloudEventMessage(req.event)],
          },
          this.#options.publishTimeoutMs,
        );
      },
    );
  }

  /** Start one Kafka subscription and return an unsubscribe handle. */
  public async subscribe(
    handler: DeliveryHandler,
    options?: SubscribeOptions,
  ): Promise<Subscription> {
    await this.#ensureSchedulerStarted();

    if (!this.#options.subscribeTopics?.length) {
      throw new Error("Kafka subscriber transport requires at least one subscribe topic");
    }

    // The core subscribe options stay portable. Kafka-specific consumer tuning
    // still comes from KafkaTransportOptions.consumerConfig.
    const consumer = this.#options.client.consumer(consumerConfig(this.#options, options));
    if (validMaxAttempts(options?.maxAttempts)) {
      consumerMaxAttempts.set(consumer, options.maxAttempts);
    }
    this.#consumers.add(consumer);
    await consumer.connect();

    const unsubscribe = async () => {
      if (!this.#consumers.delete(consumer)) {
        return;
      }
      consumerMaxAttempts.delete(consumer);
      await consumer.disconnect();
    };
    const abort = () => {
      // AbortSignal is a convenience for server lifecycle integration; explicit
      // unsubscribe remains the primary subscription handle.
      unsubscribe().catch(() => undefined);
    };

    if (options?.signal?.aborted) {
      await unsubscribe();
      return { unsubscribe };
    }
    options?.signal?.addEventListener("abort", abort, { once: true });

    for (const topic of this.#options.subscribeTopics) {
      await consumer.subscribe({ topic });
    }

    // Only pass partition concurrency when the caller asks for it. The
    // Confluent KafkaJS shim treats an explicit undefined as an invalid value.
    const runConfig: KafkaJS.ConsumerRunConfig = {
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) {
          return;
        }
        let event: CloudEvent;
        try {
          event = cloudEventFromBytes(message.value);
        } catch (error) {
          // Invalid bytes cannot be routed or dead-lettered as a CloudEvent.
          // Commit after reporting so one poison Kafka record cannot halt the group.
          await notifyInterceptors(this.#options.interceptors, {
            operation: "parseFailed",
            event: {
              id: keyString(message.key) ?? "",
              topic,
              error,
            },
          });
          await commitDelivery(consumer, { topic, partition, offset: message.offset });
          await notifyInterceptors(this.#options.interceptors, {
            operation: "committed",
            event: {
              id: keyString(message.key) ?? "",
              topic,
            },
          });
          return;
        }
        const attempt = numberHeader(message.headers, PROTOUTIL_HEADER_ATTEMPT) ?? 1;
        const delivery = { event, topic, attempt };
        const disposition = (await applyPubSubInterceptors(
          this.#options.interceptors,
          { operation: "handle", delivery },
          async (ctx) => {
            const d = (ctx as Extract<typeof ctx, { operation: "handle" }>).delivery;
            return handler(d);
          },
        )) as Disposition;
        await this.#settleDelivery(consumer, {
          topic,
          partition,
          offset: message.offset,
          attempt,
          disposition,
          event,
        });
      },
    };
    if (options?.concurrency !== undefined) {
      runConfig.partitionsConsumedConcurrently = options.concurrency;
    }
    await consumer.run(runConfig);
    // KafkaJS-style run() returns before the group has necessarily finished
    // joining and receiving assignments. Hold subscribe() open until the
    // consumer is actually ready to receive records for the subscribed topics.
    await waitForConsumerAssignment(consumer, options?.signal);

    return {
      unsubscribe: async () => {
        options?.signal?.removeEventListener("abort", abort);
        await unsubscribe();
      },
    };
  }

  /** Map one router disposition onto Kafka commit, retry, or dead-letter behavior. */
  async #settleDelivery(
    consumer: KafkaJS.Consumer,
    delivery: {
      topic: string;
      partition: number;
      offset: string;
      attempt: number;
      disposition: Disposition;
      event: CloudEvent;
    },
  ): Promise<void> {
    if (delivery.disposition.kind === "retry") {
      if (retryLimitReached(delivery.attempt, consumer)) {
        await notifyInterceptors(this.#options.interceptors, {
          operation: "retryExhausted",
          event: deliveryEvent(delivery),
        });
        await this.#publishDeadLetter({
          ...delivery,
          disposition: { kind: "dead_letter", error: delivery.disposition.error },
        });
        await commitDelivery(consumer, delivery);
        await notifyInterceptors(this.#options.interceptors, {
          operation: "committed",
          event: deliveryEvent(delivery),
        });
        return;
      }
      // Retry is durable: write the next attempt to the scheduler topic before
      // committing the consumed offset.
      await this.#scheduler.retryLater(
        delivery.topic,
        delivery.event,
        delivery.disposition.delay ? durationMs(delivery.disposition.delay) : 0,
        delivery.attempt + 1,
      );
      await commitDelivery(consumer, delivery);
      const event = deliveryEvent(delivery);
      await notifyInterceptors(this.#options.interceptors, {
        operation: "retried",
        event,
      });
      await notifyInterceptors(this.#options.interceptors, {
        operation: "committed",
        event,
      });
      return;
    }

    if (delivery.disposition.kind === "reject" || delivery.disposition.kind === "dead_letter") {
      // Reject and dead_letter share the same optional Kafka DLQ path. The
      // disposition header preserves which semantic action the handler chose.
      await this.#publishDeadLetter(delivery);
    }

    // ACK, reject without a DLQ, and successful DLQ publish all complete by
    // committing the next Kafka offset.
    await commitDelivery(consumer, delivery);
    await notifyInterceptors(this.#options.interceptors, {
      operation: "committed",
      event: deliveryEvent(delivery),
    });
  }

  /** Publish one delivery to the configured dead-letter topic when enabled. */
  async #publishDeadLetter(delivery: {
    topic: string;
    partition: number;
    offset: string;
    attempt: number;
    disposition: Disposition;
    event: CloudEvent;
  }): Promise<void> {
    if (!this.#options.deadLetterTopic) {
      return;
    }
    const message = cloudEventMessage(delivery.event);
    // The dead-letter payload is still the original CloudEvent. Kafka-specific
    // headers carry diagnostics for operators and replay tooling.
    await sendWithTimeout(
      this.#producer,
      {
        topic: this.#options.deadLetterTopic,
        messages: [
          {
            ...message,
            headers: {
              ...message.headers,
              [PROTOUTIL_HEADER_DISPOSITION]: delivery.disposition.kind,
              [PROTOUTIL_HEADER_ORIGINAL_TOPIC]: delivery.topic,
              [PROTOUTIL_HEADER_ORIGINAL_PARTITION]: String(delivery.partition),
              [PROTOUTIL_HEADER_ORIGINAL_OFFSET]: delivery.offset,
              [PROTOUTIL_HEADER_ATTEMPT]: String(delivery.attempt),
            },
          },
        ],
      },
      this.#options.publishTimeoutMs,
    );
    await notifyInterceptors(this.#options.interceptors, {
      operation: "deadLettered",
      event: deliveryEvent(delivery),
    });
  }
}

/** Build a stable cache key for a topic-creation request. */
function topologyCacheKey(topics: ReturnType<typeof topologyTopics>): string {
  return JSON.stringify(
    topics
      .map((topic) => ({
        topic: topic.topic,
        numPartitions: topic.numPartitions ?? null,
        replicationFactor: topic.replicationFactor ?? null,
        configEntries: (topic.configEntries ?? [])
          .map((entry) => ({ name: entry.name, value: entry.value }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => left.topic.localeCompare(right.topic)),
  );
}

/** Wait until a consumer has real assignments before reporting subscribe readiness. */
async function waitForConsumerAssignment(
  consumer: KafkaJS.Consumer,
  signal: AbortSignal | undefined,
): Promise<void> {
  const startedAt = Date.now();
  // consumer.run() returns before the group necessarily has assignments, so
  // keep subscribe() open until the consumer is actually ready to receive.
  while (consumer.assignment().length === 0) {
    if (signal?.aborted) {
      return;
    }
    if (Date.now() - startedAt > CONSUMER_ASSIGNMENT_TIMEOUT_MS) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Commit the next Kafka offset after a delivery has been fully settled. */
async function commitDelivery(
  consumer: KafkaJS.Consumer,
  delivery: { topic: string; partition: number; offset: string },
): Promise<void> {
  // Kafka commits the next offset, not the consumed offset.
  await consumer.commitOffsets([
    {
      topic: delivery.topic,
      partition: delivery.partition,
      offset: (BigInt(delivery.offset) + 1n).toString(),
    },
  ]);
}

/** Project delivery metadata into the small interceptor event shape. */
function deliveryEvent(delivery: {
  topic: string;
  partition: number;
  offset: string;
  attempt: number;
  event: CloudEvent;
}) {
  return {
    id: delivery.event.id,
    topic: delivery.topic,
    attempt: delivery.attempt,
  };
}

/** Check whether a retry disposition has reached the configured attempt limit. */
function retryLimitReached(attempt: number, consumer: KafkaJS.Consumer): boolean {
  const maxAttempts = consumerMaxAttempts.get(consumer);
  return retryLimitReachedWithMaxAttempts(attempt, maxAttempts);
}

/** Validate a positive integer retry-attempt limit from subscribe options. */
function validMaxAttempts(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

/** Merge portable subscribe options with Kafka-specific consumer defaults. */
function consumerConfig(
  transportOptions: KafkaTransportOptions,
  subscribeOptions: SubscribeOptions | undefined,
): KafkaJS.ConsumerConstructorConfig {
  const configuredKafkaJS = transportOptions.consumerConfig?.kafkaJS;
  // The portable consumerGroup option wins, then Kafka transport config, then a
  // library default for examples and tests.
  const groupId =
    subscribeOptions?.consumerGroup ?? configuredKafkaJS?.groupId ?? DEFAULT_CONSUMER_GROUP;
  return {
    ...transportOptions.consumerConfig,
    kafkaJS: {
      ...configuredKafkaJS,
      groupId,
      fromBeginning: configuredKafkaJS?.fromBeginning ?? false,
      autoCommit: configuredKafkaJS?.autoCommit ?? false,
    },
  };
}
