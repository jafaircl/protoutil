import { Double } from "./double.js";
import { type Int, IntNegOne, IntOne, IntZero } from "./int.js";
import type { Val } from "./ref/index.js";
import type { Uint } from "./uint.js";

/**
 * MAX_INT64 is the maximum signed 64-bit integer value.
 */
export const MAX_INT64 = 9223372036854775807n;
/**
 * MIN_INT64 is the minimum signed 64-bit integer value.
 */
export const MIN_INT64 = -9223372036854775808n;
/**
 * MAX_UINT64 is the maximum unsigned 64-bit integer value.
 */
export const MAX_UINT64 = 18446744073709551615n;

/**
 * compareDoubleInt orders a CEL double against a CEL int.
 */
export function compareDoubleInt(d: Double, i: Int): Int {
  if (d.value() < Number(MIN_INT64)) {
    return IntNegOne;
  }
  if (d.value() > Number(MAX_INT64)) {
    return IntOne;
  }
  return compareDouble(d, new Double(Number(i.value())));
}

/**
 * compareIntDouble orders a CEL int against a CEL double.
 */
export function compareIntDouble(i: Int, d: Double): Int {
  return compareDoubleInt(d, i).negate() as Int;
}

/**
 * compareDoubleUint orders a CEL double against a CEL uint.
 */
export function compareDoubleUint(d: Double, u: Uint): Int {
  if (d.value() < 0) {
    return IntNegOne;
  }
  if (d.value() > Number(MAX_UINT64)) {
    return IntOne;
  }
  return compareDouble(d, new Double(Number(u.value())));
}

/**
 * compareUintDouble orders a CEL uint against a CEL double.
 */
export function compareUintDouble(u: Uint, d: Double): Int {
  return compareDoubleUint(d, u).negate() as Int;
}

/**
 * compareIntUint orders a CEL int against a CEL uint.
 */
export function compareIntUint(i: Int, u: Uint): Int {
  const iv = i.value();
  const uv = u.value();
  if (iv < 0n || uv > MAX_INT64) {
    return IntNegOne;
  }
  if (iv < uv) {
    return IntNegOne;
  }
  if (iv > uv) {
    return IntOne;
  }
  return IntZero;
}

/**
 * compareUintInt orders a CEL uint against a CEL int.
 */
export function compareUintInt(u: Uint, i: Int): Int {
  return compareIntUint(i, u).negate() as Int;
}

/**
 * compareDouble orders two CEL doubles.
 */
export function compareDouble(a: Double, b: Double): Int {
  if (a.value() < b.value()) {
    return IntNegOne;
  }
  if (a.value() > b.value()) {
    return IntOne;
  }
  return IntZero;
}

/**
 * compareInt orders two CEL ints.
 */
export function compareInt(a: Int, b: Int): Val {
  if (a.value() < b.value()) {
    return IntNegOne;
  }
  if (a.value() > b.value()) {
    return IntOne;
  }
  return IntZero;
}

/**
 * compareUint orders two CEL uints.
 */
export function compareUint(a: Uint, b: Uint): Val {
  if (a.value() < b.value()) {
    return IntNegOne;
  }
  if (a.value() > b.value()) {
    return IntOne;
  }
  return IntZero;
}
