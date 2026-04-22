import { create } from "@bufbuild/protobuf";
import { Temporal } from "temporal-polyfill";
import { OutOfRangeError } from "../../errors.js";
import { type TimeOfDay, TimeOfDaySchema } from "../../gen/google/type/timeofday_pb.js";
import { assertValidInt32 } from "../../int32.js";
import { MAX_NANOS, padNumber, trimTrailingZeros } from "./shared.js";

const TIME_OF_DAY_RE = /^(\d{2}):(\d{2})(?::(\d{2})(\.(\d{1,9}))?)?$/;

/**
 * Creates a validated `google.type.TimeOfDay` value.
 *
 * This helper intentionally uses a strict subset of the protobuf type: hours
 * must be `00` through `23`, seconds must be `00` through `59`, and
 * `24:00:00` and leap-second `:60` values are not accepted in v1.
 */
export function timeOfDay(hours = 0, minutes = 0, seconds = 0, nanos = 0) {
  const value = create(TimeOfDaySchema, {
    hours,
    minutes,
    seconds,
    nanos,
  });
  assertValidTimeOfDay(value);
  return value;
}

/**
 * Asserts that a `google.type.TimeOfDay` is structurally valid.
 *
 * `nanos` must be within `[0, 999_999_999]`.
 */
export function assertValidTimeOfDay(value: TimeOfDay): asserts value is TimeOfDay {
  assertValidInt32(value.hours);
  assertValidInt32(value.minutes);
  assertValidInt32(value.seconds);
  assertValidInt32(value.nanos);

  if (value.hours < 0 || value.hours > 23) {
    throw new OutOfRangeError("hours out of range", value.hours, 0, 23);
  }
  if (value.minutes < 0 || value.minutes > 59) {
    throw new OutOfRangeError("minutes out of range", value.minutes, 0, 59);
  }
  if (value.seconds < 0 || value.seconds > 59) {
    throw new OutOfRangeError("seconds out of range", value.seconds, 0, 59);
  }
  if (value.nanos < 0 || value.nanos > MAX_NANOS) {
    throw new OutOfRangeError("nanos out of range", value.nanos, 0, MAX_NANOS);
  }
}

/**
 * Returns `true` when the value is a valid `google.type.TimeOfDay`.
 */
export function isValidTimeOfDay(value: TimeOfDay): value is TimeOfDay {
  try {
    assertValidTimeOfDay(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a `google.type.TimeOfDay` from `HH:MM[:SS[.fffffffff]]`.
 *
 * Parsing still applies the helper's strict v1 rules, so `24:00:00` and
 * leap-second `:60` inputs are rejected.
 */
export function timeOfDayFromString(value: string) {
  const match = value.match(TIME_OF_DAY_RE);
  if (!match) {
    throw new Error("invalid google.type.TimeOfDay string");
  }

  return timeOfDay(
    Number(match[1]),
    Number(match[2]),
    Number(match[3] ?? "0"),
    Number((match[5] ?? "").padEnd(9, "0") || "0"),
  );
}

/**
 * Formats a `google.type.TimeOfDay` using its canonical string form.
 *
 * Seconds are always included. Fractional seconds are omitted when zero and
 * otherwise trimmed to the shortest non-zero suffix.
 */
export function timeOfDayToString(value: TimeOfDay) {
  assertValidTimeOfDay(value);

  const timePart = [
    padNumber(value.hours),
    padNumber(value.minutes),
    padNumber(value.seconds),
  ].join(":");
  const fractional = value.nanos === 0 ? "" : `.${trimTrailingZeros(padNumber(value.nanos, 9))}`;
  return `${timePart}${fractional}`;
}

/**
 * Converts a `Temporal.PlainTime` input into a `google.type.TimeOfDay`.
 */
export function timeOfDayFromPlainTime(
  value: Temporal.PlainTime | Temporal.PlainTimeLike | string,
) {
  const plainTime = Temporal.PlainTime.from(value);
  return timeOfDay(
    plainTime.hour,
    plainTime.minute,
    plainTime.second,
    plainTime.millisecond * 1_000_000 + plainTime.microsecond * 1_000 + plainTime.nanosecond,
  );
}

/**
 * Converts a `google.type.TimeOfDay` into `Temporal.PlainTime`.
 */
export function timeOfDayPlainTime(value: TimeOfDay) {
  assertValidTimeOfDay(value);
  return new Temporal.PlainTime(
    value.hours,
    value.minutes,
    value.seconds,
    Math.trunc(value.nanos / 1_000_000),
    Math.trunc((value.nanos % 1_000_000) / 1_000),
    value.nanos % 1_000,
  );
}
