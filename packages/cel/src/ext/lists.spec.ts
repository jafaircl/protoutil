import { file_test_proto2pb_test_all_types } from "@protoutil/testing/cel/proto2";
import { file_test_proto2pb_test_extensions } from "@protoutil/testing/cel/proto2-extensions";
import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { type CostEstimator, sizeEstimate } from "../checker/cost.js";
import { container } from "../common/containers.js";
import { variable } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { registry } from "../common/types/provider.js";
import { DynType, IntType, listType, mapType, StringType } from "../common/types/types.js";
import { lists } from "./lists.js";

/** ListsCase describes a synchronized list expression and optional runtime error. */
interface ListsCase {
  /** err contains the expected runtime error fragment. */
  err?: string;
  /** expr contains the CEL expression under test. */
  expr: string;
}

/** ListsVersionCase describes functions introduced by one list library version. */
interface ListsVersionCase {
  /** supportedFunctions maps labels to expressions introduced by this version. */
  supportedFunctions: Record<string, string>;
  /** version identifies the introducing version. */
  version: number;
}

/** ListsCostCase describes one synchronized checker and runtime cost case. */
interface ListsCostCase extends ListsCase {
  /** actualCost contains CEL-Go's measured runtime cost. */
  actualCost: number;
  /** estimatedCost contains CEL-Go's serialized cost estimate. */
  estimatedCost: { $expr: string };
  /** hints contains size estimates keyed by checked expression path. */
  hints?: Record<string, number>;
  /** in contains native activation bindings. */
  in?: Record<string, unknown>;
  /** vars contains serialized CEL-Go variable declarations. */
  vars?: Array<{ $expr: string }>;
  /** version selects the legacy cost model for rows that explicitly request it. */
  version?: number;
}

describe("ext/lists_test.go/TestLists", () => {
  it("evaluates every synchronized list expression", () => {
    const celEnv = listsEnv();
    for (const testCase of syncedCases<ListsCase>("ext/lists_test.go/TestLists")) {
      const result = celEnv.program(celEnv.compile(testCase.expr)).eval({});
      if (testCase.err) {
        expect(String(result), testCase.expr).toContain(testCase.err);
      } else {
        expect(result.value(), testCase.expr).toBe(true);
      }
    }
  });
});

describe("ext/lists_test.go/TestListsRuntimeErrors", () => {
  it("reports every synchronized runtime failure", () => {
    const celEnv = listsEnv({ version: 1 });
    for (const testCase of syncedCases<ListsCase>("ext/lists_test.go/TestListsRuntimeErrors")) {
      const result = celEnv.program(celEnv.compile(testCase.expr)).eval({});
      expect(String(result), testCase.expr).toContain(testCase.err);
    }
  });
});

describe("ext/lists_test.go/TestListsVersion", () => {
  it("gates synchronized functions by their introducing version", () => {
    const cases = syncedCases<ListsVersionCase>("ext/lists_test.go/TestListsVersion");
    for (const selected of cases) {
      const celEnv = listsEnv({ version: selected.version });
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

describe("ext/lists_test.go/TestListsCosts", () => {
  it("matches synchronized checker and runtime costs", () => {
    for (const testCase of syncedCases<ListsCostCase>("ext/lists_test.go/TestListsCosts")) {
      const celEnv = listsEnv(
        { version: testCase.version ?? Number.MAX_SAFE_INTEGER },
        (testCase.vars ?? []).map((variable) => resolveVariable(variable.$expr)),
      );
      const ast = celEnv.compile(testCase.expr);
      const estimator: CostEstimator = {
        estimateSize: (node) => {
          const path = node.path()?.join(".");
          const hint = path === undefined ? undefined : testCase.hints?.[path];
          return hint === undefined ? undefined : sizeEstimate(0n, BigInt(hint));
        },
        estimateCallCost: () => undefined,
      };
      const estimate = celEnv.estimateCost(ast, estimator);
      expect([estimate.Min, estimate.Max], testCase.expr).toEqual(
        parseCostEstimate(testCase.estimatedCost.$expr),
      );
      const evaluated = celEnv
        .program(ast, { costTracking: {} })
        .evalWithDetails(testCase.in ?? {});
      expect(evaluated.value.value(), testCase.expr).toBe(true);
      expect(evaluated.details.actualCost(), testCase.expr).toBe(testCase.actualCost);
    }
  });
});

describe("ext/lists_test.go/TestGenRangeMaxSize", () => {
  it("enforces negative, default, custom, and disabled range limits", () => {
    const defaultEnv = listsEnv();
    expect(String(defaultEnv.program(defaultEnv.compile("lists.range(-1)")).eval({}))).toContain(
      "size must be non-negative",
    );
    expect(
      String(defaultEnv.program(defaultEnv.compile("lists.range(1000001)")).eval({})),
    ).toContain("exceeds maximum allowed");
    const unlimited = listsEnv({ maxRangeSize: 0 });
    expect(
      unlimited.program(unlimited.compile("size(lists.range(100)) == 100")).eval({}).value(),
    ).toBe(true);
  });
});

/** listsEnv creates the shared CEL-Go list extension environment. */
function listsEnv(
  options: { maxRangeSize?: number; version?: number } = {},
  variables: ReturnType<typeof variable>[] = [],
) {
  const typeRegistry = registry();
  typeRegistry.registerDescriptor(file_test_proto2pb_test_all_types);
  typeRegistry.registerDescriptor(file_test_proto2pb_test_extensions);
  return env({
    container: container({ name: "google.expr.proto2.test" }),
    libraries: [lists(options)],
    registry: typeRegistry,
    variables,
  });
}

/** resolveVariable decodes the variable declaration forms used by synchronized list tests. */
function resolveVariable(expression: string) {
  const match = /^cel\.Variable\("([^"]+)", cel\.(.+)\)$/.exec(expression);
  if (!match) {
    throw new Error(`unsupported synchronized variable declaration: ${expression}`);
  }
  const typeExpression = match[2]!;
  if (typeExpression === "IntType") {
    return variable(match[1]!, IntType);
  }
  if (typeExpression === "ListType(cel.IntType)") {
    return variable(match[1]!, listType(IntType));
  }
  if (typeExpression === "ListType(cel.StringType)") {
    return variable(match[1]!, listType(StringType));
  }
  if (typeExpression === "ListType(cel.DynType)") {
    return variable(match[1]!, listType(DynType));
  }
  if (typeExpression === "ListType(cel.MapType(cel.StringType, cel.StringType))") {
    return variable(match[1]!, listType(mapType(StringType, StringType)));
  }
  throw new Error(`unsupported synchronized variable type: ${typeExpression}`);
}

/** parseCostEstimate decodes CEL-Go cost expressions into bigint bounds. */
function parseCostEstimate(expression: string): [bigint, bigint] {
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
