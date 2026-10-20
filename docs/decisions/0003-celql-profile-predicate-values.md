# Use CEL values in CELQL predicate envelopes

- Status: accepted
- Date: 2026-08-14
- Decision makers: project owner

## Context

CELQL profiles return one exact protobuf predicate type. SQL profiles use typed parameter values. A MongoDB profile needs one structured filter document that preserves the CEL values accepted by its declared fragment.

`google.protobuf.Struct` does not preserve CEL `int`, `uint`, `bytes`, or protobuf object values without a profile-specific conversion. A JavaScript object would require a MongoDB driver type in CELQL and would not satisfy the protobuf output contract.

## Decision

The MongoDB major version 1 profile returns `protoutil.celql.mongodb.v1.MongoDbPredicate`. Its `filter` field has type `cel.expr.Value`.

The profile uses CEL map and list values for MongoDB documents and arrays. It uses CEL scalar values directly. It stores protobuf-backed values, including timestamps and durations, in `cel.expr.Value.object_value`.

CELQL does not import a MongoDB driver. A caller converts the typed predicate envelope to the driver value representation at its integration boundary.

## Consequences

- The MongoDB profile preserves the CEL value intersection without narrowing numbers to floating point or strings.
- The profile has a language-neutral, exact output type for conformance fixtures.
- An integration package owns conversion from the predicate envelope to the MongoDB driver's document type.
- BSON-only values outside CEL's value model remain outside the profile's base fragment unless a future profile version or library defines them.

## Alternatives

### Use `google.protobuf.Struct`

`Struct` is convenient for JSON-like data but loses CEL value distinctions that affect filtering semantics.

### Return MongoDB driver objects

This couples CELQL to a driver and omits the required exact protobuf predicate type.
