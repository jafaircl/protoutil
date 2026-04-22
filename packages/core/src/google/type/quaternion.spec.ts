import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { QuaternionSchema } from "../../gen/google/type/quaternion_pb.js";
import { assertValidQuaternion, isValidQuaternion, quaternion } from "./quaternion.js";

interface ValidQuaternionCase {
  x: number;
  y: number;
  z: number;
  w: number;
  expected: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
}

interface InvalidQuaternionCase {
  x: number;
  y: number;
  z: number;
  w: number;
  error: string;
}

describe("google/type quaternion helpers", () => {
  it("creates valid quaternions from finite real-number components", () => {
    const cases: ValidQuaternionCase[] = [
      { x: 0, y: 0, z: 0, w: 1, expected: { x: 0, y: 0, z: 0, w: 1 } },
      { x: 1, y: 0, z: 0, w: 0, expected: { x: 1, y: 0, z: 0, w: 0 } },
      {
        x: 0.5,
        y: -0.5,
        z: 0.5,
        w: -0.5,
        expected: { x: 0.5, y: -0.5, z: 0.5, w: -0.5 },
      },
    ];

    for (const tc of cases) {
      expect(quaternion(tc.x, tc.y, tc.z, tc.w)).toMatchObject(tc.expected);
    }
  });

  it("rejects non-finite quaternion components", () => {
    const cases: InvalidQuaternionCase[] = [
      { x: Number.NaN, y: 0, z: 0, w: 1, error: "x must be finite" },
      { x: 0, y: Number.POSITIVE_INFINITY, z: 0, w: 1, error: "y must be finite" },
      { x: 0, y: 0, z: Number.NEGATIVE_INFINITY, w: 1, error: "z must be finite" },
      { x: 0, y: 0, z: 0, w: Number.NaN, error: "w must be finite" },
    ];

    for (const tc of cases) {
      expect(() => quaternion(tc.x, tc.y, tc.z, tc.w)).toThrow(tc.error);
    }
  });

  it("accepts unit, non-unit, and sign-flipped quaternions without normalization", () => {
    const cases = [
      { value: quaternion(0, 0, 0, 1), expected: { x: 0, y: 0, z: 0, w: 1 } },
      { value: quaternion(0, 0, 0, -1), expected: { x: 0, y: 0, z: 0, w: -1 } },
      { value: quaternion(2, 0, 0, 0), expected: { x: 2, y: 0, z: 0, w: 0 } },
    ];

    for (const tc of cases) {
      expect(tc.value).toMatchObject(tc.expected);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(QuaternionSchema, { x: 0, y: 0, z: 0, w: 1 }),
      create(QuaternionSchema, { x: 0.5, y: -0.5, z: 0.5, w: -0.5 }),
      create(QuaternionSchema, { x: 2, y: 0, z: 0, w: 0 }),
    ];
    const invalidCases = [
      create(QuaternionSchema, { x: Number.NaN, y: 0, z: 0, w: 1 }),
      create(QuaternionSchema, { x: 0, y: Number.POSITIVE_INFINITY, z: 0, w: 1 }),
      create(QuaternionSchema, { x: 0, y: 0, z: 0, w: Number.NEGATIVE_INFINITY }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidQuaternion(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidQuaternion(tc)).toBe(false);
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      { value: quaternion(0.5, -0.5, 0.5, -0.5), expected: true },
      { value: create(QuaternionSchema, { x: 0, y: 0, z: Number.NaN, w: 1 }), expected: false },
    ];

    for (const tc of cases) {
      expect(isValidQuaternion(tc.value)).toBe(tc.expected);
    }
  });
});
