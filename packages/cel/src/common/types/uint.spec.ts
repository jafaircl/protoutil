import { describe, expect, it } from "vitest";
import { syncedCases } from "../spec-helpers.js";
import { type Bool, type String as CelString, Double, Int, Uint } from "./index.js";
import { resolveSyncedExpr, resolveSyncedVal } from "./spec-helpers.js";

describe("common/types uint", () => {
  it.todo(
    "common/types/uint_test.go/TestUintConvertToNative_Any blocked: Go-style native/protobuf wrapper conversion seam is not ported yet",
  );
  it.todo(
    "common/types/uint_test.go/TestUintConvertToNative_Error blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/uint_test.go/TestUintConvertToNative_Json blocked: Go protobuf JSON native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/uint_test.go/TestUintConvertToNative_Uint8 blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/uint_test.go/TestUintConvertToNative_Uint16 blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/uint_test.go/TestUintConvertToNative_Uint32 blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/uint_test.go/TestUintConvertToNative_Ptr_Uint32 blocked: Go pointer conversion semantics are not portable to TypeScript",
  );
  it.todo(
    "common/types/uint_test.go/TestUintConvertToNative_Ptr_Uint64 blocked: Go pointer conversion semantics are not portable to TypeScript",
  );
  it.todo(
    "common/types/uint_test.go/TestUintConvertToNative_Wrapper blocked: protobuf wrapper native conversion seam is not ported yet",
  );

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
