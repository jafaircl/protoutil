import { describe, expect, it } from "vitest";
import { type Bool, String as CelString, Double, Int, Uint } from "./index.js";
import { resolveSyncedExpr, resolveSyncedVal, syncedTypeCases } from "./spec-helpers.js";

describe("common/types int", () => {
  it.todo(
    "common/types/int_test.go/TestIntConvertToNative_Any blocked: Go-style native/protobuf wrapper conversion seam is not ported yet",
  );
  it.todo(
    "common/types/int_test.go/TestIntConvertToNative_Error blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/int_test.go/TestIntConvertToNative_Int8 blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/int_test.go/TestIntConvertToNative_Int16 blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/int_test.go/TestIntConvertToNative_Int32 blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/int_test.go/TestIntConvertToNative_Int64 blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/int_test.go/TestIntConvertToNative_Json blocked: Go protobuf JSON native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/int_test.go/TestIntConvertToNative_Ptr_Int32 blocked: Go pointer conversion semantics are not portable to TypeScript",
  );
  it.todo(
    "common/types/int_test.go/TestIntConvertToNative_Ptr_Int64 blocked: Go pointer conversion semantics are not portable to TypeScript",
  );
  it.todo(
    "common/types/int_test.go/TestIntConvertToNative_Wrapper blocked: protobuf wrapper native conversion seam is not ported yet",
  );

  it("common/types/int_test.go/TestIntAdd", () => {
    expect((new Int(4n).add(new Int(-3n)) as Int).value()).toBe(1n);
    expect(new Int(-1n).add(new CelString("-1")).type().typeName()).toBe("error");
  });

  it("common/types/int_test.go/TestIntCompare", () => {
    const cases = syncedTypeCases<{ a: unknown; b: unknown; out: unknown }>(
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
    const cases = syncedTypeCases<{ in: unknown; name: string; out: unknown; toType: unknown }>(
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

  it.todo(
    "common/types/int_test.go/TestIntConvertToType blocked: timestamp and duration value files are not ported 1:1 yet",
  );

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
