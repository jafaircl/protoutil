import { create } from '@bufbuild/protobuf';
import { AnySchema, Int32ValueSchema, Int64ValueSchema, anyPack } from '@bufbuild/protobuf/wkt';
import { timestamp } from '@protoutil/core';
import { BoolRefVal } from './bool.js';
import { DoubleRefVal } from './double.js';
import { ErrorRefVal } from './error.js';
import { IntRefVal, MAX_INT64, MIN_INT64 } from './int.js';
import { StringRefVal } from './string.js';
import { MAX_UNIX_TIME, MIN_UNIX_TIME, TimestampRefVal } from './timestamp.js';
import { DoubleType, IntType, StringType, TimestampType, TypeType, UintType } from './types.js';
import { UintRefVal } from './uint.js';

describe('int', () => {
  it('convertInt64ValueToNative - js BigInt', () => {
    const value = new IntRefVal(BigInt(42));
    expect(value.convertToNative(BigInt)).toEqual(BigInt(42));
  });

  it('convertInt64ValueToNative - anyPack', () => {
    const value = new IntRefVal(BigInt(-42));
    const packed = anyPack(Int64ValueSchema, create(Int64ValueSchema, { value: BigInt(-42) }));
    expect(value.convertToNative(AnySchema)).toEqual(packed);
  });

  it('convertInt64ValueToNative - int64 wrapper', () => {
    const value = new IntRefVal(BigInt(30000000));
    expect(value.convertToNative(Int64ValueSchema)).toEqual(
      create(Int64ValueSchema, { value: BigInt(30000000) })
    );
    // Value errors
    expect(new IntRefVal(MAX_INT64 + BigInt(1)).convertToNative(Int64ValueSchema)).toEqual(
      ErrorRefVal.errIntOverflow
    );
    expect(new IntRefVal(MIN_INT64 - BigInt(1)).convertToNative(Int64ValueSchema)).toEqual(
      ErrorRefVal.errIntOverflow
    );
  });

  it('convertInt64ValueToNative - int32 wrapper', () => {
    const value = new IntRefVal(BigInt(7976931348623157));
    expect(value.convertToNative(Int32ValueSchema)).toEqual(
      create(Int32ValueSchema, { value: 7976931348623157 })
    );
    // Value errors
    expect(
      new IntRefVal(BigInt(Number.MAX_SAFE_INTEGER + 1)).convertToNative(Int32ValueSchema)
    ).toEqual(ErrorRefVal.errIntOverflow);
    expect(
      new IntRefVal(BigInt(Number.MIN_SAFE_INTEGER - 1)).convertToNative(Int32ValueSchema)
    ).toEqual(ErrorRefVal.errIntOverflow);
  });

  it('convertInt64ValueToNative - invalid type', () => {
    const value = new IntRefVal(BigInt(-314159));
    expect(value.convertToNative(Boolean)).toEqual(
      ErrorRefVal.nativeTypeConversionError(value, Boolean)
    );
  });

  it('convertInt64ValueToType', () => {
    const tests = [
      {
        in: new IntRefVal(BigInt(42)),
        type: TypeType,
        out: IntType,
      },
      {
        in: new IntRefVal(BigInt(42)),
        type: IntType,
        out: new IntRefVal(BigInt(42)),
      },
      {
        in: new IntRefVal(BigInt(42)),
        type: UintType,
        out: new UintRefVal(BigInt(42)),
      },
      {
        in: new IntRefVal(BigInt(-42)),
        type: UintType,
        out: ErrorRefVal.errUintOverflow,
      },
      {
        in: new IntRefVal(BigInt(42)),
        type: DoubleType,
        out: new DoubleRefVal(42),
      },
      {
        in: new IntRefVal(BigInt(-42)),
        type: StringType,
        out: new StringRefVal('-42'),
      },
      {
        in: new IntRefVal(BigInt(946684800)),
        type: TimestampType,
        out: new TimestampRefVal(timestamp(BigInt(946684800))),
      },
      {
        in: new IntRefVal(MAX_UNIX_TIME + BigInt(1)),
        type: TimestampType,
        out: ErrorRefVal.errTimestampOverflow,
      },
      {
        in: new IntRefVal(MIN_UNIX_TIME - BigInt(1)),
        type: TimestampType,
        out: ErrorRefVal.errTimestampOverflow,
      },
    ];
    for (const test of tests) {
      expect(test.in.convertToType(test.type)).toStrictEqual(test.out);
    }
  });

  it('equalInt64Value', () => {
    const tests = [
      {
        a: new IntRefVal(BigInt(-10)),
        b: new IntRefVal(BigInt(-10)),
        out: new BoolRefVal(true),
      },
      {
        a: new IntRefVal(BigInt(10)),
        b: new IntRefVal(BigInt(-10)),
        out: new BoolRefVal(false),
      },
      {
        a: new IntRefVal(BigInt(10)),
        b: new UintRefVal(BigInt(10)),
        out: new BoolRefVal(true),
      },
      {
        a: new IntRefVal(BigInt(9)),
        b: new UintRefVal(BigInt(10)),
        out: new BoolRefVal(false),
      },
      {
        a: new IntRefVal(BigInt(10)),
        b: new DoubleRefVal(10),
        out: new BoolRefVal(true),
      },
      {
        a: new IntRefVal(BigInt(10)),
        b: new DoubleRefVal(-10.5),
        out: new BoolRefVal(false),
      },
      {
        a: new IntRefVal(BigInt(10)),
        b: new DoubleRefVal(NaN),
        out: new BoolRefVal(false),
      },
      {
        a: new IntRefVal(BigInt(10)),
        b: new StringRefVal('10'),
        out: new BoolRefVal(false),
      },
    ];
    for (const test of tests) {
      expect(test.a.equal(test.b)).toStrictEqual(test.out);
    }
  });

  it('isZeroInt64Value', () => {
    expect(new IntRefVal(BigInt(0)).isZeroValue()).toEqual(true);
    expect(new IntRefVal(BigInt(1)).isZeroValue()).toEqual(false);
  });

  it('addInt64Value', () => {
    expect(new IntRefVal(BigInt(1)).add(new IntRefVal(BigInt(2)))).toStrictEqual(
      new IntRefVal(BigInt(3))
    );
    expect(new IntRefVal(BigInt(1)).add(new StringRefVal('-4'))).toStrictEqual(
      ErrorRefVal.errNoSuchOverload
    );
    expect(new IntRefVal(MAX_INT64).add(new IntRefVal(BigInt(1)))).toStrictEqual(
      ErrorRefVal.errIntOverflow
    );
    expect(new IntRefVal(MIN_INT64).add(new IntRefVal(BigInt(-1)))).toStrictEqual(
      ErrorRefVal.errIntOverflow
    );
    expect(new IntRefVal(MAX_INT64 - BigInt(1)).add(new IntRefVal(BigInt(1)))).toStrictEqual(
      new IntRefVal(MAX_INT64)
    );
    expect(new IntRefVal(MIN_INT64 + BigInt(1)).add(new IntRefVal(BigInt(-1)))).toStrictEqual(
      new IntRefVal(MIN_INT64)
    );
  });

  it('compareInt64Value', () => {
    const tests = [
      {
        a: new IntRefVal(BigInt(42)),
        b: new IntRefVal(BigInt(42)),
        out: new IntRefVal(BigInt(0)),
      },
      {
        a: new IntRefVal(BigInt(42)),
        b: new UintRefVal(BigInt(42)),
        out: new IntRefVal(BigInt(0)),
      },
      {
        a: new IntRefVal(BigInt(42)),
        b: new DoubleRefVal(42),
        out: new IntRefVal(BigInt(0)),
      },
      {
        a: new IntRefVal(BigInt(-1300)),
        b: new IntRefVal(BigInt(204)),
        out: new IntRefVal(BigInt(-1)),
      },
      {
        a: new IntRefVal(BigInt(204)),
        b: new DoubleRefVal(204.1),
        out: new IntRefVal(BigInt(-1)),
      },
      {
        a: new IntRefVal(BigInt(1300)),
        b: new UintRefVal(MAX_INT64 + BigInt(1)),
        out: new IntRefVal(BigInt(-1)),
      },
      {
        a: new IntRefVal(BigInt(204)),
        b: new UintRefVal(BigInt(205)),
        out: new IntRefVal(BigInt(-1)),
      },
      {
        a: new IntRefVal(BigInt(204)),
        b: new DoubleRefVal(Number(MAX_INT64) + 1025.0),
        out: new IntRefVal(BigInt(-1)),
      },
      {
        a: new IntRefVal(BigInt(204)),
        b: new DoubleRefVal(NaN),
        out: new ErrorRefVal('NaN values cannot be ordered'),
      },
      {
        a: new IntRefVal(BigInt(204)),
        b: new IntRefVal(BigInt(-1300)),
        out: new IntRefVal(BigInt(1)),
      },
      {
        a: new IntRefVal(BigInt(204)),
        b: new UintRefVal(BigInt(10)),
        out: new IntRefVal(BigInt(1)),
      },
      {
        a: new IntRefVal(BigInt(204)),
        b: new DoubleRefVal(203.9),
        out: new IntRefVal(BigInt(1)),
      },
      {
        a: new IntRefVal(BigInt(204)),
        b: new DoubleRefVal(Number(MIN_INT64) - 1025.0),
        out: new IntRefVal(BigInt(1)),
      },
      {
        a: new IntRefVal(BigInt(1)),
        b: new StringRefVal('1'),
        out: ErrorRefVal.errNoSuchOverload,
      },
    ];
    for (const test of tests) {
      expect(test.a.compare(test.b)).toStrictEqual(test.out);
    }
  });

  it('divideInt64Value', () => {
    expect(new IntRefVal(BigInt(3)).divide(new IntRefVal(BigInt(2)))).toStrictEqual(
      new IntRefVal(BigInt(1))
    );
    expect(new IntRefVal(BigInt(3)).divide(new IntRefVal(BigInt(0)))).toStrictEqual(
      ErrorRefVal.errDivideByZero
    );
    expect(new IntRefVal(MIN_INT64).divide(new IntRefVal(BigInt(-1)))).toStrictEqual(
      ErrorRefVal.errIntOverflow
    );
  });

  it('moduloInt64Value', () => {
    expect(new IntRefVal(BigInt(21)).modulo(new IntRefVal(BigInt(2)))).toStrictEqual(
      new IntRefVal(BigInt(1))
    );
    expect(new IntRefVal(BigInt(21)).modulo(new IntRefVal(BigInt(0)))).toStrictEqual(
      ErrorRefVal.errModulusByZero
    );
    expect(new IntRefVal(MIN_INT64).modulo(new IntRefVal(BigInt(-1)))).toStrictEqual(
      ErrorRefVal.errIntOverflow
    );
  });

  it('multiplyInt64Value', () => {
    expect(new IntRefVal(BigInt(2)).multiply(new IntRefVal(BigInt(-2)))).toStrictEqual(
      new IntRefVal(BigInt(-4))
    );
    expect(new IntRefVal(MAX_INT64 / BigInt(2)).multiply(new IntRefVal(BigInt(3)))).toStrictEqual(
      ErrorRefVal.errIntOverflow
    );
    expect(new IntRefVal(MAX_INT64 / BigInt(2)).multiply(new IntRefVal(BigInt(2)))).toStrictEqual(
      new IntRefVal(MAX_INT64 - BigInt(1))
    );
    expect(new IntRefVal(MIN_INT64 / BigInt(2)).multiply(new IntRefVal(BigInt(2)))).toStrictEqual(
      new IntRefVal(MIN_INT64)
    );
    expect(new IntRefVal(MAX_INT64 / BigInt(2)).multiply(new IntRefVal(BigInt(-2)))).toStrictEqual(
      new IntRefVal(MIN_INT64 + BigInt(2))
    );
    expect(
      new IntRefVal((MIN_INT64 + BigInt(2)) / BigInt(2)).multiply(new IntRefVal(BigInt(-2)))
    ).toStrictEqual(new IntRefVal(MAX_INT64 - BigInt(1)));
    expect(new IntRefVal(MIN_INT64).multiply(new IntRefVal(BigInt(-1)))).toStrictEqual(
      ErrorRefVal.errIntOverflow
    );
  });

  it('negateInt64Value', () => {
    expect(new IntRefVal(BigInt(42)).negate()).toStrictEqual(new IntRefVal(BigInt(-42)));
    expect(new IntRefVal(MIN_INT64).negate()).toStrictEqual(ErrorRefVal.errIntOverflow);
    expect(new IntRefVal(MAX_INT64).negate()).toStrictEqual(new IntRefVal(MIN_INT64 + BigInt(1)));
  });

  it('subtractInt64Value', () => {
    expect(new IntRefVal(BigInt(4)).subtract(new IntRefVal(BigInt(-3)))).toStrictEqual(
      new IntRefVal(BigInt(7))
    );
    expect(new IntRefVal(MAX_INT64).subtract(new IntRefVal(BigInt(-1)))).toStrictEqual(
      ErrorRefVal.errIntOverflow
    );
    expect(new IntRefVal(MIN_INT64).subtract(new IntRefVal(BigInt(1)))).toStrictEqual(
      ErrorRefVal.errIntOverflow
    );
    expect(new IntRefVal(MAX_INT64 - BigInt(1)).subtract(new IntRefVal(BigInt(-1)))).toStrictEqual(
      new IntRefVal(MAX_INT64)
    );
    expect(new IntRefVal(MIN_INT64 + BigInt(1)).subtract(new IntRefVal(BigInt(1)))).toStrictEqual(
      new IntRefVal(MIN_INT64)
    );
  });
});
