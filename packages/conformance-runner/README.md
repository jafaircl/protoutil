# @protoutil/conformance-runner

Vitest-based conformance runner for protoutil packages.

The pubsub runner reads generated ProtoJSON fixtures from `conformance/generated/pubsub` and turns each fixture `section.test` into an individual Vitest test case.

Pubsub conformance is based on the [CloudEvents 1.0 specification](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md), the [CloudEvents protobuf format](https://github.com/cloudevents/spec/blob/main/cloudevents/formats/protobuf-format.md), and protobuf well-known types such as [`Timestamp`](https://protobuf.dev/reference/protobuf/google.protobuf/#timestamp) and [`Duration`](https://protobuf.dev/reference/protobuf/google.protobuf/#duration).

## Commands

Generate fixture JSON from textproto:

```sh
moon run conformance:generate
```

Run pubsub conformance directly:

```sh
pnpm --filter @protoutil/conformance-runner run pubsub
```

Run through Moon:

```sh
moon run pubsub:conformance
```

## Fixture Flow

1. Author textproto fixtures in `conformance/fixtures/pubsub`.
2. Define fixture schema in `packages/conformance-runner/proto/protoutil/conformance/pubsub/v1/cases.proto`.
3. Generate TypeScript fixture types:

   ```sh
   pnpm --filter @protoutil/conformance-runner run protogen
   ```

4. Generate canonical JSON fixtures:

   ```sh
   moon run conformance:generate
   ```

5. Run the Vitest conformance suite.

## Fixture Shape

The textproto format follows the CEL conformance style:

```textproto
name: "protoutil pubsub v1"
section {
  name: "CloudEvent materialization"
  test {
    name: "publish wraps protobuf payload in CloudEvent"
    kind: CASE_KIND_CLOUDEVENT_MATERIALIZATION
    publish {
      method: "alphaHappened"
      payload {
        event_id: "evt_123"
        name: "alpha"
      }
      options {
        source: "conformance-service"
      }
    }
    expected_event {
      source: "conformance-service"
      specversion: "1.0"
      type: "AlphaHappened"
    }
  }
}
```

## Current Pubsub Coverage

The pubsub suite covers:

- CloudEvent materialization
- protobuf payload packing and schema identity
- metadata extension attributes, including typed string/int/bool values
- topic, type, and source precedence
- routing by CloudEvent type
- successful handlers and explicit `ctx.*` dispositions
- transient, invalid input, unrecoverable, and unknown route normalization
- non-protobuf and wrong-protobuf payload rejection
- durable delayed publish `notBefore`
- durable delayed retry `Duration`

## Transport Conformance

The fixture runner stays transport-neutral and uses the in-memory transport so every case can run without broker infrastructure. Real broker behavior belongs in transport-backed tests that use the same public API as applications.

The Kafka transport currently adds Docker-backed coverage for:

- publish and consume through `createPublisher()` and `createRouter()`
- `subscription.unsubscribe()` stopping later deliveries
- `notBefore` delivery no earlier than the requested `Timestamp`
- `ctx.retry({ delay })` redelivery no earlier than the requested `Duration`

Those cases are transport conformance candidates for RabbitMQ and NATS when those backers exist.

## Notes

The runner intentionally uses generated protobuf fixture messages instead of handwritten JSON. Textproto is the source of truth; generated JSON is the portable fixture artifact.
