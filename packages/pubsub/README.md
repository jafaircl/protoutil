# @protoutil/pubsub

Transport-neutral protobuf pub/sub built on [CloudEvents](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md).

`@protoutil/pubsub` uses generated protobuf services as the contract surface:

- publishers get a method-shaped API for sending events
- routers register method-shaped handlers for consuming events
- every published event is a generated [`io.cloudevents.v1.CloudEvent`](https://github.com/cloudevents/spec/blob/main/cloudevents/formats/protobuf-format.md)
- protobuf payloads are packed into CloudEvent `proto_data` with [`google.protobuf.Any`](https://protobuf.dev/reference/protobuf/google.protobuf/#any)

There are no proto annotations in v1. Topic, CloudEvent type, and source are resolved explicitly and deterministically.

## Install

```sh
npm install @protoutil/pubsub
```

Transport clients are optional peer dependencies. Install only the client for the transport you use:

```sh
npm install @protoutil/pubsub @confluentinc/kafka-javascript
npm install @protoutil/pubsub amqplib
npm install @protoutil/pubsub nats
```

Application code should depend on the transport-neutral core API. Swapping backers should only change transport construction:

```ts
import { createPublisher, createRouter } from "@protoutil/pubsub";
import { BillingEvents } from "./gen/acme/billing/v1/events_pb.js";

const transport = createTransport();
const publisher = createPublisher(BillingEvents, transport, {
  source: "billing-service",
});
const router = createRouter(transport);
```

Transport entry points are isolated subpaths so unused broker clients are not loaded. Kafka, RabbitMQ, and NATS are implemented today:

```ts
import { createKafkaTransport } from "@protoutil/pubsub/kafka";
import { createRabbitMqTransport } from "@protoutil/pubsub/rabbitmq";
import { createNatsTransport } from "@protoutil/pubsub/nats";
```

## Portable Application Logic

Application publish and subscribe logic should not care which broker is behind
the transport. However your app is structured, broker-specific construction
should stay separated from the code that calls `createPublisher()`,
`createRouter()`, `router.subscribe()`, and handler `ctx.*` methods.

For example, the publish/subscribe side should be able to look like:

```ts
import { createPublisher, createRouter } from "@protoutil/pubsub";
import { BillingEvents } from "./gen/acme/billing/v1/events_pb.js";
import { transport } from "./wherever-you-build-the-transport.js";

export const publisher = createPublisher(BillingEvents, transport, {
  source: "billing-service",
});

export const router = createRouter(transport);

router.service(BillingEvents, {
  async invoiceCreated(request, ctx) {
    await processInvoice(request.invoiceId);
    await ctx.ack();
  },
});
```

When you swap Kafka, RabbitMQ, or NATS, only the transport construction layer
should need to change. The publish/subscribe logic should stay the same even
when you use portable features like delayed publish, retry delay, dead-letter,
or `maxAttempts`.

This is the same layering you would use in an application server such as the
Fastify example under [`examples/fastify-server`](../../examples/fastify-server).

## Transport Notes

- Kafka transport notes: [src/kafka/README.md](./src/kafka/README.md)
- RabbitMQ transport notes: [src/rabbitmq/README.md](./src/rabbitmq/README.md)
- NATS transport notes: [src/nats/README.md](./src/nats/README.md)

Current transport-specific caveats:

- Kafka delayed delivery is implemented with transport-owned scheduler topics.
- RabbitMQ delayed delivery does not require a delayed-message plugin. The transport owns a durable schedules queue and scheduler worker.
- NATS delayed delivery requires JetStream. Plain core NATS without JetStream is not enough for durable `notBefore` or retry delay.

## Standards

This package uses standards-defined event and payload types:

- [CloudEvents 1.0](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md) is the transport-neutral event model.
- [CloudEvents protobuf format](https://github.com/cloudevents/spec/blob/main/cloudevents/formats/protobuf-format.md) defines the generated `io.cloudevents.v1.CloudEvent` message.
- [`google.protobuf.Any`](https://protobuf.dev/reference/protobuf/google.protobuf/#any) carries the protobuf event payload.
- [`google.protobuf.Timestamp`](https://protobuf.dev/reference/protobuf/google.protobuf/#timestamp) is used for `notBefore`. In ProtoJSON it maps to an RFC 3339 timestamp string.
- [`google.protobuf.Duration`](https://protobuf.dev/reference/protobuf/google.protobuf/#duration) is used for retry delay. In ProtoJSON it maps to a string ending in `s`.

## Define an event service

Events are regular unary protobuf methods. The input message is the event payload.

```proto
syntax = "proto3";

package acme.billing.v1;

service BillingEvents {
  rpc InvoiceCreated(InvoiceCreatedEvent) returns (InvoiceCreatedEvent);
}

message InvoiceCreatedEvent {
  string invoice_id = 1;
  string customer_id = 2;
}
```

Generate TypeScript with the same Buf/protobuf-es workflow used by the rest of this repo, then import the generated service descriptor.

## Publish

```ts
import { createPublisher } from "@protoutil/pubsub";
import { BillingEvents } from "./gen/acme/billing/v1/events_pb.js";

const client = createPublisher(BillingEvents, transport, {
  source: "billing-service",
});

await client.invoiceCreated({
  invoiceId: "inv_123",
  customerId: "cus_456",
});
```

Every publish option is optional. Use them only when the defaults are not the right event identity, source, delivery topic, or timing:

| Option | Type | Description |
| --- | --- | --- |
| `topic` | `string` | Transport delivery topic. Defaults to the protobuf method name, then message type name. |
| `type` | `string` | CloudEvent semantic type. Defaults to the protobuf method name, then message type name. |
| `source` | `string` | CloudEvent source for this call. Overrides publisher and transport defaults. |
| `id` | `string` | CloudEvent id. Defaults to a generated UUID. |
| `time` | `Date \| string` | CloudEvent time. Defaults to the current time. |
| `metadata` | `Record<string, string \| number \| boolean \| Uint8Array>` | CloudEvent extension attributes. Number values must be integers to stay protobuf-native. |
| `notBefore` | `google.protobuf.Timestamp` | Durable one-shot delayed delivery deadline. |

```ts
import { timestampFromDate } from "@bufbuild/protobuf/wkt";

await client.invoiceCreated(
  { invoiceId: "inv_123", customerId: "cus_456" },
  {
    topic: "billing.invoice.created",
    metadata: { tenantid: "t1" },
    notBefore: timestampFromDate(new Date(Date.now() + 5_000)),
  },
);
```

Publishing creates a CloudEvent with:

- `id`
- `source`
- `specVersion`
- `type`
- `attributes.time`
- `attributes.datacontenttype`
- `attributes.dataschema`
- `data.protoData`

Metadata is written as CloudEvent extension attributes. Supported metadata values are `string`, `number` integers, `boolean`, and `Uint8Array`.

### Cross-process tracing

The `contextValues` API passes data within a single process. To share values across processes, encode them in CloudEvent metadata:

```typescript
// Publisher encodes a trace ID
await publisher.orderCreated({ orderId: "123" }, {
  metadata: { traceid: "abc-123", userid: "user_456" },
});

// Handler reads from the CloudEvent
router.service(Orders, {
  async orderCreated(request, ctx) {
    const traceId = ctx.event["traceid"];
    const userId = ctx.event["userid"];
    // ...
  },
});
```

Metadata survives the broker and is available on any subscribing server.

### Delayed Delivery

`notBefore` and retry `delay` are transport-owned scheduling semantics. A production transport that supports them must persist the schedule before resolving the publish or accepting the disposition, and it must not deliver earlier than the requested time.

Transport requirements for delayed delivery:

- Kafka: scheduler topics must exist with the required compaction settings.
- RabbitMQ: the transport manages the durable schedules queue itself.
- NATS: JetStream streams, consumers, and KV are required.

Handlers can read `ctx.attempt` for the one-based delivery attempt reported by the transport. The first delivery is attempt `1`; a delayed retry is delivered as attempt `2`, and so on.

`InMemoryPubSubTransport` is intentionally not durable and exists only for tests, examples, and conformance execution.

## Subscribe

```ts
import { createRouter } from "@protoutil/pubsub";
import { BillingEvents } from "./gen/acme/billing/v1/events_pb.js";

const router = createRouter(transport);

router.service(BillingEvents, {
  async invoiceCreated(request, ctx) {
    // request is InvoiceCreatedEvent
    if (ctx.attempt > 1) {
      logger.warn({ attempt: ctx.attempt }, "retrying invoiceCreated");
    }
    await processInvoice(request.invoiceId);
    await ctx.ack();
  },
});

const subscription = await router.subscribe({
  consumerGroup: "billing-workers",
  concurrency: 10,
  maxAttempts: 5,
});

await subscription.unsubscribe();
```

Handlers are routed by CloudEvent `type`, not by transport topic. Topic is for delivery. CloudEvent type is the semantic event identity.

Every subscribe option is portable across production transports:

| Option | Type | Description |
| --- | --- | --- |
| `consumerGroup` | `string` | Consumer group or durable subscription identifier owned by the transport. |
| `concurrency` | `number` | Maximum concurrent deliveries requested from the transport. |
| `maxAttempts` | `number` | Maximum one-based delivery attempts before a retry disposition becomes dead-letter. |
| `signal` | `AbortSignal` | Optional cancellation signal for stopping long-running subscriptions. |

### Lifecycle

`router.subscribe()` starts a long-running subscription and returns a `Subscription`.
Call `subscription.unsubscribe()` when that subscriber should stop receiving messages.

Production transports in this package own broker clients and expose `transport.close()`.
Call it from application shutdown hooks after active subscriptions have been unsubscribed,
or when the process is exiting and the whole transport should close.

```ts
const subscription = await router.subscribe({
  consumerGroup: "billing-workers",
});

try {
  // keep the process running, or attach this to your server lifecycle
} finally {
  await subscription.unsubscribe();
  await transport.close();
}
```

## Dispositions

Handlers should use context methods for explicit control:

```ts
await ctx.ack();
await ctx.retry({ delay: { seconds: 3n } });
await ctx.reject();
await ctx.deadLetter();
```

When `router.subscribe({ maxAttempts })` is set, a handler that asks for `ctx.retry()` on the final allowed attempt is not retried again. The transport treats it as dead-lettered and completes the consumed delivery.

Default normalization:

| Situation | Disposition |
| --- | --- |
| successful handler | `ack` |
| transient error | `retry` |
| invalid input or unsupported payload | `reject` |
| unrecoverable error or unknown route | `dead_letter` |

Use these errors when throwing from handlers:

```ts
import {
  InvalidInputPubSubError,
  TransientPubSubError,
  UnrecoverablePubSubError,
} from "@protoutil/pubsub";
```

## Interceptors

Interceptors provide a middleware chain around transport operations. Each interceptor receives a `next` function and returns a new function that can run logic before and/or after the core operation.

```ts
const logger: PubSubInterceptor = (next) => async (ctx) => {
  if (ctx.operation === "publish" || ctx.operation === "handle") {
    const start = performance.now();
    try {
      return await next(ctx);
    } finally {
      console.log(`${ctx.operation}: ${performance.now() - start}ms`);
    }
  }
  return next(ctx);
};

const metrics: PubSubInterceptor = (next) => async (ctx) => {
  if (ctx.operation === "committed" || ctx.operation === "deadLettered") {
    counter.increment(ctx.operation);
  }
  return next(ctx);
};
```

Pass interceptors to the transport constructor. The first interceptor in the array is the outermost in the call chain:

```ts
const transport = createKafkaTransport({
  // ...
  interceptors: [logger, metrics], // first = outermost
});
```

### Operations

The context is a discriminated union keyed on `operation`. Narrowing on `ctx.operation` gives access to operation-specific fields:

| Operation | Context fields | Description |
| --- | --- | --- |
| `publish` | `request: PublishRequest` | Transport publish call |
| `handle` | `delivery: Delivery` | Delivery handler invocation |
| `scheduled` | `event: PubSubTransportEvent` | Delayed publish/retry accepted |
| `committed` | `event: PubSubTransportEvent` | Subscriber ack/commit |
| `retried` | `event: PubSubTransportEvent` | Event scheduled for retry |
| `retryExhausted` | `event: PubSubTransportEvent` | Retry limit reached |
| `deadLettered` | `event: PubSubTransportEvent` | Event sent to DLQ |
| `recovered` | `event: PubSubTransportEvent` | Delayed event recovered |
| `delivered` | `event: PubSubTransportEvent` | Delayed event delivered |
| `tombstoned` | `event: PubSubTransportEvent` | Schedule cleared |
| `deliveryFailed` | `event: PubSubTransportFailureEvent` | Delivery failure (has `error`) |
| `parseFailed` | `event: PubSubTransportFailureEvent` | Parse failure (has `error`) |

`publish` and `handle` are user-facing operations where interceptor errors propagate normally. All other operations are transport lifecycle notifications where interceptor errors are caught so they never break delivery flow.

### Narrowing

```ts
const interceptor: PubSubInterceptor = (next) => async (ctx) => {
  if (ctx.operation === "publish") {
    console.log("publishing to", ctx.request.topic);
  }
  if (ctx.operation === "handle") {
    console.log("handling", ctx.delivery.event.id, "attempt", ctx.delivery.attempt);
  }
  if (ctx.operation === "deliveryFailed") {
    console.error("delivery failed", ctx.event.error);
  }
  return next(ctx);
};
```

### Context Values

`ContextValues` passes arbitrary data through the interceptor chain and to handlers:

```ts
import { createContextKey, createContextValues, withReentryGuard } from "@protoutil/pubsub";

const kUserId = createContextKey<string | undefined>("");
const kTracingId = createContextKey<string>("");

const extractUserId: PubSubInterceptor = (next) => async (ctx) => {
  ctx.contextValues?.set(kUserId, extractFromRequest(ctx));
  return next(ctx);
};

const extractTracing: PubSubInterceptor = (next) => async (ctx) => {
  ctx.contextValues?.set(kTracingId, crypto.randomUUID());
  return next(ctx);
};

// Use in handlers
const handler: EventHandler = async (request, ctx) => {
  const userId = ctx.contextValues.get(kUserId);
  const traceId = ctx.contextValues.get(kTracingId);
  // ...
};
```

Pass `ContextValues` to options to carry state across nested calls:

```ts
const values = createContextValues();
const publisher = createPublisher(service, transport, { contextValues: values });

// Use a reentry guard to prevent nested handler publishes
const kPublishing = createContextKey(false);
await withReentryGuard(values, kPublishing, async () => {
  await publisher.doThing(req);
});
```

## Resolution Rules

Topic precedence:

1. explicit `topic` at publish call site
2. protobuf method name
3. protobuf message type name

CloudEvent type precedence:

1. explicit `type` override
2. protobuf method name
3. protobuf message type name

Source precedence:

1. explicit `source` at publish call site
2. publisher default `source`
3. transport default `defaultSource`
4. library default `protoutil.pubsub`

## Transport Contract

The core is transport-agnostic. A transport only needs to implement publishing, subscribing, or both:

```ts
import type {
  DeliveryHandler,
  PublishRequest,
  PubSubTransport,
  Subscription,
  SubscribeOptions,
} from "@protoutil/pubsub";

class MyTransport implements PubSubTransport {
  defaultSource = "my-transport";

  async publish(request: PublishRequest): Promise<void> {
    // request.topic
    // request.event is io.cloudevents.v1.CloudEvent
    // request.notBefore is google.protobuf.Timestamp | undefined
    // if request.notBefore is supported, persist it durably before resolving
  }

  async subscribe(handler: DeliveryHandler, options?: SubscribeOptions): Promise<Subscription> {
    // transport owns consumer groups, concurrency, ack/nack, partitioning,
    // and any durable delayed delivery mechanics.
    return {
      async unsubscribe() {
        // stop this subscription
      },
    };
  }
}
```

Transport-specific tuning belongs in transport packages, not in the core API.

## Production Checklist

For production transports, applications should:

- configure a dead-letter destination where the transport supports one
- set `router.subscribe({ maxAttempts })` for bounded retries
- make handlers idempotent because production transports provide at-least-once delivery
- wire transport interceptors into logs or metrics
- run the transport load test at a realistic event count before rollout
- configure broker-specific authentication, TLS, timeouts, and retry behavior in the transport client

Implemented and reserved transport subpaths:

- `@protoutil/pubsub/kafka` implements a Kafka transport factory backed by `@confluentinc/kafka-javascript`.
- `@protoutil/pubsub/rabbitmq` implements a RabbitMQ transport factory backed by `amqplib`.
- `@protoutil/pubsub/nats` implements a NATS JetStream transport factory backed by `nats`.

### Kafka

The Kafka transport uses the real `@confluentinc/kafka-javascript` client from the Kafka subpath. The core package still does not load Kafka unless the application imports `@protoutil/pubsub/kafka`.

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
  },
  defaultSource: "billing-service",
});

const publisher = createPublisher(BillingEvents, transport, {
  source: "billing-service",
});
const router = createRouter(transport);
```

The Kafka transport connects and creates its scheduler topology lazily on first publish or subscribe. `router.subscribe()` returns a subscription handle; call `subscription.unsubscribe()` to stop that subscriber. Call `transport.close()` from application shutdown hooks to close the backing Kafka clients.

For durable `notBefore` support, the Kafka transport creates a compacted schedules topic with unlimited retention, plus a schedule history topic. The schedules topic stores the due CloudEvent protobuf bytes keyed by CloudEvent id. See [the Kafka README](./src/kafka/README.md) for topology details.

### RabbitMQ

The RabbitMQ transport uses the real `amqplib` client from the RabbitMQ subpath. The core package still does not load RabbitMQ unless the application imports `@protoutil/pubsub/rabbitmq`.

The current RabbitMQ scheduler uses one durable schedules queue plus an in-process scheduler consumer that keeps scheduled messages unacked until due, then republishes them to the target routing key. `router.subscribe()` still returns a subscription handle; call `subscription.unsubscribe()` to stop that subscriber, and call `transport.close()` from application shutdown hooks to close the owned AMQP connection and channels.

See [the RabbitMQ README](./src/rabbitmq/README.md) for connection and scheduling details.

### NATS

The NATS transport uses the real `nats` client from the NATS subpath. The core package still does not load NATS unless the application imports `@protoutil/pubsub/nats`.

The current NATS implementation uses JetStream for durable event storage plus a JetStream KV bucket and scheduler stream for `notBefore` publishes and delayed retries. `router.subscribe()` still returns a subscription handle; call `subscription.unsubscribe()` to stop that subscriber, and call `transport.close()` from application shutdown hooks to close the owned NATS connection and JetStream consumers.

See [the NATS README](./src/nats/README.md) for stream and scheduling details.

## In-Memory Transport

`InMemoryPubSubTransport` is exported for tests and examples:

```ts
import { InMemoryPubSubTransport } from "@protoutil/pubsub";

const transport = new InMemoryPubSubTransport();
```

It records `published` requests and `dispositions`, and can synchronously deliver published events to a registered router.
