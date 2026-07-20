import { describe, expect, it } from "vitest";
import { Config, TypeDesc, Variable } from "./env.js";
import { configFromYAML, configToYAML, parseTypeDesc } from "./io.js";

describe("common/env/io_test.go", () => {
  it("common/env/io_test.go/TestParseTypeDesc", () => {
    expect(parseTypeDesc("int").specifierFormat()).toBe("int");
    expect(parseTypeDesc("foo").specifierFormat()).toBe("foo");
    expect(parseTypeDesc(".com.example.Message").specifierFormat()).toBe(".com.example.Message");
    expect(parseTypeDesc("list<int>").specifierFormat()).toBe("list<int>");
    expect(parseTypeDesc(" list < int > ").specifierFormat()).toBe("list<int>");
    expect(parseTypeDesc("map<int, list<string>>").specifierFormat()).toBe(
      "map<int, list<string>>",
    );
  });

  it("common/env/io_test.go/TestParseTypeDescErrors", () => {
    const cases = [
      ["", "missing identifier"],
      ["int int", "unexpected character"],
      ["int>", "unexpected character"],
      [".foo.", "unexpected end of input"],
      ["..foo", "identifier is expected"],
      ["~", "unexpected end of input"],
      ["~1", "invalid type parameter identifier"],
      ["~elem", "invalid type param"],
      ["list<", "missing identifier"],
    ] as const;
    for (const [text, want] of cases) {
      expect(() => parseTypeDesc(text)).toThrow(want);
    }
  });

  it("common/env/io_test.go/TestConfigToYAML", () => {
    const yaml = configToYAML(
      new Config("foo").addVariables(new Variable("foo", new TypeDesc("int"))),
    );
    expect(yaml).toContain("name: foo");
    expect(yaml).toContain("type_name: int");
  });

  it("common/env/io_test.go/TestYAMLRoundTrip", () => {
    const cases = [
      `name: foo
variables:
  - name: foo
    type: int
`,
      `name: foo
variables:
  - name: foo
    type_name: int
`,
      `name: foo
variables:
  - name: foo
    type: map<int, string>
`,
      `name: foo
functions:
  - name: getOrDefault
    overloads:
      - id: getOrDefault
        target: map<string, ~V>
        args:
          - ~K
          - ~V
        return: ~V
`,
    ];
    for (const yamlIn of cases) {
      const config = configFromYAML(yamlIn);
      const yamlOut = configToYAML(config);
      expect(configFromYAML(yamlOut)).toEqual(config);
    }
  });
});
