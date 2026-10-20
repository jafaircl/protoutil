import { describe, expect, it } from "vitest";
import { env, unwrapAst } from "../cel/env.js";
import { type CostEstimator, sizeEstimate } from "../checker/cost.js";
import { syncedCases } from "../common/spec-helpers.js";
import { isError } from "../common/types/err.js";
import { resolveSyncedExpr, resolveSyncedVariableDecl } from "../common/types/spec-helpers.js";
import { BytesType, DynType, StringType } from "../common/types/types.js";
import { encoders } from "./encoders.js";

/** EncoderCase describes one synchronized cel-go encoder test row. */
interface EncoderCase {
  /** err contains the expected CEL error fragment. */
  err?: string;
  /** expr contains the CEL source under test. */
  expr: string;
  /** parseOnly evaluates the unchecked AST when the expression is intentionally ill-typed. */
  parseOnly?: boolean;
}

/** EncoderCostCase describes a synchronized static and runtime encoder cost. */
interface EncoderCostCase extends EncoderCase {
  /** actualCost is CEL-Go's observed runtime cost. */
  actualCost: number;
  /** estimatedCost is CEL-Go's serialized static estimate. */
  estimatedCost: { $expr: string };
  /** hints supplies size estimates keyed by expression path. */
  hints?: Record<string, number>;
  /** in contains activation values. */
  in?: Record<string, unknown>;
  /** name identifies the upstream table row. */
  name: string;
  /** vars contains serialized variable declarations. */
  vars?: Array<{ $expr: string }>;
  /** version selects the encoder cost model. */
  version: number;
}

describe("ext/encoders_test.go/TestEncoders", () => {
  it("evaluates every synced encoder case", () => {
    const celEnv = env({ libraries: [encoders()] });
    for (const testCase of syncedCases<EncoderCase>("ext/encoders_test.go/TestEncoders")) {
      const ast = unwrapAst(
        testCase.parseOnly ? celEnv.parse(testCase.expr) : celEnv.compile(testCase.expr),
      );
      const result = celEnv.program(ast).eval({});
      if (testCase.err !== undefined) {
        expect(isError(result), testCase.expr).toBe(true);
        expect(String(result), testCase.expr).toContain(testCase.err);
      } else {
        expect(result.value(), testCase.expr).toBe(true);
      }
    }
  });
});

describe("ext/encoders_test.go/TestEncodersVersion", () => {
  it("gates JSON encoding at version one", () => {
    const versionZero = env({ libraries: [encoders({ version: 0 })] });
    expect(versionZero.compile("base64.encode(b'hello')").errors).toBeUndefined();
    expect(versionZero.compile("json.encode('hello')").errors).toBeDefined();

    const versionOne = env({ libraries: [encoders({ version: 1 })] });
    expect(versionOne.compile("json.encode('hello')").errors).toBeUndefined();
  });
});

describe("ext/encoders_test.go/TestEncodersCosts", () => {
  it("matches every synchronized checker and runtime cost", () => {
    for (const testCase of syncedCases<EncoderCostCase>("ext/encoders_test.go/TestEncodersCosts")) {
      const celEnv = env({
        libraries: [encoders({ version: testCase.version })],
        variables: (testCase.vars ?? []).map((value) =>
          resolveSyncedVariableDecl(
            { $expr: value.$expr.replace(/^cel\./, "") },
            {
              "cel.BytesType": BytesType,
              "cel.DynType": DynType,
              "cel.StringType": StringType,
            },
          ),
        ),
      });
      const ast = unwrapAst(celEnv.compile(testCase.expr));
      const estimator: CostEstimator = {
        estimateCallCost: () => undefined,
        estimateSize: (node) => {
          const path = node.path()?.join(".");
          const hint = path === undefined ? undefined : testCase.hints?.[path];
          return hint === undefined ? undefined : sizeEstimate(0n, BigInt(hint));
        },
      };
      const estimate = celEnv.estimateCost(ast, estimator);
      expect([estimate.Min, estimate.Max], testCase.name).toEqual(
        parseEncoderCost(testCase.estimatedCost.$expr),
      );
      const result = celEnv
        .program(ast, { costTracking: {} })
        .evalWithDetails(resolveEncoderInput(testCase.in ?? {}));
      expect(result.value.value(), testCase.name).toBe(true);
      // CEL-Go's uint64 counter wraps MaxUint64 plus the equality cost to one. TypeScript cost
      // counters use safe numbers, so the equivalent unbounded marker remains visibly saturated.
      const actualCost =
        testCase.name === "json_encode_dyn" ? Number.MAX_SAFE_INTEGER + 1 : testCase.actualCost;
      expect(result.details.actualCost(), testCase.name).toBe(actualCost);
    }
  });
});

describe("ext/encoders_test.go/TestDecodeNonBase64Error", () => {
  it("reports invalid base64 while retaining its measured cost", () => {
    const celEnv = env({ libraries: [encoders({ version: 1 })] });
    const ast = unwrapAst(celEnv.compile("base64.decode('abc-') == b''"));

    expect([celEnv.estimateCost(ast).Min, celEnv.estimateCost(ast).Max]).toEqual([2n, 2n]);
    const result = celEnv.program(ast, { costTracking: {} }).evalWithDetails({});
    expect(isError(result.value)).toBe(true);
    expect(result.details.actualCost()).toBe(2);
  });
});

describe("ext/encoders_test.go/TestJSONEncodeCostUnbounded", () => {
  it("uses the uint64 maximum for JSON encoding's unknown structural cost", () => {
    const celEnv = env({ libraries: [encoders({ version: 1 })] });
    const ast = unwrapAst(celEnv.compile("json.encode('hello')"));
    const maximum = (1n << 64n) - 1n;
    const estimate = celEnv.estimateCost(ast);
    const result = celEnv.program(ast, { costTracking: {} }).evalWithDetails({});

    expect([estimate.Min, estimate.Max]).toEqual([0n, maximum]);
    expect(result.details.actualCost()).toBe(Number.MAX_SAFE_INTEGER);
  });
});

/** parseEncoderCost decodes CEL-Go fixed and ranged cost expressions. */
function parseEncoderCost(expression: string): [bigint, bigint] {
  const fixed = /^checker\.FixedCostEstimate\((\d+)\)$/.exec(expression);
  if (fixed) {
    const value = BigInt(fixed[1]!);
    return [value, value];
  }
  const ranged = /^checker\.CostEstimate\{Min: (\d+), Max: (\d+)\}$/.exec(expression);
  if (ranged) {
    return [BigInt(ranged[1]!), BigInt(ranged[2]!)];
  }
  const unbounded = /^checker\.CostEstimate\{Min: (\d+), Max: math\.MaxUint64\}$/.exec(expression);
  if (unbounded) {
    return [BigInt(unbounded[1]!), (1n << 64n) - 1n];
  }
  throw new Error(`unsupported synchronized encoder cost: ${expression}`);
}

/** resolveEncoderInput decodes the byte-slice literal used by synchronized encoder cases. */
function resolveEncoderInput(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([name, value]) => {
      const expression = (value as { $expr?: string } | undefined)?.$expr;
      const bytes = expression ? /^\[\]byte\("(.*)"\)$/.exec(expression) : undefined;
      return [name, bytes ? new TextEncoder().encode(bytes[1]!) : resolveSyncedExpr(value)];
    }),
  );
}
