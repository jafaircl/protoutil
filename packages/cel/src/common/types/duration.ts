import { DurationSchema } from "@bufbuild/protobuf/wkt";
import * as overloads from "../overloads.js";
import { Bool } from "./bool.js";
import { err, maybeNoSuchOverloadErr, wrapErr } from "./err.js";
import { Int, IntNegOne, IntOne, IntZero } from "./int.js";
import { addDurationChecked, negateDurationChecked, subtractDurationChecked } from "./overflow.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import { Timestamp } from "./timestamp.js";
import { DurationType, IntType, StringType, TimestampType, TypeType } from "./types.js";

/**
 * Duration type that implements ref.Val and supports add, compare, negate,
 * and subtract operators. This type is also a receiver which means it can
 * participate in dispatch to receiver functions.
 */
export class Duration {
  constructor(private readonly inner: bigint) {}

  /** Add implements traits.Adder.Add. */
  public add(other: Val): Val {
    if (other.type() === DurationType && other instanceof Duration) {
      try {
        return durationOf(addDurationChecked(this.inner, other.inner));
      } catch (error) {
        return wrapErr(error);
      }
    }
    if (other.type() === TimestampType && other instanceof Timestamp) {
      return other.add(this);
    }
    return maybeNoSuchOverloadErr(other);
  }

  /** Compare implements traits.Comparer.Compare. */
  public compare(other: Val): Val {
    if (!(other instanceof Duration)) {
      return maybeNoSuchOverloadErr(other);
    }
    if (this.inner < other.inner) {
      return IntNegOne;
    }
    if (this.inner > other.inner) {
      return IntOne;
    }
    return IntZero;
  }

  /** ConvertToNative implements ref.Val.ConvertToNative. */
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === DurationSchema) {
      return {
        $typeName: "google.protobuf.Duration",
        ...durationProto(this.inner),
      };
    }
    return this.inner;
  }

  /** ConvertToType implements ref.Val.ConvertToType. */
  public convertToType(typeValue: RefType): Val {
    switch (typeValue) {
      case StringType:
        return new CelString(durationString(this.inner));
      case IntType:
        return new Int(this.inner);
      case DurationType:
        return this;
      case TypeType:
        return DurationType;
      default:
        return err(`type conversion error from '${DurationType}' to '${typeValue.typeName()}'`);
    }
  }

  /** Equal implements ref.Val.Equal. */
  public equal(other: Val): Val {
    return new Bool(other instanceof Duration && this.inner === other.inner);
  }

  /** IsZeroValue returns true if the duration value is zero */
  public isZeroValue(): boolean {
    return this.inner === 0n;
  }

  /** Negate implements traits.Negater.Negate. */
  public negate(): Val {
    try {
      return durationOf(negateDurationChecked(this.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }

  /** Receive implements traits.Receiver.Receive. */
  public receive(functionName: string, _overload: string, args: Val[]): Val {
    if (args.length === 0) {
      switch (functionName) {
        case overloads.TimeGetHours:
          return durationGetHours(this);
        case overloads.TimeGetMinutes:
          return durationGetMinutes(this);
        case overloads.TimeGetSeconds:
          return durationGetSeconds(this);
        case overloads.TimeGetMilliseconds:
          return durationGetMilliseconds(this);
      }
    }
    return maybeNoSuchOverloadErr(this);
  }

  /** Subtract implements traits.Subtractor.Subtract. */
  public subtract(subtrahend: Val): Val {
    if (!(subtrahend instanceof Duration)) {
      return maybeNoSuchOverloadErr(subtrahend);
    }
    try {
      return durationOf(subtractDurationChecked(this.inner, subtrahend.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }

  /** Type implements ref.Val.Type. */
  public type(): RefType {
    return DurationType;
  }

  /** Value implements ref.Val.Value. */
  public value(): bigint {
    return this.inner;
  }

  /** Format appends the human-readable representation. */
  public format(sb: string[]): void {
    sb.push(`duration("${durationString(this.inner)}")`);
  }
}

/**
 * durationOf adapts a duration represented in nanoseconds.
 */
export function durationOf(nanos: bigint): Duration {
  return new Duration(nanos);
}

/**
 * durationGetHours returns the duration in hours.
 */
export function durationGetHours(val: Val): Val {
  if (!(val instanceof Duration)) {
    return maybeNoSuchOverloadErr(val);
  }
  return new Int(val.value() / 3_600_000_000_000n);
}

/**
 * durationGetMinutes returns duration in minutes.
 */
export function durationGetMinutes(val: Val): Val {
  if (!(val instanceof Duration)) {
    return maybeNoSuchOverloadErr(val);
  }
  return new Int(val.value() / 60_000_000_000n);
}

/**
 * durationGetSeconds returns duration in seconds.
 */
export function durationGetSeconds(val: Val): Val {
  if (!(val instanceof Duration)) {
    return maybeNoSuchOverloadErr(val);
  }
  return new Int(val.value() / 1_000_000_000n);
}

/**
 * durationGetMilliseconds returns duration in milliseconds.
 */
export function durationGetMilliseconds(val: Val): Val {
  if (!(val instanceof Duration)) {
    return maybeNoSuchOverloadErr(val);
  }
  return new Int(val.value() / 1_000_000n);
}

function durationProto(nanos: bigint): { seconds: bigint; nanos: number } {
  return { seconds: nanos / 1_000_000_000n, nanos: Number(nanos % 1_000_000_000n) };
}

function durationString(nanos: bigint): string {
  const seconds = nanos / 1_000_000_000n;
  let remainder = nanos % 1_000_000_000n;
  if (remainder === 0n) {
    return `${seconds}s`;
  }
  if (remainder < 0n) {
    remainder = -remainder;
  }
  return `${seconds}.${remainder.toString().padStart(9, "0").replace(/0+$/, "")}s`;
}
