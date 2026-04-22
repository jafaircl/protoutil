import { create } from "@bufbuild/protobuf";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { DateSchema } from "../../gen/google/type/date_pb.js";
import {
  assertValidDate,
  date,
  dateFromPlainDate,
  dateFromString,
  datePlainDate,
  dateToString,
  isValidDate,
} from "./date.js";

interface InvalidDateCase {
  year: number;
  month: number;
  day: number;
  error: string;
}

describe("google/type date helpers", () => {
  it("creates and validates full and partial dates across boundaries", () => {
    const cases = [
      { year: 1, month: 1, day: 1 },
      { year: 2024, month: 3, day: 2 },
      { year: 2024, month: 3, day: 0 },
      { year: 2024, month: 0, day: 0 },
      { year: 9999, month: 12, day: 31 },
      { year: 0, month: 2, day: 29 },
      { year: 0, month: 12, day: 25 },
    ];

    for (const tc of cases) {
      expect(date(tc.year, tc.month, tc.day)).toMatchObject(tc);
    }
  });

  it("rejects invalid partial date combinations and year bounds", () => {
    const cases: InvalidDateCase[] = [
      { year: 0, month: 0, day: 0, error: "yearless dates must include both month and day" },
      { year: 2024, month: 0, day: 1, error: "day requires a month" },
      { year: 2024, month: 2, day: 30, error: "day is not valid for month" },
      { year: 0, month: 4, day: 31, error: "day is not valid for month" },
      { year: -1, month: 1, day: 1, error: "year out of range" },
      { year: 10000, month: 1, day: 1, error: "year out of range" },
      { year: 2024, month: 13, day: 1, error: "month out of range" },
      { year: 2024, month: 1, day: 32, error: "day out of range" },
    ];

    for (const tc of cases) {
      expect(() => date(tc.year, tc.month, tc.day)).toThrow(tc.error);
    }
  });

  it("parses and formats supported date strings", () => {
    const cases = ["0001-01-01", "2024-03-02", "2024-03", "2024", "--02-29", "9999-12-31"];

    for (const tc of cases) {
      expect(dateToString(dateFromString(tc))).toBe(tc);
    }

    const invalidCases = ["03-02-2024"];

    for (const tc of invalidCases) {
      expect(() => dateFromString(tc)).toThrow("invalid google.type.Date string");
    }
  });

  it("covers each protobuf-documented date shape", () => {
    const cases = [
      { value: date(2024, 3, 2), expected: "2024-03-02" },
      { value: date(0, 2, 29), expected: "--02-29" },
      { value: date(2024, 0, 0), expected: "2024" },
      { value: date(2024, 3, 0), expected: "2024-03" },
    ];

    for (const tc of cases) {
      expect(dateToString(tc.value)).toBe(tc.expected);
    }
  });

  it("round-trips through string form for helper-created values", () => {
    const cases = [
      date(1, 1, 1),
      date(2024, 3, 2),
      date(2024, 3, 0),
      date(2024, 0, 0),
      date(0, 2, 29),
      date(9999, 12, 31),
    ];

    for (const tc of cases) {
      expect(dateFromString(dateToString(tc))).toEqual(tc);
    }
  });

  it("converts to and from Temporal.PlainDate for full dates", () => {
    const plainDate = new Temporal.PlainDate(2024, 3, 2);
    expect(dateFromPlainDate(plainDate)).toMatchObject({ year: 2024, month: 3, day: 2 });
    expect(datePlainDate(date(2024, 3, 2))).toEqual(plainDate);
    expect(() => datePlainDate(date(2024, 3, 0))).toThrow(
      "partial dates cannot be converted to Temporal.PlainDate",
    );
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(DateSchema, { year: 1, month: 1, day: 1 }),
      create(DateSchema, { year: 2024, month: 3, day: 0 }),
      create(DateSchema, { year: 0, month: 2, day: 29 }),
    ];
    const invalidCases = [
      create(DateSchema, { year: 0, month: 0, day: 0 }),
      create(DateSchema, { year: 2024, month: 0, day: 1 }),
      create(DateSchema, { year: 2024, month: 2, day: 30 }),
      create(DateSchema, { year: 10000, month: 1, day: 1 }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidDate(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidDate(tc)).toBe(false);
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      { value: date(2024, 3, 2), expected: true },
      { value: { year: 2024, month: 2, day: 30 } as ReturnType<typeof date>, expected: false },
    ];

    for (const tc of cases) {
      expect(isValidDate(tc.value)).toBe(tc.expected);
    }
  });
});
