import { describe, expect, it } from "vitest";
import { DayOfWeek } from "../../gen/google/type/dayofweek_pb.js";
import {
  assertValidDayOfWeek,
  dayOfWeekFromString,
  dayOfWeekToString,
  isValidDayOfWeek,
} from "./dayofweek.js";

interface DayOfWeekCase {
  value: DayOfWeek | number;
  expected: DayOfWeek;
}

interface InvalidDayOfWeekCase {
  value: DayOfWeek | number;
  error: string;
}

interface DayOfWeekStringCase {
  input: string;
  expected: DayOfWeek;
}

describe("google/type dayofweek helpers", () => {
  it("validates protobuf day-of-week enum values", () => {
    const cases: DayOfWeekCase[] = [
      {
        value: DayOfWeek.DAY_OF_WEEK_UNSPECIFIED,
        expected: DayOfWeek.DAY_OF_WEEK_UNSPECIFIED,
      },
      { value: DayOfWeek.MONDAY, expected: DayOfWeek.MONDAY },
      { value: DayOfWeek.SUNDAY, expected: DayOfWeek.SUNDAY },
      { value: 4, expected: DayOfWeek.THURSDAY },
    ];

    for (const tc of cases) {
      expect(() => assertValidDayOfWeek(tc.value)).not.toThrow();
      expect(tc.value).toBe(tc.expected);
    }
  });

  it("rejects invalid day-of-week enum values", () => {
    const cases: InvalidDayOfWeekCase[] = [
      { value: -1, error: "invalid google.type.DayOfWeek value" },
      { value: 8, error: "invalid google.type.DayOfWeek value" },
      { value: 1.5, error: "not an integer" },
    ];

    for (const tc of cases) {
      expect(() => assertValidDayOfWeek(tc.value)).toThrow(tc.error);
    }
  });

  it("parses and formats canonical day-of-week names", () => {
    const cases: DayOfWeekStringCase[] = [
      {
        input: "DAY_OF_WEEK_UNSPECIFIED",
        expected: DayOfWeek.DAY_OF_WEEK_UNSPECIFIED,
      },
      { input: "MONDAY", expected: DayOfWeek.MONDAY },
      { input: "sunday", expected: DayOfWeek.SUNDAY },
      { input: " wednesday ", expected: DayOfWeek.WEDNESDAY },
    ];

    for (const tc of cases) {
      expect(dayOfWeekFromString(tc.input)).toBe(tc.expected);
      expect(dayOfWeekToString(tc.expected)).toBe(dayOfWeekToString(dayOfWeekFromString(tc.input)));
    }
  });

  it("rejects invalid day-of-week strings", () => {
    const cases = ["", "8", "MON", "DAY_OF_WEEK", "FUNDAY"];

    for (const tc of cases) {
      expect(() => dayOfWeekFromString(tc)).toThrow("invalid google.type.DayOfWeek string");
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      { value: DayOfWeek.FRIDAY, expected: true },
      { value: 8, expected: false },
    ];

    for (const tc of cases) {
      expect(isValidDayOfWeek(tc.value)).toBe(tc.expected);
    }
  });

  it("validates raw enum values separately from helper construction", () => {
    const validCases = [DayOfWeek.DAY_OF_WEEK_UNSPECIFIED, DayOfWeek.TUESDAY, 7];
    const invalidCases = [-1, 8, 99];

    for (const tc of validCases) {
      expect(() => assertValidDayOfWeek(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidDayOfWeek(tc)).toBe(false);
    }
  });
});
