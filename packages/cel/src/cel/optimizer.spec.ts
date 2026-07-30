import { describe, expect, it } from "vitest";
import {
  type AST,
  type ASTOptimizer,
  astToString,
  type Env,
  env,
  mapType,
  type OptimizerContext,
  StringType,
  staticOptimizer,
  textSource,
  variableDecl,
} from "../index.js";
import type { Macro } from "../parser/options.js";

/** BindMacro expands `cel.bind(var, init, result)` into a single-evaluation comprehension. */
const BindMacro: Macro = {
  function: "bind",
  argCount: 3,
  receiverStyle: true,
  expander: (helper, target, argumentsValue) => {
    const variableName = argumentsValue[0]?.asIdent();
    if (target?.asIdent() !== "cel" || !variableName) {
      return helper.error(
        argumentsValue[0]?.id() ?? 0,
        "cel.bind() variable names must be simple identifiers",
      );
    }
    return helper.comprehension(
      helper.list(),
      "#unused",
      variableName,
      argumentsValue[1]!,
      helper.literal(false),
      helper.ident(variableName),
      argumentsValue[2]!,
    );
  },
};

/**
 * IdentityOptimizer copies an AST and its macro metadata without changing its expression.
 */
class IdentityOptimizer implements ASTOptimizer {
  /** optimize returns a fresh AST containing a collision-free copy of the input. */
  public optimize(context: OptimizerContext, input: AST): AST {
    // The copy updates all old macro references with identical, renumbered references.
    const main = context.copyAstAndMetadata(input);
    // The AST call creates a parsed expression which the static optimizer type-checks.
    return context.ast(main);
  }
}

/**
 * UpdateOptimizer replaces a presence-test operand with an independently compiled expression.
 */
class UpdateOptimizer implements ASTOptimizer {
  /** constructor retains the checked expression which will be inserted into the target. */
  constructor(private readonly inlineExpression: AST) {}

  /** optimize replaces the target while preserving nested and outer macro metadata. */
  public optimize(context: OptimizerContext, input: AST): AST {
    const copy = context.copyAstAndMetadata(this.inlineExpression);
    const originalId = input.expr().id();
    const replacement = context.hasMacro({
      macroId: originalId,
      selection: copy,
    });
    expect([...context.macroCalls().keys()]).toHaveLength(2);
    context.updateExpr({ target: input.expr(), updated: replacement.astExpr });
    context.setMacroCall({ id: originalId, expr: replacement.macroExpr });
    return context.ast(input.expr());
  }
}

/**
 * ReplaceOptimizer returns a metadata-preserving copy of a replacement AST.
 */
class ReplaceOptimizer implements ASTOptimizer {
  /** constructor retains the checked replacement expression. */
  constructor(private readonly replacement: AST) {}

  /** optimize replaces the complete input expression. */
  public optimize(context: OptimizerContext, _input: AST): AST {
    return context.ast(context.copyAstAndMetadata(this.replacement));
  }
}

/**
 * optimizerEnv creates the macro-tracking environment shared by the upstream optimizer cases.
 */
function optimizerEnv(): Env {
  return env({
    macros: { custom: [BindMacro] },
    parser: { populateMacroCalls: true },
    variables: [
      variableDecl("a", mapType(StringType, StringType)),
      variableDecl("x", mapType(StringType, StringType)),
      variableDecl("y", mapType(StringType, StringType)),
    ],
  });
}

describe("cel/optimizer_test.go/TestStaticOptimizerUpdateExpr", () => {
  it("updates an expression while keeping macro metadata consistent", () => {
    const celEnv = optimizerEnv();
    const input = celEnv.compile("has(a.b)");
    const inlineExpression = celEnv.compile("[x, y].filter(i, i.size() > 0)[0].z");
    const optimizer = staticOptimizer({
      optimizers: [new UpdateOptimizer(inlineExpression)],
    });

    const optimized = optimizer.optimize(celEnv, input);

    expect(astToString(optimized)).toBe("has([x, y].filter(i, i.size() > 0)[0].z)");
    expect([...optimized.sourceInfo().macroCalls().keys()].sort((a, b) => a - b)).toEqual([1, 3]);
  });
});

describe("cel/optimizer_test.go/TestStaticOptimizerNewAST", () => {
  it("copies identity expressions and macro metadata without changing their source form", () => {
    const celEnv = optimizerEnv();
    const optimizer = staticOptimizer({ optimizers: [new IdentityOptimizer()] });

    for (const expression of [
      "[3, 2, 1]",
      "[1, 2, 3].all(i, i != 0)",
      'cel.bind(m, {"a": 1, "b": 2}, m.filter(k, m[k] > 1))',
    ]) {
      expect(astToString(optimizer.optimize(celEnv, celEnv.compile(expression)))).toBe(expression);
    }
  });
});

describe("cel/optimizer_test.go/TestOptimizeWithSource", () => {
  it("uses the option-object source override for replacement metadata", () => {
    const celEnv = optimizerEnv();
    const replacement = 'x["a"]';
    const replacementAst = celEnv.compile(replacement);
    const optimizer = staticOptimizer({
      optimizers: [new ReplaceOptimizer(replacementAst)],
      source: textSource(replacement),
    });

    const optimized = optimizer.optimize(celEnv, celEnv.compile("has(a.b)"));

    expect(astToString(optimized)).toBe(replacement);
    expect(optimized.source().content()).toBe(replacement);
    expect(optimized.sourceInfo().description()).toBe("<input>");
    expect(optimized.sourceInfo().lineOffsets()).toEqual([7]);
    expect(
      Object.fromEntries(
        [...optimized.sourceInfo().offsetRanges()].map(([id, range]) => [id, range.start]),
      ),
    ).toEqual({ 1: 1, 2: 0, 3: 2 });
  });
});

describe("cel/optimizer_test.go/TestStaticOptimizerNilAST", () => {
  it("rejects an unspecified input AST", () => {
    const optimizer = staticOptimizer({ optimizers: [new IdentityOptimizer()] });

    expect(() => optimizer.optimize(optimizerEnv(), undefined)).toThrow(
      "unexpected unspecified type",
    );
  });
});
