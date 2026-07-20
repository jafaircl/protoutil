import { type Any, anyUnpack, BytesValueSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { anyValueType } from "./any-value.js";
import { type Bool, Bytes, String as CelString, type Int, TypeType } from "./index.js";

describe("common/types bytes", () => {
  it("common/types/bytes_test.go/TestBytesConvertToNative_Any", () => {
    const actual = new Bytes(new TextEncoder().encode("123")).convertToNative(anyValueType) as Any;
    expect(anyUnpack(actual, BytesValueSchema)).toEqual({
      $typeName: BytesValueSchema.typeName,
      value: new TextEncoder().encode("123"),
    });
  });

  it("common/types/bytes_test.go/TestBytesConvertToNative_ByteSlice", () => {
    expect(new Bytes(new TextEncoder().encode("123")).convertToNative(Uint8Array)).toEqual(
      new Uint8Array([49, 50, 51]),
    );
  });

  it.todo(
    "common/types/bytes_test.go/TestBytesConvertToNative_ByteArray blocked: Go fixed-array native conversion seam is not portable to TypeScript",
  );
  it.todo(
    "common/types/bytes_test.go/TestBytesConvertToNative_ByteArrayError blocked: Go fixed-array native conversion seam is not portable to TypeScript",
  );

  it("common/types/bytes_test.go/TestBytesConvertToNative_Error", () => {
    expect(() => new Bytes(new TextEncoder().encode("123")).convertToNative(String)).toThrow();
  });

  it("common/types/bytes_test.go/TestBytesConvertToNative_Json", () => {
    expect(new Bytes(new TextEncoder().encode("123")).convertToNative(ValueSchema)).toEqual({
      $typeName: ValueSchema.typeName,
      kind: { case: "stringValue", value: "MTIz" },
    });
  });

  it("common/types/bytes_test.go/TestBytesConvertToNative_Wrapper", () => {
    expect(new Bytes(new TextEncoder().encode("123")).convertToNative(BytesValueSchema)).toEqual({
      $typeName: BytesValueSchema.typeName,
      value: new TextEncoder().encode("123"),
    });
  });

  it("common/types/bytes_test.go/TestBytesAdd", () => {
    expect(
      (new Bytes(new Uint8Array([1])).add(new Bytes(new Uint8Array([2]))) as Bytes).value(),
    ).toEqual(new Uint8Array([1, 2]));
  });

  it("common/types/bytes_test.go/TestBytesCompare", () => {
    expect(
      (new Bytes(new Uint8Array([1])).compare(new Bytes(new Uint8Array([1]))) as Int).value(),
    ).toBe(0n);
  });

  it("common/types/bytes_test.go/TestBytesConvertToType", () => {
    expect(
      (
        new Bytes(new TextEncoder().encode("abc")).convertToType(TypeType) as unknown as {
          typeName(): string;
        }
      ).typeName(),
    ).toBe("bytes");
    expect(
      (
        new Bytes(new TextEncoder().encode("abc")).convertToType(
          new CelString("").type(),
        ) as CelString
      ).value(),
    ).toBe("abc");
  });

  it("common/types/bytes_test.go/TestBytesIsZeroValue", () => {
    expect(new Bytes(new Uint8Array()).isZeroValue()).toBe(true);
    expect(new Bytes(new Uint8Array([1])).isZeroValue()).toBe(false);
  });

  it("common/types/bytes_test.go/TestBytesSize", () => {
    expect((new Bytes(new Uint8Array([1, 2, 3])).size() as Int).value()).toBe(3n);
  });

  it("extra/bytes equal", () => {
    expect(
      (new Bytes(new Uint8Array([1])).equal(new Bytes(new Uint8Array([1]))) as Bool).value(),
    ).toBe(true);
  });
});
