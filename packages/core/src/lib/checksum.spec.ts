import { create } from '@bufbuild/protobuf';
import { TestAllTypesSchema } from '../lib/gen/google/protobuf/unittest_proto3_pb.js';
import { calculateMessageCheckSum } from './checksum.js';

describe('checksum', () => {
  describe('calculateMessageCheckSum()', () => {
    it('should calculate checksum', () => {
      const checkSum = calculateMessageCheckSum(
        TestAllTypesSchema,
        create(TestAllTypesSchema, { optionalInt64: BigInt(1) })
      );
      expect(checkSum).not.toBe(0);
    });

    it('should calculate a different checksum for different requests', () => {
      const checkSum1 = calculateMessageCheckSum(
        TestAllTypesSchema,
        create(TestAllTypesSchema, { optionalInt64: BigInt(1) })
      );
      const checkSum2 = calculateMessageCheckSum(
        TestAllTypesSchema,
        create(TestAllTypesSchema, { optionalInt64: BigInt(2) })
      );
      expect(checkSum1).not.toEqual(checkSum2);
    });

    it('should calculate the same checksum for the same request', () => {
      const checkSum1 = calculateMessageCheckSum(
        TestAllTypesSchema,
        create(TestAllTypesSchema, { optionalInt64: BigInt(1) })
      );
      const checkSum2 = calculateMessageCheckSum(
        TestAllTypesSchema,
        create(TestAllTypesSchema, { optionalInt64: BigInt(1) })
      );
      expect(checkSum1).toEqual(checkSum2);
    });
  });
});
