import { describe, expect, it } from "vitest";
import {
  allMatcher,
  ast,
  constantValueMatcher,
  ExprKind,
  exprFactory,
  functionMatcher,
  kindMatcher,
  matchDescendants,
  matchSubset,
  maxId,
  type NavigableExpr,
  navigateAst,
  navigateExpr,
  postOrderVisit,
  preOrderVisit,
} from "./index.js";

/**
 * This is only necessary because we don't yet have a working parser.
 * TODO: replace this once ther parser works
 */
const factory = {
  // biome-ignore lint/suspicious/noExplicitAny: this is temporary
  build(source: string): any {
    switch (source) {
      case "'a' == 'b'":
        return ast(
          exprFactory().call(
            2,
            "_==_",
            exprFactory().literal(1, "a"),
            exprFactory().literal(3, "b"),
          ),
        );
      case "'a'.size()":
        return ast(exprFactory().memberCall(2, "size", exprFactory().literal(1, "a")));
      case "[1, 2, 3]":
        return ast(
          exprFactory().list(
            1,
            [
              exprFactory().literal(2, BigInt(1)),
              exprFactory().literal(3, BigInt(2)),
              exprFactory().literal(4, BigInt(3)),
            ],
            [],
          ),
        );
      case "[1, 2, 3][0]":
        return ast(
          exprFactory().call(
            5,
            "_[_]_",
            factory.build("[1, 2, 3]").expr(),
            exprFactory().literal(6, BigInt(0)),
          ),
        );
      case "{1u: 'hello'}":
        return ast(
          exprFactory().map(1, [
            exprFactory().mapEntry(
              2,
              exprFactory().literal(3, {
                $typeName: "cel.expr.Constant",
                constantKind: { case: "uint64Value", value: BigInt(1) },
              }),
              exprFactory().literal(4, "hello"),
              false,
            ),
          ]),
        );
      case "{'hello': 'world'}.hello":
        return ast(
          exprFactory().select(
            5,
            exprFactory().map(1, [
              exprFactory().mapEntry(
                2,
                exprFactory().literal(3, "hello"),
                exprFactory().literal(4, "world"),
                false,
              ),
            ]),
            "hello",
          ),
        );
      case "type(1) == int":
        return ast(
          exprFactory().call(
            3,
            "_==_",
            exprFactory().call(1, "type", exprFactory().literal(2, BigInt(1))),
            exprFactory().ident(4, "int"),
          ),
        );
      case "google.expr.proto3.test.TestAllTypes{single_int32: 1}":
        return ast(
          exprFactory().struct(1, "google.expr.proto3.test.TestAllTypes", [
            exprFactory().structField(
              2,
              "single_int32",
              exprFactory().literal(3, BigInt(1)),
              false,
            ),
          ]),
        );
      case "[true].exists(i, i)":
        return ast(
          exprFactory().comprehension(
            13,
            exprFactory().list(1, [exprFactory().literal(2, true)], []),
            "i",
            exprFactory().accuIdentName(),
            exprFactory().literal(6, false),
            exprFactory().call(
              9,
              "@not_strictly_false",
              exprFactory().call(8, "!_", exprFactory().accuIdent(7)),
            ),
            exprFactory().call(
              11,
              "_||_",
              exprFactory().accuIdent(10),
              exprFactory().ident(5, "i"),
            ),
            exprFactory().accuIdent(12),
          ),
        );
      case "size('hello')":
        return ast(exprFactory().call(1, "size", exprFactory().literal(2, "hello")));
      case "[[1], [2]]":
        return ast(
          exprFactory().list(
            1,
            [
              exprFactory().list(2, [exprFactory().literal(3, BigInt(1))], []),
              exprFactory().list(4, [exprFactory().literal(5, BigInt(2))], []),
            ],
            [],
          ),
        );
      case "{'hello': 1}":
        return ast(
          exprFactory().map(1, [
            exprFactory().mapEntry(
              2,
              exprFactory().literal(3, "hello"),
              exprFactory().literal(4, BigInt(1)),
              false,
            ),
          ]),
        );
      case "msg.single_int32":
        return ast(exprFactory().select(2, exprFactory().ident(1, "msg"), "single_int32"));
      case "has(msg.single_int32)":
        return ast(exprFactory().presenceTest(4, exprFactory().ident(2, "msg"), "single_int32"));
      default:
        throw new Error(`unknown navigable.spec expr: ${source}`);
    }
  },
};

describe("common/ast navigable", () => {
  it("common/ast/navigable_test.go/TestNavigateAST", () => {
    const cases = [
      ["'a' == 'b'", 3, 1, 1, 4],
      ["'a'.size()", 2, 1, 1, 3],
      ["[1, 2, 3]", 4, 0, 1, 5],
      ["[1, 2, 3][0]", 6, 1, 2, 7],
      ["{1u: 'hello'}", 3, 0, 1, 5],
      ["{'hello': 'world'}.hello", 4, 0, 2, 6],
      ["type(1) == int", 4, 2, 2, 5],
      ["google.expr.proto3.test.TestAllTypes{single_int32: 1}", 2, 0, 1, 4],
      ["[true].exists(i, i)", 11, 3, 3, 14],
    ] as const;

    for (const [source, descendantCount, callCount, maxDepthValue, maxIdValue] of cases) {
      const nav = navigateAst(factory.build(source));
      const descendants = matchDescendants(nav, allMatcher());
      expect(descendants).toHaveLength(descendantCount);
      expect(Math.max(...descendants.map((descendant) => descendant.depth()))).toBe(maxDepthValue);
      expect(maxId(factory.build(source))).toBe(maxIdValue);
      expect(matchSubset(descendants, kindMatcher(ExprKind.Call))).toHaveLength(callCount);
    }
  });

  it("common/ast/navigable_test.go/TestExprVisitor", () => {
    const cases = [
      ["'a' == 'b'", [2, 1, 3], [1, 3, 2]],
      ["'a'.size()", [2, 1], [1, 2]],
      ["type(1) == int", [3, 1, 2, 4], [2, 1, 4, 3]],
      ["{'hello': 'world'}.hello", [5, 1, 3, 4], [3, 4, 1, 5]],
      ["google.expr.proto3.test.TestAllTypes{single_int32: 1}", [1, 3], [3, 1]],
      [
        "[true].exists(i, i)",
        [13, 1, 2, 6, 9, 8, 7, 11, 10, 5, 12],
        [2, 1, 6, 7, 8, 9, 10, 5, 11, 12, 13],
      ],
    ] as const;

    for (const [source, preOrder, postOrder] of cases) {
      const root = navigateAst(factory.build(source));
      const preOrderIds: number[] = [];
      preOrderVisit(root, (expr) => preOrderIds.push(expr.id()));
      expect(preOrderIds).toEqual(preOrder);

      const postOrderIds: number[] = [];
      postOrderVisit(root, (expr) => postOrderIds.push(expr.id()));
      expect(postOrderIds).toEqual(postOrder);

      const preOrderFromChildren: number[] = [];
      const visited = [root];
      while (visited.length > 0) {
        const expr = visited.shift()!;
        preOrderFromChildren.push(expr.id());
        visited.unshift(...expr.children());
      }
      expect(preOrderFromChildren).toEqual(preOrder);
    }
  });

  it("common/ast/navigable_test.go/TestNavigableASTNilSafety", () => {
    const expr = navigateAst(ast(undefined, undefined));
    expect(expr.id()).toBe(0);
    expect(expr.kind()).toBe(ExprKind.Unspecified);
    expect(expr.type()?.typeKind.case).toBe("dyn");
    expect(expr.parent()[1]).toBe(false);
    expect(expr.children()).toEqual([]);
    expect(expr.asLiteral()).toBeUndefined();
    expect(expr.asCall()).toBeDefined();
    expect(expr.asComprehension()).toBeDefined();
  });

  it("common/ast/navigable_test.go/TestNavigableExpr", () => {
    const root = navigateAst(factory.build("'a' == 'b'"));
    const literals = matchDescendants(
      root,
      (expr) => expr.kind() === ExprKind.Literal && expr.asLiteral() === "a",
    );
    expect(literals).toHaveLength(1);
    expect(literals[0]?.depth()).toBe(1);
    expect(literals[0]?.parent()[1]).toBe(true);
    expect(literals[0]?.parent()[0]?.kind()).toBe(ExprKind.Call);
    expect(literals[0]?.parent()[0]?.asCall()?.functionName()).toBe("_==_");
    expect(navigateExpr(factory.build("'a' == 'b'"), literals[0]!).depth()).toBe(
      literals[0]?.depth(),
    );
  });

  it("common/ast/navigable_test.go/TestNavigableCallExprMember", () => {
    const member = navigateAst(factory.build("'a'.size()"));
    const target = member.asCall()?.target();
    const constantValues = matchDescendants(member, constantValueMatcher());
    const navTarget = constantValues[0];
    expect(member.kind()).toBe(ExprKind.Call);
    expect(member.asCall()?.functionName()).toBe("size");
    expect(target).toBeDefined();
    expect(member.asCall()?.args()).toEqual([]);
    expect(target?.kind()).toBe(ExprKind.Literal);
    expect(target?.asLiteral()).toBe("a");
    expect(navTarget?.parent()[1]).toBe(true);
    expect(navTarget?.parent()[0]).toBe(member);
    expect(matchDescendants(member, functionMatcher("size"))).toHaveLength(1);
    expect(constantValues).toHaveLength(1);
    expect(constantValues[0]?.asLiteral()).toBe("a");
  });

  it("common/ast/navigable_test.go/TestNavigableCallExprGlobal", () => {
    const global = navigateAst(factory.build("size('hello')"));
    const arg = global.asCall()?.args()[0];
    const constantValues = matchDescendants(global, constantValueMatcher());
    const navArg = constantValues[0];
    expect(global.kind()).toBe(ExprKind.Call);
    expect(global.asCall()?.functionName()).toBe("size");
    expect(global.asCall()?.isMemberFunction()).toBe(false);
    expect(global.asCall()?.args()).toHaveLength(1);
    expect(arg?.kind()).toBe(ExprKind.Literal);
    expect(arg?.asLiteral()).toBe("hello");
    expect(navArg?.parent()[1]).toBe(true);
    expect(navArg?.parent()[0]).toBe(global);
    expect(matchDescendants(global, functionMatcher("size"))).toHaveLength(1);
    expect(constantValues).toHaveLength(1);
    expect(constantValues[0]?.asLiteral()).toBe("hello");
  });

  it("common/ast/navigable_test.go/TestNavigableListExpr", () => {
    const list = navigateAst(factory.build("[[1], [2]]"));
    expect(list.kind()).toBe(ExprKind.List);
    expect(list.asList()?.size()).toBe(2);
    expect(list.asList()?.optionalIndices()).toEqual([]);
    expect(list.asList()?.elements()).toHaveLength(2);
    expect(matchDescendants(list, constantValueMatcher())).toHaveLength(5);
    expect(
      matchSubset(matchDescendants(list, constantValueMatcher()), kindMatcher(ExprKind.List)),
    ).toHaveLength(3);
    expect(
      matchSubset(matchDescendants(list, constantValueMatcher()), kindMatcher(ExprKind.Literal)),
    ).toHaveLength(2);
  });

  it("common/ast/navigable_test.go/TestNavigableMapExpr", () => {
    const map = navigateAst(factory.build("{'hello': 1}"));
    expect(map.kind()).toBe(ExprKind.Map);
    expect(map.asMap()?.size()).toBe(1);
    expect(map.asMap()?.entries()).toHaveLength(1);
    expect(map.asMap()?.entries()[0]?.asMapEntry()?.isOptional()).toBe(false);
    expect(map.asMap()?.entries()[0]?.asMapEntry()?.key().asLiteral()).toBe("hello");
    expect(map.asMap()?.entries()[0]?.asMapEntry()?.value().asLiteral()).toBe(BigInt(1));
    expect(matchDescendants(map, allMatcher())).toHaveLength(3);
    expect(
      matchSubset(matchDescendants(map, allMatcher()), kindMatcher(ExprKind.Literal)),
    ).toHaveLength(2);
  });

  it("common/ast/navigable_test.go/TestNavigableStructExpr", () => {
    const struct = navigateAst(
      factory.build("google.expr.proto3.test.TestAllTypes{single_int32: 1}"),
    );
    expect(struct.kind()).toBe(ExprKind.Struct);
    expect(struct.asStruct()?.typeName()).toBe("google.expr.proto3.test.TestAllTypes");
    expect(struct.asStruct()?.fields()).toHaveLength(1);
    expect(struct.asStruct()?.fields()[0]?.asStructField()?.isOptional()).toBe(false);
    expect(struct.asStruct()?.fields()[0]?.asStructField()?.name()).toBe("single_int32");
    expect(struct.asStruct()?.fields()[0]?.asStructField()?.value().asLiteral()).toBe(BigInt(1));
    expect(matchDescendants(struct, allMatcher())).toHaveLength(2);
    expect(
      matchSubset(matchDescendants(struct, allMatcher()), kindMatcher(ExprKind.Literal)),
    ).toHaveLength(1);
    expect(
      matchSubset(
        matchDescendants(struct, allMatcher()),
        kindMatcher(ExprKind.Literal),
      )[0]?.asLiteral(),
    ).toBe(BigInt(1));
  });

  it("common/ast/navigable_test.go/TestNavigableComprehensionExpr", () => {
    const expr = navigateAst(factory.build("[true].exists(i, i)"));
    expect(expr.kind()).toBe(ExprKind.Comprehension);
    const comp = expr.asComprehension();
    expect(matchSubset([comp!.iterRange()! as NavigableExpr], constantValueMatcher())).toHaveLength(
      1,
    );
    expect(comp?.iterVar()).toBe("i");
    expect(comp?.iterVar2()).toBe("");
    expect(comp?.accuVar()).toBe("@result");
    expect(comp?.accuInit().asLiteral()).toBe(false);
    expect(comp?.result().kind()).toBe(ExprKind.Ident);
    expect(comp?.loopCondition().kind()).toBe(ExprKind.Call);
    expect(comp?.loopStep().kind()).toBe(ExprKind.Call);
    expect(comp?.result().asIdent()).toBe("@result");
  });

  it("common/ast/navigable_test.go/TestNavigableSelectExpr", () => {
    const select = navigateAst(factory.build("msg.single_int32")).asSelect();
    expect(select?.fieldName()).toBe("single_int32");
    expect(select?.operand().kind()).toBe(ExprKind.Ident);
    expect(select?.operand().asIdent()).toBe("msg");
    expect(select?.isTestOnly()).toBe(false);
  });

  it("common/ast/navigable_test.go/TestNavigableSelectExpr_TestOnly", () => {
    const testOnly = navigateAst(factory.build("has(msg.single_int32)")).asSelect();
    expect(testOnly?.isTestOnly()).toBe(true);
    expect(testOnly?.fieldName()).toBe("single_int32");
    expect(testOnly?.operand().kind()).toBe(ExprKind.Ident);
    expect(testOnly?.operand().asIdent()).toBe("msg");
  });
});
