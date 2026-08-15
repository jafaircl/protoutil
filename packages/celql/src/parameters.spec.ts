import {
  astToCheckedExpr,
  env,
  IntType,
  StringType,
  TimestampType,
  variable,
} from "@protoutil/cel";
import { describe, expect, it } from "vitest";
import { AnsiSqlProfile } from "./ansisql/index.js";
import { createTranslator, parameterValues } from "./index.js";
import { MongoDbProfile, mongoDbFilter } from "./mongodb/index.js";
import { PostgreSqlProfile, postgreSqlParameters } from "./postgresql/index.js";

const fields = env({
  variables: [
    variable("name", StringType),
    variable("age", IntType),
    variable("created", TimestampType),
  ],
});
const source = 'name == "alice" && age > 21 && created > timestamp("2024-01-01T00:00:00Z")';

describe("predicate parameters", () => {
  it("converts every parameter to a JavaScript value in binding order", () => {
    const checkedExpression = astToCheckedExpr(fields.compile(source));
    const outcome = createTranslator(new AnsiSqlProfile()).translate({ checkedExpression });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;
    const values = parameterValues(outcome.value.parameters);

    expect(values[0]).toBe("alice");
    expect(values[1]).toBe(21n);
    expect(values[2]).toMatchObject({ seconds: 1_704_067_200n });
  });

  it("binds PostgreSQL values that the client accepts without conversion", () => {
    const checkedExpression = astToCheckedExpr(fields.compile(source));
    const outcome = createTranslator(new PostgreSqlProfile()).translate({ checkedExpression });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;

    expect(postgreSqlParameters(outcome.value)).toEqual([
      "alice",
      "21",
      "2024-01-01T00:00:00.000Z",
    ]);
  });

  it("converts a MongoDB predicate to a filter document", () => {
    const checkedExpression = astToCheckedExpr(fields.compile('name == "alice" && age > 21'));
    const outcome = createTranslator(new MongoDbProfile()).translate({ checkedExpression });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;

    expect(mongoDbFilter(outcome.value)).toEqual({
      $and: [{ name: { $eq: "alice" } }, { age: { $gt: 21n } }],
    });
  });
});
