import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { MoneySchema } from "../../gen/google/type/money_pb.js";
import { CURRENCY_CODES, type CurrencyCode, isCurrencyCode } from "./currency-codes.js";
import {
  assertValidMoney,
  isValidMoney,
  money,
  moneyFromDecimal,
  moneyToDecimal,
} from "./money.js";

const compileTimeCurrencyCode: CurrencyCode = "USD";

interface MoneyCase {
  currencyCode: CurrencyCode;
  units: bigint;
  nanos: number;
}

interface MoneyDecimalCase {
  currencyCode: CurrencyCode;
  value: string | number | bigint;
}

interface ValidMoneyCase extends MoneyCase {
  expected: {
    currencyCode: string;
    units: bigint;
    nanos: number;
  };
}

interface InvalidMoneyCase extends MoneyCase {
  error: string;
}

interface ValidMoneyDecimalCase extends MoneyDecimalCase {
  expected: {
    currencyCode: string;
    units: bigint;
    nanos: number;
  };
}

interface InvalidMoneyDecimalCase extends MoneyDecimalCase {
  error: string;
}

describe("google/type money helpers", () => {
  it("creates and validates money values", () => {
    expect(compileTimeCurrencyCode).toBe("USD");
    const validCases: ValidMoneyCase[] = [
      {
        currencyCode: "USD",
        units: 12n,
        nanos: 340_000_000,
        expected: { currencyCode: "USD", units: 12n, nanos: 340_000_000 },
      },
    ];
    const invalidCases: InvalidMoneyCase[] = [
      {
        currencyCode: "ZZZ" as CurrencyCode,
        units: 12n,
        nanos: 0,
        error: "currencyCode must be a supported ISO 4217 currency code",
      },
      {
        currencyCode: "USD",
        units: 12n,
        nanos: -1,
        error: "units and nanos must have the same sign",
      },
    ];

    for (const tc of validCases) {
      expect(money(tc.currencyCode, tc.units, tc.nanos)).toMatchObject(tc.expected);
    }
    for (const tc of invalidCases) {
      expect(() => money(tc.currencyCode, tc.units, tc.nanos)).toThrow(tc.error);
    }
  });

  it("parses decimal amounts", () => {
    const validCases: ValidMoneyDecimalCase[] = [
      {
        currencyCode: "USD",
        value: "12.34",
        expected: { currencyCode: "USD", units: 12n, nanos: 340_000_000 },
      },
      {
        currencyCode: "USD",
        value: "0.000000001",
        expected: { currencyCode: "USD", units: 0n, nanos: 1 },
      },
      {
        currencyCode: "USD",
        value: "-0.5",
        expected: { currencyCode: "USD", units: 0n, nanos: -500_000_000 },
      },
    ];
    const invalidCases: InvalidMoneyDecimalCase[] = [
      {
        currencyCode: "USD",
        value: "12.1234567891",
        error: "money amounts support at most 9 fractional digits",
      },
      {
        currencyCode: "USD",
        value: 1.2e21,
        error: "scientific notation is not supported for money amounts; pass a string instead",
      },
    ];

    for (const tc of validCases) {
      expect(moneyFromDecimal(tc.currencyCode, tc.value)).toMatchObject(tc.expected);
    }
    for (const tc of invalidCases) {
      expect(() => moneyFromDecimal(tc.currencyCode, tc.value)).toThrow(tc.error);
    }
  });

  it("formats decimal amounts", () => {
    const cases = [
      { value: money("USD", 12n, 340_000_000), expected: "12.34" },
      { value: money("USD", -12n, -340_000_000), expected: "-12.34" },
      { value: money("USD", 12n, 0), expected: "12" },
      { value: money("USD", 0n, -1), expected: "-0.000000001" },
    ];

    for (const tc of cases) {
      expect(moneyToDecimal(tc.value)).toBe(tc.expected);
    }
  });

  it("round-trips decimal values through helper formatting", () => {
    const cases = [
      money("USD", 12n, 340_000_000),
      money("USD", -12n, -340_000_000),
      money("USD", 0n, 1),
      money("USD", 0n, -500_000_000),
      money("USD", 999n, 999_999_999),
    ];

    for (const tc of cases) {
      expect(moneyFromDecimal(tc.currencyCode as CurrencyCode, moneyToDecimal(tc))).toEqual(tc);
    }
  });

  it("exports supported currency codes", () => {
    const containsCases = ["USD", "EUR"];
    const validityCases = [
      { value: "USD", expected: true },
      { value: "usd", expected: false },
      { value: "ZZZ", expected: false },
    ];

    for (const tc of containsCases) {
      expect(CURRENCY_CODES).toContain(tc);
    }
    for (const tc of validityCases) {
      expect(isCurrencyCode(tc.value)).toBe(tc.expected);
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      { value: money("USD", 1n, 0), expected: true },
      {
        value: create(MoneySchema, {
          currencyCode: "ZZZ",
          units: 1n,
        }),
        expected: false,
      },
    ];

    for (const tc of cases) {
      expect(isValidMoney(tc.value)).toBe(tc.expected);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(MoneySchema, { currencyCode: "USD", units: 0n, nanos: 0 }),
      create(MoneySchema, { currencyCode: "USD", units: 0n, nanos: -1 }),
      create(MoneySchema, { currencyCode: "USD", units: -1n, nanos: -999_999_999 }),
    ];
    const invalidCases = [
      create(MoneySchema, { currencyCode: "ZZZ", units: 1n, nanos: 0 }),
      create(MoneySchema, { currencyCode: "USD", units: 1n, nanos: -1 }),
      create(MoneySchema, { currencyCode: "USD", units: -1n, nanos: 1 }),
      create(MoneySchema, { currencyCode: "USD", units: 0n, nanos: 1_000_000_000 }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidMoney(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidMoney(tc)).toBe(false);
    }
  });
});
