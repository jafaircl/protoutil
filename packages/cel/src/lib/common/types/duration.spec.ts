import { anyPack, AnySchema, DurationSchema } from '@bufbuild/protobuf/wkt';
import { duration, durationFromNanos, MAX_DURATION, MIN_DURATION } from '@protoutil/core';
import {
  DURATION_TO_HOURS_OVERLOAD,
  DURATION_TO_MILLISECONDS_OVERLOAD,
  DURATION_TO_MINUTES_OVERLOAD,
  DURATION_TO_SECONDS_OVERLOAD,
  TIME_GET_HOURS_OVERLOAD,
  TIME_GET_MILLISECONDS_OVERLOAD,
  TIME_GET_MINUTES_OVERLOAD,
  TIME_GET_SECONDS_OVERLOAD,
} from '../overloads.js';
import { BoolRefVal } from './bool.js';
import { DurationRefVal } from './duration.js';
import { ErrorRefVal } from './error.js';
import { IntRefVal, MIN_INT64 } from './int.js';
import { StringRefVal } from './string.js';
import { BoolType, DurationType, IntType, StringType, TypeType, UintType } from './types.js';
import { UintRefVal } from './uint.js';

describe('duration', () => {
  it('convertDurationValueToNative', () => {
    const tests = [
      {
        value: new DurationRefVal(duration(BigInt(42), 1234)),
        type: BigInt,
        want: BigInt(42 * 1e9) + BigInt(1234),
      },
      {
        value: new DurationRefVal(duration(BigInt(867), 5309)),
        type: AnySchema,
        want: anyPack(DurationSchema, duration(BigInt(867), 5309)),
      },
      {
        value: new DurationRefVal(duration(BigInt(776), 2323)),
        type: DurationSchema,
        want: duration(BigInt(776), 2323),
      },
      {
        value: new DurationRefVal(duration(BigInt(42), 1234)),
        type: String,
        want: `42.000001234s`,
      },
      {
        value: new DurationRefVal(duration(BigInt(42), 1234)),
        type: Boolean,
        want: ErrorRefVal.nativeTypeConversionError(
          new DurationRefVal(duration(BigInt(42), 1234)),
          Boolean
        ),
      },
    ];
    for (const test of tests) {
      expect(test.value.convertToNative(test.type)).toStrictEqual(test.want);
    }
  });

  it('convertDurationValueToType', () => {
    const tests = [
      {
        value: new DurationRefVal(duration(BigInt(42))),
        type: StringType,
        want: new StringRefVal('42s'),
      },
      {
        value: new DurationRefVal(duration(BigInt(42), 1234)),
        type: StringType,
        want: new StringRefVal('42.000001234s'),
      },
      {
        value: new DurationRefVal(duration(BigInt(42), 1234)),
        type: IntType,
        want: new IntRefVal(BigInt(42000001234)),
      },
      {
        value: new DurationRefVal(duration(BigInt(42), 1234)),
        type: DurationType,
        want: new DurationRefVal(duration(BigInt(42), 1234)),
      },
      {
        value: new DurationRefVal(duration(BigInt(42), 1234)),
        type: TypeType,
        want: DurationType,
      },
      {
        value: new DurationRefVal(duration(BigInt(42), 1234)),
        type: UintType,
        want: new UintRefVal(BigInt(42 * 1e9) + BigInt(1234)),
      },
      {
        value: new DurationRefVal(duration(BigInt(42), 1234)),
        type: BoolType,
        want: ErrorRefVal.typeConversionError(
          new DurationRefVal(duration(BigInt(42), 1234)),
          BoolType
        ),
      },
    ];
    for (const test of tests) {
      expect(test.value.convertToType(test.type)).toStrictEqual(test.want);
    }
  });

  it('equalDurationValue', () => {
    expect(
      new DurationRefVal(duration(BigInt(42))).equal(new DurationRefVal(duration(BigInt(42))))
    ).toStrictEqual(new BoolRefVal(true));
    expect(
      new DurationRefVal(duration(BigInt(42))).equal(new DurationRefVal(duration(BigInt(43))))
    ).toStrictEqual(new BoolRefVal(false));
    expect(new DurationRefVal(duration(BigInt(42))).equal(new BoolRefVal(true))).toStrictEqual(
      BoolRefVal.False
    );
  });

  it('addDurationValue', () => {
    expect(
      new DurationRefVal(duration(BigInt(42))).add(new DurationRefVal(duration(BigInt(43))))
    ).toStrictEqual(new DurationRefVal(duration(BigInt(85))));
    expect(
      new DurationRefVal(MAX_DURATION).add(new DurationRefVal(duration(BigInt(0), 1)))
    ).toStrictEqual(ErrorRefVal.errIntOverflow);
    expect(
      new DurationRefVal(MAX_DURATION).add(new DurationRefVal(duration(BigInt(1))))
    ).toStrictEqual(ErrorRefVal.errIntOverflow);
    expect(
      new DurationRefVal(MIN_DURATION).add(new DurationRefVal(duration(BigInt(0), -1)))
    ).toStrictEqual(ErrorRefVal.errIntOverflow);
    expect(
      new DurationRefVal(MIN_DURATION).add(new DurationRefVal(duration(BigInt(-1))))
    ).toStrictEqual(ErrorRefVal.errIntOverflow);
    // TODO: timestamps
  });

  it('compareDurationValue', () => {
    expect(
      new DurationRefVal(duration(BigInt(42))).compare(new DurationRefVal(duration(BigInt(42))))
    ).toStrictEqual(IntRefVal.IntZero);
    expect(
      new DurationRefVal(duration(BigInt(42))).compare(new DurationRefVal(duration(BigInt(43))))
    ).toStrictEqual(IntRefVal.IntNegOne);
    expect(
      new DurationRefVal(duration(BigInt(43))).compare(new DurationRefVal(duration(BigInt(42))))
    ).toStrictEqual(IntRefVal.IntOne);
  });

  it('negateDurationValue', () => {
    expect(new DurationRefVal(duration(BigInt(42))).negate()).toStrictEqual(
      new DurationRefVal(duration(BigInt(-42)))
    );
    expect(new DurationRefVal(durationFromNanos(MIN_INT64)).negate()).toStrictEqual(
      ErrorRefVal.errIntOverflow
    );
  });

  it('durationGetHours', () => {
    expect(
      new DurationRefVal(duration(BigInt(7506)))
        .receive(TIME_GET_HOURS_OVERLOAD, DURATION_TO_HOURS_OVERLOAD, [])
        .value()
    ).toStrictEqual(new IntRefVal(BigInt(2)).value());
  });

  it('durationGetMinutes', () => {
    expect(
      new DurationRefVal(duration(BigInt(7506)))
        .receive(TIME_GET_MINUTES_OVERLOAD, DURATION_TO_MINUTES_OVERLOAD, [])
        .value()
    ).toStrictEqual(new IntRefVal(BigInt(125)).value());
  });

  it('durationGetSeconds', () => {
    expect(
      new DurationRefVal(duration(BigInt(7506)))
        .receive(TIME_GET_SECONDS_OVERLOAD, DURATION_TO_SECONDS_OVERLOAD, [])
        .value()
    ).toStrictEqual(new IntRefVal(BigInt(7506)).value());
  });

  it('durationGetMilliseconds', () => {
    expect(
      new DurationRefVal(duration(BigInt(7506)))
        .receive(TIME_GET_MILLISECONDS_OVERLOAD, DURATION_TO_MILLISECONDS_OVERLOAD, [])
        .value()
    ).toStrictEqual(new IntRefVal(BigInt(7506000)).value());
  });

  it('subtractDurationValue', () => {
    expect(
      new DurationRefVal(duration(BigInt(42))).subtract(new DurationRefVal(duration(BigInt(43))))
    ).toStrictEqual(new DurationRefVal(duration(BigInt(-1))));
    expect(
      new DurationRefVal(MAX_DURATION).subtract(new DurationRefVal(duration(BigInt(0), -1)))
    ).toStrictEqual(ErrorRefVal.errDurationOutOfRange);
    expect(
      new DurationRefVal(MAX_DURATION).subtract(new DurationRefVal(duration(BigInt(-1))))
    ).toStrictEqual(ErrorRefVal.errDurationOutOfRange);
    expect(
      new DurationRefVal(MIN_DURATION).subtract(new DurationRefVal(duration(BigInt(0), 1)))
    ).toStrictEqual(ErrorRefVal.errDurationOutOfRange);
    expect(
      new DurationRefVal(MIN_DURATION).subtract(new DurationRefVal(duration(BigInt(1))))
    ).toStrictEqual(ErrorRefVal.errDurationOutOfRange);
    // TODO: timestamps
  });

  it('durationValueIsZero', () => {
    expect(new DurationRefVal(duration(BigInt(0))).isZeroValue()).toEqual(true);
    expect(new DurationRefVal(duration(BigInt(1))).isZeroValue()).toEqual(false);
  });
});
