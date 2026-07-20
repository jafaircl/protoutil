import { describe, expect, it } from "vitest";
import { db, jsonFieldNamesOption } from "./pb.js";
import {
  descriptorRoundTripFiles,
  file_test_proto2pb_test_all_types,
  Proto2TestAllTypesSchema,
  Proto3TestAllTypesSchema,
} from "./spec-helpers.js";

describe("common/types/pb/file_test.go", () => {
  it.todo(
    "common/types/pb/file_test.go/TestFileDescriptionGetExtensions blocked: google.expr.proto2.test external extension descriptors are not generated in local test protos",
  );

  it.todo(
    "common/types/pb/file_test.go/TestFileDescriptionGetTypes synthetic map entry rows blocked: Buf DescMessage.nestedMessages excludes synthetic map entry descriptors",
  );

  it("common/types/pb/file_test.go/TestFileDescriptionJSONFieldNames", () => {
    const pbdb = db(jsonFieldNamesOption(true));
    const msg = { $typeName: Proto2TestAllTypesSchema.typeName };
    const fd = pbdb.registerMessage(msg, Proto2TestAllTypesSchema);
    expect(fd.fileDescriptor()).toBe(file_test_proto2pb_test_all_types);
  });

  it("common/types/pb/file_test.go/TestFileDescriptionGetTypes", () => {
    const pbdb = db();
    const fd = pbdb.registerMessage(
      { $typeName: Proto3TestAllTypesSchema.typeName },
      Proto3TestAllTypesSchema,
    );
    const expected = [
      "google.expr.proto3.test.TestAllTypes",
      "google.expr.proto3.test.TestAllTypes.NestedMessage",
      "google.expr.proto3.test.TestJsonNames",
      "google.expr.proto3.test.NestedTestAllTypes",
    ];
    expect(fd.getTypeNames().sort()).toEqual(expected.slice().sort());
    for (const typeName of fd.getTypeNames()) {
      const [td, found] = fd.getTypeDescription(typeName);
      expect(found).toBe(true);
      expect(td?.name()).toBe(typeName);
    }
  });

  it("common/types/pb/file_test.go/TestFileDescriptionGetEnumNames", () => {
    const pbdb = db();
    const fd = pbdb.registerMessage(
      { $typeName: Proto3TestAllTypesSchema.typeName },
      Proto3TestAllTypesSchema,
    );
    const expected = new Map([
      ["google.expr.proto3.test.TestAllTypes.NestedEnum.FOO", 0],
      ["google.expr.proto3.test.TestAllTypes.NestedEnum.BAR", 1],
      ["google.expr.proto3.test.TestAllTypes.NestedEnum.BAZ", 2],
      ["google.expr.proto3.test.GlobalEnum.GOO", 0],
      ["google.expr.proto3.test.GlobalEnum.GAR", 1],
      ["google.expr.proto3.test.GlobalEnum.GAZ", 2],
    ]);
    expect(fd.getEnumNames().length).toBe(expected.size);
    for (const enumName of fd.getEnumNames()) {
      const [ed, found] = fd.getEnumDescription(enumName);
      expect(found).toBe(true);
      expect(ed?.value()).toBe(expected.get(enumName));
    }
  });

  it("common/types/pb/file_test.go/TestFileDescriptionGetImportedEnumNames", () => {
    const pbdb = db();
    for (const file of descriptorRoundTripFiles()) {
      pbdb.registerDescriptor(file);
    }
    const imported = new Map([
      ["google.expr.proto3.test.ImportedGlobalEnum.IMPORT_FOO", 0],
      ["google.expr.proto3.test.ImportedGlobalEnum.IMPORT_BAR", 1],
      ["google.expr.proto3.test.ImportedGlobalEnum.IMPORT_BAZ", 2],
    ]);
    for (const [enumName, value] of imported) {
      const [ed, found] = pbdb.describeEnum(enumName);
      expect(found).toBe(true);
      expect(ed?.value()).toBe(value);
    }
  });
});
