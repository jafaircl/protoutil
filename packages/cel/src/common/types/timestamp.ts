import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import { timestampInstant, timestampToString } from "@protoutil/core/wkt";
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
import type { Adder, Comparer, Receiver, Subtractor } from "./traits/index.js";
import { DurationType, IntType, StringType, TimestampType, TypeType } from "./types.js";

/**
 * Timestamp type implementation which supports add, compare, and subtract
 * operations. Timestamps are also capable of participating in dynamic
 * function dispatch to instance methods.
 */
export class Timestamp implements Val, Adder, Comparer, Receiver, Subtractor {
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
    if (typeDesc === TimestampSchema) {
      return {
        $typeName: "google.protobuf.Timestamp",
        seconds: this.secondsValue,
        nanos: this.nanosValue,
      };
    }
    return { seconds: this.secondsValue, nanos: this.nanosValue };
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
        return timestampZeroArg(functionName, this.secondsValue, this.nanosValue);
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
  const zoned = timestampInstant({
    $typeName: "google.protobuf.Timestamp",
    seconds,
    nanos,
  }).toZonedDateTimeISO(tz ?? "UTC");
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
