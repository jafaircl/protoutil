import { TestAllTypesSchema as Proto2TestAllTypesSchema } from "@protoutil/testing/cel/proto2";
import { TestAllTypesSchema as Proto3TestAllTypesSchema } from "@protoutil/testing/cel/proto3";
import { describe, expect, it } from "vitest";
import { type Env, env } from "../cel/env.js";
import type { SingletonLibrary } from "../cel/library.js";
import { optionalTypes } from "../cel/library.js";
import { func, overload, variable } from "../common/decls.js";
import { Bool } from "../common/types/bool.js";
import { type NativeObjectDescriptor, registry } from "../common/types/provider.js";
import { BoolType, IntType, objectType, opaqueType, StringType } from "../common/types/types.js";
import type { InterpretableDecoratorV2 } from "../interpreter/decorators.js";
import { globalMacro } from "../parser/macro.js";
import {
  assignableEnvironment,
  canEvaluate,
  composeEnvironments,
  equalEnvironments,
} from "./environment.js";

/** userDescriptor describes a native object type with one string field. */
function userDescriptor(fields: NativeObjectDescriptor["fields"]): NativeObjectDescriptor {
  return { typeName: "app.User", fields };
}

const nameField = { celName: "name", property: "name", type: StringType };
const idField = { celName: "id", property: "id", type: IntType };

/** userEnv declares `user` as a native object type described by the given fields. */
function userEnv(fields: NativeObjectDescriptor["fields"]): Env {
  const types = registry();
  types.registerNativeTypes(userDescriptor(fields));
  return env({
    registry: types,
    variables: [variable("user", objectType("app.User"))],
  });
}

/** countingLibrary reports how many interpretable nodes its decorator was applied to. */
function countingLibrary(count: { applied: number }): SingletonLibrary {
  const decorator: InterpretableDecoratorV2 = (value) => {
    count.applied += 1;
    return value;
  };
  return {
    libraryName: "test.lib.counting",
    compileOptions: {},
    programOptions: { decorators: [decorator] },
  };
}

/** programOptionLibrary installs static program options under a unique library name. */
function programOptionLibrary(
  name: string,
  programOptions: SingletonLibrary["programOptions"],
): SingletonLibrary {
  return { libraryName: name, compileOptions: {}, programOptions };
}

describe("composition/environment", () => {
  describe("composeEnvironments", () => {
    it("requires at least one environment", () => {
      expect(() => composeEnvironments()).toThrow("requires at least one environment");
    });

    it("returns an equivalent environment for a single input", () => {
      const source = env({ variables: [variable("x", IntType)] });
      const result = composeEnvironments(source);
      expect(equalEnvironments(source, result)).toBe(true);
    });

    it("composes multiple disjoint environments", () => {
      const a = env({ variables: [variable("x", IntType)] });
      const b = env({ variables: [variable("y", StringType)] });
      const composed = composeEnvironments(a, b);
      expect(composed.hasFunction("x")).toBe(false);
      const names = composed.variables().map((v) => v.name());
      expect(names).toContain("x");
      expect(names).toContain("y");
    });

    it("does not grow the standard declarations by composing (regression)", () => {
      // The standard declarations of both inputs are merged by name. Concatenating them instead
      // would double the standard library on every composition.
      const a = env({});
      const b = env({});
      const composed = composeEnvironments(a, b);
      expect(composed.functions().size).toBe(a.functions().size);
      expect(composeEnvironments(composed, a).functions().size).toBe(a.functions().size);
    });

    it("carries a source environment's custom macro into the result (regression)", () => {
      // A macro declared directly on a source environment (not contributed by a library) has to
      // survive composition just like a directly-declared variable or function does.
      const myMacro = globalMacro("myMacro", 0, (eh) => eh.literal(true));
      const a = env({});
      const b = env({ macros: { custom: [myMacro] } });
      const composed = composeEnvironments(a, b);
      const ast = composed.compile("myMacro()");
      expect(composed.program(ast).eval({}).value()).toBe(true);
    });

    it("composes environments sharing a common base", () => {
      const base = env({ variables: [variable("shared", IntType)] });
      const a = base.extend({ variables: [variable("x", IntType)] });
      const b = base.extend({ variables: [variable("y", StringType)] });
      const composed = composeEnvironments(a, b);
      const names = composed.variables().map((v) => v.name());
      expect(names).toEqual(expect.arrayContaining(["shared", "x", "y"]));
    });

    it("does not mutate any input environment", () => {
      const a = env({ variables: [variable("x", IntType)] });
      const b = env({ variables: [variable("y", StringType)] });
      composeEnvironments(a, b);
      expect(a.variables().map((v) => v.name())).toEqual(["x"]);
      expect(b.variables().map((v) => v.name())).toEqual(["y"]);
    });

    it("accepts compatible duplicate variables", () => {
      const a = env({ variables: [variable("x", IntType)] });
      const b = env({ variables: [variable("x", IntType)] });
      expect(() => composeEnvironments(a, b)).not.toThrow();
    });

    it("fails on conflicting variables", () => {
      const a = env({ variables: [variable("x", IntType)] });
      const b = env({ variables: [variable("x", StringType)] });
      expect(() => composeEnvironments(a, b)).toThrow();
    });

    it("accepts compatible function overloads", () => {
      const overloadA = func("triple", {
        overloads: [overload("triple_int", [IntType], IntType)],
      });
      const a = env({ functions: [overloadA] });
      const b = env({
        functions: [
          func("triple", { overloads: [overload("triple_string", [StringType], StringType)] }),
        ],
      });
      const composed = composeEnvironments(a, b);
      const triple = composed.functions().get("triple");
      expect(triple?.overloadDecls().map((o) => o.id())).toEqual(
        expect.arrayContaining(["triple_int", "triple_string"]),
      );
    });

    it("fails on conflicting overloads", () => {
      const a = env({
        functions: [func("triple", { overloads: [overload("triple_int", [IntType], IntType)] })],
      });
      const b = env({
        functions: [func("triple", { overloads: [overload("triple_int", [IntType], StringType)] })],
      });
      expect(() => composeEnvironments(a, b)).toThrow();
    });

    it("fails when two different overload ids collide on the same argument signature", () => {
      // Same function name, different overload ids, but both take a single int -- an ambiguous
      // pair to dispatch, so this must fail even though neither id is a redefinition of the other.
      const a = env({
        functions: [func("triple", { overloads: [overload("triple_int_v1", [IntType], IntType)] })],
      });
      const b = env({
        functions: [
          func("triple", { overloads: [overload("triple_int_v2", [IntType], StringType)] }),
        ],
      });
      expect(() => composeEnvironments(a, b)).toThrow("collision");
    });

    it("accepts an identical overload declared on both sides", () => {
      // Same function name, same overload id, same signature on both sides -- a true duplicate,
      // not a conflict, so it must merge into a single overload rather than fail.
      const declareTriple = () =>
        func("triple", { overloads: [overload("triple_int", [IntType], IntType)] });
      const a = env({ functions: [declareTriple()] });
      const b = env({ functions: [declareTriple()] });
      const composed = composeEnvironments(a, b);
      expect(composed.functions().get("triple")?.overloadDecls()).toHaveLength(1);
    });

    it("accepts distinct type registrations", () => {
      const a = env({
        variables: [variable("msg", objectType(Proto3TestAllTypesSchema.typeName))],
      });
      const b = env({
        variables: [variable("other", objectType(Proto2TestAllTypesSchema.typeName))],
      });
      expect(() => composeEnvironments(a, b)).not.toThrow();
    });

    it("unions registries supplied directly to each environment", () => {
      const left = registry();
      left.registerDescriptor(Proto3TestAllTypesSchema.file);
      const right = registry();
      right.registerDescriptor(Proto2TestAllTypesSchema.file);
      const composed = composeEnvironments(env({ registry: left }), env({ registry: right }));
      expect(
        composed.typeProvider().findStructType(Proto3TestAllTypesSchema.typeName),
      ).toBeDefined();
      expect(
        composed.typeProvider().findStructType(Proto2TestAllTypesSchema.typeName),
      ).toBeDefined();
    });

    it("keeps the composed registry independent of its input registries", () => {
      const left = registry();
      const composed = composeEnvironments(env({ registry: left }), env({}));
      left.registerDescriptor(Proto3TestAllTypesSchema.file);
      expect(
        composed.typeProvider().findStructType(Proto3TestAllTypesSchema.typeName),
      ).toBeUndefined();
    });

    it("accepts compatible duplicate descriptors", () => {
      const a = env({ contextProto: Proto3TestAllTypesSchema });
      const b = env({
        variables: [variable("msg", objectType(Proto3TestAllTypesSchema.typeName))],
      });
      expect(() => composeEnvironments(a, b)).not.toThrow();
    });

    it("accepts an identical native type registered in both registries", () => {
      const composed = composeEnvironments(userEnv([nameField]), userEnv([nameField]));
      expect(composed.typeProvider().findStructFieldType("app.User", "name")).toBeDefined();
    });

    it("fails on conflicting descriptors registered under one name", () => {
      expect(() => composeEnvironments(userEnv([nameField]), userEnv([idField]))).toThrow(
        "native type registration conflict",
      );
    });

    it("fails on conflicting runtime types registered under one name", () => {
      const a = env({ types: [opaqueType("app.Handle", IntType)] });
      const b = env({ types: [opaqueType("app.Handle", StringType)] });
      expect(() => composeEnvironments(a, b)).toThrow("type registration conflict");
    });

    it("accepts the same context type twice", () => {
      const a = env({ contextProto: Proto3TestAllTypesSchema });
      const b = env({ contextProto: Proto3TestAllTypesSchema });
      expect(() => composeEnvironments(a, b)).not.toThrow();
    });

    it("fails on different context types", () => {
      const a = env({ contextProto: Proto3TestAllTypesSchema });
      const b = env({ contextProto: Proto2TestAllTypesSchema });
      expect(() => composeEnvironments(a, b)).toThrow("conflicting context types");
    });

    it("accepts distinct uniquely named libraries", () => {
      const a = env({ libraries: [optionalTypes()] });
      const b = env({});
      const composed = composeEnvironments(a, b);
      expect(composed.hasLibrary("cel.lib.optional")).toBe(true);
    });

    it("installs a duplicate library name once", () => {
      const a = env({ libraries: [optionalTypes()] });
      const b = env({ libraries: [optionalTypes()] });
      const composed = composeEnvironments(a, b);
      expect(composed.libraries().filter((name) => name === "cel.lib.optional")).toHaveLength(1);
    });

    it("preserves library-contributed runtime behavior", () => {
      const a = env({});
      const b = env({ libraries: [optionalTypes()] });
      const composed = composeEnvironments(a, b);
      const ast = composed.compile("optional.of(1).hasValue()");
      const result = composed.program(ast).eval({});
      expect(result.value()).toBe(true);
    });

    it("applies the program options of one library name once", () => {
      const count = { applied: 0 };
      // Two library values with one name: the name identifies the semantics, so the composed
      // environment must plan programs with a single copy of the decorator.
      const a = env({ libraries: [countingLibrary(count)] });
      const b = env({ libraries: [countingLibrary(count)] });
      const composed = composeEnvironments(a, b);

      count.applied = 0;
      a.program(a.compile("1 + 1"));
      const single = count.applied;
      expect(single).toBeGreaterThan(0);

      count.applied = 0;
      composed.program(composed.compile("1 + 1"));
      expect(count.applied).toBe(single);
    });

    it("preserves a program option contributed by only one input", () => {
      const count = { applied: 0 };
      const composed = composeEnvironments(env({}), env({ libraries: [countingLibrary(count)] }));
      count.applied = 0;
      composed.program(composed.compile("1 + 1"));
      expect(count.applied).toBeGreaterThan(0);
    });

    it("fails on conflicting evaluation-semantic program options", () => {
      const a = env({
        libraries: [programOptionLibrary("test.lib.exhaustive", { exhaustiveEval: true })],
      });
      const b = env({});
      expect(() => composeEnvironments(a, b)).toThrow("exhaustiveEval");
    });

    it("fails on conflicting planning program options", () => {
      const a = env({
        libraries: [programOptionLibrary("test.lib.optimize.on", { optimize: true })],
      });
      const b = env({
        libraries: [programOptionLibrary("test.lib.optimize.off", { optimize: false })],
      });
      expect(() => composeEnvironments(a, b)).toThrow("optimize");
    });

    it("fails on conflicting non-additive state it can observe (jsonFieldNames)", () => {
      const a = env({ jsonFieldNames: true });
      const b = env({ jsonFieldNames: false });
      expect(() => composeEnvironments(a, b)).toThrow("jsonFieldNames");
    });

    it("fails on conflicting defaultUTCTimeZone", () => {
      const a = env({ defaultUTCTimeZone: true });
      const b = env({ defaultUTCTimeZone: false });
      expect(() => composeEnvironments(a, b)).toThrow("defaultUTCTimeZone");
    });

    it("fails on conflicting errorOnBadPresenceTest", () => {
      const a = env({ errorOnBadPresenceTest: true });
      const b = env({ errorOnBadPresenceTest: false });
      expect(() => composeEnvironments(a, b)).toThrow("errorOnBadPresenceTest");
    });

    it("restores standard declarations one input excluded", () => {
      // Standard declarations are additive: adding them back cannot invalidate an expression the
      // environment without them checked, so both inputs stay assignable to the result.
      const a = env({});
      const b = env({ standardLibrary: false });
      const composed = composeEnvironments(a, b);
      expect(composed.hasLibrary("cel.lib.std")).toBe(true);
      expect(composed.program(composed.compile("1 + 1")).eval({}).value()).toBe(2n);
      expect(assignableEnvironment(a, composed)).toBe(true);
      expect(assignableEnvironment(b, composed)).toBe(true);
    });

    it("does not block composition on a library's parser feature the target lacks (regression)", () => {
      // optionalTypes() sets parser: { enableOptionalSyntax: true } in its compileOptions. That is
      // an additive parsing feature, not an evaluation-semantic mode, so it must not be treated as
      // a conflict -- and the composed environment must still parse the syntax it enables.
      const a = env({});
      const b = env({ libraries: [optionalTypes()] });
      const composed = composeEnvironments(a, b);
      expect(() => composed.compile("[1, 2, 3][?0]")).not.toThrow();
    });

    it("does not block composition on differing checker or cost settings (regression)", () => {
      const a = env({
        checker: { crossTypeNumericComparisons: true, homogeneousAggregateLiterals: true },
        cost: { presenceTestHasCost: false },
      });
      const b = env({
        checker: { crossTypeNumericComparisons: false, homogeneousAggregateLiterals: false },
        cost: { presenceTestHasCost: true },
      });
      expect(() => composeEnvironments(a, b)).not.toThrow();
    });

    it("combines checker settings so the result admits what either input admitted", () => {
      const a = env({ checker: { crossTypeNumericComparisons: true } });
      const b = env({ checker: { crossTypeNumericComparisons: false } });
      const composed = composeEnvironments(a, b);
      expect(composed.tryCompile("1 < 2.0").errors).toBeUndefined();
    });

    it("does not block composition on differing resource limits (regression)", () => {
      const a = env({ regexProgramSizeLimit: 10, maxAstDepth: 5 });
      const b = env({ regexProgramSizeLimit: 20, maxAstDepth: 10 });
      const composed = composeEnvironments(a, b);
      expect(assignableEnvironment(a, composed)).toBe(true);
      expect(assignableEnvironment(b, composed)).toBe(true);
    });

    it("guarantees assignability from every input to the result", () => {
      const a = env({
        variables: [variable("x", IntType)],
        libraries: [optionalTypes()],
      });
      const b = env({
        variables: [variable("y", StringType)],
        contextProto: Proto3TestAllTypesSchema,
      });
      const composed = composeEnvironments(a, b);
      expect(assignableEnvironment(a, composed)).toBe(true);
      expect(assignableEnvironment(b, composed)).toBe(true);
    });
  });

  describe("equalEnvironments", () => {
    it("reports equal environments with identical effective state", () => {
      const a = env({ variables: [variable("x", IntType)] });
      const b = env({ variables: [variable("x", IntType)] });
      expect(equalEnvironments(a, b)).toBe(true);
    });

    it("reports inequality caused by variables", () => {
      const a = env({ variables: [variable("x", IntType)] });
      const b = env({ variables: [variable("y", IntType)] });
      expect(equalEnvironments(a, b)).toBe(false);
    });

    it("reports inequality caused by overloads", () => {
      const a = env({
        functions: [func("f", { overloads: [overload("f_int", [IntType], BoolType)] })],
      });
      const b = env({
        functions: [func("f", { overloads: [overload("f_string", [StringType], BoolType)] })],
      });
      expect(equalEnvironments(a, b)).toBe(false);
    });

    it("reports inequality caused by types", () => {
      const a = env({ contextProto: Proto3TestAllTypesSchema });
      const b = env({});
      expect(equalEnvironments(a, b)).toBe(false);
    });

    it("reports inequality caused by libraries", () => {
      const a = env({ libraries: [optionalTypes()] });
      const b = env({});
      expect(equalEnvironments(a, b)).toBe(false);
    });

    it("reports environments equal across a composition that adds nothing", () => {
      const a = env({ variables: [variable("x", IntType)] });
      const b = env({ variables: [variable("x", IntType)] });
      expect(equalEnvironments(a, composeEnvironments(a, b))).toBe(true);
    });
  });

  describe("assignableEnvironment", () => {
    it("is directional: a strict target superset is assignable but not vice versa", () => {
      const narrow = env({ variables: [variable("x", IntType)] });
      const wide = narrow.extend({ variables: [variable("y", StringType)] });
      expect(assignableEnvironment(narrow, wide)).toBe(true);
      expect(assignableEnvironment(wide, narrow)).toBe(false);
    });

    it("is false when a declared function is missing", () => {
      const source = env({
        functions: [func("f", { overloads: [overload("f_int", [IntType], BoolType)] })],
      });
      const target = env({});
      expect(assignableEnvironment(source, target)).toBe(false);
    });

    it("is false when the target declares an overload without a runtime binding", () => {
      const bound = func("f", {
        overloads: [overload("f_int", [IntType], BoolType, { unaryBinding: () => new Bool(true) })],
      });
      const declaredOnly = func("f", { overloads: [overload("f_int", [IntType], BoolType)] });
      const source = env({ functions: [bound] });
      const target = env({ functions: [declaredOnly] });
      expect(assignableEnvironment(source, target)).toBe(false);
      expect(assignableEnvironment(target, source)).toBe(true);
    });

    it("is false when a required type is missing", () => {
      const source = env({ contextProto: Proto3TestAllTypesSchema });
      const target = env({});
      expect(assignableEnvironment(source, target)).toBe(false);
    });

    it("is false when a declared message type is not registered in the target", () => {
      const source = env({
        variables: [variable("msg", objectType(Proto3TestAllTypesSchema.typeName))],
      });
      const target = env({ variables: [variable("msg", objectType("app.Missing"))] });
      expect(assignableEnvironment(source, target)).toBe(false);
    });

    it("is false when the target applies a different evaluation semantic", () => {
      const source = env({});
      const target = env({
        libraries: [programOptionLibrary("test.lib.exhaustive", { exhaustiveEval: true })],
      });
      expect(assignableEnvironment(source, target)).toBe(false);
    });

    it("is false when the target enforces a tighter runtime limit", () => {
      const source = env({ regexProgramSizeLimit: 100 });
      const target = env({ regexProgramSizeLimit: 10 });
      expect(assignableEnvironment(source, target)).toBe(false);
      expect(assignableEnvironment(target, source)).toBe(true);
    });
  });

  describe("canEvaluate", () => {
    function envWithVariable(): Env {
      return env({ variables: [variable("x", IntType)] });
    }

    function boundTriple() {
      return func("triple", {
        overloads: [
          overload("triple_int", [IntType], IntType, {
            unaryBinding: (value) => value,
          }),
        ],
      });
    }

    it("accepts an expression using only available variables", () => {
      const source = envWithVariable();
      const ast = source.compile("x + 1");
      expect(canEvaluate(source, ast)).toBe(true);
    });

    it("rejects an expression referencing a missing variable", () => {
      const source = envWithVariable();
      const ast = source.compile("x + 1");
      expect(canEvaluate(env({}), ast)).toBe(false);
    });

    it("accepts an expression whose overload is available and bound", () => {
      const source = env({ functions: [boundTriple()], variables: [variable("x", IntType)] });
      const ast = source.compile("triple(x)");
      expect(canEvaluate(source, ast)).toBe(true);
    });

    it("rejects an expression whose overload is missing", () => {
      const source = env({ functions: [boundTriple()], variables: [variable("x", IntType)] });
      const ast = source.compile("triple(x)");
      expect(canEvaluate(env({ variables: [variable("x", IntType)] }), ast)).toBe(false);
    });

    it("rejects an expression whose overload is declared without a runtime binding", () => {
      const source = env({ functions: [boundTriple()], variables: [variable("x", IntType)] });
      const ast = source.compile("triple(x)");
      const target = env({
        functions: [func("triple", { overloads: [overload("triple_int", [IntType], IntType)] })],
        variables: [variable("x", IntType)],
      });
      expect(canEvaluate(target, ast)).toBe(false);
    });

    it("accepts an expression selecting an available message field", () => {
      const source = env({ contextProto: Proto3TestAllTypesSchema });
      const ast = source.compile("single_int32");
      expect(canEvaluate(source, ast)).toBe(true);
    });

    it("rejects an expression referencing a missing message type", () => {
      const source = env({ contextProto: Proto3TestAllTypesSchema });
      const ast = source.compile("single_int32");
      expect(canEvaluate(env({}), ast)).toBe(false);
    });

    it("accepts a field selection the target's type declares", () => {
      const source = userEnv([nameField]);
      const ast = source.compile("user.name == ''");
      expect(canEvaluate(userEnv([nameField]), ast)).toBe(true);
    });

    it("rejects a field selection the target's type does not declare", () => {
      const source = userEnv([nameField]);
      const ast = source.compile("user.name == ''");
      expect(canEvaluate(userEnv([idField]), ast)).toBe(false);
    });

    it("does not require reparsing or rechecking: an unchecked AST is not evaluable", () => {
      const source = envWithVariable();
      const parsed = source.parse("x + 1");
      expect(canEvaluate(source, parsed)).toBe(false);
    });

    it("treats comprehension-bound variables as available without a target declaration", () => {
      const source = env({});
      const ast = source.compile("[1, 2, 3].exists(i, i > 1)");
      expect(canEvaluate(source, ast)).toBe(true);
    });
  });
});
