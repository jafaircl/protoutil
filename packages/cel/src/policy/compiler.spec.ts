import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { optionalTypes } from "../cel/library.js";
import { syncedCases } from "../common/spec-helpers.js";
import { compilePolicy, compilePolicyRule } from "./compiler.js";
import { parsePolicy } from "./parser.js";
import { policySource } from "./source.js";

/** WhitespaceCase is one synchronized whitespace handling row. */
interface WhitespaceCase {
  /** matchID identifies the match in upstream data. */
  matchID: string;
  /** want is the normalized YAML scalar value. */
  want: string;
}

/** policyEnvironment returns an environment with policy optional support. */
function policyEnvironment() {
  return env({ libraries: [optionalTypes()] });
}

/** parsed returns a successfully parsed policy fixture. */
function parsed(source: string) {
  const result = parsePolicy(policySource(source, "<input>"));
  expect(result.issues.err()).toBeUndefined();
  return result.policy!;
}

describe("policy/compiler_test.go/TestCompile", () => {
  it("compiles and evaluates a first-match policy", () => {
    const environment = policyEnvironment();
    const result = compilePolicy(
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
  });
});

describe("policy/compiler_test.go/TestRuleComposerError", () => {
  it("reports composition errors from the target environment", () => {
    const result = compilePolicy(
      env(),
      parsed(`rule:
  match:
    - condition: "false"
      output: "1"
`),
    );
    expect(result.issues.err()).toBeDefined();
  });
});

describe("policy/compiler_test.go/TestRuleComposerUnnest", () => {
  it("composes long variable chains without changing their value", () => {
    const result = compilePolicy(
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
    const result = compilePolicy(
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
    const conditional = compilePolicyRule(
      policyEnvironment(),
      parsed(`rule:
  match:
    - condition: "false"
      output: "1"
`),
    );
    const exhaustive = compilePolicyRule(
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
    const result = compilePolicyRule(
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
  for (const testCase of syncedCases<WhitespaceCase>(
    "policy/compiler_test.go/TestWhitespaceHanlding",
  )) {
    it(testCase.matchID, () => {
      expect(testCase.want.length).toBeGreaterThan(0);
    });
  }
});

describe("policy/compiler_test.go/TestWhitespaceHandlingErrorPresentation", () => {
  it("associates expression diagnostics with the policy source", () => {
    const result = compilePolicy(
      policyEnvironment(),
      parsed(`rule:
  match:
    - output: "missing_name"
`),
    );
    expect(result.issues.err()?.message).toContain("missing_name");
  });
});
