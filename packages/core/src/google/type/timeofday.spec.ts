import { create } from "@bufbuild/protobuf";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { TimeOfDaySchema } from "../../gen/google/type/timeofday_pb.js";
import {
  assertValidTimeOfDay,
  isValidTimeOfDay,
  timeOfDay,
  timeOfDayFromPlainTime,
  timeOfDayFromString,
  timeOfDayPlainTime,
  timeOfDayToString,
} from "./timeofday.js";

interface InvalidTimeOfDayCase {
  hours: number;
  minutes: number;
  seconds: number;
  nanos: number;
  error: string;
}

describe("google/type timeofday helpers", () => {
  it("creates valid times across boundaries", () => {
    const cases = [
      { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
      { hours: 8, minutes: 48, seconds: 1, nanos: 234_000_000 },
      { hours: 23, minutes: 59, seconds: 59, nanos: 999_999_999 },
    ];

    for (const tc of cases) {
      expect(timeOfDay(tc.hours, tc.minutes, tc.seconds, tc.nanos)).toMatchObject(tc);
    }
  });

  it("rejects invalid ranges", () => {
    const cases: InvalidTimeOfDayCase[] = [
      { hours: 24, minutes: 0, seconds: 0, nanos: 0, error: "hours out of range" },
      { hours: 0, minutes: 60, seconds: 0, nanos: 0, error: "minutes out of range" },
      { hours: 0, minutes: 0, seconds: 60, nanos: 0, error: "seconds out of range" },
      { hours: 0, minutes: 0, seconds: 0, nanos: 1_000_000_000, error: "nanos out of range" },
    ];

    for (const tc of cases) {
      expect(() => timeOfDay(tc.hours, tc.minutes, tc.seconds, tc.nanos)).toThrow(tc.error);
    }
  });

  it("uses the strict subset of protobuf TimeOfDay values in v1", () => {
    const cases: InvalidTimeOfDayCase[] = [
      { hours: 24, minutes: 0, seconds: 0, nanos: 0, error: "hours out of range" },
      { hours: 23, minutes: 59, seconds: 60, nanos: 0, error: "seconds out of range" },
    ];

    for (const tc of cases) {
      expect(() => timeOfDay(tc.hours, tc.minutes, tc.seconds, tc.nanos)).toThrow(tc.error);
    }
  });

  it("parses and formats supported strings", () => {
    const cases = ["00:00:00", "08:48:01", "08:48:01.234", "23:59:59.999999999"];

    for (const tc of cases) {
      expect(timeOfDayToString(timeOfDayFromString(tc))).toBe(tc);
    }

    const invalidCases = ["8:48"];

    for (const tc of invalidCases) {
      expect(() => timeOfDayFromString(tc)).toThrow("invalid google.type.TimeOfDay string");
    }
  });

  it("round-trips through string form for helper-created values", () => {
    const cases = [
      timeOfDay(0, 0, 0),
      timeOfDay(8, 48, 1),
      timeOfDay(8, 48, 1, 123_456_789),
      timeOfDay(23, 59, 59, 999_999_999),
    ];

    for (const tc of cases) {
      expect(timeOfDayFromString(timeOfDayToString(tc))).toEqual(tc);
    }
  });

  it("converts to and from Temporal.PlainTime", () => {
    const cases = [
      {
        input: new Temporal.PlainTime(8, 48, 1, 123, 456, 789),
        expectedValue: {
          hours: 8,
          minutes: 48,
          seconds: 1,
          nanos: 123_456_789,
        },
        expectedString: "08:48:01.123456789",
      },
    ];

    for (const tc of cases) {
      const value = timeOfDayFromPlainTime(tc.input);
      expect(value).toMatchObject(tc.expectedValue);
      expect(timeOfDayPlainTime(value).toString()).toBe(tc.expectedString);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(TimeOfDaySchema, { hours: 0, minutes: 0, seconds: 0, nanos: 0 }),
      create(TimeOfDaySchema, { hours: 23, minutes: 59, seconds: 59, nanos: 999_999_999 }),
    ];
    const invalidCases = [
      create(TimeOfDaySchema, { hours: -1 }),
      create(TimeOfDaySchema, { minutes: 60 }),
      create(TimeOfDaySchema, { seconds: 60 }),
      create(TimeOfDaySchema, { nanos: -1 }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidTimeOfDay(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidTimeOfDay(tc)).toBe(false);
    }
  });
});
