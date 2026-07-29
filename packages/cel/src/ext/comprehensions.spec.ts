import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { astToString } from "../cel/io.js";
import { optionalTypes } from "../cel/library.js";
import { sizeEstimate } from "../checker/cost.js";
import { variableDecl } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { Int } from "../common/types/int.js";
import { refValMap } from "../common/types/map.js";
import { DefaultTypeAdapter } from "../common/types/provider.js";
import {
  DynType,
  IntType,
  listType,
  mapType,
  StringType,
  type Type,
} from "../common/types/types.js";
import { Uint } from "../common/types/uint.js";
import { partialActivation } from "../interpreter/activation.js";
import { attributePattern } from "../interpreter/attribute-patterns.js";
import { bindings } from "./bindings.js";
import { twoVarComprehensions } from "./comprehensions.js";
import { lists } from "./lists.js";
import { strings } from "./strings.js";

/** ComprehensionCase describes a synchronized expression and optional error. */
interface ComprehensionCase {
  /** err contains an expected error fragment. */
  err?: string;
  /** expr contains the CEL source. */
  expr: string;
  /** name identifies the upstream row. */
  name?: string;
}

/** ComprehensionCostCase adds synchronized cost and activation data. */
interface ComprehensionCostCase extends ComprehensionCase {
  /** actualCost contains the measured CEL-Go cost. */
  actualCost: number;
  /** estimatedCost contains a serialized CEL-Go estimate. */
  estimatedCost: { $expr: string };
  /** hints contains path-based maximum sizes. */
  hints?: Record<string, number>;
  /** in contains activation inputs. */
  in?: Record<string, unknown>;
  /** vars contains serialized variable declarations. */
  vars?: Array<{ $expr: string }>;
}

/** UnparseCase contains one original and expected normalized expression. */
interface UnparseCase extends ComprehensionCase {
  /** unparsed is the expected normalized macro source. */
  unparsed: string;
}

/** ResidualCase contains partial-evaluation inputs and expected source. */
interface ResidualCase extends ComprehensionCase {
  /** in contains known activation values. */
  in: Record<string, unknown>;
  /** residual contains the expected pruned source. */
  residual: string;
  /** unks contains serialized unknown attribute patterns. */
  unks: Array<{ $expr: string }>;
  /** varOpts contains serialized variable declarations. */
  varOpts: Array<{ $expr: string }>;
}

describe("ext/comprehensions_test.go/TestTwoVarComprehensions", () => {
  it("evaluates every synchronized two-variable comprehension", () => {
    const celEnv = comprehensionEnv();
    for (const testCase of syncedCases<ComprehensionCase>(
      "ext/comprehensions_test.go/TestTwoVarComprehensions",
    )) {
      expect(celEnv.program(celEnv.compile(testCase.expr)).eval({}).value(), testCase.expr).toBe(
        true,
      );
    }
  });
});

describe("ext/comprehensions_test.go/TestTwoVarComprehensionsCost", () => {
  for (const testCase of syncedCases<ComprehensionCostCase>(
    "ext/comprehensions_test.go/TestTwoVarComprehensionsCost",
  )) {
    it(testCase.name ?? testCase.expr, () => {
      const declarations = (testCase.vars ?? []).map((entry) => resolveVariable(entry.$expr));
      const celEnv = comprehensionEnv(declarations);
      const expression = celEnv.compile(testCase.expr);
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
        .evalWithDetails(normalizeInputs(testCase.in ?? {}, testCase.vars ?? []));
      expect(result.value.value()).toBe(true);
      expect(result.details.actualCost()).toBe(testCase.actualCost);
    });
  }
});

describe("ext/comprehensions_test.go/TestTwoVarComprehensionsStaticErrors", () => {
  it("reports every synchronized static error", () => {
    const celEnv = comprehensionEnv();
    for (const testCase of syncedCases<ComprehensionCase>(
      "ext/comprehensions_test.go/TestTwoVarComprehensionsStaticErrors",
    )) {
      expect(celEnv.tryCompile(testCase.expr).errors?.toDisplayString(), testCase.expr).toContain(
        testCase.err,
      );
    }
  });
});

describe("ext/comprehensions_test.go/TestTwoVarComprehensionsRuntimeErrors", () => {
  it("reports duplicate transformed map keys", () => {
    const celEnv = comprehensionEnv();
    for (const testCase of syncedCases<ComprehensionCase>(
      "ext/comprehensions_test.go/TestTwoVarComprehensionsRuntimeErrors",
    )) {
      const result = celEnv.program(celEnv.compile(testCase.expr)).eval({});
      expect(String(result), testCase.expr).toContain(testCase.err);
    }
  });
});

describe("ext/comprehensions_test.go/TestTwoVarComprehensionsVersion", () => {
  it("accepts version zero and the latest version", () => {
    for (const version of [0, Number.MAX_SAFE_INTEGER]) {
      const celEnv = env({ libraries: [twoVarComprehensions({ version })] });
      expect(
        celEnv.program(celEnv.compile("[1].all(i, v, i == 0 && v == 1)")).eval({}).value(),
      ).toBe(true);
    }
  });
});

describe("ext/comprehensions_test.go/TestTwoVarComprehensionsUnparse", () => {
  for (const testCase of syncedCases<UnparseCase>(
    "ext/comprehensions_test.go/TestTwoVarComprehensionsUnparse",
  )) {
    it(testCase.name ?? testCase.expr, () => {
      const celEnv = env({
        libraries: [twoVarComprehensions()],
        parser: { populateMacroCalls: true },
      });
      expect(astToString(celEnv.parse(testCase.expr))).toBe(testCase.unparsed);
    });
  }
});

describe("ext/comprehensions_test.go/TestTwoVarComprehensionsResidualAST", () => {
  for (const testCase of syncedCases<ResidualCase>(
    "ext/comprehensions_test.go/TestTwoVarComprehensionsResidualAST",
  )) {
    it(testCase.name ?? testCase.expr, () => {
      const celEnv = comprehensionEnv(
        testCase.varOpts.map((entry) => resolveVariable(entry.$expr)),
      );
      const expression = celEnv.compile(testCase.expr);
      const activation = partialActivation({
        bindings: normalizeInputs(testCase.in, testCase.varOpts),
        unknowns: testCase.unks.map((entry) => resolveUnknown(entry.$expr)),
      });
      const result = celEnv
        .program(expression, { partialEval: true, trackState: true })
        .evalWithDetails(activation);
      expect(astToString(celEnv.residualAst(expression, result.details))).toBe(testCase.residual);
    });
  }
});

/** comprehensionEnv creates the shared extension environment. */
function comprehensionEnv(variables: ReturnType<typeof variableDecl>[] = []) {
  return env({
    libraries: [optionalTypes(), bindings(), strings(), lists(), twoVarComprehensions()],
    parser: { populateMacroCalls: true },
    variables,
  });
}

/** resolveVariable decodes synchronized CEL-Go variable declarations. */
function resolveVariable(expression: string) {
  const match = /^cel\.Variable\("([^"]+)", cel\.(.+)\)$/.exec(expression);
  if (!match) {
    throw new Error(`unsupported synchronized comprehension variable: ${expression}`);
  }
  return variableDecl(match[1]!, resolveType(match[2]!));
}

/** resolveType decodes the recursively nested type forms used by comprehension tests. */
function resolveType(expression: string): Type {
  if (expression === "DynType") return DynType;
  if (expression === "IntType") return IntType;
  if (expression === "StringType") return StringType;
  const list = /^ListType\(cel\.(.+)\)$/.exec(expression);
  if (list) return listType(resolveType(list[1]!));
  const map = /^MapType\(cel\.(.+), cel\.(.+)\)$/.exec(expression);
  if (map) return mapType(resolveType(map[1]!), resolveType(map[2]!));
  throw new Error(`unsupported synchronized comprehension type: ${expression}`);
}

/** parseCostEstimate decodes CEL-Go fixed and ranged cost expressions. */
function parseCostEstimate(expression: string): [bigint, bigint] {
  const fixed = /FixedCostEstimate\((\d+)\)/.exec(expression);
  if (fixed) return [BigInt(fixed[1]!), BigInt(fixed[1]!)];
  const ranged = /Min: (\d+), Max: (\d+)/.exec(expression);
  if (!ranged) throw new Error(`unsupported synchronized cost estimate: ${expression}`);
  return [BigInt(ranged[1]!), BigInt(ranged[2]!)];
}

/** normalizeInputs restores bigint map keys and CEL uint values lost during JSON synchronization. */
function normalizeInputs(
  values: Record<string, unknown>,
  declarations: Array<{ $expr: string }>,
): Record<string, unknown> {
  const output = { ...values };
  for (const declaration of declarations) {
    const match = /^cel\.Variable\("([^"]+)", cel\.MapType\(cel\.IntType,/.exec(declaration.$expr);
    if (match && output[match[1]!] && typeof output[match[1]!] === "object") {
      output[match[1]!] = refValMap(
        DefaultTypeAdapter,
        new Map(
          Object.entries(output[match[1]!] as Record<string, unknown>).map(([key, value]) => [
            new Int(BigInt(key)),
            DefaultTypeAdapter.nativeToValue(resolveInput(value)),
          ]),
        ),
      );
    }
  }
  for (const [name, value] of Object.entries(output)) {
    output[name] = resolveInput(value);
  }
  return output;
}

/** resolveInput converts synchronized expression markers embedded in activation values. */
function resolveInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(resolveInput);
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Map) {
    return new Map([...value.entries()].map(([key, entry]) => [key, resolveInput(entry)]));
  }
  if ("type" in value && typeof (value as { type?: unknown }).type === "function") {
    return value;
  }
  if ("$expr" in value) {
    const expression = String((value as { $expr: unknown }).$expr);
    const uint = /^uint\((\d+)\)$/.exec(expression);
    if (uint) return new Uint(BigInt(uint[1]!));
    const set = /^\{(\d+(?:, \d+)*)\}$/.exec(expression);
    if (set) return set[1]!.split(", ").map((entry) => Number(entry));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      resolveInput(entry),
    ]),
  );
}

/** resolveUnknown decodes synchronized attribute-pattern construction expressions. */
function resolveUnknown(expression: string) {
  const root = /cel\.AttributePattern\("([^"]+)"\)/.exec(expression);
  if (!root) throw new Error(`unsupported synchronized unknown pattern: ${expression}`);
  let pattern = attributePattern(root[1]!);
  const int = /\.QualInt\((\d+)\)/.exec(expression);
  if (int) pattern = pattern.qualInt(BigInt(int[1]!));
  const string = /\.QualString\("([^"]+)"\)/.exec(expression);
  if (string) pattern = pattern.qualString(string[1]!);
  return pattern;
}
