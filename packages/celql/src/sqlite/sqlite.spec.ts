import { astToCheckedExpr, DynType, env, listType, StringType, variable } from "@protoutil/cel";
import { describe, expect, it } from "vitest";
import { TranslationErrorCode } from "../gen/protoutil/celql/v1/celql_pb.js";
import { createTranslator, FullTextIndexType } from "../index.js";
import { caseInsensitiveStrings, fullTextSearch, SqliteProfile } from "./index.js";

const strings = env({ variables: [variable("name", StringType)] });
const caseInsensitiveString = env({
  variables: [variable("name", StringType)],
  libraries: [caseInsensitiveStrings()],
});
const dynamicStrings = env({ variables: [variable("name", DynType)] });
const stringArrays = env({
  variables: [variable("tags", listType(StringType))],
});
const fullText = env({
  variables: [variable("search", FullTextIndexType), variable("name", StringType)],
  libraries: [fullTextSearch()],
});

describe("SQLite profile", () => {
  it("uses SQLite total equality", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name == "alice"'));

    const outcome = createTranslator(new SqliteProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: '"name" IS ?',
        parameters: [{ value: { kind: { case: "stringValue", value: "alice" } } }],
      },
    });
  });

  it("uses SQLite total inequality", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name != "alice"'));

    const outcome = createTranslator(new SqliteProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: { sql: '"name" IS NOT ?' },
    });
  });

  it("emits a null literal without consuming a parameter position", () => {
    const checkedExpression = astToCheckedExpr(dynamicStrings.compile("name == null"));

    const outcome = createTranslator(new SqliteProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({ case: "predicate", value: { sql: '"name" IS NULL' } });
    if (outcome.case !== "predicate") return;
    expect(outcome.value.parameters).toEqual([]);
  });

  it("keeps literal pattern metacharacters in the bound value", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name.contains("%_\\\\")'));

    const outcome = createTranslator(new SqliteProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: "\"name\" LIKE ? ESCAPE '\\'",
        parameters: [{ value: { kind: { case: "stringValue", value: "%\\%\\_\\\\%" } } }],
      },
    });
  });

  it("uses one ordered parameter for each literal membership value", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name in ["a", "b"]'));

    const outcome = createTranslator(new SqliteProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: '("name" IS NOT NULL AND "name" IN (?, ?))',
        parameters: [
          { value: { kind: { case: "stringValue", value: "a" } } },
          { value: { kind: { case: "stringValue", value: "b" } } },
        ],
      },
    });
  });

  it("translates ASCII case-insensitive patterns through the selected library", () => {
    const checkedExpression = astToCheckedExpr(
      caseInsensitiveString.compile('name.startsWithIgnoreCase("AdM%")'),
    );
    const outcome = createTranslator(new SqliteProfile(), {
      libraries: [caseInsensitiveStrings()],
    }).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: "\"name\" LIKE ? ESCAPE '\\'",
        parameters: [{ value: { kind: { case: "stringValue", value: "AdM\\%%" } } }],
      },
    });
  });

  it("uses json_each for a string constant in a JSON array field", () => {
    const checkedExpression = astToCheckedExpr(stringArrays.compile('"admin" in tags'));
    const outcome = createTranslator(new SqliteProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: 'EXISTS (SELECT 1 FROM json_each("tags") AS "__celql_element" WHERE "__celql_element".value IS ?)',
        parameters: [{ value: { kind: { case: "stringValue", value: "admin" } } }],
      },
    });
  });

  it("lowers equality-based exists over a JSON array field to json_each", () => {
    const checkedExpression = astToCheckedExpr(
      stringArrays.compile('tags.exists(tag, tag == "admin")'),
    );
    const outcome = createTranslator(new SqliteProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: 'EXISTS (SELECT 1 FROM json_each("tags") AS "__celql_element" WHERE "__celql_element".value IS ?)',
      },
    });
  });

  it("requires every full-text query term through one FTS5 phrase conjunction", () => {
    const checkedExpression = astToCheckedExpr(
      fullText.compile('search.matchesText("error budget")'),
    );
    const outcome = createTranslator(new SqliteProfile(), {
      libraries: [fullTextSearch()],
    }).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: '"search" MATCH ?',
        parameters: [{ value: { kind: { case: "stringValue", value: '"error" AND "budget"' } } }],
      },
    });
  });

  it("rejects a full-text match that a conjunction does not reach", () => {
    const checkedExpression = astToCheckedExpr(
      fullText.compile('search.matchesText("error") || name == "alice"'),
    );
    const translate = () =>
      createTranslator(new SqliteProfile(), { libraries: [fullTextSearch()] }).translate({
        checkedExpression,
      });

    expect(translate).toThrowError(
      expect.objectContaining({ code: TranslationErrorCode.UNSUPPORTED_EXPRESSION }),
    );
  });
});
