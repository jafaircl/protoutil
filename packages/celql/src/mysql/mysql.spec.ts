import { astToCheckedExpr, DynType, env, listType, StringType, variable } from "@protoutil/cel";
import { describe, expect, it } from "vitest";
import { TranslationErrorCode } from "../gen/protoutil/celql/v1/celql_pb.js";
import { createTranslator, FullTextIndexType, GeoPointType } from "../index.js";
import { caseInsensitiveStrings, fullTextSearch, geospatial, MySqlProfile } from "./index.js";

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
  variables: [variable("search", FullTextIndexType)],
  libraries: [fullTextSearch()],
});
const spatial = env({
  variables: [variable("location", GeoPointType)],
  libraries: [geospatial()],
});

describe("MySQL profile", () => {
  it("is instantiated as an extensible profile", () => {
    class CustomMySqlProfile extends MySqlProfile {
      public override translate(
        ...args: Parameters<MySqlProfile["translate"]>
      ): ReturnType<MySqlProfile["translate"]> {
        const predicate = super.translate(...args);
        predicate.sql = `custom(${predicate.sql})`;
        return predicate;
      }
    }

    const checkedExpression = astToCheckedExpr(strings.compile('name == "alice"'));
    const outcome = createTranslator(new CustomMySqlProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({ case: "predicate", value: { sql: "custom(`name` <=> ?)" } });
  });

  it("uses backtick-delimited identifiers and null-safe equality", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name == "alice"'));

    const outcome = createTranslator(new MySqlProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: "`name` <=> ?",
        parameters: [{ value: { kind: { case: "stringValue", value: "alice" } } }],
      },
    });
  });

  it("uses the complement of null-safe equality for inequality", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name != "alice"'));

    const outcome = createTranslator(new MySqlProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: { sql: "NOT (`name` <=> ?)" },
    });
  });

  it("emits a null literal without consuming a parameter position", () => {
    const checkedExpression = astToCheckedExpr(dynamicStrings.compile("name == null"));

    const outcome = createTranslator(new MySqlProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({ case: "predicate", value: { sql: "`name` <=> NULL" } });
    if (outcome.case !== "predicate") return;
    expect(outcome.value.parameters).toEqual([]);
  });

  it("keeps literal pattern metacharacters in the bound value", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name.contains("%_\\\\")'));

    const outcome = createTranslator(new MySqlProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: "`name` LIKE ? ESCAPE '\\\\'",
        parameters: [{ value: { kind: { case: "stringValue", value: "%\\%\\_\\\\%" } } }],
      },
    });
  });

  it("uses one ordered parameter for each literal membership value", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name in ["a", "b"]'));

    const outcome = createTranslator(new MySqlProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: "(`name` IS NOT NULL AND `name` IN (?, ?))",
        parameters: [
          { value: { kind: { case: "stringValue", value: "a" } } },
          { value: { kind: { case: "stringValue", value: "b" } } },
        ],
      },
    });
  });

  it("translates ASCII case-insensitive patterns through the selected library", () => {
    const checkedExpression = astToCheckedExpr(
      caseInsensitiveString.compile('name.containsIgnoreCase("AdM%")'),
    );
    const outcome = createTranslator(new MySqlProfile(), {
      libraries: [caseInsensitiveStrings()],
    }).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: "LOWER(`name`) LIKE ? ESCAPE '\\\\'",
        parameters: [{ value: { kind: { case: "stringValue", value: "%adm\\%%" } } }],
      },
    });
  });

  it("uses JSON_CONTAINS for a string constant in a JSON array field", () => {
    const checkedExpression = astToCheckedExpr(stringArrays.compile('"admin" in tags'));
    const outcome = createTranslator(new MySqlProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: "JSON_CONTAINS(`tags`, JSON_ARRAY(?))",
        parameters: [{ value: { kind: { case: "stringValue", value: "admin" } } }],
      },
    });
  });

  it("requires every full-text query term through a boolean-mode index match", () => {
    const checkedExpression = astToCheckedExpr(
      fullText.compile('search.matchesText("error budget")'),
    );
    const outcome = createTranslator(new MySqlProfile(), {
      libraries: [fullTextSearch()],
    }).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: "MATCH (`search`) AGAINST (? IN BOOLEAN MODE)",
        parameters: [{ value: { kind: { case: "stringValue", value: "+error +budget" } } }],
      },
    });
  });

  it("rejects a full-text query outside the lowercase term domain", () => {
    const checkedExpression = astToCheckedExpr(fullText.compile('search.matchesText("Error!")'));
    const translate = () =>
      createTranslator(new MySqlProfile(), { libraries: [fullTextSearch()] }).translate({
        checkedExpression,
      });

    expect(translate).toThrowError(
      expect.objectContaining({ code: TranslationErrorCode.UNSUPPORTED_EXPRESSION }),
    );
  });

  it("lowers equality-based exists over a JSON array field to JSON_CONTAINS", () => {
    const checkedExpression = astToCheckedExpr(
      stringArrays.compile('tags.exists(tag, tag == "admin")'),
    );
    const outcome = createTranslator(new MySqlProfile()).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: { sql: "JSON_CONTAINS(`tags`, JSON_ARRAY(?))" },
    });
  });

  it("emits closed polygon containment as a spatial intersection", () => {
    const checkedExpression = astToCheckedExpr(
      spatial.compile(
        "location.geoWithin(geoPolygon([geoPoint(0.0, 0.0), geoPoint(20.0, 0.0), geoPoint(20.0, 30.0), geoPoint(0.0, 30.0), geoPoint(0.0, 0.0)]))",
      ),
    );
    const outcome = createTranslator(new MySqlProfile(), { libraries: [geospatial()] }).translate({
      checkedExpression,
    });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: "ST_Intersects(`location`, ST_GeomFromText(?, 4326, 'axis-order=long-lat'))",
        parameters: [
          {
            value: {
              kind: { case: "stringValue", value: "POLYGON((0 0, 20 0, 20 30, 0 30, 0 0))" },
            },
          },
        ],
      },
    });
  });

  it("prefilters a distance bound with an index-usable bounding rectangle", () => {
    const checkedExpression = astToCheckedExpr(
      spatial.compile("location.geoWithinDistance(geoPoint(0.0, 0.0), 637810.0)"),
    );
    const outcome = createTranslator(new MySqlProfile(), { libraries: [geospatial()] }).translate({
      checkedExpression,
    });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: "(MBRIntersects(`location`, ST_GeomFromText(?, 4326, 'axis-order=long-lat')) AND ST_Distance_Sphere(`location`, ST_GeomFromText(?, 4326, 'axis-order=long-lat'), 6378100) <= ?)",
      },
    });
    if (outcome.case !== "predicate") return;
    expect(outcome.value.parameters[0]?.value?.kind.value).toMatch(/^POLYGON\(\(/);
  });

  it("rejects a polygon ring that is not convex and counterclockwise", () => {
    const checkedExpression = astToCheckedExpr(
      spatial.compile(
        "location.geoWithin(geoPolygon([geoPoint(0.0, 0.0), geoPoint(0.0, 30.0), geoPoint(20.0, 30.0), geoPoint(20.0, 0.0), geoPoint(0.0, 0.0)]))",
      ),
    );
    const translate = () =>
      createTranslator(new MySqlProfile(), { libraries: [geospatial()] }).translate({
        checkedExpression,
      });

    expect(translate).toThrowError(
      expect.objectContaining({ code: TranslationErrorCode.UNSUPPORTED_EXPRESSION }),
    );
  });
});
