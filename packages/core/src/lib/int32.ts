import { InvalidValueError, OutOfRangeError } from './errors.js';

/**
 * The minimum Int32 value.
 */
export const MIN_INT32 = -(2 ** 31);

/**
 * The maxmimum Int32 value.
 */
export const MAX_INT32 = 2 ** 31 - 1;

/**
 * Asserts that a value is a valid Int32 protobuf value.
 */
export function assertValidInt32(value: number) {
  if (Number.isNaN(value) || !Number.isInteger(value)) {
    throw new InvalidValueError(`not an integer`, value);
  }
  if (value < MIN_INT32 || value > MAX_INT32 || value >= Infinity || value <= -Infinity) {
    throw new OutOfRangeError(`out-of-range Int32`, value, MIN_INT32, MAX_INT32);
  }
}

/**
 * Returns true if the value is a valid Int32 protobuf value.
 */
export function isValidInt32(value: number) {
  try {
    assertValidInt32(value);
    return true;
  } catch {
    return false;
  }
}
