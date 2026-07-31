/// <reference types="node" />
/// <reference types="vitest/globals" />

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import {
  type Env as CelEnv,
  type EnvOptions as CelEnvOptions,
  env as celEnv,
  type ProgramOptions,
} from "./cel/env.js";
import { optionalTypes } from "./cel/library.js";
import type { Program } from "./cel/program.js";
import type { AST } from "./common/ast/index.js";
import { variableDecl } from "./common/decls.js";
import { configFromYAML } from "./common/env/io.js";
import { type Source, textSource } from "./common/source.js";
import { isError } from "./common/types/err.js";
import {
  IntType,
  listType,
  mapType,
  objectType,
  registry,
  StringType,
  type Type,
} from "./common/types/index.js";
import { bindings, lists, sets, strings, twoVarComprehensions } from "./ext/index.js";
import {
  type TestAllTypes as Proto3TestAllTypes,
  TestAllTypesSchema as Proto3TestAllTypesSchema,
} from "./gen/test/proto3pb/test_all_types_pb.js";
import { type Activation, activation, partialActivation } from "./interpreter/activation.js";
import { attributePattern } from "./interpreter/attribute-patterns.js";
import { matchesRegexOptimization } from "./interpreter/optimizations.js";
import { unparse } from "./parser/unparser.js";
import { compile as compilePolicy } from "./policy/compiler.js";
import { fromConfig as policyFromConfig } from "./policy/config.js";
import { type Policy, parse as parsePolicy } from "./policy/parser.js";
import { source as policySource } from "./policy/source.js";

/**
 * BenchmarkOperation identifies the isolated CEL operation measured by a result row.
 */
type BenchmarkOperation =
  | "parse"
  | "unparse"
  | "check"
  | "compile"
  | "plan"
  | "eval"
  | "eval-details"
  | "eval-state"
  | "partial-eval"
  | "residual"
  | "residual-roundtrip"
  | "policy-parse"
  | "policy-compile"
  | "policy-plan"
  | "policy-eval";

/**
 * BenchmarkImplementation identifies the runtime that produced a benchmark result.
 */
type BenchmarkImplementation = "@protoutil/cel" | "cel-go";

/**
 * BenchmarkVariable declares one CEL variable used by a benchmark expression.
 */
interface BenchmarkVariable {
  /**
   * name is the identifier visible to the CEL expression.
   */
  readonly name: string;

  /**
   * type is the CEL type assigned to the identifier by the checker.
   */
  readonly type: Type;
}

/**
 * BenchmarkCase describes one expression shared by the TypeScript and cel-go harnesses.
 */
interface BenchmarkCase {
  /**
   * name is the stable scenario label written to the benchmark report.
   */
  readonly name: string;

  /**
   * expression is the CEL source evaluated by the scenario.
   */
  readonly expression: string;

  /**
   * variables contains the checker declarations required by the expression.
   */
  readonly variables: readonly BenchmarkVariable[];

  /**
   * input contains the native activation values used during evaluation.
   */
  readonly input: Readonly<Record<string, unknown>>;

  /**
   * expected is the native value expected from a successful evaluation.
   */
  readonly expected: unknown;
}

/**
 * PlannerVariant identifies a planning and execution mode measured for a benchmark case.
 */
interface PlannerVariant {
  /**
   * name is appended to the scenario name in planning and evaluation result rows.
   */
  readonly name: string;

  /**
   * options configures public program planning for this variant.
   */
  readonly options?: ProgramOptions;
}

/**
 * BenchmarkStats contains aggregate timings for one operation and scenario.
 */
interface BenchmarkStats {
  /**
   * iterationsPerSample is the number of operations timed in each sample.
   */
  readonly iterationsPerSample: number;

  /**
   * sampleCount is the number of measured samples.
   */
  readonly sampleCount: number;

  /**
   * meanMs is the arithmetic mean sample duration in milliseconds.
   */
  readonly meanMs: number;

  /**
   * medianMs is the median sample duration in milliseconds.
   */
  readonly medianMs: number;

  /**
   * minMs is the shortest sample duration in milliseconds.
   */
  readonly minMs: number;

  /**
   * maxMs is the longest sample duration in milliseconds.
   */
  readonly maxMs: number;

  /**
   * standardDeviationMs is the population standard deviation of sample durations.
   */
  readonly standardDeviationMs: number;

  /**
   * opsPerSecond is the mean steady-state throughput.
   */
  readonly opsPerSecond: number;

  /**
   * meanUsPerOp is the mean operation latency in microseconds.
   */
  readonly meanUsPerOp: number;

  /**
   * medianUsPerOp is the median operation latency in microseconds.
   */
  readonly medianUsPerOp: number;
}

/**
 * BenchmarkResult is one report row returned by either implementation.
 */
interface BenchmarkResult {
  /**
   * implementation identifies the runtime that produced the measurement.
   */
  readonly implementation: BenchmarkImplementation;

  /**
   * operation identifies the isolated CEL stage being measured.
   */
  readonly operation: BenchmarkOperation;

  /**
   * scenario identifies the expression and optional planner mode.
   */
  readonly scenario: string;

  /**
   * stats contains the aggregate timing measurements.
   */
  readonly stats: BenchmarkStats;

  /**
   * notes explains what setup is intentionally outside the timed loop.
   */
  readonly notes: string;
}

/**
 * BenchmarkContext stores the reusable frontend and runtime objects for one expression.
 */
interface BenchmarkContext {
  /**
   * benchmarkCase is the scenario represented by this context.
   */
  readonly benchmarkCase: BenchmarkCase;

  /**
   * source is reused with the parsed AST to isolate checker cost.
   */
  readonly source: Source;

  /**
   * parsed is the reusable parsed AST used by unparse and check benchmarks.
   */
  readonly parsed: AST;

  /**
   * checked is the reusable checked AST used by planning benchmarks.
   */
  readonly checked: AST;

  /**
   * programEnv is the public CEL environment used to plan each variant.
   */
  readonly programEnv: CelEnv;
}

/**
 * ResidualBenchmarkCase describes a partial-evaluation workload shared with cel-go.
 */
interface ResidualBenchmarkCase {
  /**
   * expectedResidual is the canonical expression produced after pruning known values.
   */
  readonly expectedResidual: string;

  /**
   * expression is evaluated with missing declarations represented as unknown variables.
   */
  readonly expression: string;

  /**
   * input contains the known portion of the partial activation.
   */
  readonly input: Readonly<Record<string, unknown>>;

  /**
   * name is the stable scenario label written to the report.
   */
  readonly name: string;

  /**
   * unknowns identifies exact attribute paths which remain unknown during evaluation.
   */
  readonly unknowns: readonly ResidualUnknownAttribute[];

  /**
   * variables contains every declaration visible to the expression.
   */
  readonly variables: readonly BenchmarkVariable[];
}

/**
 * ResidualUnknownAttribute describes one root variable and its string field qualifiers.
 */
interface ResidualUnknownAttribute {
  /**
   * qualifiers contains the string field path below the root variable.
   */
  readonly qualifiers: readonly string[];

  /**
   * variable is the root activation variable.
   */
  readonly variable: string;
}

/**
 * ResidualBenchmarkContext stores reusable partial-evaluation and residualization state.
 */
interface ResidualBenchmarkContext {
  /**
   * ast is the checked expression being partially evaluated.
   */
  readonly ast: AST;

  /**
   * benchmarkCase describes the expected residual expression.
   */
  readonly benchmarkCase: ResidualBenchmarkCase;

  /**
   * details is the reusable evaluation state supplied to isolated residualization measurements.
   */
  readonly details: ReturnType<Program["evalWithDetails"]>["details"];

  /**
   * environment owns partial activation inference and residual AST construction.
   */
  readonly environment: CelEnv;

  /**
   * input is the reusable partial activation with missing declarations marked unknown.
   */
  readonly input: Activation;

  /**
   * program tracks state while evaluating unknown attributes.
   */
  readonly program: Program;
}

/**
 * PolicyDocument contains synchronized source text and its decoded YAML representation.
 */
interface PolicyDocument {
  /**
   * source is the exact upstream YAML document.
   */
  readonly source: string;

  /**
   * value is the canonical JSON-compatible YAML representation.
   */
  readonly value: unknown;
}

/**
 * PolicyFixture contains the synchronized documents for one upstream policy suite.
 */
interface PolicyFixture {
  /**
   * path is the stable upstream fixture path.
   */
  readonly path: string;

  /**
   * files maps YAML filenames to synchronized documents.
   */
  readonly files: Readonly<Record<string, PolicyDocument>>;
}

/**
 * PolicyTestInput describes a literal or CEL expression activation value.
 */
interface PolicyTestInput {
  /**
   * value is a literal activation value.
   */
  readonly value?: unknown;

  /**
   * expr is evaluated to produce an activation value.
   */
  readonly expr?: string;
}

/**
 * PolicyTestCase describes one policy evaluation input.
 */
interface PolicyTestCase {
  /**
   * name is the stable test-case name within its section.
   */
  readonly name: string;

  /**
   * input maps activation names to literal or expression values.
   */
  readonly input?: Readonly<Record<string, PolicyTestInput>>;
}

/**
 * PolicyTestSection groups related policy evaluation inputs.
 */
interface PolicyTestSection {
  /**
   * name is the stable section name.
   */
  readonly name: string;

  /**
   * tests contains the evaluation inputs in the section.
   */
  readonly tests: readonly PolicyTestCase[];
}

/**
 * PolicyTestSuite is the synchronized policy tests.yaml shape.
 */
interface PolicyTestSuite {
  /**
   * section is the original singular spelling used by cel-policy fixtures.
   */
  readonly section?: readonly PolicyTestSection[];

  /**
   * sections is the newer plural spelling accepted by the conformance harness.
   */
  readonly sections?: readonly PolicyTestSection[];
}

/**
 * PolicyBenchmarkCase pairs one policy program with one prepared activation.
 */
interface PolicyBenchmarkCase {
  /**
   * scenario is the fixture, section, and test name written to the report.
   */
  readonly scenario: string;

  /**
   * input contains the native activation bindings for the evaluation.
   */
  readonly input: Readonly<Record<string, unknown>>;
}

/**
 * PolicyBenchmarkContext stores reusable policy setup for parse, compile, plan, and eval rows.
 */
interface PolicyBenchmarkContext {
  /**
   * fixture contains the synchronized policy, config, and evaluation documents.
   */
  readonly fixture: PolicyFixture;

  /**
   * environment contains policy declarations and configured extensions.
   */
  readonly environment: CelEnv;

  /**
   * parsedPolicy is reused to isolate policy compilation cost.
   */
  readonly parsedPolicy: Policy;

  /**
   * ast is reused to isolate optimized program planning cost.
   */
  readonly ast: AST;

  /**
   * program is reused for steady-state policy evaluation.
   */
  readonly program: Program;

  /**
   * cases contains the prepared activation for every upstream evaluation case.
   */
  readonly cases: readonly PolicyBenchmarkCase[];
}

/**
 * CompilePolicyFixtureOptions configures one benchmark policy compilation.
 */
interface CompilePolicyFixtureOptions {
  /**
   * environment contains the declarations used to compile the policy.
   */
  readonly environment: CelEnv;

  /**
   * parsedPolicy is the canonical policy representation to compile.
   */
  readonly parsedPolicy: Policy;

  /**
   * scenario identifies the policy in failure diagnostics.
   */
  readonly scenario: string;
}

/**
 * BenchmarkOptions configures one sampled TypeScript benchmark.
 */
interface BenchmarkOptions {
  /**
   * operation identifies the CEL stage being measured.
   */
  readonly operation: BenchmarkOperation;

  /**
   * scenario identifies the expression and planner mode.
   */
  readonly scenario: string;

  /**
   * notes explains which objects are reused by the timed operation.
   */
  readonly notes: string;

  /**
   * run performs one operation and returns a value that keeps the work observable.
   */
  readonly run: () => unknown;
}

/**
 * IterationOptions configures one warmup or measured sample.
 */
interface IterationOptions {
  /**
   * iterations is the number of operations to execute.
   */
  readonly iterations: number;

  /**
   * run performs one operation and returns an observable result.
   */
  readonly run: () => unknown;
}

/**
 * Proto benchmark input uses the generated message shape directly because its structure is known.
 */
const protoBenchmarkInput = {
  $typeName: Proto3TestAllTypesSchema.typeName,
  nestedType: {
    case: "singleNestedMessage",
    value: {
      $typeName: "google.expr.proto3.test.TestAllTypes.NestedMessage",
      bb: 123,
    },
  },
} as Proto3TestAllTypes;

/**
 * benchmarkCases contains representative frontend and interpreter workloads shared with cel-go.
 */
const benchmarkCases: readonly BenchmarkCase[] = [
  {
    name: "scalar arithmetic",
    expression: "x + 1",
    variables: [{ name: "x", type: IntType }],
    input: { x: 41n },
    expected: 42n,
  },
  {
    name: "macro comprehension",
    expression: "users.exists(user, user > 50)",
    variables: [{ name: "users", type: listType(IntType) }],
    input: { users: Array.from({ length: 100 }, (_, index) => BigInt(index)) },
    expected: true,
  },
  {
    name: "constant regex",
    expression: "input.matches('^[a-z]+[0-9]{2}$')",
    variables: [{ name: "input", type: StringType }],
    input: { input: "benchmark42" },
    expected: true,
  },
  {
    name: "protobuf field selection",
    expression: "msg.single_nested_message.bb == 123",
    variables: [
      {
        name: "msg",
        type: objectType(Proto3TestAllTypesSchema.typeName),
      },
    ],
    input: { msg: protoBenchmarkInput },
    expected: true,
  },
];

/**
 * diagnosticBenchmarkCases form an evaluation ladder which isolates increasingly expensive runtime
 * features without repeating frontend measurements for each expression.
 */
const diagnosticBenchmarkCases: readonly BenchmarkCase[] = [
  {
    name: "diagnostic / literal",
    expression: "true",
    variables: [],
    input: {},
    expected: true,
  },
  {
    name: "diagnostic / identifier",
    expression: "x",
    variables: [{ name: "x", type: IntType }],
    input: { x: 41n },
    expected: 41n,
  },
  {
    name: "diagnostic / binary call",
    expression: "x + 1",
    variables: [{ name: "x", type: IntType }],
    input: { x: 41n },
    expected: 42n,
  },
  {
    name: "diagnostic / member call",
    expression: "input.startsWith('bench')",
    variables: [{ name: "input", type: StringType }],
    input: { input: "benchmark" },
    expected: true,
  },
  {
    name: "diagnostic / dynamic map selection",
    expression: "labels.env == 'prod'",
    variables: [{ name: "labels", type: mapType(StringType, StringType) }],
    input: { labels: { env: "prod" } },
    expected: true,
  },
  {
    name: "diagnostic / list index",
    expression: "values[50] == 50",
    variables: [{ name: "values", type: listType(IntType) }],
    input: { values: Array.from({ length: 100 }, (_, index) => BigInt(index)) },
    expected: true,
  },
  {
    name: "diagnostic / fold early exit",
    expression: "values.exists(value, value > 50)",
    variables: [{ name: "values", type: listType(IntType) }],
    input: { values: Array.from({ length: 100 }, (_, index) => BigInt(index)) },
    expected: true,
  },
  {
    name: "diagnostic / fold full scan",
    expression: "values.exists(value, value > 100)",
    variables: [{ name: "values", type: listType(IntType) }],
    input: { values: Array.from({ length: 100 }, (_, index) => BigInt(index)) },
    expected: false,
  },
  {
    name: "diagnostic / protobuf field",
    expression: "msg.single_nested_message.bb == 123",
    variables: [{ name: "msg", type: objectType(Proto3TestAllTypesSchema.typeName) }],
    input: { msg: protoBenchmarkInput },
    expected: true,
  },
];

/**
 * residualBenchmarkCases mirror upstream residual tests while covering branch and macro pruning.
 */
const residualBenchmarkCases: readonly ResidualBenchmarkCase[] = [
  {
    name: "known branch pruning",
    expression: "x < 10 && (y == 0 || 'hello' != 'goodbye')",
    variables: [
      { name: "x", type: IntType },
      { name: "y", type: IntType },
    ],
    input: {},
    unknowns: [
      { variable: "x", qualifiers: [] },
      { variable: "y", qualifiers: [] },
    ],
    expectedResidual: "x < 10",
  },
  {
    name: "macro pruning",
    expression: "x.exists(i, i < 10) && [11, 12, 13].all(i, i in [y, 12, 13])",
    variables: [
      { name: "x", type: listType(IntType) },
      { name: "y", type: IntType },
    ],
    input: { y: 11n },
    unknowns: [{ variable: "x", qualifiers: [] }],
    expectedResidual: "x.exists(i, i < 10)",
  },
  {
    name: "qualified attribute pruning",
    expression: `resource.name.startsWith("bucket/my-bucket") &&
      bool(request.auth.claims.email_verified) == true &&
      request.auth.claims.email == "wiley@acme.co"`,
    variables: [
      { name: "resource.name", type: StringType },
      { name: "request.auth.claims", type: mapType(StringType, StringType) },
    ],
    input: {
      "resource.name": "bucket/my-bucket/objects/private",
      "request.auth.claims": { email_verified: "true" },
    },
    unknowns: [{ variable: "request.auth.claims", qualifiers: ["email"] }],
    expectedResidual: `request.auth.claims.email == "wiley@acme.co"`,
  },
];

/**
 * policyBenchmarkFiles selects representative successful fixtures from the synchronized suite.
 */
const policyBenchmarkFiles = ["unnest.json", "nested-rule7.json", "required-labels.json"] as const;

/**
 * policyExtensionOptions maps serialized policy extension names to CEL libraries.
 */
const policyExtensionOptions: Readonly<Record<string, CelEnvOptions>> = {
  lists: { libraries: [lists()] },
  sets: { libraries: [sets()] },
  strings: { libraries: [strings()] },
  "two-var-comprehensions": { libraries: [twoVarComprehensions()] },
};

/**
 * benchmarkFile is the generated Markdown report path.
 */
const benchmarkFile = new URL("../BENCHMARK.md", import.meta.url);

/**
 * benchmarkGoDir is the nested module containing the cel-go companion process.
 */
const benchmarkGoDir = fileURLToPath(new URL("../scripts/benchmark-cel-go", import.meta.url));

/**
 * benchmarkTimeoutMs bounds the complete cross-runtime benchmark run.
 */
const benchmarkTimeoutMs = Number(process.env.CEL_BENCHMARK_TIMEOUT_MS ?? "120000");

/**
 * sampleCount controls the number of measured samples per result row.
 */
const sampleCount = Number(process.env.CEL_BENCHMARK_SAMPLE_COUNT ?? "8");

/**
 * warmupCount controls the number of discarded warmup samples per result row.
 */
const warmupCount = Number(process.env.CEL_BENCHMARK_WARMUP_COUNT ?? "2");

/**
 * iterationsPerSample controls the operations timed in each sample.
 */
const iterationsPerSample = Number(process.env.CEL_BENCHMARK_ITERATIONS ?? "250");

/**
 * goBinaryCandidates lists supported ways to locate a Go toolchain.
 */
const goBinaryCandidates = [
  process.env.GO_BINARY,
  process.env.GOROOT ? path.join(process.env.GOROOT, "bin", "go") : undefined,
  "/opt/homebrew/bin/go",
  "/usr/local/go/bin/go",
] as const;

/**
 * benchmarkSink keeps benchmark return values observable to the JavaScript engine.
 */
let benchmarkSink: unknown;

describe("CEL benchmark", () => {
  it(
    "writes BENCHMARK.md",
    async () => {
      validateBenchmarkConfiguration();
      const results = benchmarkTypeScript();
      results.push(...runCelGoBenchmarks());
      validateResultMatrix(results);
      const markdown = benchmarkDocument(results);
      await writeFile(benchmarkFile, markdown, "utf8");
      process.stdout.write(`\n${markdown}\n`);
    },
    benchmarkTimeoutMs,
  );
});

/**
 * validateBenchmarkConfiguration rejects invalid sampling configuration before doing expensive work.
 */
function validateBenchmarkConfiguration(): void {
  for (const [name, value] of [
    ["CEL_BENCHMARK_SAMPLE_COUNT", sampleCount],
    ["CEL_BENCHMARK_WARMUP_COUNT", warmupCount],
    ["CEL_BENCHMARK_ITERATIONS", iterationsPerSample],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer`);
    }
  }
}

/**
 * validateResultMatrix ensures every measured operation has a cross-runtime comparison row.
 */
function validateResultMatrix(results: readonly BenchmarkResult[]): void {
  const implementationsByScenario = new Map<string, Set<BenchmarkImplementation>>();
  for (const result of results) {
    const key = `${result.operation}::${result.scenario}`;
    const implementations = implementationsByScenario.get(key) ?? new Set();
    implementations.add(result.implementation);
    implementationsByScenario.set(key, implementations);
  }
  const unpaired = [...implementationsByScenario.entries()]
    .filter(([, implementations]) => implementations.size !== 2)
    .map(([key]) => key);
  if (unpaired.length !== 0) {
    throw new Error(`benchmark scenarios are not paired: ${unpaired.join(", ")}`);
  }
  for (const operation of [
    "eval-details",
    "eval-state",
    "partial-eval",
    "residual",
    "residual-roundtrip",
    "policy-parse",
    "policy-compile",
    "policy-plan",
    "policy-eval",
  ]) {
    if (![...implementationsByScenario].some(([key]) => key.startsWith(`${operation}::`))) {
      throw new Error(`benchmark matrix is missing ${operation}`);
    }
  }
}

/**
 * benchmarkTypeScript measures the current TypeScript frontend, planner, and interpreter.
 */
function benchmarkTypeScript(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  for (const benchmarkCase of benchmarkCases) {
    process.stdout.write(`Benchmarking @protoutil/cel: ${benchmarkCase.name}\n`);
    const context = benchmarkContext(benchmarkCase);
    results.push(...benchmarkFrontend(context));
    results.push(...benchmarkInterpreter(context));
  }
  for (const benchmarkCase of diagnosticBenchmarkCases) {
    process.stdout.write(`Benchmarking @protoutil/cel diagnostic: ${benchmarkCase.name}\n`);
    results.push(...benchmarkDiagnostic(benchmarkContext(benchmarkCase)));
  }
  for (const benchmarkCase of residualBenchmarkCases) {
    process.stdout.write(`Benchmarking @protoutil/cel residual: ${benchmarkCase.name}\n`);
    results.push(...benchmarkResidual(residualBenchmarkContext(benchmarkCase)));
  }
  for (const fixture of policyBenchmarkFixtures()) {
    process.stdout.write(`Benchmarking @protoutil/cel policy: ${fixture.path}\n`);
    results.push(...benchmarkPolicy(policyBenchmarkContext(fixture)));
  }
  return results;
}

/**
 * benchmarkDiagnostic measures direct evaluation, result-detail allocation, and state observation
 * for one expression in the runtime feature ladder.
 */
function benchmarkDiagnostic(context: BenchmarkContext): BenchmarkResult[] {
  const benchmarkCase = context.benchmarkCase;
  const input = activation({ bindings: benchmarkCase.input });
  const program = context.programEnv.program(context.checked);
  const stateProgram = context.programEnv.program(context.checked, { trackState: true });
  validateEvaluation({
    context,
    program,
    input,
    variant: { name: "diagnostic" },
  });
  const stateValue = stateProgram.evalWithDetails(input).value.value();
  if (!nativeEqual(stateValue, benchmarkCase.expected)) {
    throw new Error(
      `unexpected ${benchmarkCase.name} state-tracking result: ${String(stateValue)}`,
    );
  }
  return [
    benchmark({
      operation: "eval",
      scenario: benchmarkCase.name,
      notes:
        "Reuses one baseline program and activation to expose incremental runtime feature cost.",
      run: () => program.eval(input),
    }),
    benchmark({
      operation: "eval-details",
      scenario: benchmarkCase.name,
      notes:
        "Reuses one baseline program and activation while allocating public evaluation details.",
      run: () => program.evalWithDetails(input),
    }),
    benchmark({
      operation: "eval-state",
      scenario: benchmarkCase.name,
      notes: "Reuses one state-tracking program and activation to isolate observer overhead.",
      run: () => stateProgram.evalWithDetails(input),
    }),
  ];
}

/**
 * residualBenchmarkContext prepares one checked expression, partial activation, and reusable state.
 */
function residualBenchmarkContext(benchmarkCase: ResidualBenchmarkCase): ResidualBenchmarkContext {
  const environment = celEnv({
    variables: benchmarkCase.variables.map((variable) =>
      variableDecl(variable.name, variable.type),
    ),
    parser: { populateMacroCalls: true },
  });
  const ast = environment.compile(benchmarkCase.expression);
  const input = partialActivation({
    bindings: benchmarkCase.input,
    unknowns: benchmarkCase.unknowns.map((unknown) => {
      let pattern = attributePattern(unknown.variable);
      for (const qualifier of unknown.qualifiers) {
        pattern = pattern.qualString(qualifier);
      }
      return pattern;
    }),
  });
  const program = environment.program(ast, { partialEval: true, trackState: true });
  const evaluated = program.evalWithDetails(input);
  const residual = environment.residualAst(ast, evaluated.details);
  const rendered = unparse(residual);
  if (rendered !== benchmarkCase.expectedResidual) {
    throw new Error(
      `unexpected ${benchmarkCase.name} residual: ${rendered}; wanted ${benchmarkCase.expectedResidual}`,
    );
  }
  return {
    ast,
    benchmarkCase,
    details: evaluated.details,
    environment,
    input,
    program,
  };
}

/**
 * benchmarkResidual measures partial evaluation, residual construction, and their combined path.
 */
function benchmarkResidual(context: ResidualBenchmarkContext): BenchmarkResult[] {
  return [
    benchmark({
      operation: "partial-eval",
      scenario: context.benchmarkCase.name,
      notes: "Reuses one state-tracking partial program and inferred unknown activation.",
      run: () => context.program.evalWithDetails(context.input),
    }),
    benchmark({
      operation: "residual",
      scenario: context.benchmarkCase.name,
      notes: "Reuses one evaluated state to isolate prune, render, parse, and re-check cost.",
      run: () => context.environment.residualAst(context.ast, context.details),
    }),
    benchmark({
      operation: "residual-roundtrip",
      scenario: context.benchmarkCase.name,
      notes: "Measures partial evaluation followed by residual AST construction.",
      run: () => {
        const evaluated = context.program.evalWithDetails(context.input);
        return context.environment.residualAst(context.ast, evaluated.details);
      },
    }),
  ];
}

/**
 * policyBenchmarkFixtures loads the selected synchronized policy fixtures in stable order.
 */
function policyBenchmarkFixtures(): PolicyFixture[] {
  return policyBenchmarkFiles.map((fileName) => {
    const fixtureUrl = new URL(`../testdata/policy/${fileName}`, import.meta.url);
    const value: unknown = JSON.parse(readFileSync(fixtureUrl, "utf8"));
    if (!isPolicyFixture(value)) {
      throw new Error(`malformed synchronized policy fixture: ${fileName}`);
    }
    return value;
  });
}

/**
 * isPolicyFixture reports whether a decoded value has the required synchronized fixture shape.
 */
function isPolicyFixture(value: unknown): value is PolicyFixture {
  if (!isRecord(value) || typeof value.path !== "string" || !isRecord(value.files)) {
    return false;
  }
  const files = value.files;
  return ["policy.yaml", "tests.yaml"].every((fileName) => {
    const document = files[fileName];
    return isRecord(document) && typeof document.source === "string";
  });
}

/**
 * policyBenchmarkContext prepares one policy environment, AST, optimized program, and case set.
 */
function policyBenchmarkContext(fixture: PolicyFixture): PolicyBenchmarkContext {
  const environment = policyBenchmarkEnvironment(fixture);
  const parsedPolicy = parsePolicyFixture(fixture);
  const ast = compilePolicyFixture({
    environment,
    parsedPolicy,
    scenario: fixture.path,
  });
  const program = environment.program(ast, { optimize: true });
  const cases = policyBenchmarkCases(environment, fixture);
  for (const benchmarkCase of cases) {
    const result = program.eval(benchmarkCase.input);
    if (isError(result)) {
      throw new Error(`policy evaluation setup failed for ${benchmarkCase.scenario}: ${result}`);
    }
  }
  return { fixture, environment, parsedPolicy, ast, program, cases };
}

/**
 * policyBenchmarkEnvironment configures the standard policy libraries and serialized environment.
 */
function policyBenchmarkEnvironment(fixture: PolicyFixture): CelEnv {
  const baseOptions: CelEnvOptions = {
    libraries: [optionalTypes(), bindings()],
  };
  const configSource = fixture.files["config.yaml"]?.source;
  if (configSource === undefined) {
    return celEnv(baseOptions);
  }
  const configured = policyFromConfig(configFromYAML(configSource));
  return celEnv({
    ...baseOptions,
    ...configured,
    configuration: {
      config: configured.configuration!.config,
      extensions: policyExtensionOptions,
    },
  });
}

/**
 * parsePolicyFixture parses one synchronized policy and rejects diagnostics.
 */
function parsePolicyFixture(fixture: PolicyFixture): Policy {
  const source = fixture.files["policy.yaml"]!.source;
  const parsed = parsePolicy(policySource(source, `${fixture.path}/policy.yaml`));
  const error = parsed.issues.err();
  if (error || !parsed.policy) {
    throw new Error(`policy parse failed for ${fixture.path}: ${error?.message ?? "no policy"}`);
  }
  return parsed.policy;
}

/**
 * compilePolicyFixture compiles one parsed policy and rejects diagnostics.
 */
function compilePolicyFixture(options: CompilePolicyFixtureOptions): AST {
  const compiled = compilePolicy(options.environment, options.parsedPolicy);
  const error = compiled.issues.err();
  if (error || !compiled.ast) {
    throw new Error(`policy compile failed for ${options.scenario}: ${error?.message ?? "no AST"}`);
  }
  return compiled.ast;
}

/**
 * policyBenchmarkCases expands synchronized test sections into prepared evaluation activations.
 */
function policyBenchmarkCases(environment: CelEnv, fixture: PolicyFixture): PolicyBenchmarkCase[] {
  const suite = fixture.files["tests.yaml"]!.value as PolicyTestSuite;
  const cases: PolicyBenchmarkCase[] = [];
  for (const section of suite.section ?? suite.sections ?? []) {
    for (const test of section.tests) {
      cases.push({
        scenario: `${fixture.path} / ${section.name} / ${test.name}`,
        input: policyCaseInput(environment, test),
      });
    }
  }
  if (cases.length === 0) {
    throw new Error(`policy fixture has no evaluation cases: ${fixture.path}`);
  }
  return cases;
}

/**
 * policyCaseInput resolves literal and expression-based inputs for one policy test case.
 */
function policyCaseInput(
  environment: CelEnv,
  test: PolicyTestCase,
): Readonly<Record<string, unknown>> {
  const input: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(test.input ?? {})) {
    input[name] =
      value.expr === undefined
        ? value.value
        : environment.program(environment.compile(value.expr)).eval({});
  }
  return input;
}

/**
 * benchmarkPolicy measures synchronized policy parsing, compilation, planning, and evaluation.
 */
function benchmarkPolicy(context: PolicyBenchmarkContext): BenchmarkResult[] {
  const scenario = context.fixture.path;
  const results = [
    benchmark({
      operation: "policy-parse",
      scenario,
      notes: "Parses the synchronized upstream YAML policy source.",
      run: () => parsePolicyFixture(context.fixture),
    }),
    benchmark({
      operation: "policy-compile",
      scenario,
      notes: "Reuses one parsed policy and configured environment to isolate policy compilation.",
      run: () =>
        compilePolicyFixture({
          environment: context.environment,
          parsedPolicy: context.parsedPolicy,
          scenario,
        }),
    }),
    benchmark({
      operation: "policy-plan",
      scenario,
      notes: "Reuses one compiled policy AST and environment to isolate optimized planning.",
      run: () => context.environment.program(context.ast, { optimize: true }),
    }),
  ];
  for (const benchmarkCase of context.cases) {
    results.push(
      benchmark({
        operation: "policy-eval",
        scenario: benchmarkCase.scenario,
        notes: "Reuses one optimized policy program and prepared activation.",
        run: () => context.program.eval(benchmarkCase.input),
      }),
    );
  }
  return results;
}

/**
 * benchmarkContext prepares reusable parser, checker, registry, and interpreter state.
 */
function benchmarkContext(benchmarkCase: BenchmarkCase): BenchmarkContext {
  const registryValue = registry([
    { $typeName: Proto3TestAllTypesSchema.typeName } as never,
    Proto3TestAllTypesSchema,
  ]);
  const programEnv = celEnv({
    registry: registryValue,
    variables: benchmarkCase.variables.map((variable) =>
      variableDecl(variable.name, variable.type),
    ),
    parser: {
      enableOptionalSyntax: true,
      maxRecursionDepth: 32,
      errorRecoveryLimit: 4,
      errorRecoveryTokenLookaheadLimit: 4,
      populateMacroCalls: true,
    },
    checker: {
      crossTypeNumericComparisons: true,
    },
  });
  const source = textSource(benchmarkCase.expression);
  const parsed = programEnv.parse(benchmarkCase.expression);
  const checked = programEnv.check(parsed, source);
  return {
    benchmarkCase,
    source,
    parsed,
    checked,
    programEnv,
  };
}

/**
 * benchmarkFrontend measures parse, unparse, check, and combined compile throughput.
 */
function benchmarkFrontend(context: BenchmarkContext): BenchmarkResult[] {
  const benchmarkCase = context.benchmarkCase;
  return [
    benchmark({
      operation: "parse",
      scenario: benchmarkCase.name,
      notes: "Reuses one public environment to isolate steady-state parse throughput.",
      run: () => context.programEnv.parse(benchmarkCase.expression),
    }),
    benchmark({
      operation: "unparse",
      scenario: benchmarkCase.name,
      notes: "Reuses one parsed AST to isolate unparser cost.",
      run: () => unparse(context.parsed),
    }),
    benchmark({
      operation: "check",
      scenario: benchmarkCase.name,
      notes: "Reuses one parsed AST and public environment to isolate checker cost.",
      run: () => context.programEnv.check(context.parsed, context.source),
    }),
    benchmark({
      operation: "compile",
      scenario: benchmarkCase.name,
      notes: "Runs parse plus check through one public environment.",
      run: () => context.programEnv.compile(benchmarkCase.expression),
    }),
  ];
}

/**
 * benchmarkInterpreter measures program planning and steady-state evaluation for each planner mode.
 */
function benchmarkInterpreter(context: BenchmarkContext): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  for (const variant of plannerVariants(context.benchmarkCase)) {
    const scenario = `${context.benchmarkCase.name} / ${variant.name}`;
    results.push(
      benchmark({
        operation: "plan",
        scenario,
        notes: "Reuses one checked AST and environment to isolate public program planning cost.",
        run: () => context.programEnv.program(context.checked, variant.options),
      }),
    );

    const program = context.programEnv.program(context.checked, variant.options);
    const input = activation({ bindings: context.benchmarkCase.input });
    validateEvaluation({ context, program, input, variant });
    results.push(
      benchmark({
        operation: "eval",
        scenario,
        notes: "Reuses one public program and activation to isolate steady-state evaluation.",
        run: () => program.eval(input),
      }),
    );
  }
  return results;
}

/**
 * plannerVariants returns the meaningful planner modes for one benchmark case.
 */
function plannerVariants(benchmarkCase: BenchmarkCase): readonly PlannerVariant[] {
  const variants: PlannerVariant[] = [{ name: "baseline" }];
  if (benchmarkCase.name !== "constant regex") {
    variants.push({ name: "optimized", options: { optimize: true } });
  }
  if (benchmarkCase.name === "constant regex") {
    variants.push({
      name: "compiled regex",
      options: { regexOptimizations: [matchesRegexOptimization] },
    });
  }
  if (benchmarkCase.name === "macro comprehension") {
    variants.push({
      name: "runtime cost",
      options: { costTracking: {} },
    });
  }
  return variants;
}

/**
 * ValidateEvaluationOptions configures one pre-benchmark interpreter correctness check.
 */
interface ValidateEvaluationOptions {
  /**
   * context contains the expected result and reusable runtime setup.
   */
  readonly context: BenchmarkContext;

  /**
   * program is the planned public CEL program being validated.
   */
  readonly program: Program;

  /**
   * input supplies the reusable activation used by the evaluation.
   */
  readonly input: Activation;

  /**
   * variant identifies the planner mode for diagnostic messages.
   */
  readonly variant: PlannerVariant;
}

/**
 * validateEvaluation verifies a planner variant before its execution is timed.
 */
function validateEvaluation(options: ValidateEvaluationOptions): void {
  const actual = options.program.eval(options.input).value();
  if (!nativeEqual(actual, options.context.benchmarkCase.expected)) {
    throw new Error(
      `unexpected ${options.context.benchmarkCase.name} / ${options.variant.name} result: ${String(actual)}`,
    );
  }
}

/**
 * nativeEqual compares the primitive and array values returned by benchmark expressions.
 */
function nativeEqual(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return (
      actual.length === expected.length &&
      actual.every((entry, index) => nativeEqual(entry, expected[index]))
    );
  }
  return Object.is(actual, expected);
}

/**
 * benchmark samples one TypeScript operation and computes its aggregate timings.
 */
function benchmark(options: BenchmarkOptions): BenchmarkResult {
  const iterations = benchmarkIterations(options.operation, options.scenario, iterationsPerSample);
  for (let index = 0; index < warmupCount; index += 1) {
    runIterations({ iterations, run: options.run });
  }

  const durationsMs: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    durationsMs.push(runIterations({ iterations, run: options.run }));
  }

  return {
    implementation: "@protoutil/cel",
    operation: options.operation,
    scenario: options.scenario,
    stats: computeStats(durationsMs, iterations),
    notes: options.notes,
  };
}

/**
 * benchmarkIterations scales the base iteration count to keep fast operations measurable without
 * making expensive checker and observer scenarios dominate total runtime.
 */
function benchmarkIterations(
  operation: BenchmarkOperation,
  scenario: string,
  baseIterations: number,
): number {
  if (operation === "unparse") {
    return baseIterations * 20;
  }
  if (operation === "parse" || operation === "plan" || operation === "policy-parse") {
    return baseIterations * 4;
  }
  if (
    operation === "policy-compile" ||
    operation === "policy-plan" ||
    operation === "policy-eval" ||
    operation === "partial-eval" ||
    operation === "residual" ||
    operation === "residual-roundtrip"
  ) {
    return baseIterations;
  }
  if (operation !== "eval" && operation !== "eval-details" && operation !== "eval-state") {
    return baseIterations;
  }
  if (scenario.endsWith("/ runtime cost")) {
    return baseIterations;
  }
  if (scenario.startsWith("macro comprehension")) {
    return baseIterations * 2;
  }
  if (scenario.includes("fold ")) {
    return baseIterations * 2;
  }
  if (scenario.endsWith("/ baseline") && scenario.startsWith("constant regex")) {
    return baseIterations * 4;
  }
  return baseIterations * 20;
}

/**
 * runIterations executes and times one benchmark sample.
 */
function runIterations(options: IterationOptions): number {
  const start = performance.now();
  for (let index = 0; index < options.iterations; index += 1) {
    benchmarkSink = options.run();
  }
  void benchmarkSink;
  return performance.now() - start;
}

/**
 * computeStats calculates aggregate latency and throughput for measured samples.
 */
function computeStats(durationsMs: readonly number[], iterations: number): BenchmarkStats {
  const meanMs = mean(durationsMs);
  const medianMs = median(durationsMs);
  return {
    iterationsPerSample: iterations,
    sampleCount: durationsMs.length,
    meanMs,
    medianMs,
    minMs: Math.min(...durationsMs),
    maxMs: Math.max(...durationsMs),
    standardDeviationMs: standardDeviation(durationsMs, meanMs),
    opsPerSecond: (iterations * 1000) / meanMs,
    meanUsPerOp: (meanMs * 1000) / iterations,
    medianUsPerOp: (medianMs * 1000) / iterations,
  };
}

/**
 * mean returns the arithmetic mean of numeric values.
 */
function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * median returns the middle value, or mean of the two middle values, in a numeric sample.
 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

/**
 * standardDeviation returns the population standard deviation of numeric values.
 */
function standardDeviation(values: readonly number[], average: number): number {
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * runCelGoBenchmarks executes the companion cel-go benchmark process.
 */
function runCelGoBenchmarks(): BenchmarkResult[] {
  const goBinary = resolveGoBinary();
  process.stdout.write("Benchmarking cel-go companion\n");
  const stdout = execFileSync(goBinary, ["run", "."], {
    cwd: benchmarkGoDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: {
      ...process.env,
      CEL_BENCHMARK_SAMPLE_COUNT: String(sampleCount),
      CEL_BENCHMARK_WARMUP_COUNT: String(warmupCount),
      CEL_BENCHMARK_ITERATIONS: String(iterationsPerSample),
      GOCACHE: "/private/tmp/protoutil-cel-go-build-cache",
    },
  });
  return parseCelGoResults(stdout);
}

/**
 * resolveGoBinary returns the first working configured or conventional Go binary.
 */
function resolveGoBinary(): string {
  const candidates = goBinaryCandidates.filter((value): value is string => value !== undefined);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["env", "GOVERSION"], { encoding: "utf8" });
      return candidate;
    } catch {
      // Continue to the next conventional Go installation.
    }
  }
  throw new Error(
    "Could not locate a working Go binary. Set GO_BINARY or ensure go is installed in a standard location.",
  );
}

/**
 * parseCelGoResults validates and converts the companion process JSON output.
 */
function parseCelGoResults(stdout: string): BenchmarkResult[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) {
    throw new Error("cel-go benchmark did not return an array of results");
  }
  return parsed.map((value) => parseCelGoResult(value));
}

/**
 * parseCelGoResult validates one result returned by the companion process.
 */
function parseCelGoResult(value: unknown): BenchmarkResult {
  if (!isRecord(value)) {
    throw new Error("cel-go benchmark returned a malformed result");
  }
  if (value.implementation !== "cel-go") {
    throw new Error(`unexpected benchmark implementation: ${String(value.implementation)}`);
  }
  if (!isBenchmarkOperation(value.operation)) {
    throw new Error(`unexpected benchmark operation: ${String(value.operation)}`);
  }
  if (typeof value.scenario !== "string" || typeof value.notes !== "string") {
    throw new Error("cel-go benchmark returned a malformed scenario or notes field");
  }
  return {
    implementation: value.implementation,
    operation: value.operation,
    scenario: value.scenario,
    notes: value.notes,
    stats: parseBenchmarkStats(value.stats),
  };
}

/**
 * isBenchmarkOperation reports whether a value is a supported benchmark operation.
 */
function isBenchmarkOperation(value: unknown): value is BenchmarkOperation {
  return (
    value === "parse" ||
    value === "unparse" ||
    value === "check" ||
    value === "compile" ||
    value === "plan" ||
    value === "eval" ||
    value === "eval-details" ||
    value === "eval-state" ||
    value === "partial-eval" ||
    value === "residual" ||
    value === "residual-roundtrip" ||
    value === "policy-parse" ||
    value === "policy-compile" ||
    value === "policy-plan" ||
    value === "policy-eval"
  );
}

/**
 * parseBenchmarkStats validates timing statistics returned by the companion process.
 */
function parseBenchmarkStats(value: unknown): BenchmarkStats {
  if (!isRecord(value)) {
    throw new Error("cel-go benchmark returned malformed stats");
  }
  return {
    iterationsPerSample: numberField(value, "iterationsPerSample"),
    sampleCount: numberField(value, "sampleCount"),
    meanMs: numberField(value, "meanMs"),
    medianMs: numberField(value, "medianMs"),
    minMs: numberField(value, "minMs"),
    maxMs: numberField(value, "maxMs"),
    standardDeviationMs: numberField(value, "standardDeviationMs"),
    opsPerSecond: numberField(value, "opsPerSecond"),
    meanUsPerOp: numberField(value, "meanUsPerOp"),
    medianUsPerOp: numberField(value, "medianUsPerOp"),
  };
}

/**
 * numberField reads one required numeric property from a result object.
 */
function numberField(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (typeof field !== "number") {
    throw new Error(`cel-go benchmark returned a non-numeric ${key} field`);
  }
  return field;
}

/**
 * isRecord reports whether a value is a non-null object record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * benchmarkDocument renders the complete cross-runtime benchmark report.
 */
function benchmarkDocument(results: readonly BenchmarkResult[]): string {
  return `# CEL Benchmarking

This file is rewritten by:

\`\`\`sh
pnpm --filter @protoutil/cel run benchmark
\`\`\`

Generated at: \`${new Date().toISOString()}\`

## Methodology

These are in-process microbenchmarks for the CEL frontend and public program API plus the \`cel-go\` reference implementation on the same machine. Core planning and evaluation reuse equivalent public programs and activations in both implementations. Diagnostic evaluation rows form a feature ladder from literals through activation lookup, dispatch, dynamic and protobuf attributes, indexing, and folds. Residual rows separately measure state-tracking partial evaluation, residual AST construction, and the combined round trip. Policy measurements use the same synchronized YAML sources and separately cover parsing, compilation and composition, optimized planning, and steady-state evaluation. They are intended to provide a quick regression signal, not a universal cross-machine claim. Cross-runtime ratios are directional; changes in this package's own results over time are the primary regression signal.

- Runtime: \`node ${process.version}\`
- Go: \`${readGoVersion()}\`
- Platform: \`${process.platform}\`
- Arch: \`${process.arch}\`
- Samples per scenario: \`${sampleCount}\`
- Warmup samples per scenario: \`${warmupCount}\`
- Base iterations per sample: \`${iterationsPerSample}\` (scaled by operation cost)

## Diagnostic operations

- \`eval\` measures value-only execution.
- \`eval-details\` measures the public details-returning path without state observers.
- \`eval-state\` enables expression-state observation.
- \`partial-eval\` evaluates with explicit unknown attribute patterns and state tracking.
- \`residual\` reuses captured state to isolate pruning, rendering, parsing, and checking.
- \`residual-roundtrip\` combines partial evaluation and residual construction.

## Results

| Operation | Scenario | Implementation | Iterations | Mean us/op | Median us/op | Std dev | Ops/sec | Relative | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${formatComparisonRows(results)}
`;
}

/**
 * readGoVersion returns the selected Go toolchain version.
 */
function readGoVersion(): string {
  return execFileSync(resolveGoBinary(), ["env", "GOVERSION"], {
    encoding: "utf8",
  }).trim();
}

/**
 * formatComparisonRows renders paired TypeScript and cel-go result rows.
 */
function formatComparisonRows(results: readonly BenchmarkResult[]): string {
  const byKey = new Map<string, Map<BenchmarkImplementation, BenchmarkResult>>();
  for (const result of results) {
    const key = `${result.operation}::${result.scenario}`;
    const implementations = byKey.get(key) ?? new Map<BenchmarkImplementation, BenchmarkResult>();
    implementations.set(result.implementation, result);
    byKey.set(key, implementations);
  }

  return [...byKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, implementations]) => {
      const baseline = implementations.get("cel-go");
      return (["@protoutil/cel", "cel-go"] as const)
        .map((implementation) => implementations.get(implementation))
        .filter((result): result is BenchmarkResult => result !== undefined)
        .map(
          (result) =>
            `| \`${result.operation}\` | ${result.scenario} | \`${result.implementation}\` | ${result.stats.iterationsPerSample} | ${formatNumber(result.stats.meanUsPerOp)} | ${formatNumber(result.stats.medianUsPerOp)} | ${formatNumber(result.stats.standardDeviationMs)} ms | ${formatNumber(result.stats.opsPerSecond)} | ${describeRelativeSpeed(result, baseline)} | ${result.notes} |`,
        );
    })
    .join("\n");
}

/**
 * describeRelativeSpeed compares one result with its cel-go baseline.
 */
function describeRelativeSpeed(
  result: BenchmarkResult,
  celGoBaseline: BenchmarkResult | undefined,
): string {
  if (celGoBaseline === undefined) {
    return "n/a";
  }
  if (result.implementation === "cel-go") {
    return "baseline";
  }
  const ratio = celGoBaseline.stats.meanUsPerOp / result.stats.meanUsPerOp;
  return ratio >= 1 ? `${formatNumber(ratio)}x faster` : `${formatNumber(1 / ratio)}x slower`;
}

/**
 * formatNumber renders benchmark values consistently for the Markdown table.
 */
function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
