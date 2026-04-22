import { create } from "@bufbuild/protobuf";
import { InvalidValueError } from "../../errors.js";
import { type Decimal, DecimalSchema } from "../../gen/google/type/decimal_pb.js";
import { parseDecimalString } from "./shared.js";

/**
 * Creates a validated `google.type.Decimal` value.
 *
 * Helper-created values are normalized to a canonical string form.
 *
 * Normalization removes a leading `+`, inserts a leading `0` for
 * fractional-only values like `.5`, lowercases the exponent marker, and drops
 * zero exponents. The helper preserves precision rather than rounding and does
 * not currently impose a maximum precision or scale.
 */
export function decimal(value: string | number | bigint) {
  return create(DecimalSchema, {
    value: normalizeDecimalValue(value),
  });
}

/**
 * Asserts that a `google.type.Decimal` is structurally valid.
 *
 * Validation follows the protobuf decimal grammar: optional sign, significand,
 * and optional exponent. Locale-specific separators such as `,` are rejected.
 */
export function assertValidDecimal(value: Decimal): asserts value is Decimal {
  parseDecimalString(value.value, { errorMessage: "invalid google.type.Decimal string" });
}

/**
 * Returns `true` when the value is a valid `google.type.Decimal`.
 */
export function isValidDecimal(value: Decimal): value is Decimal {
  try {
    assertValidDecimal(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a `google.type.Decimal` from its string form.
 *
 * Parsed values are normalized to a canonical string form.
 *
 * Equivalent values are not otherwise rewritten across decimal and exponent
 * notation, so `2.5e-1` remains `2.5e-1` rather than being reformatted as
 * `0.25`.
 */
export function decimalFromString(value: string) {
  return decimal(value);
}

/**
 * Formats a `google.type.Decimal` using a canonical normalized string form.
 *
 * Trailing fractional zeroes are preserved, but helper formatting still applies
 * the canonical normalization rules documented on {@link decimal}.
 */
export function decimalToString(value: Decimal) {
  assertValidDecimal(value);
  return normalizeDecimalString(value.value);
}

function normalizeDecimalValue(value: string | number | bigint) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new InvalidValueError("decimal value must be finite", value);
    }
    return normalizeDecimalString(value.toString());
  }
  return normalizeDecimalString(value.trim());
}

function normalizeDecimalString(value: string) {
  const parsed = parseDecimalString(value, {
    errorMessage: "invalid google.type.Decimal string",
  });
  const integerPart = parsed.integerPart;
  const fractionPart = parsed.fractionPart;
  const normalizedInteger = normalizeDigits(integerPart);
  const normalizedExponent = normalizeExponent(parsed.exponentPart);
  const isZero = /^0*$/.test(normalizedInteger) && /^0*$/.test(fractionPart);

  const significand =
    fractionPart.length === 0 ? normalizedInteger : `${normalizedInteger}.${fractionPart}`;

  if (isZero) {
    return normalizedExponent === undefined ? "0" : `0e${normalizedExponent}`;
  }

  const sign = parsed.sign === -1 ? "-" : "";
  return `${sign}${significand}${normalizedExponent === undefined ? "" : `e${normalizedExponent}`}`;
}

function normalizeDigits(value: string) {
  const normalized = value.replace(/^0+/, "");
  return normalized === "" ? "0" : normalized;
}

function normalizeExponent(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const negative = value.startsWith("-");
  const digits = value.replace(/^[+-]?/, "").replace(/^0+/, "");
  if (digits === "") {
    return undefined;
  }
  return `${negative ? "-" : ""}${digits}`;
}
