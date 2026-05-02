# @protoutil/pubsub NATS Transport

NATS JetStream transport entry point at `@protoutil/pubsub/nats`.

This transport requires JetStream for durable delivery. Delayed publish, retry
delay, and `notBefore` scheduling specifically depend on JetStream streams,
consumers, and KV state. Plain core NATS without JetStream is not enough for
those features or for durable delayed delivery.

Install the NATS client alongside the core package:

```sh
npm install @protoutil/pubsub nats
```

`nats` is an optional peer dependency. The core package does not import it directly; the
NATS entry point uses the real client only when the application imports
`@protoutil/pubsub/nats`.

The transport implements the core `PubSubTransport` interface from `@protoutil/pubsub` while
keeping NATS-specific connection, stream, consumer, and scheduling mechanics behind the
transport boundary.

Published payloads still use the [CloudEvents 1.0](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md)
envelope defined by the core package.

## Usage

```ts
import { createPublisher, createRouter } from "@protoutil/pubsub";
import { createNatsScheduler, createNatsTransport } from "@protoutil/pubsub/nats";
import { BillingEvents } from "./gen/acme/billing/v1/events_pb.js";

const scheduler = createNatsScheduler({
  servers: "nats://127.0.0.1:4222",
  options: {
    streamName: "BILLING_SCHEDULES",
    subject: "billing.scheduler.wake",
    kvBucket: "billing_scheduler",
  },
});

const transport = createNatsTransport({
  servers: "nats://127.0.0.1:4222",
  scheduler,
  defaultSource: "billing-service",
  stream: {
    name: "BILLING_EVENTS",
    subjects: ["billing.>"],
  },
});

const router = createRouter(BillingEvents, transport, {
  topic: {
    invoiceCreated: "billing.invoice.created",
  },
  deadLetterTopic: "billing.dead-letter",
});
const publisher = createPublisher(BillingEvents, transport, {
  source: "billing-service",
  topic: {
    invoiceCreated: "billing.invoice.created",
  },
});

const subscription = await router.subscribe({
  consumerGroup: "billing-workers",
  concurrency: 10,
  maxAttempts: 5,
});

await publisher.invoiceCreated({
  invoiceId: "inv_123",
  customerId: "cus_456",
});

await subscription.unsubscribe();
await transport.close();
```

## Scheduling Model

The current implementation uses:

- one JetStream event stream for normal event subjects
- one JetStream scheduler stream for delayed wake-up messages
- one JetStream KV bucket keyed by CloudEvent id so the latest delayed schedule wins deterministically
- one durable scheduler consumer shared by transport instances

Delayed publish and retry requests are persisted before the transport resolves the publish or
accepts the retry disposition, but only when you pass an explicit scheduler. Immediate publish
and subscribe do not require one.

## Lifecycle

`router.subscribe()` returns a `Subscription`. Call `subscription.unsubscribe()` to stop one
subscriber, and call `transport.close()` during process shutdown to close the NATS connection and
JetStream resources owned by the transport.

You can also pass `signal` to `createNatsTransport()`, `createNatsScheduler()`, and
`router.subscribe({ signal })` to shut everything down with one shared `AbortController`.
