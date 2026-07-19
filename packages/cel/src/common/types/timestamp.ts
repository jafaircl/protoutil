import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import * as overloads from "../overloads.js";
import { Bool } from "./bool.js";
import { Duration, durationOf } from "./duration.js";
import { err, maybeNoSuchOverloadErr, wrapErr } from "./err.js";
import { Int, IntNegOne, IntOne, IntZero } from "./int.js";
import {
  addTimeDurationChecked,
  minUnixTime,
  subtractTimeChecked,
  subtractTimeDurationChecked,
} from "./overflow.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import { DurationType, IntType, StringType, TimestampType, TypeType } from "./types.js";

/**
 * Timestamp type implementation which supports add, compare, and subtract
 * operations. Timestamps are also capable of participating in dynamic
 * function dispatch to instance methods.
 */
export class Timestamp {
  constructor(
    private readonly secondsValue: bigint,
    private readonly nanosValue = 0,
  ) {}

  /** Add implements traits.Adder.Add. */
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

  /** Compare implements traits.Comparer.Compare. */
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

  /** ConvertToNative implements ref.Val.ConvertToNative. */
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === TimestampSchema) {
      return {
        $typeName: "google.protobuf.Timestamp",
        seconds: this.secondsValue,
        nanos: this.nanosValue,
      };
    }
    return { seconds: this.secondsValue, nanos: this.nanosValue };
  }

  /** ConvertToType implements ref.Val.ConvertToType. */
  public convertToType(typeValue: RefType): Val {
    switch (typeValue) {
      case StringType:
        return new CelString(timestampString(this.secondsValue, this.nanosValue));
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

  /** Equal implements ref.Val.Equal. */
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

  /** Receive implements traits.Receiver.Receive. */
  public receive(functionName: string, _overload: string, args: Val[]): Val {
    switch (args.length) {
      case 0:
        return timestampZeroArg(functionName, this.secondsValue, this.nanosValue);
      case 1:
        return timestampOneArg(functionName, this.secondsValue, this.nanosValue, args[0]!);
      default:
        return maybeNoSuchOverloadErr(this);
    }
  }

  /** Subtract implements traits.Subtractor.Subtract. */
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

  /** Type implements ref.Val.Type. */
  public type(): RefType {
    return TimestampType;
  }

  /** Value implements ref.Val.Value. */
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
    sb.push(`timestamp("${timestampString(this.secondsValue, this.nanosValue)}")`);
  }
}

/**
 * timestampOf adapts seconds and nanos into a CEL timestamp.
 */
export function timestampOf(seconds: bigint, nanos = 0): Timestamp {
  return new Timestamp(seconds, nanos);
}

function timestampZeroArg(functionName: string, seconds: bigint, nanos: number): Val {
  switch (functionName) {
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
      return timestampVisit(functionName, seconds, nanos);
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
  const parts = tz ? partsInTimezone(seconds, nanos, tz) : utcParts(seconds, nanos);
  switch (functionName) {
    case overloads.TimeGetFullYear:
      return new Int(BigInt(parts.year));
    case overloads.TimeGetMonth:
      return new Int(BigInt(parts.month - 1));
    case overloads.TimeGetDayOfYear:
      return new Int(BigInt(dayOfYear(parts.year, parts.month, parts.day) - 1));
    case overloads.TimeGetDate:
      return new Int(BigInt(parts.day));
    case overloads.TimeGetDayOfMonth:
      return new Int(BigInt(parts.day - 1));
    case overloads.TimeGetDayOfWeek:
      return new Int(BigInt(parts.weekday));
    case overloads.TimeGetHours:
      return new Int(BigInt(parts.hour));
    case overloads.TimeGetMinutes:
      return new Int(BigInt(parts.minute));
    case overloads.TimeGetSeconds:
      return new Int(BigInt(parts.second));
    case overloads.TimeGetMilliseconds:
      return new Int(BigInt(Math.trunc(nanos / 1_000_000)));
    default:
      return err("no such overload");
  }
}

function timestampString(seconds: bigint, nanos: number): string {
  const date = new Date(Number(seconds) * 1000);
  const year = `${date.getUTCFullYear()}`.padStart(4, "0");
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hours = `${date.getUTCHours()}`.padStart(2, "0");
  const minutes = `${date.getUTCMinutes()}`.padStart(2, "0");
  const secs = `${date.getUTCSeconds()}`.padStart(2, "0");
  if (nanos === 0) {
    return `${year}-${month}-${day}T${hours}:${minutes}:${secs}Z`;
  }
  return `${year}-${month}-${day}T${hours}:${minutes}:${secs}.${`${nanos}`.padStart(9, "0").replace(/0+$/, "")}Z`;
}

function utcParts(seconds: bigint, nanos: number) {
  const date = new Date(Number(seconds) * 1000 + Math.trunc(nanos / 1_000_000));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    weekday: date.getUTCDay(),
  };
}

function partsInTimezone(seconds: bigint, nanos: number, tz: string) {
  if (tz.includes(":")) {
    return offsetParts(seconds, nanos, tz);
  }
  const date = new Date(Number(seconds) * 1000 + Math.trunc(nanos / 1_000_000));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdayValue(parts.weekday ?? "Sun"),
  };
}

function offsetParts(seconds: bigint, nanos: number, tz: string) {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(tz);
  if (!match) {
    throw new globalThis.Error(`invalid timezone: ${tz}`);
  }
  const minutes = Number(match[3]);
  if (minutes < 0 || minutes > 59) {
    throw new globalThis.Error(`timezone offset minutes out of range [0, 59]: ${tz}`);
  }
  const hours = Number(match[2]);
  const offset = match[1] === "-" ? -(hours * 60 + minutes) : hours * 60 + minutes;
  return utcParts(seconds + BigInt(offset * 60), nanos);
}

function weekdayValue(value: string): number {
  switch (value) {
    case "Sun":
      return 0;
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    default:
      return 0;
  }
}

function dayOfYear(year: number, month: number, day: number): number {
  const current = Date.UTC(year, month - 1, day);
  const start = Date.UTC(year, 0, 1);
  return Math.floor((current - start) / 86_400_000) + 1;
}
