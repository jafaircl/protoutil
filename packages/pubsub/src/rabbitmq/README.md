# @protoutil/pubsub RabbitMQ Transport

RabbitMQ transport entry point at `@protoutil/pubsub/rabbitmq`.

Install the RabbitMQ client alongside the core package:

```sh
npm install @protoutil/pubsub amqplib
```

`amqplib` is an optional peer dependency. The core package does not import it directly; the
RabbitMQ entry point uses the real client only when the application imports
`@protoutil/pubsub/rabbitmq`.

The transport implements the core `PubSubTransport` interface from `@protoutil/pubsub` while
keeping RabbitMQ-specific connection, exchange, queue, and scheduling mechanics behind the
transport boundary.

Published payloads still use the [CloudEvents 1.0](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md)
envelope defined by the core package.

Delayed publish, retry delay, and `notBefore` scheduling do not require the
RabbitMQ delayed-message plugin. Use an explicit RabbitMQ scheduler when you
need delayed delivery; immediate publish and subscribe do not require one.

## Usage

```ts
import { createPublisher, createRouter } from "@protoutil/pubsub";
import { createRabbitMqScheduler, createRabbitMqTransport } from "@protoutil/pubsub/rabbitmq";
import { BillingEvents } from "./gen/acme/billing/v1/events_pb.js";

const scheduler = createRabbitMqScheduler({
  url: "amqp://guest:guest@127.0.0.1:5672",
});

const transport = createRabbitMqTransport({
  url: "amqp://guest:guest@127.0.0.1:5672",
  scheduler,
  defaultSource: "billing-service",
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

- a durable topic exchange for normal event routing
- durable subscriber queues derived from `consumerGroup`
- one durable schedules queue for `notBefore` publishes and delayed retries
- an in-process scheduler consumer that keeps scheduled messages unacked until due and republishes them to the target routing key

That scheduling model keeps delayed delivery durable across process restarts because the due time
is stored in RabbitMQ message headers and the schedule message stays in RabbitMQ until it is
republished to the target topic and acknowledged.

The public publisher and router APIs stay identical to Kafka and future transports.

## Lifecycle

`router.subscribe()` returns a `Subscription`. Call `subscription.unsubscribe()` to stop one
subscriber, and call `transport.close()` during process shutdown to close the AMQP connection and
channels owned by the transport.
