import { describe, expect, it } from "vitest";
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
  it.todo(
    "common/types/string_test.go/TestStringConvertToNative_Any blocked: Go-style native/protobuf wrapper conversion seam is not ported yet",
  );
  it.todo(
    "common/types/string_test.go/TestStringConvertToNative_Error blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/string_test.go/TestStringConvertToNative_Json blocked: Go protobuf JSON native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/string_test.go/TestStringConvertToNative_Ptr blocked: Go pointer conversion semantics are not portable to TypeScript",
  );
  it.todo(
    "common/types/string_test.go/TestStringConvertToNative_String blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/string_test.go/TestStringConvertToNative_CustomString blocked: Go named-string conversion seam is not ported yet",
  );
  it.todo(
    "common/types/string_test.go/TestStringConvertToNative_Wrapper blocked: protobuf wrapper native conversion seam is not ported yet",
  );

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
    expect((new CelString("1").convertToType(TypeType) as { typeName(): string }).typeName()).toBe(
      "string",
    );
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
