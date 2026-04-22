import { create } from "@bufbuild/protobuf";
import { Temporal } from "temporal-polyfill";
import { InvalidValueError } from "../../errors.js";
import { type TimeZone, TimeZoneSchema } from "../../gen/google/type/datetime_pb.js";

/**
 * Creates a validated `google.type.TimeZone` value.
 *
 * `id` must be a non-empty
 * [IANA Time Zone Database](https://www.iana.org/time-zones) zone ID such as
 * `"America/New_York"`. `version` is optional metadata and is not validated.
 */
export function timeZone(id: string, version = "") {
  const value = create(TimeZoneSchema, { id, version });
  assertValidTimeZone(value);
  return value;
}

/**
 * Asserts that a `google.type.TimeZone` is structurally valid.
 *
 * `id` must be a recognized non-empty
 * [IANA Time Zone Database](https://www.iana.org/time-zones) zone ID. `version`
 * is preserved as metadata and is not interpreted by this helper.
 */
export function assertValidTimeZone(value: TimeZone): asserts value is TimeZone {
  if (!value.id) {
    throw new InvalidValueError("timeZone.id is required", value);
  }

  try {
    Temporal.ZonedDateTime.from({
      year: 2000,
      month: 1,
      day: 1,
      timeZone: value.id,
    });
  } catch (error) {
    throw new InvalidValueError(
      `invalid time zone id: ${error instanceof Error ? error.message : String(error)}`,
      value,
    );
  }
}

/**
 * Returns `true` when the value is a valid `google.type.TimeZone`.
 */
export function isValidTimeZone(value: TimeZone): value is TimeZone {
  try {
    assertValidTimeZone(value);
    return true;
  } catch {
    return false;
  }
}
