import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { LatLngSchema } from "../../gen/google/type/latlng_pb.js";
import { assertValidLatLng, isValidLatLng, latLng } from "./latlng.js";

interface ValidLatLngCase {
  latitude: number;
  longitude: number;
  expected: {
    latitude: number;
    longitude: number;
  };
}

interface InvalidLatLngCase {
  latitude: number;
  longitude: number;
  error: string;
}

describe("google/type latlng helpers", () => {
  it("creates valid coordinates across protobuf normalized boundaries", () => {
    const cases: ValidLatLngCase[] = [
      { latitude: 0, longitude: 0, expected: { latitude: 0, longitude: 0 } },
      { latitude: -90, longitude: -180, expected: { latitude: -90, longitude: -180 } },
      { latitude: 90, longitude: 180, expected: { latitude: 90, longitude: 180 } },
      {
        latitude: 37.422,
        longitude: -122.084,
        expected: { latitude: 37.422, longitude: -122.084 },
      },
    ];

    for (const tc of cases) {
      expect(latLng(tc.latitude, tc.longitude)).toMatchObject(tc.expected);
    }
  });

  it("rejects coordinates outside protobuf normalized ranges", () => {
    const cases: InvalidLatLngCase[] = [
      { latitude: -90.000_001, longitude: 0, error: "latitude out of range" },
      { latitude: 90.000_001, longitude: 0, error: "latitude out of range" },
      { latitude: 0, longitude: -180.000_001, error: "longitude out of range" },
      { latitude: 0, longitude: 180.000_001, error: "longitude out of range" },
      { latitude: Number.NaN, longitude: 0, error: "latitude must be finite" },
      { latitude: 0, longitude: Number.POSITIVE_INFINITY, error: "longitude must be finite" },
    ];

    for (const tc of cases) {
      expect(() => latLng(tc.latitude, tc.longitude)).toThrow(tc.error);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(LatLngSchema, { latitude: 0, longitude: 0 }),
      create(LatLngSchema, { latitude: -90, longitude: 180 }),
      create(LatLngSchema, { latitude: 90, longitude: -180 }),
    ];
    const invalidCases = [
      create(LatLngSchema, { latitude: -91, longitude: 0 }),
      create(LatLngSchema, { latitude: 0, longitude: 181 }),
      create(LatLngSchema, { latitude: Number.NaN, longitude: 0 }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidLatLng(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidLatLng(tc)).toBe(false);
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      { value: latLng(51.5074, -0.1278), expected: true },
      { value: create(LatLngSchema, { latitude: 0, longitude: 200 }), expected: false },
    ];

    for (const tc of cases) {
      expect(isValidLatLng(tc.value)).toBe(tc.expected);
    }
  });
});
