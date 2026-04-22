import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { PostalAddressSchema } from "../../gen/google/type/postal_address_pb.js";
import { assertValidPostalAddress, isValidPostalAddress, postalAddress } from "./postal-address.js";

interface ValidPostalAddressCase {
  input: {
    revision?: number;
    regionCode: string;
    languageCode?: string;
    postalCode?: string;
    sortingCode?: string;
    administrativeArea?: string;
    locality?: string;
    sublocality?: string;
    addressLines?: string[];
    recipients?: string[];
    organization?: string;
  };
  expected: {
    revision: number;
    regionCode: string;
    languageCode?: string;
    postalCode?: string;
    sortingCode?: string;
    administrativeArea?: string;
    locality?: string;
    sublocality?: string;
    addressLines?: string[];
    recipients?: string[];
    organization?: string;
  };
}

interface InvalidPostalAddressCase {
  input: {
    revision?: number;
    regionCode: string;
    languageCode?: string;
    postalCode?: string;
    sortingCode?: string;
    administrativeArea?: string;
    locality?: string;
    sublocality?: string;
    addressLines?: string[];
    recipients?: string[];
    organization?: string;
  };
  error: string;
}

describe("google/type postal address helpers", () => {
  it("creates valid addresses from structured and unstructured protobuf shapes", () => {
    const cases: ValidPostalAddressCase[] = [
      {
        input: {
          regionCode: "US",
          addressLines: ["1600 Amphitheatre Pkwy"],
          locality: "Mountain View",
          administrativeArea: "CA",
          postalCode: "94043",
        },
        expected: {
          revision: 0,
          regionCode: "US",
          addressLines: ["1600 Amphitheatre Pkwy"],
          locality: "Mountain View",
          administrativeArea: "CA",
          postalCode: "94043",
        },
      },
      {
        input: {
          regionCode: "CH",
          languageCode: "de",
          addressLines: ["Paradeplatz 1"],
          postalCode: "8001",
          locality: "Zuerich",
        },
        expected: {
          revision: 0,
          regionCode: "CH",
          languageCode: "de",
          addressLines: ["Paradeplatz 1"],
          postalCode: "8001",
          locality: "Zuerich",
        },
      },
      {
        input: {
          regionCode: "JP",
          languageCode: "ja",
          addressLines: ["東京都千代田区千代田1-1"],
          recipients: ["山田 太郎"],
          organization: "株式会社サンプル",
        },
        expected: {
          revision: 0,
          regionCode: "JP",
          languageCode: "ja",
          addressLines: ["東京都千代田区千代田1-1"],
          recipients: ["山田 太郎"],
          organization: "株式会社サンプル",
        },
      },
    ];

    for (const tc of cases) {
      expect(postalAddress(tc.input)).toMatchObject(tc.expected);
    }
  });

  it("rejects invalid revision, region code, and language code values", () => {
    const cases: InvalidPostalAddressCase[] = [
      {
        input: { regionCode: "", addressLines: ["1600 Amphitheatre Pkwy"] },
        error: "regionCode is required",
      },
      {
        input: { regionCode: "AA", addressLines: ["1600 Amphitheatre Pkwy"] },
        error: "regionCode must be a valid CLDR region code",
      },
      {
        input: { revision: 1, regionCode: "US", addressLines: ["1600 Amphitheatre Pkwy"] },
        error: "revision must be 0",
      },
      {
        input: {
          regionCode: "US",
          languageCode: "en_US",
          addressLines: ["1600 Amphitheatre Pkwy"],
        },
        error: "languageCode must be a valid BCP 47 language tag",
      },
    ];

    for (const tc of cases) {
      expect(() => postalAddress(tc.input)).toThrow(tc.error);
    }
  });

  it("accepts protobuf-minimal unstructured addresses with regionCode and addressLines", () => {
    const cases = [
      {
        value: postalAddress({
          regionCode: "US",
          addressLines: ["1600 Amphitheatre Parkway", "Mountain View, CA 94043"],
        }),
        expected: {
          revision: 0,
          regionCode: "US",
          addressLines: ["1600 Amphitheatre Parkway", "Mountain View, CA 94043"],
        },
      },
    ];

    for (const tc of cases) {
      expect(tc.value).toMatchObject(tc.expected);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(PostalAddressSchema, {
        revision: 0,
        regionCode: "US",
        addressLines: ["1600 Amphitheatre Pkwy"],
      }),
      create(PostalAddressSchema, {
        revision: 0,
        regionCode: "CH",
        languageCode: "de",
        postalCode: "8001",
      }),
    ];
    const invalidCases = [
      create(PostalAddressSchema, { revision: 1, regionCode: "US" }),
      create(PostalAddressSchema, { revision: 0, regionCode: "" }),
      create(PostalAddressSchema, { revision: 0, regionCode: "AA" }),
      create(PostalAddressSchema, { revision: 0, regionCode: "US", languageCode: "en_US" }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidPostalAddress(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidPostalAddress(tc)).toBe(false);
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      {
        value: postalAddress({
          regionCode: "US",
          addressLines: ["1600 Amphitheatre Pkwy"],
          postalCode: "94043",
        }),
        expected: true,
      },
      {
        value: create(PostalAddressSchema, { revision: 1, regionCode: "US" }),
        expected: false,
      },
    ];

    for (const tc of cases) {
      expect(isValidPostalAddress(tc.value)).toBe(tc.expected);
    }
  });
});
