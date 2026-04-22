import { create } from "@bufbuild/protobuf";
import { Temporal } from "temporal-polyfill";
import { InvalidValueError } from "../../errors.js";
import { DateSchema, type Date as GoogleTypeDate } from "../../gen/google/type/date_pb.js";
import { assertValidInt32 } from "../../int32.js";
import {
  assertDayInRange,
  assertMonthInRange,
  assertValidMonthDay,
  assertYearInRange,
  padNumber,
} from "./shared.js";

const YEAR_ONLY_RE = /^(\d{4})$/;
const YEAR_MONTH_RE = /^(\d{4})-(\d{2})$/;
const FULL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_DAY_RE = /^--(\d{2})-(\d{2})$/;

/**
 * Creates a validated `google.type.Date` value.
 *
 * Supports all protobuf date shapes: full dates, year-month values, year-only
 * values, and month-day values.
 *
 * Yearless dates must include both a non-zero month and a non-zero day.
 */
export function date(year = 0, month = 0, day = 0) {
  const value = create(DateSchema, { year, month, day });
  assertValidDate(value);
  return value;
}

/**
 * Asserts that a `google.type.Date` is structurally valid.
 *
 * This helper accepts the same four date shapes as {@link date}. For
 * month-day values, leap-day anniversaries remain representable.
 */
export function assertValidDate(value: GoogleTypeDate): asserts value is GoogleTypeDate {
  assertValidInt32(value.year);
  assertValidInt32(value.month);
  assertValidInt32(value.day);
  assertYearInRange(value.year);
  assertMonthInRange(value.month);
  assertDayInRange(value.day);

  if (value.year === 0) {
    if (value.month === 0 || value.day === 0) {
      throw new InvalidValueError("yearless dates must include both month and day", value);
    }
    // Use a leap year so month-day anniversaries like Feb 29 remain representable.
    assertValidMonthDay(2000, value.month, value.day);
    return;
  }

  if (value.month === 0) {
    if (value.day !== 0) {
      throw new InvalidValueError("day requires a month", value);
    }
    return;
  }

  if (value.day === 0) {
    return;
  }

  assertValidMonthDay(value.year, value.month, value.day);
}

/**
 * Returns `true` when the value is a valid `google.type.Date`.
 */
export function isValidDate(value: GoogleTypeDate): value is GoogleTypeDate {
  try {
    assertValidDate(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a `google.type.Date` from a supported string representation.
 *
 * Accepted formats are `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, and `--MM-DD`.
 */
export function dateFromString(value: string) {
  const full = value.match(FULL_DATE_RE);
  if (full) {
    return date(Number(full[1]), Number(full[2]), Number(full[3]));
  }

  const yearMonth = value.match(YEAR_MONTH_RE);
  if (yearMonth) {
    return date(Number(yearMonth[1]), Number(yearMonth[2]), 0);
  }

  const yearOnly = value.match(YEAR_ONLY_RE);
  if (yearOnly) {
    return date(Number(yearOnly[1]), 0, 0);
  }

  const monthDay = value.match(MONTH_DAY_RE);
  if (monthDay) {
    return date(0, Number(monthDay[1]), Number(monthDay[2]));
  }

  throw new InvalidValueError("invalid google.type.Date string", value);
}

/**
 * Formats a `google.type.Date` using the canonical protobuf string forms.
 *
 * Full dates format as `YYYY-MM-DD`, year-month values as `YYYY-MM`,
 * year-only values as `YYYY`, and month-day values as `--MM-DD`.
 */
export function dateToString(value: GoogleTypeDate) {
  assertValidDate(value);
  if (value.year === 0) {
    return `--${padNumber(value.month)}-${padNumber(value.day)}`;
  }
  if (value.month === 0) {
    return padNumber(value.year, 4);
  }
  if (value.day === 0) {
    return `${padNumber(value.year, 4)}-${padNumber(value.month)}`;
  }
  return `${padNumber(value.year, 4)}-${padNumber(value.month)}-${padNumber(value.day)}`;
}

/**
 * Converts a `Temporal.PlainDate` input into a `google.type.Date`.
 */
export function dateFromPlainDate(value: Temporal.PlainDate | Temporal.PlainDateLike | string) {
  const plainDate = Temporal.PlainDate.from(value);
  return date(plainDate.year, plainDate.month, plainDate.day);
}

/**
 * Converts a full `google.type.Date` into `Temporal.PlainDate`.
 *
 * Partial dates cannot be converted and will throw.
 */
export function datePlainDate(value: GoogleTypeDate) {
  assertValidDate(value);
  if (value.year === 0 || value.month === 0 || value.day === 0) {
    throw new InvalidValueError("partial dates cannot be converted to Temporal.PlainDate", value);
  }
  return new Temporal.PlainDate(value.year, value.month, value.day);
}
