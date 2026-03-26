---
title: "@protoutil/core"
description: Utilities for working with protobuf types
---

A set of utilities for working with protobuf types. These utilities assume you are using [`protobuf-es`](https://github.com/bufbuild/protobuf-es) to work with messages.

## Install

```bash
npm install @protoutil/core
```

## Entry Points

The package has two entry points:

| Entry Point | Import Path | Contents |
|-------------|-------------|----------|
| Core | `@protoutil/core` | CheckSum, Fields, integer validators, error classes |
| Well-Known Types | `@protoutil/core/wkt` | Duration, FieldMask, Timestamp |

## CheckSum

The `checksum` function calculates a non-cryptographic [checksum](https://en.wikipedia.org/wiki/Checksum) for a given message. Any two messages with identical values produce identical checksums. Internally, this is used for pagination page tokens and ETags in the `@protoutil/aip` package.

```ts
import { checksum } from "@protoutil/core";

const message1 = create(MySchema, { foo: "bar" });
const checksum1 = checksum(MySchema, message1);

const message2 = create(MySchema, { foo: "bar" });
const checksum2 = checksum(MySchema, message2);

const message3 = create(MySchema, { baz: "quz" });
const checksum3 = checksum(MySchema, message3);

checksum1 === checksum2; // true
checksum1 === checksum3; // false
```

## Fields

The `getField` and `setField` functions get and set field values on a message, with support for `oneof` fields:

```ts
import { getField, setField } from "@protoutil/core";

getField(message, fieldDescriptor); // Gets the value (or returns undefined)
setField(message, fieldDescriptor, value); // Sets the value
```

Both functions check that the field descriptor belongs to the message's type and throw an error on mismatch. `setField` does not validate the value's type before setting.

## Duration

> A Duration represents a signed, fixed-length span of time represented as a count of seconds and fractions of seconds at nanosecond resolution.

Import from `@protoutil/core/wkt`:

```ts
import {
  duration,
  assertValidDuration,
  isValidDuration,
  durationFromString,
  durationToString,
  durationFromNanos,
  durationNanos,
  clampDuration,
  durationFromTemporal,
  durationTemporal,
} from "@protoutil/core/wkt";
```

### Creating Durations

```ts
duration(1n, 1_000_000); // 1.001 seconds
duration(315_576_000_001n); // throws — max is +-10,000 years
```

### Validation

```ts
assertValidDuration(d); // throws if invalid
isValidDuration(d); // true/false
```

### String Conversion

```ts
durationFromString("2s"); // Duration message representing 2 seconds
durationToString(d); // "1.001s"
```

### Nanosecond Conversion

```ts
durationFromNanos(1_000_000n); // Duration representing 1 millisecond
durationNanos(d); // BigInt nanoseconds
```

### Clamping

```ts
const min = duration(5n);
const max = duration(10n);
clampDuration(duration(15n), min, max); // returns max
clampDuration(duration(1n), min, max); // returns min
clampDuration(duration(7n), min, max); // returns original
```

Without arguments, `clampDuration` clamps to the protobuf spec range (-315,576,000,000s to +315,576,000,000s).

### Temporal API

Conversion to/from [`Temporal.Duration`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal) (using `temporal-polyfill`):

```ts
durationFromTemporal(temporalDuration); // Duration message
durationTemporal(message); // Temporal.Duration
```

## Timestamp

> A Timestamp represents a point in time independent of any time zone or local calendar, encoded as a count of seconds and fractions of seconds at nanosecond resolution.
>
> Range is from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59.999999999Z.

Import from `@protoutil/core/wkt`:

```ts
import {
  timestamp,
  assertValidTimestamp,
  isValidTimestamp,
  timestampFromString,
  timestampToString,
  timestampFromNanos,
  timestampNanos,
  roundTimestampNanos,
  clampTimestamp,
  temporalTimestampNow,
  timestampFromInstant,
  timestampInstant,
} from "@protoutil/core/wkt";
```

### Creating Timestamps

```ts
timestamp(1n, 1_000_000); // 1.001 seconds after unix epoch
timestamp(253402300800n); // throws — max is 9999-12-31T23:59:59.999999999Z
```

### Validation

```ts
assertValidTimestamp(ts); // throws if invalid
isValidTimestamp(ts); // true/false
```

### String Conversion (RFC 3339)

```ts
timestampFromString("1970-01-01T02:07:34.000000321+07:00"); // Timestamp message
timestampToString(ts); // "1970-01-01T00:00:00.000000000Z"
```

### Nanosecond Conversion

```ts
timestampFromNanos(1_000_000n); // 1ms after epoch
timestampNanos(ts); // BigInt nanoseconds
```

### Math Example

```ts
const epoch = timestampFromNanos(0n);
const oneWeek = durationFromString(`${7 * 24 * 60 * 60}s`);
const oneWeekLater = timestampFromNanos(timestampNanos(epoch) + durationNanos(oneWeek));
timestampToString(oneWeekLater); // "1970-01-08T00:00:00.000Z"
```

### Rounding

Ensure `nanos` is an integer after calculations:

```ts
let ts = create(TimestampSchema, { nanos: 3 / 2 });
ts = roundTimestampNanos(ts);
assertValidTimestamp(ts); // does not throw
```

### Clamping

```ts
clampTimestamp(timestamp(15n), min, max); // clamp to range
```

Without arguments, clamps to the protobuf spec range (0001-01-01T00:00:00Z to 9999-12-31T23:59:59.999999999Z).

### Temporal API

```ts
temporalTimestampNow(); // Timestamp with nanosecond resolution
timestampFromInstant(instant); // from Temporal.Instant
timestampInstant(ts); // to Temporal.Instant
```

## FieldMask

> FieldMask represents a set of symbolic field paths used to specify a subset of fields that should be returned by a get operation or modified by an update operation.

Import from `@protoutil/core/wkt`:

```ts
import {
  fieldMask,
  assertValidFieldMask,
  isValidFieldMask,
  fieldMaskHasPath,
  applyFieldMask,
  mergeFieldMasks,
  intersectFieldMasks,
} from "@protoutil/core/wkt";
```

### Strict vs Non-Strict Mode

All FieldMask functions accept a `strict` parameter (default: `true`). In strict mode, only spec-compliant field masks are allowed. Set `strict` to `false` to allow wildcards (`*`) per the [AIP Guidelines](https://google.aip.dev/161).

### Creating FieldMasks

```ts
fieldMask(MySchema, ["my_path", "my_other_path"]);
// throws if fields don't exist on MySchema
```

### Validation

```ts
assertValidFieldMask(MySchema, fm); // throws if invalid
isValidFieldMask(MySchema, fm); // true/false
```

### Path Matching

```ts
const fm = fieldMask(MySchema, ["a"]);
fieldMaskHasPath(fm, "a"); // true
fieldMaskHasPath(fm, "b"); // false
fieldMaskHasPath(fm, "a.b"); // true — "a" covers nested fields
```

### Applying

```ts
const fm = fieldMask(MySchema, ["a"]);
applyFieldMask(MySchema, message, fm); // only "a" field populated
applyFieldMask(MySchema, message, fm, { inverse: true }); // everything EXCEPT "a"
```

`applyFieldMask` does not mutate the original message. Options:

| Option | Default | Description |
|--------|---------|-------------|
| `inverse` | `false` | When `true`, applies the inverse of the mask |
| `strict` | `true` | When `false`, allows wildcards in the mask |

### Merging

Combines paths — parent fields subsume their children:

```ts
const one = fieldMask(MySchema, ["a"]);
const two = fieldMask(MySchema, ["a.b", "c"]);
mergeFieldMasks(one, two); // paths: ["a", "c"]
```

### Intersecting

Returns only paths present in all masks — child paths preferred over parents:

```ts
intersectFieldMasks(one, two); // paths: ["a.b"]
```

## Integer Validators

Import from `@protoutil/core`:

| Function | Description |
|----------|-------------|
| `assertValidInt32(num)` | Throws if `num` is not a 32-bit signed integer |
| `isValidInt32(num)` | Returns `true` if `num` is a 32-bit signed integer |
| `assertValidInt64(num)` | Throws if `num` (BigInt) is not a 64-bit signed integer |
| `isValidInt64(num)` | Returns `true` if `num` (BigInt) is a 64-bit signed integer |
| `assertValidUInt32(num)` | Throws if `num` is not a 32-bit unsigned integer |
| `isValidUInt32(num)` | Returns `true` if `num` is a 32-bit unsigned integer |
| `assertValidUInt64(num)` | Throws if `num` (BigInt) is not a 64-bit unsigned integer |
| `isValidUInt64(num)` | Returns `true` if `num` (BigInt) is a 64-bit unsigned integer |

## Error Classes

Import from `@protoutil/core`:

| Class | Description |
|-------|-------------|
| `OutOfRangeError` | Indicates a value is out of range. Properties: `value`, `min`, `max`. |
| `InvalidValueError` | Indicates a value is invalid. Properties: `value`. |

## Unit Testing Schemas

This library exports the Google protobuf unit testing schemas compiled from [the protocolbuffers repository](https://github.com/protocolbuffers/protobuf/tree/27421b97a0daa29e91460d377b0213f9e7be5d3f/src/google/protobuf). These are useful when testing protobuf-dependent libraries.

```ts
// Main test types (proto2)
import { TestAllTypesSchema } from "@protoutil/core/unittest";

// Proto3-specific types
import { TestAllTypes_NestedEnumSchema } from "@protoutil/core/unittest/proto3";
```

Many additional schemas are available under `@protoutil/core/unittest/*` sub-paths (arena, custom-options, features, lite, etc.). Please explore the repository or file an issue if you need a schema that isn't exported.
