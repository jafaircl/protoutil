import { create } from "@bufbuild/protobuf";
import { DurationSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { MAX_INT32, MIN_INT32 } from "../int32.js";
import { MAX_INT64, MIN_INT64 } from "../int64.js";
import {
  clampDuration,
  duration,
  durationFromNanos,
  durationFromString,
  durationNanos,
  durationToString,
  isValidDuration,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
} from "./duration.js";

describe("duration", () => {
  describe("duration()", () => {
    it("creates a duration", () => {
      const ts = duration(1234567890n, 123456789);
      expect(ts.seconds).toBe(1234567890n);
      expect(ts.nanos).toBe(123456789);
    });

    it("throws an error for out of range nanos", () => {
      expect(() => duration(0n, 1_000_000_000)).toThrow("out-of-range nanos");
      expect(() => duration(0n, 999_999_999)).not.toThrow();
      expect(() => duration(0n, -1_000_000_000)).toThrow("out-of-range nanos");
      expect(() => duration(0n, -999_999_999)).not.toThrow();
      expect(() => duration(0n, MAX_INT32 + 1)).toThrow("out-of-range Int32");
      expect(() => duration(0n, MIN_INT32 - 1)).toThrow("out-of-range Int32");
    });

    it("throws an error for out of range seconds", () => {
      expect(() => duration(315_576_000_001n)).toThrow("exceeds +10000 years");
      expect(() => duration(315_576_000_000n)).not.toThrow();
      expect(() => duration(315_576_000_000n, 1)).toThrow("exceeds +10000 years");
      expect(() => duration(-315_576_000_001n)).toThrow("exceeds -10000 years");
      expect(() => duration(-315_576_000_000n)).not.toThrow();
      expect(() => duration(-315_576_000_000n, -1)).toThrow("exceeds -10000 years");
      expect(() => duration(MAX_INT64 + 1n)).toThrow("out-of-range Int64");
      expect(() => duration(MIN_INT64 - 1n)).toThrow("out-of-range Int64");
    });
  });

  describe("isValidDuration()", () => {
    it("validates a duration", () => {
      // Valid durations
      expect(isValidDuration(create(DurationSchema, { seconds: 0n, nanos: 0 }))).toBe(true);
      expect(
        isValidDuration(create(DurationSchema, { seconds: 1234567890n, nanos: 123456789 })),
      ).toBe(true);
      expect(
        isValidDuration(create(DurationSchema, { seconds: -1234567890n, nanos: -123456789 })),
      ).toBe(true);

      // Invalid durations
      expect(isValidDuration(create(DurationSchema, { seconds: 315_576_000_001n }))).toBe(false);
      expect(isValidDuration(create(DurationSchema, { seconds: 315_576_000_000n, nanos: 1 }))).toBe(
        false,
      );
      expect(isValidDuration(create(DurationSchema, { seconds: -315_576_000_001n }))).toBe(false);
      expect(
        isValidDuration(create(DurationSchema, { seconds: -315_576_000_000n, nanos: -1 })),
      ).toBe(false);
    });
  });

  describe("durationFromString()", () => {
    it("should throw an error if the string is not formatted correctly", () => {
      expect(() => durationFromString("invalid")).toThrow(
        `Invalid input: 'invalid'. A duration string is a possibly signed sequence of decimal numbers, each with optional fraction and a unit suffix, such as "300ms", "-1.5h" or "2h45m". Valid time units are "ns", "us" (or "µs"), "ms", "s", "m", "h".`,
      );
      expect(() => durationFromString("1.0")).toThrow(
        `Invalid input: '1.0'. A duration string is a possibly signed sequence of decimal numbers, each with optional fraction and a unit suffix, such as "300ms", "-1.5h" or "2h45m". Valid time units are "ns", "us" (or "µs"), "ms", "s", "m", "h".`,
      );
    });

    it("should create a duration from a string", () => {
      expect(durationFromString("0s")).toEqual(duration(0n, 0));
      expect(durationFromString("-1s")).toEqual(duration(-1n, 0));
      expect(durationFromString("1s")).toEqual(duration(1n, 0));
      expect(durationFromString("1.000000001s")).toEqual(duration(1n, 1));
      expect(durationFromString("-1.000000001s")).toEqual(duration(-1n, -1));
      expect(durationFromString("1.01s")).toEqual(duration(1n, 10000000));
      expect(durationFromString("-1.01s")).toEqual(duration(-1n, -10000000));
      expect(durationFromString("1.1s")).toEqual(duration(1n, 100000000));
      expect(durationFromString("-1.1s")).toEqual(duration(-1n, -100000000));
      expect(durationFromString("1.234s")).toEqual(duration(1n, 234000000));
      expect(durationFromString("-1.234s")).toEqual(duration(-1n, -234000000));
      expect(durationFromString("1.00234s")).toEqual(duration(1n, 2340000));
      expect(durationFromString("-1.00234s")).toEqual(duration(-1n, -2340000));
      expect(durationFromString("1ns")).toEqual(duration(0n, 1));
      expect(durationFromString("-1ns")).toEqual(duration(0n, -1));
      expect(durationFromString("1µs")).toEqual(duration(0n, 1000));
      expect(durationFromString("-1µs")).toEqual(duration(0n, -1000));
      expect(durationFromString("1ms")).toEqual(duration(0n, 1000000));
      expect(durationFromString("-1ms")).toEqual(duration(0n, -1000000));
      expect(durationFromString("1m1.234s")).toEqual(duration(1n * 60n + 1n, 234000000));
      expect(durationFromString("-1m1.234s")).toEqual(duration(-1n * 60n - 1n, -234000000));
      expect(durationFromString("1h4.567s")).toEqual(duration(1n * 60n * 60n + 4n, 567000000));
      expect(durationFromString("-1h4.567s")).toEqual(duration(-1n * 60n * 60n - 4n, -567000000));
    });
  });

  describe("durationToString()", () => {
    it("should convert a duration to a string", () => {
      expect(durationToString(duration(0n, 0))).toBe("0s");
      expect(durationToString(duration(-1n, 0))).toBe("-1s");
      expect(durationToString(duration(1n, 0))).toBe("1s");
      expect(durationToString(duration(1n, 1))).toBe("1.000000001s");
      expect(durationToString(duration(-1n, -1))).toBe("-1.000000001s");
    });
  });

  describe("durationFromNanos()", () => {
    it("should create a duration from nanoseconds", () => {
      expect(durationFromNanos(0n)).toEqual(duration(0n, 0));
      expect(durationFromNanos(1n)).toEqual(duration(0n, 1));
      expect(durationFromNanos(-1n)).toEqual(duration(0n, -1));
      expect(durationFromNanos(1_000_000_000n)).toEqual(duration(1n, 0));
      expect(durationFromNanos(-1_000_000_000n)).toEqual(duration(-1n, 0));
      expect(durationFromNanos(1_000_000_001n)).toEqual(duration(1n, 1));
      expect(durationFromNanos(-1_000_000_001n)).toEqual(duration(-1n, -1));
    });
  });

  describe("durationNanos()", () => {
    it("should convert a duration to nanoseconds", () => {
      expect(durationNanos(duration(0n, 0))).toBe(0n);
      expect(durationNanos(duration(1n, 0))).toBe(1_000_000_000n);
      expect(durationNanos(duration(-1n, 0))).toBe(-1_000_000_000n);
      expect(durationNanos(duration(0n, 1))).toBe(1n);
      expect(durationNanos(duration(0n, -1))).toBe(-1n);
      expect(durationNanos(duration(1n, 1))).toBe(1_000_000_001n);
      expect(durationNanos(duration(-1n, -1))).toBe(-1_000_000_001n);
    });
  });

  describe("clampDuration()", () => {
    it("should clamp a duration to the max duration", () => {
      const d = create(DurationSchema, { seconds: MAX_DURATION_SECONDS + 1n });
      const clamped = clampDuration(d);
      expect(clamped.seconds).toBe(MAX_DURATION_SECONDS);
      expect(clamped.nanos).toBe(0);
    });

    it("should clamp a duration to the min duration", () => {
      const d = create(DurationSchema, { seconds: MIN_DURATION_SECONDS - 1n });
      const clamped = clampDuration(d);
      expect(clamped.seconds).toBe(MIN_DURATION_SECONDS);
      expect(clamped.nanos).toBe(0);
    });

    it("should accept a custom min duration", () => {
      const d = create(DurationSchema, { seconds: -100n });
      const min = create(DurationSchema, { seconds: -50n });
      const clamped = clampDuration(d, min);
      expect(clamped.seconds).toBe(-50n);
      expect(clamped.nanos).toBe(0);
    });

    it("should accept a custom max duration", () => {
      const d = create(DurationSchema, { seconds: 100n });
      const max = create(DurationSchema, { seconds: 50n });
      const clamped = clampDuration(d, undefined, max);
      expect(clamped.seconds).toBe(50n);
      expect(clamped.nanos).toBe(0);
    });
  });
});
