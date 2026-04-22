import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { DateTimeSchema } from "../../gen/google/type/datetime_pb.js";
import { duration } from "../../wkt/duration.js";
import {
  assertValidDateTime,
  dateTime,
  dateTimeFromPlainDateTime,
  dateTimeFromString,
  dateTimeFromZonedDateTime,
  dateTimePlainDateTime,
  dateTimeToString,
  dateTimeZonedDateTime,
  isValidDateTime,
} from "./datetime.js";

describe("google/type datetime helpers", () => {
  it("creates local, offset, and time zone datetimes across boundaries", () => {
    const cases = [
      {
        value: dateTime({
          year: 2024,
          month: 3,
          day: 2,
          hours: 8,
          minutes: 48,
          seconds: 1,
          nanos: 234_000_000,
        }),
        expected: {
          year: 2024,
          month: 3,
          day: 2,
          hours: 8,
          minutes: 48,
          seconds: 1,
          nanos: 234_000_000,
          timeOffset: { case: undefined },
        },
      },
      {
        value: dateTime({
          year: 2024,
          month: 3,
          day: 2,
          utcOffset: duration(-18n * 60n * 60n),
        }),
        expected: {
          year: 2024,
          month: 3,
          day: 2,
          timeOffset: {
            case: "utcOffset",
            value: duration(-18n * 60n * 60n),
          },
        },
      },
      {
        value: dateTime({
          year: 2024,
          month: 3,
          day: 2,
          hours: 23,
          minutes: 59,
          seconds: 59,
          nanos: 999_999_999,
          utcOffset: duration(18n * 60n * 60n),
        }),
        expected: {
          year: 2024,
          month: 3,
          day: 2,
          hours: 23,
          minutes: 59,
          seconds: 59,
          nanos: 999_999_999,
          timeOffset: {
            case: "utcOffset",
            value: duration(18n * 60n * 60n),
          },
        },
      },
      {
        value: dateTime({
          year: 2024,
          month: 3,
          day: 2,
          timeZone: "America/New_York",
        }),
        expected: {
          year: 2024,
          month: 3,
          day: 2,
          timeOffset: {
            case: "timeZone",
            value: { id: "America/New_York" },
          },
        },
      },
    ];

    for (const tc of cases) {
      expect(tc.value).toMatchObject(tc.expected);
    }
  });

  it("covers protobuf-documented datetime variants, including yearless values", () => {
    const cases = [
      {
        value: dateTime({ year: 0, month: 2, day: 29, hours: 8, minutes: 48 }),
        expected: {
          year: 0,
          month: 2,
          day: 29,
          hours: 8,
          minutes: 48,
          timeOffset: { case: undefined },
        },
      },
      {
        value: dateTime({ year: 2024, month: 3, day: 2, hours: 8, minutes: 48 }),
        expected: {
          year: 2024,
          month: 3,
          day: 2,
          hours: 8,
          minutes: 48,
          timeOffset: { case: undefined },
        },
      },
      {
        value: dateTime({
          year: 2024,
          month: 3,
          day: 2,
          hours: 8,
          minutes: 48,
          utcOffset: duration(-5n * 60n * 60n),
        }),
        expected: {
          year: 2024,
          month: 3,
          day: 2,
          hours: 8,
          minutes: 48,
          timeOffset: {
            case: "utcOffset",
            value: duration(-5n * 60n * 60n),
          },
        },
      },
      {
        value: dateTime({
          year: 2024,
          month: 3,
          day: 2,
          hours: 8,
          minutes: 48,
          timeZone: "America/New_York",
          timeZoneVersion: "2024a",
        }),
        expected: {
          year: 2024,
          month: 3,
          day: 2,
          hours: 8,
          minutes: 48,
          timeOffset: {
            case: "timeZone",
            value: { id: "America/New_York", version: "2024a" },
          },
        },
      },
    ];

    for (const tc of cases) {
      expect(tc.value).toMatchObject(tc.expected);
    }
  });

  it("rejects invalid values", () => {
    const cases = [
      { input: { year: 2024, month: 2, day: 30 }, error: "day is not valid for month" },
      { input: { year: 2024, month: 3, day: 2, hours: 24 }, error: "hours out of range" },
      { input: { year: 2024, month: 3, day: 2, minutes: 60 }, error: "minutes out of range" },
      { input: { year: 2024, month: 3, day: 2, seconds: 60 }, error: "seconds out of range" },
      {
        input: { year: 2024, month: 3, day: 2, nanos: 1_000_000_000 },
        error: "nanos out of range",
      },
      {
        input: { year: 2024, month: 3, day: 2, utcOffset: duration(1n, 1) },
        error: "utcOffset must be whole seconds",
      },
      {
        input: { year: 2024, month: 3, day: 2, utcOffset: duration(19n * 60n * 60n) },
        error: "utcOffset out of range",
      },
      { input: { year: 2024, month: 3, day: 2, timeZone: "" }, error: "timeZone.id is required" },
      {
        input: { year: 2024, month: 3, day: 2, timeZone: "Not/A_Zone" },
        error: "invalid time zone id",
      },
    ];

    for (const tc of cases) {
      expect(() => dateTime(tc.input)).toThrow(tc.error);
    }
  });

  it("rejects mutually exclusive utcOffset and timeZone inputs", () => {
    expect(() =>
      // @ts-expect-error exercising runtime validation for mutually exclusive inputs
      dateTime({
        year: 2024,
        month: 3,
        day: 2,
        utcOffset: duration(0n),
        timeZone: "America/New_York",
      }),
    ).toThrow("dateTime accepts either utcOffset or timeZone, not both");
  });

  it("uses the strict subset of protobuf DateTime values in v1", () => {
    const cases = [
      { input: { year: 2024, month: 3, day: 2, hours: 24 }, error: "hours out of range" },
      { input: { year: 2024, month: 3, day: 2, seconds: 60 }, error: "seconds out of range" },
    ];

    for (const tc of cases) {
      expect(() => dateTime(tc.input)).toThrow(tc.error);
    }
  });

  it("parses and formats date-time strings", () => {
    const exactCases = [
      "2024-03-02T08:48:00",
      "2024-03-02T08:48:00Z",
      "2024-03-02T08:48:00.123-05:00",
      "2024-03-02T08:48:00.123456789+18:00",
      "2024-03-02T08:48:00.000000001-18:00",
    ];

    for (const tc of exactCases) {
      expect(dateTimeToString(dateTimeFromString(tc))).toBe(tc);
    }

    const zonedCases = [
      {
        input: "2024-03-02T08:48:00[America/New_York]",
        expectedSubstring: "[America/New_York]",
      },
    ];
    const invalidCases = ["2024-03-02 08:48:00"];

    for (const tc of zonedCases) {
      expect(dateTimeToString(dateTimeFromString(tc.input))).toContain(tc.expectedSubstring);
    }
    for (const tc of invalidCases) {
      expect(() => dateTimeFromString(tc)).toThrow("invalid google.type.DateTime string");
    }
  });

  it("round-trips helper-created values through string form when canonical", () => {
    const cases = [
      dateTime({ year: 2024, month: 3, day: 2 }),
      dateTime({ year: 2024, month: 3, day: 2, hours: 8, minutes: 48, seconds: 1 }),
      dateTime({
        year: 2024,
        month: 3,
        day: 2,
        hours: 8,
        minutes: 48,
        seconds: 1,
        nanos: 123_456_789,
        utcOffset: duration(-5n * 60n * 60n),
      }),
      dateTime({
        year: 2024,
        month: 3,
        day: 2,
        hours: 23,
        minutes: 59,
        seconds: 59,
        nanos: 999_999_999,
        utcOffset: duration(18n * 60n * 60n),
      }),
    ];

    for (const tc of cases) {
      expect(dateTimeFromString(dateTimeToString(tc))).toEqual(tc);
    }
  });

  it("converts to and from Temporal values where supported", () => {
    const cases = [
      {
        value: dateTimeFromPlainDateTime("2024-03-02T08:48:00.123456789"),
        convert: dateTimePlainDateTime,
        expected: "2024-03-02T08:48:00.123456789",
      },
      {
        value: dateTimeFromZonedDateTime("2024-03-02T08:48:00-05:00[America/New_York]"),
        convert: dateTimeZonedDateTime,
        expectedSubstring: "[America/New_York]",
      },
    ];

    for (const tc of cases) {
      const result = tc.convert(tc.value).toString();
      if ("expected" in tc) {
        expect(result).toBe(tc.expected);
      } else {
        expect(result).toContain(tc.expectedSubstring);
      }
    }
  });

  it("uses Temporal compatible disambiguation for named time zones", () => {
    const cases = [
      {
        value: dateTime({
          year: 2024,
          month: 3,
          day: 10,
          hours: 2,
          minutes: 30,
          timeZone: "America/New_York",
        }),
        expected: "2024-03-10T02:30:00-04:00[America/New_York]",
      },
      {
        value: dateTime({
          year: 2024,
          month: 11,
          day: 3,
          hours: 1,
          minutes: 30,
          timeZone: "America/New_York",
        }),
        expected: "2024-11-03T01:30:00-04:00[America/New_York]",
      },
    ];

    for (const tc of cases) {
      expect(dateTimeToString(tc.value)).toBe(tc.expected);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(DateTimeSchema, {
        year: 2024,
        month: 3,
        day: 2,
      }),
      create(DateTimeSchema, {
        year: 2024,
        month: 3,
        day: 2,
        hours: 23,
        minutes: 59,
        seconds: 59,
        nanos: 999_999_999,
        timeOffset: {
          case: "utcOffset",
          value: duration(18n * 60n * 60n),
        },
      }),
    ];
    const invalidCases = [
      create(DateTimeSchema, {
        year: 2024,
        month: 3,
        day: 2,
        hours: 24,
      }),
      create(DateTimeSchema, {
        year: 2024,
        month: 3,
        day: 2,
        nanos: -1,
      }),
      create(DateTimeSchema, {
        year: 2024,
        month: 3,
        day: 2,
        timeOffset: {
          case: "utcOffset",
          value: duration(18n * 60n * 60n, 1),
        },
      }),
      create(DateTimeSchema, {
        year: 2024,
        month: 3,
        day: 2,
        timeOffset: {
          case: "timeZone",
          value: { id: "" },
        },
      }),
      create(DateTimeSchema, {
        year: 2024,
        month: 3,
        day: 2,
        timeOffset: {
          case: "timeZone",
          value: { id: "Not/A_Zone" },
        },
      }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidDateTime(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidDateTime(tc)).toBe(false);
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      {
        value: dateTime({ year: 2024, month: 3, day: 2 }),
        expected: true,
      },
      {
        value: create(DateTimeSchema, {
          year: 2024,
          month: 3,
          day: 2,
          hours: 99,
        }),
        expected: false,
      },
    ];

    for (const tc of cases) {
      expect(isValidDateTime(tc.value)).toBe(tc.expected);
    }
  });
});
