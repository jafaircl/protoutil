import { describe, expect, it } from "vitest";
import { parse } from "../../parser/parser.js";
import { stringSource } from "../index.js";
import { syncedCases } from "../spec-helpers.js";
import {
  ast,
  astExtension,
  checkedAst,
  constantToVal,
  ExtensionComponent,
  entryExprToProto,
  exprFactory,
  exprToProto,
  extensionVersion,
  functionReference,
  identReference,
  protoToEntryExpr,
  protoToExpr,
  protoToReferenceInfo,
  protoToSourceInfo,
  referenceInfoToProto,
  sourceInfo,
  sourceInfoToProto,
  toAst,
  toProto,
  valToConstant,
} from "./index.js";

const factory = exprFactory();

const BOOL_TYPE = {
  $typeName: "cel.expr.Type",
  typeKind: { case: "primitive", value: 1 },
} as const;

/**
 * exprFor materializes the upstream synced conversion fixtures into local AST expressions.
 */
function exprFor(source: string) {
  switch (source) {
    case "!a":
      return factory.call(1, "!_", factory.ident(2, "a"));
    case "true":
      return factory.literal(1, true);
    case "a":
      return factory.ident(1, "a");
    case "a.b":
      return factory.select(2, factory.ident(1, "a"), "b");
    case "has(msg.single_int32)":
      return factory.presenceTest(4, factory.ident(2, "msg"), "single_int32");
    case "a.size()":
      return factory.memberCall(2, "size", factory.ident(1, "a"));
    case "[a]":
      return factory.list(1, [factory.ident(2, "a")], []);
    case "[?a]":
      return factory.list(1, [factory.ident(2, "a")], [0]);
    case "{'string': 42}":
      return factory.map(1, [
        factory.mapEntry(2, factory.literal(3, "string"), factory.literal(4, BigInt(42)), false),
      ]);
    case "{?'string': a.?b}":
      return factory.map(1, [
        factory.mapEntry(
          2,
          factory.literal(3, "string"),
          factory.call(6, "_?._", factory.ident(4, "a"), factory.literal(5, "b")),
          true,
        ),
      ]);
    case "custom.StructType{uint_field: 42u}":
      return factory.struct(1, "custom.StructType", [
        factory.structField(
          2,
          "uint_field",
          factory.literal(3, {
            $typeName: "cel.expr.Constant",
            constantKind: { case: "uint64Value", value: BigInt(42) },
          }),
          false,
        ),
      ]);
    case "[].exists(i, i)":
      return factory.comprehension(
        12,
        factory.list(1, [], []),
        "i",
        factory.accuIdentName(),
        factory.literal(5, false),
        factory.call(8, "@not_strictly_false", factory.call(7, "!_", factory.accuIdent(6))),
        factory.call(10, "_||_", factory.accuIdent(9), factory.ident(4, "i")),
        factory.accuIdent(11),
      );
    default:
      throw new Error(`unknown conversion.spec expr: ${source}`);
  }
}

describe("common/ast conversion", () => {
  it("common/ast/conversion_test.go/TestConvertAST", () => {
    const parsed = ast(exprFor("!a"), sourceInfo(stringSource("!a", "<input>")));
    parsed.sourceInfo().addExtension(
      astExtension({
        id: "json_name",
        version: extensionVersion(1, 1),
        affectedComponents: [ExtensionComponent.Runtime],
      }),
    );
    const checked = checkedAst(
      parsed,
      new Map([
        [1, BOOL_TYPE],
        [2, BOOL_TYPE],
      ]),
      new Map([
        [1, functionReference("!_")],
        [2, identReference("a")],
      ]),
    );

    const pb = toProto(checked);
    const roundtrip = toAst(pb);
    expect(roundtrip.expr().toProto()).toEqual(checked.expr().toProto());
    expect(roundtrip.sourceInfo().extensions()).toEqual(checked.sourceInfo().extensions());
    expect(roundtrip.referenceMap()).toEqual(checked.referenceMap());
  });

  it("common/ast/conversion_test.go/TestConvertProtoToEntryExpr", () => {
    const entry = factory.mapEntry(
      1,
      factory.ident(2, "var_key"),
      factory.literal(3, "hello"),
      true,
    );
    expect(protoToEntryExpr(entryExprToProto(entry)).toProto()).toEqual(entryExprToProto(entry));
  });

  it("common/ast/conversion_test.go/TestConvertExpr", () => {
    const cases = syncedCases<{
      expr: string;
      wantExpr: { $expr: string };
      macroCalls?: Record<string, { $expr: string }>;
    }>("common/ast/conversion_test.go/TestConvertExpr");

    for (const testCase of cases) {
      const parsed = parse(testCase.expr, {
        enableOptionalSyntax: true,
        populateMacroCalls: true,
      });
      const actualProto = exprToProto(parsed.expr());
      const wantedExpr = resolveSyncedConvertExpr(testCase);
      const wantedProto = exprToProto(wantedExpr);
      expect(actualProto).toEqual(wantedProto);
      expect(protoToExpr(actualProto).toProto()).toEqual(parsed.expr().toProto());
      for (const [id, wantedCall] of resolveSyncedMacroCalls(testCase)) {
        const [actualCall, found] = parsed.sourceInfo().getMacroCall(id);
        expect(found).toBe(true);
        expect(actualCall?.toProto()).toEqual(wantedCall.toProto());
      }
    }
  });

  it("common/ast/conversion_test.go/TestSourceInfoToProto", () => {
    const parsed = parse("[{}, {'field': true}].exists(i, has(i.field))", {
      enableOptionalSyntax: true,
      populateMacroCalls: true,
    });
    const actual = sourceInfoToProto(parsed.sourceInfo());
    expect(actual.location).toBe("<input>");
    expect(actual.lineOffsets).toEqual([46]);
    expect(actual.positions).toEqual({
      "1": 0,
      "2": 1,
      "3": 5,
      "4": 13,
      "5": 6,
      "6": 15,
      "8": 29,
      "10": 36,
      "11": 37,
      "12": 35,
      "13": 28,
      "14": 28,
      "15": 28,
      "16": 28,
      "17": 28,
      "18": 28,
      "19": 28,
      "20": 28,
    });
    expect(Object.keys(actual.macroCalls).sort()).toEqual(["12", "20"]);
    expect(actual.macroCalls["12"]).toEqual(
      factory.call(0, "has", factory.select(11, factory.ident(10, "i"), "field")).toProto(),
    );
    expect(actual.macroCalls["20"]).toEqual(
      factory
        .memberCall(
          0,
          "exists",
          factory.list(
            1,
            [
              factory.map(2, []),
              factory.map(3, [
                factory.mapEntry(4, factory.literal(5, "field"), factory.literal(6, true), false),
              ]),
            ],
            [],
          ),
          factory.ident(8, "i"),
          factory.unspecified(12),
        )
        .toProto(),
    );
  });

  it("expression protobuf roundtrips for the first common pass", () => {
    const exprs = [
      "true",
      "a",
      "a.b",
      "has(msg.single_int32)",
      "!a",
      "a.size()",
      "[a]",
      "[?a]",
      "{'string': 42}",
      "{?'string': a.?b}",
      "custom.StructType{uint_field: 42u}",
      "[].exists(i, i)",
    ] as const;

    for (const source of exprs) {
      const expr = exprFor(source);
      expect(protoToExpr(exprToProto(expr)).toProto()).toEqual(exprToProto(expr));
    }
  });

  it("covers source-info to proto including positions, macro calls, and extensions", () => {
    const info = sourceInfo(stringSource("[true].exists(i, i)", "<input>"));
    info.setOffsetRange(1, { start: 0, stop: 1 });
    info.setOffsetRange(13, { start: 0, stop: 0 });
    info.setMacroCall(
      13,
      factory.memberCall(
        0,
        "exists",
        factory.list(1, [factory.literal(2, true)], []),
        factory.ident(3, "i"),
        factory.ident(4, "i"),
      ),
    );
    info.addExtension(
      astExtension({
        id: "json_name",
        version: extensionVersion(1, 1),
        affectedComponents: [ExtensionComponent.Runtime],
      }),
    );

    const pb = sourceInfoToProto(info);
    expect(pb.location).toBe("<input>");
    expect(pb.positions["1"]).toBe(0);
    expect(pb.positions["13"]).toBe(0);
    expect(Object.keys(pb.macroCalls)).toContain("13");
    expect(pb.extensions[0]?.id).toBe("json_name");
    expect(protoToSourceInfo(pb).extensions()).toEqual(info.extensions());
  });

  it("common/ast/conversion_test.go/TestReferenceInfoToProtoError", () => {
    expect(() =>
      referenceInfoToProto(identReference("SECOND", { duration: 1000 } as never)),
    ).toThrow();
  });

  it("common/ast/conversion_test.go/TestProtoToReferenceInfoError", () => {
    expect(() =>
      protoToReferenceInfo({
        $typeName: "cel.expr.Reference",
        name: "",
        overloadId: [],
        value: { $typeName: "cel.expr.Constant", constantKind: { case: undefined } },
      }),
    ).toThrow();
  });

  it("common/ast/conversion_test.go/TestConvertVal", () => {
    const ref = identReference("TRUE", true);
    expect(protoToReferenceInfo(referenceInfoToProto(ref)).equals(ref)).toBe(true);

    const values = [true, "bytes", 3.2, BigInt(-1), null, "string", new Uint8Array([27])];
    for (const value of values) {
      expect(constantToVal(valToConstant(value))).toEqual(value);
    }
  });

  it("common/ast/conversion_test.go/TestValToConstantError", () => {
    expect(() => valToConstant({ duration: 10 } as never)).toThrow();
  });

  it("common/ast/conversion_test.go/TestConstantToValError", () => {
    expect(() =>
      constantToVal({ $typeName: "cel.expr.Constant", constantKind: { case: undefined } }),
    ).toThrow();
  });
});

function resolveSyncedConvertExpr(testCase: {
  expr: string;
  wantExpr: { $expr: string };
}): ReturnType<typeof exprFor> {
  switch (testCase.expr) {
    case "has(a.b)":
      return factory.presenceTest(4, factory.ident(2, "a"), "b");
    default:
      return exprFor(testCase.expr);
  }
}

function resolveSyncedMacroCalls(testCase: {
  expr: string;
  macroCalls?: Record<string, { $expr: string }>;
}): Map<number, ReturnType<typeof exprFor>> {
  if (!testCase.macroCalls) {
    return new Map();
  }
  switch (testCase.expr) {
    case "has(a.b)":
      return new Map([[4, factory.call(0, "has", factory.select(3, factory.ident(2, "a"), "b"))]]);
    case "[].exists(i, i)":
      return new Map([
        [
          12,
          factory.memberCall(
            0,
            "exists",
            factory.list(1, [], []),
            factory.ident(3, "i"),
            factory.ident(4, "i"),
          ),
        ],
      ]);
    default:
      throw new Error(`unsupported synced conversion macro expr: ${testCase.expr}`);
  }
}
