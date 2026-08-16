import {
  AnySchema,
  anyPack,
  type Timestamp as TimestampMessage,
  TimestampSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import { timestampFromString, timestampToString } from "@protoutil/core/wkt";
import * as overloads from "../overloads.js";
import { anyValueType } from "./any-value.js";
import { Bool } from "./bool.js";
import { Duration, durationOf } from "./duration.js";
import { err, maybeNoSuchOverloadErr, wrapErr } from "./err.js";
import { Int, IntNegOne, IntOne, IntZero } from "./int.js";
import { nativeTypeName } from "./native.js";
import {
  addTimeDurationChecked,
  doubleToInt64Checked,
  maxUnixTime,
  minUnixTime,
  subtractTimeChecked,
  subtractTimeDurationChecked,
} from "./overflow.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import type { Adder, Comparer, Receiver, Subtractor } from "./traits/index.js";
import { DurationType, IntType, StringType, TimestampType, TypeType } from "./types.js";

/**
 * TimestampInTimezoneOptions configures a timestamp with the location carried by a native
 * time value.
 */
export interface TimestampInTimezoneOptions {
  /** seconds is the Unix timestamp in seconds. */
  seconds: bigint;
  /** nanos is the fractional nanosecond component. */
  nanos?: number;
  /** timezone is an IANA timezone name or cel-go-style numeric UTC offset. */
  timezone: string;
}

/**
 * TimestampZeroArgOptions configures a zero-argument timestamp receiver call.
 */
interface TimestampZeroArgOptions {
  /** functionName is the timestamp function being invoked. */
  functionName: string;
  /** seconds is the Unix timestamp in seconds. */
  seconds: bigint;
  /** nanos is the fractional nanosecond component. */
  nanos: number;
  /** timezone is the timestamp's native location when one is retained. */
  timezone?: string;
}

/**
 * Timestamp type implementation which supports add, compare, and subtract
 * operations. Timestamps are also capable of participating in dynamic
 * function dispatch to instance methods.
 */
export class Timestamp implements Val, Adder, Comparer, Receiver, Subtractor {
  /**
   * timezoneValue retains the native timestamp location used by legacy zero-argument functions.
   */
  private timezoneValue?: string;

  constructor(
    private readonly secondsValue: bigint,
    private readonly nanosValue = 0,
  ) {}
  public add(other: Val): Val {
    if (other.type() === DurationType && other instanceof Duration) {
      try {
        const value = addTimeDurationChecked(this.secondsValue, this.nanosValue, other.value());
        return timestampOf(value.seconds, value.nanos);
      } catch (error) {
        return wrapErr(error);
      }
    }
    return maybeNoSuchOverloadErr(other);
  }
  public compare(other: Val): Val {
    if (!(other instanceof Timestamp)) {
      return maybeNoSuchOverloadErr(other);
    }
    if (
      this.secondsValue < other.secondsValue ||
      (this.secondsValue === other.secondsValue && this.nanosValue < other.nanosValue)
    ) {
      return IntNegOne;
    }
    if (
      this.secondsValue > other.secondsValue ||
      (this.secondsValue === other.secondsValue && this.nanosValue > other.nanosValue)
    ) {
      return IntOne;
    }
    return IntZero;
  }
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === Timestamp || typeDesc === undefined) {
      return this;
    }
    if (typeDesc === Date) {
      return new Date(Number(this.secondsValue) * 1000 + Math.trunc(this.nanosValue / 1_000_000));
    }
    if (typeDesc === anyValueType || typeDesc === AnySchema) {
      return anyPack(TimestampSchema, {
        $typeName: TimestampSchema.typeName,
        ...this.value(),
      } as never);
    }
    if (typeDesc === TimestampSchema) {
      return { $typeName: TimestampSchema.typeName, ...this.value() };
    }
    if (typeDesc === ValueSchema) {
      return {
        $typeName: ValueSchema.typeName,
        kind: {
          case: "stringValue",
          value: timestampToString({
            $typeName: "google.protobuf.Timestamp",
            seconds: this.secondsValue,
            nanos: this.nanosValue,
          }),
        },
      };
    }
    throw new globalThis.Error(
      `type conversion error from '${TimestampType}' to '${nativeTypeName(typeDesc)}'`,
    );
  }
  public convertToType(typeValue: RefType): Val {
    const proto = {
      $typeName: "google.protobuf.Timestamp" as const,
      seconds: this.secondsValue,
      nanos: this.nanosValue,
    };
    switch (typeValue) {
      case StringType:
        return new CelString(timestampToString(proto));
      case IntType:
        return new Int(this.secondsValue);
      case TimestampType:
        return this;
      case TypeType:
        return TimestampType;
      default:
        return err(`type conversion error from '${TimestampType}' to '${typeValue.typeName()}'`);
    }
  }
  public equal(other: Val): Val {
    return new Bool(
      other instanceof Timestamp &&
        this.secondsValue === other.secondsValue &&
        this.nanosValue === other.nanosValue,
    );
  }

  /** IsZeroValue returns true if the timestamp is epoch 0. */
  public isZeroValue(): boolean {
    return this.secondsValue === minUnixTime && this.nanosValue === 0;
  }
  public receive(functionName: string, _overload: string, args: Val[]): Val {
    switch (args.length) {
      case 0:
        return timestampZeroArg({
          functionName,
          seconds: this.secondsValue,
          nanos: this.nanosValue,
          timezone: this.timezoneValue,
        });
      case 1:
        return timestampOneArg(functionName, this.secondsValue, this.nanosValue, args[0]!);
      default:
        return maybeNoSuchOverloadErr(this);
    }
  }
  public subtract(subtrahend: Val): Val {
    if (subtrahend.type() === DurationType && subtrahend instanceof Duration) {
      try {
        const value = subtractTimeDurationChecked(
          this.secondsValue,
          this.nanosValue,
          subtrahend.value(),
        );
        return timestampOf(value.seconds, value.nanos);
      } catch (error) {
        return wrapErr(error);
      }
    }
    if (subtrahend.type() === TimestampType && subtrahend instanceof Timestamp) {
      try {
        return durationOf(
          subtractTimeChecked(
            this.secondsValue,
            this.nanosValue,
            subtrahend.secondsValue,
            subtrahend.nanosValue,
          ),
        );
      } catch (error) {
        return wrapErr(error);
      }
    }
    return maybeNoSuchOverloadErr(subtrahend);
  }

  /**
   * withTimezone returns an equivalent timestamp carrying a native timezone location.
   */
  public withTimezone(timezone: string): Timestamp {
    const timestamp = new Timestamp(this.secondsValue, this.nanosValue);
    timestamp.timezoneValue = timezone;
    return timestamp;
  }
  public type(): RefType {
    return TimestampType;
  }
  public value(): { seconds: bigint; nanos: number } {
    return { seconds: this.secondsValue, nanos: this.nanosValue };
  }

  /** Seconds returns the unix seconds component. */
  public seconds(): bigint {
    return this.secondsValue;
  }

  /** Nanos returns the nanos component. */
  public nanos(): number {
    return this.nanosValue;
  }

  /** Format appends the human-readable representation. */
  public format(sb: string[]): void {
    sb.push(
      `timestamp("${timestampToString({
        $typeName: "google.protobuf.Timestamp",
        seconds: this.secondsValue,
        nanos: this.nanosValue,
      })}")`,
    );
  }
}

/**
 * timestampOf adapts seconds and nanos into a CEL timestamp.
 */
export function timestampOf(seconds: bigint, nanos = 0): Timestamp {
  return new Timestamp(seconds, nanos);
}

/**
 * timestampInTimezone adapts an instant and its native timezone location into a CEL timestamp.
 */
export function timestampInTimezone(options: TimestampInTimezoneOptions): Timestamp {
  return timestampOf(options.seconds, options.nanos).withTimezone(options.timezone);
}

/**
 * isStrictRFC3339 reports whether a string satisfies CEL's strict RFC 3339 timestamp grammar.
 *
 * Calendar-specific validation remains delegated to the protobuf timestamp parser.
 */
export function isStrictRFC3339(value: string): boolean {
  return /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])[Tt](?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
    value,
  );
}

/**
 * parseTimestamp parses a timestamp from the supported types and representations:
 *
 * - a CEL `Timestamp`, a `google.protobuf.Timestamp` message, or a native `Date`
 * - RFC 3339 / RFC 3339 Nano strings (for example `"2023-01-01T00:00:00Z"`)
 * - Unix epoch seconds as a `bigint`
 * - Unix epoch seconds as a `number`, whose fractional part becomes nanoseconds
 * - strings holding either of the two numeric forms
 *
 * Timestamps outside the supported range `[minUnixTime, maxUnixTime]` are rejected.
 *
 * This is the port of upstream's `ParseTimestamp`. Go's distinct `int`/`int32`/`int64` and
 * `float32`/`float64` cases collapse into `bigint` and `number`, and `json.Number` has no
 * TypeScript analogue — a numeric string reaches the same parsing path.
 *
 * @throws {Error} when the value is not a supported type, is malformed, or is out of range.
 */
export function parseTimestamp(value: unknown): Timestamp {
  if (value === null || value === undefined) {
    throw new Error("invalid timestamp: nil value");
  }
  if (value instanceof Timestamp) {
    return validateTimestampRange(value);
  }
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    if (Number.isNaN(milliseconds)) {
      throw new Error("invalid timestamp: invalid Date");
    }
    // Date only carries millisecond resolution, and its epoch division must floor so that
    // pre-epoch instants keep a non-negative nanosecond remainder.
    const seconds = BigInt(Math.floor(milliseconds / 1000));
    return validateTimestampRange(
      timestampOf(seconds, Number(BigInt(milliseconds) - seconds * 1000n) * 1_000_000),
    );
  }
  if (isTimestampMessage(value)) {
    return validateTimestampRange(timestampOf(value.seconds, value.nanos));
  }
  if (typeof value === "bigint") {
    return validateTimestampRange(timestampOf(value));
  }
  if (typeof value === "number") {
    return timestampFromEpochSeconds(value);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") {
      throw new Error("invalid RFC 3339 timestamp: ''");
    }
    if (isStrictRFC3339(text)) {
      const parsed = timestampFromString(text);
      return validateTimestampRange(timestampOf(parsed.seconds, parsed.nanos));
    }
    if (/^[+-]?\d+$/.test(text)) {
      return validateTimestampRange(timestampOf(BigInt(text)));
    }
    const epochSeconds = Number(text);
    if (Number.isFinite(epochSeconds)) {
      return timestampFromEpochSeconds(epochSeconds);
    }
    throw new Error(`unsupported timestamp format: "${text}"`);
  }
  throw new Error(`unsupported timestamp type: ${nativeTypeName(value)}`);
}

/**
 * isTimestampMessage reports whether a value is a `google.protobuf.Timestamp` message.
 */
function isTimestampMessage(value: unknown): value is TimestampMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "$typeName" in value &&
    (value as { $typeName: unknown }).$typeName === TimestampSchema.typeName
  );
}

/**
 * timestampFromEpochSeconds splits fractional Unix epoch seconds into seconds and nanoseconds.
 */
function timestampFromEpochSeconds(value: number): Timestamp {
  const seconds = doubleToInt64Checked(value);
  const nanos = Math.trunc((value - Number(seconds)) * 1e9);
  return validateTimestampRange(timestampOf(seconds, nanos));
}

/**
 * validateTimestampRange rejects timestamps outside the range CEL can represent.
 */
function validateTimestampRange(value: Timestamp): Timestamp {
  const seconds = value.seconds();
  if (seconds < minUnixTime || seconds > maxUnixTime) {
    throw new Error(`timestamp overflow: ${seconds}`);
  }
  return value;
}

function timestampZeroArg(options: TimestampZeroArgOptions): Val {
  switch (options.functionName) {
    case overloads.TimeGetFullYear:
    case overloads.TimeGetMonth:
    case overloads.TimeGetDayOfYear:
    case overloads.TimeGetDate:
    case overloads.TimeGetDayOfMonth:
    case overloads.TimeGetDayOfWeek:
    case overloads.TimeGetHours:
    case overloads.TimeGetMinutes:
    case overloads.TimeGetSeconds:
    case overloads.TimeGetMilliseconds:
      return timestampVisit(options.functionName, options.seconds, options.nanos, options.timezone);
    default:
      return err("no such overload");
  }
}

function timestampOneArg(functionName: string, seconds: bigint, nanos: number, tz: Val): Val {
  if (!(tz instanceof CelString)) {
    return maybeNoSuchOverloadErr(tz);
  }
  try {
    return timestampVisit(functionName, seconds, nanos, tz.value());
  } catch (error) {
    return wrapErr(error);
  }
}

function timestampVisit(functionName: string, seconds: bigint, nanos: number, tz?: string): Val {
  const zoned = timestampZonedValue(seconds, nanos, tz);
  switch (functionName) {
    case overloads.TimeGetFullYear:
      return new Int(BigInt(zoned.year));
    case overloads.TimeGetMonth:
      return new Int(BigInt(zoned.month - 1));
    case overloads.TimeGetDayOfYear:
      return new Int(BigInt(zoned.dayOfYear - 1));
    case overloads.TimeGetDate:
      return new Int(BigInt(zoned.day));
    case overloads.TimeGetDayOfMonth:
      return new Int(BigInt(zoned.day - 1));
    case overloads.TimeGetDayOfWeek:
      return new Int(BigInt(zoned.dayOfWeek % 7));
    case overloads.TimeGetHours:
      return new Int(BigInt(zoned.hour));
    case overloads.TimeGetMinutes:
      return new Int(BigInt(zoned.minute));
    case overloads.TimeGetSeconds:
      return new Int(BigInt(zoned.second));
    case overloads.TimeGetMilliseconds:
      return new Int(BigInt(Math.trunc(nanos / 1_000_000)));
    default:
      return err("no such overload");
  }
}

/**
 * timestampZonedValue resolves a timestamp into either an IANA time zone or a cel-go-style UTC offset.
 */
function timestampZonedValue(
  seconds: bigint,
  nanos: number,
  tz?: string,
): {
  year: number;
  month: number;
  dayOfYear: number;
  day: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  second: number;
} {
  if (tz === undefined) {
    return timestampZonedWithIntl(seconds, nanos, "UTC");
  }
  if (!tz.includes(":")) {
    return timestampZonedWithIntl(seconds, nanos, tz);
  }

  const offsetMinutes = parseTimezoneOffsetMinutes(tz);
  const epochMilliseconds = Number(seconds) * 1000 + Math.trunc(nanos / 1_000_000);
  const shifted = new Date(epochMilliseconds + offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    dayOfYear: dayOfYearUtc(shifted),
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

function timestampZonedWithIntl(
  seconds: bigint,
  nanos: number,
  timeZone: string,
): {
  year: number;
  month: number;
  dayOfYear: number;
  day: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Number(seconds) * 1000 + Math.trunc(nanos / 1_000_000)));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === type)?.value);
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const localDate = new Date(0);
  localDate.setUTCFullYear(year, month - 1, day);
  localDate.setUTCHours(0, 0, 0, 0);
  return {
    year,
    month,
    dayOfYear: dayOfYearUtc(localDate),
    day,
    dayOfWeek: localDate.getUTCDay() === 0 ? 7 : localDate.getUTCDay(),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

/**
 * parseTimezoneOffsetMinutes converts a cel-go-style numeric UTC offset into minutes east of UTC.
 */
function parseTimezoneOffsetMinutes(value: string): number {
  const match = /^([+-]?)(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid time zone specified: ${value}`);
  }
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    throw new Error(`Invalid time zone specified: ${value}`);
  }
  // The regex captures the sign separately, so `hours` is an unsigned magnitude here and the
  // upstream `hr < -23 || hr > 23` guard collapses to a single upper-bound check.
  if (hours > 23) {
    throw new Error(`timezone offset hours out of range [-23, 23]: ${value}`);
  }
  if (minutes < 0 || minutes > 59) {
    throw new Error(`timezone offset minutes out of range [0, 59]: ${value}`);
  }
  return sign * (hours * 60 + minutes);
}

/**
 * dayOfYearUtc computes the one-based UTC day-of-year for a shifted timestamp.
 */
function dayOfYearUtc(value: Date): number {
  const yearStart = Date.UTC(value.getUTCFullYear(), 0, 1);
  const currentDay = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  return Math.floor((currentDay - yearStart) / 86_400_000) + 1;
}
