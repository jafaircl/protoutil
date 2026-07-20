import {
  type Any,
  anyUnpack,
  UInt32ValueSchema,
  UInt64ValueSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { syncedCases } from "../spec-helpers.js";
import { anyValueType } from "./any-value.js";
import { type Bool, type String as CelString, Double, Int, Uint } from "./index.js";
import { Uint8NativeType, Uint16NativeType, Uint32NativeType } from "./native.js";
import { resolveSyncedExpr, resolveSyncedVal } from "./spec-helpers.js";

describe("common/types uint", () => {
  it("common/types/uint_test.go/TestUintConvertToNative_Any", () => {
    const actual = new Uint(18_446_744_073_709_551_615n).convertToNative(anyValueType) as Any;
    expect(anyUnpack(actual, UInt64ValueSchema)).toEqual({
      $typeName: UInt64ValueSchema.typeName,
      value: 18_446_744_073_709_551_615n,
    });
  });

  it("common/types/uint_test.go/TestUintConvertToNative_Error", () => {
    expect(() => new Uint(10000n).convertToNative(Number)).toThrow();
  });

  it("common/types/uint_test.go/TestUintConvertToNative_Json", () => {
    expect(new Uint(9_007_199_254_740_991n).convertToNative(ValueSchema)).toEqual({
      $typeName: ValueSchema.typeName,
      kind: { case: "numberValue", value: 9_007_199_254_740_991 },
    });
    expect(new Uint(9_007_199_254_740_992n).convertToNative(ValueSchema)).toEqual({
      $typeName: ValueSchema.typeName,
      kind: { case: "stringValue", value: "9007199254740992" },
    });
  });

  it("common/types/uint_test.go/TestUintConvertToNative_Uint8", () => {
    expect(new Uint(128n).convertToNative(Uint8NativeType)).toBe(128);
    expect(() => new Uint(256n).convertToNative(Uint8NativeType)).toThrow(
      "unsigned integer overflow",
    );
  });

  it("common/types/uint_test.go/TestUintConvertToNative_Uint16", () => {
    expect(new Uint(20_050n).convertToNative(Uint16NativeType)).toBe(20_050);
    expect(() => new Uint(65_536n).convertToNative(Uint16NativeType)).toThrow(
      "unsigned integer overflow",
    );
  });

  it("common/types/uint_test.go/TestUintConvertToNative_Uint32", () => {
    expect(new Uint(20_050n).convertToNative(Uint32NativeType)).toBe(20_050);
    expect(() => new Uint(4_294_967_296n).convertToNative(Uint32NativeType)).toThrow(
      "unsigned integer overflow",
    );
  });

  it.todo(
    "common/types/uint_test.go/TestUintConvertToNative_Ptr_Uint32 blocked: Go pointer conversion semantics are not portable to TypeScript",
  );
  it.todo(
    "common/types/uint_test.go/TestUintConvertToNative_Ptr_Uint64 blocked: Go pointer conversion semantics are not portable to TypeScript",
  );

  it("common/types/uint_test.go/TestUintConvertToNative_Wrapper", () => {
    expect(new Uint(4_294_967_295n).convertToNative(UInt32ValueSchema)).toEqual({
      $typeName: UInt32ValueSchema.typeName,
      value: 4_294_967_295,
    });
    expect(new Uint(18_446_744_073_709_551_615n).convertToNative(UInt64ValueSchema)).toEqual({
      $typeName: UInt64ValueSchema.typeName,
      value: 18_446_744_073_709_551_615n,
    });
  });

  it("common/types/uint_test.go/TestUintAdd", () => {
    expect((new Uint(4n).add(new Uint(3n)) as Uint).value()).toBe(7n);
  });

  it("common/types/uint_test.go/TestUintCompare", () => {
    const cases = syncedCases<{ a: unknown; b: unknown; out: unknown }>(
      "common/types/uint_test.go/TestUintCompare",
    );
    for (const testCase of cases) {
      const out = (resolveSyncedVal(testCase.a) as Uint).compare(resolveSyncedVal(testCase.b));
      const expected = resolveSyncedExpr(testCase.out);
      if (typeof expected === "string") {
        expect(out.type().typeName()).toBe("error");
        expect(String(out.value())).toContain(expected);
      } else {
        expect(out).toEqual(expected);
      }
    }
  });

  it("common/types/uint_test.go/TestUintConvertToType", () => {
    const cases = syncedCases<{ in: unknown; name: string; out: unknown; toType: unknown }>(
      "common/types/uint_test.go/TestUintConvertToType",
    );
    for (const testCase of cases) {
      const toType = resolveSyncedExpr(testCase.toType);
      const out = (resolveSyncedVal(testCase.in) as Uint).convertToType(toType as never);
      const expected = resolveSyncedExpr(testCase.out);
      if (testCase.name === "UintToType") {
        expect((out as unknown as { typeName(): string }).typeName()).toBe(expected);
      } else if (testCase.name === "UintToString") {
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

  it("common/types/uint_test.go/TestUintDivide", () => {
    expect((new Uint(4n).divide(new Uint(2n)) as Uint).value()).toBe(2n);
    expect(new Uint(1n).divide(new Uint(0n)).type().typeName()).toBe("error");
  });

  it("common/types/uint_test.go/TestUintEqual", () => {
    expect((new Uint(42n).equal(new Uint(42n)) as Bool).value()).toBe(true);
    expect((new Uint(42n).equal(new Int(42n)) as Bool).value()).toBe(true);
    expect((new Uint(42n).equal(new Double(42)) as Bool).value()).toBe(true);
  });

  it("common/types/uint_test.go/TestUintIsZeroValue", () => {
    expect(new Uint(0n).isZeroValue()).toBe(true);
    expect(new Uint(1n).isZeroValue()).toBe(false);
  });

  it("common/types/uint_test.go/TestUintModulo", () => {
    expect((new Uint(7n).modulo(new Uint(3n)) as Uint).value()).toBe(1n);
  });

  it("common/types/uint_test.go/TestUintMultiply", () => {
    expect((new Uint(3n).multiply(new Uint(4n)) as Uint).value()).toBe(12n);
  });

  it("common/types/uint_test.go/TestUintSubtract", () => {
    expect((new Uint(4n).subtract(new Uint(3n)) as Uint).value()).toBe(1n);
  });
});
