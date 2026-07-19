import { describe, expect, it } from "vitest";
import {
  type Bool,
  Int,
  Optional,
  OptionalNone,
  OptionalType,
  optionalOf,
  TypeType,
} from "./index.js";

describe("common/types optional", () => {
  it.todo(
    "common/types/optional_test.go/TestOptionalConvertToNative blocked: Go native conversion seam is not ported yet",
  );

  it("common/types/optional_test.go/TestOptionalOptionalOf", () => {
    expect(optionalOf(new Int(1n)).hasValue()).toBe(true);
  });

  it("common/types/optional_test.go/TestOptionalOptionalFormat", () => {
    expect(optionalOf(new Int(1n)).toString()).toContain("optional");
    expect(OptionalNone.toString()).toBe("optional.none()");
  });

  it("common/types/optional_test.go/TestOptionalGetValue", () => {
    expect((optionalOf(new Int(1n)).getValue() as Int).value()).toBe(1n);
    expect(OptionalNone.getValue().type().typeName()).toBe("error");
  });

  it("common/types/optional_test.go/TestOptionalConvertToType", () => {
    expect(optionalOf(new Int(1n)).convertToType(OptionalType)).toBeInstanceOf(Optional);
    expect(
      (optionalOf(new Int(1n)).convertToType(TypeType) as { typeName(): string }).typeName(),
    ).toBe("optional_type");
  });

  it("common/types/optional_test.go/TestOptionalEqual", () => {
    expect((optionalOf(new Int(1n)).equal(optionalOf(new Int(1n))) as Bool).value()).toBe(true);
    expect((OptionalNone.equal(OptionalNone) as Bool).value()).toBe(true);
    expect((optionalOf(new Int(1n)).equal(OptionalNone) as Bool).value()).toBe(false);
  });

  it("common/types/optional_test.go/TestOptionalType", () => {
    expect(optionalOf(new Int(1n)).type()).toBe(OptionalType);
  });

  it("common/types/optional_test.go/TestOptionalValue", () => {
    expect(optionalOf(new Int(1n)).value()).toBe(1n);
    expect(OptionalNone.value()).toBeUndefined();
  });
});
