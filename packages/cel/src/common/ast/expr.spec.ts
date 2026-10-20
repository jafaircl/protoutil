import { describe, expect, it } from "vitest";
import {
  constantToVal,
  ExprKind,
  exprFactory,
  type IdGenerator,
  protoToExpr,
  valToConstant,
} from "./index.js";

const factory = exprFactory();

function idGen(seed: number): IdGenerator {
  const seen = new Map<number, number>();
  let next = seed;
  return (originalId) => {
    const found = seen.get(originalId);
    if (found !== undefined) {
      return found;
    }
    next += 1;
    seen.set(originalId, next);
    return next;
  };
}

function nilExpr() {
  const expr = factory.literal(1, null);
  expr.setKindCase(undefined);
  return expr;
}

describe("common/ast expr", () => {
  it("common/ast/expr_test.go/TestSetKindCase", () => {
    const tests = [
      factory.unspecified(1),
      factory.call(1, "_==_", factory.literal(2, true), factory.literal(3, false)),
      factory.memberCall(1, "size", factory.literal(2, "hello")),
      factory.comprehension(
        12,
        factory.list(1, [], []),
        "i",
        "@result",
        factory.literal(5, false),
        factory.call(8, "@not_strictly_false", factory.call(7, "!_", factory.accuIdent(6))),
        factory.call(10, "_||_", factory.accuIdent(9), factory.ident(4, "i")),
        factory.accuIdent(11),
      ),
      factory.ident(1, "a"),
      factory.literal(1, new Uint8Array([104, 101, 108, 108, 111])),
      factory.list(1, [factory.ident(2, "a"), factory.ident(3, "b")], []),
      factory.map(1, [
        factory.mapEntry(
          2,
          factory.literal(3, "string"),
          factory.call(6, "_?._", factory.ident(4, "a"), factory.literal(5, "b")),
          true,
        ),
      ]),
      factory.select(2, factory.ident(1, "a"), "b"),
      factory.struct(1, "custom.StructType", [
        factory.structField(2, "uint_field", factory.literal(3, 42), false),
      ]),
    ];

    const expr = nilExpr();
    for (const testExpr of tests) {
      expr.setKindCase(testExpr);
      expect(expr.kind()).toBe(testExpr.kind());
      expect(expr.toProto()).toEqual({
        ...testExpr.toProto(),
        // cel-go's SetKindCase replaces only the expression kind and preserves the target id.
        id: 1n,
      });
    }
  });

  it("common/ast/expr_test.go/TestCall", () => {
    const call = factory.call(1, "size", factory.literal(2, "hello"));
    expect(call.kind()).toBe(ExprKind.Call);
    expect(call.asCall()?.functionName()).toBe("size");
    expect(call.asCall()?.args()).toHaveLength(1);
    expect(call.asCall()?.isMemberFunction()).toBe(false);
    expect(call.asCall()?.target().id()).toBe(0);
    call.renumberIds(idGen(100));
    expect(call.id()).toBe(101);
    expect(call.asCall()?.args()[0]?.id()).toBe(102);
  });

  it("common/ast/expr_test.go/TestMemberCall", () => {
    const member = factory.memberCall(1, "size", factory.literal(2, "hello"));
    expect(member.kind()).toBe(ExprKind.Call);
    expect(member.asCall()?.functionName()).toBe("size");
    expect(member.asCall()?.args()).toEqual([]);
    expect(member.asCall()?.isMemberFunction()).toBe(true);
    expect(member.asCall()?.target().id()).toBe(2);
    member.renumberIds(idGen(100));
    expect(member.id()).toBe(101);
    expect(member.asCall()?.target().id()).toBe(102);
  });

  it("common/ast/expr_test.go/TestCallNil", () => {
    const nil = nilExpr();
    expect(nil.asCall()?.functionName()).toBe("");
    expect(nil.asCall()?.args()).toEqual([]);
    expect(nil.asCall()?.target().kind()).toBe(ExprKind.Unspecified);
    nil.renumberIds(idGen(100));
    expect(nil.id()).toBe(101);
  });

  it("common/ast/expr_test.go/TestComprehension", () => {
    const expr = factory.comprehension(
      1,
      factory.list(2, [factory.literal(3, 1), factory.literal(4, 2)], []),
      "i",
      "@result",
      factory.literal(5, false),
      factory.literal(6, true),
      factory.call(
        7,
        "_||_",
        factory.accuIdent(8),
        factory.call(9, "<", factory.ident(10, "i"), factory.literal(11, 3)),
      ),
      factory.accuIdent(12),
    );
    expect(expr.asComprehension()?.iterRange().kind()).toBe(ExprKind.List);
    expect(expr.asComprehension()?.accuInit().kind()).toBe(ExprKind.Literal);
    expect(expr.asComprehension()?.loopCondition().kind()).toBe(ExprKind.Literal);
    expect(expr.asComprehension()?.loopStep().kind()).toBe(ExprKind.Call);
    expect(expr.asComprehension()?.result().kind()).toBe(ExprKind.Ident);
    expr.renumberIds(idGen(100));
    expect(expr.id()).toBe(101);
    expect(expr.asComprehension()?.iterRange().id()).toBe(102);
    expect(expr.asComprehension()?.accuInit().id()).toBe(105);
    expect(expr.asComprehension()?.loopCondition().id()).toBe(106);
    expect(expr.asComprehension()?.loopStep().id()).toBe(107);
    expect(expr.asComprehension()?.result().id()).toBe(112);
  });

  it("common/ast/expr_test.go/TestComprehensionNil", () => {
    const nil = nilExpr().asComprehension();
    expect(nil?.iterRange().kind()).toBe(ExprKind.Unspecified);
    expect(nil?.accuInit().kind()).toBe(ExprKind.Unspecified);
    expect(nil?.loopCondition().kind()).toBe(ExprKind.Unspecified);
    expect(nil?.loopStep().kind()).toBe(ExprKind.Unspecified);
    expect(nil?.result().kind()).toBe(ExprKind.Unspecified);
    const expr = nilExpr();
    expr.renumberIds(idGen(100));
    expect(expr.id()).toBe(101);
  });

  it("common/ast/expr_test.go/TestIdent", () => {
    const ident = factory.ident(1, "a");
    ident.renumberIds(idGen(50));
    expect(ident.asIdent()).toBe("a");
    expect(ident.id()).toBe(51);
  });

  it("common/ast/expr_test.go/TestList", () => {
    const expr = factory.list(20, [factory.literal(21, true)], [0]);
    const list = expr.asList();
    expect(list?.size()).toBe(1);
    expect(list?.elements()[0]?.kind()).toBe(ExprKind.Literal);
    expect(list?.optionalIndices()).toEqual([0]);
    expr.renumberIds(idGen(50));
    expect(expr.id()).toBe(51);
    expect(list?.elements()[0]?.id()).toBe(52);
  });

  it("common/ast/expr_test.go/TestMap", () => {
    const map = factory
      .map(1, [
        factory.mapEntry(2, factory.ident(3, "a"), factory.literal(4, true), true),
        factory.mapEntry(5, factory.ident(6, "b"), factory.literal(7, false), false),
      ])
      .asMap();
    expect(map?.size()).toBe(2);
    expect(map?.entries()[0]?.asMapEntry()?.isOptional()).toBe(true);
  });

  it("common/ast/expr_test.go/TestSelect", () => {
    const select = factory.select(2, factory.ident(1, "operand"), "field").asSelect();
    expect(select?.fieldName()).toBe("field");
    expect(select?.operand().asIdent()).toBe("operand");
  });

  it("common/ast/expr_test.go/TestStruct", () => {
    const struct = factory
      .struct(1, "custom.StructType", [
        factory.structField(2, "a", factory.literal(3, true), true),
        factory.structField(4, "b", factory.literal(5, false), false),
      ])
      .asStruct();
    expect(struct?.typeName()).toBe("custom.StructType");
    expect(struct?.fields()).toHaveLength(2);
  });

  it("common/ast/expr_test.go/TestIdentNil", () => {
    const nil = nilExpr();
    expect(nil.asIdent()).toBeUndefined();
  });

  it("common/ast/expr_test.go/TestLiteralNil", () => {
    const nil = nilExpr();
    expect(nil.asLiteral()).toBeUndefined();
  });

  it("common/ast/expr_test.go/TestListNil", () => {
    const nil = nilExpr();
    expect(nil.asList()?.size()).toBe(0);
    expect(nil.asList()?.elements()).toEqual([]);
    expect(nil.asList()?.optionalIndices()).toEqual([]);
  });

  it("common/ast/expr_test.go/TestMapNil", () => {
    const nil = nilExpr();
    expect(nil.asMap()?.size()).toBe(0);
    expect(nil.asMap()?.entries()).toEqual([]);
  });

  it("common/ast/expr_test.go/TestSelectNil", () => {
    const nil = nilExpr();
    expect(nil.asSelect()?.fieldName()).toBe("");
    expect(nil.asSelect()?.isTestOnly()).toBe(false);
    expect(nil.asSelect()?.operand().kind()).toBe(ExprKind.Unspecified);
  });

  it("common/ast/expr_test.go/TestStructNil", () => {
    const nil = nilExpr();
    expect(nil.asStruct()?.typeName()).toBe("");
    expect(nil.asStruct()?.fields()).toEqual([]);
  });

  it("common/ast/expr_test.go/TestMapEntryNil", () => {
    const field = factory.structField(1, "hello", factory.literal(3, "world"), false);
    expect(field.asMapEntry()?.key().kind()).toBe(ExprKind.Unspecified);
    expect(field.asMapEntry()?.value().kind()).toBe(ExprKind.Unspecified);
    expect(field.asMapEntry()?.isOptional()).toBe(false);
  });

  it("common/ast/expr_test.go/TestStructFieldNil", () => {
    const entry = factory.mapEntry(
      1,
      factory.literal(2, "hello"),
      factory.literal(3, "world"),
      false,
    );
    expect(entry.asStructField()?.name()).toBe("");
    expect(entry.asStructField()?.value().kind()).toBe(ExprKind.Unspecified);
    expect(entry.asStructField()?.isOptional()).toBe(false);
  });

  it("common/ast/expr_test.go/TestRenumberIDs", () => {
    const expr = factory.unspecified(10);
    expr.renumberIds(idGen(100));
    expect(expr.id()).toBe(101);
    const literal = factory.literal(20, true);
    literal.renumberIds(idGen(200));
    expect(literal.id()).toBe(201);
  });

  it("round-trips supported constant conversions", () => {
    const values = [true, "bytes", 3.2, BigInt(-1), null, "string", new Uint8Array([27])] as const;

    for (const value of values) {
      const constant = valToConstant(value);
      expect(constantToVal(constant)).toEqual(value);
      expect(protoToExpr(factory.literal(1, value).toProto()).toProto()).toEqual(
        factory.literal(1, value).toProto(),
      );
    }
  });
});
