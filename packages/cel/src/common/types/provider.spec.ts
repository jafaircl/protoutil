import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { DeclSchema, ReferenceSchema } from "../../gen/cel/expr/checked_pb.js";
import { SourceInfoSchema } from "../../gen/cel/expr/syntax_pb.js";
import {
  GlobalEnum,
  TestAllTypesSchema as Proto3TestAllTypesSchema,
} from "../../gen/test/proto3pb/test_all_types_pb.js";
import { syncedCases } from "../spec-helpers.js";
import { Int } from "./index.js";
import { registry } from "./provider.js";
import {
  canonicalProviderTypeName,
  resolveProviderFields,
  resolveProviderMessage,
  resolveProviderTypeName,
} from "./spec-helpers.js";
import { objectType, typeTypeWithParam } from "./types.js";

describe("provider", () => {
  it("common/types/provider_test.go/TestRegistryCopy", () => {
    const reg = registry();
    const copy = reg.copy();
    expect(copy).not.toBe(reg);
    expect(copy.findStructType("google.expr.proto3.test.TestAllTypes")[1]).toBe(
      reg.findStructType("google.expr.proto3.test.TestAllTypes")[1],
    );
  });

  it("common/types/provider_test.go/TestRegistryEnumValue", () => {
    const reg = registry([create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema]);
    const enumName = "google.expr.proto3.test.GlobalEnum.GOO";
    expect(reg.enumValue(enumName)).toEqual(new Int(BigInt(GlobalEnum.GOO)));
    expect(reg.findIdent(enumName)).toEqual([new Int(BigInt(GlobalEnum.GOO)), true]);
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
});
