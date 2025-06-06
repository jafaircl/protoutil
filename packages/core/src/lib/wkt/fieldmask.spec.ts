import { create, MessageInitShape, toJsonString } from '@bufbuild/protobuf';
import { FieldMaskSchema } from '@bufbuild/protobuf/wkt';
import {
  NestedTestAllTypesSchema,
  TestAllTypesSchema,
} from '../gen/google/protobuf/unittest_proto3_pb.js';
import {
  NestedUnittestMessageSchema,
  UnittestMessageSchema,
} from './../gen/protoutil/core/v1/unittest_pb.js';
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

function unittestMessage(message?: MessageInitShape<typeof UnittestMessageSchema>) {
  return create(UnittestMessageSchema, message);
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
        paths: ['*'],
        strict: false,
      },
      {
        schema: TestAllTypesSchema,
        paths: ['*', 'map_string_bytes_wrapper'],
        strict: false,
        errorContains: `invalid field path: '*' must not be used with other paths`,
      },
      {
        schema: TestAllTypesSchema,
        paths: ['invalid'],
        errorContains: `field 'invalid' not found in message`,
      },
      {
        schema: TestAllTypesSchema,
        paths: TestAllTypesSchema.fields.map((f) => f.name),
      },
      {
        schema: UnittestMessageSchema,
        paths: ['map_int32_timestamp.*.seconds'],
        strict: false,
      },
      {
        schema: UnittestMessageSchema,
        paths: ['map_int32_timestamp.*.invalid'],
        strict: false,
        errorContains: `field 'invalid' not found in message`,
      },
      {
        schema: UnittestMessageSchema,
        paths: ['map_int32_timestamp.seconds'],
        errorContains: `map field is only allowed in the last position`,
      },
      {
        schema: UnittestMessageSchema,
        paths: ['map_int32_timestamp.*.seconds'],
        errorContains: `invalid protobuf field name: *`,
      },
      {
        schema: UnittestMessageSchema,
        paths: ['map_int32_timestamp'],
      },
      {
        schema: UnittestMessageSchema,
        paths: ['repeated_timestamp.*.seconds'],
        strict: false,
      },
      {
        schema: UnittestMessageSchema,
        paths: ['repeated_timestamp.*.invalid'],
        strict: false,
        errorContains: `field 'invalid' not found in message`,
      },
      {
        schema: UnittestMessageSchema,
        paths: ['repeated_timestamp.seconds'],
        errorContains: `repeated field is only allowed in the last position`,
      },
      {
        schema: UnittestMessageSchema,
        paths: ['repeated_timestamp.*.seconds'],
        errorContains: `invalid protobuf field name: *`,
      },
      {
        schema: UnittestMessageSchema,
        paths: ['repeated_timestamp'],
      },
      {
        schema: TestAllTypesSchema,
        paths: ['optional_nested_message.bb', 'optional_nested_message.bb'],
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
        paths: ['child.child.child.payload.optional_int32'],
      },
      {
        schema: NestedTestAllTypesSchema,
        paths: ['child.child.child.payload.repeated_nested_message'],
      },
      {
        schema: NestedTestAllTypesSchema,
        paths: ['child.payload.*'],
        strict: false,
        errorContains: `wildcards must be used with repeated or map fields`,
      },
    ];
    for (const tc of testCases) {
      it(`creates a field mask with ${JSON.stringify(tc.paths)}`, () => {
        if (tc.errorContains) {
          expect(() => fieldMask(tc.schema, tc.paths, tc.strict === false ? false : true)).toThrow(
            tc.errorContains
          );
        } else {
          expect(() =>
            fieldMask(tc.schema, tc.paths, tc.strict === false ? false : true)
          ).not.toThrow();
        }
      });
    }
  });

  describe('fieldMaskHasPath()', () => {
    it('checks for paths', () => {
      expect(
        fieldMaskHasPath(fieldMask(TestAllTypesSchema, ['optional_int32']), 'optional_int32')
      ).toBe(true);
      expect(
        fieldMaskHasPath(fieldMask(TestAllTypesSchema, ['optional_int32']), 'optional_string')
      ).toBe(false);
      expect(
        fieldMaskHasPath(
          fieldMask(TestAllTypesSchema, ['optional_nested_message.bb']),
          'optional_nested_message.bb'
        )
      ).toBe(true);
      expect(
        fieldMaskHasPath(
          fieldMask(TestAllTypesSchema, ['optional_nested_message']),
          'optional_nested_message.bb'
        )
      ).toBe(true);
      expect(
        fieldMaskHasPath(
          fieldMask(TestAllTypesSchema, ['optional_nested_message.bb']),
          'optional_nested_message'
        )
      ).toBe(false);
      expect(
        fieldMaskHasPath(
          fieldMask(UnittestMessageSchema, ['*'], false),
          'map_int32_timestamp',
          false
        )
      ).toBe(true);
      expect(
        fieldMaskHasPath(
          fieldMask(
            UnittestMessageSchema,
            ['map_int32_timestamp.*.seconds', 'map_int32_timestamp.*.nanos'],
            false
          ),
          'map_int32_timestamp.*.nanos',
          false
        )
      ).toBe(true);
      expect(
        fieldMaskHasPath(
          fieldMask(
            UnittestMessageSchema,
            ['map_int32_timestamp.*.seconds', 'map_int32_timestamp.*.nanos'],
            false
          ),
          'map_int32_timestamp.*.invalid',
          false
        )
      ).toBe(false);
      expect(
        fieldMaskHasPath(
          fieldMask(UnittestMessageSchema, ['map_int32_timestamp.*'], false),
          'map_int32_timestamp.*.nanos',
          false
        )
      ).toBe(true);
      expect(
        fieldMaskHasPath(
          fieldMask(UnittestMessageSchema, ['map_int32_timestamp.*.seconds'], false),
          'map_int32_timestamp',
          false
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
          fieldMask(TestAllTypesSchema, ['no_such_field'])
        )
      ).toThrow(`field 'no_such_field' not found in message`);
    });

    const testCases = [
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({ optionalInt32: 1 }),
        fieldMask: fieldMask(TestAllTypesSchema, ['optional_int32']),
        inverse: false,
        expected: testAllTypes({ optionalInt32: 1 }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({ optionalInt32: 1 }),
        fieldMask: fieldMask(TestAllTypesSchema, ['optional_int32']),
        inverse: true,
        expected: testAllTypes(),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          optionalInt64: BigInt(2),
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['optional_int32']),
        inverse: false,
        expected: testAllTypes({ optionalInt32: 1 }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          optionalInt64: BigInt(2),
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['optional_int32']),
        inverse: true,
        expected: testAllTypes({
          optionalInt64: BigInt(2),
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          optionalInt64: BigInt(2),
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['optional_int32', 'optional_int64']),
        inverse: false,
        expected: testAllTypes({
          optionalInt32: 1,
          optionalInt64: BigInt(2),
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          optionalInt64: BigInt(2),
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['optional_int32', 'optional_int64']),
        inverse: true,
        expected: testAllTypes(),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          optionalLazyMessage: {
            bb: 1,
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['optional_lazy_message']),
        inverse: false,
        expected: testAllTypes({
          optionalLazyMessage: {
            bb: 1,
          },
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          optionalLazyMessage: {
            bb: 1,
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['optional_lazy_message']),
        inverse: true,
        expected: testAllTypes({ optionalInt32: 1 }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          oneofField: {
            case: 'oneofNestedMessage',
            value: {
              bb: 1,
            },
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['oneof_nested_message']),
        inverse: false,
        expected: testAllTypes({
          oneofField: {
            case: 'oneofNestedMessage',
            value: {
              bb: 1,
            },
          },
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          oneofField: {
            case: 'oneofNestedMessage',
            value: {
              bb: 1,
            },
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['optional_int32']),
        inverse: false,
        expected: testAllTypes({ optionalInt32: 1 }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          oneofField: {
            case: 'oneofNestedMessage',
            value: {
              bb: 1,
            },
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['oneof_nested_message']),
        inverse: true,
        expected: testAllTypes({ optionalInt32: 1 }),
      },
      {
        schema: UnittestMessageSchema,
        message: unittestMessage({
          optionalInt32: 1,
          mapInt32Timestamp: {
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
        fieldMask: fieldMask(UnittestMessageSchema, ['map_int32_timestamp']),
        inverse: false,
        expected: unittestMessage({
          mapInt32Timestamp: {
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
        schema: UnittestMessageSchema,
        message: unittestMessage({
          optionalInt32: 1,
          mapInt32Timestamp: {
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
        fieldMask: fieldMask(UnittestMessageSchema, ['map_int32_timestamp']),
        inverse: true,
        expected: unittestMessage({
          optionalInt32: 1,
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          repeatedForeignMessage: [{ c: 1 }, { c: 2 }],
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['repeated_foreign_message']),
        inverse: false,
        expected: testAllTypes({
          repeatedForeignMessage: [{ c: 1 }, { c: 2 }],
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          repeatedForeignMessage: [{ c: 1 }, { c: 2 }],
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['repeated_foreign_message']),
        inverse: true,
        expected: testAllTypes({
          optionalInt32: 1,
        }),
      },
      {
        schema: NestedTestAllTypesSchema,
        message: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              optionalInt32: 1,
              optionalBool: true,
            },
          },
          payload: {
            optionalInt32: 1,
            optionalBool: true,
          },
        }),
        fieldMask: fieldMask(NestedTestAllTypesSchema, ['child.payload.optional_int32']),
        inverse: false,
        expected: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              optionalInt32: 1,
            },
          },
        }),
      },
      {
        schema: NestedTestAllTypesSchema,
        message: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              optionalInt32: 1,
              optionalBool: true,
            },
          },
          payload: {
            optionalInt32: 1,
            optionalBool: true,
          },
        }),
        fieldMask: fieldMask(NestedTestAllTypesSchema, ['child.payload.optional_int32']),
        inverse: true,
        expected: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              optionalBool: true,
            },
          },
          payload: {
            optionalInt32: 1,
            optionalBool: true,
          },
        }),
      },
      {
        schema: NestedUnittestMessageSchema,
        message: create(NestedUnittestMessageSchema, {
          nestedMessage: {
            optionalNestedMessage: {
              mapInt32Timestamp: {
                1: { nanos: 1, seconds: 1n },
                2: { nanos: 2, seconds: 2n },
              },
            },
            optionalInt32: 1,
            optionalBool: true,
          },
        }),
        fieldMask: fieldMask(NestedUnittestMessageSchema, [
          'nested_message.optional_nested_message.map_int32_timestamp',
        ]),
        inverse: false,
        expected: create(NestedUnittestMessageSchema, {
          nestedMessage: {
            optionalNestedMessage: {
              mapInt32Timestamp: {
                1: { nanos: 1, seconds: 1n },
                2: { nanos: 2, seconds: 2n },
              },
            },
          },
        }),
      },
      {
        schema: NestedUnittestMessageSchema,
        message: create(NestedUnittestMessageSchema, {
          nestedMessage: {
            optionalNestedMessage: {
              mapInt32Timestamp: {
                1: { nanos: 1, seconds: 1n },
                2: { nanos: 2, seconds: 2n },
              },
            },
            optionalInt32: 1,
            optionalBool: true,
          },
        }),
        fieldMask: fieldMask(NestedUnittestMessageSchema, [
          'nested_message.optional_nested_message.map_int32_timestamp',
        ]),
        inverse: true,
        expected: create(NestedUnittestMessageSchema, {
          nestedMessage: {
            optionalNestedMessage: {},
            optionalInt32: 1,
            optionalBool: true,
          },
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          oneofField: {
            case: 'oneofNestedMessage',
            value: {
              bb: 1,
            },
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['oneof_nested_message']),
        inverse: false,
        expected: testAllTypes({
          oneofField: {
            case: 'oneofNestedMessage',
            value: {
              bb: 1,
            },
          },
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({
          optionalInt32: 1,
          oneofField: {
            case: 'oneofNestedMessage',
            value: {
              bb: 1,
            },
          },
        }),
        fieldMask: fieldMask(TestAllTypesSchema, ['oneof_nested_message']),
        inverse: true,
        expected: testAllTypes({
          optionalInt32: 1,
        }),
      },
      {
        schema: NestedTestAllTypesSchema,
        message: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              optionalInt32: 1,
              oneofField: {
                case: 'oneofNestedMessage',
                value: {
                  bb: 1,
                },
              },
            },
          },
        }),
        fieldMask: fieldMask(NestedTestAllTypesSchema, ['child.payload.oneof_nested_message']),
        inverse: false,
        expected: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              oneofField: {
                case: 'oneofNestedMessage',
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
              optionalInt32: 1,
              oneofField: {
                case: 'oneofNestedMessage',
                value: {
                  bb: 1,
                },
              },
            },
          },
        }),
        fieldMask: fieldMask(NestedTestAllTypesSchema, ['child.payload.oneof_nested_message']),
        inverse: true,
        expected: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              optionalInt32: 1,
            },
          },
        }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({ optionalInt32: 1, optionalDouble: 3.14 }),
        fieldMask: fieldMask(TestAllTypesSchema, ['*'], false),
        inverse: false,
        strict: false,
        expected: testAllTypes({ optionalInt32: 1, optionalDouble: 3.14 }),
      },
      {
        schema: TestAllTypesSchema,
        message: testAllTypes({ optionalInt32: 1 }),
        fieldMask: fieldMask(TestAllTypesSchema, ['*'], false),
        inverse: true,
        strict: false,
        expected: testAllTypes(),
      },
      {
        schema: UnittestMessageSchema,
        message: unittestMessage({
          optionalInt32: 1,
          mapInt32Timestamp: {
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
        fieldMask: fieldMask(UnittestMessageSchema, ['map_int32_timestamp.*.seconds'], false),
        inverse: false,
        strict: false,
        expected: unittestMessage({
          mapInt32Timestamp: {
            1: {
              seconds: BigInt(1),
            },
            2: {
              seconds: BigInt(2),
            },
          },
        }),
      },
      {
        schema: UnittestMessageSchema,
        message: unittestMessage({
          optionalInt32: 1,
          mapInt32Timestamp: {
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
        fieldMask: fieldMask(UnittestMessageSchema, ['map_int32_timestamp.*.seconds'], false),
        inverse: true,
        strict: false,
        expected: unittestMessage({
          optionalInt32: 1,
          mapInt32Timestamp: {
            1: {
              nanos: 1,
            },
            2: {
              nanos: 2,
            },
          },
        }),
      },
      {
        schema: UnittestMessageSchema,
        message: unittestMessage({
          optionalInt32: 1,
          repeatedTimestamp: [
            { nanos: 1, seconds: BigInt(1) },
            { nanos: 2, seconds: BigInt(2) },
          ],
        }),
        fieldMask: fieldMask(UnittestMessageSchema, ['repeated_timestamp.*.seconds'], false),
        inverse: false,
        strict: false,
        expected: unittestMessage({
          repeatedTimestamp: [{ seconds: BigInt(1) }, { seconds: BigInt(2) }],
        }),
      },
      {
        schema: UnittestMessageSchema,
        message: unittestMessage({
          optionalInt32: 1,
          repeatedTimestamp: [
            { nanos: 1, seconds: BigInt(1) },
            { nanos: 2, seconds: BigInt(2) },
          ],
        }),
        fieldMask: fieldMask(UnittestMessageSchema, ['repeated_timestamp.*.seconds'], false),
        inverse: true,
        strict: false,
        expected: unittestMessage({
          optionalInt32: 1,
          repeatedTimestamp: [{ nanos: 1 }, { nanos: 2 }],
        }),
      },
      {
        schema: NestedTestAllTypesSchema,
        message: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              optionalInt32: 1,
              optionalBool: true,
            },
          },
          payload: {
            optionalInt32: 1,
            optionalBool: true,
          },
        }),
        fieldMask: fieldMask(NestedTestAllTypesSchema, ['child.payload.optional_int32'], false),
        inverse: false,
        strict: false,
        expected: create(NestedTestAllTypesSchema, {
          child: {
            payload: {
              optionalInt32: 1,
            },
          },
        }),
      },
      {
        schema: NestedUnittestMessageSchema,
        message: create(NestedUnittestMessageSchema, {
          nestedMessage: {
            optionalNestedMessage: {
              optionalNestedMessage: {
                mapInt32Timestamp: {
                  1: {
                    seconds: BigInt(1),
                    nanos: 1,
                  },
                  2: {
                    seconds: BigInt(2),
                    nanos: 2,
                  },
                },
              },
            },
            optionalInt32: 1,
            optionalBool: true,
          },
        }),
        fieldMask: fieldMask(
          NestedUnittestMessageSchema,
          [
            'nested_message.optional_nested_message.optional_nested_message.map_int32_timestamp.*.seconds',
          ],
          false
        ),
        inverse: false,
        strict: false,
        expected: create(NestedUnittestMessageSchema, {
          nestedMessage: {
            optionalNestedMessage: {
              optionalNestedMessage: {
                mapInt32Timestamp: {
                  1: {
                    seconds: BigInt(1),
                  },
                  2: {
                    seconds: BigInt(2),
                  },
                },
              },
            },
          },
        }),
      },
      {
        schema: NestedUnittestMessageSchema,
        message: create(NestedUnittestMessageSchema, {
          nestedMessage: {
            optionalNestedMessage: {
              optionalNestedMessage: {
                mapInt32Timestamp: {
                  1: {
                    seconds: BigInt(1),
                    nanos: 1,
                  },
                  2: {
                    seconds: BigInt(2),
                    nanos: 2,
                  },
                },
              },
            },
            optionalInt32: 1,
            optionalBool: true,
          },
        }),
        fieldMask: fieldMask(
          NestedUnittestMessageSchema,
          [
            'nested_message.optional_nested_message.optional_nested_message.map_int32_timestamp.*.seconds',
          ],
          false
        ),
        inverse: true,
        strict: false,
        expected: create(NestedUnittestMessageSchema, {
          nestedMessage: {
            optionalNestedMessage: {
              optionalNestedMessage: {
                mapInt32Timestamp: {
                  1: {
                    nanos: 1,
                  },
                  2: {
                    nanos: 2,
                  },
                },
              },
            },
            optionalInt32: 1,
            optionalBool: true,
          },
        }),
      },
    ];
    for (const tc of testCases) {
      it(`should apply${tc.inverse ? ' an inverse' : ''} field mask ${toJsonString(
        FieldMaskSchema,
        tc.fieldMask
      )} to ${tc.schema.typeName}`, () => {
        const result = applyFieldMask(
          tc.schema,
          tc.message,
          tc.fieldMask,
          tc.inverse,
          tc.strict === false ? false : true
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
        in: [['optional_int32'], []],
        out: ['optional_int32'],
      },
      {
        in: [['optional_int32'], ['optional_int32']],
        out: ['optional_int32'],
      },
      {
        in: [['optional_int32'], ['optional_float'], ['optional_string']],
        out: ['optional_float', 'optional_int32', 'optional_string'],
      },
      {
        in: [['child.child.payload'], ['child.child.payload']],
        out: ['child.child.payload'],
      },
      {
        in: [['child.child.payload.map_int32_timestamp'], ['child.child.payload']],
        out: ['child.child.payload'],
      },
      {
        in: [
          ['child.payload.map_int32_timestamp.*.seconds'],
          ['child.payload.map_int32_timestamp.*.nanos'],
        ],
        out: [
          'child.payload.map_int32_timestamp.*.nanos',
          'child.payload.map_int32_timestamp.*.seconds',
        ],
      },
      {
        in: [
          ['child.payload.repeated_timestamp.*.seconds'],
          ['child.payload.repeated_timestamp.*.nanos'],
        ],
        out: [
          'child.payload.repeated_timestamp.*.nanos',
          'child.payload.repeated_timestamp.*.seconds',
        ],
      },
    ];

    for (const tc of testCases) {
      it(`merges field masks ${JSON.stringify(tc.in)} to ${JSON.stringify(tc.out)}`, () => {
        const merged = mergeFieldMasks(...tc.in.map((m) => create(FieldMaskSchema, { paths: m })));
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
        in: [['optional_int32'], []],
        out: [],
      },
      {
        in: [['optional_int32'], ['optional_int32']],
        out: ['optional_int32'],
      },
      {
        in: [['child.child.payload'], ['child.child.payload']],
        out: ['child.child.payload'],
      },
      {
        in: [['child.child.payload.map_int32_timestamp'], ['child.child.payload']],
        out: ['child.child.payload.map_int32_timestamp'],
      },
      {
        in: [['a', 'b'], ['b.b'], ['b'], ['b', 'a.A'], ['b', 'c', 'c.a', 'c.b']],
        out: ['b.b'],
      },
      {
        in: [
          ['child.payload.repeated_timestamp.*.seconds'],
          ['child.payload.repeated_timestamp.*.nanos'],
        ],
        out: [],
      },
    ];
    for (const tc of testCases) {
      it(`intersects field masks ${JSON.stringify(tc.in)} to ${JSON.stringify(tc.out)}`, () => {
        const intersected = intersectFieldMasks(
          ...tc.in.map((m) => create(FieldMaskSchema, { paths: m }))
        );
        expect(intersected).toEqual(create(FieldMaskSchema, { paths: tc.out }));
      });
    }
  });
});
