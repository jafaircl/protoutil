import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { syncedCases } from "../common/spec-helpers.js";
import { YAMLHelper } from "./yaml.js";

/** YAMLHelperCase is one synchronized TestYAMLHelper row. */
interface YAMLHelperCase {
  /** name identifies the YAML shape under test. */
  name: string;
  /** yaml is the encoded value. */
  yaml: string;
}

describe("policy/yaml_test.go/TestYAMLHelper", () => {
  const helper = new YAMLHelper();
  for (const testCase of syncedCases<YAMLHelperCase>("policy/yaml_test.go/TestYAMLHelper")) {
    it(testCase.name, () => {
      const value = load(testCase.yaml);
      switch (testCase.name) {
        case "list":
          expect(helper.isList(value)).toBe(true);
          break;
        case "map":
          expect(helper.isMap(value)).toBe(true);
          break;
        case "string":
          expect(helper.isString(value)).toBe(true);
          break;
        case "bool":
          expect(helper.isBool(value)).toBe(true);
          break;
        case "null":
          expect(helper.isNull(value)).toBe(true);
          break;
        case "integer":
          expect(helper.isInteger(value)).toBe(true);
          break;
        case "double":
          expect(helper.isDouble(value)).toBe(true);
          break;
        case "timestamp":
          expect(helper.isTimestamp(value)).toBe(true);
          break;
        default:
          expect(helper.isNumber(value)).toBe(typeof value === "number");
      }
    });
  }
});
