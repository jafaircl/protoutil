import { create } from "@bufbuild/protobuf";
import { TimestampSchema, timestampFromMs } from "@bufbuild/protobuf/wkt";
import { describe, expect, it, test } from "vitest";
import { MAX_INT32, MIN_INT32 } from "../int32.js";
import { MAX_INT64, MIN_INT64 } from "../int64.js";
import { durationFromString, durationNanos } from "./duration.js";
import {
  clampTimestamp,
  isValidTimestamp,
  MAX_UNIX_TIME_SECONDS,
  MIN_UNIX_TIME_SECONDS,
  roundTimestampNanos,
  timestamp,
  timestampFromNanos,
  timestampFromString,
  timestampNanos,
  timestampToString,
} from "./timestamp.js";

describe("timestamp", () => {
  describe("timestamp()", () => {
    it("creates a timestamp", () => {
      const ts = timestamp(1234567890n, 123456789);
      expect(ts.seconds).toBe(1234567890n);
      expect(ts.nanos).toBe(123456789);
    });

    it("creates a timestamp with negative seconds", () => {
      const ts = timestamp(-1234567890n, 123456789);
      expect(ts.seconds).toBe(-1234567890n);
      expect(ts.nanos).toBe(123456789);
    });

    it("throws an error with negative nanoseconds", () => {
      expect(() => timestamp(1234567890n, -1)).toThrow("out-of-range nanos");
    });

    it("throws an error with nanoseconds greater than 999_999_999", () => {
      expect(() => timestamp(1234567890n, 1_000_000_000)).toThrow("out-of-range nanos");
    });

    it("throws an error if before 0001-01-01", () => {
      expect(() => timestamp(BigInt(MIN_UNIX_TIME_SECONDS) - 1n)).toThrow("before 0001-01-01");
    });

    it("throws an error if after 9999-12-31", () => {
      expect(() => timestamp(BigInt(MAX_UNIX_TIME_SECONDS) + 1n)).toThrow("after 9999-12-31");
    });

    it("accepts the final nanosecond in the protobuf timestamp range", () => {
      expect(timestamp(BigInt(MAX_UNIX_TIME_SECONDS), 999_999_999)).toStrictEqual({
        $typeName: "google.protobuf.Timestamp",
        seconds: BigInt(MAX_UNIX_TIME_SECONDS),
        nanos: 999_999_999,
      });
    });

    it("throws an error if seconds is out of range", () => {
      expect(() => timestamp(MAX_INT64 + 1n)).toThrow("out-of-range Int64");
      expect(() => timestamp(MIN_INT64 - 1n)).toThrow("out-of-range Int64");
    });

    it("throws an error if nanos is out of range", () => {
      expect(() => timestamp(0n, MAX_INT32 + 1)).toThrow("out-of-range Int32");
      expect(() => timestamp(0n, MIN_INT32 - 1)).toThrow("out-of-range Int32");
    });
  });

  describe("isValidTimestamp()", () => {
    it("validates a timestamp", () => {
      // Valid timestamps
      expect(isValidTimestamp(timestampFromMs(0))).toBe(true);
      expect(isValidTimestamp(timestampFromMs(1234567890))).toBe(true);
      expect(isValidTimestamp(timestampFromMs(-1234567890))).toBe(true);

      // Invalid timestamps
      expect(
        isValidTimestamp(
          create(TimestampSchema, {
            seconds: BigInt(MAX_UNIX_TIME_SECONDS + 1),
          }),
        ),
      ).toBe(false);
      expect(
        isValidTimestamp(
          create(TimestampSchema, {
            seconds: BigInt(MAX_UNIX_TIME_SECONDS) + 1n,
            nanos: 0,
          }),
        ),
      ).toBe(false);
      expect(
        isValidTimestamp(
          create(TimestampSchema, {
            seconds: BigInt(MIN_UNIX_TIME_SECONDS - 1),
          }),
        ),
      ).toBe(false);
      expect(
        isValidTimestamp(
          create(TimestampSchema, {
            seconds: BigInt(MIN_UNIX_TIME_SECONDS),
            nanos: -1,
          }),
        ),
      ).toBe(false);
    });
  });

  describe("timestampNanos", () => {
    it("converts timestamp to nanoseconds", () => {
      expect(timestampNanos(create(TimestampSchema, { seconds: 0n, nanos: 0 }))).toBe(0n);
      expect(
        timestampNanos(create(TimestampSchema, { seconds: 818035920n, nanos: 123456789 })),
      ).toBe(818035920123456789n);
      expect(
        timestampNanos(create(TimestampSchema, { seconds: -2n, nanos: 930 * 1_000_000 })),
      ).toBe(-1_070_000_000n);
    });
  });

  describe("timestampFromNanos", () => {
    test("converts unix timestamp with nanoseconds to Timestamp", () => {
      const timestampZero = timestampFromNanos(0n);
      expect(timestampZero.seconds).toBe(0n);
      expect(timestampZero.nanos).toBe(0);
      const timestampWithNs = timestampFromNanos(818035920123456789n);
      expect(timestampWithNs.seconds).toBe(818035920n);
      expect(timestampWithNs.nanos).toBe(123456789);
    });
    test("1000000000 ns", () => {
      const ts = timestampFromNanos(1_000_000_000n);
      expect(ts.seconds).toBe(1n);
      expect(ts.nanos).toBe(0);
    });
    it("1020000000 ns", () => {
      const ts = timestampFromNanos(1_020_000_000n);
      expect(ts.seconds).toBe(1n);
      expect(ts.nanos).toBe(20 * 1_000_000);
    });
    it("-1070000000 ns", () => {
      const ts = timestampFromNanos(-1_070_000_000n);
      expect(ts.seconds).toBe(-2n);
      expect(ts.nanos).toBe(930 * 1_000_000);
    });
    it("-9999999999 ns", () => {
      const ts = timestampFromNanos(-9_999_999_999n);
      expect(ts.seconds).toBe(-10n);
      expect(ts.nanos).toBe(1);
    });
    it("-1000000000 ns", () => {
      const ts = timestampFromNanos(-1_000_000_000n);
      expect(ts.seconds).toBe(-1n);
      expect(ts.nanos).toBe(0);
    });

    it("math should work", () => {
      const epochTimestamp = timestampFromNanos(0n);
      const epochTimestampNanos = timestampNanos(epochTimestamp);
      expect(epochTimestampNanos).toBe(0n);
      const oneWeekDuration = durationFromString(`${7 * 24 * 60 * 60}s`);
      const oneWeekDurationNanos = durationNanos(oneWeekDuration);
      expect(oneWeekDurationNanos).toBe(7n * 24n * 60n * 60n * 1_000_000_000n);
      const oneWeekAfterEpoch = timestampFromNanos(epochTimestampNanos + oneWeekDurationNanos);
      const oneWeekAfterEpochString = timestampToString(oneWeekAfterEpoch);
      expect(oneWeekAfterEpochString).toBe("1970-01-08T00:00:00Z");
    });
  });

  describe("timestampFromString()", () => {
    it("should parse", () => {
      // RFC9557 with offset
      expect(timestampFromString("2024-03-02T08:48:00-05:00")).toStrictEqual(
        timestamp(1709387280n),
      );
      expect(timestampToString(timestampFromString("2024-03-02T08:48:00-05:00"))).toEqual(
        "2024-03-02T13:48:00Z",
      );

      // RFC9557 with timezone
      expect(timestampFromString("2024-03-02T08:48:00Z[America/New_York]")).toStrictEqual(
        timestamp(1709387280n),
      );
      expect(
        timestampToString(timestampFromString("2024-03-02T08:48:00Z[America/New_York]")),
      ).toEqual("2024-03-02T13:48:00Z");

      // RFC9557 with offset and timezone
      expect(timestampFromString("2024-03-02T08:48:00-05:00[America/New_York]")).toStrictEqual(
        timestamp(1709387280n),
      );
      expect(
        timestampToString(timestampFromString("2024-03-02T08:48:00-05:00[America/New_York]")),
      ).toEqual("2024-03-02T13:48:00Z");

      // RFC3339 without timezone
      expect(timestampFromString("1970-01-01T00:00:00Z")).toStrictEqual(timestamp(0n, 0));
      expect(timestampFromString("1970-01-01t00:00:00z")).toStrictEqual(timestamp(0n, 0));
      expect(timestampFromString("1970-01-01T00:00:00z[America/New_York]")).toStrictEqual(
        timestamp(18000n, 0),
      );
      expect(timestampToString(timestampFromString("1970-01-01T00:00:00Z"))).toEqual(
        "1970-01-01T00:00:00Z",
      );

      // RFC3339 with timezone
      expect(timestampFromString("1970-01-01T00:00:00-07:00")).toStrictEqual(timestamp(25200n, 0));
      expect(timestampToString(timestampFromString("1970-01-01T00:00:00-07:00"))).toEqual(
        "1970-01-01T07:00:00Z",
      );

      // Iso8601 without timezone
      expect(timestampFromString("2011-10-05T14:48:00.000Z")).toStrictEqual(
        timestamp(1317826080n, 0),
      );
      expect(timestampToString(timestampFromString("2011-10-05T14:48:00.000Z"))).toEqual(
        "2011-10-05T14:48:00Z",
      );

      // Iso8601 with timezone
      expect(timestampFromString("2011-10-05T14:48:00.000-04:00")).toStrictEqual(
        timestamp(1317840480n, 0),
      );
      expect(timestampToString(timestampFromString("2011-10-05T14:48:00.000-04:00"))).toEqual(
        "2011-10-05T18:48:00Z",
      );

      // Nanos without timezone
      expect(timestampFromString("1970-01-01T02:07:34.000000321Z")).toStrictEqual(
        timestamp(7654n, 321),
      );
      expect(timestampToString(timestampFromString("1970-01-01T02:07:34.000000321Z"))).toEqual(
        "1970-01-01T02:07:34.000000321Z",
      );

      // Nanos with timezone
      expect(timestampFromString("1970-01-01T02:07:34.000000321-07:00")).toStrictEqual(
        timestamp(32854n, 321),
      );
      expect(timestampToString(timestampFromString("1970-01-01T02:07:34.000000321-07:00"))).toEqual(
        "1970-01-01T09:07:34.000000321Z",
      );
      expect(timestampFromString("1970-01-01T02:07:34.000000321+07:00")).toStrictEqual(
        timestamp(-17546n, 321),
      );
      expect(timestampToString(timestampFromString("1970-01-01T02:07:34.000000321+07:00"))).toEqual(
        "1969-12-31T19:07:34.000000321Z",
      );

      // February 29th, 2020
      expect(timestampFromString("2020-02-29T00:00:00.000Z")).toStrictEqual(
        timestamp(1582934400n, 0),
      );
      expect(timestampToString(timestampFromString("2020-02-29T00:00:00.000Z"))).toEqual(
        "2020-02-29T00:00:00Z",
      );

      // February 29th, 2021 was not a real date
      expect(() => timestampFromString("2021-02-29T00:00:00.000Z")).toThrow("Invalid isoDay");

      // CEL accepts an RFC 3339 leap second and normalizes it to the following instant.
      expect(timestampFromString("2025-01-01T23:59:60-08:00")).toStrictEqual(
        timestamp(1735804800n),
      );
      expect(timestampFromString("2025-01-01T23:59:60[America/New_York]")).toStrictEqual(
        timestamp(1735794000n),
      );
    });

    it("should favor the offset over the timezone", () => {
      // RFC9557 with offset and timezone
      expect(timestampFromString("2024-03-02T08:48:00-05:00[America/Los_Angeles]")).toStrictEqual(
        timestamp(1709387280n),
      );
      expect(
        timestampToString(timestampFromString("2024-03-02T08:48:00-05:00[America/Los_Angeles]")),
      ).toEqual("2024-03-02T13:48:00Z");

      // RFC9557 with timezone and offset
      expect(timestampFromString("1970-01-01T00:00:00-07:00[America/New_York]")).toStrictEqual(
        timestamp(25200n, 0),
      );
      expect(
        timestampToString(timestampFromString("1970-01-01T00:00:00-07:00[America/New_York]")),
      ).toEqual("1970-01-01T07:00:00Z");
    });
  });

  describe("timestampToString()", () => {
    it("should format", () => {
      expect(timestampToString(timestamp(1317826080n, 0))).toEqual("2011-10-05T14:48:00Z");
      expect(timestampToString(timestamp(1317826080n, 321))).toEqual(
        "2011-10-05T14:48:00.000000321Z",
      );
    });
  });

  describe("roundTimestampNanos()", () => {
    it("rounds nanoseconds to the nearest nanosecond", () => {
      const ts = create(TimestampSchema, {
        nanos: 123.456,
      });
      const rounded = roundTimestampNanos(ts);
      expect(rounded.nanos).toBe(123);
    });
  });

  describe("clampTimestamp()", () => {
    it("clamps timestamp to valid range", () => {
      const ts = create(TimestampSchema, {
        seconds: BigInt(MAX_UNIX_TIME_SECONDS) + 1n,
        nanos: 0,
      });
      const clamped = clampTimestamp(ts);
      expect(clamped.seconds).toBe(BigInt(MAX_UNIX_TIME_SECONDS));
      expect(clamped.nanos).toBe(999_999_999);
    });

    it("clamps timestamp to valid range with negative seconds", () => {
      const ts = create(TimestampSchema, {
        seconds: BigInt(MIN_UNIX_TIME_SECONDS) - 1n,
        nanos: 0,
      });
      const clamped = clampTimestamp(ts);
      expect(clamped.seconds).toBe(BigInt(MIN_UNIX_TIME_SECONDS));
      expect(clamped.nanos).toBe(0);
    });

    it("accepts alterntive min values", () => {
      const ts = create(TimestampSchema, {
        seconds: BigInt(MIN_UNIX_TIME_SECONDS),
        nanos: 0,
      });
      const clamped = clampTimestamp(ts, timestamp(-10n));
      expect(clamped.seconds).toBe(-10n);
      expect(clamped.nanos).toBe(0);
    });

    it("accepts alterntive max values", () => {
      const ts = create(TimestampSchema, {
        seconds: BigInt(MAX_UNIX_TIME_SECONDS),
        nanos: 0,
      });
      const clamped = clampTimestamp(ts, timestamp(-10n), timestamp(10n));
      expect(clamped.seconds).toBe(10n);
      expect(clamped.nanos).toBe(0);
    });
  });
});
