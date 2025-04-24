import { OutOfRangeError } from './errors.js';

/**
 * The minimum Int64 value.
 */
export const MIN_INT64 = -(2n ** 63n);

/**
 * The maximum Int64 value.
 */
export const MAX_INT64 = 2n ** 63n - 1n;

/**
 * Asserts that a value is a valid Int64 protobuf value.
 */
export function assertValidInt64(value: bigint) {
  if (value < MIN_INT64 || value > MAX_INT64) {
    throw new OutOfRangeError(`out-of-range Int64`, value, MIN_INT64, MAX_INT64);
  }
}

/**
 * Returns true if the value is a valid Int64 protobuf value.
 */
export function isValidInt64(value: bigint) {
  try {
    assertValidInt64(value);
    return true;
  } catch {
    return false;
  }
}
