import type { DescEnum, DescField, DescMessage } from "@bufbuild/protobuf";
import { TestAllTypesSchema } from "@protoutil/testing/cel/proto3";
import { describe, expect, it } from "vitest";
import { syncedCases } from "../common/spec-helpers.js";
import { resolveSyncedExpr, resolveSyncedVal } from "../common/types/spec-helpers.js";
import { CheckedExprSchema, Type_PrimitiveType } from "../gen/cel/expr/checked_pb.js";
import { ExprValueSchema } from "../gen/cel/expr/eval_pb.js";
import { ExprSchema, ParsedExprSchema, type Expr as ProtoExpr } from "../gen/cel/expr/syntax_pb.js";
import { CheckedExprSchema as AlphaCheckedExprSchema } from "../gen/google/api/expr/v1alpha1/checked_pb.js";
import { ExprValueSchema as AlphaExprValueSchema } from "../gen/google/api/expr/v1alpha1/eval_pb.js";
import {
  ExprSchema as AlphaExprSchema,
  ParsedExprSchema as AlphaParsedExprSchema,
} from "../gen/google/api/expr/v1alpha1/syntax_pb.js";
import {
  alphaProtoAsCheckedExpr,
  alphaProtoAsExpr,
  alphaProtoAsParsedExpr,
  ast,
  astToAlphaCheckedExpr,
  astToAlphaExpr,
  astToAlphaParsedExpr,
  astToCheckedExpr,
  astToParsedExpr,
  astToString,
  String as CelString,
  checkedExprAsAlphaProto,
  checkedExprToAst,
  checkedExprToAstWithSource,
  DynType,
  env,
  err,
  exprAsAlphaProto,
  exprToString,
  exprValueAsAlphaProto,
  Int,
  Kind,
  parsedExprAsAlphaProto,
  parsedExprToAst,
  parsedExprToAstWithSource,
  protoToExpr,
  refValToExprValue,
  refValueToValue,
  registry,
  StringType,
  type Type,
  textSource,
  type Val,
  valueToRefValue,
  variable,
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

/**
 * assertCompatibleMessageSchemas verifies that the CEL and alpha schemas have identical wire
 * structure. Their fully qualified type names intentionally differ.
 */
function assertCompatibleMessageSchemas(
  canonical: DescMessage,
  alpha: DescMessage,
  compared: Set<string> = new Set(),
): void {
  const comparisonKey = `${canonical.typeName}:${alpha.typeName}`;
  if (compared.has(comparisonKey)) {
    return;
  }
  compared.add(comparisonKey);

  expect(alpha.name).toBe(canonical.name);
  const canonicalFields = [...canonical.fields].sort((left, right) => left.number - right.number);
  const alphaFields = [...alpha.fields].sort((left, right) => left.number - right.number);
  expect(alphaFields).toHaveLength(canonicalFields.length);

  for (const [index, canonicalField] of canonicalFields.entries()) {
    const alphaField = alphaFields[index];
    expect(fieldSignature(alphaField)).toEqual(fieldSignature(canonicalField));
    if (canonicalField.message !== undefined && alphaField.message !== undefined) {
      assertCompatibleMessageSchemas(canonicalField.message, alphaField.message, compared);
    }
    if (canonicalField.enum !== undefined && alphaField.enum !== undefined) {
      expect(enumSignature(alphaField.enum)).toEqual(enumSignature(canonicalField.enum));
    }
  }
}

function fieldSignature(field: DescField): Record<string, unknown> {
  const base = {
    fieldKind: field.fieldKind,
    jsonName: field.jsonName,
    name: field.name,
    number: field.number,
    oneof: field.oneof?.name,
    presence: field.presence,
  };
  switch (field.fieldKind) {
    case "scalar":
      return { ...base, longAsString: field.longAsString, scalar: field.scalar };
    case "enum":
      return base;
    case "message":
      return { ...base, delimitedEncoding: field.delimitedEncoding };
    case "list":
      return {
        ...base,
        listKind: field.listKind,
        longAsString: field.listKind === "scalar" ? field.longAsString : undefined,
        packed: field.packed,
        scalar: field.listKind === "scalar" ? field.scalar : undefined,
      };
    case "map":
      return {
        ...base,
        mapKey: field.mapKey,
        mapKind: field.mapKind,
        scalar: field.mapKind === "scalar" ? field.scalar : undefined,
      };
  }
}

function enumSignature(enumDescriptor: DescEnum): Array<{ name: string; number: number }> {
  return enumDescriptor.values.map((value) => ({ name: value.name, number: value.number }));
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
    expect(result.kind.value.$typeName).toBe("google.api.expr.v1alpha1.Value");
    expect(result.kind.value.kind).toEqual({
      case: "int64Value",
      value: 42n,
    });
  });
});

describe("TypeScript extension/TestAlphaProtoSchemaCompatibility", () => {
  it("preserves the recursive wire structure of CEL expression messages", () => {
    assertCompatibleMessageSchemas(ExprSchema, AlphaExprSchema);
    assertCompatibleMessageSchemas(ParsedExprSchema, AlphaParsedExprSchema);
    assertCompatibleMessageSchemas(CheckedExprSchema, AlphaCheckedExprSchema);
    assertCompatibleMessageSchemas(ExprValueSchema, AlphaExprValueSchema);
  });
});

describe("TypeScript extension/TestAlphaExpressionProtos", () => {
  it("converts canonical expression protobufs and ASTs to and from alpha protobufs", () => {
    const parsedAst = env().parse('title == "Dune"');
    const expression = parsedAst.expr().toProto();

    const alphaExpr = exprAsAlphaProto(expression);
    expect(alphaExpr.$typeName).toBe("google.api.expr.v1alpha1.Expr");
    expect(alphaExpr.id).toBe(expression.id);
    expect(alphaExpr.exprKind.case).toBe("callExpr");
    if (alphaExpr.exprKind.case !== "callExpr") {
      throw new Error("expected a call expression");
    }
    expect(alphaExpr.exprKind.value.args.map((arg) => arg.$typeName)).toEqual([
      "google.api.expr.v1alpha1.Expr",
      "google.api.expr.v1alpha1.Expr",
    ]);

    const parsed = astToParsedExpr(parsedAst);
    const alphaParsed = parsedExprAsAlphaProto(parsed);
    expect(alphaParsed.$typeName).toBe("google.api.expr.v1alpha1.ParsedExpr");
    expect(alphaParsed.expr?.id).toBe(expression.id);
    expect(astToAlphaExpr(parsedAst)).toEqual(alphaExpr);
    expect(astToAlphaParsedExpr(parsedAst)).toEqual(alphaParsed);
    expect(astToAlphaParsedExpr().$typeName).toBe("google.api.expr.v1alpha1.ParsedExpr");

    const canonicalExpr = alphaProtoAsExpr(alphaExpr);
    expect(canonicalExpr).toEqual(expression);
    expect(canonicalExpr.$typeName).toBe("cel.expr.Expr");
    if (canonicalExpr.exprKind.case !== "callExpr") {
      throw new Error("expected a canonical call expression");
    }
    expect(canonicalExpr.exprKind.value.args.map((arg) => arg.$typeName)).toEqual([
      "cel.expr.Expr",
      "cel.expr.Expr",
    ]);

    const canonicalParsed = alphaProtoAsParsedExpr(alphaParsed);
    expect(canonicalParsed).toEqual(parsed);
    expect(canonicalParsed.$typeName).toBe("cel.expr.ParsedExpr");
    expect(canonicalParsed.expr?.$typeName).toBe("cel.expr.Expr");

    const checkedAst = env({
      variables: [variable("title", StringType)],
    }).compile('title == "Dune"');
    const checked = astToCheckedExpr(checkedAst);
    const alphaChecked = checkedExprAsAlphaProto(checked);
    expect(alphaChecked.$typeName).toBe("google.api.expr.v1alpha1.CheckedExpr");
    expect(alphaChecked.expr?.id).toBe(checked.expr?.id);
    expect(alphaChecked.typeMap).not.toEqual({});
    expect(alphaChecked.typeMap[String(checked.expr?.id)].$typeName).toBe(
      "google.api.expr.v1alpha1.Type",
    );
    expect(astToAlphaCheckedExpr(checkedAst)).toEqual(alphaChecked);
    expect(() => astToAlphaCheckedExpr(parsedAst)).toThrow("cannot convert unchecked ast");

    const canonicalChecked = alphaProtoAsCheckedExpr(alphaChecked);
    expect(canonicalChecked).toEqual(checked);
    expect(canonicalChecked.$typeName).toBe("cel.expr.CheckedExpr");
    expect(canonicalChecked.expr?.$typeName).toBe("cel.expr.Expr");
    expect(canonicalChecked.typeMap[String(checked.expr?.id)].$typeName).toBe("cel.expr.Type");
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
    const value = adapter.enumValueOf("google.expr.proto3.test.TestAllTypes.NestedEnum", -987n);

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
    expect(roundTrip.type().typeName()).toBe("google.expr.proto3.test.TestAllTypes.NestedEnum");
    expect(roundTrip.value()).toBe(-987n);
    expect(value.equal(roundTrip).value()).toBe(true);
  });
});

describe("cel/io_test.go/TestAstToProto", () => {
  it("round-trips parsed and checked AST protobuf messages", () => {
    const celEnv = env({
      variables: [variable("a", DynType), variable("b", DynType)],
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
