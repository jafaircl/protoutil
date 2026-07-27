import {
  type Any,
  anyUnpack,
  DoubleValueSchema,
  FloatValueSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { syncedCases } from "../spec-helpers.js";
import { anyValueType } from "./any-value.js";
import { type Bool, type String as CelString, Double, Int, Uint } from "./index.js";
import { Float32NativeType } from "./native.js";
import { resolveSyncedExpr, resolveSyncedVal } from "./spec-helpers.js";

describe("common/types double", () => {
  it("common/types/double_test.go/TestDoubleConvertToNative_Any", () => {
    const actual = new Double(Number.MAX_VALUE).convertToNative(anyValueType) as Any;
    expect(anyUnpack(actual, DoubleValueSchema)).toEqual({
      $typeName: DoubleValueSchema.typeName,
      value: Number.MAX_VALUE,
    });
  });

  it("common/types/double_test.go/TestDoubleConvertToNative_Error", () => {
    expect(() => new Double(-10000).convertToNative(String)).toThrow();
  });

  it("common/types/double_test.go/TestDoubleConvertToNative_Float32", () => {
    expect(new Double(Math.PI).convertToNative(Float32NativeType)).toBe(Math.fround(Math.PI));
  });

  it("common/types/double_test.go/TestDoubleConvertToNative_Float64", () => {
    expect(new Double(30000000.1).convertToNative(Number)).toBe(30000000.1);
  });

  it("common/types/double_test.go/TestDoubleConvertToNative_Json", () => {
    expect(new Double(-1.4).convertToNative(ValueSchema)).toEqual({
      $typeName: ValueSchema.typeName,
      kind: { case: "numberValue", value: -1.4 },
    });
    expect(new Double(Number.NaN).convertToNative(ValueSchema)).toEqual({
      $typeName: ValueSchema.typeName,
      kind: { case: "numberValue", value: Number.NaN },
    });
    expect(new Double(Number.NEGATIVE_INFINITY).convertToNative(ValueSchema)).toEqual({
      $typeName: ValueSchema.typeName,
      kind: { case: "numberValue", value: Number.NEGATIVE_INFINITY },
    });
    expect(new Double(Number.POSITIVE_INFINITY).convertToNative(ValueSchema)).toEqual({
      $typeName: ValueSchema.typeName,
      kind: { case: "numberValue", value: Number.POSITIVE_INFINITY },
    });
  });

  it.todo(
    "common/types/double_test.go/TestDoubleConvertToNative_Ptr_Float32 blocked: Go pointer conversion semantics are not portable to TypeScript",
  );
  it.todo(
    "common/types/double_test.go/TestDoubleConvertToNative_Ptr_Float64 blocked: Go pointer conversion semantics are not portable to TypeScript",
  );

  it("common/types/double_test.go/TestDoubleConvertToNative_Wrapper", () => {
    expect(new Double(Math.PI).convertToNative(FloatValueSchema)).toEqual({
      $typeName: FloatValueSchema.typeName,
      value: Math.fround(Math.PI),
    });
    expect(new Double(Number.MAX_VALUE).convertToNative(DoubleValueSchema)).toEqual({
      $typeName: DoubleValueSchema.typeName,
      value: Number.MAX_VALUE,
    });
  });

  it("common/types/double_test.go/TestDoubleAdd", () => {
    expect((new Double(3).add(new Double(4)) as Double).value()).toBe(7);
  });

  it("common/types/double_test.go/TestDoubleCompare", () => {
    const cases = syncedCases<{ a: unknown; b: unknown; out: unknown }>(
      "common/types/double_test.go/TestDoubleCompare",
    );
    for (const testCase of cases) {
      const out = (resolveSyncedVal(testCase.a) as Double).compare(resolveSyncedVal(testCase.b));
      const expected = resolveSyncedExpr(testCase.out);
      if (typeof expected === "string") {
        expect(out.type().typeName()).toBe("error");
        expect(String(out.value())).toContain(expected);
      } else {
        expect(out).toEqual(expected);
      }
    }
  });

  it("common/types/double_test.go/TestDoubleConvertToType", () => {
    const cases = syncedCases<{ in: unknown; name: string; out: unknown; toType: unknown }>(
      "common/types/double_test.go/TestDoubleConvertToType",
    );
    for (const testCase of cases) {
      const toType = resolveSyncedExpr(testCase.toType);
      const out = (resolveSyncedVal(testCase.in) as Double).convertToType(toType as never);
      const expected = resolveSyncedExpr(testCase.out);
      if (testCase.name === "DoubleToType") {
        expect((out as unknown as { typeName(): string }).typeName()).toBe(expected);
      } else if (testCase.name === "DoubleToString") {
        expect((out as CelString).value()).toBe(expected);
      } else if (typeof expected === "string") {
        expect(out.type().typeName()).toBe("error");
        expect(String(out.value())).toContain(expected);
      } else if (typeof expected === "bigint") {
        expect((out as Int | Uint).value()).toBe(expected);
      } else if (typeof expected === "number") {
        expect((out as Double).value()).toBe(expected);
      } else {
        expect((out as unknown as { typeName(): string }).typeName()).toBe(expected);
      }
    }
  });

  it("common/types/double_test.go/TestDoubleDivide", () => {
    expect((new Double(4).divide(new Double(2)) as Double).value()).toBe(2);
  });

  it("common/types/double_test.go/TestDoubleEqual", () => {
    expect((new Double(42).equal(new Double(42)) as Bool).value()).toBe(true);
    expect((new Double(42).equal(new Int(42n)) as Bool).value()).toBe(true);
    expect((new Double(42).equal(new Uint(42n)) as Bool).value()).toBe(true);
  });

  it("common/types/double_test.go/TestDoubleIsZeroValue", () => {
    expect(new Double(0).isZeroValue()).toBe(true);
    expect(new Double(1).isZeroValue()).toBe(false);
  });

  it("common/types/double_test.go/TestDoubleMultiply", () => {
    expect((new Double(3).multiply(new Double(4)) as Double).value()).toBe(12);
  });

  it("common/types/double_test.go/TestDoubleNegate", () => {
    expect((new Double(3).negate() as Double).value()).toBe(-3);
  });

  it("common/types/double_test.go/TestDoubleSubtract", () => {
    expect((new Double(4).subtract(new Double(3)) as Double).value()).toBe(1);
  });
});
