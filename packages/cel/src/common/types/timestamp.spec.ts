import { describe, expect, it } from "vitest";
import * as overloads from "../overloads.js";
import { syncedCases } from "../spec-helpers.js";
import {
  Bool,
  String as CelString,
  durationOf,
  Int,
  type Timestamp,
  timestampOf,
} from "./index.js";

describe("common/types timestamp", () => {
  it.todo(
    "common/types/timestamp_test.go/TestTimestampConvertToNative_Any blocked: protobuf Any packing seam is not ported 1:1 yet",
  );
  it.todo(
    "common/types/timestamp_test.go/TestTimestampConvertToNative blocked: Go reflect-based native conversion seam is not ported 1:1 yet",
  );

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
});

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
