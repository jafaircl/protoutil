import { create } from "@bufbuild/protobuf";
import { InvalidValueError } from "../../errors.js";
import {
  type PhoneNumber,
  type PhoneNumber_ShortCode,
  PhoneNumber_ShortCodeSchema,
  PhoneNumberSchema,
} from "../../gen/google/type/phone_number_pb.js";
import { isValidRegionCode } from "./locale-codes.js";

const E164_NUMBER_RE = /^\+[1-9]\d+$/;
const SHORT_CODE_NUMBER_RE = /^\d+$/;
const EXTENSION_DIGIT_RE = /\d/g;
const MAX_EXTENSION_DIGITS = 40;

export interface PhoneNumberE164Input {
  e164Number: string;
  extension?: string;
}

export interface PhoneNumberShortCodeInput {
  shortCode: PhoneNumber_ShortCode | PhoneNumberShortCodeInputValue;
  extension?: string;
}

export interface PhoneNumberShortCodeInputValue {
  regionCode: string;
  number: string;
}

type PhoneNumberInput = PhoneNumberE164Input | PhoneNumberShortCodeInput;

/**
 * Creates a validated `google.type.PhoneNumber` value.
 *
 * The value must include either a relaxed
 * [ITU E.164](https://www.itu.int/rec/T-REC-E.164-201011-I) number such as
 * `"+15552220123"` or a region-specific short code.
 *
 * The helper enforces the protobuf wire shape: E.164 numbers must start with
 * `+` and contain digits only, with no spaces or locale-specific formatting.
 * Short codes must include both a region code and digits-only short code.
 */
export function phoneNumber(input: PhoneNumberE164Input): PhoneNumber;
export function phoneNumber(input: PhoneNumberShortCodeInput): PhoneNumber;
export function phoneNumber(input: PhoneNumberInput) {
  const value =
    "e164Number" in input
      ? create(PhoneNumberSchema, {
          kind: {
            case: "e164Number",
            value: input.e164Number,
          },
          extension: input.extension ?? "",
        })
      : create(PhoneNumberSchema, {
          kind: {
            case: "shortCode",
            value: isPhoneNumberShortCodeMessage(input.shortCode)
              ? input.shortCode
              : phoneNumberShortCode(input.shortCode.regionCode, input.shortCode.number),
          },
          extension: input.extension ?? "",
        });

  assertValidPhoneNumber(value);
  return value;
}

/**
 * Creates a validated `google.type.PhoneNumber.ShortCode` value.
 *
 * `regionCode` must be a valid
 * [Unicode region subtag](https://www.unicode.org/reports/tr35/#unicode_region_subtag),
 * such as `"US"` or `"BB"`. `number` must contain only the short-code digits,
 * with no leading `+` or country calling code.
 */
export function phoneNumberShortCode(regionCode: string, number: string) {
  const value = create(PhoneNumber_ShortCodeSchema, { regionCode, number });
  assertValidPhoneNumberShortCode(value);
  return value;
}

/**
 * Asserts that a `google.type.PhoneNumber` is structurally valid.
 *
 * The value must include either a relaxed
 * [ITU E.164](https://www.itu.int/rec/T-REC-E.164-201011-I) number or a short
 * code. `extension` may contain digits and dialing characters such as `,` and
 * `#`, but may not contain more than 40 digits.
 */
export function assertValidPhoneNumber(value: PhoneNumber): asserts value is PhoneNumber {
  switch (value.kind.case) {
    case "e164Number":
      if (!E164_NUMBER_RE.test(value.kind.value)) {
        throw new InvalidValueError(
          "e164Number must start with '+' and contain digits only",
          value.kind.value,
        );
      }
      break;
    case "shortCode":
      assertValidPhoneNumberShortCode(value.kind.value);
      break;
    default:
      throw new InvalidValueError(
        "phone number must include either e164Number or shortCode",
        value,
      );
  }

  assertValidPhoneNumberExtension(value.extension);
}

/**
 * Asserts that a `google.type.PhoneNumber.ShortCode` is structurally valid.
 *
 * `regionCode` must be a valid
 * [Unicode region subtag](https://www.unicode.org/reports/tr35/#unicode_region_subtag),
 * such as `"US"` or `"BB"`. `number` must contain only short-code digits.
 */
export function assertValidPhoneNumberShortCode(
  value: PhoneNumber_ShortCode,
): asserts value is PhoneNumber_ShortCode {
  if (!value.regionCode) {
    throw new InvalidValueError("shortCode.regionCode is required", value);
  }
  if (!isValidRegionCode(value.regionCode)) {
    throw new InvalidValueError(
      "shortCode.regionCode must be a valid Unicode region subtag",
      value.regionCode,
    );
  }
  if (!value.number) {
    throw new InvalidValueError("shortCode.number is required", value);
  }
  if (!SHORT_CODE_NUMBER_RE.test(value.number)) {
    throw new InvalidValueError("shortCode.number must contain digits only", value.number);
  }
}

/**
 * Returns `true` when the value is a valid `google.type.PhoneNumber`.
 */
export function isValidPhoneNumber(value: PhoneNumber): value is PhoneNumber {
  try {
    assertValidPhoneNumber(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns `true` when the value is a valid `google.type.PhoneNumber.ShortCode`.
 */
export function isValidPhoneNumberShortCode(
  value: PhoneNumber_ShortCode,
): value is PhoneNumber_ShortCode {
  try {
    assertValidPhoneNumberShortCode(value);
    return true;
  } catch {
    return false;
  }
}

function assertValidPhoneNumberExtension(value: string) {
  if (typeof value !== "string") {
    throw new InvalidValueError("extension must be a string", value);
  }

  const digitCount = value.match(EXTENSION_DIGIT_RE)?.length ?? 0;
  if (digitCount > MAX_EXTENSION_DIGITS) {
    throw new InvalidValueError("extension must not contain more than 40 digits", value);
  }
}

function isPhoneNumberShortCodeMessage(
  value: PhoneNumber_ShortCode | PhoneNumberShortCodeInputValue,
): value is PhoneNumber_ShortCode {
  return "$typeName" in value;
}
