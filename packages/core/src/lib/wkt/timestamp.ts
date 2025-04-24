import { create } from '@bufbuild/protobuf';
import {
  Timestamp,
  timestampDate,
  timestampFromDate,
  TimestampSchema,
} from '@bufbuild/protobuf/wkt';
import { Temporal } from 'temporal-polyfill';
import { assertValidInt32 } from '../int32.js';
import { assertValidInt64 } from '../int64.js';

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
export function assertValidTimestamp(ts: Timestamp) {
  assertValidInt64(ts.seconds);
  assertValidInt32(ts.nanos);
  const roundedNanos = BigInt(Math.round(ts.nanos));
  const totalNanos = ts.seconds * NANOS_PER_SECOND + roundedNanos;
  if (totalNanos < MIN_UNIX_TIME_NANOS) {
    throw new Error('before 0001-01-01');
  }
  if (totalNanos > MAX_UNIX_TIME_NANOS) {
    throw new Error('after 9999-12-31');
  }
  if (ts.nanos < 0 || ts.nanos > 999_999_999) {
    throw new Error('out-of-range nanos');
  }
}

/**
 * Ensure a timestamp is a valid google.protobuf.Timestamp. The range is from 0001-01-01T00:00:00Z
 * to 9999-12-31T23:59:59.999999999Z. By restricting to that range, we ensure that we can convert to
 * and from [RFC 3339](https://www.ietf.org/rfc/rfc3339.txt) date strings. In addition, the nanos
 * value must be between 0 and 999,999,999 inclusive.
 */
export function isValidTimestamp(ts: Timestamp) {
  try {
    assertValidTimestamp(ts);
    return true;
  } catch {
    return false;
  }
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
  // Negative second values with fractions must still have non-negative nanos values that count
  // forward in time. Must be from 0 to 999,999,999 inclusive.
  // See: https://github.com/protocolbuffers/protobuf/blob/main/src/google/protobuf/timestamp.proto
  const seconds = instant.epochNanoseconds / NANOS_PER_SECOND;
  let nanos = Number(instant.epochNanoseconds % NANOS_PER_SECOND);
  // If the number of nanoseconds is negative, we need to adjust the seconds and nanoseconds. If
  // they were pure numbers, we could just define seconds with Math.floor. But since we are using
  // BigInt, we need to do it manually.
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
    return timestamp(seconds - 1n, nanos);
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
 * Parses a string as an unsigned integer between min and max.
 */
function parseUint(s: string, min: number, max: number) {
  const parsed = parseInt(s, 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return min;
  }
  return parsed;
}

/**
 * Parses a timestamp from a string. Will accept RFC3339 timestamps with or
 * without nanoseconds and with or without a timezone or ISO8601 timestamps
 * with or without a timezone.
 *
 * Example values:
 * - `1970-01-01T02:07:34.000000321Z`
 * - `1970-01-01T02:07:34.000000321+07:00`
 * - `2011-10-05T14:48:00.000Z`
 * - `2011-10-05T14:48:00.000-04:00`
 *
 * This function is based on the Go implementation of RFC3339 parsing:
 * @see https://cs.opensource.google/go/go/+/refs/tags/go1.23.3:src/time/format_rfc3339.go
 */
export function timestampFromDateString(value: string) {
  if (value.length < '2006-01-02T15:04:05'.length) {
    return null;
  }
  const year = parseUint(value.slice(0, 4), 0, 9999); // e.g., 2006
  const month = parseUint(value.slice(5, 7), 1, 12); // e.g., 01
  const day = parseUint(value.slice(8, 10), 1, 31); // e.g., 02
  const hour = parseUint(value.slice(11, 13), 0, 23); // e.g., 15
  const min = parseUint(value.slice(14, 16), 0, 59); // e.g., 04
  const sec = parseUint(value.slice(17, 19), 0, 59); // e.g., 05

  value = value.slice(19);

  // Parse the fractional second.
  let nanos = 0;
  if (value.length > 1 && value[0] === '.') {
    value = value.slice(2);
    let i = 0;
    while (i < value.length && '0' <= value[i] && value[i] <= '9') {
      i++;
    }
    const frac = value.slice(0, i);
    nanos = parseInt(frac, 10);
    value = value.slice(i);
  }

  // Construct the date object
  const date = new Date(Date.UTC(year, month - 1, day, hour, min, sec));

  // Parse the timezone
  if (value.length !== 1 || value !== 'Z') {
    if (
      value.length !== '-07:00'.length ||
      (value[0] !== '+' && value[0] !== '-') ||
      value[3] !== ':'
    ) {
      return null;
    }
    const hr = parseUint(value.slice(1, 3), 0, 23); // e.g., 07
    const mm = parseUint(value.slice(4, 6), 0, 59); // e.g., 00
    let zoneOffset = hr * 60 + mm;
    if (value[0] === '-') {
      zoneOffset = -zoneOffset;
    }
    date.setMinutes(date.getMinutes() + zoneOffset);
  }
  const ts = timestampFromDate(date);
  return create(TimestampSchema, {
    seconds: ts.seconds,
    nanos,
  });
}

/**
 * Converts a timestamp to a string. The string will be in RFC3339 format with
 * nanoseconds if the timestamp has nanoseconds. Otherwise, it will be in
 * ISO8061 format. The string will always be in UTC.
 */
export function timestampDateString(ts: Timestamp) {
  const date = timestampDate(ts);
  if (ts.nanos === 0) {
    return date.toISOString();
  }
  const paddedNanos = ts.nanos.toString().padStart(9, '0');
  return date.toISOString().replace(/\.\d+Z$/, `.${paddedNanos}Z`);
}

/**
 * Ensures that the timestamp is rounded to the nearest nanosecond. `assertValidTimestamp`
 * and `isValidTimestamp` will throw an error or return false if the timestamp nanos value
 * is not an integer.
 */
export function roundTimestampNanos(ts: Timestamp) {
  return timestamp(ts.seconds, Math.round(ts.nanos));
}
