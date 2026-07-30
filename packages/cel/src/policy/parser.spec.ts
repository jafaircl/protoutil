import { describe, expect, it } from "vitest";
import { syncedCases } from "../common/spec-helpers.js";
import {
  type PolicyTagOptions,
  parse,
  parser,
  import as policyImport,
  source,
  type TagVisitor,
} from "./index.js";

/** ParseErrorCase is one synchronized TestParseError row. */
interface ParseErrorCase {
  /** txt is the YAML policy source. */
  txt: string;
  /** err is the exact upstream diagnostic. */
  err: string;
}

describe("policy/parser_test.go/TestParse", () => {
  it("exports concise parser names from the policy module", () => {
    expect(
      parser().parse(source("rule: { match: [{ output: 'true' }] }", "<input>")).policy,
    ).toBeDefined();
    expect(policyImport(1).sourceId()).toBe(1);
  });

  it("parses the canonical policy fields", () => {
    const result = parse(
      source(
        `name: greeting
imports:
  - name: example.Message
rule:
  variables:
    - name: greeting
      expression: "'hello'"
  match:
    - output: "variables.greeting"
`,
        "<input>",
      ),
    );
    expect(result.issues.err()).toBeUndefined();
    expect(result.policy?.name().value).toBe("greeting");
    expect(result.policy?.imports()[0]?.name().value).toBe("example.Message");
    expect(result.policy?.rule()?.variables()[0]?.name().value).toBe("greeting");
  });
});

describe("policy/parser_test.go/TestParseError", () => {
  for (const testCase of syncedCases<ParseErrorCase>("policy/parser_test.go/TestParseError")) {
    it(testCase.txt.trim().split("\n")[0] || "empty policy", () => {
      const result = parse(source(testCase.txt, "<input>"));
      const messages = result.issues
        .errors()
        .map((error) => error.message)
        .sort();
      const expectedMessages = [...testCase.err.matchAll(/^ERROR: .*?:\d+:\d+: (.*)$/gm)]
        .map((match) => match[1]!)
        .sort();
      expect(messages).toEqual(expectedMessages);
    });
  }
});

describe("policy/parser_test.go/TestGetExplanationOutputPolicy", () => {
  it("replaces nested and outer outputs with explanation expressions", () => {
    const result = parse(
      source(
        `rule:
  match:
    - condition: "false"
      rule:
        match:
          - condition: "1 > 2"
            output: "false"
            explanation: "'bad_inner'"
          - output: "true"
            explanation: "'good_inner'"
    - output: "true"
      explanation: "'good_outer'"
`,
        "<input>",
      ),
    );
    const explanation = result.policy!.explanationOutputPolicy();
    expect(explanation.rule()!.matches()[0]!.rule()!.matches()[0]!.output().value).toBe(
      "'bad_inner'",
    );
    expect(explanation.rule()!.matches()[1]!.output().value).toBe("'good_outer'");
  });
});

describe("policy/parser_test.go/TestCustomTagVisitor", () => {
  it("delegates custom policy fields and preserves metadata", () => {
    const visitor: TagVisitor = {
      policyTag(options: PolicyTagOptions): void {
        if (options.tagName !== "description") {
          options.policy.setMetadata(options.tagName, options.value);
        }
      },
      ruleTag(): void {},
      matchTag(): void {},
      variableTag(): void {},
    };
    const result = parse(
      source(
        `name: test
version: 2
rule:
  match:
    - output: "true"
`,
        "<input>",
      ),
      { tagVisitor: visitor },
    );
    expect(result.policy?.metadata("version")).toEqual([2, true]);
  });
});

describe("policy/parser_test.go/TestSimpleVariables", () => {
  it("parses one-entry variable mappings", () => {
    const result = parse(
      source(
        `name: test
rule:
  variables:
    - first: "1.5"
    - second: "2.5"
  match:
    - output: "variables.first + variables.second"
`,
        "<input>",
      ),
      { simpleVariables: true },
    );
    expect(result.issues.err()).toBeUndefined();
    expect(
      result.policy
        ?.rule()
        ?.variables()
        .map((value) => value.name().value),
    ).toEqual(["first", "second"]);
  });
});
