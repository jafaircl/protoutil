import { create } from "@bufbuild/protobuf";
import { TestAllTypesSchema as Proto3TestAllTypesSchema } from "@protoutil/testing/cel/proto3";
import { describe, expect, it } from "vitest";
import { check } from "../../checker/checker.js";
import { env } from "../../checker/env.js";
import { CheckedExprSchema } from "../../gen/cel/expr/checked_pb.js";
import { parse } from "../../parser/parser.js";
import { defaultContainer } from "../containers.js";
import {
  AST,
  ast,
  astExtension,
  copyAst,
  ExprKind,
  ExtensionComponent,
  entryExprToProto,
  exprFactory,
  exprToProto,
  extensionVersion,
  functionReference,
  heights,
  identReference,
  kindMatcher,
  matchDescendants,
  matchSubset,
  maxId,
  navigateAst,
  nodeCount,
  postOrderVisit,
  protoToEntryExpr,
  protoToExpr,
  type Source,
  SourceLocation,
  sourceInfo,
  sourceInfoToProto,
  stringSource,
  textSource,
  toAst,
  toProto,
} from "../index.js";
import { syncedCases } from "../spec-helpers.js";
import { standardFunctions } from "../stdlib.js";
import { registry } from "../types/index.js";

function astFor(source: string): AST {
  return parse(source, { enableOptionalSyntax: true, populateMacroCalls: true });
}

function mustTypeCheck(source: string, jsonFieldNames = false): AST {
  const parsed = parse(source);
  const reg = registry([create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema]);
  reg.withJSONFieldNames(jsonFieldNames);
  const checkerEnv = env(defaultContainer, reg, { jsonFieldNames });
  checkerEnv.addFunctions(...standardFunctions());
  return check(parsed, textSource(source), checkerEnv);
}

describe("common/ast", () => {
  it("common/ast/ast_test.go/TestReferenceInfoEquals", () => {
    const cases = syncedCases<{
      name: string;
      equal: boolean;
    }>("common/ast/ast_test.go/TestReferenceInfoEquals");

    const references = {
      addBytes: functionReference("add_bytes"),
      addDouble: functionReference("add_double"),
      identBytes: identReference("BYTES"),
      identTrue: identReference("TRUE"),
      constBytes: identReference("BYTES", "bytes"),
      constBytesOther: identReference("BYTES", "bytes-other"),
    };

    const byName: Record<string, [unknown, unknown]> = {
      "single overload equal": [references.addBytes, functionReference("add_bytes")],
      "single overload not equal": [references.addBytes, references.addDouble],
      "single and multiple overload not equal": [
        references.addBytes,
        functionReference("add_bytes", "add_double"),
      ],
      "multiple overloads equal": [
        functionReference("add_bytes", "add_double"),
        functionReference("add_double", "add_bytes"),
      ],
      "identifier reference equal": [references.identBytes, identReference("BYTES")],
      "identifier reference not equal": [references.identBytes, references.identTrue],
      "identifier and constant reference not equal": [references.identBytes, references.constBytes],
      "constant references equal": [references.constBytes, identReference("BYTES", "bytes")],
      "constant references not equal": [references.constBytes, references.constBytesOther],
      "constant and overload reference not equal": [
        references.constBytes,
        functionReference("add_double", "add_bytes"),
      ],
    };

    for (const testCase of cases) {
      const [a, b] = byName[testCase.name] as [
        ReturnType<typeof functionReference>,
        ReturnType<typeof functionReference>,
      ];
      expect(a.equals(b)).toBe(testCase.equal);
    }
  });

  it("common/ast/ast_test.go/TestNewSourceInfoRelative", () => {
    const source = stringSource("\n \n a || b ?\n cond1 :\n cond2", "<input>");
    const relativeSource: Source = {
      content: () => source.content(),
      description: () => source.description(),
      lineOffsets: () => [1, 2, 13, 25],
      locationOffset: (location) => source.locationOffset(location),
      offsetLocation: (offset: number) =>
        offset === 0 ? [new SourceLocation(2, 1), true] : source.offsetLocation(offset),
      location: (line, column) => new SourceLocation(line, column),
      snippet: (line) => source.snippet(line),
    };
    const info = sourceInfo(relativeSource);

    const cases = syncedCases<{
      offset: number;
    }>("common/ast/ast_test.go/TestNewSourceInfoRelative");
    expect(info.computeOffset(1, 0)).toBe(cases[0].offset);
    expect(info.computeOffset(2, 3)).toBe(cases[1].offset);
    expect(info.computeOffset(3, 1)).toBe(cases[2].offset);
  });

  it("common/ast/ast_test.go/TestHeights", () => {
    const cases = syncedCases<{
      expr: string;
      height: number;
    }>("common/ast/ast_test.go/TestHeights");
    for (const testCase of cases) {
      const exprAst = astFor(testCase.expr);
      const rootHeight = heights(exprAst).get(exprAst.expr().id());
      expect(rootHeight).toBe(testCase.height);
    }
  });

  it("common/ast/ast_test.go/TestASTCopy", () => {
    const cases = [
      "'a' == 'b'",
      "'a'.size()",
      "size('a')",
      "has({'a': 1}.a)",
      "{'a': 1}",
      "{'a': 1}['a']",
      "[1, 2, 3].exists(i, i % 2 == 1)",
      "google.expr.proto3.test.TestAllTypes{}",
      "google.expr.proto3.test.TestAllTypes{repeated_int32: [1, 2]}",
    ] as const;

    for (const source of cases) {
      const exprAst = astFor(source);
      exprAst
        .sourceInfo()
        .addExtension(astExtension({ id: "json_name", version: extensionVersion(1, 1) }));
      const copied = copyAst(exprAst);
      expect(copied?.expr().toProto()).toEqual(exprAst.expr().toProto());
      expect(copied?.sourceInfo().extensions()).toEqual(exprAst.sourceInfo().extensions());

      const checked = new AST(
        exprAst.expr(),
        exprAst.sourceInfo(),
        new Map(),
        new Map([[1, functionReference("!_")]]),
      );
      const pb = toProto(checked);
      const roundtrip = toAst(pb);
      expect(roundtrip.expr().toProto()).toEqual(checked.expr().toProto());
      expect(roundtrip.referenceMap()).toEqual(checked.referenceMap());
      expect(
        [...roundtrip.sourceInfo().macroCalls()].map(([id, expr]) => [id, expr.toProto()]),
      ).toEqual([...checked.sourceInfo().macroCalls()].map(([id, expr]) => [id, expr.toProto()]));
    }
  });

  it("common/ast/ast_test.go/TestASTJsonNames", () => {
    const cases = [
      "google.expr.proto3.test.TestAllTypes{}",
      "google.expr.proto3.test.TestAllTypes{repeatedInt32: [1, 2]}",
      "google.expr.proto3.test.TestAllTypes{singleInt32: 2}.singleInt32 == 2",
    ] as const;

    for (const source of cases) {
      const checked = mustTypeCheck(source, true);
      const copied = copyAst(checked);
      expect(copied?.expr().toProto()).toEqual(checked.expr().toProto());
      expect(copied?.sourceInfo().extensions()).toEqual(checked.sourceInfo().extensions());

      const parsedCopy = copyAst(ast(checked.expr(), checked.sourceInfo()));
      expect(parsedCopy?.expr().toProto()).toEqual(checked.expr().toProto());
      expect(parsedCopy?.sourceInfo().extensions()).toEqual(checked.sourceInfo().extensions());

      const checkedProto = toProto(checked);
      const copiedProto = copied ? toProto(copied) : undefined;
      expect(copiedProto).toEqual(checkedProto);

      const roundtrip = toAst(checkedProto);
      expect(roundtrip.expr().toProto()).toEqual(checked.expr().toProto());
      expect(roundtrip.referenceMap()).toEqual(checked.referenceMap());
      expect(roundtrip.typeMap()).toEqual(checked.typeMap());
      expect(
        [...roundtrip.sourceInfo().macroCalls()].map(([id, expr]) => [id, expr.toProto()]),
      ).toEqual([...checked.sourceInfo().macroCalls()].map(([id, expr]) => [id, expr.toProto()]));
    }
  });

  it("common/ast/ast_test.go/TestASTNilSafety", () => {
    const exprAst = ast(undefined, undefined);
    const cases = [
      exprAst,
      copyAst(exprAst),
      new AST(protoToExpr(), undefined, new Map(), new Map()),
    ];
    for (const testAst of cases) {
      expect(testAst?.expr().id()).toBe(0);
      expect(testAst?.expr().kind()).toBe(ExprKind.Unspecified);
      expect(testAst?.sourceInfo().syntaxVersion()).toBe("");
      expect(testAst?.isChecked()).toBe(false);
      expect(testAst?.getType(0)?.typeKind.case).toBe("dyn");
      expect(testAst?.getOverloadIds(0)).toEqual([]);
      expect(testAst?.sourceInfo().computeOffset(1, 0)).toBe(0);
      expect(testAst?.sourceInfo().computeOffset(-2, 0)).toBe(-1);
    }
  });

  it("common/ast/ast_test.go/TestSourceInfo", () => {
    const info = sourceInfo(stringSource("a\n? b\n: c", "custom description"));
    expect(info.description()).toBe("custom description");
    info.setOffsetRange(1, { start: 0, stop: 1 });
    info.setOffsetRange(2, { start: 4, stop: 5 });
    info.setOffsetRange(3, { start: 8, stop: 9 });
    expect(info.getStartLocation(1)).toEqual(new SourceLocation(1, 0));
    expect(info.getStopLocation(1)).toEqual(new SourceLocation(1, 1));
    expect(info.getStartLocation(2)).toEqual(new SourceLocation(2, 2));
    expect(info.getStopLocation(2)).toEqual(new SourceLocation(2, 3));
    expect(info.getStartLocation(3)).toEqual(new SourceLocation(3, 2));
    expect(info.getStopLocation(3)).toEqual(new SourceLocation(3, 3));
    expect(info.computeOffset(3, 2)).toBe(8);
  });

  it("common/ast/ast_test.go/TestSourceInfoNilSafety", () => {
    const nilish = sourceInfo(undefined);
    expect(nilish.syntaxVersion()).toBe("");
    expect(nilish.description()).toBe("");
    expect(nilish.lineOffsets()).toEqual([]);
    expect(nilish.macroCalls().size).toBe(0);
    expect(nilish.extensions()).toEqual([]);
    expect(nilish.getMacroCall(0)[1]).toBe(false);
    expect(nilish.getOffsetRange(0)[1]).toBe(false);
    expect(nilish.getStartLocation(0)).toEqual(new SourceLocation(-1, -1));
    expect(nilish.getStopLocation(0)).toEqual(new SourceLocation(-1, -1));
    expect(nilish.computeOffset(1, 0)).toBe(0);
    expect(nilish.computeOffset(2, 0)).toBe(-1);
  });

  it("common/ast/ast_test.go/TestHasExtension", () => {
    const info = sourceInfo(undefined);
    info.addExtension(
      astExtension({
        id: "json_name",
        version: extensionVersion(1, 1),
        affectedComponents: [ExtensionComponent.Runtime],
      }),
    );
    expect(info.hasExtension("json_name", extensionVersion(1, 0))).toBe(true);
    expect(info.hasExtension("json_name", extensionVersion(2, 1))).toBe(false);
    expect(info.hasExtension("unrelated", extensionVersion(0, 0))).toBe(false);
  });

  it("common/ast/ast_test.go/TestSourceInfoRenumberIDs", () => {
    const renumber = sourceInfo(undefined);
    for (let old = 1; old <= 5; old += 1) {
      renumber.setOffsetRange(old, { start: old, stop: old + 1 });
    }
    renumber.renumberIds((old) => old + 100);
    expect(renumber.offsetRanges().size).toBe(5);
    expect(renumber.getOffsetRange(101)[0]).toEqual({ start: 1, stop: 2 });
  });

  it("converts expressions and entry expressions to and from protobuf", () => {
    const expr = parse("{1u: 'hello'}").expr();
    expect(protoToExpr(exprToProto(expr)).toProto()).toEqual(exprToProto(expr));

    const entry = parse("{1u: 'hello'}").expr().asMap()?.entries()[0];
    expect(entry).toBeDefined();
    if (!entry) {
      return;
    }
    expect(protoToEntryExpr(entryExprToProto(entry)).toProto()).toEqual(entryExprToProto(entry));
  });

  it("navigates AST descendants using upstream-shaped fixture ids", () => {
    const cases = syncedCases<{
      expr: string;
      descendantCount: number;
      callCount: number;
      maxDepth: number;
      maxID: number;
    }>("common/ast/navigable_test.go/TestNavigateAST");

    for (const testCase of cases) {
      const nav = navigateAst(astFor(testCase.expr));
      const descendants = matchDescendants(nav, () => true);
      expect(descendants).toHaveLength(testCase.descendantCount);
      expect(Math.max(...descendants.map((descendant) => descendant.depth()))).toBe(
        testCase.maxDepth,
      );
      expect(maxId(astFor(testCase.expr))).toBe(testCase.maxID);
      expect(matchSubset(descendants, kindMatcher(ExprKind.Call))).toHaveLength(testCase.callCount);
    }
  });

  it("preserves source-info macro calls in protobuf form", () => {
    const exprAst = astFor("[true].exists(i, i)");
    exprAst
      .sourceInfo()
      .setMacroCall(
        13,
        exprFactory().memberCall(
          0,
          "exists",
          exprFactory().list(1, [exprFactory().literal(2, true)], []),
          exprFactory().ident(3, "i"),
          exprFactory().ident(4, "i"),
        ),
      );
    const pb = sourceInfoToProto(exprAst.sourceInfo());
    expect(Object.keys(pb.macroCalls)).toContain("13");
  });

  it("common/ast/ast_test.go/TestMaxID", () => {
    const exprAst = astFor("has({'a': 1}.a)");
    const currentMax = maxId(exprAst);
    const dummy = parse("a").expr();
    dummy.renumberIds(() => currentMax + 1);
    exprAst.sourceInfo().setMacroCall(currentMax + 2, dummy);
    expect(maxId(exprAst)).toBe(currentMax + 3);
  });

  it("common/ast/ast_test.go/TestNodeCount", () => {
    expect(nodeCount(undefined)).toBe(0);
    expect(nodeCount(astFor("1 + 2"))).toBe(3);
  });

  it("supports source-info cleanup behaviors", () => {
    const info = sourceInfo(textSource("a"));
    info.setOffsetRange(99, { start: 0, stop: 0 });
    const wrapped = ast(parse("a").expr(), info);
    wrapped.clearUnusedIds();
    expect(wrapped.sourceInfo().getOffsetRange(99)[1]).toBe(false);
  });

  it("supports checked-expr conversion for the first common pass", () => {
    const checked = create(CheckedExprSchema, {
      expr: exprToProto(parse("type(1) == int").expr()),
      sourceInfo: sourceInfoToProto(sourceInfo(textSource("type(1) == int"))),
    });

    const exprAst = toAst(checked);
    expect(toProto(exprAst)).toEqual(checked);
  });

  it("replaces an expression kind case in place for rewrite-style use", () => {
    const expr = parse("a.size()").expr();
    const replacement = parse("'a' == 'b'").expr();
    expr.setKindCase(replacement);
    expect(expr.toProto()).toEqual(exprToProto(replacement));
  });

  it("common/ast/ast_test.go/TestReferenceInfoAddOverload", () => {
    const add = functionReference("add_bytes");
    add.addOverload("add_double");
    add.addOverload("add_double");
    expect(add.equals(functionReference("add_bytes", "add_double"))).toBe(true);
  });

  it("common/ast/ast_test.go/PostOrderVisit sanity", () => {
    const ids: number[] = [];
    postOrderVisit(astFor("'a' == 'b'").expr(), (expr) => ids.push(expr.id()));
    expect(ids).toEqual([1, 3, 2]);
  });
});
