package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"reflect"
	"sort"
	"strconv"
	"time"

	"github.com/google/cel-go/cel"
	envconfig "github.com/google/cel-go/common/env"
	"github.com/google/cel-go/ext"
	"github.com/google/cel-go/interpreter"
	"github.com/google/cel-go/policy"

	proto3pb "github.com/google/cel-go/test/proto3pb"
	"go.yaml.in/yaml/v3"
)

type benchmarkCase struct {
	name       string
	expression string
	envOptions []cel.EnvOption
	input      map[string]any
	expected   any
}

// residualBenchmarkCase describes a partial-evaluation workload shared with TypeScript.
type residualBenchmarkCase struct {
	name             string
	expression       string
	envOptions       []cel.EnvOption
	input            map[string]any
	unknowns         []residualUnknownAttribute
	expectedResidual string
}

// residualUnknownAttribute describes one root variable and its string field qualifiers.
type residualUnknownAttribute struct {
	variable   string
	qualifiers []string
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

// policyDocument contains one synchronized upstream YAML source.
type policyDocument struct {
	Source string `json:"source"`
}

// policyFixture contains the synchronized documents for one upstream policy suite.
type policyFixture struct {
	Path  string                    `json:"path"`
	Files map[string]policyDocument `json:"files"`
}

// policyTestInput describes a literal or CEL expression activation value.
type policyTestInput struct {
	Value any    `yaml:"value"`
	Expr  string `yaml:"expr"`
}

// policyTestCase describes one policy evaluation input.
type policyTestCase struct {
	Name  string                     `yaml:"name"`
	Input map[string]policyTestInput `yaml:"input"`
}

// policyTestSection groups related policy evaluation inputs.
type policyTestSection struct {
	Name  string           `yaml:"name"`
	Tests []policyTestCase `yaml:"tests"`
}

// policyTestSuite is the synchronized policy tests.yaml shape.
type policyTestSuite struct {
	Section  []policyTestSection `yaml:"section"`
	Sections []policyTestSection `yaml:"sections"`
}

// policyBenchmarkCase pairs one scenario name with a reusable activation.
type policyBenchmarkCase struct {
	scenario   string
	activation interpreter.Activation
}

// policyBenchmarkContext stores reusable policy setup for parse, compile, plan, and eval rows.
type policyBenchmarkContext struct {
	fixture      policyFixture
	environment  *cel.Env
	parsedPolicy *policy.Policy
	ast          *cel.Ast
	program      cel.Program
	cases        []policyBenchmarkCase
}

// policyCompileOptions configures one benchmark policy compilation.
type policyCompileOptions struct {
	environment  *cel.Env
	parsedPolicy *policy.Policy
	scenario     string
}

// evaluationValidationOptions configures one pre-benchmark CEL correctness check.
type evaluationValidationOptions struct {
	benchmarkCase benchmarkCase
	variant       plannerVariant
	program       cel.Program
	activation    interpreter.Activation
}

// frontendBenchmarkOptions configures the frontend rows for one CEL expression.
type frontendBenchmarkOptions struct {
	benchmarkCase       benchmarkCase
	environment         *cel.Env
	parsed              *cel.Ast
	sampleCount         int
	warmupCount         int
	iterationsPerSample int
}

// policyFixtureFiles selects representative successful synchronized policy suites.
var policyFixtureFiles = []string{
	"unnest.json",
	"nested-rule7.json",
	"required-labels.json",
}

var benchmarkSink any

// policyEvalPrimingIterations warms each policy input before policy-eval samples begin.
//
// The fixed count avoids making the first fixture case pay for JavaScript runtime tier-up while
// keeping the cel-go and TypeScript harnesses equivalent.
const policyEvalPrimingIterations = 20_000

// minimumWarmupIterations mirrors the TypeScript harness warmup contract so both implementations
// discard the same amount of work before sampling. Go has no tiering compiler, so the extended
// warmup changes little here; keeping the contract identical is what makes the ratio meaningful.
var minimumWarmupIterations = envInt("CEL_BENCHMARK_WARMUP_ITERATIONS", 20000)

// warmupBudgetMs bounds the extended warmup so expensive rows do not dominate total runtime.
var warmupBudgetMs = envInt("CEL_BENCHMARK_WARMUP_BUDGET_MS", 300)

// targetSampleMs is the duration each measured sample aims to occupy.
var targetSampleMs = float64(envInt("CEL_BENCHMARK_TARGET_SAMPLE_MS", 15))

// iterationsOverride pins the iteration count, bypassing calibration, for reproducible reruns.
var iterationsOverride = envInt("CEL_BENCHMARK_ITERATIONS", 0)

// calibrationFloorMs is the shortest probe duration accepted when estimating operation cost.
const calibrationFloorMs = 1

// maximumIterations bounds calibration for operations too cheap to time individually.
const maximumIterations = 5_000_000

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
	for _, benchmarkCase := range diagnosticCases() {
		fmt.Fprintf(os.Stderr, "Benchmarking cel-go diagnostic: %s\n", benchmarkCase.name)
		results = append(
			results,
			runDiagnosticCase(benchmarkCase, sampleCount, warmupCount, iterationsPerSample)...,
		)
	}
	for _, benchmarkCase := range residualCases() {
		fmt.Fprintf(os.Stderr, "Benchmarking cel-go residual: %s\n", benchmarkCase.name)
		results = append(
			results,
			runResidualCase(benchmarkCase, sampleCount, warmupCount, iterationsPerSample)...,
		)
	}
	for _, fixtureFile := range policyFixtureFiles {
		fixture := readPolicyFixture(fixtureFile)
		fmt.Fprintf(os.Stderr, "Benchmarking cel-go policy: %s\n", fixture.Path)
		results = append(
			results,
			runPolicyCase(fixture, sampleCount, warmupCount, iterationsPerSample)...,
		)
	}

	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	must(encoder.Encode(results))
}

// diagnosticCases builds an evaluation ladder for isolating incremental runtime feature cost.
func diagnosticCases() []benchmarkCase {
	values := make([]int64, 100)
	for index := range values {
		values[index] = int64(index)
	}
	protoInput := &proto3pb.TestAllTypes{
		NestedType: &proto3pb.TestAllTypes_SingleNestedMessage{
			SingleNestedMessage: &proto3pb.TestAllTypes_NestedMessage{Bb: 123},
		},
	}
	return []benchmarkCase{
		{
			name:       "diagnostic / literal",
			expression: "true",
			input:      map[string]any{},
			expected:   true,
		},
		{
			name:       "diagnostic / identifier",
			expression: "x",
			envOptions: []cel.EnvOption{cel.Variable("x", cel.IntType)},
			input:      map[string]any{"x": int64(41)},
			expected:   int64(41),
		},
		{
			name:       "diagnostic / binary call",
			expression: "x + 1",
			envOptions: []cel.EnvOption{cel.Variable("x", cel.IntType)},
			input:      map[string]any{"x": int64(41)},
			expected:   int64(42),
		},
		{
			name:       "diagnostic / member call",
			expression: "input.startsWith('bench')",
			envOptions: []cel.EnvOption{cel.Variable("input", cel.StringType)},
			input:      map[string]any{"input": "benchmark"},
			expected:   true,
		},
		{
			name:       "diagnostic / dynamic map selection",
			expression: "labels.env == 'prod'",
			envOptions: []cel.EnvOption{cel.Variable("labels", cel.MapType(cel.StringType, cel.StringType))},
			input:      map[string]any{"labels": map[string]string{"env": "prod"}},
			expected:   true,
		},
		{
			name:       "diagnostic / list index",
			expression: "values[50] == 50",
			envOptions: []cel.EnvOption{cel.Variable("values", cel.ListType(cel.IntType))},
			input:      map[string]any{"values": values},
			expected:   true,
		},
		{
			name:       "diagnostic / fold early exit",
			expression: "values.exists(value, value > 50)",
			envOptions: []cel.EnvOption{cel.Variable("values", cel.ListType(cel.IntType))},
			input:      map[string]any{"values": values},
			expected:   true,
		},
		{
			name:       "diagnostic / fold full scan",
			expression: "values.exists(value, value > 100)",
			envOptions: []cel.EnvOption{cel.Variable("values", cel.ListType(cel.IntType))},
			input:      map[string]any{"values": values},
			expected:   false,
		},
		{
			name:       "diagnostic / protobuf field",
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

// residualCases mirrors upstream branch and macro residualization scenarios.
func residualCases() []residualBenchmarkCase {
	return []residualBenchmarkCase{
		{
			name:       "known branch pruning",
			expression: "x < 10 && (y == 0 || 'hello' != 'goodbye')",
			envOptions: []cel.EnvOption{
				cel.Variable("x", cel.IntType),
				cel.Variable("y", cel.IntType),
			},
			input: map[string]any{},
			unknowns: []residualUnknownAttribute{
				{variable: "x"},
				{variable: "y"},
			},
			expectedResidual: "x < 10",
		},
		{
			name:       "macro pruning",
			expression: "x.exists(i, i < 10) && [11, 12, 13].all(i, i in [y, 12, 13])",
			envOptions: []cel.EnvOption{
				cel.Variable("x", cel.ListType(cel.IntType)),
				cel.Variable("y", cel.IntType),
			},
			input: map[string]any{"y": int64(11)},
			unknowns: []residualUnknownAttribute{
				{variable: "x"},
			},
			expectedResidual: "x.exists(i, i < 10)",
		},
		{
			name: "qualified attribute pruning",
			expression: `resource.name.startsWith("bucket/my-bucket") &&
				bool(request.auth.claims.email_verified) == true &&
				request.auth.claims.email == "wiley@acme.co"`,
			envOptions: []cel.EnvOption{
				cel.Variable("resource.name", cel.StringType),
				cel.Variable("request.auth.claims", cel.MapType(cel.StringType, cel.StringType)),
			},
			input: map[string]any{
				"resource.name":       "bucket/my-bucket/objects/private",
				"request.auth.claims": map[string]string{"email_verified": "true"},
			},
			unknowns: []residualUnknownAttribute{
				{variable: "request.auth.claims", qualifiers: []string{"email"}},
			},
			expectedResidual: `request.auth.claims.email == "wiley@acme.co"`,
		},
	}
}

// readPolicyFixture loads one synchronized policy fixture used by both benchmark implementations.
func readPolicyFixture(fileName string) policyFixture {
	contents, err := os.ReadFile("../../testdata/policy/" + fileName)
	must(err)
	fixture := policyFixture{}
	must(json.Unmarshal(contents, &fixture))
	if fixture.Path == "" || fixture.Files["policy.yaml"].Source == "" ||
		fixture.Files["tests.yaml"].Source == "" {
		panic(fmt.Sprintf("malformed synchronized policy fixture: %s", fileName))
	}
	return fixture
}

// runPolicyCase prepares one cel-go policy suite and measures its policy feature paths.
func runPolicyCase(
	fixture policyFixture,
	sampleCount int,
	warmupCount int,
	iterationsPerSample int,
) []benchmarkResult {
	context := policyContext(fixture)
	results := []benchmarkResult{
		benchmark(benchmarkOptions{
			operation:           "policy-parse",
			scenario:            fixture.Path,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Parses the synchronized upstream YAML policy source.",
			run: func() any {
				return parsePolicyFixture(fixture)
			},
		}),
		benchmark(benchmarkOptions{
			operation:           "policy-compile",
			scenario:            fixture.Path,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one parsed policy and configured environment to isolate policy compilation.",
			run: func() any {
				return compilePolicyFixture(policyCompileOptions{
					environment:  context.environment,
					parsedPolicy: context.parsedPolicy,
					scenario:     fixture.Path,
				})
			},
		}),
		benchmark(benchmarkOptions{
			operation:           "policy-plan",
			scenario:            fixture.Path,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one compiled policy AST and environment to isolate optimized planning.",
			run: func() any {
				program, err := context.environment.Program(
					context.ast,
					cel.EvalOptions(cel.OptOptimize),
				)
				must(err)
				return program
			},
		}),
	}
	primePolicyEvaluations(context)
	for _, benchmarkCase := range context.cases {
		currentCase := benchmarkCase
		results = append(results, benchmark(benchmarkOptions{
			operation:           "policy-eval",
			scenario:            currentCase.scenario,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one optimized policy program and prepared activation.",
			run: func() any {
				value, _, err := context.program.Eval(currentCase.activation)
				must(err)
				return value
			},
		}))
	}
	return results
}

// primePolicyEvaluations warms all policy evaluation paths in round-robin order before sampling.
func primePolicyEvaluations(context policyBenchmarkContext) {
	for iteration := 0; iteration < policyEvalPrimingIterations; iteration++ {
		for _, benchmarkCase := range context.cases {
			value, _, err := context.program.Eval(benchmarkCase.activation)
			must(err)
			benchmarkSink = value
		}
	}
}

// policyContext prepares one environment, policy, AST, optimized program, and evaluation case set.
func policyContext(fixture policyFixture) policyBenchmarkContext {
	environment := policyEnvironment(fixture)
	parsedPolicy := parsePolicyFixture(fixture)
	ast := compilePolicyFixture(policyCompileOptions{
		environment:  environment,
		parsedPolicy: parsedPolicy,
		scenario:     fixture.Path,
	})
	program, err := environment.Program(ast, cel.EvalOptions(cel.OptOptimize))
	must(err)
	cases := policyBenchmarkCases(environment, fixture)
	for _, benchmarkCase := range cases {
		value, _, evalErr := program.Eval(benchmarkCase.activation)
		must(evalErr)
		if value == nil {
			panic(fmt.Sprintf("policy evaluation returned nil for %s", benchmarkCase.scenario))
		}
	}
	return policyBenchmarkContext{
		fixture:      fixture,
		environment:  environment,
		parsedPolicy: parsedPolicy,
		ast:          ast,
		program:      program,
		cases:        cases,
	}
}

// policyEnvironment configures cel-go with standard policy libraries and serialized declarations.
func policyEnvironment(fixture policyFixture) *cel.Env {
	environment, err := cel.NewCustomEnv(
		cel.OptionalTypes(),
		cel.EnableMacroCallTracking(),
		cel.ExtendedValidations(),
		ext.Bindings(),
	)
	must(err)
	configDocument, found := fixture.Files["config.yaml"]
	if !found {
		return environment
	}
	config := &envconfig.Config{}
	must(yaml.Unmarshal([]byte(configDocument.Source), config))
	environment, err = environment.Extend(policy.FromConfig(config))
	must(err)
	return environment
}

// parsePolicyFixture parses one synchronized policy and rejects diagnostics.
func parsePolicyFixture(fixture policyFixture) *policy.Policy {
	parserValue, err := policy.NewParser()
	must(err)
	parsedPolicy, issues := parserValue.Parse(
		policy.StringSource(fixture.Files["policy.yaml"].Source, fixture.Path+"/policy.yaml"),
	)
	mustIssues(issues, fmt.Sprintf("policy parse failed for %s", fixture.Path))
	if parsedPolicy == nil {
		panic(fmt.Sprintf("policy parse returned nil for %s", fixture.Path))
	}
	return parsedPolicy
}

// compilePolicyFixture compiles one parsed policy and rejects diagnostics.
func compilePolicyFixture(options policyCompileOptions) *cel.Ast {
	ast, issues := policy.Compile(options.environment, options.parsedPolicy)
	mustIssues(issues, fmt.Sprintf("policy compile failed for %s", options.scenario))
	if ast == nil {
		panic(fmt.Sprintf("policy compile returned nil for %s", options.scenario))
	}
	return ast
}

// policyBenchmarkCases expands synchronized test sections into prepared activations.
func policyBenchmarkCases(
	environment *cel.Env,
	fixture policyFixture,
) []policyBenchmarkCase {
	suite := policyTestSuite{}
	must(yaml.Unmarshal([]byte(fixture.Files["tests.yaml"].Source), &suite))
	sections := suite.Section
	if len(sections) == 0 {
		sections = suite.Sections
	}
	cases := make([]policyBenchmarkCase, 0)
	for _, section := range sections {
		for _, testCase := range section.Tests {
			input := make(map[string]any, len(testCase.Input))
			for name, value := range testCase.Input {
				if value.Expr == "" {
					input[name] = value.Value
					continue
				}
				input[name] = evaluatePolicyInput(environment, value.Expr)
			}
			activation, err := interpreter.NewActivation(input)
			must(err)
			cases = append(cases, policyBenchmarkCase{
				scenario:   fmt.Sprintf("%s / %s / %s", fixture.Path, section.Name, testCase.Name),
				activation: activation,
			})
		}
	}
	if len(cases) == 0 {
		panic(fmt.Sprintf("policy fixture has no evaluation cases: %s", fixture.Path))
	}
	return cases
}

// evaluatePolicyInput evaluates an expression-based policy input in an empty activation.
func evaluatePolicyInput(environment *cel.Env, expression string) any {
	ast, issues := environment.Compile(expression)
	mustIssues(issues, fmt.Sprintf("policy input compile failed for %q", expression))
	program, err := environment.Program(ast)
	must(err)
	value, _, err := program.Eval(cel.NoVars())
	must(err)
	return value
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

	parsed, issues := env.Parse(benchmarkCase.expression)
	mustIssues(issues, fmt.Sprintf("parse setup failed for %s", benchmarkCase.name))
	checked, issues := env.Check(parsed)
	mustIssues(issues, fmt.Sprintf("check setup failed for %s", benchmarkCase.name))
	if !checked.IsChecked() {
		panic(fmt.Sprintf("check setup did not produce a checked AST for %s", benchmarkCase.name))
	}

	results := frontendBenchmarks(frontendBenchmarkOptions{
		benchmarkCase:       benchmarkCase,
		environment:         env,
		parsed:              parsed,
		sampleCount:         sampleCount,
		warmupCount:         warmupCount,
		iterationsPerSample: iterationsPerSample,
	})
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
		activationValue, err := interpreter.NewActivation(benchmarkCase.input)
		must(err)
		validateEvaluation(evaluationValidationOptions{
			benchmarkCase: benchmarkCase,
			variant:       variant,
			program:       program,
			activation:    activationValue,
		})
		results = append(results, benchmark(benchmarkOptions{
			operation:           "eval",
			scenario:            scenario,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one planned program and activation to isolate steady-state evaluation.",
			run: func() any {
				value, _, err := program.Eval(activationValue)
				must(err)
				return value
			},
		}))
	}
	return results
}

// runDiagnosticCase measures baseline evaluation, public details, and state observation.
func runDiagnosticCase(
	benchmarkCase benchmarkCase,
	sampleCount int,
	warmupCount int,
	iterationsPerSample int,
) []benchmarkResult {
	envOptions := append([]cel.EnvOption{cel.EnableMacroCallTracking()}, benchmarkCase.envOptions...)
	env, err := cel.NewEnv(envOptions...)
	must(err)
	ast, issues := env.Compile(benchmarkCase.expression)
	mustIssues(issues, fmt.Sprintf("diagnostic compile failed for %s", benchmarkCase.name))
	program, err := env.Program(ast)
	must(err)
	stateProgram, err := env.Program(ast, cel.EvalOptions(cel.OptTrackState))
	must(err)
	activationValue, err := interpreter.NewActivation(benchmarkCase.input)
	must(err)
	validateEvaluation(evaluationValidationOptions{
		benchmarkCase: benchmarkCase,
		variant:       plannerVariant{name: "diagnostic"},
		program:       program,
		activation:    activationValue,
	})
	stateValue, _, err := stateProgram.Eval(activationValue)
	must(err)
	if !reflect.DeepEqual(stateValue.Value(), benchmarkCase.expected) {
		panic(fmt.Sprintf(
			"unexpected %s state-tracking result: got %v, wanted %v",
			benchmarkCase.name,
			stateValue.Value(),
			benchmarkCase.expected,
		))
	}
	return []benchmarkResult{
		benchmark(benchmarkOptions{
			operation:           "eval",
			scenario:            benchmarkCase.name,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one baseline program and activation to expose incremental runtime feature cost.",
			run: func() any {
				value, _, evalErr := program.Eval(activationValue)
				must(evalErr)
				return value
			},
		}),
		benchmark(benchmarkOptions{
			operation:           "eval-details",
			scenario:            benchmarkCase.name,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one baseline program and activation while returning public evaluation details.",
			run: func() any {
				value, details, evalErr := program.Eval(activationValue)
				must(evalErr)
				if details != nil {
					return details
				}
				return value
			},
		}),
		benchmark(benchmarkOptions{
			operation:           "eval-state",
			scenario:            benchmarkCase.name,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one state-tracking program and activation to isolate observer overhead.",
			run: func() any {
				value, details, evalErr := stateProgram.Eval(activationValue)
				must(evalErr)
				if details != nil {
					return details
				}
				return value
			},
		}),
	}
}

// runResidualCase measures partial evaluation, residual construction, and their combined path.
func runResidualCase(
	benchmarkCase residualBenchmarkCase,
	sampleCount int,
	warmupCount int,
	iterationsPerSample int,
) []benchmarkResult {
	envOptions := append([]cel.EnvOption{cel.EnableMacroCallTracking()}, benchmarkCase.envOptions...)
	env, err := cel.NewEnv(envOptions...)
	must(err)
	ast, issues := env.Compile(benchmarkCase.expression)
	mustIssues(issues, fmt.Sprintf("residual compile failed for %s", benchmarkCase.name))
	program, err := env.Program(ast, cel.EvalOptions(cel.OptTrackState, cel.OptPartialEval))
	must(err)
	unknowns := make([]*interpreter.AttributePattern, 0, len(benchmarkCase.unknowns))
	for _, unknown := range benchmarkCase.unknowns {
		pattern := cel.AttributePattern(unknown.variable)
		for _, qualifier := range unknown.qualifiers {
			pattern = pattern.QualString(qualifier)
		}
		unknowns = append(unknowns, pattern)
	}
	input, err := cel.PartialVars(benchmarkCase.input, unknowns...)
	must(err)
	_, details, err := program.Eval(input)
	must(err)
	residual, err := env.ResidualAst(ast, details)
	must(err)
	rendered, err := cel.AstToString(residual)
	must(err)
	if rendered != benchmarkCase.expectedResidual {
		panic(fmt.Sprintf(
			"unexpected %s residual: %s; wanted %s",
			benchmarkCase.name,
			rendered,
			benchmarkCase.expectedResidual,
		))
	}
	return []benchmarkResult{
		benchmark(benchmarkOptions{
			operation:           "partial-eval",
			scenario:            benchmarkCase.name,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one state-tracking partial program and inferred unknown activation.",
			run: func() any {
				value, evalDetails, evalErr := program.Eval(input)
				must(evalErr)
				if evalDetails != nil {
					return evalDetails
				}
				return value
			},
		}),
		benchmark(benchmarkOptions{
			operation:           "residual",
			scenario:            benchmarkCase.name,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Reuses one evaluated state to isolate prune, render, parse, and re-check cost.",
			run: func() any {
				residualValue, residualErr := env.ResidualAst(ast, details)
				must(residualErr)
				return residualValue
			},
		}),
		benchmark(benchmarkOptions{
			operation:           "residual-roundtrip",
			scenario:            benchmarkCase.name,
			sampleCount:         sampleCount,
			warmupCount:         warmupCount,
			iterationsPerSample: iterationsPerSample,
			notes:               "Measures partial evaluation followed by residual AST construction.",
			run: func() any {
				_, evalDetails, evalErr := program.Eval(input)
				must(evalErr)
				residualValue, residualErr := env.ResidualAst(ast, evalDetails)
				must(residualErr)
				return residualValue
			},
		}),
	}
}

// frontendBenchmarks measures parse, unparse, check, and combined compile throughput.
func frontendBenchmarks(options frontendBenchmarkOptions) []benchmarkResult {
	return []benchmarkResult{
		benchmark(benchmarkOptions{
			operation:           "parse",
			scenario:            options.benchmarkCase.name,
			sampleCount:         options.sampleCount,
			warmupCount:         options.warmupCount,
			iterationsPerSample: options.iterationsPerSample,
			notes:               "Reuses one public environment to isolate steady-state parse throughput.",
			run: func() any {
				astValue, issues := options.environment.Parse(options.benchmarkCase.expression)
				mustIssues(issues, fmt.Sprintf("parse failed for %s", options.benchmarkCase.name))
				return astValue
			},
		}),
		benchmark(benchmarkOptions{
			operation:           "unparse",
			scenario:            options.benchmarkCase.name,
			sampleCount:         options.sampleCount,
			warmupCount:         options.warmupCount,
			iterationsPerSample: options.iterationsPerSample,
			notes:               "Reuses one parsed AST to isolate unparser cost.",
			run: func() any {
				rendered, err := cel.AstToString(options.parsed)
				must(err)
				return rendered
			},
		}),
		benchmark(benchmarkOptions{
			operation:           "check",
			scenario:            options.benchmarkCase.name,
			sampleCount:         options.sampleCount,
			warmupCount:         options.warmupCount,
			iterationsPerSample: options.iterationsPerSample,
			notes:               "Reuses one parsed AST and public environment to isolate checker cost.",
			run: func() any {
				astValue, issues := options.environment.Check(options.parsed)
				mustIssues(issues, fmt.Sprintf("check failed for %s", options.benchmarkCase.name))
				return astValue
			},
		}),
		benchmark(benchmarkOptions{
			operation:           "compile",
			scenario:            options.benchmarkCase.name,
			sampleCount:         options.sampleCount,
			warmupCount:         options.warmupCount,
			iterationsPerSample: options.iterationsPerSample,
			notes:               "Runs parse plus check through one public environment.",
			run: func() any {
				astValue, issues := options.environment.Compile(options.benchmarkCase.expression)
				mustIssues(issues, fmt.Sprintf("compile failed for %s", options.benchmarkCase.name))
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
func validateEvaluation(options evaluationValidationOptions) {
	value, _, err := options.program.Eval(options.activation)
	must(err)
	if !reflect.DeepEqual(value.Value(), options.benchmarkCase.expected) {
		panic(fmt.Sprintf(
			"unexpected %s / %s result: got %v, wanted %v",
			options.benchmarkCase.name,
			options.variant.name,
			value.Value(),
			options.benchmarkCase.expected,
		))
	}
}

// benchmark warms up and samples one cel-go operation.
func benchmark(options benchmarkOptions) benchmarkResult {
	iterations := calibrateIterations(options.run)
	runWarmup(options.warmupCount, iterationOptions{
		iterations: iterations,
		run:        options.run,
	})

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

// calibrateIterations chooses an iteration count that makes one sample last targetSampleMs.
//
// This mirrors the TypeScript harness so both implementations resolve cheap and expensive rows
// equally well. Fixed per-operation multipliers previously produced sub-millisecond samples in
// which scheduler noise, not the operation, dominated the measured spread.
func calibrateIterations(run func() any) int {
	if iterationsOverride > 0 {
		return iterationsOverride
	}
	iterations := 1
	for {
		elapsedMs := runIterations(iterationOptions{iterations: iterations, run: run})
		if elapsedMs >= calibrationFloorMs {
			perOperationMs := elapsedMs / float64(iterations)
			target := int(math.Round(targetSampleMs / perOperationMs))
			if target > maximumIterations {
				target = maximumIterations
			}
			if target < 1 {
				target = 1
			}
			return target
		}
		if iterations >= maximumIterations {
			return iterations
		}
		iterations *= 4
	}
}

// runWarmup executes discarded operations until the row reaches steady state.
//
// Every row runs the configured warmup samples, then keeps going until it has executed
// minimumWarmupIterations operations or exhausted warmupBudgetMs, whichever happens first.
func runWarmup(warmupCount int, options iterationOptions) {
	executed := 0
	for index := 0; index < warmupCount; index++ {
		runIterations(options)
		executed += options.iterations
	}
	deadline := time.Now().Add(time.Duration(warmupBudgetMs) * time.Millisecond)
	for executed < minimumWarmupIterations && time.Now().Before(deadline) {
		runIterations(options)
		executed += options.iterations
	}
}

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
