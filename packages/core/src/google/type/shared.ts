import { InvalidValueError, OutOfRangeError } from "../../errors.js";

export const MIN_YEAR = 0;
export const MAX_YEAR = 9999;
export const MAX_NANOS = 999_999_999;
const DECIMAL_RE = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:([eE])([+-]?\d+))?$/;

export interface ParsedDecimalString {
  sign: -1 | 1;
  integerPart: string;
  fractionPart: string;
  exponentPart?: string;
}

export function padNumber(value: number, length = 2) {
  return value.toString().padStart(length, "0");
}

export function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number) {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

export function assertYearInRange(year: number) {
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new OutOfRangeError("year out of range", year, MIN_YEAR, MAX_YEAR);
  }
}

export function assertMonthInRange(month: number, allowZero = true) {
  const min = allowZero ? 0 : 1;
  if (month < min || month > 12) {
    throw new OutOfRangeError("month out of range", month, min, 12);
  }
}

export function assertDayInRange(day: number, allowZero = true) {
  const min = allowZero ? 0 : 1;
  if (day < min || day > 31) {
    throw new OutOfRangeError("day out of range", day, min, 31);
  }
}

export function assertValidMonthDay(year: number, month: number, day: number) {
  const maxDay = daysInMonth(year, month);
  if (day > maxDay) {
    throw new InvalidValueError("day is not valid for month", { year, month, day });
  }
}

export function trimTrailingZeros(value: string) {
  return value.replace(/0+$/, "");
}

export function parseDecimalString(
  value: string,
  options?: {
    allowExponent?: boolean;
    errorMessage?: string;
  },
): ParsedDecimalString {
  const errorMessage = options?.errorMessage ?? "invalid decimal string";
  const match = value.match(DECIMAL_RE);
  if (!match) {
    throw new InvalidValueError(errorMessage, value);
  }
  if (options?.allowExponent === false && match[6] !== undefined) {
    throw new InvalidValueError(errorMessage, value);
  }

  return {
    sign: match[1] === "-" ? -1 : 1,
    integerPart: match[2] ?? "",
    fractionPart: match[3] ?? match[4] ?? "",
    exponentPart: match[6],
  };
}
