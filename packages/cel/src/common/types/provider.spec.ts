import { create } from "@bufbuild/protobuf";
import {
  AnySchema,
  anyPack,
  BoolValueSchema,
  BytesValueSchema,
  DoubleValueSchema,
  Int32ValueSchema,
  Int64ValueSchema,
  StringValueSchema,
  UInt32ValueSchema,
  UInt64ValueSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { DeclSchema, ReferenceSchema } from "../../gen/cel/expr/checked_pb.js";
import { SourceInfoSchema } from "../../gen/cel/expr/syntax_pb.js";
import {
  GlobalEnum,
  TestAllTypesSchema as Proto3TestAllTypesSchema,
} from "../../gen/test/proto3pb/test_all_types_pb.js";
import { syncedCases } from "../spec-helpers.js";
import { Bool, False, True } from "./bool.js";
import { Bytes } from "./bytes.js";
import { Double } from "./double.js";
import { Err } from "./err.js";
import { Int } from "./index.js";
import { dynamicList } from "./list.js";
import { ProtoEnum } from "./pb/enum.js";
import { jsonValue } from "./pb/spec-helpers.js";
import { registry } from "./provider.js";
import {
  canonicalProviderTypeName,
  resolveProviderFields,
  resolveProviderMessage,
  resolveProviderTypeName,
} from "./spec-helpers.js";
import { String as CelString } from "./string.js";
import type { Indexer } from "./traits/index.js";
import { ReceiverType } from "./traits/index.js";
import { objectType, opaqueType, typeParamType, typeTypeWithParam } from "./types.js";
import { Uint } from "./uint.js";

describe("provider", () => {
  it("common/types/provider_test.go/TestRegistryCopy", () => {
    const reg = registry();
    const copy = reg.copy();
    expect(copy).not.toBe(reg);
    expect(copy.findStructType("google.expr.proto3.test.TestAllTypes")[1]).toBe(
      reg.findStructType("google.expr.proto3.test.TestAllTypes")[1],
    );
  });

  it("common/types/provider_test.go/TestRegistryRegisterType", () => {
    const reg = registry();
    reg.registerType(objectType("http.Request", ReceiverType));
    expect(() => reg.registerType(opaqueType("http.Request"))).toThrow(
      "type registration conflict",
    );
  });

  it("common/types/provider_test.go/TestRegistryRegisterTypeNoConflict", () => {
    const reg = registry();
    expect(() =>
      reg.registerType(
        opaqueType("http.Request", typeParamType("T")),
        opaqueType("http.Request", typeParamType("V")),
      ),
    ).not.toThrow();
  });

  it("common/types/provider_test.go/TestRegistryRegisterTypeConflict", () => {
    const reg = registry();
    expect(() =>
      reg.registerType(
        opaqueType("http.Request", typeParamType("T"), typeParamType("V")),
        opaqueType("http.Request", typeParamType("V")),
      ),
    ).toThrow("type registration conflict");
  });

  it("common/types/provider_test.go/TestRegistryEnumValue", () => {
    const reg = registry([create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema]);
    const enumName = "google.expr.proto3.test.GlobalEnum.GOO";
    expect(reg.enumValue(enumName)).toEqual(new Int(BigInt(GlobalEnum.GOO)));
    expect(reg.findIdent(enumName)).toEqual([new Int(BigInt(GlobalEnum.GOO)), true]);
  });

  it("TypeScript extension/TestRegistryStrongEnums", () => {
    const reg = registry();
    reg.registerDescriptor(Proto3TestAllTypesSchema.file);
    reg.withStrongEnums(true);

    const enumTypes = reg.enumTypes().map((enumType) => enumType.typeName);
    expect(enumTypes).toContain("google.expr.proto3.test.GlobalEnum");
    expect(enumTypes).toContain("google.expr.proto3.test.TestAllTypes.NestedEnum");

    const named = reg.enumValueOf("google.expr.proto3.test.GlobalEnum", "GAZ");
    expect(named).toBeInstanceOf(ProtoEnum);
    expect(named.type().typeName()).toBe("google.expr.proto3.test.GlobalEnum");
    expect(named.value()).toBe(2n);

    const unnamed = reg.enumValueOf("google.expr.proto3.test.GlobalEnum", -33n);
    expect(unnamed).toBeInstanceOf(ProtoEnum);
    expect(unnamed.value()).toBe(-33n);

    expect(reg.enumValueOf("google.expr.proto3.test.GlobalEnum", "MISSING")).toBeInstanceOf(Err);
    expect(reg.enumValueOf("google.expr.proto3.test.GlobalEnum", 2_147_483_648n)).toBeInstanceOf(
      Err,
    );
    expect(reg.enumValueOf("google.expr.proto3.test.GlobalEnum", -2_147_483_649n)).toBeInstanceOf(
      Err,
    );

    const copy = reg.copy();
    expect(copy.strongEnumsEnabled()).toBe(true);
    expect(copy.enumValueOf("google.expr.proto3.test.GlobalEnum", "GAR")).toBeInstanceOf(ProtoEnum);
  });

  it("common/types/provider_test.go/TestRegistryFindStructType", () => {
    const reg = registry([create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema]);
    expect(reg.findStructType(".google.expr.proto3.test.TestAllTypes")).toEqual([
      typeTypeWithParam(objectType("google.expr.proto3.test.TestAllTypes")),
      true,
    ]);
    const [exprType, found] = reg.findType(".google.expr.proto3.test.TestAllTypes");
    expect(found).toBe(true);
    const typeValue = exprType as {
      typeKind: { case: string; value: { typeKind: { case: string; value: string } } };
    };
    expect(typeValue.typeKind.case).toBe("type");
    expect(typeValue.typeKind.value.typeKind.case).toBe("messageType");
    expect(typeValue.typeKind.value.typeKind.value).toBe("google.expr.proto3.test.TestAllTypes");
  });

  it("common/types/provider_test.go/TestRegistryFindStructFieldNames", () => {
    const cases = syncedCases<{ typeName: string; fields: string[]; jsonFieldNames?: boolean }>(
      "common/types/provider_test.go/TestRegistryFindStructFieldNames",
    );
    for (const testCase of cases) {
      const reg = registry(
        [create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema],
        [create(ReferenceSchema), ReferenceSchema],
        [create(DeclSchema), DeclSchema],
      );
      reg.withJSONFieldNames(Boolean(testCase.jsonFieldNames));
      const [fields, found] = reg.findStructFieldNames(
        canonicalProviderTypeName(testCase.typeName),
      );
      expect(found).toBe(testCase.typeName !== "invalid.TypeName");
      expect([...fields].sort()).toEqual([...testCase.fields].sort());
    }
  });

  it("common/types/provider_test.go/TestRegistryFindStructFieldType", () => {
    const cases = syncedCases<{
      field: string;
      found: boolean;
      typeName: { $expr?: string } | string;
      jsonFieldNames?: boolean;
    }>("common/types/provider_test.go/TestRegistryFindStructFieldType");
    for (const testCase of cases) {
      const reg = registry([create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema]);
      reg.withJSONFieldNames(Boolean(testCase.jsonFieldNames));
      const [field, found] = reg.findStructFieldType(
        resolveProviderTypeName(testCase.typeName),
        testCase.field,
      );
      expect(found).toBe(testCase.found);
      expect(Boolean(field)).toBe(testCase.found);
    }
  });

  it("common/types/provider_test.go/TestRegistryNewValue", () => {
    const cases = syncedCases<{
      fields: Record<string, unknown>;
      out: unknown;
      typeName: string;
    }>("common/types/provider_test.go/TestRegistryNewValue");
    const reg = registry(
      [create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema],
      [create(SourceInfoSchema), SourceInfoSchema],
    );
    for (const testCase of cases) {
      const out = reg.newValue(testCase.typeName, resolveProviderFields(reg, testCase.fields));
      expect(out.type().typeName()).not.toBe("error");
      expect(out.value()).toStrictEqual(resolveProviderMessage(testCase.out));
    }
  });

  it("common/types/provider_test.go/TestRegistryNewValueErrors", () => {
    const cases = syncedCases<{
      err: string;
      fields: Record<string, unknown>;
      typeName: string;
    }>("common/types/provider_test.go/TestRegistryNewValueErrors");
    const reg = registry(
      [create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema],
      [create(SourceInfoSchema), SourceInfoSchema],
    );
    for (const testCase of cases) {
      const out = reg.newValue(testCase.typeName, resolveProviderFields(reg, testCase.fields));
      expect(out.type().typeName()).toBe("error");
      expect(String(out.value())).toContain(testCase.err);
    }
  });

  it("common/types/provider_test.go/TestRegistryGetters", () => {
    const reg = registry([create(SourceInfoSchema), SourceInfoSchema]);
    const sourceInfo = reg.newValue("cel.expr.SourceInfo", {
      location: new CelString("TestTypeRegistryGetFieldValue"),
      line_offsets: dynamicList(reg, [0n, 2n]),
      positions: reg.nativeToValue({ 1: 2, 2: 4 }),
    });
    expect(sourceInfo).not.toBeInstanceOf(Err);

    const indexed = sourceInfo as unknown as Indexer;
    expect(indexed.get(new CelString("location"))).toEqual(
      new CelString("TestTypeRegistryGetFieldValue"),
    );
    const positions = indexed.get(new CelString("positions")) as unknown as Indexer;
    expect(positions.get(new Int(1n))).toEqual(new Int(2n));
    const offsets = indexed.get(new CelString("line_offsets")) as unknown as Indexer;
    expect(offsets.get(new Int(1n))).toEqual(new Int(2n));
  });

  it("common/types/provider_test.go/TestConvertToNative", () => {
    const reg = registry();
    expect(True.convertToNative(Boolean)).toBe(true);
    expect(new Int(-1n).convertToNative(BigInt)).toBe(-1n);
    expect(new Uint(4n).convertToNative(BigInt)).toBe(4n);
    expect(new Double(-5.5).convertToNative(Number)).toBe(-5.5);
    expect(new CelString("hello").convertToNative(String)).toBe("hello");
    expect(new Bytes(new TextEncoder().encode("world")).convertToNative(Uint8Array)).toEqual(
      new TextEncoder().encode("world"),
    );
    expect(dynamicList(reg, [True, False]).convertToNative([])).toEqual([true, false]);
  });

  it("common/types/provider_test.go/TestNativeToValue_Any", () => {
    const reg = registry();
    const packed = anyPack(ValueSchema, jsonValue({ a: "world", b: "five!" }));
    expect(packed.$typeName).toBe(AnySchema.typeName);
    expect(
      reg.nativeToValue(packed).equal(reg.nativeToValue(jsonValue({ a: "world", b: "five!" }))),
    ).toBe(True);
  });

  it("common/types/provider_test.go/TestNativeToValue_Json", () => {
    const reg = registry();
    expect(reg.nativeToValue(jsonValue(false))).toEqual(False);
    expect(reg.nativeToValue(jsonValue(1.1))).toEqual(new Double(1.1));
    expect(reg.nativeToValue(jsonValue("hello"))).toEqual(new CelString("hello"));
    expect(
      reg.nativeToValue(jsonValue(["world", "five!"])).equal(reg.nativeToValue(["world", "five!"])),
    ).toBe(True);
    expect(
      reg
        .nativeToValue(jsonValue({ a: "world", b: "five!" }))
        .equal(reg.nativeToValue({ a: "world", b: "five!" })),
    ).toBe(True);
  });

  it("common/types/provider_test.go/TestNativeToValue_Wrappers", () => {
    const reg = registry();
    expect(reg.nativeToValue({ $typeName: BoolValueSchema.typeName, value: true })).toEqual(True);
    expect(
      reg.nativeToValue({
        $typeName: BytesValueSchema.typeName,
        value: new TextEncoder().encode("hi"),
      }),
    ).toEqual(new Bytes(new TextEncoder().encode("hi")));
    expect(reg.nativeToValue({ $typeName: DoubleValueSchema.typeName, value: 6.4 })).toEqual(
      new Double(6.4),
    );
    expect(reg.nativeToValue({ $typeName: Int32ValueSchema.typeName, value: -32 })).toEqual(
      new Int(-32n),
    );
    expect(reg.nativeToValue({ $typeName: Int64ValueSchema.typeName, value: -64n })).toEqual(
      new Int(-64n),
    );
    expect(reg.nativeToValue({ $typeName: StringValueSchema.typeName, value: "hello" })).toEqual(
      new CelString("hello"),
    );
    expect(reg.nativeToValue({ $typeName: UInt32ValueSchema.typeName, value: 32 })).toEqual(
      new Uint(32n),
    );
    expect(reg.nativeToValue({ $typeName: UInt64ValueSchema.typeName, value: 64n })).toEqual(
      new Uint(64n),
    );
  });

  it("common/types/provider_test.go/TestNativeToValue_Primitive", () => {
    const reg = registry();
    expect(reg.nativeToValue(true)).toEqual(new Bool(true));
    expect(reg.nativeToValue(-10n)).toEqual(new Int(-10n));
    expect(reg.nativeToValue(5.5)).toEqual(new Double(5.5));
    expect(reg.nativeToValue("hello")).toEqual(new CelString("hello"));
    expect(reg.nativeToValue(new TextEncoder().encode("world"))).toEqual(
      new Bytes(new TextEncoder().encode("world")),
    );
    expect(reg.nativeToValue([1n, 2n, 3n]).equal(dynamicList(reg, [1n, 2n, 3n]))).toBe(True);
    expect(reg.nativeToValue(null).type().typeName()).toBe("null_type");
  });

  it("common/types/provider_test.go/TestUnsupportedConversion", () => {
    expect(registry().nativeToValue(Symbol("non-convertible"))).toBeInstanceOf(Err);
  });
});
