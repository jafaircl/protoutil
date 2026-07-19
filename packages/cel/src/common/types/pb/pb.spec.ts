import { create } from "@bufbuild/protobuf";
import { DurationSchema, TimestampSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { DefaultDb, db, JSONFieldNames, Merge } from "./pb.js";
import {
  descriptorRoundTripFiles,
  Proto2TestAllTypesSchema,
  Proto3TestAllTypesSchema,
} from "./spec_helpers.js";

describe("common/types/pb/pb_test.go", () => {
  it("common/types/pb/pb_test.go/TestDbJSONFieldNames", () => {
    const pbdb = db(JSONFieldNames(true));
    expect(pbdb.jsonFieldNames()).toBe(true);
    const fd = pbdb.registerMessage(
      { $typeName: Proto2TestAllTypesSchema.typeName },
      Proto2TestAllTypesSchema,
    );
    const [td, found] = fd.getTypeDescription("google.expr.proto2.test.TestAllTypes");
    expect(found).toBe(true);
    const fieldNames = [...(td?.fieldMap().keys() ?? [])];
    for (const field of td?.fieldMap().values() ?? []) {
      expect(field.jsonFieldName).toBe(true);
    }
    expect(fieldNames).toEqual(
      expect.arrayContaining(["singleInt32", "repeatedInt64", "nestedgroup"]),
    );

    const copied = pbdb.copy();
    expect(copied.jsonFieldNames()).toBe(true);
    const [copiedTd, copiedFound] = copied.describeType("google.expr.proto2.test.TestAllTypes");
    expect(copiedFound).toBe(true);
    const copiedFieldNames = [...(copiedTd?.fieldMap().keys() ?? [])];
    for (const field of copiedTd?.fieldMap().values() ?? []) {
      expect(field.jsonFieldName).toBe(true);
    }
    expect(copiedFieldNames).toEqual(
      expect.arrayContaining(["singleInt32", "repeatedInt64", "nestedgroup"]),
    );
  });

  it("common/types/pb/pb_test.go/TestDbCopy", () => {
    const clone = DefaultDb.copy();
    expect(clone).toEqual(DefaultDb);
    clone.registerMessage(
      { $typeName: Proto3TestAllTypesSchema.typeName },
      Proto3TestAllTypesSchema,
    );
    expect(clone).not.toEqual(DefaultDb);

    const clone2 = clone.copy();
    expect(clone2).toEqual(clone);
    clone.registerMessage(
      { $typeName: Proto2TestAllTypesSchema.typeName },
      Proto2TestAllTypesSchema,
    );
    expect(clone).not.toEqual(clone2);

    clone2.registerMessage(
      { $typeName: Proto2TestAllTypesSchema.typeName },
      Proto2TestAllTypesSchema,
    );
    expect(() =>
      clone2.registerMessage({ $typeName: "google.expr.proto2.test.ExternalMessageType" } as never),
    ).toThrow(
      "message descriptor not found for google.expr.proto2.test.ExternalMessageType; pass the schema explicitly",
    );
    const clone3 = clone2.copy();
    expect(clone3).toEqual(clone2);
  });

  it("common/types/pb/pb_test.go/TestProtoReflectRoundTrip", () => {
    const pbdb = db();
    for (const file of descriptorRoundTripFiles()) {
      pbdb.registerDescriptor(file);
    }
    const [msgType, found] = pbdb.describeType("google.expr.proto3.test.TestAllTypes");
    expect(found).toBe(true);
    const [boolField, boolFound] = msgType!.fieldByName("single_bool");
    expect(boolFound).toBe(true);
    const value = boolField!.getFrom(create(Proto3TestAllTypesSchema, { singleBool: true }));
    expect(value).toEqual([true, undefined]);
  });

  it("common/types/pb/pb_test.go/TestMerge", () => {
    const timestampPB = create(TimestampSchema);
    const clonedFile = descriptorRoundTripFiles().find(
      (file) =>
        file.proto.package === "google.protobuf" &&
        file.proto.name === "google/protobuf/timestamp.proto",
    );
    expect(clonedFile).toBeDefined();
    const clonedTimestampSchema = clonedFile!.messages[0]!;
    const dynTimestampPB = create(clonedTimestampSchema, { seconds: 123n });
    Merge(TimestampSchema, timestampPB, dynTimestampPB);
    expect(timestampPB.seconds).toBe(123n);
  });

  it("common/types/pb/pb_test.go/TestMergeError", () => {
    const timestampPB = create(TimestampSchema);
    const durationPB = create(DurationSchema);
    expect(() => Merge(TimestampSchema, timestampPB, durationPB)).toThrow(
      "pb.Merge() arguments must be the same type. got: google.protobuf.Timestamp, google.protobuf.Duration",
    );
  });
});
