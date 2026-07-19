import { describe, expect, it } from "vitest";
import { String as CelString, False, isBool, TimestampType, True, TypeType } from "./index.js";

describe("common/types bool", () => {
  it.todo(
    "common/types/bool_test.go/TestBoolConvertToNative_Any blocked: Go-style native/protobuf wrapper conversion seam is not ported yet",
  );
  it.todo(
    "common/types/bool_test.go/TestBoolConvertToNative_Bool blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/bool_test.go/TestBoolConvertToNative_Error blocked: Go reflect-based native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/bool_test.go/TestBoolConvertToNative_Json blocked: Go protobuf JSON native conversion seam is not ported yet",
  );
  it.todo(
    "common/types/bool_test.go/TestBoolConvertToNative_Ptr blocked: Go pointer conversion semantics are not portable to TypeScript",
  );
  it.todo(
    "common/types/bool_test.go/TestBoolConvertToNative_Wrapper blocked: protobuf wrapper native conversion seam is not ported yet",
  );

  it("common/types/bool_test.go/TestBoolCompare", () => {
    expect(True.compare(True).value()).toBe(0n);
    expect(False.compare(False).value()).toBe(0n);
    expect(False.compare(True).value()).toBe(-1n);
    expect(True.compare(False).value()).toBe(1n);
  });

  it("common/types/bool_test.go/TestBoolConvertToType", () => {
    expect(True.convertToType(TypeType)).toBeTruthy();
    expect((True.convertToType(TypeType) as typeof TypeType).typeName()).toBe("bool");
    expect((True.convertToType(CelString.prototype.type()) as CelString).value()).toBe("true");
    expect(True.convertToType(TimestampType).type().typeName()).toBe("error");
  });

  it("common/types/bool_test.go/TestBoolEqual", () => {
    expect(True.equal(True).value()).toBe(true);
    expect(False.equal(True).value()).toBe(false);
  });

  it("common/types/bool_test.go/TestBoolIsZeroValue", () => {
    expect(True.isZeroValue()).toBe(false);
    expect(False.isZeroValue()).toBe(true);
  });

  it("common/types/bool_test.go/TestBoolNegate", () => {
    expect(True.negate()).toBe(False);
    expect(False.negate()).toBe(True);
  });

  it("common/types/bool_test.go/TestIsBool", () => {
    expect(isBool(True)).toBe(true);
    expect(isBool(False)).toBe(true);
    expect(isBool(new CelString("true"))).toBe(false);
  });
});
