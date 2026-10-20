import { create } from "@bufbuild/protobuf";
import { anyPack, EmptySchema } from "@bufbuild/protobuf/wkt";
import { astToCheckedExpr, env, StringType, unwrapAst, variable } from "@protoutil/cel";
import { describe, expect, it } from "vitest";
import {
  CheckedExprSchema,
  ReferenceSchema,
  Type_PrimitiveType,
  TypeSchema,
} from "../gen/cel/expr/checked_pb.js";
import { Expr_IdentSchema } from "../gen/cel/expr/syntax_pb.js";
import { createTranslator, TranslationErrorCode, TranslationLimitsSchema } from "../index.js";
import { AnsiSqlProfile } from "./index.js";

const strings = env({
  variables: [variable("name", StringType), variable("nickname", StringType)],
});

describe("ANSI SQL profile", () => {
  it("binds constants instead of placing them in SQL", () => {
    const checkedExpression = astToCheckedExpr(
      unwrapAst(strings.compile('name == "Robert\'); DROP TABLE users;--"')),
    );

    const outcome = createTranslator(new AnsiSqlProfile()).translate({
      checkedExpression,
    });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;
    expect(outcome.value.sql).toBe('"name" = ?');
    expect(outcome.value.parameters[0]?.value?.kind).toEqual({
      case: "stringValue",
      value: "Robert'); DROP TABLE users;--",
    });
  });

  it("compares a query field with a non-null constant through indexable equality", () => {
    const checkedExpression = astToCheckedExpr(unwrapAst(strings.compile('name == "alice"')));

    const outcome = createTranslator(new AnsiSqlProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({ case: "predicate", value: { sql: '"name" = ?' } });
  });

  it("keeps distinctness comparison where both operands can be null", () => {
    const checkedExpression = astToCheckedExpr(unwrapAst(strings.compile("name == nickname")));

    const outcome = createTranslator(new AnsiSqlProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: { sql: '"name" IS NOT DISTINCT FROM "nickname"' },
    });
  });

  it("keeps distinctness comparison under negation so a null field stays selected", () => {
    const checkedExpression = astToCheckedExpr(unwrapAst(strings.compile('!(name == "alice")')));

    const outcome = createTranslator(new AnsiSqlProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: { sql: '(NOT "name" IS NOT DISTINCT FROM ?)' },
    });
  });

  it("keeps distinctness comparison for inequality so a null field stays selected", () => {
    const checkedExpression = astToCheckedExpr(unwrapAst(strings.compile('name != "alice"')));

    const outcome = createTranslator(new AnsiSqlProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: { sql: '"name" IS DISTINCT FROM ?' },
    });
  });

  it("escapes LIKE metacharacters inside the bound pattern", () => {
    const checkedExpression = astToCheckedExpr(
      unwrapAst(strings.compile('name.contains("%_\\\\")')),
    );

    const outcome = createTranslator(new AnsiSqlProfile()).translate({
      checkedExpression,
    });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;
    expect(outcome.value.sql).toBe("\"name\" LIKE ? ESCAPE '\\'");
    expect(outcome.value.parameters[0]?.value?.kind).toEqual({
      case: "stringValue",
      value: "%\\%\\_\\\\%",
    });
  });

  it("rejects operations outside the dialect fragment during validation", () => {
    const checkedExpression = astToCheckedExpr(unwrapAst(strings.compile('name.matches("^a")')));

    expect(() => createTranslator(new AnsiSqlProfile()).validate({ checkedExpression })).toThrow(
      expect.objectContaining({ code: TranslationErrorCode.UNSUPPORTED_OVERLOAD }),
    );
  });

  it("rejects dialect configuration because ANSI SQL has none", () => {
    const checkedExpression = astToCheckedExpr(unwrapAst(strings.compile('name == "alice"')));

    expect(() =>
      createTranslator(new AnsiSqlProfile()).translate({
        checkedExpression,
        profileConfiguration: anyPack(EmptySchema, create(EmptySchema)),
      }),
    ).toThrow(
      expect.objectContaining({ code: TranslationErrorCode.INVALID_PROFILE_CONFIGURATION }),
    );
  });
});

describe("output growth", () => {
  // The growth limit counts Unicode code points, not UTF-16 code units. An
  // astral identifier separates the two: the emitted condition is 14 code
  // points but 15 code units, so a code-unit count would reject it at 14.
  const astralField = create(CheckedExprSchema, {
    expr: {
      id: 1n,
      exprKind: { case: "identExpr", value: create(Expr_IdentSchema, { name: "na\u{1F600}me" }) },
    },
    typeMap: {
      "1": create(TypeSchema, { typeKind: { case: "primitive", value: Type_PrimitiveType.BOOL } }),
    },
    referenceMap: { "1": create(ReferenceSchema, { name: "na\u{1F600}me" }) },
  });

  it("counts an astral character as one code point", () => {
    const outcome = createTranslator(new AnsiSqlProfile()).translate({
      checkedExpression: astralField,
      limits: create(TranslationLimitsSchema, { maxOutputGrowth: 14n }),
    });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: { sql: '"na\u{1F600}me" = TRUE' },
    });
  });

  it("rejects the same condition one code point below its length", () => {
    expect(() =>
      createTranslator(new AnsiSqlProfile()).translate({
        checkedExpression: astralField,
        limits: create(TranslationLimitsSchema, { maxOutputGrowth: 13n }),
      }),
    ).toThrowError(expect.objectContaining({ code: TranslationErrorCode.RESOURCE_LIMIT_EXCEEDED }));
  });
});
