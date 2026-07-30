import { readFileSync } from "node:fs";
import {
  createFileRegistry,
  type DescFile,
  fromBinary,
  fromJson,
  type Message,
  type MessageShape,
} from "@bufbuild/protobuf";
import { FileDescriptorSetSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { type CostEstimator, sizeEstimate } from "../checker/cost.js";
import { formatCELType, formatCheckedType } from "../checker/format.js";
import {
  Config,
  Function as ConfigFunction,
  LibrarySubset as ConfigLibrarySubset,
  Overload as ConfigOverload,
  Validator as ConfigValidator,
  Variable as ConfigVariable,
  ContextVariable,
  Extension,
  Feature,
  Import,
  Limit,
  TypeDesc,
} from "../common/env/env.js";
import { syncedCases } from "../common/spec-helpers.js";
import { textSource } from "../common/source.js";
import type { Bytes } from "../common/types/bytes.js";
import { resolveSyncedExpr, resolveSyncedVariableDecl } from "../common/types/spec-helpers.js";
import { type Expr, ExprSchema } from "../gen/cel/expr/syntax_pb.js";
import { TestAllTypesSchema as Proto2TestAllTypesSchema } from "../gen/test/proto2pb/test_all_types_pb.js";
import {
  TestAllTypesSchema as Proto3TestAllTypesSchema,
  TestAllTypes_NestedEnum,
  TestJsonNamesSchema,
} from "../gen/test/proto3pb/test_all_types_pb.js";
import {
  AnyType,
  type AST,
  astOutputType,
  astToString,
  BoolType,
  BytesType,
  String as CelString,
  container,
  contextProtoVars,
  compile,
  DefaultTypeAdapter,
  Double,
  DoubleType,
  DurationType,
  DynType,
  durationOf,
  EnvironmentFunction,
  EnvironmentOverload,
  Err,
  ErrorType,
  env,
  errorAsIssues,
  errorsValue,
  extendedValidations,
  False,
  type FunctionDecl,
  fold,
  functionDecl,
  functionReference,
  IntType,
  IntZero,
  identReference,
  inline,
  isError,
  issues,
  JSONValueType,
  LibrarySubset,
  type Lister,
  listType,
  mapType,
  memberOverload,
  nullableType,
  objectType,
  operators,
  optionalType,
  optionalTypes,
  declOverload as overload,
  overloads,
  type ReferenceInfo,
  Registry,
  registry,
  StringType,
  TimestampType,
  True,
  TypeType,
  timestampInTimezone,
  timestampOf,
  typeToExprType,
  typeTypeWithParam,
  UintType,
  Unknown,
  type Val,
  validateComprehensionNestingLimit,
  variableDecl,
} from "../index.js";
import { emptyActivation } from "../interpreter/activation.js";
import { adaptLegacyDecorator } from "../interpreter/decorators.js";
import {
  constValue,
  type Interpretable,
  type InterpretableAttribute,
  type InterpretableCall,
  type InterpretableConst,
  type InterpretableV2,
} from "../interpreter/interpretable.js";
import {
  ExistsMacro,
  ExistsOneMacro,
  FilterMacro,
  globalMacro,
  globalVarArgMacro,
  HasMacro,
  MapMacro,
  receiverMacro,
} from "../parser/macro.js";
import type { Macro } from "../parser/options.js";

/**
 * teamDescriptorFiles decodes the synced cel-go dynamic protobuf fixture with Buf.
 */
function teamDescriptorFiles(): DescFile[] {
  const bytes = readFileSync(
    new URL("../../testdata/cel-go-files/cel/testdata/team.fds", import.meta.url),
  );
  return [...createFileRegistry(fromBinary(FileDescriptorSetSchema, bytes)).files];
}

/**
 * proto3ContextMessage creates the populated upstream context-proto input.
 *
 * Decoding an empty wire message supplies the protobuf reflection defaults required by Buf
 * without using the generic create helper for this known generated message shape.
 */
function proto3ContextMessage(): MessageShape<typeof Proto3TestAllTypesSchema> {
  const message = fromBinary(Proto3TestAllTypesSchema, new Uint8Array());
  message.singleInt64 = 1n;
  message.singleDouble = 1;
  message.singleBool = true;
  message.standaloneEnum = TestAllTypes_NestedEnum.FOO;
  message.repeatedInt32 = [1, 2];
  message.mapStringString = { "": "" };
  return message;
}

/**
 * customInteropMacros creates the renamed standard expanders and custom map helpers exercised by
 * cel-go's legacy and modern macro interoperability tests.
 */
function customInteropMacros(): Macro[] {
  const existsOne = receiverMacro("exists_one", 2, (helper, target, args) =>
    ExistsOneMacro.expander(helper, target, args),
  );
  const transform = receiverMacro("transform", 2, (helper, target, args) =>
    MapMacro.expander(helper, target, args),
  );
  const filter = receiverMacro("filter", 2, (helper, target, args) =>
    FilterMacro.expander(helper, target, args),
  );
  const pair = globalMacro("pair", 2, (helper, _target, args) =>
    helper.map(helper.mapEntry(args[0]!, args[1]!, false)),
  );
  const get = receiverMacro("get", 2, (helper, target, args) => {
    if (target === undefined) {
      return helper.error(0, "missing macro target");
    }
    const field = args[0]?.asIdent();
    if (field === undefined) {
      return helper.error(args[0]?.id() ?? 0, "field argument must be an identifier");
    }
    return helper.call(
      operators.Conditional,
      helper.presenceTest(helper.copy(target), field),
      helper.call(operators.Index, helper.copy(target), helper.literal(field)),
      helper.copy(args[1]!),
    );
  });
  return [existsOne, transform, filter, pair, get];
}

/**
 * isInterpretableCall reports whether a planned instruction exposes call metadata.
 */
function isInterpretableCall(value: Interpretable): value is InterpretableCall {
  return (
    "functionName" in value &&
    typeof value.functionName === "function" &&
    "args" in value &&
    typeof value.args === "function"
  );
}

/**
 * isInterpretableConst reports whether a planned instruction exposes a constant value.
 */
function isInterpretableConst(value: Interpretable): value is InterpretableConst {
  return "value" in value && typeof value.value === "function";
}

/**
 * isInterpretableAttribute reports whether a planned instruction exposes attribute metadata.
 */
function isInterpretableAttribute(value: Interpretable): value is InterpretableAttribute {
  return "attr" in value && typeof value.attr === "function";
}

/**
 * candidateVariableNames reads namespaced attribute candidates from a planned attribute.
 */
function candidateVariableNames(value: InterpretableAttribute): string[] {
  const attribute = value.attr();
  if (
    !("candidateVariableNames" in attribute) ||
    typeof attribute.candidateVariableNames !== "function"
  ) {
    throw new Error("planned attribute does not expose candidate variable names");
  }
  return attribute.candidateVariableNames() as string[];
}

/**
 * syncedCostRange decodes a cel-go CostEstimate fixture expression into its minimum and maximum.
 */
function syncedCostRange(value: { $expr: string }): [bigint, bigint] {
  if (value.$expr === "zeroCost") {
    return [0n, 0n];
  }
  const match = /CostEstimate\{Min:\s*(\d+),\s*Max:\s*(\d+)\}/.exec(value.$expr);
  if (match === null) {
    throw new Error(`unsupported synced cost estimate: ${value.$expr}`);
  }
  return [BigInt(match[1]!), BigInt(match[2]!)];
}

/**
 * IncompatibleJSONRegistry models a custom provider wrapper that cannot be reconfigured.
 */
class IncompatibleJSONRegistry extends Registry {
  /** withJSONFieldNames rejects JSON-name configuration through the wrapped provider. */
  public override withJSONFieldNames(_enabled: boolean): void {
    throw new Error("protobuf JSON field name configuration is unsupported");
  }
}

/**
 * invalidEnvironmentConfig builds each synced invalid environment configuration case.
 */
function invalidEnvironmentConfig(name: string): Config {
  const config = new Config(name);
  switch (name) {
    case "bad container":
      return config.setContainer(".hello.world");
    case "colliding imports":
      return config.addImports(new Import("pkg.ImportName"), new Import("pkg2.ImportName"));
    case "invalid subset":
      return config.setStdLib(new ConfigLibrarySubset().setDisableMacros(true));
    case "invalid import":
      return config.addImports(new Import(""));
    case "invalid context proto":
      return config.setContextVariable(new ContextVariable("invalid"));
    case "undefined variable type":
      return config.addVariables(new ConfigVariable("undef", new TypeDesc("undefined")));
    case "undefined function type":
      return config.addFunctions(
        new ConfigFunction("invalid", [
          new ConfigOverload("invalid", [], new TypeDesc("undefined")),
        ]),
      );
    case "unrecognized extension":
      return config.addExtensions(new Extension("unrecognized", "latest"));
    case "invalid validator config":
      return config.addValidators(new ConfigValidator("cel.validator.comprehension_nesting_limit"));
    case "invalid validator config type - unsupported type":
      return config.addValidators(
        new ConfigValidator("cel.validator.comprehension_nesting_limit").setConfig({
          limit: "2",
        }),
      );
    case "invalid validator config type - fractional":
      return config.addValidators(
        new ConfigValidator("cel.validator.comprehension_nesting_limit").setConfig({
          limit: 2.5,
        }),
      );
    case "invalid cel_bind validator config":
      return config.addValidators(new ConfigValidator("cel.validator.bind_nesting_limit"));
    case "invalid cel_bind validator config type - unsupported type":
      return config.addValidators(
        new ConfigValidator("cel.validator.bind_nesting_limit").setConfig({
          limit: "2",
        }),
      );
    case "invalid cel_bind validator config type - fractional":
      return config.addValidators(
        new ConfigValidator("cel.validator.bind_nesting_limit").setConfig({
          limit: 2.5,
        }),
      );
    default:
      throw new Error(`unsupported invalid environment config case: ${name}`);
  }
}

describe("cel/cel_test.go/TestCompile", () => {
  it("compiles an executable program and reports type errors", () => {
    const program = compile('"hello " + name', {
      variables: [variableDecl("name", StringType)],
    });

    expect(program.eval({ name: "world" }).value()).toBe("hello world");
    expect(() => compile('1 + "invalid"')).toThrow();
  });
});

describe("Env.optimize", () => {
  it("applies ergonomic inline and fold passes in order", () => {
    const celEnv = env({
      variables: [variableDecl("greeting", StringType), variableDecl("subject", StringType)],
    });
    const optimized = celEnv.optimize(
      celEnv.compile('greeting + ", " + subject + "!"'),
      inline({
        greeting: celEnv.compile('"Hello"'),
      }),
      fold({ subject: "world" }),
    );

    expect(astToString(optimized)).toBe('"Hello, world!"');
  });

  it("accepts checked CEL expressions as inline definitions", () => {
    const celEnv = env({
      variables: [variableDecl("subtotal", IntType)],
    });
    const optimized = celEnv.optimize(
      celEnv.compile("subtotal * 2"),
      inline({
        subtotal: celEnv.compile("2 + 3"),
      }),
      fold(),
    );

    expect(astToString(optimized)).toBe("10");
  });
});

describe("cel/env_test.go/TestLibraries", () => {
  it("tracks the standard library and deduplicates singleton extensions", () => {
    const celEnv = env({
      libraries: [optionalTypes(), optionalTypes()],
    });

    expect(celEnv.hasLibrary("cel.lib.std")).toBe(true);
    expect(celEnv.hasLibrary("cel.lib.optional")).toBe(true);
    expect(celEnv.libraries().sort()).toEqual(["cel.lib.optional", "cel.lib.std"]);

    const extendedEnv = celEnv.extend();
    expect(extendedEnv.hasLibrary("cel.lib.optional")).toBe(true);
    expect(extendedEnv.tryCompile("optional.of(1).hasValue()").errors).toBeUndefined();
  });
});

describe("cel/env_test.go/TestFunctions", () => {
  it("reports functions configured by an extension library", () => {
    const celEnv = env({ libraries: [optionalTypes()] });

    for (const expected of ["optional.of", "or"]) {
      expect(celEnv.hasFunction(expected)).toBe(true);
      expect(celEnv.functions().has(expected)).toBe(true);
    }
  });
});

describe("cel/env_test.go/TestEnvVariableValidation", () => {
  it("applies every synced duplicate variable and constant rule", () => {
    const cases = syncedCases<{
      name: string;
      opts: Array<{ $expr: string }>;
      wantErr?: string;
    }>("cel/env_test.go/TestEnvVariableValidation");

    for (const testCase of cases) {
      const variables = testCase.opts.map((option) => resolveSyncedVariableDecl(option));
      if (testCase.wantErr) {
        expect(() => env({ variables }), testCase.name).toThrow(testCase.wantErr);
        continue;
      }
      const celEnv = env({ variables });
      expect(celEnv.tryCompile("foo").errors, testCase.name).toBeUndefined();
    }
  });
});

describe("cel/cel_test.go/TestMacroSubset", () => {
  it("enables only the selected parser macro", () => {
    const celEnv = env({
      macros: {
        custom: [HasMacro],
        standard: false,
      },
      variables: [variableDecl("name", mapType(StringType, StringType))],
    });
    const result = celEnv
      .program(celEnv.compile("has(name.first)"))
      .eval({ name: { first: "Jim" } });

    expect(result.value()).toBe(true);
    expect(celEnv.tryCompile("[1, 2].all(i, i > 0)").errors).toBeDefined();
  });
});

describe("cel/cel_test.go/Test_ExampleWithBuiltins", () => {
  it("compiles and evaluates an expression using standard functions", () => {
    const celEnv = env({
      variables: [variableDecl("i", StringType), variableDecl("you", StringType)],
    });
    const ast = celEnv.compile(`"Hello " + you + "! I'm " + i + "."`);
    const program = celEnv.program(ast);

    const result = program.eval({
      i: "CEL",
      you: "world",
    });

    expect(result.value()).toBe("Hello world! I'm CEL.");
  });
});

describe("cel/cel_test.go/TestEval", () => {
  it("compiles and evaluates each synced expression", () => {
    const cases = syncedCases<{
      expr: string;
      in: Record<string, unknown>;
    }>("cel/cel_test.go/TestEval");
    const celEnv = env({
      variables: [variableDecl("input", listType(IntType))],
    });

    for (const testCase of cases) {
      const ast = celEnv.compile(testCase.expr);
      const program = celEnv.program(ast, {
        interruptCheckFrequency: 100,
      });
      const controller = new AbortController();

      expect(program.eval(testCase.in).value()).toBe(true);
      expect(
        program
          .contextEval(testCase.in, {
            signal: controller.signal,
          })
          .value(),
      ).toBe(true);
    }
  });
});

describe("cel/cel_test.go/TestAbbrevsCompiled", () => {
  it("resolves abbreviations while checking an expression", () => {
    // Test whether abbreviations successfully resolve at type-check time (compile time).
    const celEnv = env({
      container: container({ abbrevs: ["qualified.identifier.name"] }),
      variables: [variableDecl("qualified.identifier.name.first", StringType)],
    });
    // The abbreviation is resolved while compiling the checked expression.
    const program = celEnv.program(celEnv.compile(`"hello " + name.first`));
    const result = program.eval({
      "qualified.identifier.name.first": "Jim",
    });

    expect(result.value()).toBe("hello Jim");
  });
});

describe("cel/cel_test.go/TestAbbrevsParsed", () => {
  it("resolves abbreviations while evaluating a parsed expression", () => {
    // Test whether abbreviations are resolved properly at evaluation time.
    const celEnv = env({
      container: container({ abbrevs: ["qualified.identifier.name"] }),
    });
    // Without checking, the abbreviation is resolved while planning the program.
    const program = celEnv.program(celEnv.parse(`"hello " + name.first`));
    const result = program.eval({
      "qualified.identifier.name": {
        first: "Jim",
      },
    });

    expect(result.value()).toBe("hello Jim");
  });
});

describe("cel/cel_test.go/TestCustomEnv", () => {
  it("evaluates declared attributes without installing standard operators", () => {
    const celEnv = env({
      standardLibrary: false,
      variables: [variableDecl("a.b.c", BoolType)],
    });

    expect(celEnv.tryCompile("a.b.c == true").errors).toBeDefined();
    expect(celEnv.program(celEnv.compile("a.b.c")).eval({ "a.b.c": true }).value()).toBe(true);
  });
});

describe("cel/cel_test.go/TestCrossTypeNumericComparisons", () => {
  it("controls statically typed comparisons without changing dynamic comparisons", () => {
    const cases = [
      {
        crossTypeNumericComparisons: false,
        expression: "1.0 < 2",
        wantsError: true,
      },
      {
        crossTypeNumericComparisons: true,
        expression: "1.0 < 2",
        wantsError: false,
      },
      {
        crossTypeNumericComparisons: false,
        expression: "dyn(1.0) < 2",
        wantsError: false,
      },
      {
        crossTypeNumericComparisons: true,
        expression: "dyn(1.0) < 2",
        wantsError: false,
      },
    ];

    for (const testCase of cases) {
      const celEnv = env({
        checker: {
          crossTypeNumericComparisons: testCase.crossTypeNumericComparisons,
        },
      });
      const result = celEnv.tryCompile(testCase.expression);
      if (testCase.wantsError) {
        expect(result.errors, testCase.expression).toBeDefined();
        continue;
      }
      expect(result.errors, testCase.expression).toBeUndefined();
      expect(celEnv.program(result.ast).eval({}).value(), testCase.expression).toBe(true);
    }
  });
});

describe("cel/cel_test.go/TestOptionalValuesCompile", () => {
  it("resolves every synced optional selection and function overload", () => {
    const cases = syncedCases<{
      expr: string;
      references: Record<string, { $expr: string }>;
    }>("cel/cel_test.go/TestOptionalValuesCompile");
    const celEnv = env({
      libraries: [optionalTypes()],
      variables: [
        variableDecl("m", mapType(StringType, mapType(StringType, StringType))),
        variableDecl("optm", optionalType(mapType(StringType, mapType(StringType, StringType)))),
        variableDecl("l", listType(StringType)),
        variableDecl("optl", optionalType(listType(StringType))),
        variableDecl("x", optionalType(IntType)),
        variableDecl("y", IntType),
      ],
    });

    for (const testCase of cases) {
      const references = celEnv.compile(testCase.expr).referenceMap();
      for (const [id, expected] of Object.entries(testCase.references)) {
        expect(
          references.get(Number(id))?.equals(resolveExpectedReference(expected)),
          `${testCase.expr} reference ${id}`,
        ).toBe(true);
      }
    }
  });
});

/**
 * resolveExpectedReference decodes the synced cel-go reference literals used by compile tests.
 */
function resolveExpectedReference(value: { $expr: string }): ReferenceInfo {
  const name = /^\{Name: "([^"]+)"\}$/.exec(value.$expr);
  if (name) {
    return identReference(name[1]!);
  }
  const overloads = /^\{OverloadIDs: \[\]string\{([^}]*)\}\}$/.exec(value.$expr);
  if (overloads) {
    return functionReference(
      ...[...overloads[1]!.matchAll(/"([^"]+)"/g)].map((match) => match[1]!),
    );
  }
  throw new Error(`unsupported reference expression: ${value.$expr}`);
}

describe("cel/cel_test.go/TestOptionalValuesEvalErrorCases", () => {
  it("preserves optional receiver and argument errors from every synced case", () => {
    const cases = syncedCases<{
      expr: string;
      wantErr: string;
    }>("cel/cel_test.go/TestOptionalValuesEvalErrorCases");
    const celEnv = env({ libraries: [optionalTypes()] });

    for (const testCase of cases) {
      const result = celEnv.program(celEnv.compile(testCase.expr)).eval({});
      expect(result, testCase.expr).toBeInstanceOf(Err);
      expect((result as Err).message, testCase.expr).toContain(testCase.wantErr);
    }
  });
});

describe("cel/cel_test.go/TestOptionalMacroError", () => {
  it("validates macro variables and gates optFlatMap by library version", () => {
    const currentEnv = env({
      libraries: [optionalTypes()],
      variables: [variableDecl("x", optionalType(IntType))],
    });

    for (const expression of ["x.optMap(y.z, y.z + 1)", "x.optFlatMap(y.z, y.z + 1)"]) {
      expect(currentEnv.tryCompile(expression).errors?.toDisplayString()).toContain(
        "variable name must be a simple identifier",
      );
    }

    const versionZeroEnv = env({
      libraries: [optionalTypes({ version: 0 })],
      variables: [variableDecl("x", optionalType(IntType))],
    });
    expect(versionZeroEnv.tryCompile("x.optFlatMap(y, y + 1)").errors?.toDisplayString()).toContain(
      "undeclared reference to 'optFlatMap'",
    );
  });
});

describe("cel/cel_test.go/TestAstIsChecked", () => {
  it("distinguishes parsed and compiled ASTs", () => {
    const celEnv = env();

    expect(celEnv.parse("true").isChecked()).toBe(false);
    expect(celEnv.compile("true").isChecked()).toBe(true);
  });
});

describe("cel/cel_test.go/TestParseError", () => {
  it("returns parse diagnostics without throwing", () => {
    const result = env().tryParse("invalid & logical_and");

    expect(result.errors?.getErrors()).not.toHaveLength(0);
  });
});

describe("cel/cel_test.go/TestEnvExtensionIsolation", () => {
  it("isolates declarations added to sibling environments", () => {
    const baseEnv = env({
      variables: [variableDecl("age", IntType)],
    });
    const env1 = baseEnv.extend({
      variables: [variableDecl("name", StringType)],
    });
    const env2 = baseEnv.extend({
      variables: [variableDecl("group", StringType)],
    });

    expect(env1.tryCompile("age > 20 && name.size() > 10").errors).toBeUndefined();
    expect(env1.tryCompile("group.size() > 10").errors).toBeDefined();
    expect(env2.tryCompile("age > 20 && group.size() > 10").errors).toBeUndefined();
    expect(env2.tryCompile("name.size() > 10").errors).toBeDefined();
  });
});

describe("cel/cel_test.go/TestEnvExtension", () => {
  it("preserves inherited custom macros when adding macros to an extension", () => {
    const fooMacro = globalMacro("foo", 0, (helper) => helper.literal("foo"));
    const barMacro = globalMacro("bar", 0, (helper) => helper.literal("bar"));
    const baseEnv = env({
      macros: {
        custom: [fooMacro],
      },
    });
    const extendedEnv = baseEnv.extend({
      macros: {
        custom: [barMacro],
      },
    });

    expect(extendedEnv.program(extendedEnv.compile("foo()")).eval({}).value()).toBe("foo");
    expect(extendedEnv.program(extendedEnv.compile("bar()")).eval({}).value()).toBe("bar");
  });
});

describe("cel/cel_test.go/TestContextEval", () => {
  it("evaluates comprehensions and observes cancellation", () => {
    const celEnv = env({
      variables: [variableDecl("items", listType(IntType))],
    });
    const ast = celEnv.compile("items.map(i, i * 2).filter(i, i >= 50).size()");
    const program = celEnv.program(ast, {
      interruptCheckFrequency: 1,
    });
    const items = Array.from({ length: 2_000 }, (_, index) => index);
    const activeController = new AbortController();

    expect(
      program
        .contextEval(
          { items },
          {
            signal: activeController.signal,
          },
        )
        .value(),
    ).toBe(1_975n);

    const abortedController = new AbortController();
    abortedController.abort();
    const interrupted = program.contextEval(
      { items },
      {
        signal: abortedController.signal,
      },
    );

    expect(interrupted).toBeInstanceOf(Err);
    if (!(interrupted instanceof Err)) {
      throw new Error("expected an interrupted CEL error value");
    }
    expect(interrupted.message).toContain("operation interrupted");
  });
});

describe("cel/cel_example_test.go/Example", () => {
  it("supports custom member functions and lazy input bindings", () => {
    const celEnv = env({
      variables: [variableDecl("i", StringType), variableDecl("you", StringType)],
      functions: [
        functionDecl("greet", {
          overloads: [
            memberOverload("string_greet_string", [StringType, StringType], StringType, {
              binaryBinding: (left, right) =>
                new CelString(
                  `Hello ${String(right.value())}! Nice to meet you, I'm ${String(left.value())}.`,
                ),
            }),
          ],
        }),
      ],
    });
    const ast = celEnv.compile("i.greet(you)");
    const program = celEnv.program(ast);

    const result = program.eval({
      i: "CEL",
      you: () => new CelString("world"),
    });

    expect(result.value()).toBe("Hello world! Nice to meet you, I'm CEL.");
  });
});

describe("cel/cel_example_test.go/Example_statefulOverload", () => {
  it("replaces a base binding in an extended environment", () => {
    const baseEnv = env({
      functions: [fetchDeclaration()],
    });
    const ast = baseEnv.compile("fetch('my-resource') == 'my-value'");
    const runtimeEnv = baseEnv.extend({
      functions: [fetchDeclaration("my-value")],
    });
    const program = runtimeEnv.program(ast);

    expect(program.eval({}).value()).toBe(true);
  });
});

/**
 * fetchDeclaration creates the state-dependent function used by the cel-go example.
 */
function fetchDeclaration(value?: string): FunctionDecl {
  return functionDecl("fetch", {
    overloads: [
      overload("fetch_string", [StringType], StringType, {
        unaryBinding: () =>
          value === undefined ? new Err("stateful context not bound") : new CelString(value),
      }),
    ],
  });
}

describe("cel/env_test.go/TestCELTypeAdapter", () => {
  it("exposes the configured CEL adapter and provider", () => {
    const celEnv = env();

    expect(celEnv.typeAdapter()).toBeDefined();
    expect(celEnv.typeProvider()).toBeDefined();
  });
});

describe("cel/cel_example_test.go/Example_globalOverload", () => {
  it("defines and evaluates a global overload", () => {
    // The GlobalOverload example demonstrates how to define global overload function.
    // Create the CEL environment with declarations for the input attributes and
    // the desired extension functions. In many cases the desired functionality will
    // be present in a built-in function.
    const celEnv = env({
      variables: [variableDecl("i", StringType), variableDecl("you", StringType)],
      functions: [
        functionDecl("shake_hands", {
          overloads: [
            overload("shake_hands_string_string", [StringType, StringType], StringType, {
              binaryBinding: (left, right) =>
                new CelString(`${left.value()} and ${right.value()} are shaking hands.`),
            }),
          ],
        }),
      ],
    });

    // Compile the expression and create the program.
    const program = celEnv.program(celEnv.compile("shake_hands(i, you)"));

    // Evaluate the program against some inputs. Values may also be lazily supplied.
    const result = program.eval({
      i: "CEL",
      you: () => new CelString("world"),
    });

    expect(result.value()).toBe("CEL and world are shaking hands.");
  });
});

describe("cel/cel_test.go/TestAbbrevsDisambiguation", () => {
  it("distinguishes an abbreviated variable from a fully qualified protobuf type", () => {
    const typeRegistry = registry();
    typeRegistry.registerDescriptor(ExprSchema.file);
    const celEnv = env({
      container: container({
        name: "cel.expr",
        abbrevs: ["external.Expr"],
      }),
      registry: typeRegistry,
      variables: [variableDecl("test", BoolType), variableDecl("external.Expr", StringType)],
    });
    // This expression returns either a string or a protobuf Expr value depending on `test`.
    // The fully qualified type name disambiguates the protobuf type from `external.Expr`.
    const program = celEnv.program(celEnv.compile(`test ? dyn(Expr) : cel.expr.Expr{id: 1}`));

    expect(
      program
        .eval({
          test: true,
          "external.Expr": "string expr",
        })
        .value(),
    ).toBe("string expr");

    const message = program
      .eval({
        test: false,
        "external.Expr": "wrong expr",
      })
      .value() as MessageShape<typeof ExprSchema>;
    expect(message.id).toBe(1n);
  });
});

describe("cel/cel_test.go/TestConvertToNativeJSONStructure", () => {
  it("converts an evaluated map and list into a protobuf JSON value", () => {
    const celEnv = env();
    const result = celEnv
      .program(
        celEnv.compile(`{
          "parts": [{"kind": "text"}]
        }`),
      )
      .eval({});

    expect(result.convertToNative(JSONValueType)).toEqual(
      fromJson(ValueSchema, {
        parts: [{ kind: "text" }],
      }),
    );
  });
});

describe("cel/cel_test.go/TestCustomEnvError", () => {
  it("surfaces incompatible duplicate declarations during custom environment construction", () => {
    expect(() =>
      env({
        standardLibrary: false,
        functions: [
          functionDecl("duplicate", {
            overloads: [overload("duplicate_overload", [], StringType)],
          }),
          functionDecl("duplicate", {
            overloads: [overload("duplicate_overload", [], IntType)],
          }),
        ],
      }),
    ).toThrow(/merge failed/);
  });
});

describe("cel/cel_test.go/TestExtendStdlibFunction", () => {
  it("extends contains with a bytes overload while retaining the string overload", () => {
    const celEnv = env({
      functions: [
        functionDecl(overloads.Contains, {
          overloads: [
            memberOverload("bytes_contains_bytes", [BytesType, BytesType], BoolType, {
              binaryBinding: (value, substring) => {
                const haystack = (value as Bytes).value();
                const needle = (substring as Bytes).value();
                const found = new TextDecoder()
                  .decode(haystack)
                  .includes(new TextDecoder().decode(needle));
                return found ? True : False;
              },
            }),
          ],
        }),
      ],
    });

    expect(
      celEnv
        .program(celEnv.compile(`b'string'.contains(b'tri') && 'string'.contains('tri')`))
        .eval({}),
    ).toBe(True);
  });
});

describe("cel/cel_test.go/TestSubsetStdLib", () => {
  const subset = new LibrarySubset()
    .addIncludedMacros("has")
    .addIncludedFunctions(
      new EnvironmentFunction(operators.Equals),
      new EnvironmentFunction(operators.NotEquals),
      new EnvironmentFunction(operators.LogicalAnd),
      new EnvironmentFunction(operators.LogicalOr),
      new EnvironmentFunction(operators.LogicalNot),
      new EnvironmentFunction(overloads.Size, [new EnvironmentOverload(overloads.SizeListInst)]),
    );
  const celEnv = env({ standardLibrary: { subset } });
  const cases = syncedCases<{
    compiles: boolean;
    expr: string;
    name: string;
    want?: unknown;
  }>("cel/cel_test.go/TestSubsetStdLib");

  for (const testCase of cases) {
    it(testCase.name, () => {
      const compiled = celEnv.tryCompile(testCase.expr);
      expect(compiled.errors === undefined).toBe(testCase.compiles);
      if (!testCase.compiles) {
        return;
      }
      const expected = resolveSyncedExpr(testCase.want);
      expect(celEnv.program(compiled.ast).eval({}).value()).toEqual(
        typeof expected === "object" &&
          expected !== null &&
          "value" in expected &&
          typeof expected.value === "function"
          ? expected.value()
          : expected,
      );
    });
  }
});

describe("cel/cel_test.go/TestSubsetStdLibError", () => {
  it("rejects subsets which both include and exclude macros", () => {
    const subset = new LibrarySubset().addIncludedMacros("has").addExcludedMacros("exists");
    expect(() => env({ standardLibrary: { subset } })).toThrow("invalid subset");
  });
});

describe("cel/cel_test.go/TestSubsetStdLibMerge", () => {
  it("merges a compatible custom declaration into the selected standard overload", () => {
    const subset = new LibrarySubset().addIncludedFunctions(
      new EnvironmentFunction(overloads.Size, [new EnvironmentOverload(overloads.SizeStringInst)]),
    );
    expect(() =>
      env({
        functions: [
          functionDecl(overloads.Size, {
            overloads: [memberOverload(overloads.SizeStringInst, [StringType], IntType)],
          }),
        ],
        standardLibrary: { subset },
      }),
    ).not.toThrow();
  });
});

describe("cel/cel_test.go/TestSubsetStdLibMergeError", () => {
  it("rejects a selected overload merged with an incompatible result type", () => {
    const subset = new LibrarySubset().addIncludedFunctions(
      new EnvironmentFunction(overloads.Size, [new EnvironmentOverload(overloads.SizeStringInst)]),
    );
    expect(() =>
      env({
        functions: [
          functionDecl(overloads.Size, {
            overloads: [memberOverload(overloads.SizeStringInst, [StringType], UintType)],
          }),
        ],
        standardLibrary: { subset },
      }),
    ).toThrow("merge failed");
  });
});

describe("cel/cel_test.go/TestCustomTypes", () => {
  it("registers protobuf descriptors alongside custom CEL types", () => {
    const typeRegistry = registry();
    typeRegistry.registerDescriptor(ExprSchema.file);
    const celEnv = env({
      container: container({ name: "cel.expr" }),
      registry: typeRegistry,
      types: [BoolType, IntType, StringType],
      variables: [variableDecl("expr", objectType(ExprSchema.typeName))],
    });
    const ast = celEnv.compile(`
      expr == Expr{id: 2,
        call_expr: Expr.Call{
          function: "_==_",
          args: [
            Expr{id: 1, ident_expr: Expr.Ident{name: "a"}},
            Expr{id: 3, ident_expr: Expr.Ident{name: "b"}}]
        }}`);
    const input: Expr = {
      $typeName: ExprSchema.typeName,
      id: 2n,
      exprKind: {
        case: "callExpr",
        value: {
          $typeName: "cel.expr.Expr.Call",
          args: [
            {
              $typeName: ExprSchema.typeName,
              id: 1n,
              exprKind: {
                case: "identExpr",
                value: {
                  $typeName: "cel.expr.Expr.Ident",
                  name: "a",
                },
              },
            },
            {
              $typeName: ExprSchema.typeName,
              id: 3n,
              exprKind: {
                case: "identExpr",
                value: {
                  $typeName: "cel.expr.Expr.Ident",
                  name: "b",
                },
              },
            },
          ],
          function: "_==_",
        },
      },
    };

    expect(astOutputType(ast)).toBe(BoolType);
    expect(celEnv.program(ast).eval({ expr: input }).value()).toBe(true);
  });
});

describe("cel/cel_test.go/TestTypeIsolation", () => {
  it("does not leak dynamically registered descriptor types between environments", () => {
    const descriptors = teamDescriptorFiles();
    const isolatedRegistry = registry();
    for (const descriptor of descriptors) {
      isolatedRegistry.registerDescriptor(descriptor);
    }
    const typedEnv = env({
      registry: isolatedRegistry,
      variables: [variableDecl("myteam", objectType("cel.testdata.Team"))],
    });
    const expression = "myteam.members[0].name == 'Cyclops'";

    expect(typedEnv.tryCompile(expression).errors).toBeUndefined();
    expect(
      env({
        variables: [variableDecl("myteam", objectType("cel.testdata.Team"))],
      }).tryCompile(expression).errors,
    ).toBeDefined();
  });
});

describe("cel/cel_test.go/TestDynamicProto", () => {
  it("constructs messages from dynamically loaded file descriptors", () => {
    const typeRegistry = registry();
    for (const descriptor of teamDescriptorFiles()) {
      // Registering the same descriptor twice must remain harmless.
      typeRegistry.registerDescriptor(descriptor);
      typeRegistry.registerDescriptor(descriptor);
    }
    const celEnv = env({
      container: container({ name: "cel" }),
      registry: typeRegistry,
    });
    const result = celEnv
      .program(
        celEnv.compile(`testdata.Team{name: 'X-Men', members: [
          testdata.Mutant{name: 'Jean Grey', level: 20},
          testdata.Mutant{name: 'Cyclops', level: 7},
          testdata.Mutant{name: 'Storm', level: 7},
          testdata.Mutant{name: 'Wolverine', level: 11}
        ]}`),
        { optimize: true },
      )
      .eval({});

    expect((result.value() as Message & { name: string }).name).toBe("X-Men");
  });
});

describe("cel/cel_test.go/TestDynamicProtoFileDescriptors", () => {
  it("evaluates messages created from dynamic message descriptors", () => {
    const descriptors = teamDescriptorFiles();
    const mutantSchema = descriptors
      .flatMap((descriptor) => descriptor.messages)
      .find((message) => message.typeName === "cel.testdata.Mutant");
    if (!mutantSchema) {
      throw new Error("cel.testdata.Mutant descriptor not found");
    }
    const wolverine = fromJson(mutantSchema, { name: "Wolverine" });
    const typeRegistry = registry();
    for (const descriptor of descriptors) {
      typeRegistry.registerDescriptor(descriptor);
    }
    const celEnv = env({
      registry: typeRegistry,
      variables: [variableDecl("mutant", objectType(mutantSchema.typeName))],
    });
    const result = celEnv
      .program(celEnv.compile("has(mutant.name) && mutant.name == 'Wolverine'"), {
        optimize: true,
      })
      .eval({ mutant: wolverine });

    expect(result).toBe(True);
  });
});

describe("cel/cel_test.go/TestGlobalVars", () => {
  it("uses program globals unless evaluation variables override them", () => {
    const celEnv = env({
      variables: [
        variableDecl("attrs", mapType(StringType, DynType)),
        variableDecl("default", DynType),
      ],
    });
    const ast = celEnv.compile(
      `"first" in attrs
        ? attrs["first"]
        : ("second" in attrs ? attrs["second"] : default)`,
    );

    // Global variables can be configured as a ProgramOption and optionally overridden on Eval.
    const program = celEnv.program(ast, {
      globals: {
        default: "third",
      },
    });

    expect(program.eval({ attrs: {} }).value()).toBe("third");
    expect(program.eval({ attrs: { second: "yep" } }).value()).toBe("yep");
    expect(program.eval({ attrs: {}, default: "fourth" }).value()).toBe("fourth");
  });
});

describe("cel/cel_test.go/TestCustomMacro", () => {
  it("expands a receiver macro into an exhaustive comprehension", () => {
    const joinMacro = receiverMacro("join", 1, (helper, target, args) => {
      if (target === undefined) {
        return helper.error(0, "missing macro target");
      }
      const delimiter = args[0]!;
      const iterator = "__iter__";
      const accumulator = helper.accuIdentName();
      const accumulatorIdent = helper.accuIdent();
      const step = helper.call(
        operators.Conditional,
        helper.call(
          operators.Greater,
          helper.memberCall(overloads.Size, accumulatorIdent),
          helper.literal(0n),
        ),
        helper.call(
          operators.Add,
          helper.call(operators.Add, accumulatorIdent, delimiter),
          helper.ident(iterator),
        ),
        helper.ident(iterator),
      );
      return helper.comprehension(
        target,
        iterator,
        accumulator,
        helper.literal(""),
        helper.literal(true),
        step,
        helper.accuIdent(),
      );
    });
    const celEnv = env({ macros: { custom: [joinMacro] } });
    const program = celEnv.program(celEnv.compile(`['hello', 'cel', 'friend'].join(',')`), {
      exhaustiveEval: true,
    });

    expect(program.eval({}).value()).toBe("hello,cel,friend");
  });
});

describe("cel/cel_test.go/TestMacroInterop", () => {
  it("interoperates with built-in macro expanders", () => {
    const celEnv = env({ macros: { custom: customInteropMacros() } });
    const cases = [
      {
        expression:
          `['tr', 's', 'fri'].filter(i, i.size() > 1)` +
          `.transform(i, i + 'end').exists_one(i, i == 'friend')`,
        expected: true,
      },
      { expression: `pair('a', 'b')`, expected: { a: "b" } },
      { expression: `{}.get(a, 'default')`, expected: "default" },
      { expression: `{'a': 'b'}.get(a, 'default')`, expected: "b" },
    ];

    for (const testCase of cases) {
      const value = celEnv
        .program(celEnv.compile(testCase.expression), { exhaustiveEval: true })
        .eval({});
      expect(
        value.equal(DefaultTypeAdapter.nativeToValue(testCase.expected)).value(),
        testCase.expression,
      ).toBe(true);
    }
  });
});

describe("cel/cel_test.go/TestMacroModern", () => {
  it("uses the native AST macro factory surface", () => {
    const celEnv = env({ macros: { custom: customInteropMacros() } });
    const cases = [
      {
        expression:
          `['tr', 's', 'fri'].filter(i, i.size() > 1)` +
          `.transform(i, i + 'end').exists_one(i, i == 'friend')`,
        expected: true,
      },
      { expression: `pair('a', 'b')`, expected: { a: "b" } },
      { expression: `{}.get(a, 'default')`, expected: "default" },
      { expression: `{'a': 'b'}.get(a, 'default')`, expected: "b" },
    ];

    for (const testCase of cases) {
      const value = celEnv
        .program(celEnv.compile(testCase.expression), { exhaustiveEval: true })
        .eval({});
      expect(
        value.equal(DefaultTypeAdapter.nativeToValue(testCase.expected)).value(),
        testCase.expression,
      ).toBe(true);
    }
  });
});

describe("cel/cel_test.go/TestCustomExistsMacro", () => {
  it("composes custom macros from standard presence and exists expanders", () => {
    const kleeneOr = globalVarArgMacro("kleeneOr", (helper, _target, args) => {
      const inputs = helper.list(...args);
      const iterator = helper.ident("__iter__");
      const eqOne = ExistsMacro.expander(helper, inputs, [
        iterator,
        helper.call(operators.Equals, helper.ident("__iter__"), helper.literal(1n)),
      ]);
      if (eqOne instanceof Error || eqOne === undefined) {
        return eqOne;
      }
      const eqZero = ExistsMacro.expander(helper, helper.copy(inputs), [
        helper.ident("__iter__"),
        helper.call(operators.Equals, helper.ident("__iter__"), helper.literal(0n)),
      ]);
      if (eqZero instanceof Error || eqZero === undefined) {
        return eqZero;
      }
      return helper.call(
        operators.Conditional,
        eqOne,
        helper.literal(1n),
        helper.call(operators.Conditional, eqZero, helper.literal(0n), helper.literal(-1n)),
      );
    });
    const kleeneEq = globalMacro("kleeneEq", 2, (helper, _target, args) => {
      const attribute = args[0]!;
      const value = args[1]!;
      const hasAttribute = HasMacro.expander(helper, undefined, [helper.copy(attribute)]);
      if (hasAttribute instanceof Error || hasAttribute === undefined) {
        return hasAttribute;
      }
      return helper.call(
        operators.Conditional,
        helper.call(operators.LogicalNot, hasAttribute),
        helper.literal(0n),
        helper.call(
          operators.Conditional,
          helper.call(operators.Equals, attribute, value),
          helper.literal(1n),
          helper.literal(-1n),
        ),
      );
    });
    const celEnv = env({
      variables: [variableDecl("attr", mapType(StringType, BoolType))],
      macros: { custom: [kleeneOr, kleeneEq] },
    });
    const program = celEnv.program(
      celEnv.compile("kleeneOr(kleeneEq(attr.value, true), kleeneOr(0, 1, 1)) == 1"),
    );

    expect(program.eval({ attr: { value: false } }).value()).toBe(true);
  });
});

describe("cel/cel_test.go/TestVariadicLogicalOperators", () => {
  it("evaluates flattened logical operator chains", () => {
    const celEnv = env({
      parser: { enableVariadicOperatorASTs: true },
    });
    const ast = celEnv.compile(
      "(false || false || false || false || true) && " + "(true && true && true && true && false)",
    );

    expect(celEnv.program(ast).eval({}).value()).toBe(false);
  });
});

describe("cel/cel_test.go/TestParseWithMacroTracking", () => {
  it("records original macro calls in source information", () => {
    const ast = env({
      parser: { populateMacroCalls: true },
    }).parse("has(a.b) && a.b.exists(c, c < 10)");
    const calls = [...ast.sourceInfo().macroCalls().values()].map((expression) =>
      expression.asCall()?.functionName(),
    );

    expect(calls.sort()).toEqual(["exists", "has"]);
  });
});

describe("cel/cel_test.go/TestParseAndCheckConcurrently", () => {
  it("reuses an environment across concurrent compile requests", async () => {
    const typeRegistry = registry();
    typeRegistry.registerDescriptor(ExprSchema.file);
    const celEnv = env({
      container: container({ name: "cel.expr" }),
      registry: typeRegistry,
      variables: [variableDecl("expr", objectType(ExprSchema.typeName))],
    });

    await Promise.all(
      Array.from({ length: 10 }, async (_, index) => {
        await Promise.resolve();
        expect(celEnv.compile(`expr.id + ${index}`).isChecked()).toBe(true);
      }),
    );
  });
});

describe("cel/cel_test.go/TestCustomInterpreterDecorator", () => {
  it("adapts a legacy decorator which folds constant arithmetic", () => {
    let lastInstruction: Interpretable | undefined;
    const arithmeticFunctions = new Set([
      operators.Add,
      operators.Subtract,
      operators.Multiply,
      operators.Divide,
    ]);
    const optimizeArithmetic = (instruction: Interpretable): Interpretable => {
      lastInstruction = instruction;
      if (
        !isInterpretableCall(instruction) ||
        !arithmeticFunctions.has(instruction.functionName()) ||
        !instruction.args().every(isInterpretableConst)
      ) {
        return instruction;
      }
      const value = instruction.eval(emptyActivation());
      if (isError(value)) {
        throw new Error(value.toString());
      }
      return constValue({ id: instruction.id(), value });
    };
    const celEnv = env({ variables: [variableDecl("foo", IntType)] });

    celEnv.program(celEnv.compile("foo == -1 + 2 * 3 / 3"), {
      partialEval: true,
      decorators: [adaptLegacyDecorator(optimizeArithmetic)],
    });

    expect(lastInstruction).toBeDefined();
    expect(isInterpretableCall(lastInstruction!)).toBe(true);
    const call = lastInstruction as InterpretableCall;
    expect(isInterpretableAttribute(call.args()[0]!)).toBe(true);
    expect(candidateVariableNames(call.args()[0] as InterpretableAttribute)).toEqual(["foo"]);
    expect(isInterpretableConst(call.args()[1]!)).toBe(true);
    expect((call.args()[1] as InterpretableConst).value().value()).toBe(1n);
  });
});

describe("cel/cel_test.go/TestCustomInterpreterDecoratorV2", () => {
  it("applies a V2 decorator which folds constant arithmetic", () => {
    let lastInstruction: InterpretableV2 | undefined;
    const arithmeticFunctions = new Set([
      operators.Add,
      operators.Subtract,
      operators.Multiply,
      operators.Divide,
    ]);
    const optimizeArithmetic = (instruction: InterpretableV2): InterpretableV2 => {
      lastInstruction = instruction;
      if (
        !isInterpretableCall(instruction) ||
        !arithmeticFunctions.has(instruction.functionName()) ||
        !instruction.args().every(isInterpretableConst)
      ) {
        return instruction;
      }
      const value = instruction.eval(emptyActivation());
      if (isError(value)) {
        throw new Error(value.toString());
      }
      return constValue({ id: instruction.id(), value });
    };
    const celEnv = env({ variables: [variableDecl("foo", IntType)] });

    celEnv.program(celEnv.compile("foo == -1 + 2 * 3 / 3"), {
      partialEval: true,
      decorators: [optimizeArithmetic],
    });

    expect(lastInstruction).toBeDefined();
    expect(isInterpretableCall(lastInstruction!)).toBe(true);
    const call = lastInstruction as InterpretableCall;
    expect(isInterpretableAttribute(call.args()[0]!)).toBe(true);
    expect(candidateVariableNames(call.args()[0] as InterpretableAttribute)).toEqual(["foo"]);
    expect(isInterpretableConst(call.args()[1]!)).toBe(true);
    expect((call.args()[1] as InterpretableConst).value().value()).toBe(1n);
  });
});

describe("cel/cel_test.go/TestEstimateCostAndRuntimeCost", () => {
  it("keeps runtime costs within every synced static estimate", () => {
    const cases = syncedCases<{
      decls?: Array<{ $expr?: string }>;
      expr: string;
      hints?: Record<string, number>;
      in: Record<string, unknown>;
      name: string;
      want: { $expr: string };
    }>("cel/cel_test.go/TestEstimateCostAndRuntimeCost");

    for (const testCase of cases) {
      const variables = (testCase.decls ?? []).map((declaration) =>
        resolveSyncedVariableDecl(declaration, {
          intList: listType(IntType),
        }),
      );
      const celEnv = env({ variables });
      const ast = celEnv.compile(testCase.expr);
      const estimator: CostEstimator = {
        /** estimateSize returns a fixed hint for the node's declared path. */
        estimateSize: (node) => {
          const path = node.path()?.join(".");
          const hint = path === undefined ? undefined : testCase.hints?.[path];
          return hint === undefined ? undefined : sizeEstimate(0n, BigInt(hint));
        },
        /** estimateCallCost defers function calls to CEL's standard estimator. */
        estimateCallCost: () => undefined,
      };
      const estimate = celEnv.estimateCost(ast, estimator);
      const [minimum, maximum] = syncedCostRange(testCase.want);
      expect([estimate.Min, estimate.Max], testCase.name).toEqual([minimum, maximum]);

      const result = celEnv.program(ast, { costTracking: {} }).evalWithDetails(testCase.in);
      const actual = result.details.actualCost();
      expect(actual, testCase.name).toBeDefined();
      expect(BigInt(actual!), testCase.name).toBeGreaterThanOrEqual(estimate.Min);
      expect(BigInt(actual!), testCase.name).toBeLessThanOrEqual(estimate.Max);
    }
  });
});

describe("cel/cel_test.go/TestCostLimit", () => {
  it("enforces every synced runtime cost limit", () => {
    const cases = syncedCases<{
      costLimit: number;
      decls: Array<{ $expr?: string }>;
      err?: { $expr: string };
      expr: string;
      in: Record<string, unknown>;
      name: string;
    }>("cel/cel_test.go/TestCostLimit");

    for (const testCase of cases) {
      const celEnv = env({
        variables: testCase.decls.map((declaration) => resolveSyncedVariableDecl(declaration)),
      });
      const ast = celEnv.compile(testCase.expr);
      const estimate = celEnv.estimateCost(ast);
      const program = celEnv.program(ast, {
        costTracking: { limit: testCase.costLimit },
      });

      if (testCase.err !== undefined) {
        expect(() => program.evalWithDetails(testCase.in), testCase.name).toThrow(
          /actual cost limit exceeded/,
        );
        continue;
      }
      const result = program.evalWithDetails(testCase.in);
      const actual = result.details.actualCost();
      expect(actual, testCase.name).toBeDefined();
      expect(BigInt(actual!), testCase.name).toBeGreaterThanOrEqual(estimate.Min);
      expect(BigInt(actual!), testCase.name).toBeLessThanOrEqual(estimate.Max);
    }
  });
});

describe("cel/cel_test.go/TestCostTrackingConsistentAcrossEvals", () => {
  it("creates independent cost state for repeated evaluations", () => {
    const celEnv = env({
      variables: [variableDecl("val1", IntType), variableDecl("val2", IntType)],
    });
    const program = celEnv.program(celEnv.compile("val1 + val2"), {
      costTracking: {},
    });
    const input = { val1: 1, val2: 2 };

    const first = program.evalWithDetails(input).details.actualCost();
    const second = program.evalWithDetails(input).details.actualCost();

    expect(first).toBeDefined();
    expect(second).toBe(first);
  });
});

describe("cel/cel_test.go/TestContextProto", () => {
  it("declares protobuf fields as top-level variables and creates their activation", () => {
    const input = proto3ContextMessage();
    const celEnv = env({
      contextProto: Proto3TestAllTypesSchema,
    });
    const expression = `
      single_int64 == 1
      && single_double == 1.0
      && single_bool == true
      && single_string == ''
      && standalone_enum == google.expr.proto3.test.TestAllTypes.NestedEnum.FOO
      && repeated_int32 == [1, 2]
      && map_string_string == {'': ''}`;
    const result = celEnv
      .program(celEnv.compile(expression))
      .eval(contextProtoVars({ message: input, schema: Proto3TestAllTypesSchema }));

    expect(result).toBe(True);
  });
});

describe("cel/cel_test.go/TestContextProtoJSONFieldNames", () => {
  it("uses protobuf JSON names for context declarations and activation keys", () => {
    const input = proto3ContextMessage();
    const celEnv = env({
      contextProto: Proto3TestAllTypesSchema,
      jsonFieldNames: true,
    });
    const expression = `
      singleInt64 == 1
      && singleDouble == 1.0
      && singleBool == true
      && singleString == ''
      && standaloneEnum == google.expr.proto3.test.TestAllTypes.NestedEnum.FOO
      && repeatedInt32 == [1, 2]
      && mapStringString == {'': ''}`;
    const result = celEnv.program(celEnv.compile(expression)).eval(
      contextProtoVars({
        jsonFieldNames: true,
        message: input,
        schema: Proto3TestAllTypesSchema,
      }),
    );

    expect(result).toBe(True);
  });
});

describe("cel/cel_test.go/TestRegexOptimizer", () => {
  it("compiles constant regular expressions during optimized program construction", () => {
    const cases = syncedCases<{
      err?: string;
      expr: string;
      optimizeRegex?: boolean;
      progErr?: string;
    }>("cel/cel_test.go/TestRegexOptimizer");
    const celEnv = env();

    for (const testCase of cases) {
      for (const ast of [celEnv.parse(testCase.expr), celEnv.compile(testCase.expr)]) {
        if (testCase.progErr !== undefined) {
          expect(
            () =>
              celEnv.program(ast, {
                optimize: testCase.optimizeRegex,
              }),
            testCase.expr,
          ).toThrow();
          continue;
        }
        const result = celEnv
          .program(ast, {
            optimize: testCase.optimizeRegex,
          })
          .eval({});
        if (testCase.err !== undefined) {
          expect(result, testCase.expr).toBeInstanceOf(Err);
          expect((result as Err).message, testCase.expr).toContain("error parsing regexp");
          continue;
        }
        expect(result.value(), testCase.expr).toBe(true);
      }
    }
  });
});

describe("cel/cel_test.go/TestDefaultUTCTimeZoneDisabled", () => {
  it("uses the timestamp location only when default UTC is disabled", () => {
    const environments = [
      {
        name: "default",
        value: env({ variables: [variableDecl("x", TimestampType)] }),
      },
      {
        name: "enabled",
        value: env({
          variables: [variableDecl("x", TimestampType)],
          defaultUTCTimeZone: true,
        }),
      },
      {
        name: "disabled",
        value: env({
          variables: [variableDecl("x", TimestampType)],
          defaultUTCTimeZone: false,
        }),
      },
    ];
    const cases: Array<{
      expression: string;
      expected: Record<string, boolean | bigint>;
      name: string;
    }> = [
      {
        name: "default-timezone",
        expression: `
          x.getFullYear() == 1970
          && x.getMonth() == 0
          && x.getDayOfYear() == 0
          && x.getDayOfMonth() == 0
          && x.getDate() == 1
          && x.getDayOfWeek() == 4
          && x.getHours() == 2
          && x.getMinutes() == 5
          && x.getSeconds() == 6
          && x.getMilliseconds() == 1
        `,
        expected: { default: true, enabled: true, disabled: false },
      },
      {
        name: "default-local-year",
        expression: "x.getFullYear()",
        expected: { default: 1970n, enabled: 1970n, disabled: 1969n },
      },
      {
        name: "default-local-day-of-year",
        expression: "x.getDayOfYear()",
        expected: { default: 0n, enabled: 0n, disabled: 364n },
      },
      {
        name: "default-local-month",
        expression: "x.getMonth()",
        expected: { default: 0n, enabled: 0n, disabled: 11n },
      },
      {
        name: "default-local-day-of-month",
        expression: "x.getDayOfMonth() == 30 && x.getDate() == 31",
        expected: { default: false, enabled: false, disabled: true },
      },
      {
        name: "default-local-dates",
        expression: "x.getDayOfWeek()",
        expected: { default: 4n, enabled: 4n, disabled: 3n },
      },
      {
        name: "default-local-times",
        expression: `
          x.getHours() == 18
          && x.getMinutes() == 5
          && x.getSeconds() == 6
          && x.getMilliseconds() == 1
        `,
        expected: { default: false, enabled: false, disabled: true },
      },
      {
        name: "explicit",
        expression: `
          x.getFullYear('-07:30') == 1969
          && x.getDayOfYear('-07:30') == 364
          && x.getMonth('-07:30') == 11
          && x.getDayOfMonth('-07:30') == 30
          && x.getDate('-07:30') == 31
          && x.getDayOfWeek('-07:30') == 3
          && x.getHours('-07:30') == 18
          && x.getMinutes('-07:30') == 35
          && x.getSeconds('-07:30') == 6
          && x.getMilliseconds('-07:30') == 1
          && x.getFullYear('23:15') == 1970
          && x.getDayOfYear('23:15') == 1
          && x.getMonth('23:15') == 0
          && x.getDayOfMonth('23:15') == 1
          && x.getDate('23:15') == 2
          && x.getDayOfWeek('23:15') == 5
          && x.getHours('23:15') == 1
          && x.getMinutes('23:15') == 20
          && x.getSeconds('23:15') == 6
          && x.getMilliseconds('23:15') == 1
        `,
        expected: { default: true, enabled: true, disabled: true },
      },
    ];
    const timestamp = timestampInTimezone({
      seconds: 7506n,
      nanos: 1_000_000,
      timezone: "-08:00",
    });

    for (const environment of environments) {
      for (const testCase of cases) {
        const result = environment.value
          .program(environment.value.compile(testCase.expression))
          .eval({ x: timestamp })
          .value();
        expect(result, `${environment.name}/${testCase.name}`).toBe(
          testCase.expected[environment.name],
        );
      }
    }
  });
});

describe("cel/cel_test.go/TestDefaultUTCTimeZoneExtension", () => {
  it("preserves default UTC timestamp and duration functions after extension", () => {
    const celEnv = env({
      variables: [variableDecl("x", TimestampType), variableDecl("y", DurationType)],
    }).extend();
    const program = celEnv.program(
      celEnv.compile(`
        x.getFullYear() == 1970
        && y.getHours() == 2
        && y.getMinutes() == 120
        && y.getSeconds() == 7235
        && y.getMilliseconds() == 7235000
      `),
    );

    expect(
      program
        .eval({
          x: timestampOf(7506n, 1_000_000),
          y: durationOf(7_235_000_000_000n),
        })
        .value(),
    ).toBe(true);
  });
});

describe("cel/cel_test.go/TestDefaultUTCTimeZoneError", () => {
  it("returns an error for invalid explicit timezones", () => {
    const celEnv = env({
      variables: [variableDecl("x", TimestampType)],
    });
    const program = celEnv.program(
      celEnv.compile(`
        x.getFullYear(':xx') == 1969
        || x.getDayOfYear('xx:') == 364
        || x.getMonth('Am/Ph') == 11
        || x.getDayOfMonth('Am/Ph') == 30
        || x.getDate('Am/Ph') == 31
        || x.getDayOfWeek('Am/Ph') == 3
        || x.getHours('Am/Ph') == 19
        || x.getMinutes('Am/Ph') == 5
        || x.getSeconds('Am/Ph') == 6
        || x.getMilliseconds('Am/Ph') == 1
      `),
    );

    const result = program.eval({ x: timestampOf(7506n, 1_000_000) });
    expect(result).toBeInstanceOf(Err);
    expect(result.toString()).toMatch(/time.?zone|offset|invalid/i);
  });
});

describe("cel/cel_test.go/TestParserRecursionLimit", () => {
  it("enforces the configured recursive-descent depth", () => {
    const cases = syncedCases<{
      errorSubstr?: string;
      expr: string;
      out?: { $expr: string };
    }>("cel/cel_test.go/TestParserRecursionLimit");
    const celEnv = env({ parser: { maxRecursionDepth: 10 } });

    for (const testCase of cases) {
      const compiled = celEnv.tryCompile(testCase.expr);
      if (testCase.errorSubstr !== undefined) {
        expect(compiled.errors?.toDisplayString(), testCase.expr).toContain(testCase.errorSubstr);
        continue;
      }
      expect(compiled.errors, testCase.expr).toBeUndefined();
      const result = celEnv.program(compiled.ast).eval({}).value();
      expect(result, testCase.expr).toBe(testCase.out?.$expr === "types.True" ? true : 55n);
    }
  });
});

describe("cel/cel_test.go/TestQuotedFields", () => {
  it("supports escaped map field selection and presence tests", () => {
    const cases = syncedCases<{
      errorSubstr?: string;
      expr: string;
      out?: { $expr: string };
    }>("cel/cel_test.go/TestQuotedFields");
    const celEnv = env({
      parser: {
        enableIdentEscapeSyntax: true,
        maxRecursionDepth: 10,
      },
    });

    for (const testCase of cases) {
      const result = celEnv.program(celEnv.compile(testCase.expr)).eval({});
      if (testCase.errorSubstr !== undefined) {
        expect(result, testCase.expr).toBeInstanceOf(Err);
        expect((result as Err).message, testCase.expr).toContain(testCase.errorSubstr);
        continue;
      }
      const expected =
        testCase.out?.$expr === "types.Int(64)" ? 64n : testCase.out?.$expr === "types.True";
      expect(result.value(), testCase.expr).toBe(expected);
    }
  });
});

describe("cel/cel_test.go/TestDynamicDispatch", () => {
  it("dispatches homogeneous and dynamic lists to their runtime overloads", () => {
    const first = functionDecl("first", {
      overloads: [
        memberOverload("first_list_int", [listType(IntType)], IntType, {
          unaryBinding: (value) => {
            const list = value as Lister;
            return list.size().value() === 0n ? IntZero : list.get(IntZero);
          },
        }),
        memberOverload("first_list_double", [listType(DoubleType)], DoubleType, {
          unaryBinding: (value) => {
            const list = value as Lister;
            return list.size().value() === 0n ? new Double(0) : list.get(IntZero);
          },
        }),
        memberOverload("first_list_string", [listType(StringType)], StringType, {
          unaryBinding: (value) => {
            const list = value as Lister;
            return list.size().value() === 0n ? new CelString("") : list.get(IntZero);
          },
        }),
        memberOverload(
          "first_list_list_string",
          [listType(listType(StringType))],
          listType(StringType),
          {
            unaryBinding: (value) => {
              const list = value as Lister;
              return list.size().value() === 0n
                ? DefaultTypeAdapter.nativeToValue([])
                : list.get(IntZero);
            },
          },
        ),
      ],
    });
    const celEnv = env({
      checker: { homogeneousAggregateLiterals: true },
      functions: [first],
    });
    const result = celEnv
      .program(
        celEnv.compile(`
          dyn([]).first() == 0
          && [1, 2].first() == 1
          && [1.0, 2.0].first() == 1.0
          && ["hello", "world"].first() == "hello"
          && [["hello"], ["world", "!"]].first().first() == "hello"
          && [[], ["empty"]].first().first() == ""
          && dyn([1, 2]).first() == 1
          && dyn([1.0, 2.0]).first() == 1.0
          && dyn(["hello", "world"]).first() == "hello"
          && dyn([["hello"], ["world", "!"]]).first().first() == "hello"
        `),
      )
      .eval({});

    expect(result.value()).toBe(true);
  });
});

describe("cel/cel_test.go/TestOptionalValuesEval", () => {
  it("evaluates every synced optional selection, mapping, aggregate, and list helper case", () => {
    const cases = syncedCases<{
      expr: string;
      in?: Record<string, unknown>;
      out: unknown;
    }>("cel/cel_test.go/TestOptionalValuesEval");
    const typeRegistry = registry();
    typeRegistry.registerDescriptor(Proto2TestAllTypesSchema.file);
    const celEnv = env({
      container: container({ name: "google.expr.proto2.test" }),
      libraries: [optionalTypes()],
      registry: typeRegistry,
      variables: [
        variableDecl("m", mapType(StringType, mapType(StringType, StringType))),
        variableDecl("l", listType(StringType)),
        variableDecl("optm", optionalType(mapType(StringType, mapType(StringType, StringType)))),
        variableDecl("optl", optionalType(listType(StringType))),
        variableDecl("x", optionalType(IntType)),
        variableDecl("y", optionalType(IntType)),
        variableDecl("z", IntType),
      ],
    });

    for (const testCase of cases) {
      const result = celEnv
        .program(celEnv.compile(testCase.expr))
        .eval(resolveSyncedExpr(testCase.in ?? {}));
      expectOptionalRuntimeResult({
        adapter: typeRegistry,
        expression: testCase.expr,
        expected: testCase.out,
        result,
      });
    }
  });
});

describe("cel/cel_test.go/TestOptionalValuesEvalUnknowns", () => {
  it("preserves partial-variable unknowns through optional fallback chains", () => {
    const cases = syncedCases<{
      expr: string;
      in: Record<string, unknown>;
      out: unknown;
    }>("cel/cel_test.go/TestOptionalValuesEvalUnknowns");
    const celEnv = env({
      libraries: [optionalTypes()],
      variables: [
        variableDecl("x", optionalType(IntType)),
        variableDecl("y", optionalType(IntType)),
        variableDecl("z", IntType),
      ],
    });

    for (const testCase of cases) {
      const activation = celEnv.partialVars(
        resolveSyncedExpr(testCase.in) as Record<string, unknown>,
      );
      const result = celEnv
        .program(celEnv.compile(testCase.expr), { partialEval: true })
        .eval(activation);
      const expected = resolveSyncedExpr(testCase.out) as Val;
      if (isUnknownValue(expected)) {
        expect(isUnknownValue(result), testCase.expr).toBe(true);
        expect(
          isUnknownValue(result) && result.contains(expected) && expected.contains(result),
          testCase.expr,
        ).toBe(true);
      } else {
        expect(result.equal(expected).value(), testCase.expr).toBe(true);
      }
    }
  });
});

describe("cel/cel_test.go/TestEnableErrorOnBadPresenceTest", () => {
  it("reports invalid optional presence traversals when strict mode is enabled", () => {
    const cases = syncedCases<{
      expr: string;
      in?: Record<string, unknown>;
      out: unknown;
    }>("cel/cel_test.go/TestEnableErrorOnBadPresenceTest");
    const typeRegistry = registry();
    const celEnv = env({
      errorOnBadPresenceTest: true,
      libraries: [optionalTypes()],
      registry: typeRegistry,
    });

    for (const testCase of cases) {
      const result = celEnv
        .program(celEnv.compile(testCase.expr))
        .eval(resolveSyncedExpr(testCase.in ?? {}));
      expectOptionalRuntimeResult({
        adapter: typeRegistry,
        expression: testCase.expr,
        expected: testCase.out,
        result,
      });
    }
  });
});

describe("cel/cel_test.go/TestParserExpressionSizeLimit", () => {
  it("limits source size by Unicode code points", () => {
    const celEnv = env({
      parser: { expressionSizeCodePointLimit: 10 },
    });

    expect(celEnv.tryParse("'greeting'").errors).toBeUndefined();
    expect(celEnv.tryParse("'greetings'").errors?.toDisplayString()).toContain(
      "size exceeds limit",
    );
  });
});

describe("cel/cel_test.go/TestExpressionNodeLimit", () => {
  it("limits parser nodes including macro expansion", () => {
    const expression =
      "x.optMap(a, a + 1).optMap(b, b + 1).optMap(c, c + 1).optMap(d, d + 1).optMap(e, e + 1).optMap(f, f + 1)";
    const limited = env({
      libraries: [optionalTypes()],
      parser: { maxExpressionNodeCount: 100 },
      variables: [variableDecl("x", optionalType(IntType))],
    });
    expect(limited.tryParse(expression).errors?.toString()).toContain(
      "expression count exceeds limit of 100 while expanding macro 'optMap'",
    );

    const unbounded = env({
      libraries: [optionalTypes()],
      parser: { maxExpressionNodeCount: -1 },
      variables: [variableDecl("x", optionalType(IntType))],
    });
    expect(unbounded.tryParse(expression).errors).toBeUndefined();
  });
});

describe("cel/cel_test.go/TestExpressionNodeLimitCheck", () => {
  it("rejects an externally parsed AST above the checker limit", () => {
    const source = textSource("x + 1 + 2 + 3 + 4 + 5");
    const parsed = env({
      parser: { maxExpressionNodeCount: -1 },
      variables: [variableDecl("x", IntType)],
    }).parseSource(source);
    expect(() =>
      env({
        parser: { maxExpressionNodeCount: 5 },
        variables: [variableDecl("x", IntType)],
      }).check(parsed, source),
    ).toThrow("expression node count exceeds limit");
  });
});

describe("cel/cel_test.go/TestRegexProgramSizeLimit", () => {
  it("enforces literal patterns during validation and dynamic patterns during evaluation", () => {
    const celEnv = env({
      regexProgramSizeLimit: 5,
      variables: [variableDecl("pattern", StringType)],
    });
    expect(
      celEnv.tryCompile(`"123 abc 456".matches('(a|b)*[0-9]+')`).errors?.toString(),
    ).toContain("regex program size 8 exceeds limit of 5");

    const program = celEnv.program(celEnv.compile(`"123 abc 456".matches(pattern)`));
    expect(program.eval({ pattern: "(a|b)*[0-9]+" }).toString()).toContain(
      "regex program size 8 exceeds limit of 5",
    );
    expect(program.eval({ pattern: "[0-9]+" }).value()).toBe(true);
  });
});

describe("cel/cel_test.go/TestAstProgramNilValue", () => {
  it("rejects an absent AST with an unsupported-expression error", () => {
    expect(() => env().program(undefined as never)).toThrow(/unsupported expr/);
  });
});

describe("cel/cel_test.go/TestJSONFieldNames", () => {
  const cases = syncedCases<{
    expr: string | { $expr: string };
    jsonFieldNames?: boolean;
    name: string;
  }>("cel/cel_test.go/TestJSONFieldNames");
  const message = fromBinary(Proto3TestAllTypesSchema, new Uint8Array());
  message.singleInt32 = 1;
  message.mapStringString = { key: "value" };
  const jsonNamesMessage = fromBinary(TestJsonNamesSchema, new Uint8Array());
  jsonNamesMessage.int32SnakeCaseJsonName = 1;
  jsonNamesMessage.int64CamelCaseJsonName = 2n;
  jsonNamesMessage.uint32DefaultJsonName = 3;
  jsonNamesMessage.uint64CustomJsonName = 4n;
  jsonNamesMessage.stringJsonNameShadows = "shadows";
  jsonNamesMessage.singleString = "shadowed";

  for (const testCase of cases) {
    it(testCase.name, () => {
      const typeRegistry = registry();
      typeRegistry.registerDescriptor(Proto3TestAllTypesSchema.file);
      typeRegistry.registerDescriptor(Proto2TestAllTypesSchema.file);
      const celEnv = env({
        container: container({ name: "google.expr.proto3.test" }),
        jsonFieldNames: testCase.jsonFieldNames,
        parser: { enableIdentEscapeSyntax: true },
        registry: typeRegistry,
        variables: [
          variableDecl("msg", objectType(Proto3TestAllTypesSchema.typeName)),
          variableDecl("jsonOptMsg", objectType(TestJsonNamesSchema.typeName)),
        ],
      });
      const expression = resolveSyncedExpr(testCase.expr) as string;
      const result = celEnv
        .program(celEnv.compile(expression))
        .eval({ jsonOptMsg: jsonNamesMessage, msg: message });

      if (testCase.name.startsWith("json opt fields")) {
        for (const clause of expression.split("&&").map((part) => part.trim())) {
          expect(
            celEnv
              .program(celEnv.compile(clause))
              .eval({ jsonOptMsg: jsonNamesMessage, msg: message })
              .value(),
            clause,
          ).toBe(true);
        }
      }
      expect(result.value(), expression).toBe(true);
    });
  }
});

describe("cel/cel_test.go/TestJSONFieldNamesInvalidProvider", () => {
  it("rejects a registry whose JSON-name setting conflicts with the environment", () => {
    expect(() =>
      env({
        jsonFieldNames: true,
        registry: new IncompatibleJSONRegistry(),
      }),
    ).toThrow("JSON field name");
  });
});

describe("cel/cel_test.go/TestExpressionSizeLimitEarlyEnforcement", () => {
  it("rejects oversized input before parsing or checking", () => {
    const cases = syncedCases<{
      mode: "compile" | "parse";
      name: string;
    }>("cel/cel_test.go/TestExpressionSizeLimitEarlyEnforcement");
    const celEnv = env({
      parser: { expressionSizeCodePointLimit: 1_000 },
    });
    const payload = "a".repeat(10_000);

    for (const testCase of cases) {
      const result =
        testCase.mode === "compile" ? celEnv.tryCompile(payload) : celEnv.tryParse(payload);
      expect(result.errors?.toDisplayString(), testCase.name).toContain(
        "expression code point size exceeds limit",
      );
    }
  });
});

describe("cel/cel_test.go/TestProgramEvalInvalidInput", () => {
  it("rejects inputs that are neither activations nor binding maps", () => {
    const cases = syncedCases<{
      input: unknown;
      name: string;
      wantErr: string;
    }>("cel/cel_test.go/TestProgramEvalInvalidInput");
    const program = env().program(env().compile("true"));

    for (const testCase of cases) {
      expect(() => program.eval(testCase.input), testCase.name).toThrow(testCase.wantErr);
    }
  });
});

describe("cel/cel_test.go/TestProgramContextEvalInvalidInput", () => {
  it("rejects missing contexts and invalid activation inputs", () => {
    const cases = syncedCases<{
      ctx: null | { $expr: string };
      input: unknown;
      name: string;
      wantErr: string;
    }>("cel/cel_test.go/TestProgramContextEvalInvalidInput");
    const celEnv = env();
    const program = celEnv.program(celEnv.compile("true"));

    for (const testCase of cases) {
      const signal = testCase.ctx === null ? undefined : new AbortController().signal;
      expect(
        () =>
          program.contextEval(testCase.input, {
            signal: signal as AbortSignal,
          }),
        testCase.name,
      ).toThrow(testCase.wantErr);
    }
  });
});

describe("cel/cel_test.go/TestOptionalOperatorsLegacyEval", () => {
  it("preserves activation-based optional operator evaluation", () => {
    const cases = syncedCases<{ name: string }>("cel/cel_test.go/TestOptionalOperatorsLegacyEval");
    const celEnv = env({ libraries: [optionalTypes()] });

    for (const testCase of cases) {
      const expression =
        testCase.name === "optional or"
          ? "optional.of(true).or(optional.of(false))"
          : "dyn(true).orValue(false)";
      const result = celEnv.program(celEnv.compile(expression)).eval({});
      if (testCase.name === "optional or") {
        expect(result.value(), testCase.name).toBe(true);
      } else {
        expect(result, testCase.name).toBeInstanceOf(Err);
        expect((result as Err).message, testCase.name).toContain("no such overload");
      }
    }
  });
});

describe("cel/env_test.go/TestAstNil", () => {
  it("returns nil-safe defaults for an absent AST", () => {
    const astValue = undefined as AST | undefined;

    expect(astValue?.isChecked() ?? false).toBe(false);
    expect(astValue?.expr()).toBeUndefined();
    expect(astValue?.sourceInfo()).toBeUndefined();
    expect(astOutputType(astValue)).toBe(ErrorType);
    expect(astValue?.source()).toBeUndefined();
  });
});

describe("cel/env_test.go/TestIssuesNil", () => {
  it("returns empty diagnostics from the nil-equivalent issue set", () => {
    const diagnostics = issues();
    const appended = diagnostics.append(diagnostics);

    expect(appended.err()).toBeUndefined();
    expect(appended.errors()).toEqual([]);
    expect(appended.toString()).toBe("");
  });
});

describe("cel/env_test.go/TestIssuesEmpty", () => {
  it("preserves an empty issue set when appending absent diagnostics", () => {
    const diagnostics = issues({ errors: errorsValue() });
    const appended = diagnostics.append(undefined).append(undefined);

    expect(diagnostics.err()).toBeUndefined();
    expect(diagnostics.errors()).toEqual([]);
    expect(diagnostics.toString()).toBe("");
    expect(appended).toBe(diagnostics);
  });
});

describe("cel/env_test.go/TestErrorAsIssues", () => {
  it("converts an ordinary error into environment diagnostics", () => {
    const diagnostics = errorAsIssues(new Error("wrapped-error"));

    expect(diagnostics.err()?.message).toContain("wrapped-error");
  });
});

describe("cel/env_test.go/TestIssuesAppendSelf", () => {
  it("does not duplicate diagnostics when appended to itself", () => {
    const diagnostics = env().tryCompile("a").errors!;

    expect(diagnostics.errors()).toHaveLength(1);
    expect(diagnostics.append(diagnostics)).toBe(diagnostics);
    expect(diagnostics.errors()).toHaveLength(1);
  });
});

describe("cel/env_test.go/TestIssues", () => {
  it("combines and formats parse and check diagnostics", () => {
    const parseIssues = env().tryCompile("-").errors!;
    const checkIssues = env().tryCompile("b").errors!;
    const diagnostics = parseIssues.append(checkIssues);

    expect(diagnostics.errors()).toHaveLength(3);
    expect(
      diagnostics.toString(),
    ).toBe(`ERROR: <input>:1:1: undeclared reference to 'b' (in container '')
 | -
 | ^
ERROR: <input>:1:2: Syntax error: no viable alternative at input '-'
 | -
 | .^
ERROR: <input>:1:2: Syntax error: mismatched input '<EOF>' expecting {'[', '{', '(', '.', '-', '!', 'true', 'false', 'null', NUM_FLOAT, NUM_INT, NUM_UINT, STRING, BYTES, IDENTIFIER}
 | -
 | .^`);
  });
});

describe("cel/env_test.go/TestFormatCELTypeEquivalence", () => {
  it("formats native and protobuf CEL types identically", () => {
    const types = [
      AnyType,
      mapType(StringType, DynType),
      typeTypeWithParam(listType(IntType)),
      TypeType,
      nullableType(DoubleType),
    ];

    for (const type of types) {
      expect(formatCELType(type), type.toString()).toBe(formatCheckedType(typeToExprType(type)));
    }
  });
});

describe("cel/env_test.go/TestEnvCheckExtendRace", () => {
  it("supports interleaved compile and extension requests", async () => {
    await Promise.all(
      Array.from({ length: 500 }, async () => {
        const celEnv = env();
        await Promise.all([
          Promise.resolve().then(() => celEnv.compile("1 + 1 * 20 < 400")),
          Promise.resolve().then(() =>
            celEnv.extend({
              variables: [variableDecl("bar", BoolType)],
            }),
          ),
        ]);
      }),
    );
  });
});

describe("cel/env_test.go/TestEnvPartialVarsError", () => {
  it("rejects bindings which cannot form an activation", () => {
    expect(() => env().partialVars(10)).toThrow(
      /activation input must be an activation or map\[string\]interface/,
    );
  });
});

describe("cel/env_test.go/TestTypeProviderInterop", () => {
  const cases = syncedCases<{ name: string }>("cel/env_test.go/TestTypeProviderInterop");

  for (const testCase of cases) {
    it(testCase.name, () => {
      // TypeScript uses one structural registry surface for the modern provider, legacy lookup
      // methods, and adapter instead of cel-go's runtime interop wrappers.
      const typeRegistry = registry();
      typeRegistry.registerDescriptor(Proto3TestAllTypesSchema.file);
      const celEnv = env({ registry: typeRegistry });
      const typeName = Proto3TestAllTypesSchema.typeName;

      expect(celEnv.typeProvider().findStructType(typeName)[1]).toBe(true);
      expect(typeRegistry.findType(typeName)[1]).toBe(true);
      expect(celEnv.typeProvider().findStructFieldType(typeName, "single_int32")[1]).toBe(true);
      expect(typeRegistry.findFieldType(typeName, "single_int32")[1]).toBe(true);
      expect(celEnv.typeProvider().findStructType("test.BadTypeName")[1]).toBe(false);
      expect(typeRegistry.findType("test.BadTypeName")[1]).toBe(false);
    });
  }
});

describe("cel/env_test.go/TestEnvToConfig", () => {
  const cases = syncedCases<{ name: string }>("cel/env_test.go/TestEnvToConfig");

  for (const testCase of cases) {
    it(testCase.name, () => {
      const typeRegistry = registry();
      typeRegistry.registerDescriptor(Proto3TestAllTypesSchema.file);
      const environment =
        testCase.name === "std env - container"
          ? env({ container: container({ name: "example.container" }) })
          : testCase.name === "std env - aliases"
            ? env({ container: container({ abbrevs: ["example.type.name"] }) })
            : testCase.name === "std env disabled"
              ? env({ standardLibrary: false })
              : testCase.name === "std env - with variable"
                ? env({ variables: [variableDecl("var", IntType)] })
                : testCase.name === "std env - with function"
                  ? env({
                      functions: [
                        functionDecl("hello", {
                          overloads: [overload("hello_string", [StringType], StringType)],
                        }),
                      ],
                    })
                  : testCase.name === "optional lib"
                    ? env({ libraries: [optionalTypes()] })
                    : testCase.name === "optional lib - versioned"
                      ? env({ libraries: [optionalTypes({ version: 1 })] })
                      : testCase.name === "optional lib - alt last()"
                        ? env({
                            functions: [
                              functionDecl("last", {
                                doc: "return the last value in a list, or last character in a string",
                                overloads: [
                                  memberOverload("string_last", [StringType], StringType),
                                ],
                              }),
                            ],
                            libraries: [optionalTypes()],
                          })
                        : testCase.name === "json field names"
                          ? env({ jsonFieldNames: true })
                          : testCase.name === "feature flags"
                            ? env({ parser: { populateMacroCalls: true } })
                            : testCase.name === "validators"
                              ? env({
                                  validators: [
                                    validateComprehensionNestingLimit(1),
                                    ...extendedValidations(),
                                  ],
                                })
                              : testCase.name.startsWith("context proto")
                                ? env({
                                    contextProto: Proto3TestAllTypesSchema,
                                    registry: typeRegistry,
                                    variables: testCase.name.includes("extra")
                                      ? [variableDecl("extra", StringType)]
                                      : [],
                                  })
                                : env();
      const serialized = environment.toConfig(testCase.name);

      expect(serialized.name).toBe(testCase.name);
      if (testCase.name === "std env - container") {
        expect(serialized.container).toBe("example.container");
      } else if (testCase.name === "std env - aliases") {
        expect(serialized.imports.map((entry) => entry.name)).toEqual(["example.type.name"]);
      } else if (testCase.name === "std env disabled") {
        expect(serialized.stdlib?.disabled).toBe(true);
      } else if (testCase.name === "std env - with variable") {
        expect(serialized.variables[0]?.name).toBe("var");
      } else if (testCase.name === "std env - with function") {
        expect(serialized.functions[0]?.name).toBe("hello");
      } else if (testCase.name.startsWith("optional lib")) {
        expect(serialized.extensions[0]?.name).toBe("optional");
        expect(serialized.extensions[0]?.version).toBe(
          testCase.name === "optional lib - versioned" ? "1" : "latest",
        );
      } else if (testCase.name === "json field names") {
        expect(serialized.features).toContainEqual(
          new Feature("cel.feature.json_field_names", true),
        );
      } else if (testCase.name.startsWith("context proto")) {
        expect(serialized.contextVariable?.typeName).toBe(Proto3TestAllTypesSchema.typeName);
      } else if (testCase.name === "feature flags") {
        expect(serialized.features).toContainEqual(
          new Feature("cel.feature.macro_call_tracking", true),
        );
      } else if (testCase.name === "validators") {
        expect(serialized.validators.map((validator) => validator.name)).toEqual([
          "cel.validator.comprehension_nesting_limit",
          "cel.validator.duration",
          "cel.validator.homogeneous_literals",
          "cel.validator.matches",
          "cel.validator.timestamp",
        ]);
      }
    });
  }
});

describe("cel/env_test.go/TestEnvFromConfig", () => {
  it("applies declarations, imports, extensions, features, limits, and context variables", () => {
    expect(syncedCases("cel/env_test.go/TestEnvFromConfig")).toHaveLength(20);
    const typeRegistry = registry();
    typeRegistry.registerDescriptor(Proto3TestAllTypesSchema.file);
    const config = new Config("combined")
      .setContainer("google.expr.proto3.test")
      .addImports(new Import(Proto3TestAllTypesSchema.typeName))
      .addVariables(new ConfigVariable("x", new TypeDesc("int")))
      .addFunctions(
        new ConfigFunction("plus", [
          new ConfigOverload(
            "plus_int_int",
            [new TypeDesc("int"), new TypeDesc("int")],
            new TypeDesc("int"),
          ),
        ]),
      )
      .addExtensions(new Extension("optional", "1"))
      .addFeatures(
        new Feature("cel.feature.backtick_escape_syntax", true),
        new Feature("cel.feature.json_field_names", true),
      )
      .addLimits(new Limit("cel.limit.expression_code_points", 100));
    const celEnv = env({
      configuration: { config },
      functions: [
        functionDecl("plus", {
          overloads: [
            overload("plus_int_int", [IntType, IntType], IntType, {
              binaryBinding: (left, right) =>
                typeRegistry.nativeToValue(Number(left.value()) + Number(right.value())),
            }),
          ],
        }),
      ],
      registry: typeRegistry,
    });

    expect(celEnv.program(celEnv.compile("plus(x, 2)")).eval({ x: 40 }).value()).toBe(42n);
    expect(celEnv.tryCompile("optional.none()").errors).toBeUndefined();
    expect(celEnv.tryCompile("TestAllTypes{singleInt64: 1}.singleInt64").errors).toBeUndefined();
    expect(celEnv.tryParse("x.`key-name`").errors).toBeUndefined();
  });

  it("declares configured context protobuf fields", () => {
    const typeRegistry = registry();
    typeRegistry.registerDescriptor(Proto3TestAllTypesSchema.file);
    const config = new Config("context").setContextVariable(
      new ContextVariable(Proto3TestAllTypesSchema.typeName),
    );
    const celEnv = env({ configuration: { config }, registry: typeRegistry });

    expect(celEnv.tryCompile("single_int64 == 1").errors).toBeUndefined();
  });

  it("uses declarative option maps for extension-owned configuration", () => {
    const config = new Config("custom extension").addExtensions(new Extension("plus", "latest"));
    const celEnv = env({
      configuration: {
        config,
        extensions: {
          plus: {
            functions: [
              functionDecl("plus", {
                overloads: [
                  overload("plus_int_int", [IntType, IntType], IntType, {
                    binaryBinding: (left, right) =>
                      registry().nativeToValue(Number(left.value()) + Number(right.value())),
                  }),
                ],
              }),
            ],
          },
        },
      },
    });

    expect(celEnv.program(celEnv.compile("plus(1, 2)")).eval({}).value()).toBe(3n);
  });
});

describe("cel/env_test.go/TestEnvFromConfigErrors", () => {
  const cases = syncedCases<{ name: string }>("cel/env_test.go/TestEnvFromConfigErrors");

  for (const testCase of cases) {
    it(testCase.name, () => {
      const config = invalidEnvironmentConfig(testCase.name);
      expect(() => env({ configuration: { config } })).toThrow();
    });
  }
});

describe("cel/env_test.go/TestMaybeInteropProvider_Error", () => {
  it("rejects values that do not implement the unified TypeScript registry surface", () => {
    expect(() => env({ registry: 123 as never })).toThrow();
  });
});

describe("cel/env_test.go/TestMaybeInteropProvider_LegacyTypeProvider", () => {
  it("accepts a registry that exposes both modern and legacy provider methods", () => {
    const typeRegistry = registry();
    const celEnv = env({ registry: typeRegistry });

    expect(celEnv.typeProvider()).toBe(typeRegistry);
    expect(typeRegistry.findType("google.protobuf.Timestamp")[1]).toBe(true);
  });
});

describe("cel/env_test.go/TestParserErrorRecoveryLimit", () => {
  it("accepts an explicit parser recovery limit", () => {
    expect(() => env({ parser: { errorRecoveryLimit: 10 } })).not.toThrow();
  });
});

describe("cel/env_test.go/TestEnableHiddenAccumulatorName", () => {
  it("accepts hidden comprehension accumulator names", () => {
    const celEnv = env({
      parser: { enableHiddenAccumulatorName: true },
    });

    expect(celEnv.tryCompile("[1].all(value, value > 0)").errors).toBeUndefined();
  });
});

describe("cel/env_test.go/TestDeclareContextProto_Duplicate", () => {
  it("rejects declaring the same context protobuf twice", () => {
    const celEnv = env({ contextProto: Proto3TestAllTypesSchema });

    expect(() => celEnv.extend({ contextProto: Proto3TestAllTypesSchema })).toThrow(
      "overlapping identifier",
    );
  });
});

describe("TypeScript extension/TestStrongEnumEnvironment", () => {
  it("checks and evaluates typed protobuf enum conversions", () => {
    const typeRegistry = registry();
    typeRegistry.registerDescriptor(Proto3TestAllTypesSchema.file);
    typeRegistry.withStrongEnums(true);
    const celEnv = env({
      container: container({ name: "google.expr.proto3.test" }),
      registry: typeRegistry,
    });

    const named = celEnv.tryCompile('GlobalEnum("GAZ")');
    expect(named.errors).toBeUndefined();
    expect(astOutputType(named.ast).typeName()).toBe("google.expr.proto3.test.GlobalEnum");
    const namedResult = celEnv.program(named.ast).eval({});
    expect(namedResult.type().typeName()).toBe("google.expr.proto3.test.GlobalEnum");
    expect(namedResult.value()).toBe(2n);

    const assigned = celEnv
      .program(
        celEnv.compile(
          "TestAllTypes{standalone_enum: TestAllTypes.NestedEnum(-1)}.standalone_enum",
        ),
      )
      .eval({});
    expect(assigned.type().typeName()).toBe(
      "google.expr.proto3.test.TestAllTypes.NestedEnum",
    );
    expect(assigned.value()).toBe(-1n);

    expect(
      celEnv.program(celEnv.compile("int(GlobalEnum.GAZ)")).eval({}).value(),
    ).toBe(2n);
    expect(
      celEnv.tryCompile("TestAllTypes{standalone_enum: GlobalEnum.GAR}").errors,
    ).toBeDefined();

    const invalidName = celEnv
      .program(celEnv.compile('GlobalEnum("MISSING")'))
      .eval({});
    expect(isError(invalidName)).toBe(true);

    const overflow = celEnv
      .program(celEnv.compile("GlobalEnum(2147483648)"))
      .eval({});
    expect(isError(overflow)).toBe(true);
  });
});

/** Describes one optional-runtime result comparison. */
interface OptionalRuntimeResultOptions {
  /** Converts native fixture values into CEL values. */
  adapter: ReturnType<typeof registry>;
  /** Identifies the CEL expression when an assertion fails. */
  expression: string;
  /** Contains the decoded synced cel-go expectation. */
  expected: unknown;
  /** Contains the CEL runtime result. */
  result: Val;
}

/** Compares an optional-runtime result with its synced cel-go expectation. */
function expectOptionalRuntimeResult(options: OptionalRuntimeResultOptions): void {
  const { adapter, expression, result } = options;
  if (result instanceof Err) {
    expect(result.message, expression).toContain(String(options.expected));
    return;
  }

  const resolvedExpected = resolveSyncedExpr(options.expected);
  const expected = isRuntimeVal(resolvedExpected)
    ? resolvedExpected
    : adapter.nativeToValue(resolvedExpected);
  expect(result.equal(expected).value(), expression).toBe(true);
}

/** Reports whether a decoded fixture value already implements the CEL value contract. */
function isRuntimeVal(value: unknown): value is Val {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "value" in value &&
    "equal" in value
  );
}

/** Reports whether a CEL value contains an unknown attribute set. */
function isUnknownValue(value: Val): value is Unknown {
  return value instanceof Unknown;
}
