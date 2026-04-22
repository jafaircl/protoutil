import { create } from "@bufbuild/protobuf";
import type { Duration } from "@bufbuild/protobuf/wkt";
import { Temporal } from "temporal-polyfill";
import { InvalidValueError, OutOfRangeError } from "../../errors.js";
import { DateSchema } from "../../gen/google/type/date_pb.js";
import {
  type DateTime,
  DateTimeSchema,
  type TimeZone,
  TimeZoneSchema,
} from "../../gen/google/type/datetime_pb.js";
import { assertValidInt32 } from "../../int32.js";
import { assertValidDuration, duration } from "../../wkt/duration.js";
import { assertValidDate } from "./date.js";
import { MAX_NANOS, padNumber, trimTrailingZeros } from "./shared.js";
import { assertValidTimeZone as assertValidStandaloneTimeZone } from "./timezone.js";

const MAX_UTC_OFFSET_SECONDS = 18 * 60 * 60;
const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.(\d{1,9}))?)?(?:([zZ]|[+-]\d{2}:\d{2}))?(?:\[([^\]]+)\])?$/;

/**
 * Shared fields for constructing `google.type.DateTime` values.
 */
export interface DateTimeInput {
  year?: number;
  month: number;
  day: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  nanos?: number;
}

/**
 * `google.type.DateTime` constructor input using a UTC offset.
 */
export interface DateTimeUtcOffsetInput extends DateTimeInput {
  utcOffset?: Duration;
}

/**
 * `google.type.DateTime` constructor input using a named time zone.
 */
export interface DateTimeTimeZoneInput extends DateTimeInput {
  timeZone?: string | TimeZone;
  timeZoneVersion?: string;
}

type DateTimeValueInput =
  | (DateTimeUtcOffsetInput & { timeZone?: undefined; timeZoneVersion?: undefined })
  | (DateTimeTimeZoneInput & { utcOffset?: undefined });

/**
 * Creates a validated `google.type.DateTime` value.
 *
 * The input may include either a `utcOffset` or a named `timeZone`, but not
 * both.
 *
 * This helper intentionally uses a strict subset of the protobuf type: hours
 * must be `00` through `23`, seconds must be `00` through `59`, and
 * `utcOffset` values must be whole seconds within `±18:00`.
 */
export function dateTime(input: DateTimeUtcOffsetInput): DateTime;
export function dateTime(input: DateTimeTimeZoneInput): DateTime;
export function dateTime(input: DateTimeValueInput) {
  if (input.utcOffset !== undefined && input.timeZone !== undefined) {
    throw new InvalidValueError("dateTime accepts either utcOffset or timeZone, not both", input);
  }

  const value = create(DateTimeSchema, {
    year: input.year ?? 0,
    month: input.month,
    day: input.day,
    hours: input.hours ?? 0,
    minutes: input.minutes ?? 0,
    seconds: input.seconds ?? 0,
    nanos: input.nanos ?? 0,
    timeOffset: createTimeOffset(input),
  });
  assertValidDateTime(value);
  return value;
}

/**
 * Asserts that a `google.type.DateTime` is structurally valid.
 *
 * Valid values may be local datetimes, datetimes with a UTC offset, or
 * datetimes with a named
 * [IANA Time Zone Database](https://www.iana.org/time-zones) zone. Yearless
 * values are supported, but month and day must still be present.
 */
export function assertValidDateTime(value: DateTime): asserts value is DateTime {
  assertValidDate(
    create(DateSchema, {
      year: value.year,
      month: value.month,
      day: value.day,
    }),
  );

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

  switch (value.timeOffset.case) {
    case "utcOffset":
      assertValidDuration(value.timeOffset.value);
      if (value.timeOffset.value.nanos !== 0) {
        throw new InvalidValueError("utcOffset must be whole seconds", value.timeOffset.value);
      }
      if (
        value.timeOffset.value.seconds < -BigInt(MAX_UTC_OFFSET_SECONDS) ||
        value.timeOffset.value.seconds > BigInt(MAX_UTC_OFFSET_SECONDS)
      ) {
        throw new OutOfRangeError(
          "utcOffset out of range",
          value.timeOffset.value.seconds,
          -BigInt(MAX_UTC_OFFSET_SECONDS),
          BigInt(MAX_UTC_OFFSET_SECONDS),
        );
      }
      return;
    case "timeZone":
      assertValidDateTimeTimeZone(value.timeOffset.value, value);
      return;
    default:
      return;
  }
}

/**
 * Returns `true` when the value is a valid `google.type.DateTime`.
 */
export function isValidDateTime(value: DateTime): value is DateTime {
  try {
    assertValidDateTime(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a `google.type.DateTime` from its string form.
 *
 * Supports optional fractional seconds, UTC offsets, and bracketed
 * [IANA Time Zone Database](https://www.iana.org/time-zones) zone IDs.
 *
 * Parsed values still use the helper's strict v1 rules, so `24:00:00` and
 * leap-second `:60` inputs are rejected.
 */
export function dateTimeFromString(value: string) {
  const match = value.match(DATETIME_RE);
  if (!match) {
    throw new InvalidValueError("invalid google.type.DateTime string", value);
  }

  const nanos = Number((match[8] ?? "").padEnd(9, "0") || "0");
  const zone = match[10];
  const offset = match[9];
  const base = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hours: Number(match[4]),
    minutes: Number(match[5]),
    seconds: Number(match[6] ?? "0"),
    nanos,
  };

  if (zone) {
    return dateTime({
      ...base,
      timeZone: zone,
    });
  }

  if (offset) {
    return dateTime({
      ...base,
      utcOffset: parseUtcOffset(offset),
    });
  }

  return dateTime(base);
}

/**
 * Formats a `google.type.DateTime` using its canonical string form.
 *
 * Named time zones format as `...±HH:MM[Area/Location]`, where the numeric
 * offset is resolved via
 * [Temporal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal)
 * using its default `"compatible"` disambiguation.
 */
export function dateTimeToString(value: DateTime) {
  assertValidDateTime(value);

  const datePart = `${padNumber(value.year, 4)}-${padNumber(value.month)}-${padNumber(value.day)}`;
  const timePart = [
    padNumber(value.hours),
    padNumber(value.minutes),
    padNumber(value.seconds),
  ].join(":");
  const fractional = value.nanos === 0 ? "" : `.${trimTrailingZeros(padNumber(value.nanos, 9))}`;

  switch (value.timeOffset.case) {
    case "utcOffset":
      return `${datePart}T${timePart}${fractional}${formatUtcOffset(value.timeOffset.value)}`;
    case "timeZone": {
      const offset = resolvedTimeZoneOffset(value);
      return `${datePart}T${timePart}${fractional}${offset}[${value.timeOffset.value.id}]`;
    }
    default:
      return `${datePart}T${timePart}${fractional}`;
  }
}

/**
 * Converts a
 * [`Temporal.PlainDateTime`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime)
 * input into a `google.type.DateTime`.
 *
 * The result is a local datetime with no `utcOffset` or named `timeZone`.
 */
export function dateTimeFromPlainDateTime(
  value: Temporal.PlainDateTime | Temporal.PlainDateTimeLike | string,
) {
  const plainDateTime = Temporal.PlainDateTime.from(value);
  return dateTime({
    year: plainDateTime.year,
    month: plainDateTime.month,
    day: plainDateTime.day,
    hours: plainDateTime.hour,
    minutes: plainDateTime.minute,
    seconds: plainDateTime.second,
    nanos:
      plainDateTime.millisecond * 1_000_000 +
      plainDateTime.microsecond * 1_000 +
      plainDateTime.nanosecond,
  });
}

/**
 * Converts a `google.type.DateTime` into
 * [`Temporal.PlainDateTime`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime).
 *
 * Yearless values cannot be converted and will throw.
 */
export function dateTimePlainDateTime(value: DateTime) {
  assertValidDateTime(value);
  if (value.year === 0) {
    throw new InvalidValueError(
      "yearless DateTime values cannot be converted to Temporal.PlainDateTime",
      value,
    );
  }

  const { millisecond, microsecond, nanosecond } = splitNanos(value.nanos);
  return new Temporal.PlainDateTime(
    value.year,
    value.month,
    value.day,
    value.hours,
    value.minutes,
    value.seconds,
    millisecond,
    microsecond,
    nanosecond,
  );
}

/**
 * Converts a
 * [`Temporal.ZonedDateTime`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime)
 * input into a `google.type.DateTime` with a named time zone.
 *
 * The resulting helper value stores the zone ID, not a fixed offset.
 */
export function dateTimeFromZonedDateTime(
  value: Temporal.ZonedDateTime | Temporal.ZonedDateTimeLike | string,
) {
  const zonedDateTime = Temporal.ZonedDateTime.from(value);
  return dateTime({
    year: zonedDateTime.year,
    month: zonedDateTime.month,
    day: zonedDateTime.day,
    hours: zonedDateTime.hour,
    minutes: zonedDateTime.minute,
    seconds: zonedDateTime.second,
    nanos:
      zonedDateTime.millisecond * 1_000_000 +
      zonedDateTime.microsecond * 1_000 +
      zonedDateTime.nanosecond,
    timeZone: zonedDateTime.timeZoneId,
  });
}

/**
 * Converts a `google.type.DateTime` into
 * [`Temporal.ZonedDateTime`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime).
 *
 * The value must include a named time zone and a non-zero year.
 */
export function dateTimeZonedDateTime(value: DateTime) {
  return toTemporalZonedDateTime(value);
}

function createTimeOffset(input: DateTimeValueInput): DateTime["timeOffset"] {
  if (input.utcOffset !== undefined) {
    return {
      case: "utcOffset",
      value: input.utcOffset,
    };
  }
  if (input.timeZone !== undefined) {
    return {
      case: "timeZone",
      value:
        typeof input.timeZone === "string"
          ? create(TimeZoneSchema, {
              id: input.timeZone,
              version: input.timeZoneVersion ?? "",
            })
          : input.timeZone,
    };
  }
  return { case: undefined };
}

function assertValidDateTimeTimeZone(value: TimeZone, dateTimeValue: DateTime) {
  assertValidStandaloneTimeZone(value);

  try {
    Temporal.ZonedDateTime.from({
      year: dateTimeValue.year || 2000,
      month: dateTimeValue.month,
      day: dateTimeValue.day,
      hour: dateTimeValue.hours,
      minute: dateTimeValue.minutes,
      second: dateTimeValue.seconds,
      millisecond: Math.trunc(dateTimeValue.nanos / 1_000_000),
      microsecond: Math.trunc((dateTimeValue.nanos % 1_000_000) / 1_000),
      nanosecond: dateTimeValue.nanos % 1_000,
      timeZone: value.id,
    });
  } catch (error) {
    throw new InvalidValueError(
      `invalid time zone or civil time: ${error instanceof Error ? error.message : String(error)}`,
      value,
    );
  }
}

function parseUtcOffset(value: string) {
  if (value === "Z" || value === "z") {
    return duration(0n, 0);
  }
  const sign = value.startsWith("-") ? -1 : 1;
  const [hours, minutes] = value.slice(1).split(":").map(Number);
  const totalSeconds = sign * (hours * 60 * 60 + minutes * 60);
  return duration(BigInt(totalSeconds), 0);
}

function formatUtcOffset(value: Duration) {
  const totalSeconds = Number(value.seconds);
  if (totalSeconds === 0) {
    return "Z";
  }

  const sign = totalSeconds < 0 ? "-" : "+";
  const absoluteSeconds = Math.abs(totalSeconds);
  const hours = Math.trunc(absoluteSeconds / 3600);
  const minutes = Math.trunc((absoluteSeconds % 3600) / 60);
  return `${sign}${padNumber(hours)}:${padNumber(minutes)}`;
}

function resolvedTimeZoneOffset(value: DateTime) {
  const zoned = toTemporalZonedDateTime(value);
  return zoned.offset;
}

function splitNanos(value: number) {
  return {
    millisecond: Math.trunc(value / 1_000_000),
    microsecond: Math.trunc((value % 1_000_000) / 1_000),
    nanosecond: value % 1_000,
  };
}

function toTemporalZonedDateTime(value: DateTime) {
  if (value.year === 0) {
    throw new InvalidValueError(
      "yearless DateTime values cannot be converted to Temporal.ZonedDateTime",
      value,
    );
  }
  if (value.timeOffset.case !== "timeZone") {
    throw new InvalidValueError(
      "DateTime must use a named time zone to convert to Temporal.ZonedDateTime",
      value,
    );
  }

  const { millisecond, microsecond, nanosecond } = splitNanos(value.nanos);
  return Temporal.ZonedDateTime.from({
    year: value.year,
    month: value.month,
    day: value.day,
    hour: value.hours,
    minute: value.minutes,
    second: value.seconds,
    millisecond,
    microsecond,
    nanosecond,
    timeZone: value.timeOffset.value.id,
  });
}
