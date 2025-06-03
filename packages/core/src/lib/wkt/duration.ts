import { create } from '@bufbuild/protobuf';
import { Duration, DurationSchema } from '@bufbuild/protobuf/wkt';
import { Temporal } from 'temporal-polyfill';
import { OutOfRangeError } from '../errors.js';
import { assertValidInt32 } from '../int32.js';
import { assertValidInt64 } from '../int64.js';

const NANOS_PER_SECOND = 1_000_000_000n;

/**
 * The maximum number of seconds in a google.protobuf.Duration message. This number is computed
 * from: 60 sec/min * 60 min/hr * 24 hr/day * 365.25 days/year * 10000 years
 */
export const MAX_DURATION_SECONDS = 315_576_000_000n;

/**
 * The maximum number of milliseconds in a google.protobuf.Duration message. This number is
 * computed from: 60 sec/min * 60 min/hr * 24 hr/day * 365.25 days/year * 10000 years * 1000 ms/sec
 */
export const MAX_DURATION_MILLIS = MAX_DURATION_SECONDS * 1_000n;

/**
 * The maximum number of nanoseconds in a google.protobuf.Duration message. This number is
 * computed from: 60 sec/min * 60 min/hr * 24 hr/day * 365.25 days/year * 10000 years *
 * 1000 ms/sec * 1_000_000 ms/nano
 */
export const MAX_DURATION_NANOS = MAX_DURATION_SECONDS * NANOS_PER_SECOND;

/**
 * The minimum number of seconds in a google.protobuf.Duration message. This number is computed
 * from: 60 sec/min * 60 min/hr * 24 hr/day * 365.25 days/year * 10000 years
 */
export const MIN_DURATION_SECONDS = -315_576_000_000n;

/**
 * The minimum number of milliseconds in a google.protobuf.Duration message. This number is
 * computed from: 60 sec/min * 60 min/hr * 24 hr/day * 365.25 days/year * 10000 years * 1000 ms/sec
 */
export const MIN_DURATION_MILLIS = MIN_DURATION_SECONDS * 1_000n;

/**
 * The minimum number of nanoseconds in a google.protobuf.Duration message. This number is
 * computed from: 60 sec/min * 60 min/hr * 24 hr/day * 365.25 days/year * 10000 years *
 * 1000 ms/sec * 1_000_000 ms/nano
 */
export const MIN_DURATION_NANOS = MIN_DURATION_SECONDS * NANOS_PER_SECOND;

/**
 * Create a google.protobuf.Duration message. In addition to being less verbose, this function will
 * validate the duration to ensure it is within the range of valid durations. An error will be
 * thrown if the duration or any inputs are out of range.
 *
 * Seconds represents signed seconds of the span of time. Must be from -315,576,000,000 to
 * +315,576,000,000 inclusive. Note: these bounds are computed from: 60 sec/min * 60 min/hr * 24
 * hr/day * 365.25 days/year * 10000 years
 *
 * Nanos represents signed fractions of a second at nanosecond resolution of the span of time.
 * Durations less than one second are represented with a 0 `seconds` field and a positive or
 * negative `nanos` field. For durations of one second or more, a non-zero value for the `nanos`
 * field must be of the same sign as the `seconds` field. Must be from -999,999,999 to +999,999,999
 * inclusive.
 *
 * Seconds and nanos must be of the same sign. If seconds is negative, nanos must be negative.
 */
export function duration(seconds = 0n, nanos = 0) {
  const value = create(DurationSchema, { seconds, nanos });
  assertValidDuration(value);
  return value;
}

/**
 * Assert that a value is a google.protobuf.Duration message. This function will throw an error
 * if the value is not a valid Duration message. The range is from -315,576,000,000 to
 * +315,576,000,000 inclusive. The `nanos` field must be in the range of -999,999,999 to
 * +999,999,999 inclusive.
 */
export function assertValidDuration(d: Duration) {
  assertValidInt64(d.seconds);
  assertValidInt32(d.nanos);
  if ((d.seconds < 0 && d.nanos > 0) || (d.seconds > 0 && d.nanos < 0)) {
    throw new Error('seconds and nanos with different signs');
  }
  const roundedNanos = BigInt(Math.round(d.nanos));
  const totalNanos = d.seconds * NANOS_PER_SECOND + roundedNanos;
  if (totalNanos < MIN_DURATION_NANOS) {
    throw new OutOfRangeError(
      'exceeds -10000 years',
      totalNanos,
      MIN_DURATION_NANOS,
      MAX_DURATION_NANOS
    );
  }
  if (totalNanos > MAX_DURATION_NANOS) {
    throw new OutOfRangeError(
      'exceeds +10000 years',
      totalNanos,
      MIN_DURATION_NANOS,
      MAX_DURATION_NANOS
    );
  }
  if (d.nanos < -999_999_999 || d.nanos > 999_999_999) {
    throw new OutOfRangeError('out-of-range nanos', d.nanos, -999_999_999, 999_999_999);
  }
}

/**
 * Ensure a duration is a valid google.protobuf.Duration. The range is from -315,576,000,000 to
 * +315,576,000,000 inclusive. The `nanos` field must be in the range of -999,999,999 to
 * +999,999,999 inclusive.
 */
export function isValidDuration(d: Duration) {
  try {
    assertValidDuration(d);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a google.protobuf.Duration message from a string. A duration string is a possibly signed sequence
 * of decimal numbers, each with optional fraction and a unit suffix, such as "300ms", "-1.5h" or "2h45m".
 * Valid time units are "ns", "us" (or "µs"), "ms", "s", "m", "h".
 */
export function durationFromString(
  text: string,
  relativeTo:
    | string
    | Temporal.PlainDateTime
    | Temporal.ZonedDateTime
    | Temporal.PlainDateTimeLike
    | Temporal.ZonedDateTimeLike = Temporal.Now.plainDateTimeISO()
): Duration {
  const temporal = Temporal.Duration.from(durationStringToISO8601DurationString(text));
  return durationFromTemporal(temporal, relativeTo);
}

const durationStringFormatMessage =
  `A duration string is a possibly signed sequence of decimal numbers, each with optional fraction
  and a unit suffix, such as "300ms", "-1.5h" or "2h45m". Valid time units are "ns", "us" (or "µs"),
  "ms", "s", "m", "h".`
    .split('\n')
    .map((line) => line.trim())
    .join(' ');

function durationStringToISO8601DurationString(durationString: string): string {
  if (!durationString || typeof durationString !== 'string') {
    throw new Error('Invalid input: expected a non-empty string');
  }

  // Check for invalid units (Go-like strings don't support units larger than hours)
  const invalidUnits = /(\d+(?:\.\d+)?)(d|w|mo|y)/g;
  if (invalidUnits.test(durationString)) {
    throw new Error(`Invalid input: '${durationString}'. ${durationStringFormatMessage}`);
  }

  // Handle negative durations
  const isNegative = durationString.startsWith('-');
  const duration = isNegative ? durationString.slice(1) : durationString;

  // Parse the Go duration string - Go-like strings only support units up to hours
  const regex = /(\d+(?:\.\d+)?)(ns|µs|us|ms|s|m|h)/g;
  const matches = [...duration.matchAll(regex)];

  if (matches.length === 0) {
    throw new Error(`Invalid input: '${durationString}'. ${durationStringFormatMessage}`);
  }

  // Convert to total seconds
  let totalSeconds = 0;
  const unitMultipliers: Record<string, number> = {
    ns: 1e-9,
    µs: 1e-6,
    us: 1e-6, // Alternative microsecond notation
    ms: 1e-3,
    s: 1,
    m: 60,
    h: 3600,
  };

  for (const match of matches) {
    const value = parseFloat(match[1]);
    const unit = match[2];
    totalSeconds += value * unitMultipliers[unit];
  }

  // Round to nearest nanosecond precision
  const totalNanoseconds = Math.round(totalSeconds * 1e9);
  const roundedTotalSeconds = totalNanoseconds / 1e9;

  // Convert to ISO 8601 format
  const hours = Math.floor(roundedTotalSeconds / 3600);
  const minutes = Math.floor((roundedTotalSeconds % 3600) / 60);
  const seconds = roundedTotalSeconds % 60;

  let iso8601 = 'PT';

  if (hours > 0) {
    iso8601 += `${hours}H`;
  }

  if (minutes > 0) {
    iso8601 += `${minutes}M`;
  }

  if (seconds > 0) {
    // Format seconds to remove unnecessary trailing zeros
    const formattedSeconds =
      seconds % 1 === 0 ? seconds.toString() : seconds.toFixed(9).replace(/\.?0+$/, '');
    iso8601 += `${formattedSeconds}S`;
  }

  // Handle zero duration
  if (iso8601 === 'PT') {
    iso8601 = 'PT0S';
  }

  // Add negative sign if needed
  return isNegative ? `-${iso8601}` : iso8601;
}

/**
 * Convert a google.protobuf.Duration message to a string. The string will be in the format of
 * '3s' for 3 seconds or '3.000000001s' for 3 seconds and 1 nanosecond.
 */
export function durationString(d: Duration) {
  const nanos = durationNanos(d);
  const seconds = nanos / NANOS_PER_SECOND;
  let remainingNanos = nanos % NANOS_PER_SECOND;
  if (!remainingNanos) {
    return `${seconds}s`;
  }
  if (remainingNanos < 0) {
    remainingNanos = -remainingNanos;
  }
  const nanosStr = remainingNanos.toString().padStart(9, '0');
  return `${seconds}.${nanosStr}s`;
}

/**
 * Create a google.protobuf.Duration message from a number of nanoseconds
 */
export function durationFromNanos(nanos: bigint) {
  const seconds = nanos / NANOS_PER_SECOND;
  const remainingNanos = nanos % NANOS_PER_SECOND;
  return create(DurationSchema, {
    seconds,
    nanos: Number(remainingNanos),
  });
}

/**
 * Convert a google.protobuf.Duration message to a number of nanoseconds.
 */
export function durationNanos(d: Duration) {
  return d.seconds * NANOS_PER_SECOND + BigInt(d.nanos);
}

/**
 * Convert a Temporal.Duration to a google.protobuf.Duration message. Optionally accepts a
 * `relativeTo` argument to balance the duration. The `relativeTo` argument can be any value
 * that can be passed to the `relativeTo` parameter for `Temporal.Duration.round()`. The default
 * is the current time.
 */
export function durationFromTemporal(
  duration: Temporal.Duration,
  relativeTo:
    | string
    | Temporal.PlainDateTime
    | Temporal.ZonedDateTime
    | Temporal.PlainDateTimeLike
    | Temporal.ZonedDateTimeLike = Temporal.Now.plainDateTimeISO()
) {
  const totalSeconds = duration.total({ unit: 'seconds', relativeTo });
  const seconds = BigInt(totalSeconds < 0 ? Math.ceil(totalSeconds) : Math.floor(totalSeconds));
  const remainingNanos = Math.round((totalSeconds % 1) * Number(NANOS_PER_SECOND));
  return create(DurationSchema, {
    seconds,
    // This will make sure we don't end up with -0.
    nanos: ensureNoNegativeZero(remainingNanos),
  });
}

function ensureNoNegativeZero(value: number) {
  if (Object.is(value, -0)) {
    return 0;
  }
  return value;
}

/**
 * Convert a google.protobuf.Duration message to a Temporal.Duration
 */
export function durationTemporal(duration: Duration) {
  return Temporal.Duration.from({
    seconds: Number(duration.seconds),
    nanoseconds: Number(duration.nanos),
  });
}

/**
 * The minimum google.protobuf.Duration value. This is the same as -315,576,000,000
 * seconds.
 */
export const MIN_DURATION = duration(MIN_DURATION_SECONDS);

/**
 * The maximum google.protobuf.Duration value. This is the same as +315,576,000,000
 * seconds.
 */
export const MAX_DURATION = duration(MAX_DURATION_SECONDS);

/**
 * Clamp a google.protobuf.Duration value to a range of valid durations. The default
 * minimum is -315,576,000,000 seconds and the default maximum is +315,576,000,000 seconds.
 */
export function clampDuration(value: Duration, min = MIN_DURATION, max = MAX_DURATION): Duration {
  const nanos = durationNanos(value);
  if (nanos < durationNanos(min)) {
    return min;
  }
  if (nanos > durationNanos(max)) {
    return max;
  }
  return value;
}
