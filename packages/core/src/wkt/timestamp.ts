import { create } from "@bufbuild/protobuf";
import { type Timestamp, TimestampSchema } from "@bufbuild/protobuf/wkt";
import { Temporal } from "temporal-polyfill";
import { assertValidInt32 } from "../int32.js";
import { assertValidInt64 } from "../int64.js";

const NANOS_PER_SECOND = 1_000_000_000n;

/**
 * Number of seconds between `0001-01-01T00:00:00Z` and the Unix epoch.
 */
export const MIN_UNIX_TIME_SECONDS = -62135596800;

/**
 * Number of miliseconds between `0001-01-01T00:00:00Z` and the Unix epoch.
 */
export const MIN_UNIX_TIME_MILLIS = MIN_UNIX_TIME_SECONDS * 1_000;

/**
 * Number of nanoseconds between `0001-01-01T00:00:00Z` and the Unix epoch.
 */
export const MIN_UNIX_TIME_NANOS = BigInt(MIN_UNIX_TIME_SECONDS) * NANOS_PER_SECOND;

/**
 * Number of seconds between `9999-12-31T23:59:59.999999999Z` and the Unix epoch.
 */
export const MAX_UNIX_TIME_SECONDS = 253402300799;

/**
 * Number of milliseconds between `9999-12-31T23:59:59.999999999Z` and the Unix epoch.
 */
export const MAX_UNIX_TIME_MILLIS = MAX_UNIX_TIME_SECONDS * 1_000;

/**
 * Number of nanoseconds between `9999-12-31T23:59:59.999999999Z` and the Unix epoch.
 */
export const MAX_UNIX_TIME_NANOS = BigInt(MAX_UNIX_TIME_SECONDS) * NANOS_PER_SECOND;

/**
 * Create a google.protobuf.Timestamp message. In addition to being less verbose, this function
 * will validate the timestamp to ensure it is within the range of valid timestamps. An error will
 * be thrown if the timestamp or any inputs are out of range.
 *
 * Seconds represents seconds of UTC time since Unix epoch 1970-01-01T00:00:00Z. Mustbe from
 * 0001-01-01T00:00:00Z to 9999-12-31T23:59:59Z inclusive.
 *
 * Nanos represents non-negative fractions of a second at nanosecond resolution. Negative second
 * values with fractions must still have non-negative nanos values that count forward in time. Must
 * be from 0 to 999,999,999 inclusive.
 */
export function timestamp(seconds = 0n, nanos = 0) {
  const value = create(TimestampSchema, { seconds, nanos });
  assertValidTimestamp(value);
  return value;
}

/**
 * Assert that a value is a google.protobuf.Timestamp message. This function will throw an error
 * if the value is not a valid Timestamp message. The range is from 0001-01-01T00:00:00Z to
 * 9999-12-31T23:59:59.999999999Z. In addition, the nanos value must be between 0 and
 * 999,999,999 inclusive.
 */
export function assertValidTimestamp(ts: Timestamp): asserts ts is Timestamp {
  assertValidInt64(ts.seconds);
  assertValidInt32(ts.nanos);
  const roundedNanos = BigInt(Math.round(ts.nanos));
  const totalNanos = ts.seconds * NANOS_PER_SECOND + roundedNanos;
  if (totalNanos < MIN_UNIX_TIME_NANOS) {
    throw new Error("before 0001-01-01");
  }
  if (totalNanos > MAX_UNIX_TIME_NANOS) {
    throw new Error("after 9999-12-31");
  }
  if (ts.nanos < 0 || ts.nanos > 999_999_999) {
    throw new Error("out-of-range nanos");
  }
}

/**
 * Ensure a timestamp is a valid google.protobuf.Timestamp. The range is from 0001-01-01T00:00:00Z
 * to 9999-12-31T23:59:59.999999999Z. By restricting to that range, we ensure that we can convert to
 * and from [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) date strings. In addition, the nanos
 * value must be between 0 and 999,999,999 inclusive.
 */
export function isValidTimestamp(ts: Timestamp): ts is Timestamp {
  try {
    assertValidTimestamp(ts);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a google.protobuf.Timestamp message from a Unix timestamp in nanoseconds.
 */
export function timestampFromNanos(ns: bigint) {
  // Negative second values with fractions must still have non-negative nanos values that count
  // forward in time. Must be from 0 to 999,999,999 inclusive.
  // See: https://github.com/protocolbuffers/protobuf/blob/main/src/google/protobuf/timestamp.proto
  const seconds = ns / NANOS_PER_SECOND;
  let nanos = Number(ns % NANOS_PER_SECOND);
  // If the number of nanoseconds is negative, we need to adjust the seconds and nanoseconds. If
  // they were pure numbers, we could just define seconds with Math.floor. But since we are using
  // BigInt, we need to do it manually.
  if (nanos < 0) {
    nanos += Number(NANOS_PER_SECOND);
    return create(TimestampSchema, { seconds: seconds - 1n, nanos });
  }
  return create(TimestampSchema, {
    seconds,
    nanos,
  });
}

/**
 * Convert a google.protobuf.Timestamp to a Unix timestamp in nanoseconds.
 */
export function timestampNanos(timestamp: Timestamp) {
  const seconds = BigInt(timestamp.seconds);
  const nanos = BigInt(timestamp.nanos);
  return seconds * NANOS_PER_SECOND + nanos;
}

/**
 * Ensures that the timestamp is rounded to the nearest nanosecond. `assertValidTimestamp`
 * and `isValidTimestamp` will throw an error or return false if the timestamp nanos value
 * is not an integer.
 */
export function roundTimestampNanos(ts: Timestamp) {
  return timestamp(ts.seconds, Math.round(ts.nanos));
}

/**
 * The maximum google.protobuf.Timestamp value. It is equal to 9999-12-31T23:59:59.999999999Z.
 */
export const MAX_TIMESTAMP = timestampFromNanos(MAX_UNIX_TIME_NANOS);

/**
 * The minimum google.protobuf.Timestamp value. It is equal to 0001-01-01T00:00:00Z.
 */
export const MIN_TIMESTAMP = timestampFromNanos(MIN_UNIX_TIME_NANOS);

/**
 * Clamps a timestamp to the range of valid timestamps. The minimum and maximum
 * values are inclusive. If the timestamp is less than the minimum, it will
 * be set to the minimum. If the timestamp is greater than the maximum,
 * it will be set to the maximum.
 */
export function clampTimestamp(ts: Timestamp, min = MIN_TIMESTAMP, max = MAX_TIMESTAMP) {
  const nanos = timestampNanos(ts);
  if (nanos < timestampNanos(min)) {
    return min;
  }
  if (nanos > timestampNanos(max)) {
    return max;
  }
  return ts;
}

/**
 * Create a google.protobuf.Timestamp for the current time using the Temporal API.
 *
 * @returns A google.protobuf.Timestamp representing the current time.
 */
export function temporalTimestampNow() {
  const now = Temporal.Now.instant();
  return create(TimestampSchema, {
    seconds: now.epochNanoseconds / NANOS_PER_SECOND,
    nanos: Number(now.epochNanoseconds % NANOS_PER_SECOND),
  });
}

/**
 * Create a google.protobuf.Timestamp message from a Temporal Instant.
 */
export function timestampFromInstant(instant: Temporal.Instant) {
  const seconds = instant.epochNanoseconds / NANOS_PER_SECOND;
  let nanos = Number(instant.epochNanoseconds % NANOS_PER_SECOND);
  if (nanos < 0) {
    nanos += Number(NANOS_PER_SECOND);
    return timestamp(seconds - 1n, nanos);
  }
  return create(TimestampSchema, {
    seconds,
    nanos,
  });
}

/**
 * Convert a google.protobuf.Timestamp message to a Temporal Instant.
 */
export function timestampInstant(timestamp: Timestamp) {
  const seconds = BigInt(timestamp.seconds);
  const nanos = BigInt(timestamp.nanos);
  return Temporal.Instant.fromEpochNanoseconds(seconds * NANOS_PER_SECOND + nanos);
}

/**
 * Parses a google.protobuf.Timestamp from a string. This function uses the
 * Temporal API to parse the string. As such, any valid
 * [RFC 9557](https://www.rfc-editor.org/rfc/rfc9557),
 * [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339), or
 * [ISO 8601](https://www.iso.org/iso-8601-date-and-time-format.html) string
 * should be accepted. If an offset and a timezone are both present, any
 * ambiguity will be resolved in favor of the offset.
 */
export function timestampFromString(value: string) {
  if (!dateStringHasBrackets(value) || dateStringHasOffset(value)) {
    return timestampFromInstant(Temporal.Instant.from(value));
  }
  const zoned = Temporal.ZonedDateTime.from(value, { offset: "use" });
  return timestampFromNanos(zoned.epochNanoseconds - BigInt(zoned.offsetNanoseconds));
}

function dateStringHasOffset(value: string) {
  return /([+-]\d{2}:\d{2})/.test(value);
}

function dateStringHasBrackets(value: string) {
  return /(\[.*?\])/.test(value);
}

/**
 * Converts a google.protobuf.Timestamp value to a string. The string will be
 * in [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) format and will
 * always be in UTC.
 */
export function timestampToString(ts: Timestamp) {
  return timestampInstant(ts).toString();
}
