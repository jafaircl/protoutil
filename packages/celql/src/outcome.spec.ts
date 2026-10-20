import { astToCheckedExpr, BoolType, env, unwrapAst, variable } from "@protoutil/cel";
import { describe, expect, it } from "vitest";
import { type AnsiSqlPredicate, AnsiSqlProfile } from "./ansisql/index.js";
import { createTranslator, parameterValues, sqlQuery, sqlWhereClause } from "./index.js";
import { MongoDbProfile, mongoDbFilterForOutcome } from "./mongodb/index.js";

const flags = env({ variables: [variable("flag", BoolType)] });
const checked = (source: string) => astToCheckedExpr(unwrapAst(flags.compile(source)));

describe("sqlWhereClause", () => {
  it("restricts a constant outcome instead of leaving the query unfiltered", () => {
    const translator = createTranslator(new AnsiSqlProfile());

    expect(sqlWhereClause(translator.translate({ checkedExpression: checked("true") }))).toBe(
      "TRUE",
    );
    expect(sqlWhereClause(translator.translate({ checkedExpression: checked("false") }))).toBe(
      "FALSE",
    );
  });

  it("returns the predicate condition for a record-dependent expression", () => {
    const outcome = createTranslator(new AnsiSqlProfile()).translate({
      checkedExpression: checked("flag"),
    });

    expect(sqlWhereClause(outcome)).toBe('"flag" = TRUE');
  });

  it("uses caller conditions for a dialect without Boolean literals", () => {
    const outcome = createTranslator(new AnsiSqlProfile()).translate({
      checkedExpression: checked("false"),
    });

    expect(sqlWhereClause(outcome, { matchAll: "1 = 1", matchNone: "1 = 0" })).toBe("1 = 0");
  });
});

describe("sqlQuery", () => {
  const bind = (predicate: AnsiSqlPredicate) => parameterValues(predicate.parameters);

  it("binds no parameter for a constant outcome", () => {
    const outcome = createTranslator(new AnsiSqlProfile()).translate({
      checkedExpression: checked("true"),
    });

    expect(sqlQuery(outcome, bind)).toEqual({ sql: "TRUE", parameters: [] });
  });

  it("carries the predicate parameters in binding order", () => {
    const fields = env({ variables: [variable("flag", BoolType)] });
    const outcome = createTranslator(new AnsiSqlProfile()).translate({
      checkedExpression: astToCheckedExpr(unwrapAst(fields.compile("flag == true"))),
    });

    const query = sqlQuery(outcome, bind);
    expect(query.sql).toContain('"flag"');
    expect(query.parameters).toEqual([true]);
  });
});

describe("mongoDbFilterForOutcome", () => {
  it("maps the constant outcomes to select-every and select-none filters", () => {
    const translator = createTranslator(new MongoDbProfile());

    expect(
      mongoDbFilterForOutcome(translator.translate({ checkedExpression: checked("true") })),
    ).toEqual({});
    expect(
      mongoDbFilterForOutcome(translator.translate({ checkedExpression: checked("false") })),
    ).toEqual({ $nor: [{}] });
  });
});
