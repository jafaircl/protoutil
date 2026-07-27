/// <reference types="node" />
/// <reference types="vitest/globals" />

import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { check } from "./checker/checker.js";
import { type Env, env } from "./checker/env.js";
import type { AST } from "./common/ast/index.js";
import { defaultContainer } from "./common/containers.js";
import { variableDecl } from "./common/decls.js";
import { type Source, textSource } from "./common/source.js";
import { standardFunctions } from "./common/stdlib.js";
import {
  IntType,
  listType,
  objectType,
  registry,
  StringType,
  type Type,
} from "./common/types/index.js";
import {
  type TestAllTypes as Proto3TestAllTypes,
  TestAllTypesSchema as Proto3TestAllTypesSchema,
} from "./gen/test/proto3pb/test_all_types_pb.js";
import { type Dispatcher, dispatcher } from "./interpreter/dispatcher.js";
import { type ExecutionFrame, executionFrame } from "./interpreter/frame.js";
import type { InterpretableV2 } from "./interpreter/interpretable.js";
import {
  compileRegexConstantsConfig,
  type Interpreter,
  interpreter,
  optimizeConfig,
  type PlannerConfig,
} from "./interpreter/interpreter.js";
import { matchesRegexOptimization } from "./interpreter/optimizations.js";
import { CostTracker, costObserverConfig } from "./interpreter/runtime-cost.js";
import { type Parser, parser } from "./parser/parser.js";
import { unparse } from "./parser/unparser.js";

/**
 * BenchmarkOperation identifies the isolated CEL operation measured by a result row.
 */
type BenchmarkOperation = "parse" | "unparse" | "check" | "compile" | "plan" | "eval";

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
   * config configures the interpreter planner for this variant.
   */
  readonly config?: PlannerConfig;
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
   * parser is reused to isolate steady-state parser throughput.
   */
  readonly parser: Parser;

  /**
   * checkerEnv contains the declarations required by the expression.
   */
  readonly checkerEnv: Env;

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
   * runtime is the reusable interpreter used to plan each variant.
   */
  readonly runtime: Interpreter;
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
 * benchmarkFile is the generated Markdown report path.
 */
const benchmarkFile = new URL("../BENCHMARK.md", import.meta.url);

/**
 * packageDir is the package working directory used by the cel-go companion process.
 */
const packageDir = fileURLToPath(new URL("..", import.meta.url));

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
  return results;
}

/**
 * benchmarkContext prepares reusable parser, checker, registry, and interpreter state.
 */
function benchmarkContext(benchmarkCase: BenchmarkCase): BenchmarkContext {
  const parserValue = parser({
    enableOptionalSyntax: true,
    maxRecursionDepth: 32,
    errorRecoveryLimit: 4,
    errorRecoveryTokenLookaheadLimit: 4,
    populateMacroCalls: true,
  });
  const registryValue = registry([
    { $typeName: Proto3TestAllTypesSchema.typeName } as never,
    Proto3TestAllTypesSchema,
  ]);
  const checkerEnv = env(defaultContainer, registryValue, {
    crossTypeNumericComparisons: true,
  });
  checkerEnv.addFunctions(...standardFunctions());
  checkerEnv.addIdents(
    ...benchmarkCase.variables.map((variable) => variableDecl(variable.name, variable.type)),
  );
  const source = textSource(benchmarkCase.expression);
  const parsed = parserValue.parse(benchmarkCase.expression);
  const checked = check(parsed, source, checkerEnv);
  const runtime = interpreter({
    dispatcher: standardDispatcher(),
    provider: registryValue,
    adapter: registryValue,
  });
  return {
    benchmarkCase,
    parser: parserValue,
    checkerEnv,
    source,
    parsed,
    checked,
    runtime,
  };
}

/**
 * standardDispatcher builds a dispatcher loaded with standard-library runtime overloads.
 */
function standardDispatcher(): Dispatcher {
  const runtimeDispatcher = dispatcher();
  for (const declaration of standardFunctions()) {
    const overloads = declaration.bindings();
    if (overloads.length !== 0) {
      runtimeDispatcher.add({ overloads });
    }
  }
  return runtimeDispatcher;
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
      notes: "Reuses one parser instance to isolate steady-state parse throughput.",
      run: () => context.parser.parse(benchmarkCase.expression),
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
      notes: "Reuses one parsed AST and checker environment to isolate checker cost.",
      run: () => check(context.parsed, context.source, context.checkerEnv),
    }),
    benchmark({
      operation: "compile",
      scenario: benchmarkCase.name,
      notes: "Runs parse plus check through shared parser and checker environment instances.",
      run: () => {
        const parsed = context.parser.parse(benchmarkCase.expression);
        return check(parsed, textSource(benchmarkCase.expression), context.checkerEnv);
      },
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
        notes: "Reuses one checked AST and interpreter to isolate program planning cost.",
        run: () =>
          context.runtime.interpretable({
            exprAst: context.checked,
            plannerConfig: variant.config,
          }),
      }),
    );

    const program = context.runtime.interpretable({
      exprAst: context.checked,
      plannerConfig: variant.config,
    });
    const frame = executionFrame({ input: context.benchmarkCase.input });
    validateEvaluation({ context, program, frame, variant });
    results.push(
      benchmark({
        operation: "eval",
        scenario,
        notes: "Reuses one planned program and execution frame to isolate steady-state evaluation.",
        run: () => program.exec(frame),
      }),
    );
    frame.close();
  }
  return results;
}

/**
 * plannerVariants returns the meaningful planner modes for one benchmark case.
 */
function plannerVariants(benchmarkCase: BenchmarkCase): readonly PlannerVariant[] {
  const variants: PlannerVariant[] = [{ name: "baseline" }];
  if (benchmarkCase.name !== "constant regex") {
    variants.push({ name: "optimized", config: optimizeConfig() });
  }
  if (benchmarkCase.name === "constant regex") {
    variants.push({
      name: "compiled regex",
      config: compileRegexConstantsConfig({ optimizations: [matchesRegexOptimization] }),
    });
  }
  if (benchmarkCase.name === "macro comprehension") {
    variants.push({
      name: "runtime cost",
      config: costObserverConfig({
        trackerFactory: () => new CostTracker({}),
      }),
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
   * program is the planned interpreter program being validated.
   */
  readonly program: InterpretableV2;

  /**
   * frame supplies the activation used by the evaluation.
   */
  readonly frame: ExecutionFrame;

  /**
   * variant identifies the planner mode for diagnostic messages.
   */
  readonly variant: PlannerVariant;
}

/**
 * validateEvaluation verifies a planner variant before its execution is timed.
 */
function validateEvaluation(options: ValidateEvaluationOptions): void {
  const actual = options.program.exec(options.frame).value();
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
  if (operation === "parse" || operation === "plan") {
    return baseIterations * 4;
  }
  if (operation !== "eval") {
    return baseIterations;
  }
  if (scenario.endsWith("/ runtime cost")) {
    return baseIterations;
  }
  if (scenario.startsWith("macro comprehension")) {
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
  const stdout = execFileSync(goBinary, ["run", "./scripts/benchmark-cel-go"], {
    cwd: packageDir,
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
    value === "eval"
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

These are in-process microbenchmarks for the CEL frontend, planner, and interpreter plus the \`cel-go\` reference implementation on the same machine. They are intended to provide a quick regression signal for steady-state throughput, not a universal cross-machine claim. Cross-runtime ratios are directional; changes in this package's own results over time are the primary regression signal.

- Runtime: \`node ${process.version}\`
- Go: \`${readGoVersion()}\`
- Platform: \`${process.platform}\`
- Arch: \`${process.arch}\`
- Samples per scenario: \`${sampleCount}\`
- Warmup samples per scenario: \`${warmupCount}\`
- Base iterations per sample: \`${iterationsPerSample}\` (scaled by operation cost)

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
