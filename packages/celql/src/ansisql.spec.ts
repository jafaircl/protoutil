import { create } from "@bufbuild/protobuf";
import { anyPack, EmptySchema } from "@bufbuild/protobuf/wkt";
import { astToCheckedExpr, env, StringType, variable } from "@protoutil/cel";
import { describe, expect, it } from "vitest";
import { AnsiSqlDialect, createTranslator, TranslationErrorCode } from "./index.js";

const strings = env({ variables: [variable("name", StringType)] });

describe("ANSI SQL dialect", () => {
  it("binds constants instead of placing them in SQL", () => {
    const checkedExpression = astToCheckedExpr(
      strings.compile('name == "Robert\'); DROP TABLE users;--"'),
    );

    const outcome = createTranslator(AnsiSqlDialect).translate({
      checkedExpression,
    });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;
    expect(outcome.value.sql).toBe('"name" IS NOT DISTINCT FROM ?');
    expect(outcome.value.parameters[0]?.value?.kind).toEqual({
      case: "stringValue",
      value: "Robert'); DROP TABLE users;--",
    });
  });

  it("escapes LIKE metacharacters inside the bound pattern", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name.contains("%_\\\\")'));

    const outcome = createTranslator(AnsiSqlDialect).translate({
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
    const checkedExpression = astToCheckedExpr(strings.compile('name.matches("^a")'));

    expect(() => createTranslator(AnsiSqlDialect).validate({ checkedExpression })).toThrow(
      expect.objectContaining({ code: TranslationErrorCode.UNSUPPORTED_OVERLOAD }),
    );
  });

  it("rejects dialect configuration because ANSI SQL has none", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name == "alice"'));

    expect(() =>
      createTranslator(AnsiSqlDialect).translate({
        checkedExpression,
        profileConfiguration: anyPack(EmptySchema, create(EmptySchema)),
      }),
    ).toThrow(
      expect.objectContaining({ code: TranslationErrorCode.INVALID_PROFILE_CONFIGURATION }),
    );
  });
});
