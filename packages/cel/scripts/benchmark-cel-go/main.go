package main

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/cel-go/cel"
	"github.com/google/cel-go/common"
	"github.com/google/cel-go/interpreter"
	"github.com/google/cel-go/parser"

	proto3pb "github.com/google/cel-go/test/proto3pb"
)

type benchmarkCase struct {
	name       string
	expression string
	envOptions []cel.EnvOption
	input      map[string]any
	expected   any
}

type plannerVariant struct {
	name    string
	options []cel.ProgramOption
}

type benchmarkOptions struct {
	operation           string
	scenario            string
	sampleCount         int
	warmupCount         int
	iterationsPerSample int
	notes               string
	run                 func() any
}

type iterationOptions struct {
	iterations int
	run        func() any
}

type benchmarkStats struct {
	IterationsPerSample int     `json:"iterationsPerSample"`
	SampleCount         int     `json:"sampleCount"`
	MeanMs              float64 `json:"meanMs"`
	MedianMs            float64 `json:"medianMs"`
	MinMs               float64 `json:"minMs"`
	MaxMs               float64 `json:"maxMs"`
	StandardDeviationMs float64 `json:"standardDeviationMs"`
	OpsPerSecond        float64 `json:"opsPerSecond"`
	MeanUsPerOp         float64 `json:"meanUsPerOp"`
	MedianUsPerOp       float64 `json:"medianUsPerOp"`
}

type benchmarkResult struct {
	Implementation string         `json:"implementation"`
	Operation      string         `json:"operation"`
	Scenario       string         `json:"scenario"`
	Stats          benchmarkStats `json:"stats"`
	Notes          string         `json:"notes"`
}

var benchmarkSink any

// main runs the cel-go half of the benchmark matrix and emits JSON for the TypeScript report writer.
func main() {
	sampleCount := envInt("CEL_BENCHMARK_SAMPLE_COUNT", 8)
	warmupCount := envInt("CEL_BENCHMARK_WARMUP_COUNT", 2)
	iterationsPerSample := envInt("CEL_BENCHMARK_ITERATIONS", 250)
	validateConfig(sampleCount, warmupCount, iterationsPerSample)

	results := make([]benchmarkResult, 0, 48)
	for _, benchmarkCase := range benchmarkCases() {
		fmt.Fprintf(os.Stderr, "Benchmarking cel-go: %s\n", benchmarkCase.name)
		results = append(
			results,
			runCase(benchmarkCase, sampleCount, warmupCount, iterationsPerSample)...,
		)
	}

	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	must(encoder.Encode(results))
}

// benchmarkCases builds the scenarios shared with the TypeScript benchmark harness.
func benchmarkCases() []benchmarkCase {
	users := make([]int64, 100)
	for index := range users {
		users[index] = int64(index)
	}
	protoInput := &proto3pb.TestAllTypes{
		NestedType: &proto3pb.TestAllTypes_SingleNestedMessage{
			SingleNestedMessage: &proto3pb.TestAllTypes_NestedMessage{Bb: 123},
		},
	}
	return []benchmarkCase{
		{
			name:       "scalar arithmetic",
			expression: "x + 1",
			envOptions: []cel.EnvOption{cel.Variable("x", cel.IntType)},
			input:      map[string]any{"x": int64(41)},
			expected:   int64(42),
		},
		{
			name:       "macro comprehension",
			expression: "users.exists(user, user > 50)",
			envOptions: []cel.EnvOption{cel.Variable("users", cel.ListType(cel.IntType))},
			input:      map[string]any{"users": users},
			expected:   true,
		},
		{
			name:       "constant regex",
			expression: "input.matches('^[a-z]+[0-9]{2}$')",
			envOptions: []cel.EnvOption{cel.Variable("input", cel.StringType)},
			input:      map[string]any{"input": "benchmark42"},
			expected:   true,
		},
		{
			name:       "protobuf field selection",
			expression: "msg.single_nested_message.bb == 123",
			envOptions: []cel.EnvOption{
				cel.Types(&proto3pb.TestAllTypes{}),
				cel.Variable("msg", cel.ObjectType("google.expr.proto3.test.TestAllTypes")),
			},
			input:    map[string]any{"msg": protoInput},
			expected: true,
		},
	}
}

// runCase prepares one cel-go environment and measures its frontend, planner, and interpreter paths.
func runCase(
	benchmarkCase benchmarkCase,
	sampleCount int,
	warmupCount int,
	iterationsPerSample int,
) []benchmarkResult {
	envOptions := append([]cel.EnvOption{cel.EnableMacroCallTracking()}, benchmarkCase.envOptions...)
	env, err := cel.NewEnv(envOptions...)
	must(err)

	parserValue, err := parser.NewParser(
		parser.Macros(parser.AllMacros...),
		parser.EnableOptionalSyntax(true),
		parser.MaxRecursionDepth(32),
		parser.ErrorRecoveryLimit(4),
		parser.ErrorRecoveryLookaheadTokenLimit(4),
		parser.PopulateMacroCalls(true),
	)
	must(err)

	parsed, issues := env.Parse(benchmarkCase.expression)
	mustIssues(issues, fmt.Sprintf("parse setup failed for %s", benchmarkCase.name))
	checked, issues := env.Check(parsed)
	mustIssues(issues, fmt.Sprintf("check setup failed for %s", benchmarkCase.name))
	if !checked.IsChecked() {
		panic(fmt.Sprintf("check setup did not produce a checked AST for %s", benchmarkCase.name))
	}

	results := frontendBenchmarks(
		benchmarkCase,
		env,
		parserValue,
		parsed,
		sampleCount,
		warmupCount,
		iterationsPerSample,
	)
	for _, variant := range plannerVariants(benchmarkCase) {
		scenario := fmt.Sprintf("%s / %s", benchmarkCase.name, variant.name)
		results = append(results, benchmark(benchmarkOptions{
			operation:           "plan",
			scenario:            scenario,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one checked AST and environment to isolate program planning cost.",
			run: func() any {
				program, err := env.Program(checked, variant.options...)
				must(err)
				return program
			},
		}))

		program, err := env.Program(checked, variant.options...)
		must(err)
		validateEvaluation(benchmarkCase, variant, program)
		results = append(results, benchmark(benchmarkOptions{
			operation:           "eval",
			scenario:            scenario,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one planned program and activation to isolate steady-state evaluation.",
			run: func() any {
				value, _, err := program.Eval(benchmarkCase.input)
				must(err)
				return value
			},
		}))
	}
	return results
}

// frontendBenchmarks measures parse, unparse, check, and combined compile throughput.
func frontendBenchmarks(
	benchmarkCase benchmarkCase,
	env *cel.Env,
	parserValue *parser.Parser,
	parsed *cel.Ast,
	sampleCount int,
	warmupCount int,
	iterationsPerSample int,
) []benchmarkResult {
	return []benchmarkResult{
		benchmark(benchmarkOptions{
			operation:           "parse",
			scenario:            benchmarkCase.name,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one parser instance to isolate steady-state parse throughput.",
			run: func() any {
				astValue, errors := parserValue.Parse(common.NewTextSource(benchmarkCase.expression))
				if errors != nil && len(errors.GetErrors()) > 0 {
					panic(errors.ToDisplayString())
				}
				return astValue
			},
		}),
		benchmark(benchmarkOptions{
			operation:           "unparse",
			scenario:            benchmarkCase.name,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one parsed AST to isolate unparser cost.",
			run: func() any {
				rendered, err := cel.AstToString(parsed)
				must(err)
				return rendered
			},
		}),
		benchmark(benchmarkOptions{
			operation:           "check",
			scenario:            benchmarkCase.name,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one parsed AST and checker environment to isolate checker cost.",
			run: func() any {
				astValue, issues := env.Check(parsed)
				mustIssues(issues, fmt.Sprintf("check failed for %s", benchmarkCase.name))
				return astValue
			},
		}),
		benchmark(benchmarkOptions{
			operation:           "compile",
			scenario:            benchmarkCase.name,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Runs parse plus check through shared parser and checker environment instances.",
			run: func() any {
				astValue, issues := env.Compile(benchmarkCase.expression)
				mustIssues(issues, fmt.Sprintf("compile failed for %s", benchmarkCase.name))
				return astValue
			},
		}),
	}
}

// plannerVariants returns the planning and execution modes measured for a scenario.
func plannerVariants(benchmarkCase benchmarkCase) []plannerVariant {
	variants := []plannerVariant{{name: "baseline"}}
	if benchmarkCase.name != "constant regex" {
		variants = append(variants, plannerVariant{
			name:    "optimized",
			options: []cel.ProgramOption{cel.EvalOptions(cel.OptOptimize)},
		})
	}
	if benchmarkCase.name == "constant regex" {
		variants = append(variants, plannerVariant{
			name: "compiled regex",
			options: []cel.ProgramOption{
				cel.OptimizeRegex(interpreter.MatchesRegexOptimization),
			},
		})
	}
	if benchmarkCase.name == "macro comprehension" {
		variants = append(variants, plannerVariant{
			name:    "runtime cost",
			options: []cel.ProgramOption{cel.CostTracking(nil)},
		})
	}
	return variants
}

// validateEvaluation verifies a planned variant before its execution is timed.
func validateEvaluation(
	benchmarkCase benchmarkCase,
	variant plannerVariant,
	program cel.Program,
) {
	value, _, err := program.Eval(benchmarkCase.input)
	must(err)
	if !reflect.DeepEqual(value.Value(), benchmarkCase.expected) {
		panic(fmt.Sprintf(
			"unexpected %s / %s result: got %v, wanted %v",
			benchmarkCase.name,
			variant.name,
			value.Value(),
			benchmarkCase.expected,
		))
	}
}

// benchmark warms up and samples one cel-go operation.
func benchmark(options benchmarkOptions) benchmarkResult {
	iterations := benchmarkIterations(
		options.operation,
		options.scenario,
		options.iterationsPerSample,
	)
	for index := 0; index < options.warmupCount; index++ {
		runIterations(iterationOptions{
			iterations: iterations,
			run:        options.run,
		})
	}

	durationsMs := make([]float64, 0, options.sampleCount)
	for index := 0; index < options.sampleCount; index++ {
		durationsMs = append(durationsMs, runIterations(iterationOptions{
			iterations: iterations,
			run:        options.run,
		}))
	}

	return benchmarkResult{
		Implementation: "cel-go",
		Operation:      options.operation,
		Scenario:       options.scenario,
		Stats:          computeStats(durationsMs, iterations),
		Notes:          options.notes,
	}
}

// benchmarkIterations scales the base count so expensive cases do not dominate total runtime.
func benchmarkIterations(operation string, scenario string, baseIterations int) int {
	if operation == "unparse" {
		return baseIterations * 20
	}
	if operation == "parse" || operation == "plan" {
		return baseIterations * 4
	}
	if operation != "eval" {
		return baseIterations
	}
	if strings.HasSuffix(scenario, "/ runtime cost") {
		return baseIterations
	}
	if strings.HasPrefix(scenario, "macro comprehension") {
		return baseIterations * 2
	}
	if strings.HasPrefix(scenario, "constant regex") && strings.HasSuffix(scenario, "/ baseline") {
		return baseIterations * 4
	}
	return baseIterations * 20
}

// runIterations executes and times one benchmark sample.
func runIterations(options iterationOptions) float64 {
	start := time.Now()
	for index := 0; index < options.iterations; index++ {
		benchmarkSink = options.run()
	}
	return float64(time.Since(start).Nanoseconds()) / float64(time.Millisecond)
}

// computeStats calculates aggregate latency and throughput for measured samples.
func computeStats(durationsMs []float64, iterationsPerSample int) benchmarkStats {
	meanMs := mean(durationsMs)
	medianMs := median(durationsMs)
	return benchmarkStats{
		IterationsPerSample: iterationsPerSample,
		SampleCount:         len(durationsMs),
		MeanMs:              meanMs,
		MedianMs:            medianMs,
		MinMs:               minValue(durationsMs),
		MaxMs:               maxValue(durationsMs),
		StandardDeviationMs: standardDeviation(durationsMs, meanMs),
		OpsPerSecond:        (float64(iterationsPerSample) * 1000.0) / meanMs,
		MeanUsPerOp:         (meanMs * 1000.0) / float64(iterationsPerSample),
		MedianUsPerOp:       (medianMs * 1000.0) / float64(iterationsPerSample),
	}
}

// mean returns the arithmetic mean of numeric values.
func mean(values []float64) float64 {
	total := 0.0
	for _, value := range values {
		total += value
	}
	return total / float64(len(values))
}

// median returns the middle value, or mean of the two middle values, in a numeric sample.
func median(values []float64) float64 {
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	middle := len(sorted) / 2
	if len(sorted)%2 == 0 {
		return (sorted[middle-1] + sorted[middle]) / 2
	}
	return sorted[middle]
}

// minValue returns the smallest numeric sample value.
func minValue(values []float64) float64 {
	best := values[0]
	for _, value := range values[1:] {
		if value < best {
			best = value
		}
	}
	return best
}

// maxValue returns the largest numeric sample value.
func maxValue(values []float64) float64 {
	best := values[0]
	for _, value := range values[1:] {
		if value > best {
			best = value
		}
	}
	return best
}

// standardDeviation returns the population standard deviation of numeric values.
func standardDeviation(values []float64, average float64) float64 {
	variance := 0.0
	for _, value := range values {
		delta := value - average
		variance += delta * delta
	}
	return sqrt(variance / float64(len(values)))
}

// sqrt computes a stable square-root approximation without adding benchmark-only dependencies.
func sqrt(value float64) float64 {
	if value == 0 {
		return 0
	}
	guess := value
	for index := 0; index < 16; index++ {
		guess = 0.5 * (guess + value/guess)
	}
	return guess
}

// envInt reads a positive integer benchmark setting from the environment.
func envInt(name string, fallback int) int {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	must(err)
	return value
}

// validateConfig rejects invalid benchmark sampling configuration.
func validateConfig(values ...int) {
	for _, value := range values {
		if value <= 0 {
			panic("benchmark sampling values must be positive")
		}
	}
}

// mustIssues converts cel-go issues into a benchmark setup or execution failure.
func mustIssues(issues *cel.Issues, context string) {
	if issues != nil && issues.Err() != nil {
		panic(fmt.Sprintf("%s: %v", context, issues.Err()))
	}
}

// must converts an unexpected error into a benchmark process failure.
func must(err error) {
	if err != nil {
		panic(err)
	}
}
