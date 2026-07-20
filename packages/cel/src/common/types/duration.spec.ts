import { describe, expect, it } from "vitest";
import * as overloads from "../overloads.js";
import { syncedCases } from "../spec-helpers.js";
import { type Duration, durationOf, False, Int } from "./index.js";

describe("common/types duration", () => {
  it.todo(
    "common/types/duration_test.go/TestDurationConvertToNative blocked: Go reflect-based native conversion seam is not ported 1:1 yet",
  );
  it.todo(
    "common/types/duration_test.go/TestDurationConvertToNative_Any blocked: protobuf Any packing seam is not ported 1:1 yet",
  );
  it.todo(
    "common/types/duration_test.go/TestDurationConvertToNative_Error blocked: Go protobuf JSON native conversion seam is not ported 1:1 yet",
  );
  it.todo(
    "common/types/duration_test.go/TestDurationConvertToNative_Json blocked: Go protobuf JSON native conversion seam is not ported 1:1 yet",
  );

  it("common/types/duration_test.go/TestDurationOperators", () => {
    const cases = syncedCases<{ name: string; op: unknown; out: unknown }>(
      "common/types/duration_test.go/TestDurationOperators",
    );
    for (const testCase of cases) {
      const out = runDurationOperator(testCase.name);
      const expected = resolveDurationOperatorOut(testCase.out);
      if (typeof expected === "string") {
        expect(out.type().typeName(), testCase.name).toBe("error");
        expect(String(out.value()), testCase.name).toContain(expected);
      } else {
        expect((out as Duration).value(), testCase.name).toBe(expected);
      }
    }
  });

  it("common/types/duration_test.go/TestDurationCompare", () => {
    const d = durationOf(duration(7506, 0));
    const lt = durationOf(duration(-10, 0));
    expect((d.compare(lt) as Int).value()).toBe(1n);
    expect((lt.compare(d) as Int).value()).toBe(-1n);
    expect((d.compare(d) as Int).value()).toBe(0n);
    expect(d.compare(False).type().typeName()).toBe("error");
  });

  it("common/types/duration_test.go/TestDurationConvertToType_Identity", () => {
    const d = durationOf(duration(7506, 1000));
    expect(d.convertToType(new Int(0n).type()).value()).toBe(7_506_000_001_000n);
    expect(d.convertToType(d.type())).toBe(d);
  });

  it("common/types/duration_test.go/TestDurationNegate", () => {
    expect((durationOf(duration(1234, 1)).negate() as Duration).value()).toBe(duration(-1234, -1));
  });

  it("common/types/duration_test.go/TestDurationGetHours", () => {
    const d = durationOf(duration(7506, 0));
    expect((d.receive(overloads.TimeGetHours, overloads.DurationToHours, []) as Int).value()).toBe(
      2n,
    );
  });

  it("common/types/duration_test.go/TestDurationGetMinutes", () => {
    const d = durationOf(duration(7506, 0));
    expect(
      (d.receive(overloads.TimeGetMinutes, overloads.DurationToMinutes, []) as Int).value(),
    ).toBe(125n);
  });

  it("common/types/duration_test.go/TestDurationGetSeconds", () => {
    const d = durationOf(duration(7506, 0));
    expect(
      (d.receive(overloads.TimeGetSeconds, overloads.DurationToSeconds, []) as Int).value(),
    ).toBe(7506n);
  });

  it("common/types/duration_test.go/TestDurationGetMilliseconds", () => {
    const d = durationOf(duration(7506, 0));
    expect(
      (
        d.receive(overloads.TimeGetMilliseconds, overloads.DurationToMilliseconds, []) as Int
      ).value(),
    ).toBe(7_506_000n);
  });

  it("common/types/duration_test.go/TestDurationIsZeroValue", () => {
    expect(durationOf(1n).isZeroValue()).toBe(false);
    expect(durationOf(0n).isZeroValue()).toBe(true);
  });
});

function duration(seconds: number, nanos: number): bigint {
  return BigInt(seconds) * 1_000_000_000n + BigInt(nanos);
}

function runDurationOperator(name: string) {
  const d = duration(7506, 567);
  const dSecond = duration(1, 0);
  const dNano = duration(0, 1);
  const dMax = 9_223_372_036_854_775_807n;
  const dMin = -9_223_372_036_854_775_808n;
  switch (name) {
    case "DurationAddSelf":
      return durationOf(d).add(durationOf(d));
    case "DurationMaxAddOneNanoOverflow":
      return durationOf(dMax).add(durationOf(dNano));
    case "DurationMaxAddOneSecondOverflow":
      return durationOf(dMax).add(durationOf(dSecond));
    case "DurationMinAddMinusOneOverflow":
      return durationOf(dMin).add(durationOf(-dSecond));
    case "DurationSubSelf":
      return durationOf(d).subtract(durationOf(d));
    case "DurationMaxSubMinusOneOverflow":
      return durationOf(dMax).subtract(durationOf(-dNano));
    case "DurationMinSubOneOverflow":
      return durationOf(dMin).subtract(durationOf(dNano));
    default:
      throw new Error(`unsupported synced duration operator case: ${name}`);
  }
}

function resolveDurationOperatorOut(out: unknown): bigint | string {
  const expr = (out as { $expr?: string } | undefined)?.$expr;
  switch (expr) {
    case "d + d":
      return duration(7506, 567) + duration(7506, 567);
    case "duration(0, 0)":
      return 0n;
    case "errIntOverflow":
      return "integer overflow";
  }
  throw new Error(`unsupported synced duration operator out: ${JSON.stringify(out)}`);
}
