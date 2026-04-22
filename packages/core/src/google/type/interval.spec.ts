import { create } from "@bufbuild/protobuf";
import { type Timestamp, TimestampSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { IntervalSchema } from "../../gen/google/type/interval_pb.js";
import { timestamp, timestampFromString } from "../../wkt/timestamp.js";
import {
  assertValidInterval,
  interval,
  intervalFromInstants,
  intervalInstants,
  isValidInterval,
} from "./interval.js";

interface InvalidIntervalCase {
  startTime?: Timestamp;
  endTime?: Timestamp;
  error: string;
}

describe("google/type interval helpers", () => {
  it("creates valid open, bounded, and empty intervals", () => {
    const cases = [
      {
        value: interval(),
        expected: {},
      },
      {
        value: interval(timestampFromString("2024-03-02T08:48:00Z")),
        expected: {
          startTime: timestampFromString("2024-03-02T08:48:00Z"),
        },
      },
      {
        value: interval(undefined, timestampFromString("2024-03-02T09:00:00Z")),
        expected: {
          endTime: timestampFromString("2024-03-02T09:00:00Z"),
        },
      },
      {
        value: interval(
          timestampFromString("2024-03-02T08:48:00Z"),
          timestampFromString("2024-03-02T09:00:00Z"),
        ),
        expected: {
          startTime: timestampFromString("2024-03-02T08:48:00Z"),
          endTime: timestampFromString("2024-03-02T09:00:00Z"),
        },
      },
      {
        value: interval(
          timestampFromString("2024-03-02T08:48:00Z"),
          timestampFromString("2024-03-02T08:48:00Z"),
        ),
        expected: {
          startTime: timestampFromString("2024-03-02T08:48:00Z"),
          endTime: timestampFromString("2024-03-02T08:48:00Z"),
        },
      },
    ];

    for (const tc of cases) {
      expect(tc.value).toEqual(expect.objectContaining(tc.expected));
    }
  });

  it("rejects invalid interval ordering and invalid timestamp bounds", () => {
    const cases: InvalidIntervalCase[] = [
      {
        startTime: timestampFromString("2024-03-02T09:00:00Z"),
        endTime: timestampFromString("2024-03-02T08:48:00Z"),
        error: "startTime must be less than or equal to endTime",
      },
      {
        startTime: create(TimestampSchema, { seconds: 0n, nanos: -1 }),
        endTime: timestampFromString("2024-03-02T08:48:00Z"),
        error: "out-of-range nanos",
      },
    ];

    for (const tc of cases) {
      expect(() => interval(tc.startTime, tc.endTime)).toThrow(tc.error);
    }
  });

  it("converts to and from Temporal.Instant bounds", () => {
    const value = intervalFromInstants("2024-03-02T08:48:00Z", "2024-03-02T09:00:00Z");
    const bounds = intervalInstants(value);

    expect(bounds.start?.toString()).toBe("2024-03-02T08:48:00Z");
    expect(bounds.end?.toString()).toBe("2024-03-02T09:00:00Z");
  });

  it("preserves unbounded interval edges through Temporal conversion", () => {
    const cases = [
      {
        value: interval(),
        expected: { start: undefined, end: undefined },
      },
      {
        value: interval(undefined, timestampFromString("2024-03-02T09:00:00Z")),
        expected: { start: undefined, end: "2024-03-02T09:00:00Z" },
      },
    ];

    for (const tc of cases) {
      const bounds = intervalInstants(tc.value);
      expect(bounds.start?.toString()).toBe(tc.expected.start);
      expect(bounds.end?.toString()).toBe(tc.expected.end);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(IntervalSchema, {}),
      create(IntervalSchema, {
        startTime: timestamp(1709369280n),
      }),
      create(IntervalSchema, {
        startTime: timestamp(1709369280n),
        endTime: timestamp(1709369280n),
      }),
    ];
    const invalidCases = [
      create(IntervalSchema, {
        startTime: timestamp(1709369281n),
        endTime: timestamp(1709369280n),
      }),
      create(IntervalSchema, {
        startTime: create(TimestampSchema, { seconds: 0n, nanos: -1 }),
      }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidInterval(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidInterval(tc)).toBe(false);
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      {
        value: interval(
          timestampFromString("2024-03-02T08:48:00Z"),
          timestampFromString("2024-03-02T09:00:00Z"),
        ),
        expected: true,
      },
      {
        value: create(IntervalSchema, {
          startTime: timestamp(2n),
          endTime: timestamp(1n),
        }),
        expected: false,
      },
    ];

    for (const tc of cases) {
      expect(isValidInterval(tc.value)).toBe(tc.expected);
    }
  });
});
