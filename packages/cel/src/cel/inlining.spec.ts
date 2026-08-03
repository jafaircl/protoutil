import { TestAllTypesSchema } from "@protoutil/testing/cel/proto3";
import { describe, expect, it } from "vitest";
import { syncedCases } from "../common/spec-helpers.js";
import {
  AnyType,
  astToString,
  BoolType,
  BytesType,
  constantFoldingOptimizer,
  container,
  DoubleType,
  DurationType,
  DynType,
  type Env,
  env,
  func,
  type InlineVariable,
  IntType,
  inlineVariable,
  inliningOptimizer,
  ListType,
  listType,
  MapType,
  mapType,
  NullType,
  nullableType,
  objectType,
  overload,
  registry,
  StringType,
  staticOptimizer,
  TimestampType,
  type Type,
  UintType,
  variable,
} from "../index.js";

/**
 * SyncedVariableExpression is the Go composite-literal shape emitted by the fixture synchronizer.
 */
interface SyncedVariableExpression {
  /** $expr contains the serialized cel-go variable test fixture. */
  $expr: string;
}

/**
 * InliningCase is the shared shape of synced inlining test rows.
 */
interface InliningCase {
  /** expr is the checked expression to optimize. */
  expr: string;
  /** folded is the expected result after the later folding pass. */
  folded?: string;
  /** inlineVars contains definitions used by multi-stage cases. */
  inlineVars?: SyncedVariableExpression[];
  /** inlined is the expected result of the inlining pass. */
  inlined: string;
  /** name identifies a named upstream subtest. */
  name?: string;
  /** vars contains declarations and, when present, inline definitions. */
  vars: SyncedVariableExpression[];
}

/**
 * VariableExpression contains a decoded declaration and optional inline source.
 */
interface VariableExpression {
  /** alias is used for `cel.bind` insertion when a variable occurs repeatedly. */
  alias?: string;
  /** expression is the CEL definition substituted for the variable. */
  expression?: string;
  /** name is the qualified variable or selection being replaced. */
  name: string;
  /** type is the declared CEL type. */
  type: Type;
}

/**
 * splitTypeArguments separates top-level type constructor arguments.
 */
function splitTypeArguments(value: string): string[] {
  const argumentsValue: string[] = [];
  let depth = 0;
  let start = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === "(") {
      depth += 1;
    } else if (!quoted && character === ")") {
      depth -= 1;
    } else if (!quoted && character === "," && depth === 0) {
      argumentsValue.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  argumentsValue.push(value.slice(start).trim());
  return argumentsValue;
}

/**
 * resolveType decodes the CEL type expressions embedded in synced inlining fixtures.
 */
function resolveType(value: string): Type {
  const expression = value.trim().replaceAll("cel.", "");
  const scalarTypes = new Map<string, Type>([
    ["AnyType", AnyType],
    ["BoolType", BoolType],
    ["BytesType", BytesType],
    ["DoubleType", DoubleType],
    ["DurationType", DurationType],
    ["DynType", DynType],
    ["IntType", IntType],
    ["ListType", ListType],
    ["MapType", MapType],
    ["NullType", NullType],
    ["StringType", StringType],
    ["TimestampType", TimestampType],
    ["UintType", UintType],
  ]);
  const scalar = scalarTypes.get(expression);
  if (scalar) {
    return scalar;
  }
  const ctor = /^([A-Za-z]+Type)\(([\s\S]*)\)$/.exec(expression);
  if (!ctor) {
    throw new Error(`unsupported synced CEL type: ${value}`);
  }
  const argumentsValue = splitTypeArguments(ctor[2]!);
  switch (ctor[1]) {
    case "ListType":
      return listType(resolveType(argumentsValue[0]!));
    case "MapType":
      return mapType(resolveType(argumentsValue[0]!), resolveType(argumentsValue[1]!));
    case "NullableType":
      return nullableType(resolveType(argumentsValue[0]!));
    case "ObjectType":
      return objectType(argumentsValue[0]!.replace(/^"|"$/g, ""));
    default:
      throw new Error(`unsupported synced CEL type constructor: ${ctor[1]}`);
  }
}

/**
 * decodeVariableExpression converts a synced Go composite literal into TypeScript values.
 */
function decodeVariableExpression(value: SyncedVariableExpression): VariableExpression {
  const name = /\bname:\s*"([^"]+)"/.exec(value.$expr)?.[1];
  const alias = /\balias:\s*"([^"]+)"/.exec(value.$expr)?.[1];
  const typeExpression = /^\s*t:\s*(.+),\s*$/m.exec(value.$expr)?.[1];
  const rawExpression =
    /\bexpr:\s*`([\s\S]*?)`/.exec(value.$expr)?.[1] ?? /\bexpr:\s*"([^"]*)"/.exec(value.$expr)?.[1];
  if (!name || !typeExpression) {
    throw new Error(`invalid synced inline variable: ${value.$expr}`);
  }
  return {
    alias,
    expression: rawExpression,
    name,
    type: resolveType(typeExpression),
  };
}

/**
 * optimizerEnvironment creates the declarations and protobuf registry needed by an inlining row.
 */
function optimizerEnvironment(definitions: VariableExpression[], containerName = ""): Env {
  const provider = registry();
  provider.registerDescriptor(TestAllTypesSchema.file);
  const declarations = new Map<string, Type>();
  for (const definition of definitions) {
    declarations.set(definition.name, definition.type);
  }
  if (containerName === "google.expr.proto3.test") {
    declarations.set("msg", objectType(TestAllTypesSchema.typeName));
  }
  return env({
    container: container({ name: containerName }),
    functions: [
      func("productsToConsumers", {
        overloads: [overload("productsToConsumers_list", [listType(IntType)], listType(IntType))],
      }),
    ],
    macros: { standard: true },
    parser: { populateMacroCalls: true },
    registry: provider,
    variables: [...declarations].map(([name, type]) => variable(name, type)),
  });
}

/**
 * optimizeInlining applies the synced inline definitions to a checked expression.
 */
function optimizeInlining(testCase: InliningCase, containerName = ""): string {
  return optimizeInliningOutputs(testCase, containerName).inlined;
}

/**
 * optimizeInliningOutputs applies inlining and the downstream constant-folding pass.
 */
function optimizeInliningOutputs(
  testCase: InliningCase,
  containerName = "",
): { folded: string; inlined: string } {
  const declarations = testCase.vars.map(decodeVariableExpression);
  const definitions = (testCase.inlineVars ?? testCase.vars).map(decodeVariableExpression);
  const celEnv = optimizerEnvironment(declarations, containerName);
  const inlineVariables: InlineVariable[] = definitions
    .filter((definition) => definition.expression !== undefined)
    .map((definition) =>
      inlineVariable({
        alias: definition.alias,
        definition: celEnv.compile(definition.expression!),
        name: definition.name,
      }),
    );
  const optimizer = staticOptimizer({
    optimizers: [inliningOptimizer({ variables: inlineVariables })],
  });
  const inlinedAst = optimizer.optimize(celEnv, celEnv.compile(testCase.expr));
  const foldedAst = staticOptimizer({
    optimizers: [constantFoldingOptimizer()],
  }).optimize(celEnv, inlinedAst);
  return {
    folded: astToString(foldedAst),
    inlined: astToString(inlinedAst),
  };
}

describe("cel/inlining_test.go/TestInliningOptimizerNoopShadow", () => {
  it("does not inline variables shadowed by comprehensions", () => {
    for (const testCase of syncedCases<InliningCase>(
      "cel/inlining_test.go/TestInliningOptimizerNoopShadow",
    )) {
      expect(optimizeInlining(testCase), testCase.name).toBe(testCase.inlined);
    }
  });
});

describe("cel/inlining_test.go/TestInliningOptimizerPresenceTests", () => {
  it("rewrites presence tests according to the inlined value type", () => {
    for (const testCase of syncedCases<InliningCase>(
      "cel/inlining_test.go/TestInliningOptimizerPresenceTests",
    )) {
      expect(optimizeInlining(testCase, "google.expr.proto3.test"), testCase.name).toBe(
        testCase.inlined,
      );
    }
  });
});

describe("cel/inlining_test.go/TestInliningOptimizer", () => {
  it("inlines every synced single-stage variable definition", () => {
    for (const testCase of syncedCases<InliningCase>(
      "cel/inlining_test.go/TestInliningOptimizer",
    )) {
      const optimized = optimizeInliningOutputs(testCase);
      expect(optimized.inlined, testCase.expr).toBe(testCase.inlined);
      expect(optimized.folded, testCase.expr).toBe(testCase.folded);
    }
  });
});

describe("cel/inlining_test.go/TestInliningOptimizerMultiStage", () => {
  it("inlines every synced qualified and multi-stage definition", () => {
    for (const testCase of syncedCases<InliningCase>(
      "cel/inlining_test.go/TestInliningOptimizerMultiStage",
    )) {
      try {
        const optimized = optimizeInliningOutputs(testCase, "google.expr");
        expect(optimized.inlined, testCase.expr).toBe(testCase.inlined);
        expect(optimized.folded, testCase.expr).toBe(testCase.folded);
      } catch (error) {
        throw new Error(`${testCase.expr}: ${String(error)}`);
      }
    }
  });
});
