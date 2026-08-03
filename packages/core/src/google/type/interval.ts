import { create } from "@bufbuild/protobuf";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { InvalidValueError } from "../../errors.js";
import { type Interval, IntervalSchema } from "../../gen/google/type/interval_pb.js";
import { assertValidTimestamp, timestampNanos } from "../../wkt/timestamp.js";

/**
 * Creates a validated `google.type.Interval` value.
 *
 * `startTime` is inclusive and `endTime` is exclusive. When both are omitted,
 * the interval matches any time.
 */
export function interval(startTime?: Timestamp, endTime?: Timestamp) {
  const value = create(IntervalSchema, { startTime, endTime });
  assertValidInterval(value);
  return value;
}

/**
 * Asserts that a `google.type.Interval` is structurally valid.
 *
 * The start must be less than or equal to the end. When the start equals the
 * end, the interval is empty.
 */
export function assertValidInterval(value: Interval): asserts value is Interval {
  if (value.startTime) {
    assertValidTimestamp(value.startTime);
  }
  if (value.endTime) {
    assertValidTimestamp(value.endTime);
  }
  if (
    value.startTime !== undefined &&
    value.endTime !== undefined &&
    timestampNanos(value.startTime) > timestampNanos(value.endTime)
  ) {
    throw new InvalidValueError("startTime must be less than or equal to endTime", value);
  }
}

/**
 * Returns `true` when the value is a valid `google.type.Interval`.
 */
export function isValidInterval(value: Interval): value is Interval {
  try {
    assertValidInterval(value);
    return true;
  } catch {
    return false;
  }
}
