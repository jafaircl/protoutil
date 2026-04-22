import { InvalidValueError } from "../../errors.js";
import { DayOfWeek } from "../../gen/google/type/dayofweek_pb.js";
import { assertValidInt32 } from "../../int32.js";

const DAY_OF_WEEK_NAME_BY_VALUE: Record<number, string> = {
  [DayOfWeek.DAY_OF_WEEK_UNSPECIFIED]: "DAY_OF_WEEK_UNSPECIFIED",
  [DayOfWeek.MONDAY]: "MONDAY",
  [DayOfWeek.TUESDAY]: "TUESDAY",
  [DayOfWeek.WEDNESDAY]: "WEDNESDAY",
  [DayOfWeek.THURSDAY]: "THURSDAY",
  [DayOfWeek.FRIDAY]: "FRIDAY",
  [DayOfWeek.SATURDAY]: "SATURDAY",
  [DayOfWeek.SUNDAY]: "SUNDAY",
};

const DAY_OF_WEEK_VALUE_BY_NAME = Object.fromEntries(
  Object.entries(DAY_OF_WEEK_NAME_BY_VALUE).map(([value, name]) => [name, Number(value)]),
) as Record<string, DayOfWeek>;

/**
 * Asserts that a `google.type.DayOfWeek` enum value is structurally valid.
 */
export function assertValidDayOfWeek(value: DayOfWeek | number): asserts value is DayOfWeek {
  assertValidInt32(value);
  if (!(value in DAY_OF_WEEK_NAME_BY_VALUE)) {
    throw new InvalidValueError("invalid google.type.DayOfWeek value", value);
  }
}

/**
 * Returns `true` when the value is a valid `google.type.DayOfWeek`.
 */
export function isValidDayOfWeek(value: DayOfWeek | number): value is DayOfWeek {
  try {
    assertValidDayOfWeek(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a `google.type.DayOfWeek` from its canonical enum name.
 */
export function dayOfWeekFromString(value: string) {
  const normalized = value.trim().toUpperCase();
  const dayOfWeekValue = DAY_OF_WEEK_VALUE_BY_NAME[normalized];
  if (dayOfWeekValue === undefined) {
    throw new InvalidValueError("invalid google.type.DayOfWeek string", value);
  }
  assertValidDayOfWeek(dayOfWeekValue);
  return dayOfWeekValue;
}

/**
 * Formats a `google.type.DayOfWeek` using its canonical enum name.
 */
export function dayOfWeekToString(value: DayOfWeek | number) {
  assertValidDayOfWeek(value);
  return DAY_OF_WEEK_NAME_BY_VALUE[value];
}
