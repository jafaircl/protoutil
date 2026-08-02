import {
  type Any,
  anyUnpack,
  Int32ValueSchema,
  Int64ValueSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { syncedCases } from "../spec-helpers.js";
import { anyValueType } from "./any-value.js";
import { type Bool, String as CelString, Double, Int, Uint } from "./index.js";
import { Int8NativeType, Int16NativeType, Int32NativeType } from "./native.js";
import { resolveSyncedExpr, resolveSyncedVal } from "./spec-helpers.js";

describe("common/types int", () => {
  it("common/types/int_test.go/TestIntConvertToNative_Any", () => {
    const actual = new Int(9_223_372_036_854_775_807n).convertToNative(anyValueType) as Any;
    expect(anyUnpack(actual, Int64ValueSchema)).toEqual({
      $typeName: Int64ValueSchema.typeName,
      value: 9_223_372_036_854_775_807n,
    });
  });

  it("common/types/int_test.go/TestIntConvertToNative_Error", () => {
    expect(() => new Int(1n).convertToNative({})).toThrow();
  });

  it("common/types/int_test.go/TestIntConvertToNative_Int8", () => {
    expect(new Int(127n).convertToNative(Int8NativeType)).toBe(127);
    expect(() => new Int(128n).convertToNative(Int8NativeType)).toThrow("integer overflow");
  });

  it("common/types/int_test.go/TestIntConvertToNative_Int16", () => {
    expect(new Int(20_050n).convertToNative(Int16NativeType)).toBe(20_050);
    expect(() => new Int(32_768n).convertToNative(Int16NativeType)).toThrow("integer overflow");
  });

  it("common/types/int_test.go/TestIntConvertToNative_Int32", () => {
    expect(new Int(20_050n).convertToNative(Int32NativeType)).toBe(20_050);
    expect(() => new Int(2_147_483_648n).convertToNative(Int32NativeType)).toThrow(
      "integer overflow",
    );
  });

  it("common/types/int_test.go/TestIntConvertToNative_Int64", () => {
    expect(new Int(4_147_483_648n).convertToNative(BigInt)).toBe(4_147_483_648n);
  });

  it("common/types/int_test.go/TestIntConvertToNative_Json", () => {
    expect(new Int(9_007_199_254_740_991n).convertToNative(ValueSchema)).toEqual({
      $typeName: ValueSchema.typeName,
      kind: { case: "numberValue", value: 9_007_199_254_740_991 },
    });
    expect(new Int(9_007_199_254_740_992n).convertToNative(ValueSchema)).toEqual({
      $typeName: ValueSchema.typeName,
      kind: { case: "stringValue", value: "9007199254740992" },
    });
  });

  it.todo(
    "common/types/int_test.go/TestIntConvertToNative_Ptr_Int32 blocked: Go pointer conversion semantics are not portable to TypeScript",
  );
  it.todo(
    "common/types/int_test.go/TestIntConvertToNative_Ptr_Int64 blocked: Go pointer conversion semantics are not portable to TypeScript",
  );

  it("common/types/int_test.go/TestIntConvertToNative_Wrapper", () => {
    expect(new Int(-2_147_483_648n).convertToNative(Int32ValueSchema)).toEqual({
      $typeName: Int32ValueSchema.typeName,
      value: -2_147_483_648,
    });
    expect(new Int(-9_223_372_036_854_775_808n).convertToNative(Int64ValueSchema)).toEqual({
      $typeName: Int64ValueSchema.typeName,
      value: -9_223_372_036_854_775_808n,
    });
  });

  it("common/types/int_test.go/TestIntAdd", () => {
    expect((new Int(4n).add(new Int(-3n)) as Int).value()).toBe(1n);
    expect(new Int(-1n).add(new CelString("-1")).type().typeName()).toBe("error");
  });

  it("preserves native safe integer arithmetic", () => {
    expect((new Int(4).add(new Int(-3)) as Int).value()).toBe(1n);
    expect((new Int(Number.MAX_SAFE_INTEGER).add(new Int(1)) as Int).value()).toBe(
      9_007_199_254_740_992n,
    );
  });

  it("common/types/int_test.go/TestIntCompare", () => {
    const cases = syncedCases<{ a: unknown; b: unknown; out: unknown }>(
      "common/types/int_test.go/TestIntCompare",
    );
    for (const testCase of cases) {
      const out = (resolveSyncedVal(testCase.a) as Int).compare(resolveSyncedVal(testCase.b));
      const expected = resolveSyncedExpr(testCase.out);
      if (typeof expected === "string") {
        expect(out.type().typeName()).toBe("error");
        expect(String(out.value())).toContain(expected);
      } else {
        expect(out).toEqual(expected);
      }
    }
  });

  it("common/types/int_test.go/TestIntConvertToType", () => {
    const cases = syncedCases<{ in: unknown; name: string; out: unknown; toType: unknown }>(
      "common/types/int_test.go/TestIntConvertToType",
    );
    const blocked = new Set([
      "IntToTimestamp",
      "IntToTimestampPosOverflow",
      "IntToTimestampMinOverflow",
      "IntToUnsupportedType",
    ]);
    for (const testCase of cases) {
      const toType = resolveSyncedExpr(testCase.toType);
      if (blocked.has(testCase.name)) {
        continue;
      }
      const out = (resolveSyncedVal(testCase.in) as Int).convertToType(toType as never);
      const expected = resolveSyncedExpr(testCase.out);
      if (testCase.name === "IntToType") {
        expect((out as unknown as { typeName(): string }).typeName()).toBe(expected);
      } else if (testCase.name === "IntToString") {
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
  it("common/types/int_test.go/TestIntDivide", () => {
    expect((new Int(4n).divide(new Int(2n)) as Int).value()).toBe(2n);
    expect(new Int(1n).divide(new Int(0n)).type().typeName()).toBe("error");
  });

  it("common/types/int_test.go/TestIntEqual", () => {
    expect((new Int(42n).equal(new Int(42n)) as Bool).value()).toBe(true);
    expect((new Int(42n).equal(new Uint(42n)) as Bool).value()).toBe(true);
    expect((new Int(42n).equal(new Double(42)) as Bool).value()).toBe(true);
    expect((new Int(42n).equal(new CelString("42")) as Bool).value()).toBe(false);
  });

  it("common/types/int_test.go/TestIntIsZeroValue", () => {
    expect(new Int(0n).isZeroValue()).toBe(true);
    expect(new Int(1n).isZeroValue()).toBe(false);
  });

  it("common/types/int_test.go/TestIntModulo", () => {
    expect((new Int(7n).modulo(new Int(3n)) as Int).value()).toBe(1n);
    expect(new Int(1n).modulo(new Int(0n)).type().typeName()).toBe("error");
  });

  it("common/types/int_test.go/TestIntMultiply", () => {
    expect((new Int(3n).multiply(new Int(4n)) as Int).value()).toBe(12n);
    expect(new Int(3n).multiply(new CelString("4")).type().typeName()).toBe("error");
  });

  it("common/types/int_test.go/TestIntNegate", () => {
    expect((new Int(3n).negate() as Int).value()).toBe(-3n);
  });

  it("common/types/int_test.go/TestIntSubtract", () => {
    expect((new Int(3n).subtract(new Int(4n)) as Int).value()).toBe(-1n);
  });
});
