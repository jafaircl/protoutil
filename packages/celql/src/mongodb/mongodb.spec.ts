import { toJson } from "@bufbuild/protobuf";
import {
  astToCheckedExpr,
  DynType,
  env,
  IntType,
  listType,
  StringType,
  UintType,
  variable,
} from "@protoutil/cel";
import { describe, expect, it } from "vitest";
import { type Value, ValueSchema } from "../gen/cel/expr/value_pb.js";
import {
  createTranslator,
  FullTextIndexType,
  GeoPointType,
  TranslationErrorCode,
} from "../index.js";
import { caseInsensitiveStrings, fullTextSearch, geospatial, MongoDbProfile } from "./index.js";

const fields = env({
  variables: [variable("name", StringType), variable("count", IntType)],
});
const fullTextFields = env({
  variables: [variable("search", FullTextIndexType), variable("name", StringType)],
  libraries: [fullTextSearch()],
});
const spatialFields = env({
  variables: [variable("location", GeoPointType)],
  libraries: [geospatial()],
});
const caseInsensitiveFields = env({
  variables: [variable("name", StringType), variable("count", IntType)],
  libraries: [caseInsensitiveStrings()],
});
const dynamicFields = env({ variables: [variable("value", DynType)] });
const unsignedFields = env({ variables: [variable("count", UintType)] });
const stringArrays = env({ variables: [variable("tags", listType(StringType))] });

describe("MongoDB profile", () => {
  it("keeps CEL constants as typed structured values", () => {
    const checkedExpression = astToCheckedExpr(fields.compile('name == "{ $ne: true }"'));
    const outcome = createTranslator(new MongoDbProfile()).translate({ checkedExpression });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;
    expect(toJson(ValueSchema, outcome.value.filter!)).toEqual({
      mapValue: {
        entries: [
          {
            key: { stringValue: "name" },
            value: {
              mapValue: {
                entries: [
                  {
                    key: { stringValue: "$eq" },
                    value: { stringValue: "{ $ne: true }" },
                  },
                ],
              },
            },
          },
        ],
      },
    });
  });

  it("escapes CEL string-pattern data before it becomes a MongoDB regex", () => {
    const checkedExpression = astToCheckedExpr(fields.compile('name.startsWith("a.*")'));
    const outcome = createTranslator(new MongoDbProfile()).translate({ checkedExpression });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;
    expect(toJson(ValueSchema, outcome.value.filter!)).toEqual({
      mapValue: {
        entries: [
          {
            key: { stringValue: "name" },
            value: {
              mapValue: {
                entries: [{ key: { stringValue: "$regex" }, value: { stringValue: "^a\\.\\*" } }],
              },
            },
          },
        ],
      },
    });
  });

  it("rejects CEL null instead of merging it with a missing MongoDB field", () => {
    const checkedExpression = astToCheckedExpr(dynamicFields.compile("value == null"));

    expect(() => createTranslator(new MongoDbProfile()).translate({ checkedExpression })).toThrow(
      /not supported by the MongoDB profile/,
    );
  });

  it("rejects a uint that cannot be represented as a signed BSON integer", () => {
    const checkedExpression = astToCheckedExpr(
      unsignedFields.compile("count == 9223372036854775808u"),
    );

    expect(() => createTranslator(new MongoDbProfile()).translate({ checkedExpression })).toThrow(
      /does not fit MongoDB's signed integer domain/,
    );
  });

  it("translates ASCII case-insensitive patterns through the selected library", () => {
    const checkedExpression = astToCheckedExpr(
      caseInsensitiveFields.compile('name.endsWithIgnoreCase("AdM.*")'),
    );
    const outcome = createTranslator(new MongoDbProfile(), {
      libraries: [caseInsensitiveStrings()],
    }).translate({ checkedExpression });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;
    expect(toJson(ValueSchema, outcome.value.filter!)).toEqual({
      mapValue: {
        entries: [
          {
            key: { stringValue: "name" },
            value: {
              mapValue: {
                entries: [
                  { key: { stringValue: "$regex" }, value: { stringValue: "AdM\\.\\*$" } },
                  { key: { stringValue: "$options" }, value: { stringValue: "i" } },
                ],
              },
            },
          },
        ],
      },
    });
  });

  it("uses BSON array equality for a string constant in an array field", () => {
    const checkedExpression = astToCheckedExpr(stringArrays.compile('"admin" in tags'));
    const outcome = createTranslator(new MongoDbProfile()).translate({ checkedExpression });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;
    expect(toJson(ValueSchema, outcome.value.filter!)).toEqual({
      mapValue: {
        entries: [
          {
            key: { stringValue: "tags" },
            value: {
              mapValue: {
                entries: [{ key: { stringValue: "$eq" }, value: { stringValue: "admin" } }],
              },
            },
          },
        ],
      },
    });
  });

  it("lowers equality-based exists over a BSON array field to array equality", () => {
    const checkedExpression = astToCheckedExpr(
      stringArrays.compile('tags.exists(tag, tag == "admin")'),
    );
    const outcome = createTranslator(new MongoDbProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({ case: "predicate" });
  });

  it("reverses an ordering comparison that places the constant on the left", () => {
    const checkedExpression = astToCheckedExpr(fields.compile("1 < count"));
    const outcome = createTranslator(new MongoDbProfile()).translate({ checkedExpression });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;
    expect(toJson(ValueSchema, outcome.value.filter!)).toEqual({
      mapValue: {
        entries: [
          {
            key: { stringValue: "count" },
            value: {
              mapValue: {
                entries: [{ key: { stringValue: "$gt" }, value: { int64Value: "1" } }],
              },
            },
          },
        ],
      },
    });
  });

  it("encodes literal membership as a typed MongoDB list", () => {
    const checkedExpression = astToCheckedExpr(fields.compile('name in ["a", "b"]'));
    const outcome = createTranslator(new MongoDbProfile()).translate({ checkedExpression });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;
    expect(toJson(ValueSchema, outcome.value.filter!)).toEqual({
      mapValue: {
        entries: [
          {
            key: { stringValue: "name" },
            value: {
              mapValue: {
                entries: [
                  {
                    key: { stringValue: "$in" },
                    value: { listValue: { values: [{ stringValue: "a" }, { stringValue: "b" }] } },
                  },
                ],
              },
            },
          },
        ],
      },
    });
  });

  it("translates a documented RE2 and MongoDB regex subset", () => {
    const checkedExpression = astToCheckedExpr(fields.compile('name.matches("^a")'));

    const outcome = createTranslator(new MongoDbProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        filter: {
          kind: {
            case: "mapValue",
            value: {
              entries: [
                {
                  key: { kind: { case: "stringValue", value: "name" } },
                  value: {
                    kind: {
                      case: "mapValue",
                      value: {
                        entries: [
                          {
                            key: { kind: { case: "stringValue", value: "$regex" } },
                            value: { kind: { case: "stringValue", value: "^a" } },
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    });
  });

  for (const pattern of ["^a.*", "^[a-z]{1,5}", "^a\\.b+"]) {
    it(`accepts the bounded MongoDB regex form ${pattern}`, () => {
      const checkedExpression = astToCheckedExpr(
        fields.compile(`name.matches(${JSON.stringify(pattern)})`),
      );

      expect(createTranslator(new MongoDbProfile()).translate({ checkedExpression })).toMatchObject(
        { case: "predicate" },
      );
    });
  }

  for (const pattern of ["^a+$", "(a|aa)+", "a.*b.*", "a\\q"]) {
    it(`rejects the MongoDB regex form ${pattern} outside the safe subset`, () => {
      const checkedExpression = astToCheckedExpr(
        fields.compile(`name.matches(${JSON.stringify(pattern)})`),
      );

      expect(() => createTranslator(new MongoDbProfile()).translate({ checkedExpression })).toThrow(
        expect.objectContaining({ code: TranslationErrorCode.UNSUPPORTED_EXPRESSION }),
      );
    });
  }

  it("searches every full-text query term as one $text phrase", () => {
    const checkedExpression = astToCheckedExpr(
      fullTextFields.compile('search.matchesText("error budget")'),
    );

    const outcome = createTranslator(new MongoDbProfile(), {
      libraries: [fullTextSearch()],
    }).translate({ checkedExpression });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;
    expect(toJson(ValueSchema, (outcome.value as { filter: Value }).filter)).toEqual({
      mapValue: {
        entries: [
          {
            key: { stringValue: "$text" },
            value: {
              mapValue: {
                entries: [
                  { key: { stringValue: "$search" }, value: { stringValue: '"error" "budget"' } },
                ],
              },
            },
          },
        ],
      },
    });
  });

  it("rejects a $text search that a conjunction does not reach", () => {
    const checkedExpression = astToCheckedExpr(
      fullTextFields.compile('!search.matchesText("error")'),
    );

    expect(() =>
      createTranslator(new MongoDbProfile(), { libraries: [fullTextSearch()] }).translate({
        checkedExpression,
      }),
    ).toThrow(expect.objectContaining({ code: TranslationErrorCode.UNSUPPORTED_EXPRESSION }));
  });

  it("bounds a distance with a centre sphere radius on the library's sphere", () => {
    const checkedExpression = astToCheckedExpr(
      spatialFields.compile("location.geoWithinDistance(geoPoint(0.0, 0.0), 637810.0)"),
    );

    const outcome = createTranslator(new MongoDbProfile(), {
      libraries: [geospatial()],
    }).translate({ checkedExpression });

    expect(outcome.case).toBe("predicate");
    if (outcome.case !== "predicate") return;
    expect(toJson(ValueSchema, (outcome.value as { filter: Value }).filter)).toEqual({
      mapValue: {
        entries: [
          {
            key: { stringValue: "location" },
            value: {
              mapValue: {
                entries: [
                  {
                    key: { stringValue: "$geoWithin" },
                    value: {
                      mapValue: {
                        entries: [
                          {
                            key: { stringValue: "$centerSphere" },
                            value: {
                              listValue: {
                                values: [
                                  {
                                    listValue: { values: [{ doubleValue: 0 }, { doubleValue: 0 }] },
                                  },
                                  { doubleValue: 0.1 },
                                ],
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });
  });

  it("rejects a position outside the WGS 84 coordinate ranges", () => {
    const checkedExpression = astToCheckedExpr(
      spatialFields.compile("location.geoWithinDistance(geoPoint(181.0, 0.0), 1000.0)"),
    );

    expect(() =>
      createTranslator(new MongoDbProfile(), { libraries: [geospatial()] }).translate({
        checkedExpression,
      }),
    ).toThrow(expect.objectContaining({ code: TranslationErrorCode.UNSUPPORTED_EXPRESSION }));
  });
});
