import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { DecimalSchema } from "../../gen/google/type/decimal_pb.js";
import {
  assertValidDecimal,
  decimal,
  decimalFromString,
  decimalToString,
  isValidDecimal,
} from "./decimal.js";

interface DecimalNormalizationCase {
  input: string;
  expected: string;
}

describe("google/type decimal helpers", () => {
  it("creates and validates decimal values across supported inputs", () => {
    const cases = [
      { input: "12.34", expected: "12.34" },
      { input: ".5", expected: "0.5" },
      { input: "+00012.3400", expected: "12.3400" },
      { input: "1E+05", expected: "1e5" },
      { input: 12.34, expected: "12.34" },
      { input: 12n, expected: "12" },
      { input: -0.5, expected: "-0.5" },
    ];

    for (const tc of cases) {
      expect(decimal(tc.input)).toMatchObject({ value: tc.expected });
    }
  });

  it("rejects invalid decimal values", () => {
    const cases = ["", "+", ".", "1..2", "1e", "1e+", "1_000", "NaN"];

    for (const tc of cases) {
      expect(() => decimal(tc)).toThrow("invalid google.type.Decimal string");
    }

    expect(() => decimal(Number.NaN)).toThrow("decimal value must be finite");
    expect(() => decimal(Number.POSITIVE_INFINITY)).toThrow("decimal value must be finite");
  });

  it("normalizes the protobuf-recommended decimal forms", () => {
    const cases: DecimalNormalizationCase[] = [
      { input: "0", expected: "0" },
      { input: "+0", expected: "0" },
      { input: "-0", expected: "0" },
      { input: ".5", expected: "0.5" },
      { input: "00012.3400", expected: "12.3400" },
      { input: "12.", expected: "12" },
      { input: "1E+05", expected: "1e5" },
      { input: "1e000", expected: "1" },
      { input: "-001.2300e-004", expected: "-1.2300e-4" },
      { input: "0.00e+000", expected: "0" },
      { input: "-0.00e-2", expected: "0e-2" },
    ];

    for (const tc of cases) {
      expect(decimalToString(decimalFromString(tc.input))).toBe(tc.expected);
    }
  });

  it("preserves precision when no helper-level scale limit is configured", () => {
    const cases = [
      "1.123456789012345678901234567890",
      "-0.000000000000000000000000000001",
      "9.999999999999999999999999999999e99",
      "1.2300",
      "2.5e-1",
    ];

    for (const tc of cases) {
      expect(decimalToString(decimalFromString(tc))).toBe(decimal(tc).value);
    }
  });

  it("rejects non-protobuf separators and locale-specific formatting", () => {
    const cases = ["1,23", "1,234.56", "1 234.56", "1_234.56"];

    for (const tc of cases) {
      expect(() => decimalFromString(tc)).toThrow("invalid google.type.Decimal string");
    }
  });

  it("round-trips helper-created values through string form", () => {
    const cases = [
      decimal("0"),
      decimal("12.34"),
      decimal("-1.2300e-4"),
      decimal("1000"),
      decimal("0.000000001"),
    ];

    for (const tc of cases) {
      expect(decimalFromString(decimalToString(tc))).toEqual(tc);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(DecimalSchema, { value: "+2.5" }),
      create(DecimalSchema, { value: ".5" }),
      create(DecimalSchema, { value: "12." }),
      create(DecimalSchema, { value: "1E+05" }),
    ];
    const invalidCases = [
      create(DecimalSchema, { value: "" }),
      create(DecimalSchema, { value: "." }),
      create(DecimalSchema, { value: "1e" }),
      create(DecimalSchema, { value: "1..0" }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidDecimal(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidDecimal(tc)).toBe(false);
    }
  });

  it("reports validity without throwing", () => {
    expect(isValidDecimal(decimal("12.34"))).toBe(true);
    expect(isValidDecimal(create(DecimalSchema, { value: "12e" }))).toBe(false);
  });
});
