# @protoutil/pubsub Kafka Transport

Kafka transport entry point for `@protoutil/pubsub`.

```sh
npm install @protoutil/pubsub @confluentinc/kafka-javascript
```

`@confluentinc/kafka-javascript` is an optional peer dependency. The core package does not import it directly; the Kafka entry point uses the real Confluent client when the application imports `@protoutil/pubsub/kafka`.

```ts
import { KafkaJS } from "@confluentinc/kafka-javascript";
import { createKafkaTransport } from "@protoutil/pubsub/kafka";
import { createPublisher, createRouter } from "@protoutil/pubsub";

const kafka = new KafkaJS.Kafka({
  "bootstrap.servers": "localhost:9092",
});

const transport = createKafkaTransport({
  client: kafka,
  subscribeTopics: ["BillingEvents"],
  scheduler: {
    schedulesTopic: "protoutil.pubsub.schedules",
    historyTopic: "protoutil.pubsub.schedule_history",
    consumerGroup: "protoutil.pubsub.scheduler",
    historyRetentionMs: 604_800_000,
    deliveryConcurrency: 16,
    deliveryRetryDelayMs: 1_000,
  },
  publishTimeoutMs: 10_000,
  defaultSource: "billing-service",
});

const publisher = createPublisher(BillingEvents, transport, {
  source: "billing-service",
});
const router = createRouter(transport);

router.service(BillingEvents, {
  async invoiceCreated(request, ctx) {
    await processInvoice(request.invoiceId);
    await ctx.ack();
  },
});

const subscription = await router.subscribe({
  consumerGroup: "billing-workers",
  concurrency: 10,
});

await publisher.invoiceCreated({
  invoiceId: "inv_123",
  customerId: "cus_456",
});

await subscription.unsubscribe();
await transport.close();
```

Application event code stays transport-neutral. Switching from Kafka to another backer should only change the transport construction.

The transport connects and creates its scheduler topology lazily on first publish or subscribe.

## Lifecycle

`router.subscribe()` returns a subscription handle. Call `subscription.unsubscribe()` when that subscriber should stop receiving messages.

`transport.close()` closes the backing Kafka admin, producer, scheduler consumer, and active subscriber consumers. Call it from application shutdown hooks when the process is exiting or when the whole transport is no longer needed.

Use both methods at their own scopes:

- `subscription.unsubscribe()` stops one router subscription.
- `transport.close()` closes the Kafka clients owned by the transport.

## Scheduling Topology

Kafka has no native durable `notBefore` or retry-delay primitive, so the transport owns a scheduler topic pattern:

- `schedulesTopic` stores durable schedule state keyed by CloudEvent id.
- `historyTopic` is append-only history for future scheduler auditing and handoff records.
- `consumerGroup` identifies scheduler workers that coordinate ownership of schedule partitions.
- `historyRetentionMs` configures retention for the scheduler history topic.
- `deliveryConcurrency` bounds how many due schedules a scheduler worker tries to deliver at once.
- `deliveryRetryDelayMs` controls in-process backoff after a scheduler delivery failure.
- The schedules topic must have `cleanup.policy=compact`.
- The schedules topic must have `retention.ms=-1`.

The transport creates this topology by default before the first publish or subscribe. If the application disables auto-creation, the same configs still have to exist before delayed publish can be considered durable.

For production, provision the scheduler topics deliberately:

- use enough partitions for the expected scheduled-event volume
- set the schedules topic `cleanup.policy=compact`
- set the schedules topic `retention.ms=-1`
- set a replication factor appropriate for the cluster
- set `historyRetentionMs` or an equivalent broker-level retention on the history topic

Delayed events are stored as Kafka messages where the value is the serialized
[`io.cloudevents.v1.CloudEvent`](https://github.com/cloudevents/spec/blob/main/cloudevents/formats/protobuf-format.md)
protobuf bytes and the scheduler metadata lives in headers:

- CloudEvent id
- scheduler record version
- target delivery topic
- RFC 3339 `notBefore`
- one-based delivery attempt count

On startup, the scheduler reads the compacted schedules topic from the beginning
and rebuilds timers from the persisted headers and CloudEvent value. Tombstone
messages cancel pending timers, so delivered schedules are removed from active
state after the target event is produced.

Scheduled delivery is durable and at least once. A crash near the delivery
boundary can duplicate a delivery, so handlers should be idempotent.

The public event envelope remains [CloudEvents 1.0](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md). The scheduler record is Kafka transport state, not a replacement event envelope.

## Dispositions

Kafka subscriber consumers default to manual offset commits. The transport commits an offset only after the handler disposition has been handled:

- `ack` commits the consumed offset.
- `retry` persists a durable retry schedule, then commits the consumed offset.
- `reject` and `dead_letter` publish to `deadLetterTopic` when configured, then commit the consumed offset.

If `deadLetterTopic` is not configured, `reject` and `dead_letter` are committed without a secondary publish.

Dead-letter Kafka messages keep the original CloudEvent payload and include Kafka headers for the disposition, original topic, original partition, and original offset. Those headers are transport diagnostics; application handlers should continue to use CloudEvent data and extensions.

Malformed subscribed Kafka records that cannot be decoded as `io.cloudevents.v1.CloudEvent` are reported through `observer.parseFailed()` and committed so one poison record cannot pin the consumer group forever.

Retry attempts are tracked in Kafka transport headers and passed to handlers as `ctx.attempt`. The first delivery is attempt `1`; each durable retry increments the value before redelivery.

When `router.subscribe({ maxAttempts })` is set and a handler retries on the final allowed attempt, Kafka publishes the original CloudEvent to `deadLetterTopic` when configured, emits `observer.retryExhausted()`, commits the consumed offset, and does not create another retry schedule.

## Observability

Use `observer` hooks for transport-local diagnostics without changing the transport-neutral application API:

```ts
const transport = createKafkaTransport({
  client: kafka,
  subscribeTopics: ["BillingEvents"],
  deadLetterTopic: "protoutil.pubsub.dead_letter",
  scheduler: {
    schedulesTopic: "protoutil.pubsub.schedules",
    historyTopic: "protoutil.pubsub.schedule_history",
  },
  observer: {
    scheduled(event) {
      logger.info(event, "scheduled pubsub event");
    },
    delivered(event) {
      logger.info(event, "delivered scheduled pubsub event");
    },
    retried(event) {
      logger.info(event, "scheduled retry for pubsub event");
    },
    retryExhausted(event) {
      logger.warn(event, "pubsub retry attempts exhausted");
    },
    deadLettered(event) {
      logger.warn(event, "published pubsub event to dead letter topic");
    },
    deliveryFailed(event) {
      logger.error(event, "failed to deliver scheduled pubsub event");
    },
    parseFailed(event) {
      logger.error(event, "failed to parse Kafka pubsub record");
    },
  },
});
```

## What Is Implemented

The current Kafka transport supports:

- lazy setup and explicit teardown for real Confluent admin, producer, and consumer clients
- scheduler topic creation with the required compacted/unlimited-retention config
- immediate CloudEvent publish to the resolved Kafka topic
- durable `notBefore` schedule publish to the compacted schedules topic and delivery no earlier than `notBefore`
- durable retry scheduling from `ctx.retry({ delay })` and redelivery no earlier than the requested delay
- retry attempt tracking through transport headers and `ctx.attempt`
- portable `router.subscribe({ maxAttempts })` enforcement for retry exhaustion
- versioned scheduler records in Kafka headers
- `router.subscribe({ concurrency })` mapped to Kafka partition concurrency when provided
- scheduled publish recovery after transport restart
- schedule replacement by CloudEvent id
- tombstone replay preventing delivered schedules from redelivering after restart
- multiple scheduler workers using a shared scheduler consumer group
- manual offset commits after dispositions are handled
- optional dead-letter topic publishing for `reject` and `dead_letter`
- dead-letter diagnostic headers for original topic, partition, offset, and disposition
- poison-record parse failure reporting and offset commits
- observer hooks for scheduled, retried, recovered, delivered, tombstoned, dead-lettered, failed, parse-failed, and committed events
- observer hooks are best-effort and cannot change delivery outcomes
- subscriber consumption of CloudEvent protobuf records from configured topics
- `subscription.unsubscribe()` to stop one subscriber without replacing the transport

The Docker-backed test suite starts a real Kafka broker with Docker Compose and verifies public pubsub behavior against Kafka itself:

- publish and consume through `createPublisher()` and `createRouter()`
- `subscription.unsubscribe()` stops later deliveries
- `notBefore` does not deliver early
- scheduled publishes recover after transport restart
- duplicate schedule ids use the latest schedule
- tombstoned schedules do not redeliver after restart
- multiple scheduler instances do not duplicate scheduled delivery
- dead-letter dispositions publish to a configured dead-letter topic
- `ctx.retry({ delay })` does not redeliver early
- `maxAttempts` sends exhausted retries to dead-letter instead of scheduling again
- observer hook failures do not break scheduled delivery

## Load Test

Run the opt-in load test locally with:

```sh
pnpm moon run pubsub:load-test
```

The load test is not a dependency of build, test, or conformance. It runs the shared pubsub load scenario through the Kafka transport adapter.

Configure the run with environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PUBSUB_LOAD_EVENT_COUNT` | `1000` | Number of delayed events to publish and consume. |
| `PUBSUB_LOAD_NOT_BEFORE_MS` | `1000` | Delay before scheduled delivery. |
| `PUBSUB_LOAD_PUBLISH_CONCURRENCY` | `50` | Concurrent publish calls. |
| `PUBSUB_LOAD_SUBSCRIBE_CONCURRENCY` | `32` | Requested subscriber concurrency. |
| `PUBSUB_LOAD_TIMEOUT_MS` | `max(60000, eventCount * 25)` | Timeout for the delivery assertion. |
| `PUBSUB_LOAD_TEST_TIMEOUT_MS` | `120000` | Vitest timeout for the load-test file. |

Example heavier local run:

```sh
PUBSUB_LOAD_EVENT_COUNT=10000 PUBSUB_LOAD_TIMEOUT_MS=300000 pnpm moon run pubsub:load-test
```

Local Docker is useful for catching obvious scheduler, memory, and broker-pressure issues. Before relying on a new deployment shape, run the same task against broker resources that look like production.

## Benchmark

Run the opt-in benchmark locally with:

```sh
pnpm moon run pubsub:benchmark
```

The benchmark is not a dependency of build, test, conformance, or the load test. It runs shared transport-neutral benchmark scenarios through the Kafka adapter so later RabbitMQ and NATS adapters can publish comparable results. Each scenario is measured on both a cold path and a warmed-up path.

Benchmark output is printed as a Markdown table and written to the package-level [BENCHMARK.md](../../BENCHMARK.md):

```md
| Transport | Scenario | Mode | Messages | Publish Concurrency | Subscribe Concurrency | Duration ms | Msg/s | p50 ms | p95 ms | p99 ms | Duplicates |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| kafka | immediate publish/consume | cold start | 1000 | 50 | 32 | 3319 | 301.21 | 3089.44 | 3209.61 | 3222.48 | 0 |
| kafka | immediate publish/consume | warmed up | 1000 | 50 | 32 | 412 | 2427.18 | 14.82 | 21.45 | 26.90 | 0 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 615 | 1626.02 | 29.10 | 41.55 | 48.20 | 0 |
```

Configure the run with environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PUBSUB_BENCHMARK_EVENT_COUNT` | `1000` | Number of events per benchmark scenario. |
| `PUBSUB_BENCHMARK_PUBLISH_CONCURRENCY` | `50` | Concurrent publish calls. |
| `PUBSUB_BENCHMARK_SUBSCRIBE_CONCURRENCY` | `32` | Requested subscriber concurrency. |
| `PUBSUB_BENCHMARK_NOT_BEFORE_MS` | `1000` | Delay before scheduled delivery in the scheduled scenario. |
| `PUBSUB_BENCHMARK_SCHEDULER_ONLY_NOT_BEFORE_MS` | `0` | Delay before scheduled delivery in the scheduler-only scenario. |
| `PUBSUB_BENCHMARK_TIMEOUT_MS` | `120000` | Per-scenario delivery timeout. |
| `PUBSUB_BENCHMARK_TEST_TIMEOUT_MS` | `300000` | Vitest timeout for the benchmark file. |

Example shorter smoke run:

```sh
PUBSUB_BENCHMARK_EVENT_COUNT=100 pnpm moon run pubsub:benchmark
```

Benchmark methodology and interpretation notes live in [BENCHMARK.md](../../BENCHMARK.md).

## Production Checklist

For a production Kafka deployment:

- provision scheduler topics with compaction, unlimited schedule retention, adequate partitions, and adequate replication
- configure `deadLetterTopic`
- set `router.subscribe({ maxAttempts })`
- make handlers idempotent; delivery is durable and at least once, not exactly once
- wire `observer` hooks into logs or metrics
- run `pnpm moon run pubsub:load-test` at an event count that reflects expected traffic
- run `pnpm moon run pubsub:benchmark` when publishing throughput and latency numbers
- configure Confluent client authentication, TLS, timeouts, retries, and broker settings outside the transport-neutral API

Kafka-specific tuning such as brokers, TLS, SASL, offsets, partitions, and group behavior belongs in the Confluent client configuration passed to this transport, not in the transport-neutral pubsub core.
