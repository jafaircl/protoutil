import { describe, expect, it } from "vitest";
import { syncedCases } from "../common/spec-helpers.js";
import { resolveSyncedExpr } from "../common/types/spec-helpers.js";
import { TestAllTypesSchema } from "../gen/test/proto3pb/test_all_types_pb.js";
import { file_test_proto3pb_test_import } from "../gen/test/proto3pb/test_import_pb.js";
import {
  type AST,
  astToString,
  constantDecl,
  constantFoldingOptimizer,
  DynType,
  env,
  functionDecl,
  Int,
  IntType,
  listType,
  objectType,
  optionalTypes,
  declOverload as overload,
  postOrderVisit,
  registry,
  StringType,
  staticOptimizer,
  variableDecl,
} from "../index.js";

/**
 * FoldingCase is the shared shape of synced constant-folding test rows.
 */
interface FoldingCase {
  /** error is the expected optimization failure fragment. */
  error?: string;
  /** expr is the checked expression to optimize. */
  expr: string;
  /** folded is the expected optimized expression. */
  folded?: string;
  /** knownValues supplies compile-time activation values. */
  knownValues?: Record<string, unknown>;
  /** limit caps bottom-up folding iterations. */
  limit?: number;
  /** macroCount is the number of macro calls expected after optimization. */
  macroCount?: number;
}

/**
 * NormalizeIdsCase contains upstream identifier and macro normalization expectations.
 */
interface NormalizeIdsCase {
  /** expr is the checked expression to optimize. */
  expr: string;
  /** ids contains identifiers assigned by the upstream parser. */
  ids: number[];
  /** macros contains macro calls assigned by the upstream parser. */
  macros?: Record<string, string>;
  /** normalizedIDs contains identifiers expected after optimization. */
  normalizedIDs: number[];
  /** normalizedMacros contains macro calls expected after optimization. */
  normalizedMacros?: Record<string, string>;
}

/**
 * foldingEnvironment creates the declarations and protobuf registry shared by folding tests.
 */
function foldingEnvironment(options: { sideEffects?: boolean } = {}) {
  const provider = registry();
  provider.registerDescriptor(file_test_proto3pb_test_import);
  provider.registerDescriptor(TestAllTypesSchema.file);
  return env({
    functions: options.sideEffects
      ? [
          functionDecl("noSideEffect", {
            overloads: [
              overload("noSideEffect_int_int", [IntType], IntType, {
                unaryBinding: (argument) => argument,
              }),
            ],
          }),
          functionDecl("withSideEffect", {
            overloads: [
              overload("withSideEffect_int_int", [IntType], IntType, {
                lateBinding: true,
              }),
            ],
          }),
          functionDecl("noImpl", {
            overloads: [overload("noImpl_int_int", [IntType], IntType)],
          }),
        ]
      : [],
    libraries: [optionalTypes()],
    macros: { standard: true },
    parser: { populateMacroCalls: true },
    registry: provider,
    variables: [
      constantDecl("c", IntType, new Int(2n)),
      variableDecl("x", DynType),
      variableDecl("l", listType(StringType)),
      variableDecl("o", objectType(TestAllTypesSchema.typeName)),
    ],
  });
}

/**
 * optimizeFolding applies the constant-folding pass to a synced test row.
 */
function optimizeFolding(testCase: FoldingCase, sideEffects = false): AST {
  const celEnv = foldingEnvironment({ sideEffects });
  const optimizer = staticOptimizer({
    optimizers: [
      constantFoldingOptimizer({
        knownValues:
          testCase.knownValues === undefined
            ? undefined
            : (resolveSyncedExpr(testCase.knownValues) as Record<string, unknown>),
        maxIterations: testCase.limit,
      }),
    ],
  });
  return optimizer.optimize(celEnv, celEnv.compile(testCase.expr));
}

/**
 * expressionIds collects expression and aggregate-entry ids in stable numeric order.
 */
function expressionIds(ast: AST): number[] {
  const ids: number[] = [];
  postOrderVisit(ast.expr(), (expression) => {
    if (expression.id() !== 0) {
      ids.push(expression.id());
    }
    if (expression.kind() === 6) {
      for (const entry of expression.asMap()?.entries() ?? []) {
        if (entry.id() !== 0) {
          ids.push(entry.id());
        }
      }
    }
    if (expression.kind() === 8) {
      for (const field of expression.asStruct()?.fields() ?? []) {
        if (field.id() !== 0) {
          ids.push(field.id());
        }
      }
    }
  });
  return ids.sort((left, right) => left - right);
}

describe("cel/folding_test.go/TestConstantFoldingOptimizer", () => {
  it("folds every synced constant expression", () => {
    for (const testCase of syncedCases<FoldingCase>(
      "cel/folding_test.go/TestConstantFoldingOptimizer",
    )) {
      expect(astToString(optimizeFolding(testCase)), testCase.expr).toBe(testCase.folded);
    }
  });
});

describe("cel/folding_test.go/TestConstantFoldingCallsWithSideEffects", () => {
  it("preserves late-bound calls and reports missing implementations", () => {
    for (const testCase of syncedCases<FoldingCase>(
      "cel/folding_test.go/TestConstantFoldingCallsWithSideEffects",
    )) {
      if (testCase.error) {
        expect(() => optimizeFolding(testCase, true), testCase.expr).toThrow(testCase.error);
        continue;
      }
      expect(astToString(optimizeFolding(testCase, true)), testCase.expr).toBe(testCase.folded);
    }
  });
});

describe("cel/folding_test.go/TestConstantFoldingOptimizerMacroElimination", () => {
  it("removes macro metadata when the corresponding expression is folded", () => {
    for (const testCase of syncedCases<FoldingCase>(
      "cel/folding_test.go/TestConstantFoldingOptimizerMacroElimination",
    )) {
      const optimized = optimizeFolding(testCase);
      expect(astToString(optimized), testCase.expr).toBe(testCase.folded);
      expect(optimized.sourceInfo().macroCalls().size, testCase.expr).toBe(
        testCase.macroCount ?? 0,
      );
    }
  });
});

describe("cel/folding_test.go/TestConstantFoldingOptimizerWithLimit", () => {
  it("honors the configured folding iteration limit", () => {
    for (const testCase of syncedCases<FoldingCase>(
      "cel/folding_test.go/TestConstantFoldingOptimizerWithLimit",
    )) {
      expect(astToString(optimizeFolding(testCase)), testCase.expr).toBe(testCase.folded);
    }
  });
});

describe("cel/folding_test.go/TestConstantFoldingNormalizeIDs", () => {
  it("normalizes expression and macro ids after folding", () => {
    for (const testCase of syncedCases<NormalizeIdsCase>(
      "cel/folding_test.go/TestConstantFoldingNormalizeIDs",
    )) {
      const celEnv = foldingEnvironment();
      const checked = celEnv.compile(testCase.expr);
      const optimized = staticOptimizer({
        optimizers: [constantFoldingOptimizer()],
      }).optimize(celEnv, checked);
      expect(expressionIds(optimized), testCase.expr).toEqual(testCase.normalizedIDs);
      expect(
        [...optimized.sourceInfo().macroCalls().keys()].sort((left, right) => left - right),
        testCase.expr,
      ).toEqual(
        Object.keys(testCase.normalizedMacros ?? {})
          .map(Number)
          .sort((left, right) => left - right),
      );
    }
  });
});
