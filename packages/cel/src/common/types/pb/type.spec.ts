import { create, fromJson } from "@bufbuild/protobuf";
import {
  BoolValueSchema,
  DurationSchema,
  StructSchema,
  TimestampSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { String as CelString, listType, mapType, objectType } from "../../../checker/decls.js";
import { syncedCases } from "../../spec-helpers.js";
import { db, jsonFieldNamesOption } from "./pb.js";
import {
  expectProtoEqual,
  isUnsupportedSyncedPbExpr,
  Proto2TestAllTypesSchema,
  Proto3NestedTestAllTypesSchema,
  Proto3TestAllTypesSchema,
  resolveSyncedPbExpr,
} from "./spec-helpers.js";

describe("common/types/pb/type_test.go", () => {
  it("common/types/pb/type_test.go/TestTypeDescription", () => {
    const pbdb = db();
    const types = [
      ".google.protobuf.Any",
      ".google.protobuf.BoolValue",
      ".google.protobuf.BytesValue",
      ".google.protobuf.DoubleValue",
      ".google.protobuf.FloatValue",
      ".google.protobuf.Int32Value",
      ".google.protobuf.Int64Value",
      ".google.protobuf.ListValue",
      ".google.protobuf.Struct",
      ".google.protobuf.Value",
    ];
    for (const typeName of types) {
      const [, found] = pbdb.describeType(typeName);
      expect(found).toBe(true);
    }
  });

  it("common/types/pb/type_test.go/TestTypeDescriptionJSONFieldNames", () => {
    const pbdb = db(jsonFieldNamesOption(true));
    pbdb.registerMessage(
      { $typeName: Proto2TestAllTypesSchema.typeName },
      Proto2TestAllTypesSchema,
    );
    const [td, found] = pbdb.describeType(Proto2TestAllTypesSchema.typeName);
    expect(found).toBe(true);
    const [fd, fieldFound] = td!.fieldByName("singleBoolWrapper");
    expect(fieldFound).toBe(true);
    expect(fd!.jsonName()).toBe("singleBoolWrapper");
    expect(fd!.name()).toBe("single_bool_wrapper");
    const enumName = "google.expr.proto2.test.TestAllTypes.NestedEnum.BAR";
    const [en, enumFound] = pbdb.describeEnum(enumName);
    expect(enumFound).toBe(true);
    expect(en!.value()).toBe(1);
    expect(en!.name()).toBe(enumName);
  });

  it("common/types/pb/type_test.go/TestTypeDescriptionGroupFields", () => {
    const pbdb = db();
    pbdb.registerMessage(
      { $typeName: Proto2TestAllTypesSchema.typeName },
      Proto2TestAllTypesSchema,
    );
    const [td, found] = pbdb.describeType(Proto2TestAllTypesSchema.typeName);
    expect(found).toBe(true);
    const [field, fieldFound] = td!.fieldByName("nestedgroup");
    expect(fieldFound).toBe(true);
    expect(field!.isMessage()).toBe(true);
    expect(field!.checkedType()).toEqual(
      objectType("google.expr.proto2.test.TestAllTypes.NestedGroup"),
    );
    const [ng, ngFound] = pbdb.describeType("google.expr.proto2.test.TestAllTypes.NestedGroup");
    expect(ngFound).toBe(true);
    const groupFields = ng!.fieldMap();
    expect(groupFields.get("nested_name")?.reflectType()).toBe("");
    expect(groupFields.get("nested_id")?.reflectType()).toBe(0);
  });

  it("common/types/pb/type_test.go/TestTypeDescriptionFieldMap", () => {
    const pbdb = db();
    pbdb.registerMessage(
      { $typeName: Proto3NestedTestAllTypesSchema.typeName },
      Proto3NestedTestAllTypesSchema,
    );
    const [td, found] = pbdb.describeType(Proto3NestedTestAllTypesSchema.typeName);
    expect(found).toBe(true);
    expect(td!.fieldMap().size).toBe(2);
  });

  it("common/types/pb/type_test.go/TestTypeDescriptionJSONFieldMap", () => {
    const pbdb = db(jsonFieldNamesOption(true));
    pbdb.registerMessage(
      { $typeName: Proto3TestAllTypesSchema.typeName },
      Proto3TestAllTypesSchema,
    );
    const [td, found] = pbdb.describeType("google.expr.proto3.test.TestAllTypes");
    expect(found).toBe(true);
    const fd = td!.fieldMap().get("singleNestedMessage");
    expect(fd).toBeDefined();
    expect(fd!.name()).toBe("single_nested_message");
    expect(fd!.jsonName()).toBe("singleNestedMessage");
  });

  it("common/types/pb/type_test.go/TestFieldDescription", () => {
    const pbdb = db();
    pbdb.registerMessage(
      { $typeName: Proto3NestedTestAllTypesSchema.typeName },
      Proto3NestedTestAllTypesSchema,
    );
    const [td, found] = pbdb.describeType(Proto3NestedTestAllTypesSchema.typeName);
    expect(found).toBe(true);
    const [fd, fieldFound] = td!.fieldByName("payload");
    expect(fieldFound).toBe(true);
    expect(fd!.name()).toBe("payload");
    expect(fd!.isOneof()).toBe(false);
    expect(fd!.isMap()).toBe(false);
    expect(fd!.isMessage()).toBe(true);
    expect(fd!.isEnum()).toBe(false);
    expect(fd!.isList()).toBe(false);
    expect(fd!.checkedType()).toEqual(objectType("google.expr.proto3.test.TestAllTypes"));
  });

  it("common/types/pb/type_test.go/TestFieldDescriptionGetFrom", () => {
    const pbdb = db();
    const msg = create(Proto3TestAllTypesSchema, {
      singleUint64: 12n,
      singleDuration: create(DurationSchema, { seconds: 0n, nanos: 1234 }),
      singleTimestamp: create(TimestampSchema, { seconds: 12345n, nanos: 0 }),
      singleBoolWrapper: create(BoolValueSchema, { value: false }) as never,
      singleInt32Wrapper: 42,
      standaloneEnum: 1,
      nestedType: { case: "singleNestedMessage", value: { bb: 123 } },
      singleValue: fromJson(ValueSchema, "hello world"),
      singleStruct: fromJson(StructSchema, { null: null }) as never,
    });
    pbdb.registerMessage(msg, Proto3TestAllTypesSchema);
    const [td, found] = pbdb.describeType(Proto3TestAllTypesSchema.typeName);
    expect(found).toBe(true);
    const expected = new Map<string, unknown>([
      ["single_uint64", 12n],
      ["single_duration", create(DurationSchema, { seconds: 0n, nanos: 1234 })],
      ["single_timestamp", create(TimestampSchema, { seconds: 12345n, nanos: 0 })],
      ["single_bool_wrapper", false],
      ["single_int32_wrapper", 42],
      ["single_int64_wrapper", null],
      ["single_nested_message", create(Proto3TestAllTypesSchema.nestedMessages[0]!, { bb: 123 })],
      ["standalone_enum", 1n],
      ["single_value", "hello world"],
      ["single_struct", fromJson(StructSchema, { null: null })],
    ]);
    for (const [fieldName, want] of expected) {
      const [field, fieldFound] = td!.fieldByName(fieldName);
      expect(fieldFound).toBe(true);
      const [got, err] = field!.getFrom(msg);
      expect(err).toBeUndefined();
      if (typeof want === "object" && want !== null && "$typeName" in want) {
        expectProtoEqual(got, want);
      } else {
        expect(got).toEqual(want);
      }
    }
  });

  it("common/types/pb/type_test.go/TestFieldDescriptionIsSet", () => {
    const pbdb = db();
    pbdb.registerMessage(
      { $typeName: Proto3TestAllTypesSchema.typeName },
      Proto3TestAllTypesSchema,
    );
    const [td, found] = pbdb.describeType(Proto3TestAllTypesSchema.typeName);
    expect(found).toBe(true);
    const tests = syncedCases<{ field: string; isSet: boolean; msg: unknown }>(
      "common/types/pb/type_test.go/TestFieldDescriptionIsSet",
    );
    for (const tc of tests) {
      const [field, fieldFound] = td!.fieldByName(tc.field);
      expect(fieldFound).toBe(true);
      expect(field!.isSet(resolveSyncedPbExpr(tc.msg))).toBe(tc.isSet);
    }
  });

  it("common/types/pb/type_test.go/TestTypeDescriptionMaybeUnwrap", () => {
    const pbdb = db();
    pbdb.registerMessage(
      { $typeName: Proto3TestAllTypesSchema.typeName },
      Proto3TestAllTypesSchema,
    );
    const tests = syncedCases<{ in: { $expr?: string }; out: unknown }>(
      "common/types/pb/type_test.go/TestTypeDescriptionMaybeUnwrap",
    );
    for (const tc of tests) {
      if (tc.in?.$expr && isUnsupportedSyncedPbExpr(tc.in.$expr)) {
        continue;
      }
      const input = resolveSyncedPbExpr(tc.in) as { $typeName: string };
      const output = resolveSyncedPbExpr(tc.out);
      const [td, found] = pbdb.describeType(input.$typeName);
      expect(found).toBe(true);
      const [msg, unwrapped, err] = td!.maybeUnwrap(input);
      expect(err).toBeUndefined();
      expect(unwrapped).toBe(true);
      if (typeof output === "object" && output !== null && "$typeName" in output) {
        expectProtoEqual(msg, output);
      } else {
        expect(msg).toEqual(output);
      }
    }
  });

  it.todo(
    "common/types/pb/type_test.go/TestTypeDescriptionMaybeUnwrap typed-nil wrapper rows blocked: TypeScript/Buf cannot represent Go typed-nil proto messages",
  );

  it.todo(
    "common/types/pb/type_test.go/TestTypeDescriptionMaybeUnwrap embedded proto.Message row blocked: TypeScript has no direct equivalent to Go anonymous interface embedding",
  );

  it("common/types/pb/type_test.go/TestTypeDescriptionCheckedType", () => {
    const pbdb = db();
    pbdb.registerMessage(
      { $typeName: Proto3TestAllTypesSchema.typeName },
      Proto3TestAllTypesSchema,
    );
    const [td, found] = pbdb.describeType(Proto3TestAllTypesSchema.typeName);
    expect(found).toBe(true);
    let fieldResult = td!.fieldByName("map_string_string");
    expect(fieldResult[1]).toBe(true);
    expect(fieldResult[0]!.checkedType()).toEqual(mapType(CelString, CelString));
    fieldResult = td!.fieldByName("repeated_nested_message");
    expect(fieldResult[1]).toBe(true);
    expect(fieldResult[0]!.checkedType()).toEqual(
      listType(objectType("google.expr.proto3.test.TestAllTypes.NestedMessage")),
    );
  });
});
