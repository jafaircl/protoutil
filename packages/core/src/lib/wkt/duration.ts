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
    throw new OutOfRangeError(
      'out-of-range nanos',
      d.nanos,
      -999_999_999,
      999_999_999
    );
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
 * Create a google.protobuf.Duration message from a string. The string must end with 's' and can be
 * in the format of '3s' for 3 seconds or '3.000000001s' for 3 seconds and 1 nanosecond.
 * Sub-nanosecond precision is not supported.
 */
export function durationFromString(str: string) {
  if (!str.endsWith('s')) {
    throw new Error(`duration string must end with 's'`);
  }
  const secondsStr = str.slice(0, -1);
  const [seconds, nanos] = secondsStr.split('.');
  const isNegative = seconds.startsWith('-');
  if (nanos && nanos.length > 9) {
    throw new Error(`out-of-range nanos`);
  }
  let nanosInt = nanos ? parseInt(nanos, 10) : 0;
  // If the string is negative, we need to negate the nanos value. We also need to make sure we
  // don't end up with -0.
  if (isNegative && nanosInt > 0) {
    nanosInt = -nanosInt;
  }
  return create(DurationSchema, {
    seconds: BigInt(seconds),
    nanos: nanosInt,
  });
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
  const seconds = BigInt(Math.floor(totalSeconds));
  const remainingNanos = Math.round(
    (totalSeconds % 1) * Number(NANOS_PER_SECOND)
  );
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
export function clampDuration(
  value: Duration,
  min = MIN_DURATION,
  max = MAX_DURATION
): Duration {
  const nanos = durationNanos(value);
  if (nanos < durationNanos(min)) {
    return min;
  }
  if (nanos > durationNanos(max)) {
    return max;
  }
  return value;
}
