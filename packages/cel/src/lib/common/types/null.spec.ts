import { NullValueSchema } from '@bufbuild/protobuf/wkt';
import { BoolRefVal } from './bool.js';
import { ErrorRefVal } from './error.js';
import { NullRefVal } from './null.js';
import { StringRefVal } from './string.js';
import { NullType, StringType, TimestampType, TypeType } from './types.js';

describe('null', () => {
  it('nullConvertToNative', () => {
    const tests = [
      {
        input: new NullRefVal(),
        type: Object,
        want: null,
      },
      {
        input: new NullRefVal(),
        type: BigInt,
        want: BigInt(0),
      },
      // {
      //   input: new NullRefVal(),
      //   type: AnySchema,
      //   want: anyPack(NullValueSchema as unknown as DescMessage, NULL_VALUE),
      // },
      {
        input: new NullRefVal(),
        type: NullValueSchema,
        want: new NullRefVal(),
      },
      {
        input: new NullRefVal(),
        type: String,
        want: ErrorRefVal.nativeTypeConversionError(new NullRefVal(), String),
      },
    ];
    for (const test of tests) {
      expect(test.input.convertToNative(test.type)).toEqual(test.want);
    }
  });

  it('nullConvertToType', () => {
    const tests = [
      {
        input: new NullRefVal(),
        type: NullType,
        want: new NullRefVal(),
      },
      {
        input: new NullRefVal(),
        type: StringType,
        want: new StringRefVal('null'),
      },
      {
        input: new NullRefVal(),
        type: TypeType,
        want: NullType,
      },
      {
        input: new NullRefVal(),
        type: TimestampType,
        want: ErrorRefVal.typeConversionError(new NullRefVal(), TimestampType),
      },
    ];
    for (const test of tests) {
      expect(test.input.convertToType(test.type)).toStrictEqual(test.want);
    }
  });

  it('nullEqual', () => {
    const tests = [
      {
        input: new NullRefVal(),
        other: new NullRefVal(),
        want: new BoolRefVal(true),
      },
      {
        input: new NullRefVal(),
        other: new StringRefVal('null'),
        want: new BoolRefVal(false),
      },
    ];
    for (const test of tests) {
      expect(test.input.equal(test.other)).toStrictEqual(test.want);
    }
  });

  it('nullIsZeroValue', () => {
    expect(new NullRefVal().isZeroValue()).toEqual(true);
  });
});
