import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { astToString } from "../cel/io.js";
import { optionalTypes } from "../cel/library.js";
import { bindings } from "../ext/index.js";
import { compileRule } from "./compiler.js";
import { composeRule } from "./composer.js";
import { parse } from "./parser.js";
import { source } from "./source.js";

/** policyEnvironment returns the cel-go policy compiler environment. */
function policyEnvironment() {
  return env({ libraries: [optionalTypes(), bindings()] });
}

/** compiledRule parses and compiles a policy rule for composer tests. */
function compiledRule(input: string) {
  const parsed = parse(source(input, "test-policy.yaml"));
  expect(parsed.issues.err()).toBeUndefined();
  const compiled = compileRule(policyEnvironment(), parsed.policy!);
  expect(compiled.issues.err()).toBeUndefined();
  return compiled.rule!;
}

describe("policy/composer_test.go/TestCompose_SourceInfo", () => {
  it("composes checked expressions and transfers their source metadata", () => {
    const environment = policyEnvironment();
    const composed = composeRule({
      env: environment,
      rule: compiledRule(`name: test_policy
rule:
  match:
    - condition: "2 == 1"
      output: "'hi'"
    - output: "'hello' + ' world'"
`),
    });

    expect(astToString(composed)).toBe(`(2 == 1) ? "hi" : ("hello" + " world")`);
    expect(composed.source()?.description()).toBe("test-policy.yaml");
    expect(composed.source()?.content()).toContain("name: test_policy");
    expect(composed.sourceInfo().offsetRanges().size).toBeGreaterThan(0);
    expect(environment.program(composed).eval({}).value()).toBe("hello world");
  });
});

describe("policy/composer_test.go/TestCompose_Unnest", () => {
  it("stores policy variables in lazy block slots", () => {
    const environment = policyEnvironment();
    const composed = composeRule({
      env: environment,
      rule: compiledRule(`name: unnest
rule:
  variables:
    - name: first
      expression: "1"
    - name: second
      expression: "variables.first + 1"
  match:
    - output: "variables.second + 1"
`),
    });

    expect(astToString(composed)).toContain("cel.@block");
    expect(astToString(composed)).toContain("@index0");
    expect(astToString(composed)).toContain("@index1");
    expect(environment.program(composed).eval({}).value()).toBe(3n);
  });

  it("extracts deeply nested calls at the configured expression height", () => {
    const environment = policyEnvironment();
    const composed = composeRule({
      env: environment,
      rule: compiledRule(`name: unnest
rule:
  match:
    - output: "(((1 + 2) + 3) + 4) + 5"
`),
      options: { expressionUnnestHeight: 1 },
    });

    expect(astToString(composed)).toContain("cel.@block");
    expect(astToString(composed)).toContain("@index0");
    expect(environment.program(composed).eval({}).value()).toBe(15n);
  });
});
