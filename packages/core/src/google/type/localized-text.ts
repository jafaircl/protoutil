import { create } from "@bufbuild/protobuf";
import { InvalidValueError } from "../../errors.js";
import {
  type LocalizedText,
  LocalizedTextSchema,
} from "../../gen/google/type/localized_text_pb.js";
import { assertValidLanguageCode } from "./locale-codes.js";

/**
 * Creates a validated `google.type.LocalizedText` value.
 *
 * `languageCode` must be a valid
 * [BCP 47](https://datatracker.ietf.org/doc/html/bcp47) language tag, such as
 * `"en-US"` or `"sr-Latn"`. For locale identifier details, see the
 * [Unicode locale identifier](https://www.unicode.org/reports/tr35/#Unicode_locale_identifier)
 * reference.
 */
export function localizedText(text: string, languageCode: string) {
  const value = create(LocalizedTextSchema, { text, languageCode });
  assertValidLocalizedText(value);
  return value;
}

/**
 * Asserts that a `google.type.LocalizedText` is structurally valid.
 *
 * `languageCode` must be a valid
 * [BCP 47](https://datatracker.ietf.org/doc/html/bcp47) language tag.
 */
export function assertValidLocalizedText(value: LocalizedText): asserts value is LocalizedText {
  if (typeof value.text !== "string") {
    throw new InvalidValueError("text must be a string", value.text);
  }
  assertValidLanguageCode(value.languageCode);
}

/**
 * Returns `true` when the value is a valid `google.type.LocalizedText`.
 */
export function isValidLocalizedText(value: LocalizedText): value is LocalizedText {
  try {
    assertValidLocalizedText(value);
    return true;
  } catch {
    return false;
  }
}
