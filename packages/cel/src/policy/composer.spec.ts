import { describe, expect, it } from "vitest";
import { composeRuleSource } from "./composer.js";
import { parsePolicy } from "./parser.js";
import { policySource } from "./source.js";

/** parsedRule returns a rule parsed from a YAML fixture. */
function parsedRule(source: string) {
  const result = parsePolicy(policySource(source, "<input>"));
  expect(result.issues.err()).toBeUndefined();
  return result.policy!.rule()!;
}

describe("policy/composer_test.go/TestCompose_SourceInfo", () => {
  it("composes ordered matches into one conditional expression", () => {
    const composed = composeRuleSource(
      parsedRule(`rule:
  match:
    - condition: "x"
      output: "1"
    - output: "2"
`),
    );
    expect(composed.expression).toBe("x ? 1 : 2");
    expect(composed.optional).toBe(false);
  });
});

describe("policy/composer_test.go/TestCompose_Unnest", () => {
  it("inlines ordered policy variables into the composed expression", () => {
    const composed = composeRuleSource(
      parsedRule(`rule:
  variables:
    - name: first
      expression: "1"
    - name: second
      expression: "variables.first + 1"
  match:
    - output: "variables.second + 1"
`),
    );
    expect(composed.expression).toBe("((1) + 1) + 1");
  });
});
