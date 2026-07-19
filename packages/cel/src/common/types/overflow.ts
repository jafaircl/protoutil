import {
  errDivideByZero,
  errIntOverflow,
  errModulusByZero,
  errTimestampOverflowValue,
  errUintOverflow,
} from "./err.js";

const MAX_INT64 = 9_223_372_036_854_775_807n;
const MIN_INT64 = -9_223_372_036_854_775_808n;
const MAX_UINT64 = 18_446_744_073_709_551_615n;
const SECOND_NANOS = 1_000_000_000n;

/**
 * Number of seconds between `0001-01-01T00:00:00Z` and the Unix epoch.
 */
export const minUnixTime = -62_135_596_800n;

/**
 * Number of seconds between `9999-12-31T23:59:59.999999999Z` and the Unix epoch.
 */
export const maxUnixTime = 253_402_300_799n;

/**
 * doubleTwoTo64 mirrors the cel-go constant used by floating-point uint conversions.
 */
export const doubleTwoTo64 = 2 ** 64;

/**
 * addInt64Checked performs addition with overflow detection of two int64 values.
 *
 * If the operation fails the error is thrown.
 */
export function addInt64Checked(x: bigint, y: bigint): bigint {
  if ((y > 0n && x > MAX_INT64 - y) || (y < 0n && x < MIN_INT64 - y)) {
    throw errIntOverflow;
  }
  return x + y;
}

/**
 * subtractInt64Checked performs subtraction with overflow detection of two int64 values.
 *
 * If the operation fails the error is thrown.
 */
export function subtractInt64Checked(x: bigint, y: bigint): bigint {
  if ((y < 0n && x > MAX_INT64 + y) || (y > 0n && x < MIN_INT64 + y)) {
    throw errIntOverflow;
  }
  return x - y;
}

/**
 * negateInt64Checked performs negation with overflow detection of an int64.
 *
 * If the operation fails the error is thrown.
 */
export function negateInt64Checked(x: bigint): bigint {
  // In twos complement, negating MinInt64 would result in a valid of MaxInt64+1.
  if (x === MIN_INT64) {
    throw errIntOverflow;
  }
  return -x;
}

/**
 * multiplyInt64Checked performs multiplication with overflow detection of two int64 value.
 *
 * If the operation fails the error is thrown.
 */
export function multiplyInt64Checked(x: bigint, y: bigint): bigint {
  // Detecting multiplication overflow is more complicated than the others. The first two detect
  // attempting to negate MinInt64, which would result in MaxInt64+1. The other four detect normal
  // overflow conditions.
  if (
    (x === -1n && y === MIN_INT64) ||
    (y === -1n && x === MIN_INT64) ||
    // x is positive, y is positive
    (x > 0n && y > 0n && x > MAX_INT64 / y) ||
    // x is positive, y is negative
    (x > 0n && y < 0n && y < MIN_INT64 / x) ||
    // x is negative, y is positive
    (x < 0n && y > 0n && x < MIN_INT64 / y) ||
    // x is negative, y is negative
    (x < 0n && y < 0n && y < MAX_INT64 / x)
  ) {
    throw errIntOverflow;
  }
  return x * y;
}

/**
 * divideInt64Checked performs division with overflow detection of two int64 values,
 * as well as a division by zero check.
 *
 * If the operation fails the error is thrown.
 */
export function divideInt64Checked(x: bigint, y: bigint): bigint {
  // Division by zero.
  if (y === 0n) {
    throw errDivideByZero;
  }
  // In twos complement, negating MinInt64 would result in a valid of MaxInt64+1.
  if (x === MIN_INT64 && y === -1n) {
    throw errIntOverflow;
  }
  return x / y;
}

/**
 * moduloInt64Checked performs modulo with overflow detection of two int64 values
 * as well as a modulus by zero check.
 *
 * If the operation fails the error is thrown.
 */
export function moduloInt64Checked(x: bigint, y: bigint): bigint {
  // Modulus by zero.
  if (y === 0n) {
    throw errModulusByZero;
  }
  // In twos complement, negating MinInt64 would result in a valid of MaxInt64+1.
  if (x === MIN_INT64 && y === -1n) {
    throw errIntOverflow;
  }
  return x % y;
}

/**
 * addUint64Checked performs addition with overflow detection of two uint64 values.
 *
 * If the operation fails due to overflow the error is thrown.
 */
export function addUint64Checked(x: bigint, y: bigint): bigint {
  if (y > 0n && x > MAX_UINT64 - y) {
    throw errUintOverflow;
  }
  return x + y;
}

/**
 * subtractUint64Checked performs subtraction with overflow detection of two uint64 values.
 *
 * If the operation fails due to overflow the error is thrown.
 */
export function subtractUint64Checked(x: bigint, y: bigint): bigint {
  if (y > x) {
    throw errUintOverflow;
  }
  return x - y;
}

/**
 * multiplyUint64Checked performs multiplication with overflow detection of two uint64 values.
 *
 * If the operation fails due to overflow the error is thrown.
 */
export function multiplyUint64Checked(x: bigint, y: bigint): bigint {
  if (y !== 0n && x > MAX_UINT64 / y) {
    throw errUintOverflow;
  }
  return x * y;
}

/**
 * divideUint64Checked performs division with a test for division by zero.
 *
 * If the operation fails the error is thrown.
 */
export function divideUint64Checked(x: bigint, y: bigint): bigint {
  if (y === 0n) {
    throw errDivideByZero;
  }
  return x / y;
}

/**
 * moduloUint64Checked performs modulo with a test for modulus by zero.
 *
 * If the operation fails the error is thrown.
 */
export function moduloUint64Checked(x: bigint, y: bigint): bigint {
  if (y === 0n) {
    throw errModulusByZero;
  }
  return x % y;
}

/**
 * doubleToInt64Checked converts a double to int64 with CEL overflow semantics.
 *
 * If the operation fails the error is thrown.
 */
export function doubleToInt64Checked(value: number): bigint {
  if (
    !Number.isFinite(value) ||
    Number.isNaN(value) ||
    value <= Number(MIN_INT64) ||
    value >= Number(MAX_INT64)
  ) {
    throw errIntOverflow;
  }
  return BigInt(Math.trunc(value));
}

/**
 * doubleToUint64Checked converts a double to uint64 with CEL overflow semantics.
 *
 * If the operation fails the error is thrown.
 */
export function doubleToUint64Checked(value: number): bigint {
  if (!Number.isFinite(value) || Number.isNaN(value) || value < 0 || value >= doubleTwoTo64) {
    throw errUintOverflow;
  }
  return BigInt(Math.trunc(value));
}

/**
 * int64ToUint64Checked converts an int64 to uint64 with overflow detection.
 *
 * If the operation fails the error is thrown.
 */
export function int64ToUint64Checked(value: bigint): bigint {
  if (value < 0n) {
    throw errUintOverflow;
  }
  return value;
}

/**
 * uint64ToInt64Checked converts a uint64 to int64 with overflow detection.
 *
 * If the operation fails the error is thrown.
 */
export function uint64ToInt64Checked(value: bigint): bigint {
  if (value > MAX_INT64) {
    throw errIntOverflow;
  }
  return value;
}

/**
 * addDurationChecked performs addition with overflow detection of two durations in nanoseconds.
 *
 * If the operation fails due to overflow the error is thrown.
 */
export function addDurationChecked(x: bigint, y: bigint): bigint {
  return addInt64Checked(x, y);
}

/**
 * subtractDurationChecked performs subtraction with overflow detection of two durations in nanoseconds.
 *
 * If the operation fails due to overflow the error is thrown.
 */
export function subtractDurationChecked(x: bigint, y: bigint): bigint {
  return subtractInt64Checked(x, y);
}

/**
 * negateDurationChecked performs negation with overflow detection of a duration in nanoseconds.
 *
 * If the operation fails due to overflow the error is thrown.
 */
export function negateDurationChecked(x: bigint): bigint {
  return negateInt64Checked(x);
}

/**
 * addTimeDurationChecked performs addition with overflow detection of a timestamp and duration.
 *
 * If the operation fails due to overflow the error is thrown.
 */
export function addTimeDurationChecked(
  xSeconds: bigint,
  xNanos: number,
  durationNanos: bigint,
): { seconds: bigint; nanos: number } {
  const sec1 = xSeconds;
  const nsec1 = BigInt(xNanos);
  const sec2 = durationNanos / SECOND_NANOS;
  const nsec2 = durationNanos % SECOND_NANOS;

  let sec = addInt64Checked(sec1, sec2);
  let nsec = nsec1 + nsec2;

  if (nsec < 0n || nsec >= SECOND_NANOS) {
    sec = addInt64Checked(sec, nsec / SECOND_NANOS);
    nsec -= (nsec / SECOND_NANOS) * SECOND_NANOS;
    if (nsec < 0n) {
      sec = addInt64Checked(sec, -1n);
      nsec += SECOND_NANOS;
    }
  }

  if (sec < minUnixTime || sec > maxUnixTime) {
    throw errTimestampOverflowValue;
  }

  return { seconds: sec, nanos: Number(nsec) };
}

/**
 * subtractTimeChecked performs subtraction with overflow detection of two timestamps.
 *
 * If the operation fails due to overflow the error is thrown.
 */
export function subtractTimeChecked(
  xSeconds: bigint,
  xNanos: number,
  ySeconds: bigint,
  yNanos: number,
): bigint {
  const sec = subtractInt64Checked(xSeconds, ySeconds);
  const nsec = BigInt(xNanos) - BigInt(yNanos);
  const tsec = multiplyInt64Checked(sec, SECOND_NANOS);
  return addInt64Checked(tsec, nsec);
}

/**
 * subtractTimeDurationChecked performs subtraction with overflow detection of a timestamp and duration.
 *
 * If the operation fails due to overflow the error is thrown.
 */
export function subtractTimeDurationChecked(
  xSeconds: bigint,
  xNanos: number,
  durationNanos: bigint,
): { seconds: bigint; nanos: number } {
  return addTimeDurationChecked(xSeconds, xNanos, negateDurationChecked(durationNanos));
}
