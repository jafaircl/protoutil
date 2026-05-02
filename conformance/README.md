# Conformance Fixtures

This directory contains source fixtures and generated JSON artifacts for protoutil conformance suites.

The pubsub fixtures exercise the [CloudEvents 1.0 specification](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md), the [CloudEvents protobuf format](https://github.com/cloudevents/spec/blob/main/cloudevents/formats/protobuf-format.md), and protobuf well-known types such as [`Timestamp`](https://protobuf.dev/reference/protobuf/google.protobuf/#timestamp) and [`Duration`](https://protobuf.dev/reference/protobuf/google.protobuf/#duration).

## Layout

```text
conformance/
  fixtures/pubsub/      # source .textproto fixtures
  generated/pubsub/     # generated canonical ProtoJSON fixtures
```

Fixture schemas live with the package that runs them. For pubsub:

```text
packages/conformance-runner/proto/protoutil/conformance/pubsub/v1/cases.proto
```

## Generate

```sh
moon run conformance:generate
```

This runs the Go fixture generator in `go/cmd/fixturegen`, which:

1. builds descriptors from the conformance runner proto directory with Buf
2. parses `.textproto` fixtures
3. writes canonical ProtoJSON to `conformance/generated/pubsub`

## Run

```sh
moon run pubsub:conformance
```

`pubsub:build` depends on conformance, so conformance always runs before building the pubsub package.
