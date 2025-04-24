# @protoutil/core

A set of utilities for working with well-known protobuf types. These utilities assume you are using [`protobuf-es`](https://github.com/bufbuild/protobuf-es) to work with messages.

## Install

Use your configured package manager to install the `@protoutil/core` package. i.e. install from npm using `npm install @protoutil/core`.

## Usage

### Duration

> A Duration represents a signed, fixed-length span of time represented as a count of seconds and fractions of seconds at nanosecond resolution. It is independent of any calendar and concepts like "day" or "month". It is related to Timestamp in that the difference between two Timestamp values is a Duration and it can be added or subtracted from a Timestamp. Range is approximately +-10,000 years.

The `duration` function creates and validates a `Duration` message:

```ts
import { duration } from '@protoutil/core';

duration(1n, 1_000_000); // returns a duration object representing 1.001 seconds
duration(315_576_000_001n); // throws an error as durations have a max length of +/-10,000 years
```

The `assertValidDuration` and `isValidDuration` functions validate `Duration` objects:

```ts
import { assertValidDuration, isValidDuration } from '@protoutil/core';

assertValidDuration(d); // throws an error if `d` is not a valid duration
isValidDuration(d); // returns true if `d` is a valid duration and false otherwise
```

The `durationFromString` and `durationString` functions convert strings to and from `Duration` protobuf messages:

```ts
import { durationFromString, durationString } from '@protoutil/core';

durationFromString('2s'); // returns a `Duration` message representing 2 seconds
durationString(d); // returns a string representation i.e. '1.001s'
```

The `durationFromNanos` and `durationNanos` functions convert nanoseconds to and from `Duration` protobuf messages (useful for performing math operations on durations and timestamps):

```ts
import { durationFromNanos, durationNanos } from '@protoutil/core';

durationFromNanos(1_000_000n); // returns a `Duration` message representing 1 millisecond
durationNanos(d); // returns a BigInt i.e. 1_000_000n

// Math example:
const epochTimestamp = timestampFromNanos(0n);
const epochTimestampNanos = timestampNanos(epochTimestamp);
const oneWeekDuration = durationFromString(`${7 * 24 * 60 * 60}s`);
const oneWeekDurationNanos = durationNanos(oneWeekDuration);
const oneWeekAfterEpoch = timestampFromNanos(
  epochTimestampNanos + oneWeekDurationNanos
);
timestampDateString(oneWeekAfterEpoch); // returns '1970-01-08T00:00:00.000Z'
```

### Fields

The `getField` function will get a field from a message given the field descriptor. The `setField` function will set a field on a message given the field descriptor and a value. Both `getField` and `setField` respect `oneof` values. Note that `setField` does not validate the type before setting the field (PRs are welcome):

```ts
import { getField, setField } from '@protobuf/core';

getField(message, fieldDescriptor); // Gets the value of the field (or returns undefined);
setField(message, fieldDescriptor, value); // Sets the value of the field
```

### FieldMask

> `FieldMask` represents a set of symbolic field paths, for example:
>
>     paths: "f.a"
>     paths: "f.b.d"
>
> Here `f` represents a field in some root message, `a` and `b` fields in the message found in `f`, and `d` a field found in the message in `f.b`.
>
> Field masks are used to specify a subset of fields that should be returned by a get operation or modified by an update operation.

The `fieldMask` function creates a `FieldMask` message and asserts that it is valid for the given schema:

```ts
import { fieldMask } from '@protoutil/core';

fieldMask(MyMessageSchema 'my_path', 'my_other_path');
// will throw if no fields named 'my_path' or 'my_other_path' are defined on `MyMessageSchema`
```

The `assertValidFieldMask` and `isValidFieldMask` functions validate `FieldMask` objects for the given schema:

```ts
import { assertValidFieldMask, isValidFieldMask } from '@protoutil/core';

assertValidFieldMask(MySchema, fm); // throws if `fm` is not valid for `MySchema`
isValidFieldMask(MySchema, fm); // return true if `fm` is valid for `MySchema` or false otherwise
```

The `fieldMaskHasPath` function returns true if a `FieldMask` matches the given path:

```ts
import { fieldMask, fieldMaskHasPath } from '@protoutil/core';

const fm = fieldMask(MySchema, 'a');
fieldMaskHasPath(fm, 'a'); // true
fieldMaskHasPath(fm, 'b'); // false
fieldMaskHasPath(fm, 'a.b'); // true since 'a' was in the field mask so nested fields will be, too.
```

The `applyFieldMask` function will apply a field mask to a message. If `inverse` is true, all fields will be returned _EXCEPT_ the ones in the mask.

```ts
import { fieldMask, applyFieldMask } from '@protoutil/core';

const fm = fieldMask(MySchema, 'a');
const message = create(MySchema, { ... });
const updated = applyFieldMask(MySchema, message, fm); // returns a message where only the 'a' field is populated
const inverse = applyFieldMask(MySchema, message, fm, true); // returns a message where the 'a' field is NOT populated
```

`applyFieldMask` does not mutate the original message.

The `mergeFieldMasks` function accepts an arbitrary number of `FieldMask` objects and merges their paths. When combining, if one `FieldMask` has a parent field and another has one of its children, only the parent will be returned since it will apply to both:

```ts
import { fieldMask, mergeFieldMasks } from '@protoutil/core';

const one = fieldMask(MySchema, 'a');
const two = fieldMask(MySchema, 'a.b', 'c');
mergeFieldMasks(one, two); // returns ['a', 'c'] as paths in the `FieldMask`
```

The `intersectFieldMasks` function accepts an arbitrary number of `FieldMask` objects and returns the intersection of their paths. When combining, if one `FieldMask` has a parent field and another has one of its children, only the child will be returned since it is the only path that intersects both:

```ts
import { fieldMask, intersectFieldMasks } from '@protoutil/core';

const one = fieldMask(MySchema, 'a');
const two = fieldMask(MySchema, 'a.b', 'c');
intersectFieldMasks(one, two); // returns ['a.b'] as paths in the `FieldMask`
```

### Int32

The `assertValidInt32` and `isValidInt32` functions validate that number values are 32-bit integers:

```ts
import { assertValidInt32, isValidInt32 } from '@protoutil/wkt';

assertValidInt32(num); // throws if `num` is not a 32 bit integer
isValidInt32(num); // return true if `num` is a 32-bit integer or false otherwise
```

### Int64

The `assertValidInt64` and `isValidInt64` functions validate that BigInt values are 64-bit integers:

```ts
import { assertValidInt64, isValidInt64 } from '@protoutil/wkt';

assertValidInt64(num); // throws if `num` is not a 64 bit integer
isValidInt64(num); // return true if `num` is a 64-bit integer or false otherwise
```

### Timestamp

> A Timestamp represents a point in time independent of any time zone or local calendar, encoded as a count of seconds and fractions of seconds at nanosecond resolution. The count is relative to an epoch at UTC midnight on January 1, 1970, in the proleptic Gregorian calendar which extends the Gregorian calendar backwards to year one.
>
> All minutes are 60 seconds long. Leap seconds are "smeared" so that no leap second table is needed for interpretation, using a [24-hour linear smear](https://developers.google.com/time/smear).
>
> The range is from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59.999999999Z. By restricting to that range, we ensure that we can convert to and from [RFC 3339](https://www.ietf.org/rfc/rfc3339.txt) date strings.

The `timestamp` function creates and validates a `Timestamp` message:

```ts
import { timestamp } from '@protoutil/core';

timestamp(1n, 1_000_000); // returns a timestamp object representing 1.001 seconds after the unix epoch
timestamp(253402300800n); // throws an error as timestamps have a max value of 9999-12-31T23:59:59.999999999Z
```

The `assertValidTimestamp` and `isValidTimestamp` functions validate `Timestamp` objects:

```ts
import { assertValidTimestamp, isValidTimestamp } from '@protoutil/core';

assertValidTimestamp(ts); // throws an error if `ts` is not a valid timestamp
isValidTimestamp(d); // returns true if `ts` is a valid timestamp and false otherwise
```

The `timestampFromDateString` and `timestampDateString` functions convert strings to and from `Timestamp` protobuf messages:

```ts
import { timestampFromDateString, timestampDateString } from '@protoutil/core';

timestampFromDateString('1970-01-01T02:07:34.000000321+07:00'); // returns a `Timestamp` message representing the unix epoch
timestampDateString(ts); // returns a string representation i.e. '1970-01-01T00:00:00.000000000Z'
```

The `timestampFromNanos` and `timestampNanos` functions convert nanoseconds to and from `Timestamp` protobuf messages (useful for performing math operations on durations and timestamps):

```ts
import { timestampFromNanos, timestampNanos } from '@protoutil/core';

timestampFromNanos(1_000_000n); // returns a `Timestamp` message representing 1 millisecond after Jan 1, 1970
timestampNanos(d); // returns a BigInt i.e. 1_000_000n

// Math example:
const epochTimestamp = timestampFromNanos(0n);
const epochTimestampNanos = timestampNanos(epochTimestamp);
const oneWeekDuration = durationFromString(`${7 * 24 * 60 * 60}s`);
const oneWeekDurationNanos = durationNanos(oneWeekDuration);
const oneWeekAfterEpoch = timestampFromNanos(
  epochTimestampNanos + oneWeekDurationNanos
);
timestampDateString(oneWeekAfterEpoch); // returns '1970-01-08T00:00:00.000Z'
```

The `roundTimestampNanos` function is a helper to make sure that the `nanos` parameter of a `Timestamp` is an integer. This can be helpful if you need to perform calculations then validate a `Timestamp`.

```ts
import { roundTimestampNanos, assertValidTimestamp } from '@protoutil/core';

let ts = create(TimestampSchema, { nanos: 3 / 2 });
ts = roundTimestampNanos(ts);
assertValidTimestamp(ts); // should not throw
```

#### Temporal Functions

`Temporal` is a Stage 3 TC39 proposal which has begun shipping in experimental releases of browsers. Since support is still experimental, we use the `temporal-polyfill`. Using `Temporal` instead of `Date` means native support for nanosecond resolution and simplified operations when working with calendar dates, time zones, date/time calculations, and more. [Read more about the `Temporal` API here.](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal)

The `temporalTimestampNow` function returns a `Timestamp` object representing the current time using the `Temporal` API:

```ts
import { temporalTimestampNow } from '@protoutil/core';

temporalTimestampNow(); // returns a `Timestamp` object representing the current time with nanosecond resolution
```

The `timestampFromInstant` and `timestampInstant` functions convert `Temporal.Instant` objects to and from `Timestamp` protobuf messages:

```ts
import { timestampFromInstant, timestampInstant } from '@protoutil/core';

timestampFromInstant(instant); // returns a `Timestamp` object representing the `Temporal.Instant`
timestampInstant(ts); // returns a `Temporal.Instant` object representing the `Timestamp`
```

### UInt32

The `assertValidUInt32` and `isValidUInt32` functions validate that number values are 32-bit unsigned integers:

```ts
import { assertValidUInt32, isValidUInt32 } from '@protoutil/wkt';

assertValidUInt32(num); // throws if `num` is not a 32 bit unsigned integer
isValidUInt32(num); // return true if `num` is a 32-bit unsigned integer or false otherwise
```

### UInt64

The `assertValidUInt64` and `isValidUInt64` functions validate that BigInt values are 64-bit unsigned integers:

```ts
import { assertValidUInt64, isValidUInt64 } from '@protoutil/wkt';

assertValidUInt64(num); // throws if `num` is not a 64 bit unsigned integer
isValidUInt64(num); // return true if `num` is a 64-bit unsinged integer or false otherwise
```

## Contributing

### Building

Run `nx build core` to build the library.

### Running unit tests

Run `nx test core` to execute the unit tests via [Vitest](https://vitest.dev/).
