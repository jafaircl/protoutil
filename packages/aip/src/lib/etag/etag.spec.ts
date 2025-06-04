import { create, equals } from '@bufbuild/protobuf';
import { compileMessage } from '@bufbuild/protocompile';
import { fieldMask } from '@protoutil/core';
import { TestAllTypesSchema } from '@protoutil/core/unittest-proto3';
import { calculateMessageEtag } from './etag.js';

const TestEtagSchema = compileMessage(`
  syntax = "proto3";
  
  message TestPaginationRequest {
    string foo = 1;

    string baz = 2;

    string etag = 3;
  }
`);

describe('etag', () => {
  describe('calculateMessageEtag()', () => {
    it('should calculate the etag for a message', () => {
      const etag = calculateMessageEtag(
        TestAllTypesSchema,
        create(TestAllTypesSchema, { optionalDouble: 3.14 })
      );
      expect(typeof etag).toBe('string');
      expect(etag.startsWith('W/"')).toBe(false);
      expect(etag).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('should calculate a different etag for messages with different values', () => {
      const etag1 = calculateMessageEtag(
        TestAllTypesSchema,
        create(TestAllTypesSchema, {
          optionalDouble: 3.14,
          optionalBool: true,
          optionalInt32: 1,
          optionalInt64: 1n,
        })
      );
      const etag2 = calculateMessageEtag(
        TestAllTypesSchema,
        create(TestAllTypesSchema, {
          optionalDouble: 2.71,
          optionalBool: true,
          optionalInt32: 1,
          optionalInt64: 1n,
        })
      );
      expect(etag1).not.toBe(etag2);
    });

    it('should mark the etag as weak for a message with a field mask', () => {
      const etag = calculateMessageEtag(
        TestAllTypesSchema,
        create(TestAllTypesSchema, { optionalDouble: 3.14 }),
        fieldMask(TestAllTypesSchema, ['optional_double'])
      );
      expect(etag.startsWith('W/"')).toBe(true);
      expect(etag.endsWith('"')).toBe(true);
    });

    it('should not modify the original message when calculating the etag', () => {
      const message = create(TestAllTypesSchema, { optionalDouble: 3.14, optionalInt32: 42 });
      const fm = fieldMask(TestAllTypesSchema, ['optional_double']);
      calculateMessageEtag(TestAllTypesSchema, message, fm);
      expect(
        equals(
          TestAllTypesSchema,
          message,
          create(TestAllTypesSchema, { optionalDouble: 3.14, optionalInt32: 42 })
        )
      ).toBe(true);
    });

    it('should invert the field mask when specified', () => {
      const message = create(TestAllTypesSchema, { optionalDouble: 3.14, optionalInt32: 42 });
      const fm = fieldMask(TestAllTypesSchema, ['optional_double']);
      const etag1 = calculateMessageEtag(TestAllTypesSchema, message, fm, true);
      const etag2 = calculateMessageEtag(TestAllTypesSchema, message, fm, false);
      expect(etag1).not.toBe(etag2);
    });

    it('should not use the etag field to calculate the etag', () => {
      const message1 = create(TestEtagSchema, {
        foo: 'foo',
        etag: 'etag1',
      });
      const etag1 = calculateMessageEtag(TestEtagSchema, message1);
      const message2 = create(TestEtagSchema, {
        foo: 'foo',
        etag: 'etag2',
      });
      const etag2 = calculateMessageEtag(TestEtagSchema, message2);
      expect(etag1).toEqual(etag2);
      const message3 = create(TestEtagSchema, {
        foo: 'bar',
        etag: 'etag3',
      });
      const etag3 = calculateMessageEtag(TestEtagSchema, message3);
      expect(etag1).not.toEqual(etag3);
      expect(etag2).not.toEqual(etag3);
    });
  });
});
