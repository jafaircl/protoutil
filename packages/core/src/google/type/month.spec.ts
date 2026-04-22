import { describe, expect, it } from "vitest";
import { Month } from "../../gen/google/type/month_pb.js";
import { assertValidMonth, isValidMonth, monthFromString, monthToString } from "./month.js";

interface MonthCase {
  value: Month | number;
  expected: Month;
}

interface InvalidMonthCase {
  value: Month | number;
  error: string;
}

interface MonthStringCase {
  input: string;
  expected: Month;
}

describe("google/type month helpers", () => {
  it("validates protobuf month enum values", () => {
    const cases: MonthCase[] = [
      { value: Month.MONTH_UNSPECIFIED, expected: Month.MONTH_UNSPECIFIED },
      { value: Month.JANUARY, expected: Month.JANUARY },
      { value: Month.DECEMBER, expected: Month.DECEMBER },
      { value: 6, expected: Month.JUNE },
    ];

    for (const tc of cases) {
      expect(() => assertValidMonth(tc.value)).not.toThrow();
      expect(tc.value).toBe(tc.expected);
    }
  });

  it("rejects invalid month enum values", () => {
    const cases: InvalidMonthCase[] = [
      { value: -1, error: "invalid google.type.Month value" },
      { value: 13, error: "invalid google.type.Month value" },
      { value: 1.5, error: "not an integer" },
    ];

    for (const tc of cases) {
      expect(() => assertValidMonth(tc.value)).toThrow(tc.error);
    }
  });

  it("parses and formats canonical month names", () => {
    const cases: MonthStringCase[] = [
      { input: "MONTH_UNSPECIFIED", expected: Month.MONTH_UNSPECIFIED },
      { input: "JANUARY", expected: Month.JANUARY },
      { input: "december", expected: Month.DECEMBER },
      { input: " march ", expected: Month.MARCH },
    ];

    for (const tc of cases) {
      expect(monthFromString(tc.input)).toBe(tc.expected);
      expect(monthToString(tc.expected)).toBe(monthToString(monthFromString(tc.input)));
    }
  });

  it("rejects invalid month strings", () => {
    const cases = ["", "13", "JAN", "MONTH", "SMARCH"];

    for (const tc of cases) {
      expect(() => monthFromString(tc)).toThrow("invalid google.type.Month string");
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      { value: Month.APRIL, expected: true },
      { value: 13, expected: false },
    ];

    for (const tc of cases) {
      expect(isValidMonth(tc.value)).toBe(tc.expected);
    }
  });

  it("validates raw enum values separately from helper construction", () => {
    const validCases = [Month.MONTH_UNSPECIFIED, Month.JULY, 12];
    const invalidCases = [-1, 13, 99];

    for (const tc of validCases) {
      expect(() => assertValidMonth(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidMonth(tc)).toBe(false);
    }
  });
});
