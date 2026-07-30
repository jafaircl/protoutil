import { describe, expect, it } from "vitest";
import { syncedCases } from "../common/spec-helpers.js";
import { resolveSyncedExpr } from "../common/types/spec-helpers.js";
import { TestAllTypesSchema } from "../gen/test/proto3pb/test_all_types_pb.js";
import { file_test_proto3pb_test_import } from "../gen/test/proto3pb/test_import_pb.js";
import { twoVarComprehensions } from "../ext/comprehensions.js";
import {
  type AST,
  astToString,
  BoolType,
  BytesType,
  constantDecl,
  constantFoldingOptimizer,
  DynType,
  DoubleType,
  DurationType,
  env,
  functionDecl,
  Int,
  IntType,
  listType,
  mapType,
  NullType,
  objectType,
  optionalType,
  optionalTypes,
  declOverload as overload,
  postOrderVisit,
  registry,
  StringType,
  staticOptimizer,
  TimestampType,
  TypeType,
  UintType,
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
 * EvaluateExprCase contains expressions whose runtime errors or unknowns must remain unfolded.
 */
interface EvaluateExprCase {
  /** act names the upstream activation variant when one is required. */
  act?: { $expr: string };
  /** expr is the expression under optimization. */
  expr: string;
  /** name identifies the upstream subtest. */
  name: string;
  /** wantFold is the expected expression after optimization. */
  wantFold: string;
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
          functionDecl("asyncFunc", {
            overloads: [
              overload("asyncFunc_int_int", [IntType], IntType, {
                lateBinding: true,
              }),
            ],
          }),
        ]
      : [],
    libraries: [optionalTypes()],
    macros: { standard: true },
    parser: { populateMacroCalls: true },
    registry: provider,
    variables: [
      constantDecl("c", IntType, new Int(2n)),
      variableDecl("b", BoolType),
      variableDecl("by", BytesType),
      variableDecl("d", DoubleType),
      variableDecl("du", DurationType),
      variableDecl("i", IntType),
      variableDecl("ld", listType(DoubleType)),
      variableDecl("li", listType(IntType)),
      variableDecl("lli", listType(listType(IntType))),
      variableDecl("x", DynType),
      variableDecl("lx", listType(DynType)),
      variableDecl("msd", mapType(StringType, DoubleType)),
      variableDecl("msi", mapType(StringType, IntType)),
      variableDecl("n", NullType),
      variableDecl("oi", optionalType(IntType)),
      variableDecl("s", StringType),
      variableDecl("ts", TimestampType),
      variableDecl("ty", TypeType),
      variableDecl("u", UintType),
      variableDecl("y", DynType),
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

describe("cel/folding_test.go/TestConstantFoldingInListIdent", () => {
  it("folds identifier membership only for statically self-equal types", () => {
    for (const testCase of syncedCases<FoldingCase>(
      "cel/folding_test.go/TestConstantFoldingInListIdent",
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

describe("cel/folding_test.go/TestConstantFoldingOption_FoldKnownValuesNilInput", () => {
  it("accepts an omitted known-values activation", () => {
    expect(() => constantFoldingOptimizer({ knownValues: undefined })).not.toThrow();
  });
});

describe("cel/folding_test.go/TestNewConstantFoldingOptimizer_OptionErrorPropagation", () => {
  it("uses a plain options object that cannot execute or hide option callback errors", () => {
    expect(constantFoldingOptimizer({ maxIterations: 1 })).toBeDefined();
  });
});

describe("cel/folding_test.go/TestConstantFoldingOptimizer_EvaluateExpr", () => {
  it("preserves every synced expression that evaluates to an error or unknown", () => {
    for (const testCase of syncedCases<EvaluateExprCase>(
      "cel/folding_test.go/TestConstantFoldingOptimizer_EvaluateExpr",
    )) {
      const celEnv = env({
        variables: testCase.expr.includes("x") ? [variableDecl("x", IntType)] : [],
      });
      const optimized = staticOptimizer({
        optimizers: [constantFoldingOptimizer()],
      }).optimize(celEnv, celEnv.compile(testCase.expr));
      expect(astToString(optimized), testCase.name).toBe(testCase.wantFold);
    }
  });
});

describe("cel/folding_test.go/TestConstantFoldingOptimizer_VariadicShortcircuitLogic", () => {
  it("removes a constant true operand without changing the remaining logical expression", () => {
    const celEnv = env({
      variables: [variableDecl("x", BoolType), variableDecl("y", BoolType)],
    });
    const optimized = staticOptimizer({
      optimizers: [constantFoldingOptimizer()],
    }).optimize(celEnv, celEnv.compile("x && true && y"));

    expect(astToString(optimized)).toBe("x && y");
  });
});

describe("cel/optimizer_test.go/TestConstantFoldingOptimizerTwoVar", () => {
  it("folds every synced two-variable comprehension case", () => {
    const celEnv = env({
      libraries: [optionalTypes(), twoVarComprehensions()],
      parser: { populateMacroCalls: true },
      variables: [
        variableDecl("i", IntType),
        variableDecl("k", IntType),
        variableDecl("l", listType(IntType)),
        variableDecl("v", IntType),
        variableDecl("x", IntType),
      ],
    });
    for (const testCase of syncedCases<FoldingCase>(
      "cel/optimizer_test.go/TestConstantFoldingOptimizerTwoVar",
    )) {
      const optimized = staticOptimizer({
        optimizers: [
          constantFoldingOptimizer({
            knownValues: testCase.knownValues,
          }),
        ],
      }).optimize(celEnv, celEnv.compile(testCase.expr));
      expect(astToString(optimized), testCase.expr).toBe(testCase.folded);
    }
  });
});
