import { type Any, anyUnpack, StringValueSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { anyValueType } from "./any-value.js";
import {
  Bool,
  Bytes,
  String as CelString,
  Int,
  stringContains,
  stringEndsWith,
  stringStartsWith,
  TypeType,
} from "./index.js";

describe("common/types string", () => {
  it("common/types/string_test.go/TestStringConvertToNative_Any", () => {
    const actual = new CelString("hello").convertToNative(anyValueType) as Any;
    expect(anyUnpack(actual, StringValueSchema)).toEqual({
      $typeName: StringValueSchema.typeName,
      value: "hello",
    });
  });

  it("common/types/string_test.go/TestStringConvertToNative_Error", () => {
    expect(() => new CelString("hello").convertToNative(globalThis.Number)).toThrow();
  });

  it("common/types/string_test.go/TestStringConvertToNative_Json", () => {
    expect(new CelString("hello").convertToNative(ValueSchema)).toEqual({
      $typeName: ValueSchema.typeName,
      kind: { case: "stringValue", value: "hello" },
    });
  });

  it.todo(
    "common/types/string_test.go/TestStringConvertToNative_Ptr blocked: Go pointer conversion semantics are not portable to TypeScript",
  );

  it("common/types/string_test.go/TestStringConvertToNative_String", () => {
    expect(new CelString("hello").convertToNative(globalThis.String)).toBe("hello");
  });

  it("common/types/string_test.go/TestStringConvertToNative_CustomString", () => {
    class CustomString {
      constructor(readonly value: string) {}
    }
    const actual = new CelString("hello").convertToNative(CustomString);
    expect(actual).toBeInstanceOf(CustomString);
    expect((actual as CustomString).value).toBe("hello");
  });

  it("common/types/string_test.go/TestStringConvertToNative_Wrapper", () => {
    expect(new CelString("hello").convertToNative(StringValueSchema)).toEqual({
      $typeName: StringValueSchema.typeName,
      value: "hello",
    });
  });

  it("common/types/string_test.go/TestStringAdd", () => {
    expect((new CelString("hello").add(new CelString(" world")) as CelString).value()).toBe(
      "hello world",
    );
  });

  it("common/types/string_test.go/TestStringCompare", () => {
    expect((new CelString("a").compare(new CelString("a")) as Int).value()).toBe(0n);
    expect((new CelString("a").compare(new CelString("b")) as Int).value()).toBe(-1n);
  });

  it("common/types/string_test.go/TestStringConvertToType", () => {
    expect(
      (new CelString("1").convertToType(TypeType) as unknown as { typeName(): string }).typeName(),
    ).toBe("string");
    expect((new CelString("1").convertToType(new Int(0n).type()) as Int).value()).toBe(1n);
    expect(new CelString("1x").convertToType(new Int(0n).type()).type().typeName()).toBe("error");
    expect((new CelString("TRUE").convertToType(new Bool(true).type()) as Bool).value()).toBe(true);
    expect(
      (new CelString("abc").convertToType(new Bytes(new Uint8Array()).type()) as Bytes).value(),
    ).toEqual(new TextEncoder().encode("abc"));
  });

  it("common/types/string_test.go/TestStringEqual", () => {
    expect((new CelString("a").equal(new CelString("a")) as Bool).value()).toBe(true);
    expect((new CelString("a").equal(new CelString("b")) as Bool).value()).toBe(false);
  });

  it("common/types/string_test.go/TestStringIsZeroValue", () => {
    expect(new CelString("").isZeroValue()).toBe(true);
    expect(new CelString("a").isZeroValue()).toBe(false);
  });

  it("common/types/string_test.go/TestStringMatch", () => {
    expect((new CelString("abc").match(new CelString("^a")) as Bool).value()).toBe(true);
    expect(new CelString("abc").match(new CelString("(")).type().typeName()).toBe("error");
    expect(new CelString("aa").match(new CelString("(a)\\1")).type().typeName()).toBe("error");
    expect(new CelString("ab").match(new CelString("a(?=b)")).type().typeName()).toBe("error");
  });

  it("common/types/string_test.go/TestStringContains", () => {
    expect((stringContains(new CelString("hello"), new CelString("ell")) as Bool).value()).toBe(
      true,
    );
  });

  it("common/types/string_test.go/TestStringEndsWith", () => {
    expect((stringEndsWith(new CelString("hello"), new CelString("lo")) as Bool).value()).toBe(
      true,
    );
  });

  it("common/types/string_test.go/TestStringStartsWith", () => {
    expect((stringStartsWith(new CelString("hello"), new CelString("he")) as Bool).value()).toBe(
      true,
    );
  });

  it("common/types/string_test.go/TestStringSize", () => {
    expect((new CelString("hello").size() as Int).value()).toBe(5n);
  });
});
