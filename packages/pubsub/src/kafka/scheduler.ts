import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { KafkaJS } from "@confluentinc/kafka-javascript";
import { cloudEventBytes, cloudEventFromBytes } from "../cloudevents.js";
import { AbortedPubSubError, InvalidArgumentPubSubError } from "../errors.js";
import type { CloudEvent } from "../gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  numberHeader,
  PROTOUTIL_HEADER_ATTEMPT,
  PROTOUTIL_HEADER_DELIVERED_AT,
  PROTOUTIL_HEADER_KIND,
  PROTOUTIL_HEADER_NOT_BEFORE,
  PROTOUTIL_HEADER_SCHEDULE_VERSION,
  PROTOUTIL_HEADER_TARGET_KEY,
  PROTOUTIL_HEADER_TARGET_TOPIC,
  stringHeader,
} from "../headers.js";
import { notifyInterceptors } from "../interceptors.js";
import { DEFAULT_SCHEDULER_RETRY_DELAY_MS, onAbortOnce } from "../transport-utils.js";
import type { PublishRequest, PubSubInterceptor, PubSubScheduler } from "../types.js";
import { cloudEventMessage } from "./cloud-event.js";
import {
  SCHEDULE_KIND_HISTORY,
  SCHEDULE_KIND_RETRY,
  SCHEDULE_KIND_SCHEDULE,
  SCHEDULE_RECORD_VERSION,
} from "./headers.js";
import { sendBatchWithTimeout, sendWithTimeout } from "./producer.js";
import { schedulerTopics } from "./topology.js";
import type { KafkaSchedulerOptions } from "./types.js";
import { keyString } from "./utils.js";

interface KafkaScheduleRecord {
  id: string;
  partition: number;
  topic: string;
  notBefore: string;
  attempt: number;
  event: Buffer;
}

interface KafkaSchedulerDependencies {
  client: KafkaJS.Kafka;
  producer: KafkaJS.Producer;
  options: KafkaSchedulerOptions;
  consumerGroup: string;
  publishTimeoutMs?: number;
  interceptors?: PubSubInterceptor[];
}

export interface CreateKafkaSchedulerOptions {
  client: KafkaJS.Kafka;
  options: KafkaSchedulerOptions;
  producerConfig?: KafkaJS.ProducerConstructorConfig;
  adminConfig?: KafkaJS.AdminConstructorConfig;
  publishTimeoutMs?: number;
  interceptors?: PubSubInterceptor[];
  /** Optional signal that closes this scheduler when aborted. */
  signal?: AbortSignal;
}

/** Create a self-contained Kafka scheduler that can be shared across transports. */
export function createKafkaScheduler(options: CreateKafkaSchedulerOptions): PubSubScheduler {
  return new OwnedKafkaScheduler(options);
}

class OwnedKafkaScheduler implements PubSubScheduler {
  readonly #producer: KafkaJS.Producer;
  readonly #admin: KafkaJS.Admin;
  readonly #scheduler: KafkaScheduler;
  #producerStarted = false;
  #adminStarted = false;
  #schedulerStarted = false;
  #startup?: Promise<void>;
  #aborted = false;
  readonly #removeAbortListener: () => void;

  public constructor(private readonly options: CreateKafkaSchedulerOptions) {
    this.#producer = options.client.producer(options.producerConfig);
    this.#admin = options.client.admin(options.adminConfig);
    this.#scheduler = new KafkaScheduler({
      client: options.client,
      producer: this.#producer,
      options: options.options,
      consumerGroup:
        options.options.consumerGroup ??
        `protoutil.pubsub.scheduler.${options.options.schedulesTopic}`,
      publishTimeoutMs: options.publishTimeoutMs,
      interceptors: options.interceptors,
    });
    this.#removeAbortListener = onAbortOnce(options.signal, () => {
      this.#aborted = true;
      void this.close();
    });
  }

  #assertNotAborted(): void {
    if (this.#aborted) {
      throw new AbortedPubSubError("Kafka scheduler has been aborted");
    }
  }

  public async start(): Promise<void> {
    this.#assertNotAborted();
    this.#startup ??= this.#startOnce();
    await this.#startup;
  }

  async #startOnce(): Promise<void> {
    await this.#producer.connect();
    this.#producerStarted = true;
    if (this.options.options.autoCreateTopology ?? true) {
      await this.#admin.connect();
      this.#adminStarted = true;
      await this.#admin.createTopics({ topics: schedulerTopics(this.options.options) });
    }
    await this.#scheduler.start();
    this.#schedulerStarted = true;
  }

  public async close(): Promise<void> {
    this.#removeAbortListener();
    if (this.#schedulerStarted) {
      await this.#scheduler.close();
    }
    if (this.#producerStarted) {
      await this.#producer.disconnect();
    }
    if (this.#adminStarted) {
      await this.#admin.disconnect();
    }
    this.#startup = undefined;
    this.#schedulerStarted = false;
    this.#producerStarted = false;
    this.#adminStarted = false;
  }

  public async publishLater(request: PublishRequest): Promise<void> {
    this.#assertNotAborted();
    await this.start();
    await this.#scheduler.publishLater(request);
  }

  public async retryLater(
    topic: string,
    event: CloudEvent,
    delayMs: number,
    attempt: number,
  ): Promise<void> {
    this.#assertNotAborted();
    await this.start();
    await this.#scheduler.retryLater(topic, event, delayMs, attempt);
  }
}

/** Durable Kafka scheduler for `notBefore` and retry delay delivery. */
export class KafkaScheduler implements PubSubScheduler {
  readonly #producer: KafkaJS.Producer;
  readonly #consumer: KafkaJS.Consumer;
  readonly #client: KafkaJS.Kafka;
  readonly #options: KafkaSchedulerOptions;
  readonly #publishTimeoutMs?: number;
  readonly #interceptors?: PubSubInterceptor[];
  readonly #records = new Map<string, KafkaScheduleRecord>();
  readonly #queue = new ScheduleQueue();
  #timer?: NodeJS.Timeout;
  #recovering = true;
  #recoveryReady?: Promise<void>;
  #resolveRecoveryReady?: () => void;
  #recoveryOffsets = new Map<number, number>();

  /** Create a durable scheduler backed by compacted Kafka topics. */
  public constructor(dependencies: KafkaSchedulerDependencies) {
    this.#client = dependencies.client;
    this.#producer = dependencies.producer;
    this.#options = dependencies.options;
    this.#publishTimeoutMs = dependencies.publishTimeoutMs;
    this.#interceptors = dependencies.interceptors;
    this.#consumer = dependencies.client.consumer({
      kafkaJS: {
        groupId: dependencies.consumerGroup,
        fromBeginning: true,
        autoCommit: false,
      },
    });
  }

  /** Start consuming durable schedule records. */
  public async start(): Promise<void> {
    await this.#beginRecovery();
    await this.#consumer.connect();
    await this.#consumer.subscribe({ topic: this.#options.schedulesTopic });
    await this.#consumer.run({
      eachMessage: async ({ message, partition }) => {
        if (!message.value) {
          // Tombstones are the durable cancellation signal in the compacted
          // schedule topic.
          this.#cancelSchedule(message.key);
          this.#markRecovered(partition, message.offset);
          return;
        }
        try {
          // Replaying from the beginning rebuilds in-process timers after a
          // restart using only Kafka state.
          const record = parseScheduleRecord(message, partition);
          this.#schedule(record);
          await notifyInterceptors(this.#interceptors, {
            operation: "recovered",
            event: { id: record.id, topic: record.topic },
          });
        } catch (error) {
          await notifyInterceptors(this.#interceptors, {
            operation: "parseFailed",
            event: {
              id: keyString(message.key) ?? "",
              topic: this.#options.schedulesTopic,
              error,
            },
          });
        } finally {
          this.#markRecovered(partition, message.offset);
        }
      },
    });
    await this.#recoveryReady;
  }

  /** Stop the scheduler consumer and clear in-process timers. */
  public async close(): Promise<void> {
    this.#clearTimer();
    this.#records.clear();
    this.#queue.clear();
    await this.#consumer.disconnect();
  }

  /** Persist and schedule a delayed publish request. */
  public async publishLater(request: PublishRequest): Promise<void> {
    const record = scheduleRecord(request);
    // The caller only gets success after Kafka has accepted the durable schedule.
    await this.#writeSchedule(record, SCHEDULE_KIND_SCHEDULE);
    await notifyInterceptors(this.#interceptors, {
      operation: "scheduled",
      event: { id: record.id, topic: record.topic },
    });
  }

  /** Persist and schedule a retry for an already delivered CloudEvent. */
  public async retryLater(
    topic: string,
    event: CloudEvent,
    delayMs: number,
    attempt: number,
  ): Promise<void> {
    const record = scheduleRecord({
      topic,
      event,
      notBefore: timestampFromDate(new Date(Date.now() + delayMs)),
    });
    // Retries preserve the original CloudEvent and only advance delivery state.
    record.attempt = attempt;
    await this.#writeSchedule(record, SCHEDULE_KIND_RETRY);
    await notifyInterceptors(this.#interceptors, {
      operation: "scheduled",
      event: { id: record.id, topic: record.topic },
    });
  }

  /** Persist one schedule record to the compacted schedules topic. */
  async #writeSchedule(
    record: KafkaScheduleRecord,
    kind: typeof SCHEDULE_KIND_SCHEDULE | typeof SCHEDULE_KIND_RETRY,
  ): Promise<void> {
    // The schedule key is the CloudEvent id. In a compacted topic, a later
    // record for the same id replaces the active schedule deterministically.
    await sendWithTimeout(
      this.#producer,
      {
        topic: this.#options.schedulesTopic,
        messages: [
          {
            key: record.id,
            value: record.event,
            headers: {
              [PROTOUTIL_HEADER_KIND]: kind,
              [PROTOUTIL_HEADER_SCHEDULE_VERSION]: SCHEDULE_RECORD_VERSION,
              [PROTOUTIL_HEADER_NOT_BEFORE]: record.notBefore,
              [PROTOUTIL_HEADER_TARGET_TOPIC]: record.topic,
              [PROTOUTIL_HEADER_TARGET_KEY]: record.id,
              [PROTOUTIL_HEADER_ATTEMPT]: String(record.attempt),
            },
          },
        ],
      },
      this.#publishTimeoutMs,
    );
  }

  /** Track or replace an active schedule record in the in-memory index and heap. */
  #schedule(record: KafkaScheduleRecord): void {
    this.#records.set(record.id, record);
    // Replacements append a new heap entry. Stale entries are discarded lazily
    // so tombstone replay and schedule replacement do not need heap mutation.
    this.#queue.push(record);
    if (this.#recovering) {
      return;
    }
    this.#armNextTimer();
  }

  /** Remove an active schedule record after reading a compacted-topic tombstone. */
  #cancelSchedule(key: Buffer | null | string | undefined): void {
    if (!key) {
      return;
    }
    const id = Buffer.isBuffer(key) ? key.toString("utf8") : key;
    // The heap may still contain stale entries; deleting from #records is enough
    // because ScheduleQueue validates entries against #records before use.
    this.#records.delete(id);
    if (this.#recovering) {
      return;
    }
    this.#armNextTimer();
  }

  /** Initialize recovery state from the current end offsets of the schedules topic. */
  async #beginRecovery(): Promise<void> {
    this.#resetRecoveryState();
    const admin = this.#client.admin();
    await admin.connect();
    try {
      // Capture log-end offsets before replay begins. Recovery is complete only
      // after this consumer has seen every record that existed at startup.
      const offsets = await admin.fetchTopicOffsets(this.#options.schedulesTopic);
      for (const offset of offsets) {
        const high = Number(offset.high);
        if (!Number.isInteger(high) || high <= 0) {
          continue;
        }
        // fetchTopicOffsets().high is the next offset after the current log end.
        // We only need to replay through the last existing record.
        this.#recoveryOffsets.set(offset.partition, high - 1);
      }
    } finally {
      await admin.disconnect();
    }
    if (this.#recoveryOffsets.size === 0) {
      this.#finishRecovery();
    }
  }

  /** Reset internal replay bookkeeping before a fresh recovery pass begins. */
  #resetRecoveryState(): void {
    this.#recovering = true;
    this.#recoveryOffsets.clear();
    this.#recoveryReady = new Promise((resolve) => {
      this.#resolveRecoveryReady = resolve;
    });
  }

  /** Mark one partition as recovered once replay reaches its startup end offset. */
  #markRecovered(partition: number, offset: string): void {
    if (!this.#recovering) {
      return;
    }
    const target = this.#recoveryOffsets.get(partition);
    if (target === undefined) {
      return;
    }
    const current = Number(offset);
    if (!Number.isInteger(current) || current < target) {
      return;
    }
    this.#recoveryOffsets.delete(partition);
    if (this.#recoveryOffsets.size === 0) {
      this.#finishRecovery();
    }
  }

  /** End recovery mode and arm the first live delivery timer. */
  #finishRecovery(): void {
    if (!this.#recovering) {
      return;
    }
    // Only arm timers after replay has rebuilt the heap from durable state.
    this.#recovering = false;
    this.#resolveRecoveryReady?.();
    this.#resolveRecoveryReady = undefined;
    this.#armNextTimer();
  }

  /** Arm one timer for the next due schedule record, if any remain queued. */
  #armNextTimer(): void {
    this.#clearTimer();
    const next = this.#nextRecord();
    if (!next) {
      return;
    }
    const delay = Math.max(0, Date.parse(next.notBefore) - Date.now());
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      // One active timer wakes a bounded batch. Large queues stay cheap because
      // the heap already knows the next due schedule.
      const due = this.#dueRecords(this.#options.deliveryConcurrency ?? 16);
      if (due.length) {
        this.#deliverDueBatch(due).catch(() => undefined);
      }
      if (!due.length) {
        this.#armNextTimer();
      }
    }, delay);
  }

  /** Clear the currently armed due-record timer, if one exists. */
  #clearTimer(): void {
    if (!this.#timer) {
      return;
    }
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /** Return the next active schedule record according to the min-heap. */
  #nextRecord(): KafkaScheduleRecord | undefined {
    return this.#queue.peek(this.#records);
  }

  /** Pop up to `limit` active records that are already due for delivery. */
  #dueRecords(limit: number): KafkaScheduleRecord[] {
    return this.#queue.popDue(this.#records, Date.now(), limit);
  }

  /** Filter due records by current partition ownership before attempting delivery. */
  async #deliverDueBatch(records: KafkaScheduleRecord[]): Promise<void> {
    const owned: KafkaScheduleRecord[] = [];
    for (const record of records) {
      if (!this.#ownsPartition(record.partition)) {
        // A rebalance may revoke the partition after this process armed a timer.
        // Drop local state and let the new owner recover from the compacted log.
        this.#records.delete(record.id);
        continue;
      }
      this.#records.delete(record.id);
      owned.push(record);
    }
    if (!owned.length) {
      this.#armNextTimer();
      return;
    }
    try {
      await this.#deliverBatch(owned);
    } catch (error) {
      for (const record of owned) {
        // Re-enqueue locally so transient broker errors do not lose due records
        // while the compacted log remains the durable source of truth.
        this.#records.set(record.id, record);
        record.notBefore = new Date(
          Date.now() + (this.#options.deliveryRetryDelayMs ?? DEFAULT_SCHEDULER_RETRY_DELAY_MS),
        ).toISOString();
        this.#queue.push(record);
        await notifyInterceptors(this.#interceptors, {
          operation: "deliveryFailed",
          event: { id: record.id, topic: record.topic, error },
        });
      }
      this.#armNextTimer();
      throw error;
    }
  }

  /** Publish due records, append history, and tombstone the active schedules. */
  async #deliverBatch(records: KafkaScheduleRecord[]): Promise<void> {
    const deliveredAt = new Date().toISOString();
    const targetMessages = topicMessagesByTopic(records, (record) =>
      cloudEventMessage(cloudEventFromBytes(record.event), {
        [PROTOUTIL_HEADER_ATTEMPT]: String(record.attempt),
      }),
    );
    // The target topics receive the original CloudEvents first. Later history
    // and tombstone writes can still be replayed if a crash lands between steps.
    await sendBatchWithTimeout(
      this.#producer,
      { topicMessages: targetMessages },
      this.#publishTimeoutMs,
    );
    for (const record of records) {
      await notifyInterceptors(this.#interceptors, {
        operation: "delivered",
        event: { id: record.id, topic: record.topic, attempt: record.attempt },
      });
    }
    // History is append-only operational evidence that schedules fired. Batch
    // it so one timer wake can flush many due deliveries together.
    await sendBatchWithTimeout(
      this.#producer,
      {
        topicMessages: [
          {
            topic: this.#options.historyTopic,
            messages: records.map((record) => ({
              key: record.id,
              value: record.event,
              headers: {
                [PROTOUTIL_HEADER_KIND]: SCHEDULE_KIND_HISTORY,
                [PROTOUTIL_HEADER_SCHEDULE_VERSION]: SCHEDULE_RECORD_VERSION,
                [PROTOUTIL_HEADER_NOT_BEFORE]: record.notBefore,
                [PROTOUTIL_HEADER_TARGET_TOPIC]: record.topic,
                [PROTOUTIL_HEADER_TARGET_KEY]: record.id,
                [PROTOUTIL_HEADER_DELIVERED_AT]: deliveredAt,
              },
            })),
          },
        ],
      },
      this.#publishTimeoutMs,
    );
    await sendBatchWithTimeout(
      this.#producer,
      {
        topicMessages: [
          {
            topic: this.#options.schedulesTopic,
            messages: records.map((record) => ({ key: record.id, value: null })),
          },
        ],
      },
      this.#publishTimeoutMs,
    );
    // Tombstone after target publish. A crash between those two writes may
    // duplicate delivery after restart, so scheduler delivery is at-least-once.
    for (const record of records) {
      await notifyInterceptors(this.#interceptors, {
        operation: "tombstoned",
        event: { id: record.id, topic: this.#options.schedulesTopic },
      });
    }
    this.#armNextTimer();
  }

  /** Report whether this scheduler instance still owns a schedules partition. */
  #ownsPartition(partition: number): boolean {
    // Partition ownership is the guard against duplicate scheduled delivery
    // across multiple scheduler workers in the same group.
    return this.#consumer
      .assignment()
      .some(
        (assignment) =>
          assignment.topic === this.#options.schedulesTopic && assignment.partition === partition,
      );
  }
}

class ScheduleQueue {
  readonly #entries: ScheduleQueueEntry[] = [];

  /** Insert one record into the due-time min-heap. */
  push(record: KafkaScheduleRecord): void {
    // The heap stores only due-time ordering. The current schedule record lives
    // in #records so replacements can invalidate old heap entries lazily.
    this.#entries.push({ id: record.id, notBeforeMs: Date.parse(record.notBefore) });
    this.#bubbleUp(this.#entries.length - 1);
  }

  /** Remove all queued entries. */
  clear(): void {
    this.#entries.length = 0;
  }

  /** Peek the next active record after discarding stale heap entries. */
  peek(records: Map<string, KafkaScheduleRecord>): KafkaScheduleRecord | undefined {
    this.#discardStale(records);
    const entry = this.#entries[0];
    return entry ? records.get(entry.id) : undefined;
  }

  /** Pop up to `limit` active records whose due time is no later than `nowMs`. */
  popDue(
    records: Map<string, KafkaScheduleRecord>,
    nowMs: number,
    limit: number,
  ): KafkaScheduleRecord[] {
    const due: KafkaScheduleRecord[] = [];
    while (due.length < limit) {
      this.#discardStale(records);
      const entry = this.#entries[0];
      if (!entry || entry.notBeforeMs > nowMs) {
        return due;
      }
      this.#pop();
      const record = records.get(entry.id);
      if (record) {
        records.delete(entry.id);
        due.push(record);
      }
    }
    return due;
  }

  /** Drop heap entries that no longer match the active record map. */
  #discardStale(records: Map<string, KafkaScheduleRecord>): void {
    while (true) {
      const entry = this.#entries[0];
      if (!entry) {
        return;
      }
      const record = records.get(entry.id);
      // Replacement and retry backoff create newer heap entries for the same id.
      // Only the entry matching the current record timestamp is still active.
      if (record && Date.parse(record.notBefore) === entry.notBeforeMs) {
        return;
      }
      this.#pop();
    }
  }

  /** Remove and return the root heap entry. */
  #pop(): ScheduleQueueEntry | undefined {
    const first = this.#entries[0];
    const last = this.#entries.pop();
    if (last && this.#entries.length) {
      this.#entries[0] = last;
      this.#bubbleDown(0);
    }
    return first;
  }

  /** Move a newly inserted entry upward until heap order is restored. */
  #bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (!this.#less(current, parent)) {
        return;
      }
      this.#swap(current, parent);
      current = parent;
    }
  }

  /** Move the root entry downward until heap order is restored. */
  #bubbleDown(index: number): void {
    let current = index;
    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;
      let smallest = current;
      if (left < this.#entries.length && this.#less(left, smallest)) {
        smallest = left;
      }
      if (right < this.#entries.length && this.#less(right, smallest)) {
        smallest = right;
      }
      if (smallest === current) {
        return;
      }
      this.#swap(current, smallest);
      current = smallest;
    }
  }

  /** Compare two heap positions by due time, then by id for stable ordering. */
  #less(left: number, right: number): boolean {
    const leftEntry = this.#entries[left];
    const rightEntry = this.#entries[right];
    if (!leftEntry || !rightEntry) {
      return false;
    }
    return (
      leftEntry.notBeforeMs < rightEntry.notBeforeMs ||
      (leftEntry.notBeforeMs === rightEntry.notBeforeMs && leftEntry.id < rightEntry.id)
    );
  }

  /** Swap two heap positions. */
  #swap(left: number, right: number): void {
    const leftEntry = this.#entries[left];
    const rightEntry = this.#entries[right];
    if (!leftEntry || !rightEntry) {
      return;
    }
    this.#entries[left] = rightEntry;
    this.#entries[right] = leftEntry;
  }
}

interface ScheduleQueueEntry {
  id: string;
  notBeforeMs: number;
}

/** Group Kafka messages by target topic so one batch send can publish many records. */
function topicMessagesByTopic(
  records: KafkaScheduleRecord[],
  createMessage: (record: KafkaScheduleRecord) => KafkaJS.Message,
): KafkaJS.TopicMessages[] {
  const byTopic = new Map<string, KafkaJS.Message[]>();
  for (const record of records) {
    const messages = byTopic.get(record.topic);
    const message = createMessage(record);
    if (messages) {
      messages.push(message);
      continue;
    }
    byTopic.set(record.topic, [message]);
  }
  return Array.from(byTopic, ([topic, messages]) => ({ topic, messages }));
}

/** Convert a delayed publish request into one durable scheduler record. */
function scheduleRecord(request: PublishRequest): KafkaScheduleRecord {
  if (!request.notBefore) {
    throw new InvalidArgumentPubSubError("scheduleRecord requires notBefore");
  }
  // The CloudEvent id becomes the compacted schedule key so later writes for
  // the same event replace earlier schedule state deterministically.
  return {
    id: request.event.id,
    partition: -1,
    topic: request.topic,
    notBefore: timestampDate(request.notBefore).toISOString(),
    attempt: 1,
    event: cloudEventBytes(request.event),
  };
}

/** Parse one Kafka schedule record back into the scheduler's internal shape. */
function parseScheduleRecord(
  message: KafkaJS.KafkaMessage,
  partition: number,
): KafkaScheduleRecord {
  if (!message.key || !message.value) {
    throw new InvalidArgumentPubSubError("invalid Kafka schedule record");
  }
  // Schedule metadata lives in Kafka headers so the CloudEvent protobuf bytes
  // remain the transport-neutral envelope and payload.
  const id = keyString(message.key);
  const version =
    stringHeader(message.headers, PROTOUTIL_HEADER_SCHEDULE_VERSION) ?? SCHEDULE_RECORD_VERSION;
  const topic = stringHeader(message.headers, PROTOUTIL_HEADER_TARGET_TOPIC);
  const notBefore = stringHeader(message.headers, PROTOUTIL_HEADER_NOT_BEFORE);
  const attempt = numberHeader(message.headers, PROTOUTIL_HEADER_ATTEMPT) ?? 1;
  // Transport-neutral CloudEvent bytes stay in the record body while Kafka-
  // specific scheduling data lives in headers.
  if (version !== SCHEDULE_RECORD_VERSION || !id || !topic || !notBefore) {
    throw new InvalidArgumentPubSubError("invalid Kafka schedule record");
  }
  return {
    id,
    partition,
    topic,
    notBefore,
    attempt,
    event: Buffer.from(message.value),
  };
}
