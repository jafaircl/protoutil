import {
  Bool,
  BoolType,
  err,
  func,
  memberOverload,
  opaqueType,
  overload,
  type Timestamp,
  TimestampType,
  type Type,
  TypeType,
  type Val,
} from "@protoutil/cel";
import type { CelLibrary } from "./types.js";

/** Stable name of the library that every target binds to its own range storage. */
export const timestampRangesLibraryName = "protoutil.celql.timestamp_ranges";

/**
 * Opaque CEL type for a query field that stores one half-open timestamp range.
 *
 * Each profile documents the storage that its target requires for this type.
 * Do not expose this type for a field that uses a different bound convention.
 */
export const TimestampRangeType = opaqueType("protoutil.celql.TimestampRange");

/**
 * CEL runtime value for one half-open timestamp range `[start, end)`.
 *
 * An empty range is valid when `start` equals `end`; a range whose start is
 * after its end is invalid.
 */
export class TimestampRangeValue implements Val {
  /** Inclusive lower bound of the range. */
  public readonly start: Timestamp;

  /** Exclusive upper bound of the range. */
  public readonly end: Timestamp;

  /** Creates a range with an inclusive start and exclusive end. */
  public constructor(start: Timestamp, end: Timestamp) {
    if (timestampCompare(start, end) > 0) {
      throw new RangeError("a timestamp range start must not be after its end");
    }
    this.start = start;
    this.end = end;
  }

  /** Returns this value for its own native type and rejects other conversions. */
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === TimestampRangeValue || typeDesc === undefined) return this;
    throw new Error(`type conversion from '${TimestampRangeType.typeName()}' is not supported`);
  }

  /** Converts only to this opaque CEL type or CEL's type value. */
  public convertToType(typeValue: Type): Val {
    if (typeValue === TimestampRangeType) return this;
    if (typeValue === TypeType) return TimestampRangeType;
    return err(
      "type conversion error from '%s' to '%s'",
      TimestampRangeType.typeName(),
      typeValue.typeName(),
    );
  }

  /** Compares both bounds with timestamp precision. */
  public equal(other: Val): Val {
    return new Bool(
      other instanceof TimestampRangeValue &&
        timestampCompare(this.start, other.start) === 0 &&
        timestampCompare(this.end, other.end) === 0,
    );
  }

  /** Returns the opaque CEL type of this range. */
  public type(): Type {
    return TimestampRangeType;
  }

  /** Returns both bounds in a CEL-native object. */
  public value(): unknown {
    return { start: this.start.value(), end: this.end.value() };
  }

  /** Reports whether the range contains a timestamp. */
  public contains(value: Timestamp): boolean {
    return timestampCompare(this.start, value) <= 0 && timestampCompare(value, this.end) < 0;
  }

  /** Reports whether two half-open ranges share at least one timestamp. */
  public overlaps(other: TimestampRangeValue): boolean {
    return (
      !this.isEmpty() &&
      !other.isEmpty() &&
      timestampCompare(this.start, other.end) < 0 &&
      timestampCompare(other.start, this.end) < 0
    );
  }

  private isEmpty(): boolean {
    return timestampCompare(this.start, this.end) === 0;
  }
}

/**
 * Returns the CEL declarations and evaluation bindings of the timestamp-range library.
 *
 * A profile binding adds the target translation that preserves these semantics.
 * Callers that only evaluate CEL, such as a differential test oracle, select
 * this library directly.
 */
export function timestampRangesLibrary(): CelLibrary {
  return celLibrary;
}

const celLibrary: CelLibrary = {
  libraryName: timestampRangesLibraryName,
  libraryVersion: 1,
  programOptions: {},
  compileOptions: {
    types: [TimestampRangeType],
    functions: [
      func("timestampRange", {
        overloads: [
          overload("timestamp_range", [TimestampType, TimestampType], TimestampRangeType, {
            binaryBinding: (start, end) => timestampRange(start as Timestamp, end as Timestamp),
          }),
        ],
      }),
      func("contains", {
        overloads: [
          memberOverload(
            "timestamp_range_contains_timestamp",
            [TimestampRangeType, TimestampType],
            BoolType,
            {
              binaryBinding: (range, value) =>
                new Bool((range as TimestampRangeValue).contains(value as Timestamp)),
            },
          ),
        ],
      }),
      func("overlaps", {
        overloads: [
          memberOverload(
            "timestamp_range_overlaps_timestamp_range",
            [TimestampRangeType, TimestampRangeType],
            BoolType,
            {
              binaryBinding: (left, right) =>
                new Bool((left as TimestampRangeValue).overlaps(right as TimestampRangeValue)),
            },
          ),
        ],
      }),
    ],
  },
};

function timestampRange(start: Timestamp, end: Timestamp): Val {
  if (timestampCompare(start, end) > 0) {
    return err("a timestamp range start must not be after its end");
  }
  return new TimestampRangeValue(start, end);
}

function timestampCompare(left: Timestamp, right: Timestamp): number {
  if (left.seconds() !== right.seconds()) return left.seconds() < right.seconds() ? -1 : 1;
  return left.nanos() === right.nanos() ? 0 : left.nanos() < right.nanos() ? -1 : 1;
}
