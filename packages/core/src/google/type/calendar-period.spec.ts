import { describe, expect, it } from "vitest";
import { CalendarPeriod } from "../../gen/google/type/calendar_period_pb.js";
import {
  assertValidCalendarPeriod,
  calendarPeriodFromString,
  calendarPeriodToString,
  isValidCalendarPeriod,
} from "./calendar-period.js";

interface CalendarPeriodCase {
  value: CalendarPeriod | number;
  expected: CalendarPeriod;
}

interface InvalidCalendarPeriodCase {
  value: CalendarPeriod | number;
  error: string;
}

interface CalendarPeriodStringCase {
  input: string;
  expected: CalendarPeriod;
}

describe("google/type calendar period helpers", () => {
  it("validates protobuf calendar period enum values", () => {
    const cases: CalendarPeriodCase[] = [
      {
        value: CalendarPeriod.CALENDAR_PERIOD_UNSPECIFIED,
        expected: CalendarPeriod.CALENDAR_PERIOD_UNSPECIFIED,
      },
      { value: CalendarPeriod.DAY, expected: CalendarPeriod.DAY },
      { value: CalendarPeriod.WEEK, expected: CalendarPeriod.WEEK },
      { value: CalendarPeriod.FORTNIGHT, expected: CalendarPeriod.FORTNIGHT },
      { value: CalendarPeriod.MONTH, expected: CalendarPeriod.MONTH },
      { value: CalendarPeriod.QUARTER, expected: CalendarPeriod.QUARTER },
      { value: CalendarPeriod.HALF, expected: CalendarPeriod.HALF },
      { value: CalendarPeriod.YEAR, expected: CalendarPeriod.YEAR },
      { value: 5, expected: CalendarPeriod.QUARTER },
    ];

    for (const tc of cases) {
      expect(() => assertValidCalendarPeriod(tc.value)).not.toThrow();
      expect(tc.value).toBe(tc.expected);
    }
  });

  it("rejects invalid calendar period enum values", () => {
    const cases: InvalidCalendarPeriodCase[] = [
      { value: -1, error: "invalid google.type.CalendarPeriod value" },
      { value: 8, error: "invalid google.type.CalendarPeriod value" },
      { value: 1.5, error: "not an integer" },
    ];

    for (const tc of cases) {
      expect(() => assertValidCalendarPeriod(tc.value)).toThrow(tc.error);
    }
  });

  it("parses and formats canonical calendar period names", () => {
    const cases: CalendarPeriodStringCase[] = [
      {
        input: "CALENDAR_PERIOD_UNSPECIFIED",
        expected: CalendarPeriod.CALENDAR_PERIOD_UNSPECIFIED,
      },
      { input: "day", expected: CalendarPeriod.DAY },
      { input: "week", expected: CalendarPeriod.WEEK },
      { input: "FORTNIGHT", expected: CalendarPeriod.FORTNIGHT },
      { input: " quarter ", expected: CalendarPeriod.QUARTER },
      { input: "HALF", expected: CalendarPeriod.HALF },
      { input: "year", expected: CalendarPeriod.YEAR },
    ];

    for (const tc of cases) {
      expect(calendarPeriodFromString(tc.input)).toBe(tc.expected);
      expect(calendarPeriodToString(tc.expected)).toBe(
        calendarPeriodToString(calendarPeriodFromString(tc.input)),
      );
    }
  });

  it("rejects invalid calendar period strings", () => {
    const cases = ["", "8", "WEEKS", "PERIOD", "BIWEEKLY"];

    for (const tc of cases) {
      expect(() => calendarPeriodFromString(tc)).toThrow(
        "invalid google.type.CalendarPeriod string",
      );
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      { value: CalendarPeriod.MONTH, expected: true },
      { value: 8, expected: false },
    ];

    for (const tc of cases) {
      expect(isValidCalendarPeriod(tc.value)).toBe(tc.expected);
    }
  });

  it("validates raw enum values separately from helper string conversion", () => {
    const validCases = [CalendarPeriod.CALENDAR_PERIOD_UNSPECIFIED, CalendarPeriod.FORTNIGHT, 7];
    const invalidCases = [-1, 8, 99];

    for (const tc of validCases) {
      expect(() => assertValidCalendarPeriod(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidCalendarPeriod(tc)).toBe(false);
    }
  });
});
