import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { check } from "../checker/checker.js";
import { env } from "../checker/env.js";
import { defaultContainer } from "../common/containers.js";
import { variable } from "../common/decls.js";
import * as overloads from "../common/overloads.js";
import { textSource } from "../common/source.js";
import { syncedCases } from "../common/spec-helpers.js";
import { standardFunctions } from "../common/stdlib.js";
import {
  BoolType,
  BytesType,
  Err,
  IntType,
  listType,
  mapType,
  objectType,
  registry,
  StringType,
  TimestampType,
  type Type,
} from "../common/types/index.js";
import type { Val } from "../common/types/ref/index.js";
import type { TestAllTypes } from "../gen/test/proto3pb/test_all_types_pb.js";
import {
  NestedTestAllTypesSchema,
  TestAllTypesSchema,
} from "../gen/test/proto3pb/test_all_types_pb.js";
import { parse } from "../parser/parser.js";
import { activation } from "./activation.js";
import { attributeFactory } from "./attributes.js";
import { dispatcher } from "./dispatcher.js";
import { executionFrame } from "./frame.js";
import { interpreter } from "./interpreter.js";
import {
  CostLimitExceededError,
  CostTracker,
  type CostTrackerOptions,
  costObserverConfig,
  costTracker,
} from "./runtime-cost.js";

/**
 * SyncedRuntimeCostCase mirrors one serialized row from cel-go's TestRuntimeCost table.
 */
interface SyncedRuntimeCostCase {
  /**
   * name is the upstream table row name.
   */
  name: string;

  /**
   * expr is the CEL expression whose runtime cost is measured.
   */
  expr: string;

  /**
   * vars lists the checker variable declarations used by the expression.
   */
  vars?: Array<{ $expr?: string }>;

  /**
   * in contains the activation bindings used during evaluation.
   */
  in?: Record<string, unknown>;

  /**
   * want is the expected runtime cost.
   */
  want?: number;

  /**
   * limit configures the optional runtime cost limit.
   */
  limit?: number;

  /**
   * options lists synced tracker options which require local decoding.
   */
  options?: Array<{ $expr?: string }>;

  /**
   * expectExceedsLimit reports whether evaluation must terminate at the configured limit.
   */
  expectExceedsLimit?: boolean;
}

describe("functional runtime cost API", () => {
  it("creates an independent cost tracker from an option object", () => {
    const tracker = costTracker({ cost: 7, limit: 10 });

    expect(tracker.actualCost()).toBe(7);
    expect(tracker.clone().actualCost()).toBe(0);
  });
});

/**
 * SyncedAdvancedCostCase mirrors one serialized row from TestTrackCostAdvanced.
 */
interface SyncedAdvancedCostCase {
  /**
   * lhsExpr is the expression on the left side of the cost comparison.
   */
  lhsExpr: string;

  /**
   * rhsExpr is the expression on the right side of the cost comparison.
   */
  rhsExpr: string;
}

/**
 * allTypes is the CEL object type used by the upstream runtime-cost table.
 */
const allTypes = objectType("google.expr.proto3.test.TestAllTypes");

/**
 * allList is a list of TestAllTypes values.
 */
const allList = listType(allTypes);

/**
 * intList is a list of CEL integers.
 */
const intList = listType(IntType);

/**
 * nestedList is a list of TestAllTypes lists.
 */
const nestedList = listType(allList);

/**
 * allMap maps strings to TestAllTypes values.
 */
const allMap = mapType(StringType, allTypes);

/**
 * nestedMap maps strings to maps of TestAllTypes values.
 */
const nestedMap = mapType(StringType, allMap);

/**
 * runtimeRegistry returns a registry containing the protobuf types used by the synced cases.
 */
function runtimeRegistry() {
  return registry(
    [{ $typeName: TestAllTypesSchema.typeName } as TestAllTypes, TestAllTypesSchema],
    [
      {
        $typeName: NestedTestAllTypesSchema.typeName,
      } as never,
      NestedTestAllTypesSchema,
    ],
  );
}

/**
 * standardDispatcher returns a dispatcher populated with the CEL standard function bindings.
 */
function standardDispatcher() {
  const runtimeDispatcher = dispatcher();
  for (const functionValue of standardFunctions()) {
    const bindings = functionValue.bindings();
    if (bindings.length !== 0) {
      runtimeDispatcher.add({ overloads: bindings });
    }
  }
  return runtimeDispatcher;
}

/**
 * runtimeCostType resolves the type expressions emitted by the synced Go test-case serializer.
 */
function runtimeCostType(expr: string): Type {
  switch (expr.replace(/\btypes\./g, "").trim()) {
    case "allTypes":
      return allTypes;
    case "allList":
      return allList;
    case "intList":
      return intList;
    case "nestedList":
      return nestedList;
    case "allMap":
      return allMap;
    case "nestedMap":
      return nestedMap;
    case "BoolType":
      return BoolType;
    case "BytesType":
      return BytesType;
    case "IntType":
      return IntType;
    case "StringType":
      return StringType;
    case "TimestampType":
      return TimestampType;
    default:
      break;
  }
  const listMatch = /^NewListType\(([\s\S]+)\)$/.exec(expr.replace(/\btypes\./g, "").trim());
  if (listMatch) {
    return listType(runtimeCostType(listMatch[1]!));
  }
  const mapMatch = /^NewMapType\(([\s\S]+),\s*([\s\S]+)\)$/.exec(
    expr.replace(/\btypes\./g, "").trim(),
  );
  if (mapMatch) {
    return mapType(runtimeCostType(mapMatch[1]!), runtimeCostType(mapMatch[2]!));
  }
  const objectMatch = /^NewObjectType\("([^"]+)"\)$/.exec(expr.replace(/\btypes\./g, "").trim());
  if (objectMatch) {
    return objectType(objectMatch[1]!);
  }
  throw new Error(`unsupported runtime-cost type expression: ${expr}`);
}

/**
 * runtimeCostVariables resolves synced checker variable declarations.
 */
function runtimeCostVariables(
  vars: Array<{ $expr?: string }> | undefined,
): Array<ReturnType<typeof variable>> {
  return (vars ?? []).map((entry) => {
    const match = /^decls\.NewVariable\("([^"]+)",\s*([\s\S]+)\)$/.exec(entry.$expr ?? "");
    if (!match) {
      throw new Error(`unsupported runtime-cost variable expression: ${entry.$expr}`);
    }
    return variable(match[1]!, runtimeCostType(match[2]!));
  });
}

/**
 * runtimeCostInput resolves serialized Go fixture expressions into browser-safe runtime values.
 */
function runtimeCostInput(
  input: Record<string, unknown> | undefined,
  reg: ReturnType<typeof runtimeRegistry>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input ?? {}).map(([name, value]) => [name, runtimeCostValue(value, reg)]),
  );
}

/**
 * runtimeCostValue recursively resolves one synced runtime-cost fixture value.
 */
function runtimeCostValue(value: unknown, reg: ReturnType<typeof runtimeRegistry>): unknown {
  if (Array.isArray(value)) {
    return value.map((element) => runtimeCostValue(element, reg));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const fixtureExpr = (value as { $expr?: string }).$expr;
  if (fixtureExpr !== undefined) {
    if (fixtureExpr === "time.Now()") {
      return {
        $typeName: TimestampSchema.typeName,
        seconds: 0n,
        nanos: 0,
      };
    }
    if (fixtureExpr === "randSeq(500)") {
      return new TextEncoder().encode("a".repeat(500));
    }
    if (fixtureExpr === "string(randSeq(500))") {
      return "a".repeat(500);
    }
    if (fixtureExpr === "{}" || fixtureExpr.includes("proto3pb.TestAllTypes")) {
      return reg.newValue(TestAllTypesSchema.typeName, {}).convertToNative(TestAllTypesSchema);
    }
    throw new Error(`unsupported runtime-cost value expression: ${fixtureExpr}`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([name, nestedValue]) => [name, runtimeCostValue(nestedValue, reg)]),
  );
}

/**
 * trackerOptions resolves the synced runtime tracker options for one table row.
 */
function trackerOptions(testCase: SyncedRuntimeCostCase): CostTrackerOptions {
  const options: CostTrackerOptions = {
    estimator: {
      callCost: ({ overloadId }) => (overloadId === overloads.TimestampToYear ? 7 : undefined),
    },
  };
  for (const option of testCase.options ?? []) {
    const expr = option.$expr ?? "";
    if (expr === "PresenceTestHasCost(true)") {
      options.presenceTestHasCost = true;
      continue;
    }
    if (expr === "PresenceTestHasCost(false)") {
      options.presenceTestHasCost = false;
      continue;
    }
    if (expr.startsWith("OverloadCostTracker(")) {
      options.overloadTrackers = {
        [overloads.ContainsString]: {
          cost: ({ args }) =>
            Math.ceil(actualSize(args[0]!) * 0.2) * Math.ceil(actualSize(args[1]!) * 0.2),
        },
      };
      continue;
    }
    throw new Error(`unsupported runtime cost option: ${expr}`);
  }
  if (testCase.limit !== undefined && testCase.limit > 0) {
    options.limit = testCase.limit;
  }
  return options;
}

/**
 * actualSize returns the size used by the custom upstream overload tracker.
 */
function actualSize(value: Val): number {
  if ("size" in value && typeof (value as { size?: unknown }).size === "function") {
    return Number((value as { size(): { value(): bigint } }).size().value());
  }
  return 1;
}

/**
 * computeCost parses, checks, plans, and evaluates an expression with runtime cost observation.
 */
function computeCost(options: {
  expr: string;
  vars?: Array<{ $expr?: string }>;
  input?: Record<string, unknown>;
  tracker?: CostTrackerOptions;
}): number {
  const reg = runtimeRegistry();
  const checkerEnv = env(defaultContainer, reg);
  checkerEnv.addFunctions(...standardFunctions());
  const variables = runtimeCostVariables(options.vars);
  if (variables.length !== 0) {
    checkerEnv.addIdents(...variables);
  }
  const parsed = parse(options.expr);
  const checked = check(parsed, textSource(options.expr), checkerEnv);
  const runtime = interpreter({
    dispatcher: standardDispatcher(),
    provider: reg,
    adapter: reg,
    attrFactory: attributeFactory({
      containerValue: defaultContainer,
      adapter: reg,
      provider: reg,
    }),
  });
  let tracker: CostTracker | undefined;
  const program = runtime.interpretable({
    exprAst: checked,
    plannerConfig: costObserverConfig({
      trackerFactory: () => {
        tracker = new CostTracker(options.tracker);
        return tracker;
      },
    }),
  });
  const frame = executionFrame({
    input: activation({ bindings: runtimeCostInput(options.input, reg) }),
  });
  try {
    const result = program.exec(frame);
    if (result instanceof Err) {
      throw result;
    }
    return tracker?.actualCost() ?? 0;
  } finally {
    frame.close();
  }
}

/**
 * runtimecost_test.go coverage tracks the upstream runtime cost tests.
 */
describe("interpreter/runtimecost_test.go", () => {
  /**
   * TestTrackCostAdvanced verifies equal-cost and ordered-cost expression pairs.
   */
  describe("interpreter/runtimecost_test.go/TestTrackCostAdvanced", () => {
    for (const [index, testCase] of syncedCases<SyncedAdvancedCostCase>(
      "interpreter/runtimecost_test.go/TestTrackCostAdvanced#equalCases",
    ).entries()) {
      it(`interpreter/runtimecost_test.go/TestTrackCostAdvanced/equalCases/${index + 1}`, () => {
        expect(computeCost({ expr: testCase.lhsExpr })).toBe(
          computeCost({ expr: testCase.rhsExpr }),
        );
      });
    }

    for (const [index, testCase] of syncedCases<SyncedAdvancedCostCase>(
      "interpreter/runtimecost_test.go/TestTrackCostAdvanced#smallerCases",
    ).entries()) {
      it(`interpreter/runtimecost_test.go/TestTrackCostAdvanced/smallerCases/${index + 1}`, () => {
        expect(computeCost({ expr: testCase.lhsExpr })).toBeLessThan(
          computeCost({ expr: testCase.rhsExpr }),
        );
      });
    }
  });

  /**
   * TestRuntimeCost verifies every synced runtime cost and limit case.
   */
  describe("interpreter/runtimecost_test.go/TestRuntimeCost", () => {
    for (const [index, testCase] of syncedCases<SyncedRuntimeCostCase>(
      "interpreter/runtimecost_test.go/TestRuntimeCost",
    ).entries()) {
      it(`interpreter/runtimecost_test.go/TestRuntimeCost/${testCase.name}/${index + 1}`, () => {
        const evaluate = () =>
          computeCost({
            expr: testCase.expr,
            vars: testCase.vars,
            input: testCase.in,
            tracker: trackerOptions(testCase),
          });
        if (testCase.expectExceedsLimit) {
          expect(evaluate).toThrow(CostLimitExceededError);
          return;
        }
        expect(evaluate()).toBe(testCase.want);
      });
    }
  });
});
