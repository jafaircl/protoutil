import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { LocalizedTextSchema } from "../../gen/google/type/localized_text_pb.js";
import { assertValidLocalizedText, isValidLocalizedText, localizedText } from "./localized-text.js";

interface ValidLocalizedTextCase {
  text: string;
  languageCode: string;
  expected: {
    text: string;
    languageCode: string;
  };
}

interface InvalidLocalizedTextCase {
  text: string;
  languageCode: string;
  error: string;
}

describe("google/type localized text helpers", () => {
  it("creates valid localized text values using BCP 47 language tags", () => {
    const cases: ValidLocalizedTextCase[] = [
      { text: "Hello", languageCode: "en-US", expected: { text: "Hello", languageCode: "en-US" } },
      {
        text: "Zdravo",
        languageCode: "sr-Latn",
        expected: { text: "Zdravo", languageCode: "sr-Latn" },
      },
      { text: "", languageCode: "fr", expected: { text: "", languageCode: "fr" } },
    ];

    for (const tc of cases) {
      expect(localizedText(tc.text, tc.languageCode)).toMatchObject(tc.expected);
    }
  });

  it("rejects invalid language codes", () => {
    const cases: InvalidLocalizedTextCase[] = [
      { text: "Hello", languageCode: "", error: "languageCode must not be empty" },
      {
        text: "Hello",
        languageCode: "not a locale",
        error: "languageCode must be a valid BCP 47 language tag",
      },
      {
        text: "Hello",
        languageCode: "en_US",
        error: "languageCode must be a valid BCP 47 language tag",
      },
    ];

    for (const tc of cases) {
      expect(() => localizedText(tc.text, tc.languageCode)).toThrow(tc.error);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(LocalizedTextSchema, { text: "Hello", languageCode: "en-US" }),
      create(LocalizedTextSchema, { text: "Hola", languageCode: "es" }),
      create(LocalizedTextSchema, { text: "Zdravo", languageCode: "sr-Latn" }),
    ];
    const invalidCases = [
      create(LocalizedTextSchema, { text: "Hello", languageCode: "" }),
      create(LocalizedTextSchema, { text: "Hello", languageCode: "bad tag" }),
      create(LocalizedTextSchema, { text: "Hello", languageCode: "en_US" }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidLocalizedText(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidLocalizedText(tc)).toBe(false);
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      { value: localizedText("Hello", "en-US"), expected: true },
      { value: create(LocalizedTextSchema, { text: "Hello", languageCode: "" }), expected: false },
    ];

    for (const tc of cases) {
      expect(isValidLocalizedText(tc.value)).toBe(tc.expected);
    }
  });
});
