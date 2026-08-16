import { type Any, anyUnpack, TimestampSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import * as overloads from "../overloads.js";
import { syncedCases } from "../spec-helpers.js";
import { anyValueType } from "./any-value.js";
import {
  Bool,
  String as CelString,
  durationOf,
  Int,
  parseTimestamp,
  type Timestamp,
  TimestampType,
  timestampOf,
} from "./index.js";

describe("common/types timestamp", () => {
  it("common/types/timestamp_test.go/TestIsStrictRFC3339MatchesPattern", () => {
    const accepted = [
      "2025-01-01T12:34:56Z",
      "2025-01-01T12:34:56z",
      "2025-01-01t12:34:56Z",
      "2025-01-01T12:34:56.123456789Z",
      "2025-01-01T23:59:60-08:00",
    ];
    const rejected = [
      "2025-00-01T12:34:56Z",
      "2025-01-01T12:34:56,123Z",
      "2025-01-01T24:00:00Z",
      "2025-01-01T12:34:56+24:00",
      "2025-01-01 12:34:56Z",
    ];
    for (const value of accepted) {
      expect(new CelString(value).convertToType(TimestampType).type(), value).toBe(TimestampType);
    }
    for (const value of rejected) {
      expect(new CelString(value).convertToType(TimestampType).type().typeName(), value).toBe(
        "error",
      );
    }
  });

  it("common/types/timestamp_test.go/TestTimestampConvertToNative_Any", () => {
    const ts = timestampOf(7506n, 0);
    const actual = ts.convertToNative(anyValueType) as Any;
    expect(anyUnpack(actual, TimestampSchema)).toEqual({
      $typeName: TimestampSchema.typeName,
      seconds: 7506n,
      nanos: 0,
    });
  });

  it("common/types/timestamp_test.go/TestTimestampConvertToNative", () => {
    const ts = timestampOf(7506n, 0);
    expect(ts.convertToNative(TimestampSchema)).toEqual({
      $typeName: TimestampSchema.typeName,
      seconds: 7506n,
      nanos: 0,
    });
    expect(ts.convertToNative(ValueSchema)).toEqual({
      $typeName: ValueSchema.typeName,
      kind: { case: "stringValue", value: "1970-01-01T02:05:06Z" },
    });
    const actual = ts.convertToNative(anyValueType) as Any;
    expect(anyUnpack(actual, TimestampSchema)).toEqual({
      $typeName: TimestampSchema.typeName,
      seconds: 7506n,
      nanos: 0,
    });
    expect(
      ts.convertToNative(
        ts.constructor as typeof timestampOf extends (...args: never[]) => infer T
          ? new (
              ...args: never[]
            ) => T
          : never,
      ),
    ).toEqual(ts);
    expect(ts.convertToNative(Date)).toEqual(new Date("1970-01-01T02:05:06.000Z"));
  });

  it("common/types/timestamp_test.go/TestTimestampConvertToType", () => {
    const ts = timestampOf(7654n, 321);
    expect(ts.convertToType(ts.type())).toBe(ts);
    expect((ts.convertToType(new Int(0n).type()) as Int).value()).toBe(7654n);
    expect((ts.convertToType(new CelString("").type()) as CelString).value()).toBe(
      "1970-01-01T02:07:34.000000321Z",
    );
    expect(ts.convertToType(durationOf(0n).type()).type().typeName()).toBe("error");
  });

  it("common/types/timestamp_test.go/TestTimestampOperators", () => {
    const cases = syncedCases<{ name: string; op: unknown; out: unknown }>(
      "common/types/timestamp_test.go/TestTimestampOperators",
    );
    for (const testCase of cases) {
      const out = runTimestampOperator(testCase.name);
      const expected = resolveTimestampOperatorOut(testCase.name);
      if (typeof expected === "string") {
        expect(out.type().typeName(), testCase.name).toBe("error");
        expect(String(out.value()), testCase.name).toContain(expected);
      } else if (typeof expected === "object") {
        expect(
          (out as Timestamp).equal(timestampOf(expected.seconds, expected.nanos)),
          testCase.name,
        ).toEqual(new Bool(true));
      } else {
        expect((out as { value(): bigint }).value(), testCase.name).toBe(expected);
      }
    }
  });

  it("common/types/timestamp_test.go/TestTimestampIsZeroValue", () => {
    expect(timestampOf(0n, 0).isZeroValue()).toBe(false);
  });

  it("common/types/timestamp_test.go/TestTimestampGetDayOfMonth", () => {
    const ts = timestampOf(7506n, 0);
    expect(
      (
        ts.receive(overloads.TimeGetDayOfMonth, overloads.TimestampToDayOfMonthZeroBased, []) as Int
      ).value(),
    ).toBe(0n);
    expect(
      (
        ts.receive(overloads.TimeGetDate, overloads.TimestampToDayOfMonthOneBased, [
          new CelString("America/Phoenix"),
        ]) as Int
      ).value(),
    ).toBe(31n);
  });

  it("common/types/timestamp_test.go/TestTimestampGetDayOfYear", () => {
    const ts = timestampOf(7506n, 0);
    expect(
      (ts.receive(overloads.TimeGetDayOfYear, overloads.TimestampToDayOfYear, []) as Int).value(),
    ).toBe(0n);
  });

  it("common/types/timestamp_test.go/TestTimestampGetFullYear", () => {
    const ts = timestampOf(7506n, 0);
    expect(
      (ts.receive(overloads.TimeGetFullYear, overloads.TimestampToYear, []) as Int).value(),
    ).toBe(1970n);
  });

  it("common/types/timestamp_test.go/TestTimestampGetMonth", () => {
    const ts = timestampOf(7506n, 0);
    expect(
      (ts.receive(overloads.TimeGetMonth, overloads.TimestampToMonth, []) as Int).value(),
    ).toBe(0n);
  });

  it("common/types/timestamp_test.go/TestTimestampGetDayOfWeek", () => {
    const ts = timestampOf(7506n, 0);
    expect(
      (ts.receive(overloads.TimeGetDayOfWeek, overloads.TimestampToDayOfWeek, []) as Int).value(),
    ).toBe(4n);
  });

  it("common/types/timestamp_test.go/TestTimestampGetHours", () => {
    const ts = timestampOf(7506n, 0);
    expect(
      (ts.receive(overloads.TimeGetHours, overloads.TimestampToHours, []) as Int).value(),
    ).toBe(2n);
  });

  it("common/types/timestamp_test.go/TestTimestampGetMinutes", () => {
    const ts = timestampOf(7506n, 0);
    expect(
      (ts.receive(overloads.TimeGetMinutes, overloads.TimestampToMinutes, []) as Int).value(),
    ).toBe(5n);
  });

  it("common/types/timestamp_test.go/TestTimestampGetSeconds", () => {
    const ts = timestampOf(7506n, 0);
    expect(
      (ts.receive(overloads.TimeGetSeconds, overloads.TimestampToSeconds, []) as Int).value(),
    ).toBe(6n);
  });

  it("common/types/timestamp_test.go/TestTimestampGetMilliseconds", () => {
    const ts = timestampOf(7506n, 1_000_000);
    expect(
      (
        ts.receive(overloads.TimeGetMilliseconds, overloads.TimestampToMilliseconds, []) as Int
      ).value(),
    ).toBe(1n);
  });

  it("common/types/timestamp_test.go/TestParseTimestamp", () => {
    const cases = syncedCases<{ name: string; val: unknown; want?: unknown; wantErr?: boolean }>(
      "common/types/timestamp_test.go/TestParseTimestamp",
    );
    for (const testCase of cases) {
      const expected = resolveParseTimestampCase(testCase.name);
      if (expected === goOnly) {
        continue;
      }
      if (expected === undefined) {
        expect(
          () => parseTimestamp(resolveParseTimestampInput(testCase.name)),
          testCase.name,
        ).toThrow();
        continue;
      }
      const parsed = parseTimestamp(resolveParseTimestampInput(testCase.name));
      expect(parsed.value(), testCase.name).toEqual(expected);
    }
  });
});

/**
 * goOnly marks synced cases whose input type has no TypeScript analogue.
 */
const goOnly = Symbol("go-only");

/**
 * resolveParseTimestampInput maps one synced Go input expression onto its TypeScript analogue.
 */
function resolveParseTimestampInput(name: string): unknown {
  switch (name) {
    case "nil":
      return null;
    case "empty string":
      return "";
    case "time.Time":
      return new Date(1_700_000_000_000);
    case "Timestamp struct":
      return timestampOf(1_700_000_000n, 0);
    case "*tpb.Timestamp":
      return { $typeName: "google.protobuf.Timestamp", seconds: 1_700_000_000n, nanos: 0 };
    case "int":
    case "int32":
    case "int64":
      return 1_700_000_000n;
    case "float64":
      return 1_700_000_000.5;
    case "float64 negative":
      return -1_700_000_000.5;
    case "float64 MaxFloat64 overflow":
      return Number.MAX_VALUE;
    case "float64 NaN overflow":
      return Number.NaN;
    case "float64 Inf overflow":
      return Number.POSITIVE_INFINITY;
    case "float64 -Inf overflow":
      return Number.NEGATIVE_INFINITY;
    case "string RFC3339":
      return "2026-08-10T12:00:00Z";
    case "string RFC3339Nano":
      return "2026-08-10T12:00:00.500Z";
    case "string RFC3339 invalid":
      return "2026-99-99T99:99:99Z";
    case "string epoch int":
      return "1700000000";
    case "string epoch float":
      return "1700000000.5";
    case "string invalid":
      return "not-a-timestamp";
    case "unsupported map type":
      return {};
    case "overflow":
      return 999_999_999_999_999n;
    default:
      throw new Error(`unsupported synced parseTimestamp case: ${name}`);
  }
}

/**
 * resolveParseTimestampCase returns the expected components, `undefined` when the case must
 * throw, or `goOnly` when the Go input type does not exist in TypeScript.
 */
function resolveParseTimestampCase(
  name: string,
): { seconds: bigint; nanos: number } | undefined | typeof goOnly {
  switch (name) {
    // Go's float32, json.Number, and typed-nil pointer cases have no TypeScript analogue.
    case "nil *tpb.Timestamp":
    case "float32":
    case "float32 negative":
    case "json.Number int":
    case "json.Number float":
    case "json.Number invalid":
      return goOnly;
    case "time.Time":
    case "Timestamp struct":
    case "*tpb.Timestamp":
    case "int":
    case "int32":
    case "int64":
    case "string epoch int":
      return { seconds: 1_700_000_000n, nanos: 0 };
    case "float64":
    case "string epoch float":
      return { seconds: 1_700_000_000n, nanos: 500_000_000 };
    case "float64 negative":
      return { seconds: -1_700_000_000n, nanos: -500_000_000 };
    // 2026-08-10T12:00:00Z
    case "string RFC3339":
      return { seconds: 1_786_363_200n, nanos: 0 };
    case "string RFC3339Nano":
      return { seconds: 1_786_363_200n, nanos: 500_000_000 };
    default:
      return undefined;
  }
}

function runTimestampOperator(name: string) {
  const unixTimestamp = (epoch: bigint) => timestampOf(epoch, 0);
  switch (name) {
    case "DateAddOneHourMinusOneMilli":
      return unixTimestamp(3506n).add(durationOf(3_599_999_000_000n));
    case "DateAddOneHourOneNano":
      return unixTimestamp(3506n).add(durationOf(3_600_000_000_001n));
    case "IntMaxAddOneSecond":
      return unixTimestamp(9_223_372_036_854_775_807n).add(durationOf(1_000_000_000n));
    case "MaxTimestampAddOneSecond":
      return unixTimestamp(253_402_300_799n).add(durationOf(1_000_000_000n));
    case "MaxIntAddOneViaNanos":
      return timestampOf(9_223_372_036_854_775_807n, 999_999_999).add(durationOf(1n));
    case "SecondsWithNanosNegative": {
      const ts1 = unixTimestamp(1n).add(durationOf(1n)) as Timestamp;
      return ts1.add(durationOf(-999_999_999n));
    }
    case "SecondsWithNanosPositive": {
      const ts1 = unixTimestamp(1n).add(durationOf(999_999_999n)) as Timestamp;
      return ts1.add(durationOf(999_999_999n));
    }
    case "DateAddDateError":
      return unixTimestamp(1n).add(unixTimestamp(1n));
    case "DateCompareEqual":
      return unixTimestamp(1n).compare(unixTimestamp(1n));
    case "DateCompareBefore":
      return unixTimestamp(1n).compare(unixTimestamp(200n));
    case "DateCompareAfter":
      return unixTimestamp(1000n).compare(unixTimestamp(200n));
    case "DateCompareError":
      return unixTimestamp(1000n).compare(durationOf(1000n));
    case "TimeSubOneSecond":
      return unixTimestamp(100n).subtract(unixTimestamp(1n));
    case "DateSubOneHour":
      return unixTimestamp(3506n).subtract(durationOf(3_600_000_000_000n));
    case "MinTimestampSubOneSecond":
      return unixTimestamp(-62_135_596_800n).subtract(durationOf(1_000_000_000n));
    case "MinTimestampSubMinusOneViaNanos":
      return timestampOf(-62_135_596_800n, 2).subtract(durationOf(-999_999_999n));
    case "MinIntSubOneViaNanosOverflow":
      return timestampOf(-9_223_372_036_854_775_808n, 0).subtract(durationOf(1n));
    case "TimeWithNanosPositive":
      return timestampOf(2n, 1).subtract(timestampOf(0n, 999_999_999));
    case "TimeWithNanosNegative":
      return timestampOf(1n, 1).subtract(timestampOf(2n, 999_999_999));
    case "MinTimestampMinusOne":
      return unixTimestamp(-9_223_372_036_854_775_808n).subtract(unixTimestamp(1n));
    case "DateMinusDateDurationOverflow":
      return unixTimestamp(253_402_300_799n).subtract(unixTimestamp(-62_135_596_800n));
    case "MinTimestampMinusOneViaNanosScaleOverflow":
      return timestampOf(-9_223_372_036_854_775_808n, 1).subtract(timestampOf(0n, -999_999_999));
    case "DateSubMinDuration":
      return unixTimestamp(1n).subtract(durationOf(-9_223_372_036_854_775_808n));
    default:
      throw new Error(`unsupported synced timestamp operator case: ${name}`);
  }
}

function resolveTimestampOperatorOut(
  name: string,
): { seconds: bigint; nanos: number } | bigint | string {
  switch (name) {
    case "DateAddOneHourMinusOneMilli":
      return { seconds: 7105n, nanos: 999_000_000 };
    case "DateAddOneHourOneNano":
      return { seconds: 7106n, nanos: 1 };
    case "IntMaxAddOneSecond":
      return "integer overflow";
    case "MaxTimestampAddOneSecond":
      return "timestamp overflow";
    case "MaxIntAddOneViaNanos":
      return "integer overflow";
    case "SecondsWithNanosNegative":
      return { seconds: 0n, nanos: 2 };
    case "SecondsWithNanosPositive":
      return { seconds: 2n, nanos: 999_999_998 };
    case "DateAddDateError":
      return "no such overload";
    case "DateCompareEqual":
      return 0n;
    case "DateCompareBefore":
      return -1n;
    case "DateCompareAfter":
      return 1n;
    case "DateCompareError":
      return "no such overload";
    case "TimeSubOneSecond":
      return 99_000_000_000n;
    case "DateSubOneHour":
      return { seconds: -94n, nanos: 0 };
    case "MinTimestampSubOneSecond":
      return "timestamp overflow";
    case "MinTimestampSubMinusOneViaNanos":
      return { seconds: -62_135_596_799n, nanos: 1 };
    case "MinIntSubOneViaNanosOverflow":
      return "integer overflow";
    case "TimeWithNanosPositive":
      return 1_000_000_002n;
    case "TimeWithNanosNegative":
      return -1_999_999_998n;
    case "MinTimestampMinusOne":
      return "integer overflow";
    case "DateMinusDateDurationOverflow":
      return "integer overflow";
    case "MinTimestampMinusOneViaNanosScaleOverflow":
      return "integer overflow";
    case "DateSubMinDuration":
      return "integer overflow";
    default:
      throw new Error(`unsupported synced timestamp operator out: ${name}`);
  }
}
