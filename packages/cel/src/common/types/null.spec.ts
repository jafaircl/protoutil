import { describe, expect, it } from "vitest";
import { syncedCases } from "../spec-helpers.js";
import { type Bool, String as CelString, NullType, NullValue, TypeType } from "./index.js";
import { resolveNullErr, resolveNullOut, resolveNullTypeExpr } from "./spec-helpers.js";

describe("common/types null", () => {
  it("common/types/null_test.go/TestNullConvertToNative", () => {
    const cases = syncedCases<{ goType: { $expr?: string }; out?: unknown; err?: unknown }>(
      "common/types/null_test.go/TestNullConvertToNative",
    );
    for (const testCase of cases) {
      const typeDesc = resolveNullTypeExpr(testCase.goType);
      if (typeDesc === undefined) {
        continue;
      }
      if (testCase.err) {
        expect(() =>
          (NullValue as unknown as { convertToNative(typeDesc: unknown): unknown }).convertToNative(
            typeDesc,
          ),
        ).toThrow(resolveNullErr(testCase.err));
        continue;
      }
      expect(
        (NullValue as unknown as { convertToNative(typeDesc: unknown): unknown }).convertToNative(
          typeDesc,
        ),
      ).toEqual(resolveNullOut(testCase.out));
    }
  });

  it("common/types/null_test.go/TestNullConvertToType", () => {
    expect(
      (NullValue.convertToType(TypeType) as unknown as { typeName(): string }).typeName(),
    ).toBe("null_type");
    expect((NullValue.convertToType(new CelString("").type()) as CelString).value()).toBe("null");
  });

  it("common/types/null_test.go/TestNullEqual", () => {
    expect((NullValue.equal(NullValue) as Bool).value()).toBe(true);
  });

  it("common/types/null_test.go/TestNullIsZeroValue", () => {
    expect(NullValue.isZeroValue()).toBe(true);
  });

  it("common/types/null_test.go/TestNullType", () => {
    expect(NullValue.type()).toBe(NullType);
  });

  it("common/types/null_test.go/TestNullValue", () => {
    expect(NullValue.value()).toBe(0);
  });
});
