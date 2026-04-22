import { describe, expect, it } from "vitest";
import {
  assertValidLanguageCode,
  assertValidRegionCode,
  isValidLanguageCode,
  isValidRegionCode,
} from "./locale-codes.js";

interface LanguageCodeCase {
  value: string;
  expected: boolean;
}

interface RegionCodeCase {
  value: string;
  expected: boolean;
}

describe("google/type locale code helpers", () => {
  it("recognizes valid and invalid BCP 47 language tags", () => {
    const cases: LanguageCodeCase[] = [
      { value: "en-US", expected: true },
      { value: "sr-Latn", expected: true },
      { value: "zh-Hant", expected: true },
      { value: "", expected: false },
      { value: "en_US", expected: false },
      { value: "not a locale", expected: false },
    ];

    for (const tc of cases) {
      expect(isValidLanguageCode(tc.value)).toBe(tc.expected);
    }
  });

  it("recognizes valid and invalid CLDR region codes", () => {
    const cases: RegionCodeCase[] = [
      { value: "US", expected: true },
      { value: "CH", expected: true },
      { value: "001", expected: true },
      { value: "419", expected: true },
      { value: "", expected: false },
      { value: "AA", expected: false },
      { value: "USA", expected: false },
      { value: "999", expected: false },
    ];

    for (const tc of cases) {
      expect(isValidRegionCode(tc.value)).toBe(tc.expected);
    }
  });

  it("throws with the documented messages for invalid language and region codes", () => {
    const languageCases: LanguageCodeCase[] = [
      { value: "", expected: false },
      { value: "en_US", expected: false },
    ];
    const regionCases: RegionCodeCase[] = [
      { value: "", expected: false },
      { value: "AA", expected: false },
    ];

    for (const tc of languageCases) {
      expect(() => assertValidLanguageCode(tc.value)).toThrow();
    }
    for (const tc of regionCases) {
      expect(() => assertValidRegionCode(tc.value)).toThrow();
    }
  });
});
