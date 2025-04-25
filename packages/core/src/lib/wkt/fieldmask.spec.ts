import {
  NestedTestAllTypesSchema,
  TestAllTypesSchema,
} from '@buf/google_cel-spec.bufbuild_es/cel/expr/conformance/proto3/test_all_types_pb.js';
import { create, MessageInitShape, toJsonString } from '@bufbuild/protobuf';
import { FieldMaskSchema } from '@bufbuild/protobuf/wkt';
import {
  applyFieldMask,
  fieldMask,
  fieldMaskHasPath,
  intersectFieldMasks,
  isValidFieldName,
  mergeFieldMasks,
} from './fieldmask.js';

function testAllTypes(message?: MessageInitShape<typeof TestAllTypesSchema>) {
  return create(TestAllTypesSchema, message);
}

describe('fieldmask', () => {
  describe('isValidFieldName()', () => {
    it('returns true for lower snake case strings', () => {
      expect(isValidFieldName('lower_snake_case')).toBe(true);
      expect(isValidFieldName('lower_snake_case_with_numbers_123')).toBe(true);
      expect(isValidFieldName('l')).toBe(true);
    });

    it('returns false for non-lower snake case strings', () => {
      expect(isValidFieldName('UpperSnakeCase')).toBe(false);
      expect(isValidFieldName('lowerSnakeCase')).toBe(false);
      expect(isValidFieldName('lower-snake-case')).toBe(false);
      expect(isValidFieldName('lower snake case')).toBe(false);
      expect(isValidFieldName('lower_snake_case_with_Uppercase')).toBe(false);
    });
  });

  describe('fieldMask()', () => {
    const testCases = [
      {
        schema: TestAllTypesSchema,
        paths: [],
      },
      {
        schema: TestAllTypesSchema,
        paths: ['*'],
        errorContains: `invalid protobuf field name`,
      },
      {
        schema: TestAllTypesSchema,
        paths: ['invalid'],
        errorContains: `field 'invalid' not found in message`,
      },
      {
        schema: TestAllTypesSchema,
        paths: [
          'single_int32',
          'single_int64',
          'single_uint32',
          'single_uint64',
          'single_sint32',
          'single_sint64',
          'single_fixed32',
          'single_fixed64',
          'single_sfixed32',
          'single_sfixed64',
          'single_float',
          'single_double',
          'single_bool',
          'single_string',
          'single_bytes',
          'single_any',
          'single_duration',
          'single_timestamp',
          'single_struct',
          'single_value',
          'single_int64_wrapper',
          'single_int32_wrapper',
          'single_double_wrapper',
          'single_float_wrapper',
          'single_uint64_wrapper',
          'single_uint32_wrapper',
          'single_string_wrapper',
          'single_bool_wrapper',
          'single_bytes_wrapper',
          'list_value',
          'null_value',
          'optional_null_value',
          'single_nested_message',
          'single_nested_enum',
          'standalone_message',
          'standalone_enum',
          'repeated_int32',
          'repeated_int64',
          'repeated_uint32',
          'repeated_uint64',
          'repeated_sint32',
          'repeated_sint64',
          'repeated_fixed32',
          'repeated_fixed64',
          'repeated_sfixed32',
          'repeated_sfixed64',
          'repeated_float',
          'repeated_double',
          'repeated_bool',
          'repeated_string',
          'repeated_bytes',
          'repeated_nested_message',
          'repeated_nested_enum',
          'repeated_string_piece',
          'repeated_cord',
          'repeated_lazy_message',
          'repeated_any',
          'repeated_duration',
          'repeated_timestamp',
          'repeated_struct',
          'repeated_value',
          'repeated_int64_wrapper',
          'repeated_int32_wrapper',
          'repeated_double_wrapper',
          'repeated_float_wrapper',
          'repeated_uint64_wrapper',
          'repeated_uint32_wrapper',
          'repeated_string_wrapper',
          'repeated_bool_wrapper',
          'repeated_bytes_wrapper',
          'repeated_list_value',
          'repeated_null_value',
          'map_int64_nested_type',
          'map_bool_bool',
          'map_bool_string',
          'map_bool_bytes',
          'map_bool_int32',
          'map_bool_int64',
          'map_bool_uint32',
          'map_bool_uint64',
          'map_bool_float',
          'map_bool_double',
          'map_bool_enum',
          'map_bool_message',
          'map_bool_duration',
          'map_bool_timestamp',
          'map_bool_null_value',
          'map_bool_any',
          'map_bool_struct',
          'map_bool_value',
          'map_bool_list_value',
          'map_bool_int64_wrapper',
          'map_bool_int32_wrapper',
          'map_bool_double_wrapper',
          'map_bool_float_wrapper',
          'map_bool_uint64_wrapper',
          'map_bool_uint32_wrapper',
          'map_bool_string_wrapper',
          'map_bool_bool_wrapper',
          'map_bool_bytes_wrapper',
          'map_int32_bool',
          'map_int32_string',
          'map_int32_bytes',
          'map_int32_int32',
          'map_int32_int64',
          'map_int32_uint32',
          'map_int32_uint64',
          'map_int32_float',
          'map_int32_double',
          'map_int32_enum',
          'map_int32_message',
          'map_int32_duration',
          'map_int32_timestamp',
          'map_int32_null_value',
          'map_int32_any',
          'map_int32_struct',
          'map_int32_value',
          'map_int32_list_value',
          'map_int32_int64_wrapper',
          'map_int32_int32_wrapper',
          'map_int32_double_wrapper',
          'map_int32_float_wrapper',
          'map_int32_uint64_wrapper',
          'map_int32_uint32_wrapper',
          'map_int32_string_wrapper',
          'map_int32_bool_wrapper',
          'map_int32_bytes_wrapper',
          'map_int64_bool',
          'map_int64_string',
          'map_int64_bytes',
          'map_int64_int32',
          'map_int64_int64',
          'map_int64_uint32',
          'map_int64_uint64',
          'map_int64_float',
          'map_int64_double',
          'map_int64_enum',
          'map_int64_message',
          'map_int64_duration',
          'map_int64_timestamp',
          'map_int64_null_value',
          'map_int64_any',
          'map_int64_struct',
          'map_int64_value',
          'map_int64_list_value',
          'map_int64_int64_wrapper',
          'map_int64_int32_wrapper',
          'map_int64_double_wrapper',
          'map_int64_float_wrapper',
          'map_int64_uint64_wrapper',
          'map_int64_uint32_wrapper',
          'map_int64_string_wrapper',
          'map_int64_bool_wrapper',
          'map_int64_bytes_wrapper',
          'map_uint32_bool',
          'map_uint32_string',
          'map_uint32_bytes',
          'map_uint32_int32',
          'map_uint32_int64',
          'map_uint32_uint32',
          'map_uint32_uint64',
          'map_uint32_float',
          'map_uint32_double',
          'map_uint32_enum',
          'map_uint32_message',
          'map_uint32_duration',
          'map_uint32_timestamp',
          'map_uint32_null_value',
          'map_uint32_any',
          'map_uint32_struct',
          'map_uint32_value',
          'map_uint32_list_value',
          'map_uint32_int64_wrapper',
          'map_uint32_int32_wrapper',
          'map_uint32_double_wrapper',
          'map_uint32_float_wrapper',
          'map_uint32_uint64_wrapper',
          'map_uint32_uint32_wrapper',
          'map_uint32_string_wrapper',
          'map_uint32_bool_wrapper',
          'map_uint32_bytes_wrapper',
          'map_uint64_bool',
          'map_uint64_string',
          'map_uint64_bytes',
          'map_uint64_int32',
          'map_uint64_int64',
          'map_uint64_uint32',
          'map_uint64_uint64',
          'map_uint64_float',
          'map_uint64_double',
          'map_uint64_enum',
          'map_uint64_message',
          'map_uint64_duration',
          'map_uint64_timestamp',
          'map_uint64_null_value',
          'map_uint64_any',
          'map_uint64_struct',
          'map_uint64_value',
          'map_uint64_list_value',
          'map_uint64_int64_wrapper',
          'map_uint64_int32_wrapper',
          'map_uint64_double_wrapper',
          'map_uint64_float_wrapper',
          'map_uint64_uint64_wrapper',
          'map_uint64_uint32_wrapper',
          'map_uint64_string_wrapper',
          'map_uint64_bool_wrapper',
          'map_uint64_bytes_wrapper',
          'map_string_bool',
          'map_string_string',
          'map_string_bytes',
          'map_string_int32',
          'map_string_int64',
          'map_string_uint32',
          'map_string_uint64',
          'map_string_float',
          'map_string_double',
          'map_string_enum',
          'map_string_message',
          'map_string_duration',
          'map_string_timestamp',
          'map_string_null_value',
          'map_string_any',
          'map_string_struct',
          'map_string_value',
          'map_string_list_value',
          'map_string_int64_wrapper',
          'map_string_int32_wrapper',
          'map_string_double_wrapper',
          'map_string_float_wrapper',
          'map_string_uint64_wrapper',
          'map_string_uint32_wrapper',
          'map_string_string_wrapper',
          'map_string_bool_wrapper',
          'map_string_bytes_wrapper',
        ],
      },
      {
        schema: TestAllTypesSchema,
        paths: ['map_uint64_timestamp.seconds'],
        errorContains: `map field is only allowed in the last position`,
      },
      {
        schema: TestAllTypesSchema,
        paths: ['map_uint64_timestamp'],
      },
      {
        schema: TestAllTypesSchema,
        paths: ['repeated_timestamp.seconds'],
        errorContains: `repeated field is only allowed in the last position`,
      },
      {
        schema: TestAllTypesSchema,
        paths: ['repeated_timestamp'],
      },
      {
        schema: TestAllTypesSchema,
        paths: ['standalone_message.bb', 'single_nested_message.bb'],
      },
      {
        schema: TestAllTypesSchema,
        paths: ['repeated_nested_message[0]'],
        errorContains: `invalid protobuf field name`,
      },
      {
        schema: TestAllTypesSchema,
        paths: ['map_bool_message["key"]'],
        errorContains: `invalid protobuf field name`,
      },
      {
        schema: NestedTestAllTypesSchema,
        paths: ['child.child.child.payload.single_int32'],
      },
      {
        schema: NestedTestAllTypesSchema,
        paths: ['child.child.child.payload.repeated_nested_message'],
      },
    ];
    for (const tc of testCases) {
      it(`creates a field mask with ${JSON.stringify(tc.paths)}`, () => {
        if (tc.errorContains) {
          expect(() => fieldMask(tc.schema, ...tc.paths)).toThrow(
            tc.errorContains
          );
        } else {
          expect(() => fieldMask(tc.schema, ...tc.paths)).not.toThrow();
        }
      });
    }
  });

  describe('fieldMaskHasPath()', () => {
    it('checks for paths', () => {
      expect(
        fieldMaskHasPath(
          fieldMask(TestAllTypesSchema, 'single_int32'),
          'single_int32'
        )
      ).toBe(true);
      expect(
        fieldMaskHasPath(
          fieldMask(TestAllTypesSchema, 'single_int32'),
          'single_string'
        )
      ).toBe(false);
      expect(
        fieldMaskHasPath(
          fieldMask(TestAllTypesSchema, 'standalone_message.bb'),
          'standalone_message.bb'
        )
      ).toBe(true);
      expect(
        fieldMaskHasPath(
          fieldMask(TestAllTypesSchema, 'standalone_message'),
          'standalone_message.bb'
        )
      ).toBe(true);
      expect(
        fieldMaskHasPath(
          fieldMask(TestAllTypesSchema, 'standalone_message.bb'),
          'standalone_message'
        )
      ).toBe(false);
    });
  });

  describe('applyFieldMask()', () => {
    it('should throw an error for an invalid field mask', () => {
      expect(() =>
        applyFieldMask(
          TestAllTypesSchema,
          testAllTypes(),
          fieldMask(TestAllTypesSchema, 'no_such_field')
        )
      ).toThrow(`field 'no_such_field' not found in message`);
    });

    const testCases = [
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({ singleInt32: 1 }),
        fieldMask: fieldMask(TestAllTypesSchema, 'single_int32'),
        inverse: false,
        expected: testAllTypes({ singleInt32: 1 }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({ singleInt32: 1 }),
        fieldMask: fieldMask(TestAllTypesSchema, 'single_int32'),
        inverse: true,
        expected: testAllTypes(),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          singleInt64: BigInt(2),
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'single_int32'),
        inverse: false,
        expected: testAllTypes({ singleInt32: 1 }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          singleInt64: BigInt(2),
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'single_int32'),
        inverse: true,
        expected: testAllTypes({
          singleInt64: BigInt(2),
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          singleInt64: BigInt(2),
        }),
        fieldMask: fieldMask(
          TestAllTypesSchema,
          'single_int32',
          'single_int64'
        ),
        inverse: false,
        expected: testAllTypes({
          singleInt32: 1,
          singleInt64: BigInt(2),
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          singleInt64: BigInt(2),
        }),
        fieldMask: fieldMask(
          TestAllTypesSchema,
          'single_int32',
          'single_int64'
        ),
        inverse: true,
        expected: testAllTypes(),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          standaloneMessage: {
            bb: 1,
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'standalone_message'),
        inverse: false,
        expected: testAllTypes({
          standaloneMessage: {
            bb: 1,
          },
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          standaloneMessage: {
            bb: 1,
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'standalone_message'),
        inverse: true,
        expected: testAllTypes({ singleInt32: 1 }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          nestedType: {
            case: 'singleNestedMessage',
            value: {
              bb: 1,
            },
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'single_nested_message'),
        inverse: false,
        expected: testAllTypes({
          nestedType: {
            case: 'singleNestedMessage',
            value: {
              bb: 1,
            },
          },
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          nestedType: {
            case: 'singleNestedMessage',
            value: {
              bb: 1,
            },
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'single_int32'),
        inverse: false,
        expected: testAllTypes({ singleInt32: 1 }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          nestedType: {
            case: 'singleNestedMessage',
            value: {
              bb: 1,
            },
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'single_nested_message'),
        inverse: true,
        expected: testAllTypes({ singleInt32: 1 }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          mapUint32Timestamp: {
            1: {
              nanos: 1,
              seconds: BigInt(1),
            },
            2: {
              nanos: 2,
              seconds: BigInt(2),
            },
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'map_uint32_timestamp'),
        inverse: false,
        expected: testAllTypes({
          mapUint32Timestamp: {
            1: {
              nanos: 1,
              seconds: BigInt(1),
            },
            2: {
              nanos: 2,
              seconds: BigInt(2),
            },
          },
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          mapUint32Timestamp: {
            1: {
              nanos: 1,
              seconds: BigInt(1),
            },
            2: {
              nanos: 2,
              seconds: BigInt(2),
            },
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'map_uint32_timestamp'),
        inverse: true,
        expected: testAllTypes({
          singleInt32: 1,
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          repeatedTimestamp: [
            { nanos: 1, seconds: 1n },
            { nanos: 2, seconds: 2n },
          ],
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'repeated_timestamp'),
        inverse: false,
        expected: testAllTypes({
          repeatedTimestamp: [
            { nanos: 1, seconds: 1n },
            { nanos: 2, seconds: 2n },
          ],
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          repeatedTimestamp: [
            { nanos: 1, seconds: BigInt(1) },
            { nanos: 2, seconds: BigInt(2) },
          ],
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'repeated_timestamp'),
        inverse: true,
        expected: testAllTypes({
          singleInt32: 1,
        }),
      },
      {
        schema: NestedTestAllTypesSchema,
        message: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              singleInt32: 1,
              singleBool: true,
            },
          },
          payload: {
            singleInt32: 1,
            singleBool: true,
          },
        }),
        fieldMask: fieldMask(
          NestedTestAllTypesSchema,
          'child.payload.single_int32'
        ),
        inverse: false,
        expected: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              singleInt32: 1,
            },
          },
        }),
      },
      {
        schema: NestedTestAllTypesSchema,
        message: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              singleInt32: 1,
              singleBool: true,
            },
          },
          payload: {
            singleInt32: 1,
            singleBool: true,
          },
        }),
        fieldMask: fieldMask(
          NestedTestAllTypesSchema,
          'child.payload.single_int32'
        ),
        inverse: true,
        expected: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              singleBool: true,
            },
          },
          payload: {
            singleInt32: 1,
            singleBool: true,
          },
        }),
      },
      {
        schema: NestedTestAllTypesSchema,
        message: create(NestedTestAllTypesSchema, {
          child: {
            child: {
              payload: {
                mapInt32Timestamp: {
                  1: { nanos: 1, seconds: 1n },
                  2: { nanos: 2, seconds: 2n },
                },
              },
            },
          },
          payload: {
            singleInt32: 1,
            singleBool: true,
          },
        }),
        fieldMask: fieldMask(
          NestedTestAllTypesSchema,
          'child.child.payload.map_int32_timestamp'
        ),
        inverse: false,
        expected: create(NestedTestAllTypesSchema, {
          child: {
            child: {
              payload: {
                mapInt32Timestamp: {
                  1: { nanos: 1, seconds: 1n },
                  2: { nanos: 2, seconds: 2n },
                },
              },
            },
          },
        }),
      },
      {
        schema: NestedTestAllTypesSchema,
        message: create(NestedTestAllTypesSchema, {
          child: {
            child: {
              payload: {
                mapInt32Timestamp: {
                  1: { nanos: 1, seconds: 1n },
                  2: { nanos: 2, seconds: 2n },
                },
              },
            },
          },
          payload: {
            singleInt32: 1,
            singleBool: true,
          },
        }),
        fieldMask: fieldMask(
          NestedTestAllTypesSchema,
          'child.child.payload.map_int32_timestamp'
        ),
        inverse: true,
        expected: create(NestedTestAllTypesSchema, {
          child: {
            child: {
              payload: {},
            },
          },
          payload: {
            singleInt32: 1,
            singleBool: true,
          },
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          kind: {
            case: 'oneofMsg',
            value: {
              bb: 1,
            },
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'oneof_msg'),
        inverse: false,
        expected: testAllTypes({
          kind: {
            case: 'oneofMsg',
            value: {
              bb: 1,
            },
          },
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          singleInt32: 1,
          kind: {
            case: 'oneofMsg',
            value: {
              bb: 1,
            },
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, 'oneof_msg'),
        inverse: true,
        expected: testAllTypes({
          singleInt32: 1,
        }),
      },
      {
        schema: NestedTestAllTypesSchema,
        message: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              singleInt32: 1,
              kind: {
                case: 'oneofMsg',
                value: {
                  bb: 1,
                },
              },
            },
          },
        }),
        fieldMask: fieldMask(
          NestedTestAllTypesSchema,
          'child.payload.oneof_msg'
        ),
        inverse: false,
        expected: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              kind: {
                case: 'oneofMsg',
                value: {
                  bb: 1,
                },
              },
            },
          },
        }),
      },
      {
        schema: NestedTestAllTypesSchema,
        message: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              singleInt32: 1,
              kind: {
                case: 'oneofMsg',
                value: {
                  bb: 1,
                },
              },
            },
          },
        }),
        fieldMask: fieldMask(
          NestedTestAllTypesSchema,
          'child.payload.oneof_msg'
        ),
        inverse: true,
        expected: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              singleInt32: 1,
            },
          },
        }),
      },
    ];
    for (const tc of testCases) {
      it(`should apply${
        tc.inverse ? ' an inverse' : ''
      } field mask ${toJsonString(FieldMaskSchema, tc.fieldMask)} to ${
        tc.schema.typeName
      }`, () => {
        const result = applyFieldMask(
          tc.schema,
          tc.message,
          tc.fieldMask,
          tc.inverse
        );
        expect(result).toEqual(tc.expected);
      });
    }
  });

  describe('mergeFieldMasks()', () => {
    const testCases = [
      {
        in: [[], []],
        out: [],
      },
      {
        in: [['single_int32'], []],
        out: ['single_int32'],
      },
      {
        in: [['single_int32'], ['single_int32']],
        out: ['single_int32'],
      },
      {
        in: [['single_int32'], ['single_float'], ['single_string']],
        out: ['single_float', 'single_int32', 'single_string'],
      },
      {
        in: [['child.child.payload'], ['child.child.payload']],
        out: ['child.child.payload'],
      },
      {
        in: [
          ['child.child.payload.map_int32_timestamp'],
          ['child.child.payload'],
        ],
        out: ['child.child.payload'],
      },
    ];

    for (const tc of testCases) {
      it(`merges field masks ${JSON.stringify(tc.in)} to ${JSON.stringify(
        tc.out
      )}`, () => {
        const merged = mergeFieldMasks(
          ...tc.in.map((m) => create(FieldMaskSchema, { paths: m }))
        );
        expect(merged).toEqual(create(FieldMaskSchema, { paths: tc.out }));
      });
    }
  });

  describe('intersectFieldMasks()', () => {
    const testCases = [
      {
        in: [[], []],
        out: [],
      },
      {
        in: [['single_int32'], []],
        out: [],
      },
      {
        in: [['single_int32'], ['single_int32']],
        out: ['single_int32'],
      },
      {
        in: [['child.child.payload'], ['child.child.payload']],
        out: ['child.child.payload'],
      },
      {
        in: [
          ['child.child.payload.map_int32_timestamp'],
          ['child.child.payload'],
        ],
        out: ['child.child.payload.map_int32_timestamp'],
      },
      {
        in: [
          ['a', 'b'],
          ['b.b'],
          ['b'],
          ['b', 'a.A'],
          ['b', 'c', 'c.a', 'c.b'],
        ],
        out: ['b.b'],
      },
    ];
    for (const tc of testCases) {
      it(`intersects field masks ${JSON.stringify(tc.in)} to ${JSON.stringify(
        tc.out
      )}`, () => {
        const intersected = intersectFieldMasks(
          ...tc.in.map((m) => create(FieldMaskSchema, { paths: m }))
        );
        expect(intersected).toEqual(create(FieldMaskSchema, { paths: tc.out }));
      });
    }
  });
});
