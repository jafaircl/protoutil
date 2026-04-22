import { InvalidValueError } from "../../errors.js";
import { CalendarPeriod } from "../../gen/google/type/calendar_period_pb.js";
import { assertValidInt32 } from "../../int32.js";

const CALENDAR_PERIOD_NAME_BY_VALUE: Record<number, string> = {
  [CalendarPeriod.CALENDAR_PERIOD_UNSPECIFIED]: "CALENDAR_PERIOD_UNSPECIFIED",
  [CalendarPeriod.DAY]: "DAY",
  [CalendarPeriod.WEEK]: "WEEK",
  [CalendarPeriod.FORTNIGHT]: "FORTNIGHT",
  [CalendarPeriod.MONTH]: "MONTH",
  [CalendarPeriod.QUARTER]: "QUARTER",
  [CalendarPeriod.HALF]: "HALF",
  [CalendarPeriod.YEAR]: "YEAR",
};

const CALENDAR_PERIOD_VALUE_BY_NAME = Object.fromEntries(
  Object.entries(CALENDAR_PERIOD_NAME_BY_VALUE).map(([value, name]) => [name, Number(value)]),
) as Record<string, CalendarPeriod>;

/**
 * Asserts that a `google.type.CalendarPeriod` enum value is structurally valid.
 *
 * `WEEK` and `FORTNIGHT` follow
 * [ISO 8601](https://en.wikipedia.org/wiki/ISO_week_date) week boundaries.
 */
export function assertValidCalendarPeriod(
  value: CalendarPeriod | number,
): asserts value is CalendarPeriod {
  assertValidInt32(value);
  if (!(value in CALENDAR_PERIOD_NAME_BY_VALUE)) {
    throw new InvalidValueError("invalid google.type.CalendarPeriod value", value);
  }
}

/**
 * Returns `true` when the value is a valid `google.type.CalendarPeriod`.
 */
export function isValidCalendarPeriod(value: CalendarPeriod | number): value is CalendarPeriod {
  try {
    assertValidCalendarPeriod(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a `google.type.CalendarPeriod` from its canonical enum name.
 */
export function calendarPeriodFromString(value: string) {
  const normalized = value.trim().toUpperCase();
  const calendarPeriodValue = CALENDAR_PERIOD_VALUE_BY_NAME[normalized];
  if (calendarPeriodValue === undefined) {
    throw new InvalidValueError("invalid google.type.CalendarPeriod string", value);
  }
  assertValidCalendarPeriod(calendarPeriodValue);
  return calendarPeriodValue;
}

/**
 * Formats a `google.type.CalendarPeriod` using its canonical enum name.
 */
export function calendarPeriodToString(value: CalendarPeriod | number) {
  assertValidCalendarPeriod(value);
  return CALENDAR_PERIOD_NAME_BY_VALUE[value];
}
