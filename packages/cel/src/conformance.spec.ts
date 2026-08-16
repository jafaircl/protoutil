import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRegistry, fromJson } from "@bufbuild/protobuf";
import {
  file_google_protobuf_any,
  file_google_protobuf_duration,
  file_google_protobuf_empty,
  file_google_protobuf_field_mask,
  file_google_protobuf_struct,
  file_google_protobuf_timestamp,
  file_google_protobuf_wrappers,
} from "@bufbuild/protobuf/wkt";
import { file_cel_expr_conformance_proto2_test_all_types } from "@protoutil/testing/cel/conformance/proto2";
import { file_cel_expr_conformance_proto2_test_all_types_extensions } from "@protoutil/testing/cel/conformance/proto2-extensions";
import { file_cel_expr_conformance_proto3_test_all_types } from "@protoutil/testing/cel/conformance/proto3";
import {
  type SimpleTest,
  type SimpleTestFile,
  SimpleTestFileSchema,
} from "@protoutil/testing/cel/conformance/test/simple";
import { describe, expect, it } from "vitest";
import { declarationFromProto } from "./cel/decls.js";
import { astOutputType, type Env, env } from "./cel/env.js";
import { refValueToValue, valueToRefValue } from "./cel/io.js";
import type { Library, SingletonLibrary } from "./cel/library.js";
import { optionalTypes } from "./cel/library.js";
import { type Expr, ExprKind } from "./common/ast/index.js";
import { container } from "./common/containers.js";
import { type FunctionDecl, VariableDecl, variable } from "./common/decls.js";
import { Bool } from "./common/types/bool.js";
import { isError } from "./common/types/err.js";
import { registry } from "./common/types/provider.js";
import type { Val } from "./common/types/ref/reference.js";
import { DynType, exprTypeToType } from "./common/types/types.js";
import { isUnknown, type Unknown } from "./common/types/unknown.js";
import {
  bindings,
  encoders,
  lists,
  math,
  network,
  protos,
  strings,
  twoVarComprehensions,
} from "./ext/index.js";
import type { MapValue_Entry, Value } from "./gen/cel/expr/value_pb.js";
import { receiverMacro } from "./parser/macro.js";
import type { ExprHelper } from "./parser/options.js";

/** FailureCategory identifies the conformance phase which diverged. */
type FailureCategory =
  | "activation"
  | "check"
  | "environment"
  | "evaluation"
  | "matcher"
  | "parse"
  | "plan"
  | "type"
  | "value";

/** ConformanceExecution identifies one generated SimpleTest and its canonical path. */
interface ConformanceExecution {
  /** name is the suite/section/case path. */
  name: string;
  /** suite is the top-level fixture name. */
  suite: string;
  /** section is the nested fixture section name. */
  section: string;
  /** test is the generated protobuf test message. */
  test: SimpleTest;
}

/** ConformanceResult records whether a case passed and where a failure occurred. */
interface ConformanceResult {
  /** execution identifies the evaluated case. */
  execution: ConformanceExecution;
  /** failure is absent when the case conforms. */
  failure?: FailureCategory;
}

/** SuiteSummary aggregates conformance results for one fixture suite. */
interface SuiteSummary {
  /** name identifies the fixture suite. */
  name: string;
  /** total is the number of cases in the suite. */
  total: number;
  /** conformant is the number of passing cases in the suite. */
  conformant: number;
}

/** fixturesDirectory contains synchronized CEL spec conformance JSON. */
const fixturesDirectory = resolve(import.meta.dirname, "../testdata/conformance");

/** reportPath is the generated CEL conformance dashboard. */
const reportPath = join(fixturesDirectory, "conformance.md");

/** extensionSuites identifies fixtures which require CEL extension libraries or macros. */
const extensionSuites = new Set([
  "bindings_ext",
  "block_ext",
  "encoders_ext",
  "lists_ext",
  "macros2",
  "math_ext",
  "network_ext",
  "proto2_ext",
  "string_ext",
]);

/** skippedConformanceTests lists cases that should be ignored ignores. */
const skippedConformanceTests = new Map([
  // The synchronized fixture retains deprecated duration component semantics.
  [
    "timestamps/duration_converters/get_milliseconds",
    "upstream fixture expects fractional milliseconds; cel-go returns total milliseconds",
  ],

  // These synchronized fixtures have not yet incorporated cel-go's out-of-range search behavior.
  [
    "string_ext/value_errors/indexof_out_of_range",
    "upstream fixture expects an error; cel-go returns -1",
  ],
  [
    "string_ext/value_errors/lastindexof_out_of_range",
    "upstream fixture expects an error; cel-go returns -1",
  ],
]);

/**
 * Determines whether a synchronized conformance test should be skipped, and if so, returns the reason.
 * @param name is the canonical suite/section/case path.
 * @returns the reason for skipping, or undefined if the test should be run.
 */
function shouldSkipTest(name: string): string | undefined {
  for (const skipped of skippedConformanceTests.keys()) {
    if (name === skipped || name.startsWith(`${skipped}/`)) {
      return skippedConformanceTests.get(skipped)!;
    }
  }
  return undefined;
}

/** protobufRegistry resolves Any JSON values used by protobuf conformance cases. */
const protobufRegistry = createRegistry(
  file_google_protobuf_any,
  file_google_protobuf_duration,
  file_google_protobuf_empty,
  file_google_protobuf_field_mask,
  file_google_protobuf_struct,
  file_google_protobuf_timestamp,
  file_google_protobuf_wrappers,
  file_cel_expr_conformance_proto2_test_all_types,
  file_cel_expr_conformance_proto2_test_all_types_extensions,
  file_cel_expr_conformance_proto3_test_all_types,
);

/**
 * conformanceEnvironment creates the cel-go conformance environment available in TypeScript.
 */
function conformanceEnvironment(execution: ConformanceExecution): Env {
  const typeRegistry = registry();
  typeRegistry.registerDescriptor(file_cel_expr_conformance_proto2_test_all_types);
  typeRegistry.registerDescriptor(file_cel_expr_conformance_proto2_test_all_types_extensions);
  typeRegistry.registerDescriptor(file_cel_expr_conformance_proto3_test_all_types);
  typeRegistry.withStrongEnums(execution.section.startsWith("strong_"));
  return env({
    errorOnBadPresenceTest: true,
    libraries: conformanceLibraries(execution.suite),
    macros: execution.test.disableMacros ? { standard: false } : undefined,
    parser: { enableIdentEscapeSyntax: true },
    registry: typeRegistry,
  });
}

/**
 * conformanceLibraries returns the CEL libraries required by one synchronized fixture suite.
 */
function conformanceLibraries(suite: string): Library[] {
  const libraries: Library[] = [optionalTypes()];
  switch (suite) {
    case "bindings_ext":
      libraries.push(bindings());
      break;
    case "block_ext":
      libraries.push(bindings(), conformanceBlockLibrary());
      break;
    case "encoders_ext":
      libraries.push(encoders());
      break;
    case "lists_ext":
      libraries.push(lists());
      break;
    case "macros2":
      libraries.push(twoVarComprehensions());
      break;
    case "math_ext":
      libraries.push(math());
      break;
    case "network_ext":
      // The synchronized conformance fixture asserts constructor failures at evaluation time.
      libraries.push(network({ validateLiterals: false }));
      break;
    case "proto2_ext":
      libraries.push(protos());
      break;
    case "string_ext":
      libraries.push(strings());
      break;
  }
  return libraries;
}

/**
 * conformanceBlockLibrary simulates indexed block arguments which normally receive strong types
 * during a static optimization pass.
 */
function conformanceBlockLibrary(): SingletonLibrary {
  return {
    libraryName: "cel.lib.ext.cel.block.conformance",
    compileOptions: {
      macros: {
        custom: [
          receiverMacro("block", 2, expandConformanceBlock),
          receiverMacro("index", 1, expandConformanceIndex),
          receiverMacro("iterVar", 2, expandConformanceIterVariable),
          receiverMacro("accuVar", 2, expandConformanceAccuVariable),
        ],
      },
      variables: Array.from({ length: 30 }, (_unused, index) =>
        variable(`@index${index}`, DynType),
      ),
    },
    programOptions: {},
  };
}

/** expandConformanceBlock converts `cel.block` into the internal bindings block call. */
function expandConformanceBlock(
  helper: ExprHelper,
  target: Expr | undefined,
  args: Expr[],
): Expr | Error | undefined {
  if (!isCelNamespace(target)) {
    return undefined;
  }
  if (args[0]?.kind() !== ExprKind.List) {
    return helper.error(
      args[0]?.id() ?? 0,
      "cel.block requires the first arg to be a list literal",
    );
  }
  return helper.call("cel.@block", ...args);
}

/** expandConformanceIndex converts `cel.index(n)` to the indexed block variable. */
function expandConformanceIndex(
  helper: ExprHelper,
  target: Expr | undefined,
  args: Expr[],
): Expr | Error | undefined {
  if (!isCelNamespace(target)) {
    return undefined;
  }
  const index = nonNegativeIntLiteral(args[0]);
  return index === undefined
    ? helper.error(args[0]?.id() ?? 0, "cel.index requires a single non-negative int constant arg")
    : helper.ident(`@index${index}`);
}

/** expandConformanceIterVariable converts `cel.iterVar(depth, id)` to its hidden identifier. */
function expandConformanceIterVariable(
  helper: ExprHelper,
  target: Expr | undefined,
  args: Expr[],
): Expr | Error | undefined {
  return expandConformanceVariable({
    args,
    functionName: "cel.iterVar",
    helper,
    prefix: "@it",
    target,
  });
}

/** expandConformanceAccuVariable converts `cel.accuVar(depth, id)` to its hidden identifier. */
function expandConformanceAccuVariable(
  helper: ExprHelper,
  target: Expr | undefined,
  args: Expr[],
): Expr | Error | undefined {
  return expandConformanceVariable({
    args,
    functionName: "cel.accuVar",
    helper,
    prefix: "@ac",
    target,
  });
}

/** expandConformanceVariable converts a synchronized comprehension-variable reference. */
function expandConformanceVariable(options: {
  args: Expr[];
  functionName: string;
  helper: ExprHelper;
  prefix: string;
  target: Expr | undefined;
}): Expr | Error | undefined {
  if (!isCelNamespace(options.target)) {
    return undefined;
  }
  const depth = nonNegativeIntLiteral(options.args[0]);
  const unique = nonNegativeIntLiteral(options.args[1]);
  if (depth === undefined || unique === undefined) {
    return options.helper.error(
      options.args[depth === undefined ? 0 : 1]?.id() ?? 0,
      `${options.functionName} requires two non-negative int constant args`,
    );
  }
  return options.helper.ident(`${options.prefix}:${depth}:${unique}`);
}

/** isCelNamespace reports whether a macro receiver is the `cel` namespace identifier. */
function isCelNamespace(target: Expr | undefined): boolean {
  return target?.kind() === ExprKind.Ident && target.asIdent() === "cel";
}

/** nonNegativeIntLiteral returns a non-negative CEL integer literal as a native bigint. */
function nonNegativeIntLiteral(expression: Expr | undefined): bigint | undefined {
  if (expression?.kind() !== ExprKind.Literal) {
    return undefined;
  }
  const value = expression.asLiteral();
  return typeof value === "bigint" && value >= 0n ? value : undefined;
}

/**
 * conformanceCases decodes every synchronized fixture through its generated protobuf schema.
 */
function conformanceCases(): {
  executions: ConformanceExecution[];
  skipped: Record<string, string>;
} {
  const executions: ConformanceExecution[] = [];
  const skipped: Record<string, string> = {};
  const files = readdirSync(fixturesDirectory)
    .filter((name) => name.endsWith(".textproto.json"))
    .sort();
  for (const fileName of files) {
    const file = fromJson(
      SimpleTestFileSchema,
      JSON.parse(readFileSync(join(fixturesDirectory, fileName), "utf8")),
      { registry: protobufRegistry },
    );
    appendFileCases(executions, skipped, file);
  }
  return { executions, skipped };
}

/**
 * appendFileCases flattens one generated SimpleTestFile into canonical executions.
 */
function appendFileCases(
  executions: ConformanceExecution[],
  skipped: Record<string, string>,
  file: SimpleTestFile,
): void {
  for (const section of file.section) {
    for (const test of section.test) {
      const name = `${file.name}/${section.name}/${test.name}`;
      const reason = shouldSkipTest(name);
      if (reason) {
        skipped[name] = reason;
        continue;
      }
      executions.push({
        name,
        suite: file.name,
        section: section.name,
        test,
      });
    }
  }
}

/**
 * configuredEnvironment applies a test's namespace and canonical declarations.
 */
function configuredEnvironment(base: Env, test: SimpleTest): Env {
  const variables: VariableDecl[] = [];
  const functions: FunctionDecl[] = [];
  for (const declarationMessage of test.typeEnv) {
    const declaration = declarationFromProto(declarationMessage);
    if (declaration instanceof VariableDecl) {
      variables.push(declaration);
    } else {
      functions.push(declaration);
    }
  }
  return base.extend({
    container: test.container ? container({ name: test.container }) : undefined,
    functions,
    variables,
  });
}

/**
 * activationBindings converts generated ExprValue bindings into CEL runtime values.
 */
function activationBindings(environment: Env, test: SimpleTest): Record<string, unknown> {
  const bindings: Record<string, unknown> = {};
  for (const [name, expressionValue] of Object.entries(test.bindings)) {
    if (expressionValue.kind.case !== "value") {
      throw new Error(`unsupported activation ExprValue kind: ${expressionValue.kind.case}`);
    }
    bindings[name] = valueToRefValue(environment.typeAdapter(), expressionValue.kind.value);
  }
  return bindings;
}

/**
 * valuesEqual implements the conformance Value comparison contract.
 *
 * Maps compare without regard to entry order, and all NaN values compare equal.
 */
function valuesEqual(actual: Value, expected: Value): boolean {
  if (actual.kind.case !== expected.kind.case) {
    return false;
  }
  if (actual.kind.case === "doubleValue" && expected.kind.case === "doubleValue") {
    return (
      (Number.isNaN(actual.kind.value) && Number.isNaN(expected.kind.value)) ||
      actual.kind.value === expected.kind.value
    );
  }
  if (actual.kind.case === "listValue" && expected.kind.case === "listValue") {
    const actualValues = actual.kind.value.values;
    const expectedValues = expected.kind.value.values;
    return (
      actualValues.length === expectedValues.length &&
      actualValues.every((value, index) => valuesEqual(value, expectedValues[index]!))
    );
  }
  if (actual.kind.case === "mapValue" && expected.kind.case === "mapValue") {
    return mapValuesEqual(actual.kind.value.entries, expected.kind.value.entries);
  }
  return scalarValuesEqual(actual, expected);
}

/**
 * mapValuesEqual compares CEL map entries independent of their serialized order.
 */
function mapValuesEqual(actual: MapValue_Entry[], expected: MapValue_Entry[]): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  const unmatched = [...actual];
  for (const expectedEntry of expected) {
    const matchIndex = unmatched.findIndex(
      (actualEntry) =>
        actualEntry.key !== undefined &&
        expectedEntry.key !== undefined &&
        actualEntry.value !== undefined &&
        expectedEntry.value !== undefined &&
        valuesEqual(actualEntry.key, expectedEntry.key) &&
        valuesEqual(actualEntry.value, expectedEntry.value),
    );
    if (matchIndex < 0) {
      return false;
    }
    unmatched.splice(matchIndex, 1);
  }
  return true;
}

/**
 * scalarValuesEqual compares scalar, enum, object, and type values structurally.
 */
function scalarValuesEqual(actual: Value, expected: Value): boolean {
  switch (actual.kind.case) {
    case "nullValue":
      return expected.kind.case === "nullValue";
    case "boolValue":
    case "int64Value":
    case "uint64Value":
    case "stringValue":
    case "typeValue":
      return expected.kind.case === actual.kind.case && expected.kind.value === actual.kind.value;
    case "bytesValue":
      return (
        expected.kind.case === "bytesValue" && bytesEqual(actual.kind.value, expected.kind.value)
      );
    case "enumValue":
      return (
        expected.kind.case === "enumValue" &&
        actual.kind.value.type === expected.kind.value.type &&
        actual.kind.value.value === expected.kind.value.value
      );
    case "objectValue":
      return (
        expected.kind.case === "objectValue" &&
        actual.kind.value.typeUrl === expected.kind.value.typeUrl &&
        bytesEqual(actual.kind.value.value, expected.kind.value.value)
      );
    case undefined:
      return expected.kind.case === undefined;
    default:
      return false;
  }
}

/**
 * bytesEqual compares byte sequences by content.
 */
function bytesEqual(actual: Uint8Array, expected: Uint8Array): boolean {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}

/**
 * runtimeValueMatches compares a CEL runtime result with a generated Value.
 */
function runtimeValueMatches(environment: Env, actual: Val, expected: Value): boolean {
  if (isError(actual) || isUnknown(actual)) {
    return false;
  }
  // Round-trip the expectation through the active adapter so Any values use the same
  // descriptor registry and canonical binary representation as evaluation results.
  const expectedRuntime = valueToRefValue(environment.typeAdapter(), expected);
  if (expected.kind.case === "objectValue") {
    // Protobuf equality is semantic: map entry ordering and equivalent wire encodings do not
    // affect the value. Comparing serialized Any bytes would incorrectly distinguish them.
    const equal = actual.equal(expectedRuntime);
    return equal instanceof Bool && equal.value();
  }
  return valuesEqual(refValueToValue(actual), refValueToValue(expectedRuntime));
}

/**
 * compareBigInts orders expression identifiers numerically.
 */
function compareBigInts(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * unknownMatches compares an unknown result with an exact generated UnknownSet.
 */
function unknownMatches(actual: Unknown, expectedIds: bigint[]): boolean {
  const actualIds = actual.ids().map(BigInt).sort(compareBigInts);
  const wantedIds = [...expectedIds].sort(compareBigInts);
  return (
    actualIds.length === wantedIds.length && actualIds.every((id, index) => id === wantedIds[index])
  );
}

/**
 * resultMatches applies the generated SimpleTest result matcher.
 */
function resultMatches(
  environment: Env,
  test: SimpleTest,
  result: Val,
): FailureCategory | undefined {
  switch (test.resultMatcher.case) {
    case "value":
      return runtimeValueMatches(environment, result, test.resultMatcher.value)
        ? undefined
        : "value";
    case "typedResult": {
      const typed = test.resultMatcher.value;
      return typed.result && runtimeValueMatches(environment, result, typed.result)
        ? undefined
        : "value";
    }
    case "evalError":
    case "anyEvalErrors":
      return isError(result) ? undefined : "evaluation";
    case "unknown":
      return isUnknown(result) && unknownMatches(result as Unknown, test.resultMatcher.value.exprs)
        ? undefined
        : "matcher";
    case "anyUnknowns":
      return isUnknown(result) &&
        test.resultMatcher.value.unknowns.some((candidate) =>
          unknownMatches(result as Unknown, candidate.exprs),
        )
        ? undefined
        : "matcher";
    case undefined: {
      const expectedTrue: Value = {
        $typeName: "cel.expr.Value",
        kind: { case: "boolValue", value: true },
      };
      return runtimeValueMatches(environment, result, expectedTrue) ? undefined : "value";
    }
  }
}

/**
 * executeConformance follows the cel-go parse, check, plan, and evaluate control flow.
 */
function executeConformance(execution: ConformanceExecution): ConformanceResult {
  const test = execution.test;
  let environment: Env;
  try {
    environment = configuredEnvironment(conformanceEnvironment(execution), test);
  } catch {
    return { execution, failure: "environment" };
  }

  const parsed = environment.parse(test.expr);
  if (parsed.errors) {
    return { execution, failure: "parse" };
  }
  const compiled = test.disableCheck ? parsed : environment.compile(test.expr);
  if (compiled.errors) {
    const expectsError =
      test.resultMatcher.case === "evalError" || test.resultMatcher.case === "anyEvalErrors";
    return expectsError ? { execution } : { execution, failure: "check" };
  }

  if (test.checkOnly) {
    const typed = test.resultMatcher.case === "typedResult" ? test.resultMatcher.value : undefined;
    if (!typed?.deducedType) {
      return { execution, failure: "matcher" };
    }
    return astOutputType(compiled.ast).isExactType(exprTypeToType(typed.deducedType))
      ? { execution }
      : { execution, failure: "type" };
  }

  let bindings: Record<string, unknown>;
  try {
    bindings = activationBindings(environment, test);
  } catch {
    return { execution, failure: "activation" };
  }

  let result: Val;
  try {
    result = environment.program(compiled.ast).eval(bindings);
  } catch {
    const expectsError =
      test.resultMatcher.case === "evalError" || test.resultMatcher.case === "anyEvalErrors";
    return expectsError ? { execution } : { execution, failure: "evaluation" };
  }

  let failure: FailureCategory | undefined;
  try {
    failure = resultMatches(environment, test, result);
  } catch {
    // A value conversion failure is itself a conformance failure for this case;
    // it must not prevent the remaining synchronized fixtures from running.
    failure = "value";
  }
  if (failure) {
    return { execution, failure };
  }
  if (test.resultMatcher.case === "typedResult") {
    const expectedType = test.resultMatcher.value.deducedType;
    if (!expectedType || !astOutputType(compiled.ast).isExactType(exprTypeToType(expectedType))) {
      return { execution, failure: "type" };
    }
  }
  return { execution };
}

/**
 * percentage formats a conformance ratio with one decimal place.
 */
function percentage(conformant: number, total: number): string {
  return total === 0 ? "100.0%" : `${((conformant / total) * 100).toFixed(1)}%`;
}

/**
 * suiteSummaries aggregates results by synchronized fixture suite.
 */
function suiteSummaries(results: ConformanceResult[]): SuiteSummary[] {
  const summaries = new Map<string, SuiteSummary>();
  for (const result of results) {
    const summary = summaries.get(result.execution.suite) ?? {
      name: result.execution.suite,
      total: 0,
      conformant: 0,
    };
    summary.total += 1;
    if (!result.failure) {
      summary.conformant += 1;
    }
    summaries.set(summary.name, summary);
  }
  return [...summaries.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * markdownReport renders the conformance dashboard and non-conformant case list.
 */
function markdownReport(results: ConformanceResult[], skipped: Record<string, string>): string {
  const total = results.length;
  const conformant = results.filter((result) => !result.failure).length;
  const failures = results.filter(
    (result): result is ConformanceResult & { failure: FailureCategory } =>
      result.failure !== undefined,
  );
  const failureCounts = new Map<FailureCategory, number>();
  for (const failure of failures) {
    failureCounts.set(failure.failure, (failureCounts.get(failure.failure) ?? 0) + 1);
  }

  const lines = [
    "# CEL Conformance Report",
    "",
    "Generated from the synchronized fixtures in `testdata/conformance/*.textproto.json`.",
    "",
    "## Summary",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Total cases | ${total} |`,
    `| Conformant | ${conformant} |`,
    `| Non-conformant | ${failures.length} |`,
    `| Skipped | ${Object.keys(skipped).length} |`,
    `| Conformance | ${percentage(conformant, total)} |`,
    "",
    "## Skipped cases",
    "",
  ];
  if (Object.keys(skipped).length === 0) {
    lines.push("_None_");
  } else {
    lines.push("| Case | Reason |", "| --- | --- |");
    for (const [name, reason] of Object.entries(skipped)) {
      lines.push(`| \`${name}\` | \`${reason}\` |`);
    }
  }
  lines.push("", "## Failure categories", "", "| Category | Cases |", "| --- | ---: |");
  for (const [category, count] of [...failureCounts].sort()) {
    lines.push(`| \`${category}\` | ${count} |`);
  }
  lines.push(
    "",
    "## Conformance profiles",
    "",
    "| Profile | Conformant | Non-conformant | Total | Conformance |",
    "| --- | ---: | ---: | ---: | ---: |",
  );
  for (const profile of [
    {
      name: "Core",
      results: results.filter((result) => !extensionSuites.has(result.execution.suite)),
    },
    {
      name: "Extension-dependent",
      results: results.filter((result) => extensionSuites.has(result.execution.suite)),
    },
  ]) {
    const profileConformant = profile.results.filter((result) => !result.failure).length;
    lines.push(
      `| ${profile.name} | ${profileConformant} | ${profile.results.length - profileConformant} | ${profile.results.length} | ${percentage(profileConformant, profile.results.length)} |`,
    );
  }
  lines.push(
    "",
    "## Suite results",
    "",
    "| Suite | Conformant | Non-conformant | Total | Conformance |",
    "| --- | ---: | ---: | ---: | ---: |",
  );
  for (const summary of suiteSummaries(results)) {
    lines.push(
      `| \`${summary.name}\` | ${summary.conformant} | ${summary.total - summary.conformant} | ${summary.total} | ${percentage(summary.conformant, summary.total)} |`,
    );
  }
  lines.push("", "## Non-conformant cases", "", "| Case | Failure category |", "| --- | --- |");
  for (const failure of failures) {
    lines.push(`| \`${failure.execution.name}\` | \`${failure.failure}\` |`);
  }
  if (failures.length === 0) {
    lines.push("| _None_ | — |");
  }
  lines.push("");
  return lines.join("\n");
}

describe("conformance/conformance_test.go/TestConformance", () => {
  it("executes synchronized fixtures and writes the conformance dashboard", () => {
    const { executions, skipped } = conformanceCases();
    const results = executions.map(executeConformance);
    const failures = results
      .filter((result) => result.failure !== undefined)
      .map((result) => `${result.execution.name}: ${result.failure}`);
    const conformant = results.filter((result) => result.failure === undefined).length;
    const report = markdownReport(results, skipped);

    writeFileSync(reportPath, report);

    expect(executions.length).toBeGreaterThan(0);
    expect(conformant).toBe(results.length);
    expect(skippedConformanceTests.size).toBe(3);
    expect(Object.keys(skipped).sort()).toEqual([...skippedConformanceTests.keys()].sort());
    expect(readFileSync(reportPath, "utf8")).toBe(report);
    expect(failures).toEqual([]);
  }, 15_000);
});
