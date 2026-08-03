import { describe, expect, it } from "vitest";
import { TestAllTypesSchema as CelTestAllTypesSchema } from "./cel/proto3.js";
import { TestAllTypesSchema as ProtobufTestAllTypesSchema } from "./unittest/proto3.js";

describe("@protoutil/testing", () => {
  it("provides CEL and protobuf test schemas through stable subpaths", () => {
    expect(CelTestAllTypesSchema.typeName).toBe("google.expr.proto3.test.TestAllTypes");
    expect(ProtobufTestAllTypesSchema.typeName).toBe("proto3_unittest.TestAllTypes");
  });
});
