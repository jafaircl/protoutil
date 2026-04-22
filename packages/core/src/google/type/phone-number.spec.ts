import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  PhoneNumber_ShortCodeSchema,
  PhoneNumberSchema,
} from "../../gen/google/type/phone_number_pb.js";
import {
  assertValidPhoneNumber,
  assertValidPhoneNumberShortCode,
  isValidPhoneNumber,
  isValidPhoneNumberShortCode,
  phoneNumber,
  phoneNumberShortCode,
} from "./phone-number.js";

interface ValidPhoneNumberCase {
  input:
    | {
        e164Number: string;
        extension?: string;
      }
    | {
        shortCode: {
          regionCode: string;
          number: string;
        };
        extension?: string;
      };
  expected: {
    kind:
      | { case: "e164Number"; value: string }
      | {
          case: "shortCode";
          value: { regionCode: string; number: string };
        };
    extension: string;
  };
}

interface InvalidPhoneNumberCase {
  input:
    | {
        e164Number: string;
        extension?: string;
      }
    | {
        shortCode: {
          regionCode: string;
          number: string;
        };
        extension?: string;
      };
  error: string;
}

interface ValidShortCodeCase {
  regionCode: string;
  number: string;
  expected: {
    regionCode: string;
    number: string;
  };
}

interface InvalidShortCodeCase {
  regionCode: string;
  number: string;
  error: string;
}

describe("google/type phone number helpers", () => {
  it("creates valid E.164 numbers and short codes from protobuf-documented shapes", () => {
    const cases: ValidPhoneNumberCase[] = [
      {
        input: { e164Number: "+15552220123" },
        expected: {
          kind: { case: "e164Number", value: "+15552220123" },
          extension: "",
        },
      },
      {
        input: { e164Number: "+442071838750", extension: "123" },
        expected: {
          kind: { case: "e164Number", value: "+442071838750" },
          extension: "123",
        },
      },
      {
        input: { e164Number: "+15552220123", extension: "123,#" },
        expected: {
          kind: { case: "e164Number", value: "+15552220123" },
          extension: "123,#",
        },
      },
      {
        input: { shortCode: { regionCode: "US", number: "611" } },
        expected: {
          kind: { case: "shortCode", value: { regionCode: "US", number: "611" } },
          extension: "",
        },
      },
      {
        input: { shortCode: { regionCode: "BB", number: "211" }, extension: "9" },
        expected: {
          kind: { case: "shortCode", value: { regionCode: "BB", number: "211" } },
          extension: "9",
        },
      },
    ];

    for (const tc of cases) {
      if ("e164Number" in tc.input) {
        expect(phoneNumber(tc.input)).toMatchObject(tc.expected);
      } else {
        expect(phoneNumber(tc.input)).toMatchObject(tc.expected);
      }
    }
  });

  it("rejects invalid E.164 formatting and overly long extensions", () => {
    const overlongExtension = "1".repeat(41);
    const cases: InvalidPhoneNumberCase[] = [
      {
        input: { e164Number: "15552220123" },
        error: "e164Number must start with '+' and contain digits only",
      },
      {
        input: { e164Number: "+1 (555) 222-01234 x123" },
        error: "e164Number must start with '+' and contain digits only",
      },
      {
        input: { e164Number: "+", extension: "123" },
        error: "e164Number must start with '+' and contain digits only",
      },
      {
        input: { e164Number: "+15552220123", extension: overlongExtension },
        error: "extension must not contain more than 40 digits",
      },
    ];

    for (const tc of cases) {
      if ("e164Number" in tc.input) {
        const input = tc.input;
        expect(() => phoneNumber(input)).toThrow(tc.error);
      } else {
        const input = tc.input;
        expect(() => phoneNumber(input)).toThrow(tc.error);
      }
    }
  });

  it("creates valid short codes using region subtags and digits only", () => {
    const cases: ValidShortCodeCase[] = [
      { regionCode: "US", number: "611", expected: { regionCode: "US", number: "611" } },
      { regionCode: "BB", number: "211", expected: { regionCode: "BB", number: "211" } },
      { regionCode: "001", number: "12345", expected: { regionCode: "001", number: "12345" } },
    ];

    for (const tc of cases) {
      expect(phoneNumberShortCode(tc.regionCode, tc.number)).toMatchObject(tc.expected);
    }
  });

  it("rejects invalid short code region codes and numbers", () => {
    const cases: InvalidShortCodeCase[] = [
      { regionCode: "", number: "611", error: "shortCode.regionCode is required" },
      {
        regionCode: "AA",
        number: "611",
        error: "shortCode.regionCode must be a valid Unicode region subtag",
      },
      { regionCode: "US", number: "", error: "shortCode.number is required" },
      { regionCode: "US", number: "+611", error: "shortCode.number must contain digits only" },
      { regionCode: "US", number: "61A", error: "shortCode.number must contain digits only" },
    ];

    for (const tc of cases) {
      expect(() => phoneNumberShortCode(tc.regionCode, tc.number)).toThrow(tc.error);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(PhoneNumberSchema, {
        kind: { case: "e164Number", value: "+15552220123" },
        extension: "123",
      }),
      create(PhoneNumberSchema, {
        kind: {
          case: "shortCode",
          value: create(PhoneNumber_ShortCodeSchema, { regionCode: "US", number: "611" }),
        },
      }),
      create(PhoneNumberSchema, {
        kind: {
          case: "shortCode",
          value: create(PhoneNumber_ShortCodeSchema, { regionCode: "001", number: "12345" }),
        },
        extension: "123,#",
      }),
    ];
    const invalidCases = [
      create(PhoneNumberSchema, {}),
      create(PhoneNumberSchema, {
        kind: { case: "e164Number", value: "5552220123" },
      }),
      create(PhoneNumberSchema, {
        kind: {
          case: "shortCode",
          value: create(PhoneNumber_ShortCodeSchema, { regionCode: "AA", number: "611" }),
        },
      }),
      create(PhoneNumberSchema, {
        kind: {
          case: "shortCode",
          value: create(PhoneNumber_ShortCodeSchema, { regionCode: "US", number: "61A" }),
        },
      }),
      create(PhoneNumberSchema, {
        kind: { case: "e164Number", value: "+15552220123" },
        extension: "1".repeat(41),
      }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidPhoneNumber(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidPhoneNumber(tc)).toBe(false);
    }
  });

  it("reports short code validity without throwing", () => {
    const cases = [
      { value: phoneNumberShortCode("US", "611"), expected: true },
      {
        value: create(PhoneNumber_ShortCodeSchema, { regionCode: "AA", number: "611" }),
        expected: false,
      },
    ];

    for (const tc of cases) {
      expect(isValidPhoneNumberShortCode(tc.value)).toBe(tc.expected);
    }
  });

  it("reports phone number validity without throwing", () => {
    const cases = [
      { value: phoneNumber({ e164Number: "+15552220123" }), expected: true },
      { value: create(PhoneNumberSchema, {}), expected: false },
    ];

    for (const tc of cases) {
      expect(isValidPhoneNumber(tc.value)).toBe(tc.expected);
    }
  });

  it("validates raw generated short code messages separately from helper construction", () => {
    const validCases = [
      create(PhoneNumber_ShortCodeSchema, { regionCode: "US", number: "611" }),
      create(PhoneNumber_ShortCodeSchema, { regionCode: "BB", number: "211" }),
    ];
    const invalidCases = [
      create(PhoneNumber_ShortCodeSchema, { regionCode: "", number: "611" }),
      create(PhoneNumber_ShortCodeSchema, { regionCode: "AA", number: "611" }),
      create(PhoneNumber_ShortCodeSchema, { regionCode: "US", number: "+611" }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidPhoneNumberShortCode(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidPhoneNumberShortCode(tc)).toBe(false);
    }
  });
});
