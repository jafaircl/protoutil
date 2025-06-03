/* eslint-disable no-case-declarations */
import { clone, create } from '@bufbuild/protobuf';
import {
  AnySchema,
  Timestamp,
  TimestampSchema,
  anyPack,
  timestampDate,
  timestampFromDate,
} from '@bufbuild/protobuf/wkt';
import {
  durationFromNanos,
  durationNanos,
  isValidTimestamp,
  timestamp,
  timestampDateString,
  timestampFromNanos,
  timestampNanos,
} from '@protoutil/core';
import {
  TIME_GET_DATE_OVERLOAD,
  TIME_GET_DAY_OF_MONTH_OVERLOAD,
  TIME_GET_DAY_OF_WEEK_OVERLOAD,
  TIME_GET_DAY_OF_YEAR_OVERLOAD,
  TIME_GET_FULL_YEAR_OVERLOAD,
  TIME_GET_HOURS_OVERLOAD,
  TIME_GET_MILLISECONDS_OVERLOAD,
  TIME_GET_MINUTES_OVERLOAD,
  TIME_GET_MONTH_OVERLOAD,
  TIME_GET_SECONDS_OVERLOAD,
} from '../overloads.js';
import { isNil } from '../utils.js';
import { RefType, RefVal } from './../ref/reference.js';
import { BoolRefVal } from './bool.js';
import { DurationRefVal } from './duration.js';
import { ErrorRefVal } from './error.js';
import { IntRefVal, MAX_INT64, MIN_INT64 } from './int.js';
import { NativeType } from './native.js';
import { StringRefVal } from './string.js';
import { timeZoneOffsetMap } from './timezones.js';
import { Comparer } from './traits/comparer.js';
import { Adder, Subtractor } from './traits/math.js';
import { Receiver } from './traits/receiver.js';
import { Zeroer } from './traits/zeroer.js';
import { DurationType, IntType, StringType, TimestampType, TypeType } from './types.js';

/**
 * The number of seconds between year 1 and year 1970. This is borrowed from
 * https://golang.org/src/time/time.go.
 */
export const UNIX_TO_INTERNAL = BigInt(
  (1969 * 365 + 1969 / 4 - 1969 / 100 + 1969 / 400) * (60 * 60 * 24)
);

/**
 * Number of seconds between `0001-01-01T00:00:00Z` and the Unix epoch.
 */
export const MIN_UNIX_TIME = BigInt(-62135596800);

/**
 * Number of seconds between `9999-12-31T23:59:59.999999999Z` and the Unix
 * epoch.
 */
export const MAX_UNIX_TIME = BigInt(253402300799);

export function timestampFromSeconds(seconds: number) {
  return timestamp(BigInt(Math.trunc(seconds)), Math.trunc((seconds % 1) * 1e9));
}

export function timestampToSeconds(ts: Timestamp) {
  return Number(ts.seconds) + ts.nanos * 1e-9;
}

/**
 * Parses a string as an unsigned integer between min and max.
 *
 * @param s the string to parse
 * @param min the minimum value
 * @param max the maximum value
 * @returns the parsed integer or the min value if the string is invalid
 */
function parseUint(s: string, min: number, max: number) {
  const parsed = parseInt(s, 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return min;
  }
  return parsed;
}

export class TimestampRefVal implements RefVal, Adder, Comparer, Receiver, Subtractor, Zeroer {
  // This has to be a TS private field instead of a # private field because
  // otherwise the tests will not be able to access it to check for equality.
  // TODO: do we want to alter the tests to use the getter instead?
  private readonly _value: Timestamp;

  constructor(value: Timestamp) {
    this._value = value;
  }

  static getFullYear(ts: Timestamp) {
    const date = timestampDate(ts);
    return new IntRefVal(BigInt(date.getUTCFullYear()));
  }

  static getMonth(ts: Timestamp) {
    const date = timestampDate(ts);
    return new IntRefVal(BigInt(date.getUTCMonth()));
  }

  static getDayOfYear(ts: Timestamp) {
    const date = timestampDate(ts);
    const start = new Date(date.getUTCFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return new IntRefVal(BigInt(Math.floor(diff / (1000 * 60 * 60 * 24))));
  }

  static getDayOfMonthOneBased(ts: Timestamp) {
    const date = timestampDate(ts);
    return new IntRefVal(BigInt(date.getUTCDate()));
  }

  static getDayOfMonthZeroBased(ts: Timestamp) {
    const date = timestampDate(ts);
    return new IntRefVal(BigInt(date.getUTCDate() - 1));
  }

  static getDayOfWeek(ts: Timestamp) {
    const date = timestampDate(ts);
    return new IntRefVal(BigInt(date.getUTCDay()));
  }

  static getHours(ts: Timestamp) {
    const date = timestampDate(ts);
    return new IntRefVal(BigInt(date.getUTCHours()));
  }

  static getMinutes(ts: Timestamp) {
    const date = timestampDate(ts);
    return new IntRefVal(BigInt(date.getUTCMinutes()));
  }

  static getSeconds(ts: Timestamp) {
    const date = timestampDate(ts);
    return new IntRefVal(BigInt(date.getUTCSeconds()));
  }

  static getMilliseconds(ts: Timestamp) {
    const date = timestampDate(ts);
    return new IntRefVal(BigInt(date.getUTCMilliseconds()));
  }

  static timeZone(tz: RefVal, visitor: (ts: Timestamp) => RefVal): (ts: Timestamp) => RefVal {
    return (ts: Timestamp) => {
      switch (tz.type()) {
        case StringType:
          const date = timestampDate(ts);
          const tzStr = (tz as StringRefVal).value();
          // Handle cases where the timezone is an IANA timezone such as
          // "America/New_York".
          if (tzStr.indexOf('/') !== -1) {
            const offset = timeZoneOffsetMap.get(tzStr);
            if (isNil(offset)) {
              return new ErrorRefVal('invalid timezone');
            }
            date.setUTCMinutes(date.getUTCMinutes() + offset);
            return visitor(timestampFromDate(date));
          }
          // Otherwise, the timezone is an offset in in the format:
          // ^(+|-)(0[0-9]|1[0-4]):[0-5][0-9]$ such as "-07:00".
          const sign = tzStr[0] === '-' ? -1 : 1;
          const hr = parseUint(tzStr.slice(1, 3), 0, 23); // e.g., 07
          const mm = parseUint(tzStr.slice(4, 6), 0, 59); // e.g., 00
          const offset = sign * (hr * 60 + mm);
          date.setUTCMinutes(date.getUTCMinutes() + offset);
          return visitor(timestampFromDate(date));
        default:
          return ErrorRefVal.maybeNoSuchOverload(tz);
      }
    };
  }

  static ZeroArgOverloads = new Map([
    [TIME_GET_FULL_YEAR_OVERLOAD, TimestampRefVal.getFullYear],
    [TIME_GET_MONTH_OVERLOAD, TimestampRefVal.getMonth],
    [TIME_GET_DAY_OF_YEAR_OVERLOAD, TimestampRefVal.getDayOfYear],
    [TIME_GET_DATE_OVERLOAD, TimestampRefVal.getDayOfMonthOneBased],
    [TIME_GET_DAY_OF_MONTH_OVERLOAD, TimestampRefVal.getDayOfMonthZeroBased],
    [TIME_GET_DAY_OF_WEEK_OVERLOAD, TimestampRefVal.getDayOfWeek],
    [TIME_GET_HOURS_OVERLOAD, TimestampRefVal.getHours],
    [TIME_GET_MINUTES_OVERLOAD, TimestampRefVal.getMinutes],
    [TIME_GET_SECONDS_OVERLOAD, TimestampRefVal.getSeconds],
    [TIME_GET_MILLISECONDS_OVERLOAD, TimestampRefVal.getMilliseconds],
  ]);

  static OneArgOverloads = new Map([
    [
      TIME_GET_FULL_YEAR_OVERLOAD,
      (ts: Timestamp, tz: RefVal) => {
        return TimestampRefVal.timeZone(tz, TimestampRefVal.getFullYear)(ts);
      },
    ],
    [
      TIME_GET_MONTH_OVERLOAD,
      (ts: Timestamp, tz: RefVal) => {
        return TimestampRefVal.timeZone(tz, TimestampRefVal.getMonth)(ts);
      },
    ],
    [
      TIME_GET_DAY_OF_YEAR_OVERLOAD,
      (ts: Timestamp, tz: RefVal) => {
        return TimestampRefVal.timeZone(tz, TimestampRefVal.getDayOfYear)(ts);
      },
    ],
    [
      TIME_GET_DATE_OVERLOAD,
      (ts: Timestamp, tz: RefVal) => {
        return TimestampRefVal.timeZone(tz, TimestampRefVal.getDayOfMonthOneBased)(ts);
      },
    ],
    [
      TIME_GET_DAY_OF_MONTH_OVERLOAD,
      (ts: Timestamp, tz: RefVal) => {
        return TimestampRefVal.timeZone(tz, TimestampRefVal.getDayOfMonthZeroBased)(ts);
      },
    ],
    [
      TIME_GET_DAY_OF_WEEK_OVERLOAD,
      (ts: Timestamp, tz: RefVal) => {
        return TimestampRefVal.timeZone(tz, TimestampRefVal.getDayOfWeek)(ts);
      },
    ],
    [
      TIME_GET_HOURS_OVERLOAD,
      (ts: Timestamp, tz: RefVal) => {
        return TimestampRefVal.timeZone(tz, TimestampRefVal.getHours)(ts);
      },
    ],
    [
      TIME_GET_MINUTES_OVERLOAD,
      (ts: Timestamp, tz: RefVal) => {
        return TimestampRefVal.timeZone(tz, TimestampRefVal.getMinutes)(ts);
      },
    ],
    [
      TIME_GET_SECONDS_OVERLOAD,
      (ts: Timestamp, tz: RefVal) => {
        return TimestampRefVal.timeZone(tz, TimestampRefVal.getSeconds)(ts);
      },
    ],
    [
      TIME_GET_MILLISECONDS_OVERLOAD,
      (ts: Timestamp, tz: RefVal) => {
        return TimestampRefVal.timeZone(tz, TimestampRefVal.getMilliseconds)(ts);
      },
    ],
  ]);

  convertToNative(type: NativeType) {
    switch (type) {
      // TODO: should we do bigints and numbers? The go and projectnessie java implementations do not but you can use convertToType to get an IntRefVal.
      case Date:
        return timestampDate(this._value);
      case String:
        return timestampDateString(this._value);
      case AnySchema:
        return anyPack(TimestampSchema, create(TimestampSchema, this._value));
      case TimestampSchema:
        return clone(TimestampSchema, this._value);
      default:
        return ErrorRefVal.nativeTypeConversionError(this, type);
    }
  }

  convertToType(type: RefType): RefVal {
    switch (type) {
      case IntType:
        return new IntRefVal(this._value.seconds);
      case StringType:
        return new StringRefVal(timestampDateString(this._value));
      case TimestampType:
        return new TimestampRefVal(this._value);
      case TypeType:
        return TimestampType;
      default:
        return ErrorRefVal.typeConversionError(this, type);
    }
  }

  equal(other: RefVal): RefVal {
    switch (other.type()) {
      case TimestampType:
        return new BoolRefVal(
          timestampNanos(this._value) === timestampNanos((other as TimestampRefVal)._value)
        );
      default:
        return BoolRefVal.False;
    }
  }

  type(): RefType {
    return TimestampType;
  }

  value() {
    return this._value;
  }

  add(other: RefVal): RefVal {
    switch (other.type()) {
      case DurationType:
        return (other as DurationRefVal).add(this);
      default:
        return ErrorRefVal.maybeNoSuchOverload(other);
    }
  }

  compare(other: RefVal): RefVal {
    switch (other.type()) {
      case TimestampType:
        const ts1 = timestampNanos(this._value);
        const ts2 = timestampNanos((other as TimestampRefVal).value());
        if (ts1 < ts2) {
          return IntRefVal.IntNegOne;
        }
        if (ts1 > ts2) {
          return IntRefVal.IntOne;
        }
        return IntRefVal.IntZero;
      default:
        return ErrorRefVal.maybeNoSuchOverload(other);
    }
  }

  receive(fn: string, overload: string, args: RefVal[]): RefVal {
    switch (args.length) {
      case 0:
        const zeroArgFn = TimestampRefVal.ZeroArgOverloads.get(fn);
        if (zeroArgFn) {
          return zeroArgFn(this._value);
        }
        break;
      case 1:
        const oneArgFn = TimestampRefVal.OneArgOverloads.get(fn);
        if (oneArgFn) {
          return oneArgFn(this._value, args[0]);
        }
        break;
      default:
        break;
    }
    return ErrorRefVal.maybeNoSuchOverload(this);
  }

  subtract(subtrahend: RefVal): RefVal {
    switch (subtrahend.type()) {
      case DurationType:
        const _durationNanos = durationNanos(subtrahend.value());
        const tsNanos = timestampNanos(this._value);
        const ts = timestampFromNanos(tsNanos - _durationNanos);
        if (!isValidTimestamp(ts)) {
          return ErrorRefVal.errTimestampOutOfRange;
        }
        return new TimestampRefVal(ts);
      case TimestampType:
        const otherNanos = timestampNanos((subtrahend as TimestampRefVal).value());
        const thisNanos = timestampNanos(this._value);
        if (
          (thisNanos < 0 && otherNanos > MAX_INT64 + thisNanos) ||
          (thisNanos > 0 && otherNanos < MIN_INT64 + thisNanos)
        ) {
          return ErrorRefVal.errDurationOverflow;
        }
        return new DurationRefVal(durationFromNanos(thisNanos - otherNanos));
      default:
        return ErrorRefVal.maybeNoSuchOverload(subtrahend);
    }
  }

  isZeroValue(): boolean {
    return timestampNanos(this._value) === BigInt(0);
  }

  toString() {
    return timestampDateString(this._value);
  }
}
