import { describe, expect, it } from "vitest";
import { syncedCases } from "../common/spec-helpers.js";
import { resolveSyncedExpr, resolveSyncedVal } from "../common/types/spec-helpers.js";
import { Type_PrimitiveType } from "../gen/cel/expr/checked_pb.js";
import type { Expr as ProtoExpr } from "../gen/cel/expr/syntax_pb.js";
import { TestAllTypesSchema } from "../gen/test/proto3pb/test_all_types_pb.js";
import {
  ast,
  astToCheckedExpr,
  astToParsedExpr,
  astToString,
  String as CelString,
  checkedExprToAst,
  checkedExprToAstWithSource,
  DynType,
  env,
  err,
  exprToString,
  exprValueAsAlphaProto,
  Int,
  Kind,
  parsedExprToAst,
  parsedExprToAstWithSource,
  protoToExpr,
  refValToExprValue,
  refValueToValue,
  registry,
  type Type,
  textSource,
  type Val,
  valueToRefValue,
  variableDecl,
} from "../index.js";

/**
 * deepBoolExpr creates a protobuf expression with the requested number of nested negations.
 */
function deepBoolExpr(depth: number): ProtoExpr {
  let expression: ProtoExpr = {
    $typeName: "cel.expr.Expr",
    id: 1n,
    exprKind: {
      case: "constExpr",
      value: {
        $typeName: "cel.expr.Constant",
        constantKind: {
          case: "boolValue",
          value: true,
        },
      },
    },
  };
  for (let index = 0; index < depth; index++) {
    expression = {
      $typeName: "cel.expr.Expr",
      id: BigInt(index + 2),
      exprKind: {
        case: "callExpr",
        value: {
          $typeName: "cel.expr.Expr.Call",
          function: "!_",
          args: [expression],
        },
      },
    };
  }
  return expression;
}

describe("cel/io_test.go/TestRefValueToValue_Error", () => {
  it("rejects CEL error values", () => {
    expect(() => refValueToValue(err("test error"))).toThrow();
  });
});

describe("cel/io_test.go/TestExprValueAsAlphaProto", () => {
  it("wraps a CEL value in the legacy alpha ExprValue schema", () => {
    const result = exprValueAsAlphaProto(new Int(42n));

    expect(result.$typeName).toBe("google.api.expr.v1alpha1.ExprValue");
    expect(result.kind.case).toBe("value");
    if (result.kind.case !== "value") {
      throw new Error("expected a wrapped legacy alpha value");
    }
    expect(result.kind.value.kind).toEqual({
      case: "int64Value",
      value: 42n,
    });
  });
});

describe("cel/io_test.go/TestRefValToExprValue_Wrappers", () => {
  it("wraps a CEL string in an ExprValue", () => {
    const result = refValToExprValue(new CelString("hello"));

    expect(result.kind.case).toBe("value");
    if (result.kind.case !== "value") {
      throw new Error("expected a wrapped CEL value");
    }
    expect(result.kind.value.kind).toEqual({
      case: "stringValue",
      value: "hello",
    });
  });
});

describe("cel/io_test.go/TestRefValToExprValue", () => {
  it("wraps every synced runtime value in an ExprValue", () => {
    const cases = syncedCases<{
      expectError: boolean;
      name: string;
      refVal: { $expr: string };
    }>("cel/io_test.go/TestRefValToExprValue");

    for (const testCase of cases) {
      const value = resolveSyncedVal(testCase.refVal);
      const result = refValToExprValue(value);

      expect(testCase.expectError).toBe(false);
      expect(result.kind.case).toBe(
        testCase.name === "unknown value"
          ? "unknown"
          : testCase.name === "error value"
            ? "error"
            : "value",
      );
    }
  });
});

describe("cel/io_test.go/TestRefValueToValueRoundTrip", () => {
  it("round-trips every synced CEL value", () => {
    const cases = syncedCases<{
      value: unknown;
    }>("cel/io_test.go/TestRefValueToValueRoundTrip");
    const adapter = registry();
    adapter.registerDescriptor(TestAllTypesSchema.file);

    for (const [index, testCase] of cases.entries()) {
      const expression = testCase.value as { $expr?: string };
      const resolved =
        expression.$expr === undefined
          ? resolveSyncedExpr(testCase.value)
          : resolveSyncedVal({
              $expr: expression.$expr.replace(/^types\./, ""),
            });
      const value =
        typeof resolved === "object" &&
        resolved !== null &&
        "type" in resolved &&
        typeof resolved.type === "function"
          ? (resolved as Val)
          : adapter.nativeToValue(resolved);
      const serialized = refValueToValue(value);
      const roundTrip = valueToRefValue(adapter, serialized);

      if (expression.$expr?.includes('NewOpaqueType("CustomType")')) {
        expect((roundTrip as Type).kind()).toBe(Kind.Struct);
      }
      expect(
        (value.equal(roundTrip) as Val).value(),
        `round-trip case ${index}: ${JSON.stringify(testCase.value)}`,
      ).toBe(true);
    }
  });
});

describe("TypeScript extension/TestStrongEnumValueRoundTrip", () => {
  it("preserves the protobuf enum type and signed number", () => {
    const adapter = registry();
    adapter.registerDescriptor(TestAllTypesSchema.file);
    adapter.withStrongEnums(true);
    const value = adapter.enumValueOf(
      "google.expr.proto3.test.TestAllTypes.NestedEnum",
      -987n,
    );

    const serialized = refValueToValue(value);
    expect(serialized.kind).toEqual({
      case: "enumValue",
      value: {
        $typeName: "cel.expr.EnumValue",
        type: "google.expr.proto3.test.TestAllTypes.NestedEnum",
        value: -987,
      },
    });

    const roundTrip = valueToRefValue(adapter, serialized);
    expect(roundTrip.type().typeName()).toBe(
      "google.expr.proto3.test.TestAllTypes.NestedEnum",
    );
    expect(roundTrip.value()).toBe(-987n);
    expect(value.equal(roundTrip).value()).toBe(true);
  });
});

describe("cel/io_test.go/TestAstToProto", () => {
  it("round-trips parsed and checked AST protobuf messages", () => {
    const celEnv = env({
      variables: [variableDecl("a", DynType), variableDecl("b", DynType)],
    });
    const parsedAst = celEnv.parse("a + b");
    const parsedExpr = astToParsedExpr(parsedAst);
    const parsedRoundTrip = parsedExprToAst(parsedExpr);
    const parsedSource = textSource("a + b");
    const parsedWithSource = parsedExprToAstWithSource(parsedExpr, parsedSource);

    expect(parsedRoundTrip.expr().toProto()).toEqual(parsedAst.expr().toProto());
    expect(parsedWithSource.expr().toProto()).toEqual(parsedAst.expr().toProto());
    expect(parsedWithSource.source()).toBe(parsedSource);
    expect(() => astToCheckedExpr(parsedAst)).toThrow("cannot convert unchecked ast");

    const checkedAst = celEnv.check(parsedAst, textSource("a + b"));
    const checkedExpr = astToCheckedExpr(checkedAst);
    const checkedRoundTrip = checkedExprToAst(checkedExpr);
    const checkedSource = textSource("a + b");
    const checkedWithSource = checkedExprToAstWithSource(checkedExpr, checkedSource);

    expect(checkedRoundTrip.expr().toProto()).toEqual(checkedAst.expr().toProto());
    expect(checkedRoundTrip.isChecked()).toBe(true);
    expect(checkedWithSource.expr().toProto()).toEqual(checkedAst.expr().toProto());
    expect(checkedWithSource.source()).toBe(checkedSource);
  });
});

describe("cel/io_test.go/TestAstToString", () => {
  it("renders a parsed AST as CEL source", () => {
    const source = "a + b - (c ? (-d + 4) : e)";

    expect(astToString(env().parse(source))).toBe(source);
  });
});

describe("cel/io_test.go/TestExprToString", () => {
  it("renders an expression using its source information", () => {
    const source = "[a, b].filter(i, (i > 0) ? (-i + 4) : i)";
    const ast = env({
      parser: {
        populateMacroCalls: true,
      },
    }).parse(source);

    expect(exprToString(ast.expr(), ast.sourceInfo())).toBe(source);
  });
});

describe("cel/io_test.go/TestAstToStringNil", () => {
  it("rejects an absent AST", () => {
    expect(() => astToString()).toThrow("unsupported expr");
  });
});

describe("cel/io_test.go/TestAstToCheckedExprNil", () => {
  it("rejects an absent AST", () => {
    expect(() => astToCheckedExpr()).toThrow("cannot convert unchecked ast");
  });
});

describe("cel/io_test.go/TestAstToParsedExprNil", () => {
  it("returns an empty parsed-expression message", () => {
    expect(astToParsedExpr()).toEqual({
      $typeName: "cel.expr.ParsedExpr",
    });
  });
});

describe("cel/io_test.go/TestCheckedExprToAstConstantExpr", () => {
  it("round-trips a checked constant expression", () => {
    const ast = env().compile("10");

    expect(checkedExprToAst(astToCheckedExpr(ast)).expr().toProto()).toEqual(ast.expr().toProto());
  });
});

describe("cel/io_test.go/TestCheckedExprToAstMissingInfo", () => {
  it("restores checked state when source information is absent", () => {
    const parsed = env().parse("10").toParsedExpr();
    const checked = {
      $typeName: "cel.expr.CheckedExpr" as const,
      referenceMap: {},
      typeMap: {
        [String(parsed.expr?.id ?? 0)]: {
          $typeName: "cel.expr.Type" as const,
          typeKind: {
            case: "primitive" as const,
            value: Type_PrimitiveType.INT64,
          },
        },
      },
      expr: parsed.expr,
      exprVersion: "",
    };

    expect(checkedExprToAst(checked).isChecked()).toBe(true);
  });
});

describe("cel/io_test.go/TestLoadedAstDepthLimit", () => {
  it("rejects over-deep protobuf-loaded ASTs while preserving the common AST bypass", () => {
    const celEnv = env();

    // Sanity check: a shallow parsed expression still checks and plans cleanly.
    const shallow = celEnv.parse("1 + 2");
    expect(() => celEnv.check(shallow, textSource("1 + 2"))).not.toThrow();
    expect(() => celEnv.program(shallow)).not.toThrow();

    const deepExpr = deepBoolExpr(300);
    expect(() =>
      parsedExprToAst({
        $typeName: "cel.expr.ParsedExpr",
        expr: deepExpr,
      }),
    ).toThrow("maximum expression nesting depth");
    expect(() =>
      checkedExprToAstWithSource({
        $typeName: "cel.expr.CheckedExpr",
        expr: deepExpr,
        referenceMap: {},
        typeMap: {},
        exprVersion: "",
      }),
    ).toThrow("maximum expression nesting depth");

    // Embedders in full control of their AST inputs can skip the check by building the AST
    // through the common AST package directly rather than the CEL conversion helpers.
    const bypass = ast(protoToExpr(deepExpr));
    expect(() => celEnv.program(bypass)).not.toThrow();
  });
});

describe("cel/io_test.go/TestExpressionNestingDepthLimitConfigRoundTrip", () => {
  it("serializes the configured maximum AST depth", () => {
    const config = env({ maxAstDepth: 128 }).toConfig("depth-limit");

    expect(config.limits).toContainEqual({
      name: "cel.limit.max_ast_depth",
      value: 128,
    });
  });
});
