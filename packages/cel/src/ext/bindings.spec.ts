import { describe, expect, it, vi } from "vitest";
import { type EnvOptions, env, unwrapAst } from "../cel/env.js";
import { validateBindNestingLimit } from "../cel/validator.js";
import { sizeEstimate } from "../checker/cost.js";
import { ast, type Expr, exprFactory } from "../common/ast/index.js";
import { container } from "../common/containers.js";
import { variable } from "../common/decls.js";
import * as operators from "../common/operators.js";
import { syncedCases } from "../common/spec-helpers.js";
import { IntType, listType, StringType } from "../common/types/types.js";
import { ExecutionFrame } from "../interpreter/frame.js";
import { bindings } from "./bindings.js";
import { strings } from "./strings.js";

/** BindingCase describes one synchronized bind expression and cost expectation. */
interface BindingCase {
  /** actualCost is the expected runtime cost. */
  actualCost: number;
  /** estimatedCost is CEL-Go's serialized static estimate. */
  estimatedCost: { $expr: string };
  /** expr contains the CEL expression. */
  expr: string;
  /** hints contains static size hints. */
  hints?: Record<string, number>;
  /** in contains activation values. */
  in?: Record<string, unknown>;
  /** name identifies the upstream row. */
  name: string;
  /** vars contains serialized environment options. */
  vars?: Array<{ $expr: string }>;
}

/** BlockCase identifies one synchronized hand-built block expression. */
interface BlockCase {
  /** in contains activation values. */
  in?: Record<string, unknown>;
  /** name identifies the upstream row. */
  name: string;
}

describe("ext/bindings_test.go/TestBindings", () => {
  for (const testCase of syncedCases<BindingCase>("ext/bindings_test.go/TestBindings")) {
    it(testCase.name, () => {
      const celEnv = bindingEnv(testCase.vars);
      const expression = unwrapAst(celEnv.compile(testCase.expr));
      const estimate = celEnv.estimateCost(expression, {
        estimateCallCost: () => undefined,
        estimateSize: (node) => {
          const path = node.path()?.join(".");
          const value = path === undefined ? undefined : testCase.hints?.[path];
          return value === undefined ? undefined : sizeEstimate(0n, BigInt(value));
        },
      });
      expect([estimate.Min, estimate.Max]).toEqual(parseCostEstimate(testCase.estimatedCost.$expr));
      const result = celEnv
        .program(expression, { costTracking: {} })
        .evalWithDetails(testCase.in ?? {});
      expect(result.value.value()).toBe(true);
      expect(result.details.actualCost()).toBe(testCase.actualCost);
    });
  }
});

describe("ext/bindings_test.go/TestBindingsNonMatch", () => {
  it("leaves a non-cel namespace receiver call unexpanded", () => {
    const parsed = unwrapAst(bindingEnv().parse("ceel.bind(a, 1, a)"));
    expect(parsed.sourceInfo().macroCalls().size).toBe(0);
  });
});

describe("ext/bindings_test.go/TestValidateBindNestingLimit", () => {
  it("rejects cel.bind calls nested beyond the configured limit", () => {
    const celEnv = env({
      libraries: [bindings()],
      validators: [validateBindNestingLimit(2)],
    });
    for (const testCase of syncedCases<{ expr: string; iss?: string }>(
      "ext/bindings_test.go/TestValidateBindNestingLimit",
    )) {
      const result = celEnv.compile(testCase.expr);
      if (testCase.iss === undefined) {
        expect(result.errors, testCase.expr).toBeUndefined();
      } else {
        expect(result.errors?.toDisplayString(), testCase.expr).toContain(
          "cel.bind exceeds nesting limit",
        );
      }
    }
  });
});

describe("ext/bindings_test.go/TestBindingsInvalidIdent", () => {
  it("rejects a selector as a binding variable", () => {
    const parsed = bindingEnv().parse("cel.bind(a.b, 1, a.b)");
    expect(parsed.errors?.toDisplayString()).toContain(
      "cel.bind() variable names must be simple identifiers",
    );
  });
});

describe("ext/bindings_test.go/TestBlockEval", () => {
  for (const testCase of syncedCases<BlockCase>("ext/bindings_test.go/TestBlockEval")) {
    it(testCase.name, () => {
      const { expression, expected, options } = blockFixture(testCase.name);
      const celEnv = env({ libraries: [bindings()], ...options });
      expect(
        celEnv
          .program(ast(expression))
          .eval(testCase.in ?? {})
          .value(),
      ).toBe(expected);
    });
  }
});

describe("ext/bindings_test.go/TestBlockEval_BadPlan", () => {
  it("rejects a block call with more than two arguments", () => {
    const factory = exprFactory();
    const expression = factory.call(
      1,
      "cel.@block",
      factory.list(2, [factory.ident(3, "x")], []),
      factory.ident(4, "x"),
      factory.ident(5, "x"),
    );
    expect(() =>
      env({
        libraries: [bindings({ version: 1 })],
        variables: [variable("x", StringType)],
      }).program(ast(expression)),
    ).toThrow("expects two arguments");
  });
});

describe("ext/bindings_test.go/TestBlockEval_BadBlock", () => {
  it("rejects a non-list first block argument", () => {
    const factory = exprFactory();
    const expression = factory.call(
      1,
      "cel.@block",
      factory.call(2, operators.Add, factory.ident(3, "x"), factory.ident(4, "x")),
      factory.ident(5, "x"),
    );
    expect(() =>
      env({
        libraries: [bindings({ version: 1 })],
        variables: [variable("x", StringType)],
      }).program(ast(expression)),
    ).toThrow("expects a list constructor");
  });
});

describe("ext/bindings_test.go/TestBlockEval_RuntimeErrors", () => {
  for (const testCase of syncedCases<BlockCase>(
    "ext/bindings_test.go/TestBlockEval_RuntimeErrors",
  )) {
    it(testCase.name, () => {
      const expression = runtimeErrorBlock(testCase.name);
      const result = env({
        libraries: [bindings()],
        variables: [variable("x", StringType)],
      })
        .program(ast(expression))
        .eval({});
      expect(String(result)).toContain("no such attribute");
    });
  }
});

describe("ext/bindings_test.go/TestDynamicBlockEval", () => {
  it("caches a dynamically evaluated slot for repeated access", () => {
    const factory = exprFactory();
    const expression = factory.call(
      1,
      "cel.@block",
      factory.list(2, [factory.ident(3, "x")], []),
      factory.call(4, operators.Equals, factory.ident(5, "@index0"), factory.ident(6, "@index0")),
    );
    const celEnv = env({
      libraries: [bindings()],
      variables: [variable("x", StringType)],
    });
    expect(celEnv.program(ast(expression)).eval({ x: "value" }).value()).toBe(true);
  });
});

describe("ext/bindings_test.go/TestConstantBlockEval", () => {
  it("evaluates constant slots through the same block scope", () => {
    const factory = exprFactory();
    const expression = factory.call(
      1,
      "cel.@block",
      factory.list(2, [factory.literal(3, 2n)], []),
      factory.call(4, operators.Equals, factory.ident(5, "@index0"), factory.literal(6, 2n)),
    );
    expect(
      env({ libraries: [bindings()] })
        .program(ast(expression))
        .eval({})
        .value(),
    ).toBe(true);
  });
});

describe("ext/bindings_test.go/BenchmarkBlockEval", () => {
  it("reuses lazy slot state across sequential evaluations", () => {
    const factory = exprFactory();
    const expression = factory.call(
      1,
      "cel.@block",
      factory.list(2, [factory.ident(3, "x")], []),
      factory.ident(4, "@index0"),
    );
    const program = env({
      libraries: [bindings()],
      variables: [variable("x", StringType)],
    }).program(ast(expression));
    const push = vi.spyOn(ExecutionFrame.prototype, "push");
    try {
      expect(program.eval({ x: "first" }).value()).toBe("first");
      expect(program.eval({ x: "second" }).value()).toBe("second");
      expect(push.mock.calls).toHaveLength(2);
      expect(push.mock.calls[0]![0] === push.mock.calls[1]![0]).toBe(true);
    } finally {
      push.mockRestore();
    }
  });
});

/** bindingEnv creates a bind-only environment from synchronized CEL-Go option expressions. */
function bindingEnv(serialized: Array<{ $expr: string }> = []) {
  const options: EnvOptions = {
    libraries: [bindings({ version: 0 }), strings()],
    variables: [],
  };
  for (const entry of serialized) {
    const variableMatch = /^cel\.Variable\("([^"]+)", cel\.(.+)\)$/.exec(entry.$expr);
    if (variableMatch) {
      options.variables!.push(variable(variableMatch[1]!, resolveType(variableMatch[2]!)));
      continue;
    }
    const namespace = /^cel\.Container\("([^"]+)"\)$/.exec(entry.$expr);
    if (namespace) {
      options.container = container({ name: namespace[1]! });
      continue;
    }
    throw new Error(`unsupported synchronized bindings option: ${entry.$expr}`);
  }
  return env(options);
}

/** resolveType decodes the variable types used by synchronized binding cases. */
function resolveType(expression: string) {
  if (expression === "StringType") {
    return StringType;
  }
  if (expression === "ListType(cel.IntType)") {
    return listType(IntType);
  }
  if (expression === "ListType(cel.StringType)") {
    return listType(StringType);
  }
  if (expression === "IntType") {
    return IntType;
  }
  throw new Error(`unsupported synchronized bindings type: ${expression}`);
}

/** parseCostEstimate decodes CEL-Go fixed and ranged estimates. */
function parseCostEstimate(expression: string): [bigint, bigint] {
  const fixed = /FixedCostEstimate\((\d+)\)/.exec(expression);
  if (fixed) {
    return [BigInt(fixed[1]!), BigInt(fixed[1]!)];
  }
  const ranged = /Min: (\d+), Max: (\d+)/.exec(expression);
  if (!ranged) {
    throw new Error(`unsupported synchronized cost estimate: ${expression}`);
  }
  return [BigInt(ranged[1]!), BigInt(ranged[2]!)];
}

/** BlockFixture contains one hand-built upstream block equivalent. */
interface BlockFixture {
  /** expected is the native expected value. */
  readonly expected: unknown;
  /** expression is the hand-built CEL AST. */
  readonly expression: Expr;
  /** options contains additional environment declarations. */
  readonly options: EnvOptions;
}

/** blockFixture reconstructs each synchronized upstream block AST by row name. */
function blockFixture(name: string): BlockFixture {
  const factory = exprFactory();
  if (name === "chained block") {
    return {
      expected: "hellohellohello",
      expression: factory.call(
        1,
        "cel.@block",
        factory.list(
          2,
          [factory.ident(3, "x"), factory.ident(4, "@index0"), factory.ident(5, "@index1")],
          [],
        ),
        factory.call(
          9,
          operators.Add,
          factory.call(6, operators.Add, factory.ident(7, "@index2"), factory.ident(8, "@index1")),
          factory.ident(10, "@index0"),
        ),
      ),
      options: { variables: [variable("x", StringType)] },
    };
  }
  const literal = name !== "mixed block dynamic values";
  const first = literal ? factory.literal(3, "hello") : factory.ident(3, "x");
  const slots =
    name === "empty block"
      ? factory.list(2, [], [])
      : factory.list(
          2,
          name === "mixed block constant values dyn var"
            ? [first]
            : [first, factory.literal(4, 5n)],
          [],
        );
  const result =
    name === "empty block"
      ? factory.call(3, operators.LogicalNot, factory.literal(4, false))
      : factory.call(
          5,
          operators.Equals,
          factory.call(6, "size", factory.ident(7, "@index0")),
          name === "mixed block constant values dyn var"
            ? factory.ident(8, "y")
            : factory.ident(8, "@index1"),
        );
  return {
    expected: name !== "mixed block dynamic values",
    expression: factory.call(1, "cel.@block", slots, result),
    options: {
      variables:
        name === "mixed block dynamic values"
          ? [variable("x", StringType)]
          : name === "mixed block constant values dyn var"
            ? [variable("y", IntType)]
            : [],
    },
  };
}

/** runtimeErrorBlock reconstructs one invalid synchronized block by row name. */
function runtimeErrorBlock(name: string): Expr {
  const factory = exprFactory();
  const badName =
    name === "bad index"
      ? "@indexNext"
      : name === "negative index"
        ? "@index-1"
        : name === "out of range index"
          ? "@index100"
          : "@index0";
  return factory.call(
    1,
    "cel.@block",
    factory.list(2, [factory.ident(3, badName), factory.ident(4, "@index0")], []),
    factory.ident(10, "@index0"),
  );
}
