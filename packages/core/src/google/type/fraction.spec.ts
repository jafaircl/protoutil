import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { FractionSchema } from "../../gen/google/type/fraction_pb.js";
import {
  assertValidFraction,
  fraction,
  fractionFromString,
  fractionToString,
  isValidFraction,
} from "./fraction.js";

interface ValidFractionCase {
  numerator: bigint;
  denominator: bigint;
}

interface InvalidFractionCase {
  numerator: bigint;
  denominator: bigint;
  error: string;
}

describe("google/type fraction helpers", () => {
  it("creates and validates fractions across boundaries", () => {
    const cases: ValidFractionCase[] = [
      { numerator: 0n, denominator: 1n },
      { numerator: 1n, denominator: 2n },
      { numerator: -3n, denominator: 4n },
      { numerator: 10n, denominator: 10n },
      { numerator: 1n, denominator: 3n },
    ];

    for (const tc of cases) {
      expect(fraction(tc.numerator, tc.denominator)).toMatchObject(tc);
    }
  });

  it("rejects invalid denominators", () => {
    const cases: InvalidFractionCase[] = [
      { numerator: 1n, denominator: 0n, error: "denominator must be positive" },
      { numerator: 1n, denominator: -1n, error: "denominator must be positive" },
    ];

    for (const tc of cases) {
      expect(() => fraction(tc.numerator, tc.denominator)).toThrow(tc.error);
    }
  });

  it("parses fraction strings", () => {
    const cases = [
      { input: "12/34", expected: { numerator: 12n, denominator: 34n } },
      { input: "-5/10", expected: { numerator: -5n, denominator: 10n } },
      { input: "2/3", expected: { numerator: 2n, denominator: 3n } },
      { input: "3", expected: { numerator: 3n, denominator: 1n } },
      { input: "  7/8  ", expected: { numerator: 7n, denominator: 8n } },
    ];

    for (const tc of cases) {
      expect(fractionFromString(tc.input)).toMatchObject(tc.expected);
    }
  });

  it("rejects invalid fraction strings", () => {
    const cases = [
      { input: "", error: "invalid google.type.Fraction string" },
      { input: "1/0", error: "denominator must be positive" },
      { input: "1/-2", error: "invalid google.type.Fraction string" },
      { input: "1e3", error: "invalid google.type.Fraction string" },
    ];

    for (const tc of cases) {
      expect(() => fractionFromString(tc.input)).toThrow(tc.error);
    }
  });

  it("formats fractions as canonical fraction strings", () => {
    const cases = [
      { value: fraction(1n, 2n), expected: "1/2" },
      { value: fraction(-3n, 4n), expected: "-3/4" },
      { value: fraction(12n, 1n), expected: "12/1" },
      { value: fraction(2n, 3n), expected: "2/3" },
    ];

    for (const tc of cases) {
      expect(fractionToString(tc.value)).toBe(tc.expected);
    }
  });

  it("round-trips helper-created values through string form", () => {
    const cases = [fraction(1n, 2n), fraction(-3n, 4n), fraction(12n, 1n), fraction(2n, 3n)];

    for (const tc of cases) {
      expect(fractionFromString(fractionToString(tc))).toEqual(tc);
    }
  });

  it("parses whole-number shorthand and formats canonically", () => {
    const cases = [
      { input: "3", expected: fraction(3n, 1n), canonical: "3/1" },
      { input: "-12", expected: fraction(-12n, 1n), canonical: "-12/1" },
    ];

    for (const tc of cases) {
      expect(fractionFromString(tc.input)).toEqual(tc.expected);
      expect(fractionToString(fractionFromString(tc.input))).toBe(tc.canonical);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(FractionSchema, { numerator: 0n, denominator: 1n }),
      create(FractionSchema, { numerator: -5n, denominator: 10n }),
    ];
    const invalidCases = [
      create(FractionSchema, { numerator: 1n, denominator: 0n }),
      create(FractionSchema, { numerator: 1n, denominator: -1n }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidFraction(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidFraction(tc)).toBe(false);
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      { value: fraction(1n, 2n), expected: true },
      { value: create(FractionSchema, { numerator: 1n, denominator: 0n }), expected: false },
    ];

    for (const tc of cases) {
      expect(isValidFraction(tc.value)).toBe(tc.expected);
    }
  });
});
