import { describe, expect, it } from "vitest";
import { type Bool, Bytes, String as CelString, type Int, TypeType } from "./index.js";

describe("common/types bytes", () => {
  it.todo(
    "common/types/bytes_test.go/TestBytesConvertToNative_Any blocked: Go-style native/protobuf wrapper conversion seam is not ported yet",
  );
  it.todo(
    "common/types/bytes_test.go/TestBytesConvertToNative_ByteSlice blocked: Go byte-slice native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/bytes_test.go/TestBytesConvertToNative_ByteArray blocked: Go fixed-array native conversion seam is not portable to TypeScript",
  );
  it.todo(
    "common/types/bytes_test.go/TestBytesConvertToNative_ByteArrayError blocked: Go fixed-array native conversion seam is not portable to TypeScript",
  );
  it.todo(
    "common/types/bytes_test.go/TestBytesConvertToNative_Error blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/bytes_test.go/TestBytesConvertToNative_Json blocked: Go protobuf JSON native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/bytes_test.go/TestBytesConvertToNative_Wrapper blocked: protobuf wrapper native conversion seam is not ported yet",
  );

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
