import { describe, expect, it } from "vitest";
import { syncedCases } from "../spec-helpers.js";
import {
  type Bool,
  Int,
  Optional,
  OptionalNone,
  OptionalType,
  optionalOf,
  TypeType,
} from "./index.js";
import { resolveSyncedExpr } from "./spec-helpers.js";

describe("common/types optional", () => {
  it.todo(
    "common/types/optional_test.go/TestOptionalConvertToNative blocked: Go native conversion seam is not ported yet",
  );

  it("common/types/optional_test.go/TestOptionalOptionalOf", () => {
    expect(optionalOf(new Int(1n)).hasValue()).toBe(true);
  });

  it("common/types/optional_test.go/TestOptionalOptionalFormat", () => {
    const cases = syncedCases<{ val: unknown; want: string }>(
      "common/types/optional_test.go/TestOptionalOptionalFormat",
    );
    for (const testCase of cases) {
      expect((resolveSyncedExpr(testCase.val) as { toString(): string }).toString()).toBe(
        testCase.want,
      );
    }
  });

  it("common/types/optional_test.go/TestOptionalGetValue", () => {
    expect((optionalOf(new Int(1n)).getValue() as Int).value()).toBe(1n);
    expect(OptionalNone.getValue().type().typeName()).toBe("error");
  });

  it("common/types/optional_test.go/TestOptionalConvertToType", () => {
    expect(optionalOf(new Int(1n)).convertToType(OptionalType)).toBeInstanceOf(Optional);
    expect(
      (
        optionalOf(new Int(1n)).convertToType(TypeType) as unknown as { typeName(): string }
      ).typeName(),
    ).toBe("optional_type");
  });

  it("common/types/optional_test.go/TestOptionalEqual", () => {
    const cases = syncedCases<{ a: unknown; b: unknown; out: unknown }>(
      "common/types/optional_test.go/TestOptionalEqual",
    );
    for (const testCase of cases) {
      expect(
        (
          (resolveSyncedExpr(testCase.a) as { equal(other: unknown): Bool }).equal(
            resolveSyncedExpr(testCase.b),
          ) as Bool
        ).value(),
      ).toBe(resolveSyncedExpr(testCase.out));
    }
  });

  it("common/types/optional_test.go/TestOptionalType", () => {
    expect(optionalOf(new Int(1n)).type()).toBe(OptionalType);
  });

  it("common/types/optional_test.go/TestOptionalValue", () => {
    expect(optionalOf(new Int(1n)).value()).toBe(1n);
    expect(OptionalNone.value()).toBeUndefined();
  });
});
