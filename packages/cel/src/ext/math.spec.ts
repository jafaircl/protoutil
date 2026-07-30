import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { type CostEstimator, sizeEstimate } from "../checker/cost.js";
import { functionDecl, memberOverload, variableDecl } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import type { Int } from "../common/types/int.js";
import type { Val } from "../common/types/ref/index.js";
import {
  resolveSyncedExpr,
  resolveSyncedVariableDecl,
} from "../common/types/spec-helpers.js";
import { DoubleType, DynType, IntType, listType } from "../common/types/types.js";
import { math } from "./math.js";

/** MathCase describes a synchronized successful math evaluation. */
interface MathCase {
  /** expr contains a CEL expression whose result must be true. */
  expr: string;
  /** in contains native activation bindings. */
  in?: Record<string, unknown>;
}

/** MathErrorCase describes a synchronized compile-time or runtime failure. */
interface MathErrorCase extends MathCase {
  /** err contains the expected error fragment. */
  err: string;
}

/** MathVersionCase describes the functions introduced by a library version. */
interface MathVersionCase {
  /** supportedFunctions maps function labels to successful CEL expressions. */
  supportedFunctions: Record<string, string>;
  /** version identifies the introducing extension version. */
  version: number;
}

/** MathCostCase describes one synchronized checker and runtime cost row. */
interface MathCostCase extends MathCase {
  /** actualCost contains CEL-Go's runtime cost. */
  actualCost: number;
  /** estimatedCost contains CEL-Go's serialized checker estimate. */
  estimatedCost: { $expr: string };
  /** hints contains size estimates keyed by checked path. */
  hints?: Record<string, number>;
  /** name identifies the upstream row. */
  name: string;
  /** vars contains serialized variable declarations. */
  vars?: Array<{ $expr: string }>;
  /** version selects the extension cost model. */
  version: number;
}

describe("ext/math_test.go/TestMath", () => {
  it("evaluates every synchronized math expression", () => {
    const celEnv = mathEnv();
    for (const testCase of syncedCases<MathCase>("ext/math_test.go/TestMath")) {
      const result = celEnv.program(celEnv.compile(testCase.expr)).eval(testCase.in ?? {});
      expect(result.value(), testCase.expr).toBe(true);
    }
  });
});

describe("ext/math_test.go/TestMathStaticErrors", () => {
  it("reports every synchronized macro error", () => {
    const celEnv = mathEnv();
    for (const testCase of syncedCases<MathErrorCase>("ext/math_test.go/TestMathStaticErrors")) {
      expect(celEnv.tryCompile(testCase.expr).errors?.toDisplayString(), testCase.expr).toContain(
        testCase.err,
      );
    }
  });
});

describe("ext/math_test.go/TestMathRuntimeErrors", () => {
  it("reports every synchronized runtime error", () => {
    const celEnv = mathEnv();
    for (const testCase of syncedCases<MathErrorCase>("ext/math_test.go/TestMathRuntimeErrors")) {
      const result = celEnv.program(celEnv.compile(testCase.expr)).eval(testCase.in ?? {});
      expect(String(result), testCase.expr).toContain(testCase.err);
    }
  });
});

describe("ext/math_test.go/TestMathNonMatch", () => {
  it("leaves receiver calls outside the math namespace unexpanded", () => {
    const greatest = functionDecl("greatest", {
      overloads: [
        memberOverload("int_greatest_int", [IntType, IntType], IntType, {
          binaryBinding: (left, right) => numericPair({ left, operation: "greatest", right }),
        }),
      ],
    });
    const least = functionDecl("least", {
      overloads: [
        memberOverload("int_least_int", [IntType, IntType], IntType, {
          binaryBinding: (left, right) => numericPair({ left, operation: "least", right }),
        }),
      ],
    });
    const celEnv = env({ functions: [greatest, least], libraries: [math()] });
    for (const testCase of syncedCases<MathCase>("ext/math_test.go/TestMathNonMatch")) {
      expect(celEnv.program(celEnv.compile(testCase.expr)).eval({}).value()).toBe(true);
    }
  });
});

describe("ext/math_test.go/TestMathWithExtension", () => {
  it("applies the singleton library only once when extending an environment", () => {
    const celEnv = env({ libraries: [math()] }).extend({ libraries: [math()] });
    expect(celEnv.program(celEnv.compile("math.least(0, 1, 2) == 0")).eval({}).value()).toBe(true);
  });
});

describe("ext/math_test.go/TestMathVersions", () => {
  it("gates synchronized functions by their introducing version", () => {
    const cases = syncedCases<MathVersionCase>("ext/math_test.go/TestMathVersions");
    for (const selected of cases) {
      const celEnv = env({ libraries: [math({ version: selected.version })] });
      for (const introduced of cases) {
        for (const expression of Object.values(introduced.supportedFunctions)) {
          const result = celEnv.tryCompile(expression);
          if (selected.version < introduced.version) {
            expect(result.errors?.toDisplayString(), expression).toContain("undeclared reference");
          } else {
            expect(result.errors, expression).toBeUndefined();
            expect(celEnv.program(result.ast).eval({}).value(), expression).toBe(true);
          }
        }
      }
    }
  });
});

describe("ext/math_test.go/TestMathCosts", () => {
  it("matches every synchronized list-extremum cost", () => {
    for (const testCase of syncedCases<MathCostCase>("ext/math_test.go/TestMathCosts")) {
      const celEnv = env({
        libraries: [math({ version: testCase.version })],
        variables: (testCase.vars ?? []).map((value) =>
          resolveSyncedVariableDecl(
            { $expr: value.$expr.replace(/^cel\./, "") },
            {
              "cel.ListType(cel.DoubleType)": listType(DoubleType),
              "cel.ListType(cel.IntType)": listType(IntType),
            },
          ),
        ),
      });
      const ast = celEnv.compile(testCase.expr);
      const estimator: CostEstimator = {
        estimateCallCost: () => undefined,
        estimateSize: (node) => {
          const path = node.path()?.join(".");
          const hint = path === undefined ? undefined : testCase.hints?.[path];
          return hint === undefined ? undefined : sizeEstimate(0n, BigInt(hint));
        },
      };
      const estimate = celEnv.estimateCost(ast, estimator);
      expect([estimate.Min, estimate.Max], testCase.name).toEqual(
        parseMathCost(testCase.estimatedCost.$expr),
      );
      const result = celEnv
        .program(ast, { costTracking: {} })
        .evalWithDetails(resolveSyncedExpr(testCase.in ?? {}) as Record<string, unknown>);
      expect(result.value.value(), testCase.name).toBe(true);
      expect(result.details.actualCost(), testCase.name).toBe(testCase.actualCost);
    }
  });
});

/** mathEnv creates the shared upstream math test environment. */
function mathEnv() {
  return env({
    libraries: [math()],
    variables: [
      variableDecl("a", DynType),
      variableDecl("b", IntType),
      variableDecl("numbers", listType(DoubleType)),
    ],
  });
}

/** numericPair returns the least or greatest of two CEL integers. */
function numericPair(options: { left: Val; operation: "greatest" | "least"; right: Val }): Val {
  const leftValue = (options.left as Int).value();
  const rightValue = (options.right as Int).value();
  return options.operation === "greatest"
    ? leftValue >= rightValue
      ? options.left
      : options.right
    : leftValue <= rightValue
      ? options.left
      : options.right;
}

/** parseMathCost decodes CEL-Go fixed and ranged cost expressions. */
function parseMathCost(expression: string): [bigint, bigint] {
  const fixed = /^checker\.FixedCostEstimate\((\d+)\)$/.exec(expression);
  if (fixed) {
    const value = BigInt(fixed[1]!);
    return [value, value];
  }
  const ranged = /^checker\.CostEstimate\{Min: (\d+), Max: (\d+)\}$/.exec(expression);
  if (ranged) {
    return [BigInt(ranged[1]!), BigInt(ranged[2]!)];
  }
  throw new Error(`unsupported synchronized math cost: ${expression}`);
}
