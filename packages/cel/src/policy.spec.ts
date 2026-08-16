import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { MessageShape } from "@bufbuild/protobuf";
import { getField } from "@protoutil/core";
import {
  file_cel_expr_conformance_proto3_test_all_types,
  TestAllTypesSchema,
} from "@protoutil/testing/cel/conformance/proto3";
import { describe, expect, it } from "vitest";
import { type Env, type EnvOptions, env, unwrapAst } from "./cel/env.js";
import { optionalTypes } from "./cel/library.js";
import { func, overload } from "./common/decls.js";
import { configFromYAML } from "./common/env/io.js";
import { isError } from "./common/types/err.js";
import { Optional } from "./common/types/optional.js";
import { registry } from "./common/types/provider.js";
import type { Val } from "./common/types/ref/reference.js";
import { String as CelString } from "./common/types/string.js";
import { StringType } from "./common/types/types.js";
import { bindings, lists, sets, strings, twoVarComprehensions } from "./ext/index.js";
import { compile } from "./policy/compiler.js";
import { fromConfig } from "./policy/config.js";
import {
  defaultTagVisitor,
  type MatchTagOptions,
  type PolicyTagOptions,
  parse,
  type RuleTagOptions,
  type TagVisitor,
} from "./policy/parser.js";
import { source as sourceFile } from "./policy/source.js";

/** isRecord reports whether a decoded YAML value is a string-keyed object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * k8sTestTagHandler returns a TagVisitor which handles custom policy tags used in K8s policies.
 *
 * This is a helper function to be used in tests.
 */
function k8sTestTagHandler(): TagVisitor {
  const fallback = defaultTagVisitor();
  return {
    policyTag: (options) => handlePolicyTag(options, fallback),
    ruleTag: (options) => handleRuleTag(options, fallback),
    matchTag: handleMatchTag,
    variableTag: fallback.variableTag,
  };
}

/** handlePolicyTag maps Kubernetes top-level fields into the canonical policy model. */
function handlePolicyTag(options: PolicyTagOptions, fallback: TagVisitor): void {
  switch (options.tagName) {
    case "kind":
      options.policy.setMetadata(
        "kind",
        options.context.stringValue(options.value, options.tagName).value,
      );
      return;
    case "metadata":
      if (!isRecord(options.value)) {
        options.context.reportErrorAtId(options.id, "invalid yaml metadata node");
      }
      return;
    case "spec":
      options.policy.setRule(
        options.context.parseRule({
          policy: options.policy,
          value: options.value,
          id: options.id,
        }),
      );
      return;
    default:
      fallback.policyTag(options);
  }
}

/** handleRuleTag maps Kubernetes spec fields into canonical rule fields. */
function handleRuleTag(options: RuleTagOptions, fallback: TagVisitor): void {
  switch (options.tagName) {
    case "failurePolicy":
      options.policy.setMetadata(
        options.tagName,
        options.context.stringValue(options.value, options.tagName).value,
      );
      return;
    case "matchConstraints":
      if (!isRecord(options.value)) {
        options.context.reportErrorAtId(options.id, "invalid yaml matchConstraints node");
      }
      return;
    case "validations":
      if (!Array.isArray(options.value)) {
        options.context.reportErrorAtId(options.id, "invalid 'validations' type, expected list");
        return;
      }
      for (const validation of options.value) {
        options.rule.addMatch(
          options.context.parseMatch({
            policy: options.policy,
            value: validation,
            id: options.context.nextId(),
          }),
        );
      }
      return;
    default:
      fallback.ruleTag(options);
  }
}

/** handleMatchTag maps Kubernetes validation expressions and messages into a policy match. */
function handleMatchTag(options: MatchTagOptions): void {
  if (!options.match.hasOutput()) {
    options.match.setOutput({ id: options.id, value: "'invalid admission request'" });
  }
  switch (options.tagName) {
    case "expression": {
      // The K8s expression to validate must return false in order to generate a violation message.
      const condition = options.context.stringValue(options.value, options.tagName);
      options.match.setCondition({
        id: condition.id,
        value: `!(${condition.value})`,
      });
      return;
    }
    case "messageExpression":
      options.match.setOutput(options.context.stringValue(options.value, options.tagName));
      return;
    default:
      options.context.reportErrorAtId(options.id, "unsupported match tag: %s", options.tagName);
  }
}

/** PolicyFailureCategory identifies the policy conformance phase which diverged. */
type PolicyFailureCategory =
  | "configuration"
  | "evaluation"
  | "expected"
  | "input"
  | "matcher"
  | "policy-compile"
  | "policy-parse";

/** PolicyDocument contains the source and parsed value of one synchronized YAML document. */
interface PolicyDocument {
  /** source is the exact upstream YAML document. */
  source: string;
  /** value is the canonical JSON-compatible representation of the YAML document. */
  value: unknown;
}

/** PolicyFixture contains every synchronized YAML document for an upstream policy suite. */
interface PolicyFixture {
  /** path is the canonical upstream suite path. */
  path: string;
  /** files maps upstream YAML filenames to synchronized documents. */
  files: Record<string, PolicyDocument>;
}

/** PolicyTestSuite is the YAML or textproto policy test suite shape used by cel-policy. */
interface PolicyTestSuite {
  /** name optionally identifies the suite independently of its path. */
  name?: string;
  /** description summarizes the suite. */
  description?: string;
  /** section is the original singular YAML spelling. */
  section?: PolicyTestSection[];
  /** sections is the current plural YAML spelling. */
  sections?: PolicyTestSection[];
}

/** PolicyTestSection groups related policy test cases. */
interface PolicyTestSection {
  /** name identifies the section. */
  name: string;
  /** tests contains the section's policy cases. */
  tests: PolicyTestCase[];
}

/** PolicyTestCase describes activation inputs and an expected policy outcome. */
interface PolicyTestCase {
  /** name identifies the policy case. */
  name: string;
  /** input maps CEL activation names to literal or expression inputs. */
  input?: Record<string, PolicyTestInput>;
  /** context_expr creates protobuf fields exposed as top-level activation names. */
  context_expr?: string;
  /** output describes a literal, CEL expression, or expected compile-error set. */
  output: PolicyTestOutput;
}

/** PolicyTestInput describes a literal or CEL expression activation value. */
interface PolicyTestInput {
  /** value is a literal activation value. */
  value?: unknown;
  /** expr is evaluated to produce an activation value. */
  expr?: string;
}

/** PolicyTestOutput describes the accepted result of one policy case. */
interface PolicyTestOutput {
  /** value is the expected literal result. */
  value?: unknown;
  /** expr is evaluated to produce the expected CEL result. */
  expr?: string;
  /** error_set contains message fragments expected from policy compilation. */
  error_set?: string[];
}

/** PolicyExecution identifies one synchronized policy test case. */
interface PolicyExecution {
  /** name is the canonical suite/section/case path. */
  name: string;
  /** fixture is the synchronized policy suite. */
  fixture: PolicyFixture;
  /** test is the upstream policy test case. */
  test: PolicyTestCase;
}

/** PolicyResult records whether a policy case passed and where a failure occurred. */
interface PolicyResult {
  /** execution identifies the evaluated case. */
  execution: PolicyExecution;
  /** failure is absent when the case conforms. */
  failure?: PolicyFailureCategory;
  /** detail contains a concise diagnostic for a non-conformant case. */
  detail?: string;
}

/** PolicySuiteSummary aggregates policy conformance results for one fixture suite. */
interface PolicySuiteSummary {
  /** name identifies the fixture suite. */
  name: string;
  /** total is the number of cases in the suite. */
  total: number;
  /** conformant is the number of passing cases in the suite. */
  conformant: number;
}

/** PreparedPolicy contains the environment and compiled policy program input. */
interface PreparedPolicy {
  /** environment is configured for the synchronized fixture. */
  environment: Env;
  /** ast is the successfully compiled policy AST. */
  ast: Parameters<Env["program"]>[0];
}

/** PolicySetupFailure records a parse, configuration, or compile preparation failure. */
interface PolicySetupFailure {
  /** category identifies the failed preparation phase. */
  category: "configuration" | "policy-compile" | "policy-parse";
  /** detail contains the diagnostic produced by the failed phase. */
  detail: string;
}

/** MatchPolicyResultOptions contains the values compared for one policy case. */
interface MatchPolicyResultOptions {
  /** actual is the evaluated policy value. */
  actual: Val;
  /** environment evaluates expression-based expectations and adapts literals. */
  environment: Env;
  /** output is the synchronized expected result. */
  output: PolicyTestOutput;
}

/** PolicyMatchResult records an expectation comparison and diagnostic detail. */
interface PolicyMatchResult {
  /** failure is absent when the actual and expected values conform. */
  failure?: "expected" | "matcher";
  /** detail summarizes divergent values or expectation evaluation errors. */
  detail?: string;
}

/** fixturesDirectory contains synchronized cel-policy JSON fixtures. */
const fixturesDirectory = resolve(import.meta.dirname, "../testdata/policy");

/** reportPath is the generated policy conformance dashboard. */
const reportPath = join(fixturesDirectory, "policy.md");

/** policyRevision is the pinned cel-policy revision synchronized by the Go command. */
const policyRevision = "40bf3666e43e07eddbda0665fae95d33e52b11be";

/** extensionOptions maps cel-policy configuration names to TypeScript CEL libraries. */
const extensionOptions: Record<string, EnvOptions> = {
  lists: { libraries: [lists()] },
  sets: { libraries: [sets()] },
  strings: { libraries: [strings()] },
  "two-var-comprehensions": { libraries: [twoVarComprehensions()] },
};

/**
 * locationCode implements the custom function supplied by the upstream conformance harness.
 */
function locationCode(ip: Val): Val {
  switch (ip.value()) {
    case "10.0.0.1":
      return new CelString("us");
    case "10.0.0.2":
      return new CelString("de");
    default:
      return new CelString("ir");
  }
}

/** locationCodeDeclaration declares and binds the upstream conformance helper function. */
function locationCodeDeclaration() {
  return func("locationCode", {
    overloads: [
      overload("locationCode_string", [StringType], StringType, {
        unaryBinding: locationCode,
      }),
    ],
  });
}

/** policyFixtures loads every synchronized cel-policy fixture in stable filename order. */
function policyFixtures(): PolicyFixture[] {
  return readdirSync(fixturesDirectory)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort()
    .map((fileName) =>
      JSON.parse(readFileSync(join(fixturesDirectory, fileName), "utf8")),
    ) as PolicyFixture[];
}

/** policyExecutions expands synchronized suites into canonical case executions. */
function policyExecutions(fixtures: PolicyFixture[]): PolicyExecution[] {
  const executions: PolicyExecution[] = [];
  for (const fixture of fixtures) {
    const suite = fixture.files["tests.yaml"]?.value as PolicyTestSuite | undefined;
    for (const section of suite?.section ?? suite?.sections ?? []) {
      for (const test of section.tests ?? []) {
        executions.push({
          name: `${fixture.path}/${section.name}/${test.name}`,
          fixture,
          test,
        });
      }
    }
  }
  return executions;
}

/** policyEnvironment creates the CEL environment used by an upstream policy fixture. */
function policyEnvironment(fixture: PolicyFixture): Env {
  const typeRegistry = registry();
  typeRegistry.registerDescriptor(file_cel_expr_conformance_proto3_test_all_types);
  const baseOptions: EnvOptions = {
    functions: [locationCodeDeclaration()],
    libraries: [optionalTypes(), bindings()],
    registry: typeRegistry,
  };
  const configSource = fixture.files["config.yaml"]?.source;
  if (configSource === undefined) {
    return env(baseOptions);
  }
  const configured = fromConfig(configFromYAML(configSource));
  return env({
    ...baseOptions,
    ...configured,
    configuration: {
      config: configured.configuration!.config,
      extensions: extensionOptions,
    },
  });
}

/** diagnosticMessage converts an unknown failure into a concise report message. */
function diagnosticMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** matchesErrorSet reports whether every expected fragment occurs in a diagnostic. */
function matchesErrorSet(message: string, expected: string[]): boolean {
  return expected.every((fragment) => message.includes(fragment));
}

/** setupFailureResults applies one parse or compile outcome to every case in a fixture. */
function setupFailureResults(
  executions: PolicyExecution[],
  options: { category: PolicyFailureCategory; detail: string },
): PolicyResult[] {
  return executions.map((execution) => {
    const expectedErrors = execution.test.output.error_set;
    if (expectedErrors && matchesErrorSet(options.detail, expectedErrors)) {
      return { execution };
    }
    return {
      execution,
      failure: options.category,
      detail: options.detail,
    };
  });
}

/** preparePolicy parses and compiles a synchronized policy fixture. */
function preparePolicy(fixture: PolicyFixture): PreparedPolicy | PolicySetupFailure {
  let environment: Env;
  try {
    environment = policyEnvironment(fixture);
  } catch (error) {
    return { category: "configuration", detail: diagnosticMessage(error) };
  }
  const source = fixture.files["policy.yaml"]?.source;
  if (source === undefined) {
    return {
      category: "policy-parse",
      detail: "synchronized fixture has no policy.yaml source",
    };
  }
  const parsed = parse(
    sourceFile(source, `${fixture.path}/policy.yaml`),
    fixture.path === "k8s" ? { tagVisitor: k8sTestTagHandler() } : {},
  );
  const parseError = parsed.issues.err();
  if (parseError || !parsed.policy) {
    return {
      category: "policy-parse",
      detail: parseError?.message ?? "policy was not produced",
    };
  }
  try {
    const compiled = compile(environment, parsed.policy);
    const compileError = compiled.issues.err();
    if (compileError || !compiled.ast) {
      return {
        category: "policy-compile",
        detail: compileError?.message ?? "AST was not produced",
      };
    }
    return { environment, ast: compiled.ast };
  } catch (error) {
    return {
      category: "policy-compile",
      detail: diagnosticMessage(error),
    };
  }
}

/** evaluateExpression evaluates one CEL expression in an empty activation. */
function evaluateExpression(environment: Env, expression: string): Val {
  return environment.program(unwrapAst(environment.compile(expression))).eval({});
}

/** caseBindings evaluates literal, expression, and protobuf-context activation inputs. */
function caseBindings(environment: Env, test: PolicyTestCase): Record<string, unknown> {
  const bindings: Record<string, unknown> = {};
  for (const [name, input] of Object.entries(test.input ?? {})) {
    bindings[name] =
      input.expr === undefined ? input.value : evaluateExpression(environment, input.expr);
  }
  if (test.context_expr !== undefined) {
    const context = evaluateExpression(environment, test.context_expr).value();
    if (typeof context !== "object" || context === null || !("$typeName" in context)) {
      throw new Error("context_expr did not evaluate to a protobuf message");
    }
    Object.assign(
      bindings,
      protobufContextBindings(context as MessageShape<typeof TestAllTypesSchema>),
    );
  }
  return bindings;
}

/**
 * protobufContextBindings adapts the upstream policy fixture context to its activation map.
 *
 * Policy configuration names a context type but does not retain its protobuf descriptor, so this
 * conformance harness supplies the registered fixture descriptor explicitly.
 */
function protobufContextBindings(
  message: MessageShape<typeof TestAllTypesSchema>,
): Record<string, unknown> {
  const bindings: Record<string, unknown> = {};
  for (const field of TestAllTypesSchema.fields) {
    bindings[field.name] = getField(message, field);
  }
  return bindings;
}

/** reportValue formats a CEL value without failing on bigint-backed primitives. */
function reportValue(value: Val): string {
  const raw = value.value();
  try {
    return JSON.stringify(raw, (_key, entry) => (typeof entry === "bigint" ? `${entry}n` : entry));
  } catch {
    return String(raw);
  }
}

/** matchPolicyResult compares an evaluated policy value with its synchronized expectation. */
function matchPolicyResult(options: MatchPolicyResultOptions): PolicyMatchResult {
  let expected: Val;
  if (options.output.error_set !== undefined) {
    return {
      failure: "matcher",
      detail: "policy compiled successfully but the case expected compilation errors",
    };
  }
  try {
    expected =
      options.output.expr === undefined
        ? options.environment.typeAdapter().nativeToValue(options.output.value)
        : evaluateExpression(options.environment, options.output.expr);
  } catch (error) {
    return { failure: "expected", detail: diagnosticMessage(error) };
  }
  // The upstream test runner implicitly unwraps a present optional policy result before matching
  // both literal and expression expectations.
  const actual =
    options.actual instanceof Optional && options.actual.hasValue()
      ? options.actual.getValue()
      : options.actual;
  const equal = actual.equal(expected);
  return equal.value() === true
    ? {}
    : {
        failure: "matcher",
        detail: `actual ${reportValue(actual)}; expected ${reportValue(expected)}`,
      };
}

/** executePolicyCase evaluates one prepared policy against a synchronized test case. */
function executePolicyCase(prepared: PreparedPolicy, execution: PolicyExecution): PolicyResult {
  let bindings: Record<string, unknown>;
  try {
    bindings = caseBindings(prepared.environment, execution.test);
  } catch (error) {
    return {
      execution,
      failure: "input",
      detail: diagnosticMessage(error),
    };
  }
  let actual: Val;
  try {
    actual = prepared.environment.program(prepared.ast).eval(bindings);
  } catch (error) {
    return {
      execution,
      failure: "evaluation",
      detail: diagnosticMessage(error),
    };
  }
  if (isError(actual)) {
    return {
      execution,
      failure: "evaluation",
      detail: diagnosticMessage(actual.value()),
    };
  }
  const matchResult = matchPolicyResult({
    actual,
    environment: prepared.environment,
    output: execution.test.output,
  });
  return matchResult.failure
    ? {
        execution,
        failure: matchResult.failure,
        detail: matchResult.detail,
      }
    : { execution };
}

/** executePolicyFixture prepares one policy once and evaluates every synchronized case. */
function executePolicyFixture(fixture: PolicyFixture): PolicyResult[] {
  const executions = policyExecutions([fixture]);
  const prepared = preparePolicy(fixture);
  if ("category" in prepared) {
    return setupFailureResults(executions, {
      category: prepared.category,
      detail: prepared.detail,
    });
  }
  return executions.map((execution) => executePolicyCase(prepared, execution));
}

/** percentage formats a policy conformance ratio with one decimal place. */
function percentage(conformant: number, total: number): string {
  return total === 0 ? "100.0%" : `${((conformant / total) * 100).toFixed(1)}%`;
}

/** policySuiteSummaries aggregates results by synchronized fixture suite. */
function policySuiteSummaries(results: PolicyResult[]): PolicySuiteSummary[] {
  const summaries = new Map<string, PolicySuiteSummary>();
  for (const result of results) {
    const name = result.execution.fixture.path;
    const summary = summaries.get(name) ?? { name, total: 0, conformant: 0 };
    summary.total += 1;
    if (!result.failure) {
      summary.conformant += 1;
    }
    summaries.set(name, summary);
  }
  return [...summaries.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/** markdownCell escapes a diagnostic for use in a single Markdown table cell. */
function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll(/\s+/g, " ").trim();
}

/** policyMarkdownReport renders the policy conformance dashboard and failing case list. */
function policyMarkdownReport(fixtures: PolicyFixture[], results: PolicyResult[]): string {
  const conformant = results.filter((result) => !result.failure).length;
  const failures = results.filter(
    (result): result is PolicyResult & { failure: PolicyFailureCategory } =>
      result.failure !== undefined,
  );
  const failureCounts = new Map<PolicyFailureCategory, number>();
  for (const failure of failures) {
    failureCounts.set(failure.failure, (failureCounts.get(failure.failure) ?? 0) + 1);
  }
  const lines = [
    "# CEL Policy Conformance Report",
    "",
    "Generated from the synchronized fixtures in `testdata/policy/*.json`.",
    "",
    `Pinned cel-policy revision: \`${policyRevision}\`.`,
    "",
    "## Summary",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Fixture suites | ${fixtures.length} |`,
    `| Total cases | ${results.length} |`,
    `| Conformant | ${conformant} |`,
    `| Non-conformant | ${failures.length} |`,
    `| Conformance | ${percentage(conformant, results.length)} |`,
    "",
    "## Failure categories",
    "",
    "| Category | Cases |",
    "| --- | ---: |",
  ];
  if (failureCounts.size === 0) {
    lines.push("| _None_ | 0 |");
  } else {
    for (const [category, count] of [...failureCounts].sort()) {
      lines.push(`| \`${category}\` | ${count} |`);
    }
  }
  lines.push(
    "",
    "## Suite results",
    "",
    "| Suite | Conformant | Non-conformant | Total | Conformance |",
    "| --- | ---: | ---: | ---: | ---: |",
  );
  for (const summary of policySuiteSummaries(results)) {
    lines.push(
      `| \`${summary.name}\` | ${summary.conformant} | ${summary.total - summary.conformant} | ${summary.total} | ${percentage(summary.conformant, summary.total)} |`,
    );
  }
  lines.push(
    "",
    "## Non-conformant cases",
    "",
    "| Case | Failure category | Detail |",
    "| --- | --- | --- |",
  );
  if (failures.length === 0) {
    lines.push("| _None_ | — | — |");
  } else {
    for (const failure of failures) {
      lines.push(
        `| \`${failure.execution.name}\` | \`${failure.failure}\` | ${markdownCell(failure.detail ?? "") || "—"} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

describe("conformance/policy/policy_conformance_test.go/TestMain", () => {
  it("discovers every synchronized policy fixture directory", () => {
    const fixtures = policyFixtures();

    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.every((fixture) => fixture.files["policy.yaml"] !== undefined)).toBe(true);
    expect(fixtures.every((fixture) => fixture.files["tests.yaml"] !== undefined)).toBe(true);
  });
});

describe("conformance/policy/policy_conformance_test.go/TestConformance", () => {
  it("executes synchronized fixtures and writes the policy conformance dashboard", () => {
    const fixtures = policyFixtures();
    const executions = policyExecutions(fixtures);
    const results = fixtures.flatMap(executePolicyFixture);
    const conformant = results.filter((result) => result.failure === undefined).length;
    const report = policyMarkdownReport(fixtures, results);

    writeFileSync(reportPath, report);

    expect(fixtures.length).toBeGreaterThan(0);
    expect(results).toHaveLength(executions.length);
    expect(executions.length).toBeGreaterThan(0);
    expect(conformant).toBe(results.length);
    expect(results.filter((result) => result.failure)).toHaveLength(0);
    expect(readFileSync(reportPath, "utf8")).toBe(report);
  });
});
