import { InvalidValueError } from "../../errors.js";
import { Month } from "../../gen/google/type/month_pb.js";
import { assertValidInt32 } from "../../int32.js";

const MONTH_NAME_BY_VALUE: Record<number, string> = {
  [Month.MONTH_UNSPECIFIED]: "MONTH_UNSPECIFIED",
  [Month.JANUARY]: "JANUARY",
  [Month.FEBRUARY]: "FEBRUARY",
  [Month.MARCH]: "MARCH",
  [Month.APRIL]: "APRIL",
  [Month.MAY]: "MAY",
  [Month.JUNE]: "JUNE",
  [Month.JULY]: "JULY",
  [Month.AUGUST]: "AUGUST",
  [Month.SEPTEMBER]: "SEPTEMBER",
  [Month.OCTOBER]: "OCTOBER",
  [Month.NOVEMBER]: "NOVEMBER",
  [Month.DECEMBER]: "DECEMBER",
};

const MONTH_VALUE_BY_NAME = Object.fromEntries(
  Object.entries(MONTH_NAME_BY_VALUE).map(([value, name]) => [name, Number(value)]),
) as Record<string, Month>;

/**
 * Asserts that a `google.type.Month` enum value is structurally valid.
 */
export function assertValidMonth(value: Month | number): asserts value is Month {
  assertValidInt32(value);
  if (!(value in MONTH_NAME_BY_VALUE)) {
    throw new InvalidValueError("invalid google.type.Month value", value);
  }
}

/**
 * Returns `true` when the value is a valid `google.type.Month`.
 */
export function isValidMonth(value: Month | number): value is Month {
  try {
    assertValidMonth(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a `google.type.Month` from its canonical enum name.
 */
export function monthFromString(value: string) {
  const normalized = value.trim().toUpperCase();
  const monthValue = MONTH_VALUE_BY_NAME[normalized];
  if (monthValue === undefined) {
    throw new InvalidValueError("invalid google.type.Month string", value);
  }
  assertValidMonth(monthValue);
  return monthValue;
}

/**
 * Formats a `google.type.Month` using its canonical enum name.
 */
export function monthToString(value: Month | number) {
  assertValidMonth(value);
  return MONTH_NAME_BY_VALUE[value];
}
