import { describe, expect, it } from "vitest";
import { type Env, env, unwrapAst } from "../cel/env.js";
import {
  AST,
  callExpr,
  type Expr,
  exprFactory,
  functionReference,
  literalExpr,
  postOrderVisit,
} from "../common/ast/index.js";
import { func, overload, variable } from "../common/decls.js";
import * as operators from "../common/operators.js";
import { isError } from "../common/types/err.js";
import { BoolType, IntType, StringType, typeToExprType } from "../common/types/types.js";
import { createComposition } from "./expression.js";

function testEnv(): Env {
  return env({
    variables: [variable("x", IntType), variable("y", IntType), variable("z", IntType)],
    functions: [func("boom", { overloads: [overload("boom_bool", [], BoolType)] })],
  });
}

function ids(ast: AST): number[] {
  const collected: number[] = [];
  postOrderVisit(ast.expr(), (expr) => collected.push(expr.id()));
  return collected;
}

/**
 * fakeCall builds a call node under a function name that mimics a standard logical operator
 * (`_&&_`, `_||_`, `!_`) but resolves to a non-standard overload id -- e.g. an overload declared
 * over string arguments rather than the standard boolean signature, so it is both genuinely
 * evaluable by a target that declares it and genuinely distinct from the standard operator. This
 * is built by hand, since the parser never produces these function names for anything but the real
 * operators, to exercise the "a function that merely resembles the operator is left alone" guard.
 */
function fakeCall(functionName: string, overloadId: string, args: Expr[]): AST {
  const typeMap = new Map([[1, typeToExprType(BoolType)]]);
  const refMap = new Map([[1, functionReference(overloadId)]]);
  let nextId = 2;
  const numbered = args.map((arg) => {
    const clone = exprFactory().copyExpr(arg);
    clone.renumberIds(() => nextId++);
    return clone;
  });
  const root = callExpr(1, functionName, numbered);
  return new AST(root, undefined, typeMap, refMap);
}

describe("composition/expression", () => {
  describe("createComposition", () => {
    it("requires a target environment", () => {
      // @ts-expect-error exercising the runtime guard directly
      expect(() => createComposition(undefined)).toThrow("requires a target environment");
    });
  });

  describe("and", () => {
    it("returns checked Boolean true for zero operands", () => {
      const target = testEnv();
      const result = createComposition(target).and();
      expect(target.program(result).eval({}).value()).toBe(true);
    });

    it("returns a semantically equivalent expression for one operand", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const result = createComposition(target).and(a);
      expect(target.program(result).eval({ x: 1n }).value()).toBe(true);
      expect(target.program(result).eval({ x: 2n }).value()).toBe(false);
    });

    it("preserves operand order", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const b = unwrapAst(target.compile("y == 2"));
      const c = unwrapAst(target.compile("z == 3"));
      const result = createComposition(target).and(a, b, c);
      const call = result.expr().asCall()!;
      expect(call.args()).toHaveLength(3);
      expect(call.args()[0]!.asCall()!.args()[1]!.asLiteral()).toBe(1n);
      expect(call.args()[1]!.asCall()!.args()[1]!.asLiteral()).toBe(2n);
      expect(call.args()[2]!.asCall()!.args()[1]!.asLiteral()).toBe(3n);
    });

    it("flattens nested standard conjunctions", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const b = unwrapAst(target.compile("y == 2"));
      const c = unwrapAst(target.compile("z == 3"));
      const composition = createComposition(target);
      const bc = composition.and(b, c);
      const result = composition.and(a, bc);
      expect(result.expr().asCall()!.args()).toHaveLength(3);
    });

    it("does not flatten a custom function that merely resembles conjunction", () => {
      // A string-typed "_&&_" overload cannot collide with the standard [Bool, Bool] overload, so
      // it is both genuinely evaluable by a target that declares it and genuinely non-standard.
      const target = testEnv().extend({
        functions: [
          func(operators.LogicalAnd, {
            overloads: [overload("string_and", [StringType, StringType], BoolType)],
          }),
        ],
      });
      const a = unwrapAst(target.compile("x == 1"));
      const fake = fakeCall("_&&_", "string_and", [literalExpr(0, "p"), literalExpr(0, "q")]);
      const result = createComposition(target).and(a, fake);
      // fake must survive as a single opaque operand rather than being inlined.
      expect(result.expr().asCall()!.args()).toHaveLength(2);
    });

    it("removes true identity operands", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const t = unwrapAst(target.compile("true"));
      const result = createComposition(target).and(t, a, t);
      expect(result.expr().kind()).toBe(a.expr().kind());
      expect(target.program(result).eval({ x: 1n }).value()).toBe(true);
    });

    it("short-circuits to false on an absorbing false operand", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const b = unwrapAst(target.compile("y == 2"));
      const result = createComposition(target).and(a, unwrapAst(target.compile("false")), b);
      expect(target.program(result).eval({}).value()).toBe(false);
    });

    it("removes structural duplicates, keeping the first occurrence", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const b = unwrapAst(target.compile("y == 2"));
      const result = createComposition(target).and(a, b, a, unwrapAst(target.compile("z == 3")), b);
      expect(result.expr().asCall()!.args()).toHaveLength(3);
    });

    it("does not mutate its input ASTs", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const beforeIds = ids(a);
      createComposition(target).and(a, unwrapAst(target.compile("y == 2")));
      expect(ids(a)).toEqual(beforeIds);
    });

    it("rejects a non-Boolean operand", () => {
      const target = testEnv();
      const nonBool = unwrapAst(target.compile("x"));
      expect(() => createComposition(target).and(nonBool)).toThrow("Boolean root type");
    });

    it("rejects a parsed-only operand", () => {
      const target = testEnv();
      const parsed = unwrapAst(target.parse("x == 1"));
      expect(() => createComposition(target).and(parsed)).toThrow("checked expression");
    });

    it("rejects an operand the target cannot evaluate", () => {
      const target = testEnv();
      const other = env({ variables: [variable("w", IntType)] });
      const foreign = unwrapAst(other.compile("w == 1"));
      expect(() => createComposition(target).and(foreign)).toThrow("not evaluable");
    });
  });

  describe("or", () => {
    it("returns checked Boolean false for zero operands", () => {
      const target = testEnv();
      const result = createComposition(target).or();
      expect(target.program(result).eval({}).value()).toBe(false);
    });

    it("removes false identity operands", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const f = unwrapAst(target.compile("false"));
      const result = createComposition(target).or(f, a, f);
      expect(target.program(result).eval({ x: 1n }).value()).toBe(true);
    });

    it("short-circuits to true on an absorbing true operand", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const result = createComposition(target).or(a, unwrapAst(target.compile("true")));
      expect(target.program(result).eval({ x: 99n }).value()).toBe(true);
    });

    it("removes structural duplicates", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const b = unwrapAst(target.compile("y == 2"));
      const result = createComposition(target).or(a, b, a);
      expect(result.expr().asCall()!.args()).toHaveLength(2);
    });
  });

  describe("not", () => {
    it("negates true to false", () => {
      const target = testEnv();
      const result = createComposition(target).not(unwrapAst(target.compile("true")));
      expect(target.program(result).eval({}).value()).toBe(false);
    });

    it("negates false to true", () => {
      const target = testEnv();
      const result = createComposition(target).not(unwrapAst(target.compile("false")));
      expect(target.program(result).eval({}).value()).toBe(true);
    });

    it("rejects a checked non-Boolean operand", () => {
      const target = testEnv();
      expect(() => createComposition(target).not(unwrapAst(target.compile("1")))).toThrow(
        "Boolean root type",
      );
    });

    it("simplifies double negation of the standard operator", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const composition = createComposition(target);
      const result = composition.not(composition.not(a));
      expect(result.expr().kind()).toBe(a.expr().kind());
      expect(target.program(result).eval({ x: 1n }).value()).toBe(true);
      expect(target.program(result).eval({ x: 2n }).value()).toBe(false);
    });

    it("does not mistake a custom function for the standard negation", () => {
      // A string-typed "!_" overload cannot collide with the standard [Bool] overload, so it is
      // both genuinely evaluable by a target that declares it and genuinely non-standard.
      const target = testEnv().extend({
        functions: [
          func(operators.LogicalNot, {
            overloads: [overload("string_not", [StringType], BoolType)],
          }),
        ],
      });
      const fakeNot = fakeCall("!_", "string_not", [literalExpr(0, "p")]);
      const result = createComposition(target).not(fakeNot);
      // A real double-negation collapse would drop straight to the operand's own call kind; here
      // the wrapper must remain since the operand only resembles the standard negation.
      const call = result.expr().asCall()!;
      expect(call.functionName()).toBe("!_");
      expect(call.args()).toHaveLength(1);
    });
  });

  describe("metadata", () => {
    it("produces unique result expression ids", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const b = unwrapAst(target.compile("y == 2"));
      const result = createComposition(target).and(a, b);
      const collected = ids(result);
      expect(new Set(collected).size).toBe(collected.length);
    });

    it("uses the standard logical overload reference on the constructed root", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const b = unwrapAst(target.compile("y == 2"));
      const result = createComposition(target).and(a, b);
      const rootId = result.expr().id();
      expect(result.referenceMap().get(rootId)?.overloadIds).toContain("logical_and");
      expect(result.getType(rootId)?.typeKind.case).toBe("primitive");
    });

    it("omits source metadata rather than attributing a composed node to one operand's source", () => {
      // Composed results carry no source location at all, so no source-position or macro-call id
      // can survive expression-id remapping pointing at a node that is no longer there.
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const b = unwrapAst(target.compile("y == 2"));
      const result = createComposition(target).and(a, b);
      expect(result.sourceInfo().offsetRanges().size).toBe(0);
      expect(result.sourceInfo().macroCalls().size).toBe(0);
    });
  });

  describe("evaluation equivalence", () => {
    it("evaluates equivalently to a normally checked && expression", () => {
      const target = testEnv();
      const a = unwrapAst(target.compile("x == 1"));
      const b = unwrapAst(target.compile("y == 2"));
      const composed = createComposition(target).and(a, b);
      const normal = unwrapAst(target.compile("x == 1 && y == 2"));
      for (const bindings of [
        { x: 1n, y: 2n },
        { x: 1n, y: 3n },
        { x: 0n, y: 2n },
      ]) {
        expect(target.program(composed).eval(bindings).value()).toBe(
          target.program(normal).eval(bindings).value(),
        );
      }
    });

    it("short-circuits so the second operand's binding is not invoked when the first is false", () => {
      const target = testEnv().extend({
        functions: [
          func("boom", {
            overloads: [
              overload("boom_bool", [], BoolType, {
                functionBinding: (): never => {
                  throw new Error("boom should not be called");
                },
              }),
            ],
          }),
        ],
      });
      const a = unwrapAst(target.compile("x == 1"));
      const errorsOut = unwrapAst(target.compile("boom()"));
      const composed = createComposition(target).and(a, errorsOut);
      const result = target.program(composed).eval({ x: 0n });
      expect(result.value()).toBe(false);
    });

    it("propagates a CEL error from a composed operand", () => {
      const errorEnv = env({ variables: [variable("x", IntType)] });
      const divByZero = unwrapAst(errorEnv.compile("(1 / 0) == 1"));
      const composed = createComposition(errorEnv).and(divByZero);
      const result = errorEnv.program(composed).eval({ x: 1n });
      expect(isError(result)).toBe(true);
    });
  });
});
