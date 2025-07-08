import { create } from '@bufbuild/protobuf';
import { TestAllTypesSchema } from '../protogen/cel/expr/conformance/proto3/test_all_types_pb.js';
import { Env } from './env.js';
import { declareContextProto } from './options.js';
import { normalizeMessageKeys } from './utils.js';

describe('utils', () => {
  describe('normalizeMessageKeys', () => {
    it('should normalize scalar keys', () => {
      const env = new Env(declareContextProto(TestAllTypesSchema));
      const normalized = normalizeMessageKeys(
        env,
        create(TestAllTypesSchema, { singleString: 'test' })
      );
      expect(normalized['single_string']).toEqual('test');
      expect(normalized['singleString']).toBeUndefined();
    });

    it('should normalize list keys', () => {
      const env = new Env(declareContextProto(TestAllTypesSchema));
      const normalized = normalizeMessageKeys(
        env,
        create(TestAllTypesSchema, { repeatedInt64: [1n, 2n, 3n] })
      );
      expect(normalized['repeated_int64']).toEqual([1n, 2n, 3n]);
      expect(normalized['repeatedInt64']).toBeUndefined();
    });

    it('should normalize list keys with nested message', () => {
      const env = new Env(declareContextProto(TestAllTypesSchema));
      const normalized = normalizeMessageKeys(
        env,
        create(TestAllTypesSchema, { repeatedAny: [{ typeUrl: 'abc' }] })
      );
      expect(normalized['repeated_any']).toEqual([
        { $typeName: 'google.protobuf.Any', type_url: 'abc', value: new Uint8Array() },
      ]);
      expect(normalized['repeatedAny']).toBeUndefined();
    });

    it('should normalize map keys', () => {
      const env = new Env(declareContextProto(TestAllTypesSchema));
      const normalized = normalizeMessageKeys(
        env,
        create(TestAllTypesSchema, { mapStringInt64: { key1: 1n, key2: 2n } })
      );
      expect(normalized['map_string_int64']).toEqual({ key1: 1n, key2: 2n });
      expect(normalized['mapStringInt64']).toBeUndefined();
    });

    it('should normalize map keys with nested message', () => {
      const env = new Env(declareContextProto(TestAllTypesSchema));
      const normalized = normalizeMessageKeys(
        env,
        create(TestAllTypesSchema, { mapStringAny: { keyOne: { typeUrl: 'abc' } } })
      );
      expect(normalized['map_string_any']).toEqual({
        keyOne: { $typeName: 'google.protobuf.Any', type_url: 'abc', value: new Uint8Array() },
      });
      expect(normalized['mapStringAny']).toBeUndefined();
    });

    it('should normalize message keys', () => {
      const env = new Env(declareContextProto(TestAllTypesSchema));
      const normalized = normalizeMessageKeys(
        env,
        create(TestAllTypesSchema, { singleAny: { typeUrl: 'test' } })
      );
      expect(normalized['single_any']).toEqual({
        $typeName: 'google.protobuf.Any',
        type_url: 'test',
        value: new Uint8Array(),
      });
      expect(normalized['singleAny']).toBeUndefined();
    });
  });
});
