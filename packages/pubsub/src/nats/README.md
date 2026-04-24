# @protoutil/pubsub NATS Transport

Reserved for the NATS transport entry point at `@protoutil/pubsub/nats`.

Install the NATS client alongside the core package:

```sh
npm install @protoutil/pubsub nats
```

The transport should implement the core `PublisherTransport` and/or
`SubscriberTransport` interfaces from `@protoutil/pubsub`.

NATS-specific options such as subjects, streams, durable consumers, JetStream
ack policies, and delayed delivery mechanics should stay in this transport
package, not in the pubsub core API.

If this transport accepts `notBefore` or retry `delay`, it must persist the
delayed delivery durably before acknowledging the publish or retry disposition.
