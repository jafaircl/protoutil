import { describe, expect, it } from "vitest";
import { astOutputType, env, unwrapAst } from "../cel/env.js";
import { optionalTypes } from "../cel/library.js";
import { variable } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { StringType } from "../common/types/types.js";
import { bindings } from "../ext/index.js";
import { compile, compileRule } from "./compiler.js";
import { composeRule } from "./composer.js";
import { parse } from "./parser.js";
import { source } from "./source.js";

/** WhitespaceCase is one synchronized whitespace handling row. */
interface WhitespaceCase {
  /** matchID identifies the match in upstream data. */
  matchID: string;
  /** want is the normalized YAML scalar value. */
  want: string;
}

/** whitespacePolicySource is the upstream YAML block-scalar policy. */
const whitespacePolicySource = `name: yaml_parsing

description: |
  A block literal description with mutliple lines.
   - line 2
   - line 3

rule:
  match:
    - condition: "match_id == 'folded_unambiguous'"
      output: >
        "a string expression that " +
        "is folded"
    - condition: "match_id == 'folded_line_break'"
      output: >
        '''a string expression that
        is folded'''
    - condition: "match_id == 'folded_line_break_indent'"
      output: >
          '''a string expression that
          is folded'''
    - condition: "match_id == 'literal_unambiguous'"
      output: |
          "a string expression that " +
          "is a literal block"
    - condition: "match_id == 'literal_line_break'"
      output: |
        '''a string expression that
        is a literal block'''
    - condition: "match_id == 'literal_line_break_indent'"
      output: |
          '''a string expression that
          is a literal block'''
    - output: "'no match encountered'"
`;

/** whitespaceErrorPolicySource is the upstream block-scalar diagnostic policy. */
const whitespaceErrorPolicySource = `name: yaml_parsing_cel_error

description: |
    A block literal description with mutliple lines.

rule:
  match:
    - condition: "match_id == 'folded_error_presentation'"
      output: >
        "foo" +
        ("bar" + 1)
    - condition: "match_id == 'folded_error_presentation_indent'"
      output: >
          "foo" +
          ("bar" + 1)
    - condition: "match_id == 'literal_error_presentation'"
      output: |
        "foo" +
        ("bar" + 1)
    - condition: "match_id == 'literal_error_presentation_indent'"
      output: |
          "foo" +
          ("bar" + 1)
    - output: "'no match encountered'"
`;

/** policyEnvironment returns an environment with policy optional support. */
function policyEnvironment() {
  return env({ libraries: [optionalTypes(), bindings()] });
}

/**
 * evaluatesTo reports whether a composed policy evaluates to the result of a CEL expression.
 *
 * Comparing through CEL equality keeps the assertion independent of which list implementation a
 * composed expression happens to produce.
 */
function evaluatesTo(
  environment: ReturnType<typeof policyEnvironment>,
  ast: Parameters<ReturnType<typeof policyEnvironment>["program"]>[0],
  activation: object,
  expected: string,
): boolean {
  const actual = environment.program(ast).eval(activation);
  const want = environment.program(unwrapAst(environment.compile(expected))).eval({});
  return actual.equal(want).value() === true;
}

/** parsed returns a successfully parsed policy fixture at an optional source location. */
function parsed(input: string, location = "<input>") {
  const result = parse(source(input, location));
  expect(result.issues.err()).toBeUndefined();
  return result.policy!;
}

describe("policy/compiler_test.go/TestCompile", () => {
  it("compiles and evaluates a first-match policy", () => {
    const environment = policyEnvironment();
    const result = compile(
      environment,
      parsed(`rule:
  match:
    - condition: "1 > 0"
      output: "'large'"
    - output: "'small'"
`),
    );
    expect(result.issues.err()).toBeUndefined();
    expect(result.ast).toBeDefined();
    expect(environment.program(result.ast!).eval({}).value()).toBe("large");
  });

  it("uses the compiled match output in the composed policy", () => {
    const environment = policyEnvironment();
    const result = compile(
      environment,
      parsed(`rule:
  match:
    - output: "1"
`),
      {
        matchOutputCompiler: {
          compile: ({ env: matchEnvironment }) => unwrapAst(matchEnvironment.compile("'custom'")),
        },
      },
    );

    expect(result.issues.err()).toBeUndefined();
    expect(environment.program(result.ast!).eval({}).value()).toBe("custom");
  });
});

describe("policy/compiler_test.go/TestRuleComposerError", () => {
  it("rejects a non-positive expression unnest height", () => {
    const environment = policyEnvironment();
    const result = compileRule(
      environment,
      parsed(`rule:
  match:
    - output: "1"
`),
    );
    expect(result.issues.err()).toBeUndefined();
    expect(() =>
      composeRule({
        env: environment,
        rule: result.rule!,
        options: { expressionUnnestHeight: -1 },
      }),
    ).toThrow("invalid unnest height");
  });
});

describe("policy/compiler_test.go/TestRuleComposerUnnest", () => {
  it("composes long variable chains without changing their value", () => {
    const result = compile(
      policyEnvironment(),
      parsed(`rule:
  variables:
    - name: a
      expression: "1"
    - name: b
      expression: "variables.a + 1"
  match:
    - output: "variables.b + 1"
`),
    );
    expect(result.issues.err()).toBeUndefined();
  });
});

describe("policy/compiler_test.go/TestCompileError", () => {
  it("reports incompatible output branch types", () => {
    const result = compile(
      policyEnvironment(),
      parsed(`rule:
  match:
    - condition: "1 > 0"
      output: "true"
    - output: "'true'"
`),
    );
    expect(result.issues.err()).toBeDefined();
  });
});

describe("policy/compiler_test.go/TestCompiledRuleHasOptionalOutput", () => {
  it("distinguishes conditional and exhaustive rules", () => {
    const conditional = compileRule(
      policyEnvironment(),
      parsed(`rule:
  match:
    - condition: "false"
      output: "1"
`),
    );
    const exhaustive = compileRule(
      policyEnvironment(),
      parsed(`rule:
  match:
    - output: "1"
`),
    );
    expect(conditional.rule?.hasOptionalOutput()).toBe(true);
    expect(exhaustive.rule?.hasOptionalOutput()).toBe(false);
  });
});

describe("policy/compiler_test.go/TestMaxNestedExpressions_Error", () => {
  it("enforces the global variable and nested-rule limit", () => {
    const result = compileRule(
      policyEnvironment(),
      parsed(`rule:
  variables:
    - name: a
      expression: "1"
    - name: b
      expression: "2"
  match:
    - output: "1"
`),
      { maxNestedExpressions: 1 },
    );
    expect(result.issues.err()?.message).toContain("variable exceeds nested expression limit");
  });
});

describe("policy/compiler_test.go/TestWhitespaceHanlding", () => {
  it("associates each block scalar with its containing match", () => {
    const matches = parsed(whitespacePolicySource).rule()!.matches();
    expect(
      matches.map((value) => [
        value.condition().value,
        value.output().value.includes("literal block") ? "literal" : "folded",
      ]),
    ).toEqual([
      ["match_id == 'folded_unambiguous'", "folded"],
      ["match_id == 'folded_line_break'", "folded"],
      ["match_id == 'folded_line_break_indent'", "folded"],
      ["match_id == 'literal_unambiguous'", "literal"],
      ["match_id == 'literal_line_break'", "literal"],
      ["match_id == 'literal_line_break_indent'", "literal"],
      ["true", "folded"],
    ]);
  });

  for (const testCase of syncedCases<WhitespaceCase>(
    "policy/compiler_test.go/TestWhitespaceHanlding",
  )) {
    it(testCase.matchID, () => {
      const environment = policyEnvironment().extend({
        variables: [variable("match_id", StringType)],
      });
      const result = compile(environment, parsed(whitespacePolicySource));

      expect(result.issues.err()).toBeUndefined();
      expect(environment.program(result.ast!).eval({ match_id: testCase.matchID }).value()).toBe(
        testCase.want,
      );
    });
  }
});

describe("policy/compiler_test.go/TestWhitespaceHandlingErrorPresentation", () => {
  it("associates every block-scalar diagnostic with its policy location", () => {
    const environment = policyEnvironment().extend({
      variables: [variable("match_id", StringType)],
    });
    const result = compile(
      environment,
      parsed(whitespaceErrorPolicySource, "testdata/yaml_parsing_cel_error/policy.yaml"),
    );
    const message = result.issues.err()?.message ?? "";

    expect(message).toContain("found no matching overload for '_+_' applied to '(string, int)'");
    expect(message).toContain("yaml_parsing_cel_error");
    expect(message).toContain('("bar" + 1)');
    expect(result.issues.errors()).toHaveLength(4);
  });
});

describe("policy/compiler.go/aggregate", () => {
  it("collects every matching choice into a list", () => {
    const environment = policyEnvironment().extend({
      variables: [variable("tag", StringType)],
    });
    const result = compile(
      environment,
      parsed(`rule:
  aggregate:
    - condition: "tag == 'pii'"
      output: "'PII'"
    - condition: "true"
      output: "'ALWAYS'"
`),
    );

    expect(result.issues.err()).toBeUndefined();
    expect(astOutputType(result.ast!).toString()).toBe("list(string)");
    expect(evaluatesTo(environment, result.ast!, { tag: "pii" }, "['PII', 'ALWAYS']")).toBe(true);
    expect(evaluatesTo(environment, result.ast!, { tag: "other" }, "['ALWAYS']")).toBe(true);
  });

  it("yields an empty list when no choice matches", () => {
    const environment = policyEnvironment();
    const result = compile(
      environment,
      parsed(`rule:
  aggregate:
    - condition: "1 == 2"
      output: "'NEVER'"
`),
    );

    expect(result.issues.err()).toBeUndefined();
    expect(evaluatesTo(environment, result.ast!, {}, "[]")).toBe(true);
  });

  it("rejects a rule which specifies both match and aggregate", () => {
    const result = parse(
      source(
        `rule:
  match:
    - output: "'a'"
  aggregate:
    - output: "'b'"
`,
        "<input>",
      ),
    );

    expect(result.issues.err()?.message).toContain(
      "rule must specify only one of match or aggregate",
    );
  });

  it("rejects an aggregate rule nested under another aggregate rule", () => {
    const result = compileRule(
      policyEnvironment(),
      parsed(`rule:
  aggregate:
    - rule:
        aggregate:
          - output: "'nested'"
`),
    );

    expect(result.issues.err()?.message).toContain("nested aggregate rules are not allowed");
  });

  it("rejects a choice which can never match", () => {
    const result = compileRule(
      policyEnvironment(),
      parsed(`rule:
  aggregate:
    - condition: "false"
      output: "'NEVER'"
`),
    );

    expect(result.issues.err()?.message).toContain("condition is always false");
  });

  it("keeps an ordered choice from making a later choice unreachable", () => {
    const result = compileRule(
      policyEnvironment(),
      parsed(`rule:
  aggregate:
    - condition: "true"
      output: "'FIRST'"
    - condition: "true"
      output: "'SECOND'"
`),
    );

    expect(result.issues.err()).toBeUndefined();
  });
});
