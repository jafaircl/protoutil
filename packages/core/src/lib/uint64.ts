import { OutOfRangeError } from './errors.js';

/**
 * The maximum UInt64 value.
 */
export const MAX_UINT64 = 2n ** 64n - 1n;

/**
 * Asserts that a value is a valid UInt64 protobuf value.
 */
export function assertValidUInt64(value: bigint) {
  if (value < 0n || value > MAX_UINT64) {
    throw new OutOfRangeError(`out-of-range UInt64`, value, 0n, MAX_UINT64);
  }
}

/**
 * Returns true if the value is a valid UInt64 protobuf value.
 */
export function isValidUInt64(value: bigint) {
  try {
    assertValidUInt64(value);
    return true;
  } catch {
    return false;
  }
}
