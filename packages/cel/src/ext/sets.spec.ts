import { file_test_proto3pb_test_all_types } from "@protoutil/testing/cel/proto3";
import { describe, expect, it } from "vitest";
import { env, unwrapAst } from "../cel/env.js";
import { type CostEstimator, sizeEstimate } from "../checker/cost.js";
import { container } from "../common/containers.js";
import { variable } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { registry } from "../common/types/provider.js";
import { resolveSyncedExpr } from "../common/types/spec-helpers.js";
import { IntType, listType, StringType } from "../common/types/types.js";
import { unparse } from "../parser/unparser.js";
import { setMembershipOptimizer, sets } from "./sets.js";

/** SetsCase describes one synchronized cel-go set relationship test row. */
interface SetsCase {
  /** actualCost contains cel-go's observed runtime cost. */
  actualCost: number;
  /** estimatedCost contains cel-go's serialized checker cost range. */
  estimatedCost: { $expr: string };
  /** expr contains a set relationship expression whose expected result is true. */
  expr: string;
  /** hints contains static maximum sizes keyed by variable path. */
  hints?: Record<string, number>;
  /** in contains native activation bindings for the expression. */
  in?: Record<string, unknown>;
  /** vars contains synchronized upstream variable declarations. */
  vars?: Array<{ $expr: string }>;
}

describe("ext/sets_test.go/TestSets", () => {
  it("evaluates every synced set relationship case", () => {
    for (const testCase of syncedCases<SetsCase>("ext/sets_test.go/TestSets")) {
      const variables = testCase.vars === undefined ? [] : [variable("x", listType(IntType))];
      const celEnv = env({ libraries: [sets()], variables });
      const ast = unwrapAst(celEnv.compile(testCase.expr));
      const estimator: CostEstimator = {
        /** estimateSize returns a synchronized upper-bound hint for a variable path. */
        estimateSize: (node) => {
          const path = node.path()?.join(".");
          const hint = path === undefined ? undefined : testCase.hints?.[path];
          return hint === undefined ? undefined : sizeEstimate(0n, BigInt(hint));
        },
        /** estimateCallCost defers calls to the extension and standard estimators. */
        estimateCallCost: () => undefined,
      };
      const estimate = celEnv.estimateCost(ast, estimator);
      const expectedEstimate = parseCostEstimate(testCase.estimatedCost.$expr);
      expect([estimate.Min, estimate.Max], testCase.expr).toEqual(expectedEstimate);

      const evaluated = celEnv
        .program(ast, { costTracking: {} })
        .evalWithDetails(testCase.in ?? {});
      const result = evaluated.value;
      expect(result.value(), testCase.expr).toBe(true);
      expect(evaluated.details.actualCost(), testCase.expr).toBe(testCase.actualCost);
    }
  });
});

describe("ext/sets_test.go/TestSetsMembershipRewriter", () => {
  for (const testCase of syncedCases<{
    expr: string;
    in: Record<string, unknown>;
    optimized: string;
    opts: Array<{ $expr: string }>;
    out: { $expr: string };
  }>("ext/sets_test.go/TestSetsMembershipRewriter")) {
    it(testCase.expr, () => {
      const typeRegistry = registry();
      const usesEnum = testCase.expr.includes("GlobalEnum");
      if (usesEnum) {
        typeRegistry.registerDescriptor(file_test_proto3pb_test_all_types);
      }
      const variables = testCase.opts.flatMap((option) => {
        const match = /cel\.Variable\("([^"]+)", cel\.(Int|String)Type\)/.exec(option.$expr);
        return match ? [variable(match[1]!, match[2] === "String" ? StringType : IntType)] : [];
      });
      const celEnv = env({
        container: usesEnum ? container({ name: "google.expr.proto3" }) : undefined,
        libraries: [sets()],
        parser: { populateMacroCalls: true },
        registry: typeRegistry,
        variables,
      });
      const ast = unwrapAst(celEnv.compile(testCase.expr));
      const optimized = celEnv.optimize(ast, setMembershipOptimizer());
      expect(unparse(optimized), testCase.expr).toBe(testCase.optimized);
      expect(
        celEnv
          .program(optimized)
          .eval(resolveSyncedExpr(testCase.in) as Record<string, unknown>)
          .value(),
        testCase.expr,
      ).toBe(testCase.out.$expr === "types.True");
    });
  }
});

describe("ext/sets_test.go/TestSetsVersion", () => {
  it("accepts version zero", () => {
    expect(() => env({ libraries: [sets({ version: 0 })] })).not.toThrow();
  });
});

/**
 * parseCostEstimate decodes the synchronized cel-go cost expression into bigint bounds.
 */
function parseCostEstimate(expression: string): [bigint, bigint] {
  if (expression === "checker.CostEstimate{Min: 12, Max: math.MaxUint64}") {
    return [12n, (1n << 64n) - 1n];
  }
  const fixed = /^checker\.FixedCostEstimate\((\d+)\)$/.exec(expression);
  if (fixed) {
    const value = BigInt(fixed[1]!);
    return [value, value];
  }
  const ranged = /^checker\.CostEstimate\{Min: (\d+), Max: (\d+)\}$/.exec(expression);
  if (ranged) {
    return [BigInt(ranged[1]!), BigInt(ranged[2]!)];
  }
  throw new Error(`unsupported synchronized cost estimate: ${expression}`);
}
