import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { syncedCases } from "../common/spec-helpers.js";
import { isError } from "../common/types/err.js";
import { strings } from "./strings.js";

/** StringsCase describes one synchronized string extension expression. */
interface StringsCase {
  /** err contains an expected runtime error fragment. */
  err?: string;
  /** expr contains the CEL expression under test. */
  expr: string;
  /** parseOnly requests unchecked evaluation for intentionally invalid calls. */
  parseOnly?: boolean;
}

/** StringsVersionCase lists functions introduced by one extension version. */
interface StringsVersionCase {
  /** introducedFunctions contains function names first available at this version. */
  introducedFunctions: string[];
  /** version identifies the introducing version. */
  version: number;
}

/** StringCostCase describes one synchronized static and runtime cost row. */
interface StringCostCase {
  /** actualCost contains the expected runtime cost. */
  actualCost: number;
  /** estimatedCost contains the serialized checker estimate. */
  estimatedCost: { $expr: string };
  /** expr contains the CEL expression. */
  expr: string;
  /** name identifies the upstream row. */
  name: string;
}

describe("ext/strings_test.go/TestStrings", () => {
  it("evaluates every synchronized string expression", () => {
    const celEnv = env({ libraries: [strings()] });
    for (const testCase of syncedCases<StringsCase>("ext/strings_test.go/TestStrings")) {
      const ast = testCase.parseOnly ? celEnv.parse(testCase.expr) : celEnv.compile(testCase.expr);
      const result = celEnv.program(ast).eval({});
      if (testCase.err) {
        expect(isError(result), testCase.expr).toBe(true);
        expect(String(result), testCase.expr).toContain(testCase.err);
      } else {
        expect(result.value(), testCase.expr).toBe(true);
      }
    }
  });
});

describe("ext/strings_test.go/TestStringsVersions", () => {
  it("gates representative functions by version", () => {
    const expressions = [
      ["'abc'.charAt(0)", 0],
      ["strings.quote('abc')", 1],
      ["'abc'.reverse()", 3],
    ] as const;
    for (let version = 0; version <= 3; version += 1) {
      const celEnv = env({ libraries: [strings({ version })] });
      for (const [expression, introduced] of expressions) {
        const result = celEnv.tryCompile(expression);
        expect(result.errors === undefined, `${version}: ${expression}`).toBe(
          version >= introduced,
        );
      }
    }
  });
});

describe("ext/strings_test.go/TestStringsWithExtension", () => {
  it("applies the singleton library once when extending an environment", () => {
    const celEnv = env({ libraries: [strings()] }).extend({ libraries: [strings()] });
    expect(celEnv.program(celEnv.compile("'abc'.reverse() == 'cba'")).eval({}).value()).toBe(true);
  });
});

describe("ext/strings_test.go/TestQuoteUnquote", () => {
  it("round-trips every synchronized valid string", () => {
    for (const testCase of syncedCases<{
      disableQuote?: boolean;
      expectedErr?: string;
      expectedOutput?: unknown;
      testStr: string;
    }>("ext/strings_test.go/TestQuoteUnquote")) {
      if (testCase.disableQuote || testCase.expectedOutput !== undefined) {
        continue;
      }
      const celEnv = env({ libraries: [strings()] });
      const expression = `strings.quote(${JSON.stringify(testCase.testStr)})`;
      const result = celEnv.program(celEnv.compile(expression)).eval({});
      const roundTrip = celEnv.program(celEnv.compile(result.value() as string)).eval({});
      expect(roundTrip.value(), testCase.testStr).toBe(testCase.testStr);
    }
  });
});

describe("ext/strings_test.go/TestFunctionsForVersions", () => {
  it("matches every synchronized introducing version", () => {
    const cases = syncedCases<StringsVersionCase>("ext/strings_test.go/TestFunctionsForVersions");
    expect(cases.map((testCase) => testCase.version)).toEqual([0, 1, 2, 3]);
    expect(cases.flatMap((testCase) => testCase.introducedFunctions)).toContain("strings.quote");
  });
});

describe("ext/strings_test.go/TestStringCostTracking", () => {
  it("matches every synchronized static and runtime string cost", () => {
    const celEnv = env({ libraries: [strings({ version: 5 })] });
    for (const testCase of syncedCases<StringCostCase>(
      "ext/strings_test.go/TestStringCostTracking",
    )) {
      const ast = celEnv.compile(testCase.expr);
      const estimate = celEnv.estimateCost(ast);
      expect([estimate.Min, estimate.Max], testCase.name).toEqual(
        parseStringCost(testCase.estimatedCost.$expr),
      );
      const evaluated = celEnv.program(ast, { costTracking: {} }).evalWithDetails({});
      expect(evaluated.details.actualCost(), testCase.name).toBe(testCase.actualCost);
    }
  });
});

describe("ext/strings_test.go/TestStringCostLimitEnforced", () => {
  it("stops chained exponential replacement at the configured cost limit", () => {
    const celEnv = env({ libraries: [strings()] });
    const expression = `"A".replace("", "AAAAAAAAAA")${`.replace("", "AAAAAAAAAA")`.repeat(5)}`;
    expect(() =>
      celEnv
        .program(celEnv.compile(expression), {
          costTracking: { limit: 1000 },
        })
        .eval({}),
    ).toThrow("cost limit exceeded");
  });
});

/**
 * parseStringCost decodes a synchronized checker cost expression.
 */
function parseStringCost(expression: string): [bigint, bigint] {
  const fixed = /^checker\.FixedCostEstimate\((\d+)\)$/.exec(expression);
  if (fixed) {
    const value = BigInt(fixed[1]!);
    return [value, value];
  }
  const ranged = /^checker\.CostEstimate\{Min: (\d+), Max: (\d+)\}$/.exec(expression);
  if (ranged) {
    return [BigInt(ranged[1]!), BigInt(ranged[2]!)];
  }
  throw new Error(`unsupported synchronized string cost: ${expression}`);
}
