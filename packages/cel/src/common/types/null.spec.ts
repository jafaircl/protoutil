import { describe, expect, it } from "vitest";
import { type Bool, String as CelString, NullType, NullValue, TypeType } from "./index.js";

describe("common/types null", () => {
  it.todo(
    "common/types/null_test.go/TestNullConvertToNative blocked: Go reflect/protobuf native conversion seam is not ported yet",
  );

  it("common/types/null_test.go/TestNullConvertToType", () => {
    expect((NullValue.convertToType(TypeType) as { typeName(): string }).typeName()).toBe(
      "null_type",
    );
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
