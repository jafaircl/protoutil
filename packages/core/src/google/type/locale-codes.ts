import { InvalidValueError } from "../../errors.js";
import { REGION_CODES } from "./region-codes.js";

const REGION_CODE_SET = new Set<string>(REGION_CODES);

/**
 * Asserts that a string is a valid
 * [BCP 47](https://datatracker.ietf.org/doc/html/bcp47) language tag.
 *
 * Validation uses `Intl.Locale`, so the runtime must support that API.
 */
export function assertValidLanguageCode(value: string): asserts value is string {
  if (typeof value !== "string") {
    throw new InvalidValueError("languageCode must be a string", value);
  }
  if (value === "") {
    throw new InvalidValueError("languageCode must not be empty", value);
  }
  if (!isValidLanguageCode(value)) {
    throw new InvalidValueError("languageCode must be a valid BCP 47 language tag", value);
  }
}

/**
 * Returns `true` when a string is a valid
 * [BCP 47](https://datatracker.ietf.org/doc/html/bcp47) language tag.
 *
 * Validation uses `Intl.Locale`, so the runtime must support that API.
 */
export function isValidLanguageCode(value: string) {
  try {
    return (
      typeof value === "string" && value !== "" && new Intl.Locale(value).toString().length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Asserts that a string is a valid
 * [Unicode region subtag](https://www.unicode.org/reports/tr35/#unicode_region_subtag)
 * / CLDR region code.
 *
 * This helper validates against an explicit region-code table rather than just
 * checking the input shape, so values such as `"AA"` are rejected.
 */
export function assertValidRegionCode(value: string): asserts value is string {
  if (typeof value !== "string") {
    throw new InvalidValueError("regionCode must be a string", value);
  }
  if (value === "") {
    throw new InvalidValueError("regionCode must not be empty", value);
  }
  if (!isValidRegionCode(value)) {
    throw new InvalidValueError("regionCode must be a valid CLDR region code", value);
  }
}

/**
 * Returns `true` when a string is a valid
 * [Unicode region subtag](https://www.unicode.org/reports/tr35/#unicode_region_subtag)
 * / CLDR region code.
 */
export function isValidRegionCode(value: string) {
  return typeof value === "string" && REGION_CODE_SET.has(value.toUpperCase());
}
