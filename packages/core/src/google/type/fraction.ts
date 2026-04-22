import { create } from "@bufbuild/protobuf";
import { InvalidValueError } from "../../errors.js";
import { type Fraction, FractionSchema } from "../../gen/google/type/fraction_pb.js";
import { assertValidInt64 } from "../../int64.js";

const FRACTION_RE = /^([+-]?\d+)(?:\/(\d+))?$/;

/**
 * Creates a validated `google.type.Fraction` value.
 *
 * The denominator must be positive.
 */
export function fraction(numerator = 0n, denominator = 1n) {
  const value = create(FractionSchema, { numerator, denominator });
  assertValidFraction(value);
  return value;
}

/**
 * Asserts that a `google.type.Fraction` is structurally valid.
 */
export function assertValidFraction(value: Fraction): asserts value is Fraction {
  assertValidInt64(value.numerator);
  assertValidInt64(value.denominator);
  if (value.denominator <= 0n) {
    throw new InvalidValueError("denominator must be positive", value.denominator);
  }
}

/**
 * Returns `true` when the value is a valid `google.type.Fraction`.
 */
export function isValidFraction(value: Fraction): value is Fraction {
  try {
    assertValidFraction(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a `google.type.Fraction` from `numerator/denominator`.
 *
 * Whole numbers like `3` are accepted as shorthand for `3/1`.
 */
export function fractionFromString(value: string) {
  const match = value.trim().match(FRACTION_RE);
  if (!match) {
    throw new InvalidValueError("invalid google.type.Fraction string", value);
  }
  return fraction(BigInt(match[1]), BigInt(match[2] ?? "1"));
}

/**
 * Formats a `google.type.Fraction` value as `numerator/denominator`.
 */
export function fractionToString(value: Fraction) {
  assertValidFraction(value);
  return `${value.numerator}/${value.denominator}`;
}
