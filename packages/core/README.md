# @protoutil/core

A set of utilities for working with protobuf types. These utilities assume you are using [`protobuf-es`](https://github.com/bufbuild/protobuf-es) to work with messages.

## Install

```bash
npm install @protoutil/core
```

## Entry Points

The package has four entry points:

| Entry Point | Import Path | Contents |
|-------------|-------------|----------|
| Core | `@protoutil/core` | CheckSum, Fields, integer validators, error classes |
| Google RPC Types | `@protoutil/core/google/rpc` | Generated `google/rpc` exports plus helpers for `Code` and `Status` |
| Well-Known Types | `@protoutil/core/wkt` | Duration, FieldMask, Timestamp, including Temporal-based parsing and conversion helpers |
| Google Common Types | `@protoutil/core/google/type` | Generated `google/type` exports plus helpers for CalendarPeriod, Color, Date, DateTime, DayOfWeek, Decimal, Fraction, Interval, LatLng, LocalizedText, Month, Money, PhoneNumber, PostalAddress, Quaternion, and TimeOfDay, including Temporal-based conversions |

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
  durationToString,
  durationFromNanos,
  durationNanos,
  clampDuration,
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

```ts
import {
  durationFromString,
  durationFromTemporal,
  durationTemporal,
} from "@protoutil/core/wkt";

durationFromString("2s"); // Duration message representing 2 seconds
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
  timestampFromNanos,
  timestampNanos,
  roundTimestampNanos,
  clampTimestamp,
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

### Nanosecond Conversion

```ts
timestampFromNanos(1_000_000n); // 1ms after epoch
timestampNanos(ts); // BigInt nanoseconds
```

### Math Example

```ts
const epoch = timestampFromNanos(0n);
const oneWeek = duration(7n * 24n * 60n * 60n);
const oneWeekLater = timestampFromNanos(timestampNanos(epoch) + durationNanos(oneWeek));
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
import {
  temporalTimestampNow,
  timestampFromInstant,
  timestampFromString,
  timestampInstant,
  timestampToString,
} from "@protoutil/core/wkt";

timestampFromString("1970-01-01T02:07:34.000000321+07:00"); // Timestamp message
timestampToString(ts); // "1970-01-01T00:00:00.000000000Z"
temporalTimestampNow(); // Timestamp with nanosecond resolution
timestampFromInstant(instant); // from Temporal.Instant
timestampInstant(ts); // to Temporal.Instant
```

## Google RPC Types

Import from `@protoutil/core/google/rpc`:

```ts
import {
  BadRequestSchema,
  Code,
  ErrorInfoSchema,
  assertValidCode,
  badRequest,
  badRequestFieldViolation,
  codeFromString,
  codeToString,
  errorInfo,
  isValidCode,
  localizedMessage,
  retryInfo,
  assertValidStatus,
  isValidStatus,
  status,
} from "@protoutil/core/google/rpc";
```

### Code

```ts
codeFromString("not_found"); // Code.NOT_FOUND
codeToString(Code.PERMISSION_DENIED); // "PERMISSION_DENIED"
```

`Code` helpers validate the protobuf enum values and provide canonical
enum-name string conversion.

```ts
assertValidCode(value); // throws if invalid
isValidCode(value); // true/false
```

### Error Details

The entry point re-exports the generated standard error detail messages from
`google/rpc/error_details.proto` and adds constructors plus validators for
each top-level detail type.

```ts
errorInfo("BOOK_NOT_FOUND", "library.example.com", {
  resource: "publishers/1/books/2",
});

badRequest([
  badRequestFieldViolation(
    "name",
    "is required",
    "FIELD_REQUIRED",
    localizedMessage("en-US", "Name is required"),
  ),
]);

retryInfo(duration(3n));
```

Helpers are available for `ErrorInfo`, `RetryInfo`, `DebugInfo`,
`QuotaFailure`, `PreconditionFailure`, `BadRequest`, `RequestInfo`,
`ResourceInfo`, `Help`, `LocalizedMessage`, and their nested violation/link
messages.

### Creating Status Values

```ts
status(Code.NOT_FOUND, "Book not found");
```

`status()` creates a validated `google.rpc.Status`. `code` must be one of the
canonical `google.rpc.Code` enum values, `message` is the developer-facing
error text, and `details` may contain packed `google.protobuf.Any` values.

### Validation

```ts
assertValidStatus(value); // throws if invalid
isValidStatus(value); // true/false
```

Validation checks that `code` is a defined `google.rpc.Code` enum value,
`message` is a string, and `details` contains only `google.protobuf.Any`
messages.

## Google Common Types

Import from `@protoutil/core/google/type`:

```ts
import {
  CURRENCY_CODES,
  CalendarPeriod,
  CalendarPeriodSchema,
  ColorSchema,
  DateSchema,
  DateTimeSchema,
  DayOfWeek,
  DayOfWeekSchema,
  DecimalSchema,
  FractionSchema,
  IntervalSchema,
  LatLngSchema,
  LocalizedTextSchema,
  Month,
  MonthSchema,
  MoneySchema,
  PhoneNumberSchema,
  PostalAddressSchema,
  QuaternionSchema,
  TimeZoneSchema,
  TimeOfDaySchema,
  type CurrencyCode,
  assertValidLanguageCode,
  assertValidRegionCode,
  calendarPeriodFromString,
  calendarPeriodToString,
  color,
  date,
  dateFromString,
  dateToString,
  dateTime,
  dateTimeFromString,
  dateTimeToString,
  dayOfWeekFromString,
  dayOfWeekToString,
  decimal,
  decimalFromString,
  decimalToString,
  fraction,
  fractionFromString,
  fractionToString,
  interval,
  latLng,
  isValidLanguageCode,
  isValidRegionCode,
  localizedText,
  monthFromString,
  monthToString,
  isCurrencyCode,
  money,
  moneyFromDecimal,
  moneyToDecimal,
  phoneNumber,
  phoneNumberShortCode,
  postalAddress,
  quaternion,
  timeZone,
  timeOfDay,
  timeOfDayFromString,
  timeOfDayToString,
} from "@protoutil/core/google/type";
```

The entry point re-exports the generated `google/type` messages and adds convenience helpers for the most common API-facing types, including Temporal-based conversions:

```ts
import {
  dateFromPlainDate,
  datePlainDate,
  dateTimeFromPlainDateTime,
  dateTimeFromZonedDateTime,
  dateTimePlainDateTime,
  dateTimeZonedDateTime,
  intervalFromInstants,
  intervalInstants,
  timeOfDayFromPlainTime,
  timeOfDayPlainTime,
} from "@protoutil/core/google/type";
```

### CalendarPeriod

```ts
calendarPeriodFromString("week");
calendarPeriodToString(CalendarPeriod.FORTNIGHT); // "FORTNIGHT"
```

`CalendarPeriod` helpers validate the protobuf enum values
`CALENDAR_PERIOD_UNSPECIFIED` through `YEAR` and provide canonical enum-name
string conversion. `WEEK` and `FORTNIGHT` follow
[ISO 8601](https://en.wikipedia.org/wiki/ISO_week_date) week boundaries, and
all calendar periods begin at midnight UTC.

### Color

```ts
color(1, 0, 0); // solid red
color(0.25, 0.5, 0.75, 0.4);
```

`Color` helpers validate RGBA channels in the protobuf interval `[0, 1]`. `alpha` is optional; when omitted, the color should be rendered as solid, as if `alpha` were `1.0`.

### Date

```ts
date(2024, 3, 2); // full date
date(2024, 0, 0); // year-only
date(2024, 3, 0); // year-month
date(0, 2, 29); // month-day anniversary

dateFromString("--02-29");
dateToString(date(2024, 3, 2)); // "2024-03-02"
```

`Date` helpers support all four protobuf date shapes: full dates, year-only values, year-month values, and month-day values. A yearless date must include both month and day.

Temporal conversions for full dates are available from
`@protoutil/core/google/type`.

### Decimal

```ts
decimal("12.34");
decimalFromString(".5");
decimalToString(decimal("1E+05")); // "1e5"
```

`Decimal` helpers validate the protobuf decimal grammar and normalize helper-created values to a canonical string form. Normalization removes a leading `+`, inserts a leading `0` for fractional-only values, lowercases exponents, and drops zero exponents.

They also preserve precision rather than rounding: this package does not currently impose a maximum decimal precision or scale. Trailing fractional zeroes are preserved, but equivalent values are not otherwise rewritten across exponent and decimal notation, so `2.5e-1` stays `2.5e-1` instead of being reformatted as `0.25`. Locale-specific separators like `,` are rejected.

### DateTime

```ts
dateTime({
  year: 2024,
  month: 3,
  day: 2,
  hours: 8,
  minutes: 48,
  timeZone: "America/New_York",
});

dateTimeFromString("2024-03-02T08:48:00-05:00");
dateTimeToString(dateTimeFromString("2024-03-02T08:48:00[America/New_York]"));
```

`DateTime` helpers support local datetimes, UTC offsets, and
[IANA Time Zone Database](https://www.iana.org/time-zones) zones.

They intentionally use a strict v1 subset of the protobuf type: hours must be `00` through `23`, seconds must be `00` through `59`, and `utcOffset` must be whole seconds within `±18:00`. Yearless datetimes are supported, but Temporal conversions back to `Temporal.PlainDateTime` or `Temporal.ZonedDateTime` require a non-zero year.

When you use `timeZone`, the helpers rely on
[Temporal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal)'s
default `"compatible"` disambiguation for IANA zones. In practice, ambiguous
fall-back times prefer the earlier offset, and skipped spring-forward times
keep the requested civil fields while resolving with the post-transition
offset. The named-zone validation is shared with `timeZone()`, and `DateTime`
adds the extra requirement that the specific civil time must resolve in that
zone. If you need an exact offset with no timezone database lookup, use
`utcOffset` instead.

### DayOfWeek

```ts
dayOfWeekFromString("wednesday");
dayOfWeekToString(DayOfWeek.SUNDAY); // "SUNDAY"
```

`DayOfWeek` helpers validate the protobuf enum values
`DAY_OF_WEEK_UNSPECIFIED` through `SUNDAY` and provide canonical enum-name
string conversion.

### Fraction

```ts
fraction(1n, 2n);
fractionFromString("3"); // 3/1
fractionFromString("2/3");
fractionToString(fraction(3n, 4n)); // "3/4"
```

`Fraction` helpers validate the protobuf contract directly: `numerator` is any int64 and `denominator` must be positive. `fractionFromString()` accepts canonical `numerator/denominator` strings and whole-number shorthand like `"3"` for `3/1`. `fractionToString()` always formats canonically as `numerator/denominator`, so valid fractions like `2/3` and `3/1` round-trip without special cases.

### Interval

```ts
interval();
```

`Interval` helpers model the protobuf contract directly: `startTime` is inclusive, `endTime` is exclusive, and `startTime` must be less than or equal to `endTime`. Equal bounds represent an empty interval, and omitting both bounds represents an interval that matches any time.

Temporal conversions to and from
[`Temporal.Instant`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant)
are available from `@protoutil/core/google/type`.

### LatLng

```ts
latLng(37.422, -122.084);
latLng(-90, -180);
latLng(90, 180);
```

`LatLng` helpers validate the protobuf contract directly: unless specified
otherwise, coordinates must conform to the
[WGS84 standard](http://www.unoosa.org/pdf/icg/2012/template/WGS_84.pdf), and
values must already be normalized. Latitude must be in `[-90, 90]` and
longitude must be in `[-180, 180]`.

### LocalizedText

```ts
localizedText("Hello", "en-US");
localizedText("Zdravo", "sr-Latn");
```

`LocalizedText` helpers validate the protobuf contract directly: `text` is the
localized string, and `languageCode` must be a valid
[BCP 47](https://datatracker.ietf.org/doc/html/bcp47) language tag such as
`"en-US"` or `"sr-Latn"`. For locale identifier details, see the
[Unicode locale identifier](https://www.unicode.org/reports/tr35/#Unicode_locale_identifier)
reference. Shared `isValidLanguageCode()` and `assertValidLanguageCode()`
helpers are also exported for code that needs to validate the same language
tags outside `LocalizedText`.

### Month

```ts
monthFromString("march");
monthToString(Month.SEPTEMBER); // "SEPTEMBER"
```

`Month` helpers validate the protobuf enum values `MONTH_UNSPECIFIED` through `DECEMBER` and provide canonical enum-name string conversion.

### Money

```ts
money("USD", 12n, 340_000_000); // 12.34 USD
moneyFromDecimal("USD", "12.34");
moneyToDecimal(money("USD", -1n, -750_000_000)); // "-1.75"
```

`money()` and `moneyFromDecimal()` accept `CurrencyCode` rather than a raw
string. The union and `CURRENCY_CODES` list are generated from
[`Intl.supportedValuesOf("currency")`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/supportedValuesOf)
using
[ISO 4217](https://www.iso.org/iso-4217-currency-codes.html) currency codes
and can be refreshed with:
`moneyFromDecimal()` accepts strings, whole-number `bigint`s, and finite non-scientific `number`s. Money values support at most 9 fractional digits, and `units`/`nanos` must use compatible signs.

```bash
pnpm --dir packages/core run update:currencies
```

### PhoneNumber

```ts
phoneNumber({ e164Number: "+15552220123" });
phoneNumber({ e164Number: "+15552220123", extension: "123,#" });
phoneNumber({ shortCode: { regionCode: "US", number: "611" } });
phoneNumberShortCode("BB", "211");
```

`PhoneNumber` helpers validate the protobuf wire contract directly: each value
must include either a relaxed
[ITU E.164](https://www.itu.int/rec/T-REC-E.164-201011-I) number or a short
code. E.164 numbers must start with `+` and contain digits only, with no
spaces or locale-specific formatting such as `"+1 (650) 253-0000 ext. 123"`.
National-only numbers are not allowed.

Short codes must include both a valid
[Unicode region subtag](https://www.unicode.org/reports/tr35/#unicode_region_subtag)
such as `"US"` or `"BB"` and digits-only short-code number text with no
leading `+` or country calling code. `extension` is optional and may include
dialing characters such as `,` and `#`, but may not contain more than 40
digits. Shared `isValidRegionCode()` and `assertValidRegionCode()` helpers are
also exported for callers that need the same region validation directly.

### PostalAddress

```ts
postalAddress({
  regionCode: "US",
  addressLines: ["1600 Amphitheatre Parkway"],
  locality: "Mountain View",
  administrativeArea: "CA",
  postalCode: "94043",
});
```

`PostalAddress` helpers validate the protobuf wire contract directly:
`revision` must be `0`, `regionCode` is required and must be a valid CLDR /
Unicode region code such as `"US"` or `"CH"`, and `languageCode`, when
present, must be a valid
[BCP 47](https://datatracker.ietf.org/doc/html/bcp47) language tag.

Region validation uses an explicit
[Unicode CLDR](https://cldr.unicode.org/index/downloads) region-code table,
generated from the CLDR JSON
[`territoryContainment.json`](https://github.com/unicode-org/cldr-json/blob/main/cldr-json/cldr-core/supplemental/territoryContainment.json)
dataset, rather than relying only on syntactic shape checks.

The helper does not impose country-specific postal rules beyond what the proto
docs require. The protobuf docs explicitly allow minimally structured
addresses that use `regionCode` plus unstructured `addressLines`, so this
helper accepts that pattern without trying to infer locality or administrative
fields.

### Quaternion

```ts
quaternion(0, 0, 0, 1);
quaternion(0.5, -0.5, 0.5, -0.5);
quaternion(2, 0, 0, 0);
```

`Quaternion` helpers follow the protobuf wire contract directly: `x`, `y`,
`z`, and `w` must be finite real-number components. The protobuf docs describe
Hamilton-convention quaternion semantics and recommend normalization practices
for rotations, but this helper does not normalize values, enforce unit length,
or require positive `w`. Those choices are left to callers and service-level
policy.

### TimeZone

```ts
timeZone("UTC");
timeZone("America/New_York", "2024a");
```

`TimeZone` helpers validate the protobuf wire contract directly: `id` must be a
non-empty recognized
[IANA Time Zone Database](https://www.iana.org/time-zones) zone ID such as
`"America/New_York"` or `"UTC"`. `version` is preserved as optional metadata
and is not interpreted or validated by this helper.

### TimeOfDay

```ts
timeOfDay(8, 48, 1, 234_000_000);
timeOfDayFromString("08:48:01.234");
timeOfDayToString(timeOfDay(23, 59, 59, 999_999_999)); // "23:59:59.999999999"
```

`TimeOfDay` helpers are intentionally strict in v1: they accept `00:00:00` through `23:59:59.999999999`, but do not currently allow `24:00:00` or leap-second `:60` values.

Temporal conversions for `TimeOfDay` are available from
`@protoutil/core/google/type`.

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

## API Reference

### `@protoutil/core`

| Export | Description |
|--------|-------------|
| `checksum(schema, message)` | Calculate a non-cryptographic checksum for a message |
| `getField(message, field)` | Get a field value from a message (supports oneof) |
| `setField(message, field, value)` | Set a field value on a message (supports oneof) |
| `assertValidInt32(num)` / `isValidInt32(num)` | Validate 32-bit signed integers |
| `assertValidInt64(num)` / `isValidInt64(num)` | Validate 64-bit signed integers |
| `assertValidUInt32(num)` / `isValidUInt32(num)` | Validate 32-bit unsigned integers |
| `assertValidUInt64(num)` / `isValidUInt64(num)` | Validate 64-bit unsigned integers |
| `OutOfRangeError` | Error for out-of-range values |
| `InvalidValueError` | Error for invalid values |

### `@protoutil/core/wkt`

| Export | Description |
|--------|-------------|
| `duration(seconds, nanos?)` | Create a validated Duration |
| `assertValidDuration(d)` / `isValidDuration(d)` | Validate a Duration |
| `durationToString(d)` | Convert Duration to string |
| `durationFromNanos(n)` / `durationNanos(d)` | Convert Duration to/from nanoseconds |
| `clampDuration(d, min?, max?)` | Clamp a Duration to a range |
| `timestamp(seconds, nanos?)` | Create a validated Timestamp |
| `assertValidTimestamp(ts)` / `isValidTimestamp(ts)` | Validate a Timestamp |
| `timestampFromNanos(n)` / `timestampNanos(ts)` | Convert Timestamp to/from nanoseconds |
| `roundTimestampNanos(ts)` | Round Timestamp nanos to an integer |
| `clampTimestamp(ts, min?, max?)` | Clamp a Timestamp to a range |
| `fieldMask(schema, paths, strict?)` | Create a validated FieldMask |
| `assertValidFieldMask(schema, fm, strict?)` / `isValidFieldMask(schema, fm, strict?)` | Validate a FieldMask |
| `fieldMaskHasPath(fm, path, strict?)` | Check if a FieldMask matches a path |
| `applyFieldMask(schema, message, fm, opts?)` | Apply a FieldMask to a message. Options: `{ inverse?, strict? }` |
| `mergeFieldMasks(...masks)` | Merge multiple FieldMasks |
| `intersectFieldMasks(...masks)` | Intersect multiple FieldMasks |
