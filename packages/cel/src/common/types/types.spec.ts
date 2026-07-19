import { describe, expect, it } from "vitest";
import {
  BoolType,
  BytesType,
  String as CelString,
  ComparerType,
  DoubleType,
  DurationType,
  DynType,
  exprTypeToType,
  FieldTesterType,
  IntType,
  ListType,
  listType,
  MapType,
  mapType,
  NullType,
  nullableType,
  objectType,
  opaqueType,
  optionalType,
  StringType,
  TimestampType,
  TypeType,
  typeParamType,
  typeToExprType,
  typeTypeWithParam,
  UintType,
} from "./index.js";
import { resolveSyncedProtoType, resolveSyncedType, syncedTypeCases } from "./spec-helpers.js";

describe("common/types type", () => {
  it("common/types/type_test.go/TestType_ConvertToType", () => {
    for (const standardType of [
      BoolType,
      BytesType,
      DoubleType,
      DurationType,
      IntType,
      ListType,
      MapType,
      NullType,
      StringType,
      TimestampType,
      TypeType,
      UintType,
    ]) {
      expect(
        (standardType.convertToType(TypeType) as typeof TypeType).equal(TypeType).value(),
      ).toBe(true);
    }
  });

  it("common/types/type_test.go/TestType_Type", () => {
    expect(TypeType.type()).toBe(TypeType);
  });
});

describe("common/types types", () => {
  it("common/types/types_test.go/TestTypeString", () => {
    expect(listType(IntType).toString()).toBe("list(int)");
    expect(mapType(UintType, DoubleType).toString()).toBe("map(uint, double)");
    expect(BoolType.toString()).toBe("bool");
    expect(DynType.toString()).toBe("dyn");
    expect(NullType.toString()).toBe("null_type");
    expect(nullableType(BoolType).toString()).toBe("wrapper(bool)");
    expect(optionalType(listType(StringType)).toString()).toBe("optional_type(list(string))");
    expect(objectType("my.type.Message").toString()).toBe("my.type.Message");
    expect(objectType("google.protobuf.Int32Value").toString()).toBe("wrapper(int)");
    expect(objectType("google.protobuf.UInt32Value").toString()).toBe("wrapper(uint)");
    expect(objectType("google.protobuf.Value").toString()).toBe("dyn");
    expect(typeTypeWithParam(StringType).toString()).toBe("type(string)");
    expect(typeParamType("T").toString()).toBe("<T>");
    expect(ListType.toString()).toBe("list(dyn)");
    expect(MapType.toString()).toBe("map(dyn, dyn)");
  });

  it.todo(
    "common/types/types_test.go/TestTypeString blocked: upstream nil-receiver rows are not directly representable in TypeScript instance method dispatch",
  );

  it("common/types/types_test.go/TestTypeIsExactType", () => {
    const cases = syncedTypeCases<{ t1: unknown; t2: unknown; isExact: boolean }>(
      "common/types/types_test.go/TestTypeIsExactType",
    );
    for (const testCase of cases) {
      expect(resolveSyncedType(testCase.t1).isExactType(resolveSyncedType(testCase.t2))).toBe(
        testCase.isExact,
      );
    }
  });

  it("common/types/types_test.go/TestTypeIsEquivalentType", () => {
    const cases = syncedTypeCases<{ t1: unknown; t2: unknown; isEquivalent: boolean }>(
      "common/types/types_test.go/TestTypeIsEquivalentType",
    );
    for (const testCase of cases) {
      expect(resolveSyncedType(testCase.t1).isEquivalentType(resolveSyncedType(testCase.t2))).toBe(
        testCase.isEquivalent,
      );
    }
  });

  it("common/types/types_test.go/TestTypeIsAssignableType", () => {
    const cases = syncedTypeCases<{ t1: unknown; t2: unknown; isAssignable: boolean }>(
      "common/types/types_test.go/TestTypeIsAssignableType",
    );
    for (const testCase of cases) {
      expect(resolveSyncedType(testCase.t1).isAssignableType(resolveSyncedType(testCase.t2))).toBe(
        testCase.isAssignable,
      );
    }
  });

  it.todo(
    "common/types/types_test.go/TestTypeIsAssignableRuntimeType blocked: list/map/object runtime value seams are not ported yet",
  );

  it("common/types/types_test.go/TestTypeToExprType", () => {
    expect(typeToExprType(BoolType).typeKind.case).toBe("primitive");
    expect(typeToExprType(nullableType(BoolType)).typeKind.case).toBe("wrapper");
    expect(typeToExprType(listType(StringType)).typeKind.case).toBe("listType");
    expect(typeToExprType(mapType(StringType, DynType)).typeKind.case).toBe("mapType");
    expect(typeToExprType(objectType("my.Message")).typeKind.case).toBe("messageType");
    expect(typeToExprType(opaqueType("vector", IntType)).typeKind.case).toBe("abstractType");
  });

  it.todo(
    "common/types/types_test.go/TestTypeToExprTypeInvalid blocked: invalid checked type construction seam is not ported 1:1 yet",
  );

  it("common/types/types_test.go/TestExprTypeToType", () => {
    const cases = syncedTypeCases<{ in: unknown; out: unknown }>(
      "common/types/types_test.go/TestExprTypeToType",
    );
    for (const testCase of cases) {
      expect(
        (exprTypeToType(resolveSyncedProtoType(testCase.in)) as { toString(): string }).toString(),
      ).toBe(resolveSyncedType(testCase.out).toString());
    }
  });

  it.todo(
    "common/types/types_test.go/TestExprTypeToTypeInvalid blocked: invalid checked type construction seam is not ported 1:1 yet",
  );

  it("common/types/types_test.go/TestTypeHasTrait", () => {
    expect(BoolType.hasTrait(ComparerType)).toBe(true);
    expect(objectType("my.Message").hasTrait(FieldTesterType)).toBe(true);
  });

  it("common/types/types_test.go/TestTypeWithTraits", () => {
    const withTraits = opaqueType("vector", IntType).withTraits(ComparerType);
    expect(withTraits.hasTrait(ComparerType)).toBe(true);
  });

  it("common/types/types_test.go/TestTypeConvertToType", () => {
    expect((BoolType.convertToType(TypeType) as typeof TypeType).typeName()).toBe("type");
    expect((BoolType.convertToType(CelString.prototype.type()) as CelString).value()).toBe("bool");
  });

  it.todo(
    "common/types/types_test.go/TestTypeConvertToNative blocked: Go reflect-based native conversion seam is not ported yet",
  );
});
