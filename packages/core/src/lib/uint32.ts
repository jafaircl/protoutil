import { InvalidValueError, OutOfRangeError } from './errors.js';

/**
 * The maximum UInt32 value.
 */
export const MAX_UINT32 = 2 ** 32 - 1;

/**
 * Asserts that a value is a valid UInt32 protobuf value.
 */
export function assertValidUInt32(value: number) {
  if (Number.isNaN(value) || !Number.isInteger(value)) {
    throw new InvalidValueError(`not an integer`, value);
  }
  if (value < 0 || value > MAX_UINT32) {
    throw new OutOfRangeError(`out-of-range UInt32`, value, 0, MAX_UINT32);
  }
}

/**
 * Returns true if the value is a valid UInt32 protobuf value.
 */
export function isValidUInt32(value: number) {
  try {
    assertValidUInt32(value);
    return true;
  } catch {
    return false;
  }
}
