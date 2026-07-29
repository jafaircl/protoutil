import { describe, expect, it } from "vitest";
import { syncedCases } from "../common/spec-helpers.js";
import { resolveSyncedExpr } from "../common/types/spec-helpers.js";
import {
  astToString,
  BoolType,
  DynType,
  env,
  functionDecl,
  IntType,
  isUnknown,
  listType,
  mapType,
  declOverload as overload,
  StringType,
  TimestampType,
  type Unknown,
  type Val,
  variableDecl,
} from "../index.js";
import {
  type AttributePattern,
  attributePattern,
  partialActivation,
} from "../interpreter/activation.js";

describe("cel/cel_test.go/TestEvalRecover", () => {
  it("converts host binding exceptions into internal evaluation errors", () => {
    const celEnv = env({
      functions: [
        functionDecl("panic", {
          overloads: [
            overload("global_panic", [], BoolType, {
              functionBinding: () => {
                throw new Error("watch me recover");
              },
            }),
          ],
        }),
      ],
    });
    const ast = celEnv.parse("panic()");

    expect(() => celEnv.program(ast).eval({})).toThrow("internal error: watch me recover");
    expect(() => celEnv.program(ast, { trackState: true }).eval({})).toThrow(
      "internal error: watch me recover",
    );
  });
});

describe("cel/cel_test.go/TestExhaustiveEval", () => {
  it("evaluates and records both sides of a short-circuiting expression", () => {
    const celEnv = env({
      variables: [variableDecl("k", StringType), variableDecl("v", BoolType)],
    });
    const ast = celEnv.compile("{k: true}[k] || v != false");
    const evaluated = celEnv
      .program(ast, { exhaustiveEval: true })
      .evalWithDetails({ k: "key", v: true });
    const args = ast.expr().asCall()?.args() ?? [];
    const state = evaluated.details.state();

    expect(evaluated.value.value()).toBe(true);
    expect(state?.value(args[0]!.id())[1]).toBe(true);
    expect(state?.value(args[1]!.id())[1]).toBe(true);
  });
});

describe("cel/cel_test.go/TestContextEvalUnknowns", () => {
  it("returns the same unknown from regular and context-aware evaluation", () => {
    const celEnv = env({
      variables: [variableDecl("groups", listType(IntType)), variableDecl("id", IntType)],
    });
    const vars = partialActivation({
      bindings: { groups: [1, 2, 3] },
      unknowns: [attributePattern("id")],
    });
    const program = celEnv.program(celEnv.compile("groups.exists(t, t == id)"), {
      interruptCheckFrequency: 100,
      partialEval: true,
      trackState: true,
    });
    const controller = new AbortController();

    const evaluated = program.evalWithDetails(vars);
    const contextEvaluated = program.contextEvalWithDetails(vars, {
      signal: controller.signal,
    });

    expect(evaluated.value.toString()).toBe(contextEvaluated.value.toString());
  });
});

describe("cel/cel_test.go/TestResidualAst", () => {
  it("prunes known branches from a parsed expression", () => {
    const celEnv = env({
      variables: [variableDecl("x", IntType), variableDecl("y", IntType)],
    });
    const ast = celEnv.parse(`x < 10 && (y == 0 || "hello" != "goodbye")`);
    const evaluated = celEnv
      .program(ast, { partialEval: true, trackState: true })
      .evalWithDetails(celEnv.unknownVars());

    expect(isUnknown(evaluated.value)).toBe(true);
    expect(astToString(celEnv.residualAst(ast, evaluated.details))).toBe("x < 10");
  });
});

describe("cel/cel_test.go/TestResidualAstComplex", () => {
  it("retains only an unknown qualified attribute comparison", () => {
    const celEnv = env({
      variables: [
        variableDecl("resource.name", StringType),
        variableDecl("request.time", TimestampType),
        variableDecl("request.auth.claims", mapType(StringType, StringType)),
      ],
    });
    const vars = partialActivation({
      bindings: {
        "resource.name": "bucket/my-bucket/objects/private",
        "request.auth.claims": { email_verified: "true" },
      },
      unknowns: [attributePattern("request.auth.claims").qualString("email")],
    });
    const ast = celEnv.compile(`resource.name.startsWith("bucket/my-bucket") &&
      bool(request.auth.claims.email_verified) == true &&
      request.auth.claims.email == "wiley@acme.co"`);
    const evaluated = celEnv
      .program(ast, { partialEval: true, trackState: true })
      .evalWithDetails(vars);

    expect(isUnknown(evaluated.value)).toBe(true);
    expect(astToString(celEnv.residualAst(ast, evaluated.details))).toBe(
      `request.auth.claims.email == "wiley@acme.co"`,
    );
  });
});

describe("cel/cel_test.go/TestResidualAstMacros", () => {
  it("preserves macro syntax while pruning every synced case", () => {
    const cases = syncedCases<{
      env: { $expr: string };
      expr: string;
      in: Record<string, unknown>;
      residual: string;
      unks: Array<{ $expr: string }>;
    }>("cel/cel_test.go/TestResidualAstMacros");

    for (const testCase of cases) {
      const celEnv = residualMacroEnv(testCase.env.$expr);
      const vars = partialActivation({
        bindings: testCase.in,
        unknowns: testCase.unks.map(syncedAttributePattern),
      });
      const ast = celEnv.compile(testCase.expr);
      const evaluated = celEnv
        .program(ast, { partialEval: true, trackState: true })
        .evalWithDetails(vars);

      expect(isUnknown(evaluated.value)).toBe(true);
      expect(astToString(celEnv.residualAst(ast, evaluated.details))).toBe(testCase.residual);
    }
  });
});

describe("cel/cel_test.go/TestResidualAstNil", () => {
  it("rejects missing AST and evaluation details", () => {
    expect(() => env().residualAst(undefined, undefined)).toThrow("unsupported expr");
  });
});

describe("cel/cel_test.go/TestPartialVars", () => {
  it("evaluates every synced manual and inferred unknown-variable case", () => {
    const cases = syncedCases<{
      in: Record<string, unknown>;
      unk: Array<{ $expr: string }>;
      out: unknown;
      partialOut?: unknown;
    }>("cel/cel_test.go/TestPartialVars");
    const celEnv = env({
      variables: [variableDecl("x", StringType), variableDecl("y", IntType)],
    });
    const program = celEnv.program(celEnv.compile("x == string(y)"), {
      partialEval: true,
    });

    for (const testCase of cases) {
      const manual = program.eval(
        partialActivation({
          bindings: testCase.in,
          unknowns: testCase.unk.map(syncedAttributePattern),
        }),
      );
      const inferred = program.eval(celEnv.partialVars(testCase.in));

      expectVal(manual, resolveSyncedExpr(testCase.out) as Val);
      expectVal(inferred, resolveSyncedExpr(testCase.partialOut ?? testCase.out) as Val);
    }
  });
});

describe("cel/cel_test.go/TestResidualAstAttributeQualifiers", () => {
  it("replaces resolved map, list, and conditional qualifiers with values", () => {
    const celEnv = env({
      variables: [
        variableDecl("x", mapType(StringType, DynType)),
        variableDecl("y", listType(IntType)),
        variableDecl("u", IntType),
      ],
    });
    const ast = celEnv.parse(
      `x.abc == u && x["abc"] == u && x[x.string] == u && y[0] == u && ` +
        `y[x.zero] == u && (true ? x : y).abc == u && (false ? y : x).abc == u`,
    );
    const vars = partialActivation({
      bindings: {
        x: { zero: 0, abc: 123, string: "abc" },
        y: [123],
      },
      unknowns: [attributePattern("u")],
    });
    const controller = new AbortController();
    const evaluated = celEnv
      .program(ast, { partialEval: true, trackState: true })
      .contextEvalWithDetails(vars, { signal: controller.signal });

    expect(isUnknown(evaluated.value)).toBe(true);
    expect(astToString(celEnv.residualAst(ast, evaluated.details))).toBe(
      "123 == u && 123 == u && 123 == u && 123 == u && 123 == u && 123 == u && 123 == u",
    );
  });
});

describe("cel/cel_test.go/TestPartialVarsEnv", () => {
  it("does not infer unknowns when every environment variable is bound", () => {
    const celEnv = env({
      variables: [variableDecl("x", IntType), variableDecl("y", IntType)],
    });
    const result = celEnv
      .program(celEnv.compile("x == y"), { partialEval: true })
      .eval(celEnv.partialVars({ x: 1, y: 1 }));

    expect(result.value()).toBe(true);
  });
});

describe("cel/cel_test.go/TestPartialVarsExtendedEnv", () => {
  it("infers missing variables declared by a parent environment", () => {
    const celEnv = env({
      variables: [variableDecl("x", IntType), variableDecl("y", IntType)],
    });
    celEnv.compile("x == y");
    const extended = celEnv.extend({
      variables: [variableDecl("z", IntType)],
    });
    const result = extended
      .program(extended.compile("x == y && y == z"), { partialEval: true })
      .eval(extended.partialVars({ z: 1, y: 1 }));

    expect(isUnknown(result)).toBe(true);
    expect((result as Unknown).toString()).toBe("x (1)");
  });
});

describe("cel/cel_test.go/TestResidualAstModified", () => {
  it("leaves the source AST unchanged across repeated residualization", () => {
    const celEnv = env({
      variables: [variableDecl("x", mapType(StringType, IntType)), variableDecl("y", IntType)],
    });
    const ast = celEnv.parse("x == y");
    const program = celEnv.program(ast, { partialEval: true, trackState: true });

    for (const x of [123, 456]) {
      const evaluated = program.evalWithDetails(
        partialActivation({
          bindings: { x },
          unknowns: [attributePattern("y")],
        }),
      );

      expect(isUnknown(evaluated.value)).toBe(true);
      expect(astToString(ast)).toBe("x == y");
      expect(astToString(celEnv.residualAst(ast, evaluated.details))).toBe(`${x} == y`);
    }
  });
});

/**
 * syncedAttributePattern converts the attribute-pattern expressions emitted by cel-go fixtures.
 */
function syncedAttributePattern(value: { $expr: string }): AttributePattern {
  const variable = value.$expr.match(/AttributePattern\("([^"]+)"\)/)?.[1];
  if (variable === undefined) {
    throw new Error(`unsupported synced attribute pattern: ${value.$expr}`);
  }
  const pattern = attributePattern(variable);
  for (const qualifier of value.$expr.matchAll(/QualString\("([^"]*)"\)/g)) {
    pattern.qualString(qualifier[1]!);
  }
  if (value.$expr.includes("Wildcard()")) {
    pattern.wildcard();
  }
  return pattern;
}

/**
 * residualMacroEnv constructs the macro-tracking environment recorded in a synced fixture.
 */
function residualMacroEnv(expression: string) {
  const declarations = [
    ...expression.matchAll(
      /Variable\(("[^"]+"), (ListType\(IntType\)|IntType|MapType\(StringType, DynType\))\)/g,
    ),
  ].map((match) =>
    variableDecl(
      JSON.parse(match[1]!) as string,
      match[2] === "ListType(IntType)"
        ? listType(IntType)
        : match[2] === "IntType"
          ? IntType
          : mapType(StringType, DynType),
    ),
  );
  return env({
    parser: { populateMacroCalls: true },
    variables: declarations,
  });
}

/**
 * expectVal compares CEL values using their stable value and diagnostic representations.
 */
function expectVal(actual: Val, expected: unknown): void {
  if (expected instanceof Error) {
    expect(actual).toBeInstanceOf(Error);
    expect((actual as unknown as Error).message).toContain(
      expected.message.replace("no such attribute: ", ""),
    );
    return;
  }
  if (
    isUnknown(actual) ||
    (typeof expected === "object" && expected !== null && isUnknown(expected as Val))
  ) {
    expect(actual.toString()).toBe(String(expected));
    return;
  }
  const expectedValue =
    typeof expected === "object" &&
    expected !== null &&
    "value" in expected &&
    typeof expected.value === "function"
      ? expected.value()
      : expected;
  expect(actual.value()).toEqual(expectedValue);
}
