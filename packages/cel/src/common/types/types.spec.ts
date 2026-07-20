import { describe, expect, it } from "vitest";
import { syncedCases } from "../spec-helpers.js";
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
  Kind,
  ListType,
  listType,
  MapType,
  mapType,
  NullType,
  nullableType,
  objectType,
  opaqueType,
  optionalType,
  registry,
  StringType,
  TimestampType,
  Type,
  TypeType,
  typeParamType,
  typeToExprType,
  typeTypeWithParam,
  UintType,
} from "./index.js";
import {
  resolveRuntimeAssignableValue,
  resolveSyncedExpr,
  resolveSyncedProtoType,
} from "./spec-helpers.js";

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
    const cases = syncedCases<{ t1: unknown; t2: unknown; isExact: boolean }>(
      "common/types/types_test.go/TestTypeIsExactType",
    );
    for (const testCase of cases) {
      expect(
        (resolveSyncedExpr(testCase.t1) as import("./index.js").Type).isExactType(
          resolveSyncedExpr(testCase.t2) as import("./index.js").Type,
        ),
      ).toBe(testCase.isExact);
    }
  });

  it("common/types/types_test.go/TestTypeIsEquivalentType", () => {
    const cases = syncedCases<{ t1: unknown; t2: unknown; isEquivalent: boolean }>(
      "common/types/types_test.go/TestTypeIsEquivalentType",
    );
    for (const testCase of cases) {
      expect(
        (resolveSyncedExpr(testCase.t1) as import("./index.js").Type).isEquivalentType(
          resolveSyncedExpr(testCase.t2) as import("./index.js").Type,
        ),
      ).toBe(testCase.isEquivalent);
    }
  });

  it("common/types/types_test.go/TestTypeIsAssignableType", () => {
    const cases = syncedCases<{ t1: unknown; t2: unknown; isAssignable: boolean }>(
      "common/types/types_test.go/TestTypeIsAssignableType",
    );
    for (const testCase of cases) {
      expect(
        (resolveSyncedExpr(testCase.t1) as import("./index.js").Type).isAssignableType(
          resolveSyncedExpr(testCase.t2) as import("./index.js").Type,
        ),
      ).toBe(testCase.isAssignable);
    }
  });

  it("common/types/types_test.go/TestTypeIsAssignableRuntimeType", () => {
    const reg = registry();
    const cases = syncedCases<{ isRuntimeAssignable: boolean; t: unknown; v: unknown }>(
      "common/types/types_test.go/TestTypeIsAssignableRuntimeType",
    );
    for (const testCase of cases) {
      const typeValue = resolveSyncedExpr(testCase.t) as import("./index.js").Type;
      const value = reg.nativeToValue(resolveRuntimeAssignableValue(testCase.v));
      expect(typeValue.isAssignableRuntimeType(value)).toBe(testCase.isRuntimeAssignable);
    }
  });

  it("common/types/types_test.go/TestTypeToExprType", () => {
    expect(typeToExprType(BoolType).typeKind.case).toBe("primitive");
    expect(typeToExprType(nullableType(BoolType)).typeKind.case).toBe("wrapper");
    expect(typeToExprType(listType(StringType)).typeKind.case).toBe("listType");
    expect(typeToExprType(mapType(StringType, DynType)).typeKind.case).toBe("mapType");
    expect(typeToExprType(objectType("my.Message")).typeKind.case).toBe("messageType");
    expect(typeToExprType(opaqueType("vector", IntType)).typeKind.case).toBe("abstractType");
  });

  it("common/types/types_test.go/TestTypeToExprTypeInvalid", () => {
    const invalidMap = new Type(Kind.Map, [], "map");
    const invalidList = new Type(Kind.List, [], "list");
    expect(() => typeToExprType(invalidList)).toThrow("invalid list");
    expect(() => typeToExprType(new Type(Kind.List, [invalidMap], "list"))).toThrow("invalid map");
    expect(() => typeToExprType(invalidMap)).toThrow("invalid map");
    expect(() => typeToExprType(new Type(Kind.Map, [StringType, invalidMap], "map"))).toThrow(
      "invalid map",
    );
    expect(() => typeToExprType(new Type(Kind.Map, [invalidMap, StringType], "map"))).toThrow(
      "invalid map",
    );
    expect(() => typeToExprType(new Type(Kind.Type, [invalidList], "type"))).toThrow(
      "invalid list",
    );
    expect(() => typeToExprType(opaqueType("bad_list", invalidList))).toThrow("invalid list");
    expect(() => typeToExprType(new Type(Kind.Unspecified, [], ""))).toThrow(
      "missing type conversion",
    );
  });

  it("common/types/types_test.go/TestExprTypeToType", () => {
    const cases = syncedCases<{ in: unknown; out: unknown }>(
      "common/types/types_test.go/TestExprTypeToType",
    );
    for (const testCase of cases) {
      expect(
        (exprTypeToType(resolveSyncedProtoType(testCase.in)) as { toString(): string }).toString(),
      ).toBe((resolveSyncedExpr(testCase.out) as import("./index.js").Type).toString());
    }
  });

  it("common/types/types_test.go/TestExprTypeToTypeInvalid", () => {
    expect(() =>
      exprTypeToType({ $typeName: "cel.expr.Type", typeKind: { case: undefined } } as never),
    ).toThrow("unsupported type");
    expect(() =>
      exprTypeToType({
        $typeName: "cel.expr.Type",
        typeKind: { case: "primitive", value: 0 as never },
      }),
    ).toThrow("unsupported primitive type");
    expect(() =>
      exprTypeToType({
        $typeName: "cel.expr.Type",
        typeKind: { case: "wellKnown", value: 0 as never },
      }),
    ).toThrow("unsupported well-known type");
    expect(() =>
      exprTypeToType({
        $typeName: "cel.expr.Type",
        typeKind: {
          case: "listType",
          value: {
            $typeName: "cel.expr.Type.ListType",
            elemType: { $typeName: "cel.expr.Type", typeKind: { case: undefined } } as never,
          },
        },
      }),
    ).toThrow("unsupported type");
    expect(() =>
      exprTypeToType({
        $typeName: "cel.expr.Type",
        typeKind: {
          case: "mapType",
          value: {
            $typeName: "cel.expr.Type.MapType",
            keyType: { $typeName: "cel.expr.Type", typeKind: { case: undefined } } as never,
            valueType: typeToExprType(DynType),
          },
        },
      }),
    ).toThrow("unsupported type");
    expect(() =>
      exprTypeToType({
        $typeName: "cel.expr.Type",
        typeKind: {
          case: "mapType",
          value: {
            $typeName: "cel.expr.Type.MapType",
            keyType: typeToExprType(DynType),
            valueType: { $typeName: "cel.expr.Type", typeKind: { case: undefined } } as never,
          },
        },
      }),
    ).toThrow("unsupported type");
    expect(() =>
      exprTypeToType({
        $typeName: "cel.expr.Type",
        typeKind: {
          case: "abstractType",
          value: {
            $typeName: "cel.expr.Type.AbstractType",
            name: "bad",
            parameterTypes: [
              { $typeName: "cel.expr.Type", typeKind: { case: undefined } } as never,
            ],
          },
        },
      }),
    ).toThrow("unsupported type");
    expect(() =>
      exprTypeToType({
        $typeName: "cel.expr.Type",
        typeKind: { case: "wrapper", value: 0 as never },
      }),
    ).toThrow("unsupported primitive type");
    expect(() =>
      exprTypeToType({
        $typeName: "cel.expr.Type",
        typeKind: {
          case: "type",
          value: {
            $typeName: "cel.expr.Type",
            typeKind: {
              case: "function",
              value: { $typeName: "cel.expr.Type.FunctionType" } as never,
            },
          } as never,
        },
      }),
    ).toThrow("unsupported type");
  });

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

  it("common/types/types_test.go/TestTypeConvertToNative", () => {
    expect(() => BoolType.convertToNative(Boolean)).toThrow("type conversion not supported");
  });
});
