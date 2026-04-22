import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { ColorSchema } from "../../gen/google/type/color_pb.js";
import { assertValidColor, color, isValidColor } from "./color.js";

interface ValidColorCase {
  red: number;
  green: number;
  blue: number;
  alpha?: number;
  expected: {
    red: number;
    green: number;
    blue: number;
    alpha?: number;
  };
}

interface InvalidColorCase {
  red: number;
  green: number;
  blue: number;
  alpha?: number;
  error: string;
}

describe("google/type color helpers", () => {
  it("creates valid colors across protobuf channel boundaries", () => {
    const cases: ValidColorCase[] = [
      { red: 0, green: 0, blue: 0, expected: { red: 0, green: 0, blue: 0 } },
      { red: 1, green: 1, blue: 1, expected: { red: 1, green: 1, blue: 1 } },
      {
        red: 0.25,
        green: 0.5,
        blue: 0.75,
        alpha: 0.4,
        expected: { red: 0.25, green: 0.5, blue: 0.75, alpha: 0.4 },
      },
    ];

    for (const tc of cases) {
      expect(color(tc.red, tc.green, tc.blue, tc.alpha)).toMatchObject(tc.expected);
    }
  });

  it("rejects invalid color channel values", () => {
    const cases: InvalidColorCase[] = [
      { red: -0.01, green: 0, blue: 0, error: "red out of range" },
      { red: 0, green: 1.01, blue: 0, error: "green out of range" },
      { red: 0, green: 0, blue: -1, error: "blue out of range" },
      { red: 0, green: 0, blue: 0, alpha: 1.01, error: "alpha out of range" },
      { red: Number.NaN, green: 0, blue: 0, error: "red must be finite" },
    ];

    for (const tc of cases) {
      expect(() => color(tc.red, tc.green, tc.blue, tc.alpha)).toThrow(tc.error);
    }
  });

  it("treats omitted alpha as valid and preserves explicit alpha values", () => {
    const cases = [
      { value: color(0.1, 0.2, 0.3), expected: undefined },
      { value: color(0.1, 0.2, 0.3, 1), expected: 1 },
      { value: color(0.1, 0.2, 0.3, 0), expected: 0 },
    ];

    for (const tc of cases) {
      expect(tc.value.alpha).toBe(tc.expected);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(ColorSchema, { red: 0, green: 0, blue: 0 }),
      create(ColorSchema, { red: 1, green: 1, blue: 1, alpha: 1 }),
      create(ColorSchema, { red: 0.5, green: 0.5, blue: 0.5, alpha: 0 }),
    ];
    const invalidCases = [
      create(ColorSchema, { red: -0.01, green: 0, blue: 0 }),
      create(ColorSchema, { red: 0, green: 2, blue: 0 }),
      create(ColorSchema, { red: 0, green: 0, blue: 0, alpha: Number.POSITIVE_INFINITY }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidColor(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidColor(tc)).toBe(false);
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      { value: color(0.2, 0.4, 0.6, 0.8), expected: true },
      { value: create(ColorSchema, { red: 0, green: 0, blue: 2 }), expected: false },
    ];

    for (const tc of cases) {
      expect(isValidColor(tc.value)).toBe(tc.expected);
    }
  });
});
