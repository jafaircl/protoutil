import { create } from "@bufbuild/protobuf";
import { InvalidValueError } from "../../errors.js";
import {
  type PostalAddress,
  PostalAddressSchema,
} from "../../gen/google/type/postal_address_pb.js";
import { assertValidInt32 } from "../../int32.js";
import { assertValidRegionCode, isValidLanguageCode } from "./locale-codes.js";

export interface PostalAddressInput {
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
}

/**
 * Creates a validated `google.type.PostalAddress` value.
 *
 * `regionCode` is required and must be a valid CLDR / Unicode region code such
 * as `"CH"` or `"US"`. `revision` defaults to `0`, which is the only supported
 * protobuf schema revision. All other fields are optional and follow the
 * protobuf wire shape directly.
 */
export function postalAddress(input: PostalAddressInput) {
  const value = create(PostalAddressSchema, {
    revision: input.revision ?? 0,
    regionCode: input.regionCode,
    languageCode: input.languageCode ?? "",
    postalCode: input.postalCode ?? "",
    sortingCode: input.sortingCode ?? "",
    administrativeArea: input.administrativeArea ?? "",
    locality: input.locality ?? "",
    sublocality: input.sublocality ?? "",
    addressLines: input.addressLines ?? [],
    recipients: input.recipients ?? [],
    organization: input.organization ?? "",
  });
  assertValidPostalAddress(value);
  return value;
}

/**
 * Asserts that a `google.type.PostalAddress` is structurally valid.
 *
 * `revision` must be `0`. `regionCode` must be a valid CLDR / Unicode region
 * code. `languageCode`, when present, must be a valid BCP 47 language tag.
 * This helper does not impose country-specific address rules beyond what the
 * protobuf docs require.
 */
export function assertValidPostalAddress(value: PostalAddress): asserts value is PostalAddress {
  assertValidInt32(value.revision);
  if (value.revision !== 0) {
    throw new InvalidValueError("revision must be 0", value.revision);
  }

  if (!value.regionCode) {
    throw new InvalidValueError("regionCode is required", value);
  }
  assertValidRegionCode(value.regionCode);

  if (value.languageCode !== "" && !isValidLanguageCode(value.languageCode)) {
    throw new InvalidValueError("languageCode must be a valid BCP 47 language tag", value);
  }

  assertStringField("postalCode", value.postalCode);
  assertStringField("sortingCode", value.sortingCode);
  assertStringField("administrativeArea", value.administrativeArea);
  assertStringField("locality", value.locality);
  assertStringField("sublocality", value.sublocality);
  assertStringField("organization", value.organization);
  assertStringList("addressLines", value.addressLines);
  assertStringList("recipients", value.recipients);
}

/**
 * Returns `true` when the value is a valid `google.type.PostalAddress`.
 */
export function isValidPostalAddress(value: PostalAddress): value is PostalAddress {
  try {
    assertValidPostalAddress(value);
    return true;
  } catch {
    return false;
  }
}

function assertStringField(name: string, value: string) {
  if (typeof value !== "string") {
    throw new InvalidValueError(`${name} must be a string`, value);
  }
}

function assertStringList(name: string, value: string[]) {
  if (!Array.isArray(value)) {
    throw new InvalidValueError(`${name} must be an array of strings`, value);
  }
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new InvalidValueError(`${name} must contain only strings`, value);
    }
  }
}
