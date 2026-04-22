import { create } from "@bufbuild/protobuf";
import { InvalidValueError, OutOfRangeError } from "../../errors.js";
import { type Money, MoneySchema } from "../../gen/google/type/money_pb.js";
import { assertValidInt32 } from "../../int32.js";
import { assertValidInt64 } from "../../int64.js";
import { type CurrencyCode, isCurrencyCode } from "./currency-codes.js";
import { MAX_NANOS, padNumber, parseDecimalString, trimTrailingZeros } from "./shared.js";

/**
 * Creates a validated `google.type.Money` value.
 *
 * Currency codes must be supported
 * [ISO 4217](https://www.iso.org/iso-4217-currency-codes.html) values.
 * `units` and `nanos` must use compatible signs, except that zero units may
 * be paired with positive or negative nanos.
 */
export function money(currencyCode: CurrencyCode, units = 0n, nanos = 0) {
  const value = create(MoneySchema, { currencyCode, units, nanos });
  assertValidMoney(value);
  return value;
}

/**
 * Asserts that a `google.type.Money` is structurally valid.
 *
 * `nanos` must be within `[-999_999_999, 999_999_999]`, and the sign rules
 * from the protobuf type are enforced.
 */
export function assertValidMoney(value: Money): asserts value is Money {
  if (!isCurrencyCode(value.currencyCode)) {
    throw new InvalidValueError(
      "currencyCode must be a supported ISO 4217 currency code",
      value.currencyCode,
    );
  }
  assertValidInt64(value.units);
  assertValidInt32(value.nanos);
  if (value.nanos < -MAX_NANOS || value.nanos > MAX_NANOS) {
    throw new OutOfRangeError("nanos out of range", value.nanos, -MAX_NANOS, MAX_NANOS);
  }
  if ((value.units > 0n && value.nanos < 0) || (value.units < 0n && value.nanos > 0)) {
    throw new InvalidValueError("units and nanos must have the same sign", value);
  }
}

/**
 * Returns `true` when the value is a valid `google.type.Money`.
 */
export function isValidMoney(value: Money): value is Money {
  try {
    assertValidMoney(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a decimal amount into a `google.type.Money` value.
 *
 * Supports strings, whole-number `bigint`s, and finite non-scientific
 * `number`s.
 *
 * Parsed values support at most 9 fractional digits. Scientific notation is
 * rejected for `number` inputs; pass a plain decimal string instead.
 */
export function moneyFromDecimal(currencyCode: CurrencyCode, value: string | number | bigint) {
  if (typeof value === "bigint") {
    return money(currencyCode, value, 0);
  }

  const text = typeof value === "number" ? normalizeNumber(value) : value.trim();
  const parsed = parseDecimalString(text, {
    allowExponent: false,
    errorMessage: "invalid decimal money amount",
  });
  const fraction = parsed.fractionPart;
  if (fraction.length > 9) {
    throw new InvalidValueError("money amounts support at most 9 fractional digits", value);
  }

  const units = BigInt(parsed.integerPart || "0") * BigInt(parsed.sign);
  const nanos = Number(fraction.padEnd(9, "0") || "0") * parsed.sign;
  return money(currencyCode, units, nanos);
}

/**
 * Formats a `google.type.Money` value as a decimal string.
 *
 * The output preserves up to 9 fractional digits and trims trailing zeroes.
 */
export function moneyToDecimal(value: Money) {
  assertValidMoney(value);

  const negative = value.units < 0n || value.nanos < 0;
  const units = negative ? -value.units : value.units;
  const nanos = Math.abs(value.nanos);
  if (nanos === 0) {
    return `${negative ? "-" : ""}${units}`;
  }

  const fraction = trimTrailingZeros(padNumber(nanos, 9));
  return `${negative ? "-" : ""}${units}.${fraction}`;
}

function normalizeNumber(value: number) {
  if (!Number.isFinite(value)) {
    throw new InvalidValueError("money amount must be finite", value);
  }
  const text = value.toString();
  if (/[eE]/.test(text)) {
    throw new InvalidValueError(
      "scientific notation is not supported for money amounts; pass a string instead",
      value,
    );
  }
  return text;
}
