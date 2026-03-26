import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { checksum } from "./checksum.js";
import { TestAllTypesSchema } from "./gen/google/protobuf/unittest_pb.js";

describe("checksum", () => {
  describe("checksum()", () => {
    it("should calculate checksum", () => {
      const checkSum = checksum(
        TestAllTypesSchema,
        create(TestAllTypesSchema, { optionalInt64: BigInt(1) }),
      );
      expect(checkSum).not.toBe(0);
    });

    it("should calculate a different checksum for different requests", () => {
      const checkSum1 = checksum(
        TestAllTypesSchema,
        create(TestAllTypesSchema, { optionalInt64: BigInt(1) }),
      );
      const checkSum2 = checksum(
        TestAllTypesSchema,
        create(TestAllTypesSchema, { optionalInt64: BigInt(2) }),
      );
      expect(checkSum1).not.toEqual(checkSum2);
    });

    it("should calculate the same checksum for the same request", () => {
      const checkSum1 = checksum(
        TestAllTypesSchema,
        create(TestAllTypesSchema, { optionalInt64: BigInt(1) }),
      );
      const checkSum2 = checksum(
        TestAllTypesSchema,
        create(TestAllTypesSchema, { optionalInt64: BigInt(1) }),
      );
      expect(checkSum1).toEqual(checkSum2);
    });
  });
});
