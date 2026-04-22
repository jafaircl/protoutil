import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { TimeZoneSchema } from "../../gen/google/type/datetime_pb.js";
import { assertValidTimeZone, isValidTimeZone, timeZone } from "./timezone.js";

interface ValidTimeZoneCase {
  id: string;
  version?: string;
  expected: {
    id: string;
    version: string;
  };
}

interface InvalidTimeZoneCase {
  id: string;
  version?: string;
  error: string;
}

describe("google/type time zone helpers", () => {
  it("creates valid IANA time zones and preserves version metadata", () => {
    const cases: ValidTimeZoneCase[] = [
      { id: "UTC", expected: { id: "UTC", version: "" } },
      {
        id: "America/New_York",
        expected: { id: "America/New_York", version: "" },
      },
      {
        id: "Europe/Paris",
        version: "2024a",
        expected: { id: "Europe/Paris", version: "2024a" },
      },
    ];

    for (const tc of cases) {
      expect(timeZone(tc.id, tc.version)).toMatchObject(tc.expected);
    }
  });

  it("rejects invalid time zone ids", () => {
    const cases: InvalidTimeZoneCase[] = [
      { id: "", error: "timeZone.id is required" },
      { id: "Not/A_Zone", error: "invalid time zone id" },
    ];

    for (const tc of cases) {
      expect(() => timeZone(tc.id, tc.version)).toThrow(tc.error);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(TimeZoneSchema, { id: "UTC" }),
      create(TimeZoneSchema, { id: "America/New_York", version: "2024a" }),
    ];
    const invalidCases = [
      create(TimeZoneSchema, { id: "" }),
      create(TimeZoneSchema, { id: "Not/A_Zone" }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidTimeZone(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidTimeZone(tc)).toBe(false);
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      { value: timeZone("UTC"), expected: true },
      { value: create(TimeZoneSchema, { id: "Not/A_Zone" }), expected: false },
    ];

    for (const tc of cases) {
      expect(isValidTimeZone(tc.value)).toBe(tc.expected);
    }
  });
});
