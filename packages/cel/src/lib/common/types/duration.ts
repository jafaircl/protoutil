/* eslint-disable no-case-declarations */
import { clone } from '@bufbuild/protobuf';
import { AnySchema, Duration, DurationSchema, anyPack } from '@bufbuild/protobuf/wkt';
import {
  duration,
  durationFromNanos,
  durationNanos,
  isValidDuration,
  isValidTimestamp,
  timestampFromNanos,
  timestampNanos,
} from '@protoutil/core';
import {
  TIME_GET_HOURS_OVERLOAD,
  TIME_GET_MILLISECONDS_OVERLOAD,
  TIME_GET_MINUTES_OVERLOAD,
  TIME_GET_SECONDS_OVERLOAD,
} from '../overloads.js';
import { RefType, RefVal } from '../ref/reference.js';
import { BoolRefVal } from './bool.js';
import { ErrorRefVal } from './error.js';
import { IntRefVal, MAX_INT64, MIN_INT64 } from './int.js';
import { NativeType } from './native.js';
import { StringRefVal } from './string.js';
import { TimestampRefVal } from './timestamp.js';
import { Comparer } from './traits/comparer.js';
import { Adder, Negater, Subtractor } from './traits/math.js';
import { Receiver } from './traits/receiver.js';
import { Zeroer } from './traits/zeroer.js';
import { DurationType, IntType, StringType, TimestampType, TypeType, UintType } from './types.js';
import { UintRefVal } from './uint.js';

export function durationFromSeconds(seconds: number) {
  return duration(BigInt(Math.trunc(seconds)), Math.trunc((seconds % 1) * 1e9));
}

export function durationToSeconds(duration: Duration) {
  return Number(duration.seconds) + duration.nanos * 1e-9;
}

export class DurationRefVal
  implements RefVal, Adder, Comparer, Negater, Receiver, Subtractor, Zeroer
{
  // This has to be a TS private field instead of a # private field because
  // otherwise the tests will not be able to access it to check for equality.
  // TODO: do we want to alter the tests to use the getter instead?
  private readonly _value: Duration;

  constructor(value: Duration) {
    this._value = value;
  }

  static durationGetHours(duration: Duration) {
    const nanos = durationNanos(duration);
    return new IntRefVal(nanos / BigInt(1e9 * 60 * 60));
  }

  static durationGetMinutes(duration: Duration) {
    const nanos = durationNanos(duration);
    return new IntRefVal(nanos / BigInt(1e9 * 60));
  }

  static durationGetSeconds(duration: Duration) {
    const nanos = durationNanos(duration);
    return new IntRefVal(nanos / BigInt(1e9));
  }

  static durationGetMilliseconds(duration: Duration) {
    const nanos = durationNanos(duration);
    return new IntRefVal(nanos / BigInt(1e6));
  }

  static Overloads = new Map([
    [TIME_GET_HOURS_OVERLOAD, DurationRefVal.durationGetHours],
    [TIME_GET_MINUTES_OVERLOAD, DurationRefVal.durationGetMinutes],
    [TIME_GET_SECONDS_OVERLOAD, DurationRefVal.durationGetSeconds],
    [TIME_GET_MILLISECONDS_OVERLOAD, DurationRefVal.durationGetMilliseconds],
  ]);

  convertToNative(type: NativeType) {
    switch (type) {
      case BigInt:
        return durationNanos(this._value);
      case String:
        return `${durationToSeconds(this._value)}s`;
      case AnySchema:
        return anyPack(DurationSchema, this._value);
      case DurationSchema:
        return clone(DurationSchema, this._value);
      default:
        return ErrorRefVal.nativeTypeConversionError(this, type);
    }
  }

  convertToType(type: RefType): RefVal {
    switch (type) {
      case DurationType:
        return new DurationRefVal(this._value);
      case IntType:
        return new IntRefVal(durationNanos(this._value));
      case StringType:
        return new StringRefVal(`${durationToSeconds(this._value)}s`);
      case TypeType:
        return DurationType;
      case UintType:
        return new UintRefVal(durationNanos(this._value));
      default:
        return ErrorRefVal.typeConversionError(this, type);
    }
  }

  equal(other: RefVal): RefVal {
    switch (other.type()) {
      case DurationType:
        return new BoolRefVal(
          this._value.seconds === other.value().seconds && this._value.nanos === other.value().nanos
        );
      default:
        return BoolRefVal.False;
    }
  }

  type(): RefType {
    return DurationType;
  }

  value() {
    return this._value;
  }

  add(other: RefVal): RefVal {
    switch (other.type()) {
      case DurationType:
        const thisNanos = durationNanos(this._value);
        const otherNanos = durationNanos(other.value());
        if (
          (otherNanos > 0 && thisNanos > MAX_INT64 - BigInt(otherNanos)) ||
          (otherNanos < 0 && thisNanos < MIN_INT64 - BigInt(otherNanos))
        ) {
          return ErrorRefVal.errIntOverflow;
        }
        return new DurationRefVal(durationFromNanos(thisNanos + otherNanos));
      case TimestampType:
        const _durationNanos = durationNanos(this._value);
        const tsNanos = timestampNanos(other.value());
        const ts = timestampFromNanos(_durationNanos + tsNanos);
        if (!isValidTimestamp(ts)) {
          return ErrorRefVal.errTimestampOutOfRange;
        }
        return new TimestampRefVal(ts);
      // if (
      //   (_durationNanos > 0 && tsNanos > MAX_INT64 * BigInt(1e9) - _durationNanos) ||
      //   (_durationNanos < 0 && tsNanos < MIN_INT64 * BigInt(1e9) - _durationNanos)
      // ) {
      //   return ErrorRefVal.errIntOverflow;
      // }
      // const ts = timestampFromNanos(tsNanos + _durationNanos);
      // if (ts.seconds < MIN_UNIX_TIME || ts.seconds > MAX_UNIX_TIME) {
      //   return ErrorRefVal.errTimestampOverflow;
      // }
      // return new TimestampRefVal(ts);
      default:
        return ErrorRefVal.maybeNoSuchOverload(other);
    }
  }

  compare(other: RefVal): RefVal {
    switch (other.type()) {
      case DurationType:
        const d1 = durationNanos(this._value);
        const d2 = durationNanos(other.value());
        if (d1 < d2) {
          return IntRefVal.IntNegOne;
        }
        if (d1 > d2) {
          return IntRefVal.IntOne;
        }
        return IntRefVal.IntZero;
      default:
        return ErrorRefVal.maybeNoSuchOverload(other);
    }
  }

  negate(): RefVal {
    const nanos = durationNanos(this._value);
    if (nanos === MIN_INT64) {
      return ErrorRefVal.errIntOverflow;
    }
    return new DurationRefVal(durationFromNanos(-nanos));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  receive(fn: string, overload: string, args: RefVal[]): RefVal {
    const f = DurationRefVal.Overloads.get(fn);
    if (f) {
      return f(this._value);
    }
    return ErrorRefVal.errNoSuchOverload;
  }

  subtract(subtrahend: RefVal): RefVal {
    switch (subtrahend.type()) {
      case DurationType:
        const thisNanos = durationNanos(this._value);
        const otherNanos = durationNanos(subtrahend.value());
        const duration = durationFromNanos(thisNanos - otherNanos);
        if (!isValidDuration(duration)) {
          return ErrorRefVal.errDurationOutOfRange;
        }
        return new DurationRefVal(duration);
      default:
        return ErrorRefVal.maybeNoSuchOverload(subtrahend);
    }
  }

  isZeroValue(): boolean {
    return durationNanos(this._value) === BigInt(0);
  }

  toString() {
    return `${durationToSeconds(this._value)}s`;
  }
}
