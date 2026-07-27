/** biome-ignore-all lint/suspicious/noExplicitAny: it's a test file nobody cares */
import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { check } from "../checker/checker.js";
import { env } from "../checker/env.js";
import { ast, exprFactory } from "../common/ast/index.js";
import { defaultContainer, container as sourceContainer } from "../common/containers.js";
import { functionDecl, memberOverload, overload, variableDecl } from "../common/decls.js";
import * as operators from "../common/operators.js";
import { textSource } from "../common/source.js";
import { syncedCases } from "../common/spec-helpers.js";
import { standardFunctions } from "../common/stdlib.js";
import {
  attributeTrail,
  Bool,
  BytesType,
  String as CelString,
  DynType,
  Err,
  emptyRegistry,
  False,
  IntOne,
  IntType,
  IntZero,
  ListType,
  listType,
  mapType,
  mutableMap,
  objectType,
  qualifyAttribute,
  registry,
  StringType,
  True,
  type Type,
  Uint,
  Unknown,
  unknown,
  type Val,
} from "../common/types/index.js";
import { resolveRuntimeAssignableValue, resolveSyncedExpr } from "../common/types/spec-helpers.js";
import { ExprSchema } from "../gen/cel/expr/syntax_pb.js";
import { TestAllTypesSchema as Proto2TestAllTypesSchema } from "../gen/test/proto2pb/test_all_types_pb.js";
import {
  NestedTestAllTypesSchema as Proto3NestedTestAllTypesSchema,
  TestAllTypes_NestedEnum as Proto3TestAllTypesNestedEnum,
  TestAllTypes_NestedMessageSchema as Proto3TestAllTypesNestedMessageSchema,
  TestAllTypesSchema as Proto3TestAllTypesSchema,
} from "../gen/test/proto3pb/test_all_types_pb.js";
import { parse } from "../parser/parser.js";
import { type Activation, activation, emptyActivation, partialActivation } from "./activation.js";
import { attributePattern, partialAttributeFactory } from "./attribute-patterns.js";
import { type Attribute, attributeFactory } from "./attributes.js";
import type { InterpretableDecorator } from "./decorators.js";
import { dispatcher } from "./dispatcher.js";
import { evalState } from "./eval-state.js";
import { type ExecutionFrame, executionFrame } from "./frame.js";
import {
  callInterpretable,
  constValue,
  findFrame,
  type Interpretable,
  type InterpretableCall,
  InterruptError,
  listInterpretable,
  ObservableInterpretable,
  watchConstructor,
} from "./interpretable.js";
import {
  compileRegexConstantsConfig,
  customDecoratorConfig,
  defaultPlannerState,
  evalStateObserverConfig,
  exhaustiveEvalConfig,
  interpreter,
  interruptableEvalConfig,
  optimizeConfig,
} from "./interpreter.js";
import { matchesRegexOptimization } from "./optimizations.js";
import { CostTracker } from "./runtime-cost.js";

/**
 * SyncedInterpreterCase mirrors one serialized row from cel-go's interpreter tables.
 */
interface SyncedInterpreterCase {
  /**
   * name is the upstream cel-go table row name.
   */
  name: string;

  /**
   * expr is the CEL source expression under test.
   */
  expr: string;

  /**
   * out is the expected runtime result when the case succeeds.
   */
  out?: unknown;

  /**
   * err is the expected runtime error message when evaluation fails.
   */
  err?: string;

  /**
   * vars lists the synced variable declarations needed by the checker.
   */
  vars?: Array<{ $expr?: string }>;

  /**
   * in contains the runtime activation bindings.
   */
  in?: unknown;

  /**
   * container sets the checker container for the expression.
   */
  container?: string;

  /**
   * funcs lists custom function declarations required by the case.
   */
  funcs?: Array<{ $expr?: string }>;

  /**
   * unchecked indicates whether the upstream case intentionally skips type-checking.
   */
  unchecked?: boolean;

  /**
   * attrs identifies cases that rely on custom attribute factories.
   */
  attrs?: unknown;

  /**
   * extraOpts lists planner options that are not yet wired into the synced harness.
   */
  extraOpts?: unknown;

  /**
   * abbrevs lists container abbreviations that are not yet wired into the synced harness.
   */
  abbrevs?: unknown;

  /**
   * typeOpts lists registry options that are not yet wired into the synced harness.
   */
  typeOpts?: unknown;

  /**
   * progErr is an expected program-construction error rather than an eval error.
   */
  progErr?: string;
}

/**
 * blockedSyncedInterpreterCases lists synced rows whose runtime behavior is not yet fully ported.
 */
const blockedSyncedInterpreterCases = new Set<string>();

/**
 * standardDispatcher builds a dispatcher loaded with standard-library runtime overloads.
 */
function standardDispatcher() {
  const runtimeDispatcher = dispatcher();
  for (const functionValue of standardFunctions()) {
    const overloads = functionValue.bindings();
    if (overloads.length !== 0) {
      runtimeDispatcher.add({ overloads });
    }
  }
  return runtimeDispatcher;
}

/**
 * interpreterContainer resolves the CEL container and abbreviations for a synced case.
 */
function interpreterContainer(testCase: SyncedInterpreterCase) {
  return testCase.container || testCase.abbrevs
    ? sourceContainer({
        name: testCase.container ?? "",
        abbrevs: Array.isArray(testCase.abbrevs) ? (testCase.abbrevs as string[]) : undefined,
      })
    : defaultContainer;
}

/**
 * interpreterRegistry resolves the provider and adapter registry needed by a synced case.
 */
function interpreterRegistry(testCase: SyncedInterpreterCase) {
  const optionExprs = Array.isArray(testCase.typeOpts)
    ? testCase.typeOpts.map((entry) => (entry as { $expr?: string }).$expr ?? "").join("\n")
    : "";
  let reg = registry();
  if (!Array.isArray(testCase.typeOpts) || testCase.typeOpts.length === 0) {
    return reg;
  }
  if (optionExprs.includes("proto2pb.TestAllTypes")) {
    reg = registry([create(Proto2TestAllTypesSchema), Proto2TestAllTypesSchema]);
  } else if (optionExprs.includes("proto3pb.TestAllTypes_NestedMessage")) {
    reg = registry([
      [create(Proto3TestAllTypesNestedMessageSchema), Proto3TestAllTypesNestedMessageSchema][0],
      Proto3TestAllTypesNestedMessageSchema,
    ] as never);
  } else if (optionExprs.includes("proto3pb.TestAllTypes")) {
    reg = registry(
      [create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema],
      [create(Proto3NestedTestAllTypesSchema), Proto3NestedTestAllTypesSchema],
    );
  } else if (optionExprs.includes("exprpb.Expr")) {
    reg = registry([create(ExprSchema), ExprSchema]);
  }
  if (optionExprs.includes("JSONFieldNames(true)")) {
    reg.withJSONFieldNames(true);
  }
  return reg;
}

/**
 * addInterpreterFunctions attaches upstream custom function declarations to the checker and dispatcher.
 */
function addInterpreterFunctions(
  testCase: SyncedInterpreterCase,
  checkerEnv: ReturnType<typeof env>,
  runtimeDispatcher: ReturnType<typeof dispatcher>,
): void {
  const functions = interpreterFunctions(testCase);
  if (functions.length === 0) {
    return;
  }
  checkerEnv.addFunctions(...functions);
  for (const fn of functions) {
    runtimeDispatcher.add({ overloads: fn.bindings() });
  }
}

/**
 * interpreterFunctions reconstructs the upstream custom function bindings used by blocked synced rows.
 */
function interpreterFunctions(testCase: SyncedInterpreterCase) {
  switch (testCase.name) {
    case "call_no_args":
      return [
        functionDecl("zero", {
          overloads: [overload("zero", [], IntType)],
          singletonBinding: {
            func: () => IntZero,
          },
        }),
      ];
    case "call_one_arg":
      return [
        functionDecl("neg", {
          overloads: [
            overload("neg_int", [IntType], IntType, {
              unaryBinding: (arg: any) => arg.negate?.() ?? new Err("no such overload"),
            }),
          ],
        }),
      ];
    case "call_two_arg":
      return [
        functionDecl("concat", {
          overloads: [
            memberOverload("bytes_concat_bytes", [BytesType, BytesType], BytesType, {
              binaryBinding: (lhs: any, rhs) => lhs.add(rhs),
            }),
          ],
        }),
      ];
    case "call_four_args":
      return [
        functionDecl("addall", {
          disableTypeGuards: true,
          overloads: [overload("addall_four", [IntType, IntType, IntType, IntType], IntType)],
          singletonBinding: {
            func: (...args) => args.reduce((acc: any, arg) => acc.add(arg), IntZero as Val),
          },
        }),
      ];
    case "call_ns_func":
    case "call_ns_func_unchecked":
    case "call_ns_func_in_pkg":
    case "call_ns_func_unchecked_in_pkg":
      return [
        functionDecl("base64.encode", {
          overloads: [
            overload("base64_encode_string", [StringType], StringType, {
              unaryBinding: (arg) => new CelString(globalThis.btoa(String(arg.value()))),
            }),
          ],
        }),
      ];
    case "select_relative":
      return [
        functionDecl("json", {
          overloads: [
            overload("json_string", [StringType], DynType, {
              unaryBinding: (arg) => {
                try {
                  return registry().nativeToValue(JSON.parse(String(arg.value())));
                } catch (cause) {
                  return new Err(`invalid json: ${String(cause)}`);
                }
              },
            }),
          ],
        }),
      ];
    case "call_with_error_unary":
      return [
        functionDecl("try", {
          overloads: [
            overload("try_dyn", [DynType], DynType, {
              nonStrict: true,
              unaryBinding: (arg) =>
                arg instanceof Err ? new CelString(`error: ${arg.message}`) : arg,
            }),
          ],
        }),
      ];
    case "call_with_error_binary":
      return [
        functionDecl("try", {
          overloads: [
            overload("try_dyn", [DynType, DynType], DynType, {
              nonStrict: true,
              binaryBinding: (arg0) =>
                arg0 instanceof Err ? new CelString(`error: ${arg0.message}`) : arg0,
            }),
          ],
        }),
      ];
    case "call_with_error_function":
      return [
        functionDecl("try", {
          overloads: [
            overload("try_dyn", [DynType, DynType, DynType], DynType, {
              nonStrict: true,
              functionBinding: (arg0) =>
                arg0 instanceof Err ? new CelString(`error: ${arg0.message}`) : arg0,
            }),
          ],
        }),
      ];
    default:
      return [];
  }
}

/**
 * interpreterAttributeFactory configures the custom attribute behavior required by certain synced rows.
 */
function interpreterAttributeFactory(
  testCase: SyncedInterpreterCase,
  reg: ReturnType<typeof registry>,
) {
  const containerValue = interpreterContainer(testCase);
  switch (testCase.name) {
    case "unknown_attribute":
    case "macro_has_map_key_unknown_propagates":
    case "unknown_attribute_mixed_qualifier":
      return partialAttributeFactory({
        containerValue,
        adapter: reg,
        provider: emptyRegistry(),
      });
    case "invalid_presence_test_on_int_literal":
    case "invalid_presence_test_on_list_literal":
      return attributeFactory({
        containerValue,
        adapter: reg,
        provider: reg,
        errorOnBadPresenceTest: true,
      });
    default:
      return attributeFactory({
        containerValue,
        adapter: reg,
        provider: reg,
      });
  }
}

/**
 * interpreterActivation resolves either regular or partial activation input for a synced case.
 */
function interpreterActivation(testCase: SyncedInterpreterCase): Activation {
  if (testCase.name === "macro_has_pb3_field" || testCase.name === "macro_has_pb3_field_json") {
    return activation({
      bindings: {
        pb3: create(Proto3TestAllTypesSchema, {
          repeatedBool: [false],
          mapInt64NestedType: {
            "1": create(Proto3NestedTestAllTypesSchema),
          },
          mapStringString: {},
        } as never),
      },
    });
  }
  if (testCase.name === "nested_proto_field_with_index") {
    return activation({
      bindings: {
        pb3: create(Proto3TestAllTypesSchema, {
          mapInt64NestedType: {
            "0": create(Proto3NestedTestAllTypesSchema, {
              child: create(Proto3NestedTestAllTypesSchema, {
                payload: create(Proto3TestAllTypesSchema, { singleInt32: 1 }),
              }),
            }),
          },
        } as never),
      },
    });
  }
  if (testCase.name === "select_field") {
    return activation({
      bindings: {
        "a.b": { c: true },
        pb3: create(Proto3TestAllTypesSchema, {
          repeatedNestedEnum: [Proto3TestAllTypesNestedEnum.BAR],
        } as never),
        json: { list: ["world"] },
      },
    });
  }
  if (testCase.name === "select_pb3_wrapper_fields") {
    return activation({
      bindings: {
        a: create(Proto3TestAllTypesSchema, {
          singleInt64Wrapper: 0n,
          singleStringWrapper: "hello",
        } as never),
      },
    });
  }
  if (testCase.name === "unknown_attribute") {
    return partialActivation({
      bindings: normalizeInterpreterBindings(testCase.in ?? {}),
      unknowns: [attributePattern("a").qualInt(0)],
    });
  }
  if (testCase.name === "macro_has_map_key_unknown_propagates") {
    return partialActivation({
      bindings: normalizeInterpreterBindings(testCase.in ?? {}),
      unknowns: [attributePattern("a")],
    });
  }
  if (testCase.name === "unknown_attribute_mixed_qualifier") {
    return partialActivation({
      bindings: normalizeInterpreterBindings(testCase.in ?? {}),
      unknowns: [attributePattern("a").qualInt(0)],
    });
  }
  return activation({
    bindings: normalizeInterpreterBindings(testCase.in ?? {}),
  });
}

/**
 * runtimeTypeExpr removes the Go package qualifier used in synced type expressions.
 */
function runtimeTypeExpr(value: string): string {
  return value.replace(/\btypes\./g, "");
}

/**
 * resolveInterpreterVariables decodes synced Go variable declarations into local checker declarations.
 */
function resolveInterpreterVariables(
  varsValue: Array<{ $expr?: string }> | undefined,
): Array<ReturnType<typeof variableDecl>> {
  return (varsValue ?? []).map((entry) => {
    const expr = entry.$expr?.trim() ?? "";
    const match = /^decls\.NewVariable\("([\s\S]*?)",\s*([\s\S]+)\)$/.exec(expr);
    if (!match) {
      throw new Error(`unsupported interpreter variable expr: ${entry.$expr}`);
    }
    return variableDecl(
      resolveSyncedExpr(match[1]!) as string,
      resolveSyncedExpr({ $expr: runtimeTypeExpr(match[2]!) }) as Type,
    );
  });
}

/**
 * expectedInterpreterValue returns the expected CEL result for a synced row.
 */
function expectedInterpreterValue(
  testCase: SyncedInterpreterCase,
  reg: ReturnType<typeof registry>,
): Val {
  if (testCase.out !== undefined) {
    const resolved = resolveInterpreterAssignableValue(
      normalizeInterpreterSyncedValue(testCase.out),
    );
    return isResolvedVal(resolved) ? resolved : reg.nativeToValue(resolved);
  }
  return True;
}

/**
 * expectInterpreterResult compares one runtime result against the synced expectation.
 */
function expectInterpreterResult(
  actual: Val,
  testCase: SyncedInterpreterCase,
  reg: ReturnType<typeof registry> = registry(),
): void {
  if (testCase.err) {
    expect(actual).toBeInstanceOf(Err);
    expect((actual as Err).message).toContain(testCase.err);
    return;
  }
  const expected = expectedInterpreterValue(testCase, reg);
  if (actual instanceof Unknown && expected instanceof Unknown) {
    expect(actual.contains(expected)).toBe(true);
    expect(expected.contains(actual)).toBe(true);
    return;
  }
  const equal = actual.equal(expected);
  expect(equal).toBeInstanceOf(Bool);
  expect((equal as Bool).value()).toBe(true);
}

/**
 * executeSyncedInterpreterCase evaluates one synced interpreter row through parse, check, plan, and exec.
 */
function executeSyncedInterpreterCase(testCase: SyncedInterpreterCase): void {
  if (blockedSyncedInterpreterCases.has(testCase.name)) {
    throw new Error(`blocked synced case should no longer execute: ${testCase.name}`);
  }
  const reg = interpreterRegistry(testCase);
  const dispatcherValue = standardDispatcher();
  const containerValue = interpreterContainer(testCase);
  const checkerEnv = env(containerValue, reg, {
    crossTypeNumericComparisons: true,
  });
  checkerEnv.addFunctions(...standardFunctions());
  const variables = resolveInterpreterVariables(testCase.vars);
  if (variables.length !== 0) {
    checkerEnv.addIdents(...variables);
  }
  addInterpreterFunctions(testCase, checkerEnv, dispatcherValue);
  const sourceExpr = normalizeInterpreterSourceExpr(testCase.expr);
  const parsed = parse(sourceExpr, { enableOptionalSyntax: true });
  const runtime = interpreter({
    dispatcher: dispatcherValue,
    provider: reg,
    adapter: reg,
    container: containerValue,
    attrFactory: interpreterAttributeFactory(testCase, reg),
  });
  const exprAst =
    testCase.unchecked === true ? parsed : check(parsed, textSource(sourceExpr), checkerEnv);
  const program = runtime.interpretable({ exprAst });
  const frame = executionFrame({
    input: interpreterActivation(testCase),
  });
  try {
    const result = program.exec(frame);
    expectInterpreterResult(result, testCase, reg);
  } finally {
    frame.close();
  }

  const state = evalState();
  const observerConfig = evalStateObserverConfig({ factory: () => state });
  const plannerConfigs = [
    optimizeConfig(),
    mergePlannerConfigs(exhaustiveEvalConfig(), observerConfig),
    observerConfig,
  ];
  const usesRegexOptimization = JSON.stringify(testCase.extraOpts ?? []).includes(
    "CompileRegexConstants",
  );
  for (const plannerConfig of plannerConfigs) {
    const configured = usesRegexOptimization
      ? mergePlannerConfigs(
          plannerConfig,
          compileRegexConstantsConfig({ optimizations: [matchesRegexOptimization] }),
        )
      : plannerConfig;
    if (testCase.progErr && usesRegexOptimization) {
      expect(() => runtime.interpretable({ exprAst, plannerConfig: configured })).toThrow(
        testCase.progErr,
      );
      continue;
    }
    const configuredProgram = runtime.interpretable({ exprAst, plannerConfig: configured });
    const configuredFrame = executionFrame({ input: interpreterActivation(testCase) });
    try {
      expectInterpreterResult(configuredProgram.exec(configuredFrame), testCase, reg);
    } finally {
      configuredFrame.close();
      state.reset();
    }
  }
}

/**
 * mergePlannerConfigs combines decorator and observer configuration in application order.
 */
function mergePlannerConfigs(
  ...configs: Array<ReturnType<typeof optimizeConfig>>
): ReturnType<typeof optimizeConfig> {
  return {
    decorators: configs.flatMap((config) => config.decorators ?? []),
    observers: configs.flatMap((config) => config.observers ?? []),
  };
}

/**
 * normalizeInterpreterSyncedValue rewrites a subset of synced Go runtime expressions into forms
 * already understood by the shared synced-value helpers.
 */
function normalizeInterpreterSyncedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeInterpreterSyncedValue(entry));
  }
  if (typeof value === "object" && value !== null) {
    if ("$expr" in value && typeof (value as { $expr?: unknown }).$expr === "string") {
      return {
        $expr: normalizeInterpreterExpr((value as { $expr: string }).$expr),
      };
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeInterpreterSyncedValue(entry)]),
    );
  }
  return value;
}

/**
 * normalizeInterpreterExpr rewrites interpreter-specific synced expressions into shared helper syntax.
 */
function normalizeInterpreterExpr(expr: string): string {
  const trimmed = expr.trim();
  const floatMatch = /^float32\(([\s\S]+)\)$/.exec(trimmed);
  if (floatMatch) {
    return floatMatch[1]!;
  }
  return trimmed.replace(/\btypes\./g, "");
}

/**
 * normalizeInterpreterSourceExpr rewrites CEL source snippets that rely on Go-side package aliases.
 */
function normalizeInterpreterSourceExpr(expr: string): string {
  return expr.replace(/\bv1alpha1\./g, "cel.expr.");
}

/**
 * normalizeInterpreterBindings preserves integer-shaped runtime inputs as CEL ints while keeping
 * floating-point inputs as doubles.
 */
function normalizeInterpreterBindings(value: unknown): unknown {
  const normalized = normalizeInterpreterSyncedValue(value);
  return coerceInterpreterBindingValue(normalized);
}

/**
 * coerceInterpreterBindingValue recursively converts synced activation inputs into CEL-friendly
 * native runtime shapes without forcing all numbers to doubles.
 */
function coerceInterpreterBindingValue(value: unknown): unknown {
  if (typeof value === "number") {
    return Number.isInteger(value) ? BigInt(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => coerceInterpreterBindingValue(entry));
  }
  if (typeof value === "object" && value !== null) {
    if ("$expr" in value) {
      return resolveInterpreterAssignableValue(value);
    }
    if (isInterpreterProtoMessage(value)) {
      // Preserve protobuf message instances so descriptor-backed field access continues to work.
      return value;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, coerceInterpreterBindingValue(entry)]),
    );
  }
  return value;
}

/**
 * isInterpreterProtoMessage returns whether the synced interpreter binding is already a protobuf message.
 */
function isInterpreterProtoMessage(value: unknown): value is { $typeName: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "$typeName" in value &&
    typeof (value as { $typeName?: unknown }).$typeName === "string"
  );
}

/**
 * resolveInterpreterAssignableValue resolves interpreter-specific synced expressions before
 * delegating to the shared synced-value helpers.
 */
function resolveInterpreterAssignableValue(value: unknown): unknown {
  const expr = (value as { $expr?: string } | undefined)?.$expr?.trim();
  if (expr) {
    const nativeValue = resolveInterpreterNativeExpr(expr);
    if (nativeValue !== undefined) {
      return nativeValue;
    }
  }
  if (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { $expr?: unknown }).$expr === "string" &&
        /^'.'$/.test(String((entry as { $expr: string }).$expr).trim()),
    )
  ) {
    return Uint8Array.from(
      value.map((entry) =>
        String((entry as { $expr: string }).$expr)
          .trim()
          .charCodeAt(1),
      ),
    );
  }
  return resolveRuntimeAssignableValue(value);
}

/**
 * resolveInterpreterNativeExpr converts protobuf-heavy interpreter fixtures into local native values.
 */
function resolveInterpreterNativeExpr(expr: string): unknown {
  switch (expr) {
    case "types.NullValue":
      return resolveRuntimeAssignableValue({ $expr: "NullValue" });
    case "types.True":
      return True;
    case "types.False":
      return False;
    case "types.Int(1234)":
      return registry().nativeToValue(1234n);
    case "types.Int(101)":
      return 101n;
    case "types.OptionalOf(types.Int(101))":
      return resolveRuntimeAssignableValue({ $expr: "optionalOf(101)" });
    case 'NewUnknown(4, NewAttributeTrail("a"))':
      return unknown(4, attributeTrail("a"));
    case "&proto2pb.TestAllTypes{}":
      return create(Proto2TestAllTypesSchema);
  }
  const qualifiedUnknownMatch =
    /^NewUnknown\((\d+), QualifyAttribute\[(int64|uint64)\]\(NewAttributeTrail\("([^"]+)"\), (\d+)\)\)$/.exec(
      expr,
    );
  if (qualifiedUnknownMatch) {
    const qualifier =
      qualifiedUnknownMatch[2] === "uint64"
        ? BigInt(qualifiedUnknownMatch[4]!)
        : Number(qualifiedUnknownMatch[4]!);
    return unknown(
      Number(qualifiedUnknownMatch[1]!),
      qualifyAttribute(attributeTrail(qualifiedUnknownMatch[3]!), qualifier),
    );
  }
  if (expr.startsWith("newTestPartialActivation(")) {
    return resolvePartialActivationBindings(expr);
  }
  if (expr.startsWith("&exprpb.Expr{Id: 1")) {
    return create(ExprSchema, {
      id: 1n,
      exprKind: {
        case: "constExpr",
        value: {
          constantKind: {
            case: "stringValue",
            value: "oneof_test",
          },
        },
      },
    } as never);
  }
  if (expr.startsWith("&proto3pb.TestAllTypes_NestedMessage{")) {
    const bbMatch = /Bb:\s*(\d+)/.exec(expr);
    return create(Proto3TestAllTypesNestedMessageSchema, { bb: Number(bbMatch?.[1] ?? "0") });
  }
  if (expr.startsWith("&proto3pb.TestAllTypes{")) {
    if (expr.includes("SingleInt32: 1")) {
      return create(Proto3TestAllTypesSchema, { singleInt32: 1 });
    }
    if (expr.includes("RepeatedNestedEnum")) {
      return create(Proto3TestAllTypesSchema, {
        repeatedNestedEnum: [
          Proto3TestAllTypesNestedEnum.FOO,
          Proto3TestAllTypesNestedEnum.BAZ,
          Proto3TestAllTypesNestedEnum.BAR,
        ],
        repeatedInt32: [0, 2],
      });
    }
    if (expr.includes("SingleInt64Wrapper")) {
      return create(Proto3TestAllTypesSchema, {
        singleInt64Wrapper: 10n,
      } as never);
    }
    if (expr.includes("NestedType:")) {
      return create(Proto3TestAllTypesSchema, {
        nestedType: {
          case: "singleNestedMessage",
          value: create(Proto3TestAllTypesNestedMessageSchema, { bb: 1234 }),
        },
      } as never);
    }
    if (expr.includes("MapInt64NestedType")) {
      return create(Proto3TestAllTypesSchema, {
        mapInt64NestedType: {
          "0": create(Proto3NestedTestAllTypesSchema, {
            child: create(Proto3NestedTestAllTypesSchema, {
              payload: create(Proto3TestAllTypesSchema, { singleInt32: 1 }),
            }),
          }),
          "1": create(Proto3NestedTestAllTypesSchema),
        },
        repeatedBool: [false],
        mapStringString: {},
      } as never);
    }
    if (expr.includes("SingleUint64: 10")) {
      return create(Proto3TestAllTypesSchema, { singleUint64: 10n } as never);
    }
    if (expr.includes("RepeatedNestedEnum: []proto3pb.TestAllTypes_NestedEnum")) {
      return create(Proto3TestAllTypesSchema, {
        repeatedNestedEnum: [Proto3TestAllTypesNestedEnum.BAR],
      });
    }
    if (expr.includes("SingleInt64Wrapper:  &wrapperspb.Int64Value{}")) {
      return create(Proto3TestAllTypesSchema, {
        singleInt64Wrapper: 0n,
        singleStringWrapper: "hello",
      } as never);
    }
  }
  if (expr.startsWith("&proto2pb.TestAllTypes{")) {
    if (expr.includes("RepeatedBool")) {
      return create(Proto2TestAllTypesSchema, {
        repeatedBool: [false],
        mapInt64NestedType: { "1": create(Proto3NestedTestAllTypesSchema) },
        mapStringString: {},
      } as never);
    }
  }
  if (expr.startsWith("&structpb.Value{")) {
    return { list: ["world"] };
  }
  return undefined;
}

/**
 * resolvePartialActivationBindings extracts the binding payload from a synced partial activation.
 */
function resolvePartialActivationBindings(expr: string): unknown {
  const args = splitInterpreterArgs(expr.slice("newTestPartialActivation(".length, -1));
  if (args.length < 2) {
    throw new Error(`unsupported interpreter partial activation expr: ${expr}`);
  }
  return resolveInterpreterMapLiteral(args[1]!);
}

/**
 * resolveInterpreterMapLiteral converts the synced Go map literals used in interpreter fixtures.
 */
function resolveInterpreterMapLiteral(expr: string): Record<string, unknown> {
  const trimmed = expr.trim();
  if (trimmed === "map[string]any{}") {
    return {};
  }
  const outerMatch = /^map\[string\]any\{([\s\S]*)\}$/.exec(trimmed);
  if (!outerMatch) {
    throw new Error(`unsupported interpreter map literal: ${expr}`);
  }
  const inner = outerMatch[1]!.trim();
  if (!inner) {
    return {};
  }
  return Object.fromEntries(
    splitInterpreterArgs(inner).map((entry) => {
      const colonIndex = entry.indexOf(":");
      const rawKey = entry.slice(0, colonIndex).trim().replace(/^"|"$/g, "");
      const rawValue = entry.slice(colonIndex + 1).trim();
      return [rawKey, resolveInterpreterMapValue(rawValue)];
    }),
  );
}

/**
 * resolveInterpreterMapValue converts nested synced Go map values into native runtime shapes.
 */
function resolveInterpreterMapValue(expr: string): unknown {
  const trimmed = expr.trim();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  const intMapMatch = /^map\[int64\]any\{([\s\S]*)\}$/.exec(trimmed);
  if (intMapMatch) {
    const inner = intMapMatch[1]!.trim();
    if (!inner) {
      return {};
    }
    return Object.fromEntries(
      splitInterpreterArgs(inner).map((entry) => {
        const colonIndex = entry.indexOf(":");
        const rawKey = entry.slice(0, colonIndex).trim();
        const rawValue = entry.slice(colonIndex + 1).trim();
        return [rawKey, resolveInterpreterMapValue(rawValue)];
      }),
    );
  }
  throw new Error(`unsupported interpreter map value expr: ${expr}`);
}

/**
 * splitInterpreterArgs separates comma-delimited Go-style arguments while preserving nested literals.
 */
function splitInterpreterArgs(source: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' && source[index - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{" || char === "[" || char === "(") {
      depth += 1;
      continue;
    }
    if (char === "}" || char === "]" || char === ")") {
      depth -= 1;
      continue;
    }
    if (char === "," && depth === 0) {
      out.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  out.push(source.slice(start).trim());
  return out.filter((entry) => entry.length !== 0);
}

/**
 * isResolvedVal returns whether a synced expectation has already been resolved into a CEL value.
 */
function isResolvedVal(value: unknown): value is Val {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "function" &&
    "value" in value &&
    typeof (value as { value?: unknown }).value === "function"
  );
}

/**
 * interpreter_test.go coverage tracks the upstream interpreter tests.
 */
describe("interpreter/interpreter_test.go", () => {
  /**
   * TestInterpreter tracks the upstream interpreter coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpreter", () => {
    const syncedInterpreterCases = syncedCases<SyncedInterpreterCase>(
      "interpreter/interpreter_test.go/TestInterpreter",
    );

    for (const testCase of syncedInterpreterCases) {
      const testName = `interpreter/interpreter_test.go/TestInterpreter/${testCase.name}`;
      it(testName, () => {
        executeSyncedInterpreterCase(testCase);
      });
    }
  });

  /**
   * TestInterpreter_ProtoAttributeOpt tracks the upstream proto attribute optimization coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpreter_ProtoAttributeOpt", () => {
    it("interpreter/interpreter_test.go/TestInterpreter_ProtoAttributeOpt", () => {
      const sourceExpr = `pb3.map_int64_nested_type[0].child.payload.single_int32`;
      const reg = registry([
        { $typeName: Proto3TestAllTypesSchema.typeName } as never,
        Proto3TestAllTypesSchema,
      ]);
      const checkerEnv = env(defaultContainer, reg, { crossTypeNumericComparisons: true });
      checkerEnv.addFunctions(...standardFunctions());
      checkerEnv.addIdents(variableDecl("pb3", objectType(Proto3TestAllTypesSchema.typeName)));
      const checked = check(parse(sourceExpr), textSource(sourceExpr), checkerEnv);
      const program = interpreter({
        dispatcher: standardDispatcher(),
        provider: reg,
        adapter: reg,
      }).interpretable({ exprAst: checked, plannerConfig: optimizeConfig() });
      expect("attr" in program && typeof program.attr === "function").toBe(true);
      if (!("attr" in program) || typeof program.attr !== "function") {
        return;
      }
      const qualifiers = (
        program.attr() as unknown as { qualifiersValue?: Array<{ id(): number }> }
      ).qualifiersValue;
      expect(qualifiers).toHaveLength(5);
    });
  });

  /**
   * TestInterpreter_LogicalAndMissingType tracks the upstream missing-type logical-and coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpreter_LogicalAndMissingType", () => {
    it("interpreter/interpreter_test.go/TestInterpreter_LogicalAndMissingType", () => {
      const parsed = parse(`a && TestProto{c: true}.c`);
      const reg = registry();
      expect(() =>
        interpreter({
          dispatcher: standardDispatcher(),
          provider: reg,
          adapter: reg,
          attrFactory: attributeFactory({
            containerValue: defaultContainer,
            adapter: reg,
            provider: reg,
          }),
        }).interpretable({ exprAst: parsed }),
      ).toThrow();
    });
  });

  /**
   * TestInterpreter_ExhaustiveConditionalExpr tracks the upstream exhaustive conditional coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpreter_ExhaustiveConditionalExpr", () => {
    it("interpreter/interpreter_test.go/TestInterpreter_ExhaustiveConditionalExpr", () => {
      const sourceExpr = `a ? b < 1.0 : c == ['hello']`;
      const state = evalState();
      const stateConfig = evalStateObserverConfig({ factory: () => state });
      const reg = registry();
      const program = interpreter({
        dispatcher: standardDispatcher(),
        provider: reg,
        adapter: reg,
      }).interpretable({
        exprAst: parse(sourceExpr),
        plannerConfig: {
          decorators: [
            ...(exhaustiveEvalConfig().decorators ?? []),
            ...(stateConfig.decorators ?? []),
          ],
          observers: stateConfig.observers,
        },
      });
      const frame = executionFrame({
        input: activation({ bindings: { a: true, b: 0.999, c: ["hello"] } }),
      });
      try {
        expect(program.exec(frame)).toBe(True);
        expect(state.value(7)[0]).toBe(True);
      } finally {
        frame.close();
      }
    });
  });

  /**
   * TestInterpreter_InterruptableEval tracks the upstream interruptable eval coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpreter_InterruptableEval", () => {
    it("interpreter/interpreter_test.go/TestInterpreter_InterruptableEval", () => {
      const sourceExpr = `items.map(i, i).map(i, i).size() != 0`;
      const reg = registry();
      const checkerEnv = env(defaultContainer, reg, { crossTypeNumericComparisons: true });
      checkerEnv.addFunctions(...standardFunctions());
      checkerEnv.addIdents(variableDecl("items", listType(IntType)));
      const checked = check(parse(sourceExpr), textSource(sourceExpr), checkerEnv);
      const program = interpreter({
        dispatcher: standardDispatcher(),
        provider: reg,
        adapter: reg,
      }).interpretable({ exprAst: checked, plannerConfig: interruptableEvalConfig() });
      const controller = new AbortController();
      controller.abort();
      const frame = executionFrame({
        input: { items: Array.from({ length: 5000 }, (_, index) => index) },
      });
      frame.setContext({ signal: controller.signal, interruptCheckFrequency: 100 });
      try {
        expect(program.exec(frame)).toEqual(new Err("operation interrupted"));
      } finally {
        frame.close();
      }
    });
  });

  /**
   * TestInterpreter_ExhaustiveLogicalOrEquals tracks the upstream logical-or coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpreter_ExhaustiveLogicalOrEquals", () => {
    it("interpreter/interpreter_test.go/TestInterpreter_ExhaustiveLogicalOrEquals", () => {
      const state = evalState();
      const stateConfig = evalStateObserverConfig({ factory: () => state });
      const reg = registry();
      const program = interpreter({
        dispatcher: standardDispatcher(),
        provider: reg,
        adapter: reg,
      }).interpretable({
        exprAst: parse(`a || b == "b"`),
        plannerConfig: {
          decorators: [
            ...(exhaustiveEvalConfig().decorators ?? []),
            ...(stateConfig.decorators ?? []),
          ],
          observers: stateConfig.observers,
        },
      });
      const frame = executionFrame({ input: activation({ bindings: { a: true, b: "b" } }) });
      try {
        expect(program.exec(frame)).toBe(True);
        expect(state.value(3)[0]).toBe(True);
      } finally {
        frame.close();
      }
    });
  });

  /**
   * TestInterpreter_SetProto2PrimitiveFields tracks the upstream proto2 field coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpreter_SetProto2PrimitiveFields", () => {
    it("interpreter/interpreter_test.go/TestInterpreter_SetProto2PrimitiveFields", () => {
      const sourceExpr = `input == TestAllTypes{
        single_int32: 1,
        single_int64: 2,
        single_uint32: 3u,
        single_uint64: 4u,
        single_float: -3.3,
        single_double: -2.2,
        single_string: "hello world",
        single_bool: true
      }`;
      const reg = registry([
        { $typeName: Proto2TestAllTypesSchema.typeName } as never,
        Proto2TestAllTypesSchema,
      ]);
      const containerValue = sourceContainer({ name: "google.expr.proto2.test" });
      const checkerEnv = env(containerValue, reg, { crossTypeNumericComparisons: true });
      checkerEnv.addFunctions(...standardFunctions());
      checkerEnv.addIdents(variableDecl("input", objectType(Proto2TestAllTypesSchema.typeName)));
      const checked = check(parse(sourceExpr), textSource(sourceExpr), checkerEnv);
      const input = reg.newValue(Proto2TestAllTypesSchema.typeName, {
        single_int32: reg.nativeToValue(1),
        single_int64: reg.nativeToValue(2n),
        single_uint32: new Uint(3n),
        single_uint64: new Uint(4n),
        single_float: reg.nativeToValue(-3.3),
        single_double: reg.nativeToValue(-2.2),
        single_string: reg.nativeToValue("hello world"),
        single_bool: reg.nativeToValue(true),
      });
      const program = interpreter({
        dispatcher: standardDispatcher(),
        provider: reg,
        adapter: reg,
        container: containerValue,
      }).interpretable({ exprAst: checked });
      const frame = executionFrame({ input: { input } });
      try {
        expect(program.exec(frame)).toEqual(True);
      } finally {
        frame.close();
      }
    });
  });

  /**
   * TestInterpreter_MissingIdentInSelect tracks the upstream missing-ident coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpreter_MissingIdentInSelect", () => {
    it("interpreter/interpreter_test.go/TestInterpreter_MissingIdentInSelect", () => {
      const sourceExpr = `a.b.c`;
      const containerValue = sourceContainer({ name: "test" });
      const reg = registry();
      const checkerEnv = env(containerValue, reg, { crossTypeNumericComparisons: true });
      checkerEnv.addFunctions(...standardFunctions());
      checkerEnv.addIdents(variableDecl("a.b", DynType));
      const checked = check(parse(sourceExpr), textSource(sourceExpr), checkerEnv);
      const program = interpreter({
        dispatcher: standardDispatcher(),
        provider: reg,
        adapter: reg,
        container: containerValue,
        attrFactory: partialAttributeFactory({
          containerValue,
          adapter: reg,
          provider: reg,
        }),
      }).interpretable({ exprAst: checked });
      const partialFrame = executionFrame({
        input: partialActivation({
          bindings: {
            "a.b": {
              d: "hello",
            },
          },
          unknowns: [attributePattern("a.b").qualString("c")],
        }),
      });
      try {
        expect(program.exec(partialFrame)).toBeInstanceOf(Unknown);
      } finally {
        partialFrame.close();
      }
      const emptyFrame = executionFrame({ input: emptyActivation() });
      try {
        expect(program.exec(emptyFrame)).toBeInstanceOf(Err);
      } finally {
        emptyFrame.close();
      }
    });
  });

  /**
   * TestInterpreter_TypeConversionOpt tracks the upstream type conversion optimization coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpreter_TypeConversionOpt", () => {
    const syncedTypeConversionCases = syncedCases<SyncedInterpreterCase>(
      "interpreter/interpreter_test.go/TestInterpreter_TypeConversionOpt",
    );

    for (const testCase of syncedTypeConversionCases) {
      const caseName = `interpreter/interpreter_test.go/TestInterpreter_TypeConversionOpt/${testCase.in}`;
      it(caseName, () => {
        if (typeof testCase.in !== "string") {
          throw new Error("type conversion input must be a CEL expression string");
        }
        const sourceExpr = testCase.in;
        const reg = registry();
        const checkerEnv = env(defaultContainer, reg, { crossTypeNumericComparisons: true });
        checkerEnv.addFunctions(...standardFunctions());
        const checked = check(parse(sourceExpr), textSource(sourceExpr), checkerEnv);
        const runtime = interpreter({
          dispatcher: standardDispatcher(),
          provider: reg,
          adapter: reg,
        });
        if (testCase.err) {
          let planningError: unknown;
          expect(() => {
            runtime.interpretable({ exprAst: checked, plannerConfig: optimizeConfig() });
          }).toThrow();
          try {
            runtime.interpretable({ exprAst: checked, plannerConfig: optimizeConfig() });
          } catch (error) {
            planningError = error;
          }
          const ordinary = runtime.interpretable({ exprAst: checked });
          const frame = executionFrame({ input: emptyActivation() });
          try {
            expect((ordinary.exec(frame) as Err).toString()).toBe(String(planningError));
          } finally {
            frame.close();
          }
          return;
        }
        const optimized = runtime.interpretable({
          exprAst: checked,
          plannerConfig: optimizeConfig(),
        });
        expect("value" in optimized && typeof optimized.value === "function").toBe(true);
        const expected = expectedInterpreterValue(testCase, reg);
        expect((optimized as unknown as { value(): Val }).value().equal(expected)).toEqual(True);
      });
    }
  });

  /**
   * TestInterpreter_PlanOptionalElements tracks the upstream optional element planning coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpreter_PlanOptionalElements", () => {
    it("interpreter/interpreter_test.go/TestInterpreter_PlanOptionalElements", () => {
      const factory = exprFactory();
      const negativeIndex = ast(factory.list(1, [factory.ident(2, "a")], [-1]));
      const outOfRangeIndex = ast(factory.list(1, [factory.ident(2, "b")], [24]));
      const reg = registry();
      const runtime = interpreter({
        dispatcher: standardDispatcher(),
        provider: reg,
        adapter: reg,
      });
      expect(() =>
        runtime.interpretable({ exprAst: negativeIndex, plannerConfig: optimizeConfig() }),
      ).toThrow();
      expect(() =>
        runtime.interpretable({ exprAst: outOfRangeIndex, plannerConfig: optimizeConfig() }),
      ).toThrow();
    });
  });

  /**
   * TestInterpreter_PlanListComprehensionTwoVar tracks the upstream list comprehension coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpreter_PlanListComprehensionTwoVar", () => {
    it("interpreter/interpreter_test.go/TestInterpreter_PlanListComprehensionTwoVar", () => {
      const factory = exprFactory();
      const expression = factory.comprehensionTwoVar(
        1,
        factory.list(2, [factory.literal(3, 2n), factory.literal(4, 3n)], []),
        "i",
        "v",
        factory.accuIdentName(),
        factory.list(5, [], []),
        factory.literal(6, true),
        factory.call(
          7,
          operators.Add,
          factory.accuIdent(8),
          factory.list(9, [factory.ident(10, "i"), factory.ident(11, "v")], []),
        ),
        factory.accuIdent(12),
      );
      const reg = registry();
      const program = interpreter({
        dispatcher: standardDispatcher(),
        provider: reg,
        adapter: reg,
      }).interpretable({ exprAst: ast(expression), plannerConfig: optimizeConfig() });
      const frame = executionFrame({ input: emptyActivation() });
      try {
        expect(program.exec(frame).value()).toEqual([0n, 2n, 1n, 3n]);
      } finally {
        frame.close();
      }
    });
  });

  /**
   * TestInterpreter_PlanMapComprehensionTwoVar tracks the upstream map comprehension coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpreter_PlanMapComprehensionTwoVar", () => {
    it("interpreter/interpreter_test.go/TestInterpreter_PlanMapComprehensionTwoVar", () => {
      const factory = exprFactory();
      const reg = registry();
      const intStringMapType = mapType(IntType, StringType);
      const mapInsert = functionDecl("cel.@mapInsert", {
        overloads: [
          overload("cel.@mapInsert", [intStringMapType, IntType, StringType], intStringMapType, {
            functionBinding: (...args) => {
              const out = mutableMap(reg);
              const existing = args[0]!.value() as Map<Val, Val>;
              for (const [key, value] of existing) {
                out.insert(key, value);
              }
              return out.insert(args[1]!, args[2]!);
            },
          }),
        ],
      });
      const expression = factory.comprehensionTwoVar(
        1,
        factory.map(2, [
          factory.mapEntry(3, factory.literal(4, 0n), factory.literal(5, "first"), false),
          factory.mapEntry(6, factory.literal(7, 1n), factory.literal(8, "second"), false),
        ]),
        "k",
        "v",
        factory.accuIdentName(),
        factory.map(9, []),
        factory.literal(10, true),
        factory.call(
          11,
          "cel.@mapInsert",
          factory.accuIdent(12),
          factory.call(13, operators.Add, factory.ident(14, "k"), factory.literal(15, 1n)),
          factory.ident(16, "v"),
        ),
        factory.accuIdent(17),
      );
      const runtimeDispatcher = standardDispatcher();
      runtimeDispatcher.add({ overloads: mapInsert.bindings() });
      const program = interpreter({
        dispatcher: runtimeDispatcher,
        provider: reg,
        adapter: reg,
      }).interpretable({ exprAst: ast(expression), plannerConfig: optimizeConfig() });
      const frame = executionFrame({ input: emptyActivation() });
      try {
        expect(program.exec(frame).value()).toEqual(
          new Map<Val, Val>([
            [reg.nativeToValue(1n), reg.nativeToValue("first")],
            [reg.nativeToValue(2n), reg.nativeToValue("second")],
          ]),
        );
      } finally {
        frame.close();
      }
    });
  });

  /**
   * TestInterruptErrorIs tracks the upstream interrupt error coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterruptErrorIs", () => {
    it("interpreter/interpreter_test.go/TestInterruptErrorIs", () => {
      const interruptError = new InterruptError();
      expect(interruptError.is(new InterruptError())).toBe(true);
      expect(interruptError.is(new Error("other error"))).toBe(false);
    });
  });

  /**
   * TestFolderActivation tracks the upstream folder activation coverage.
   */
  describe("interpreter/interpreter_test.go/TestFolderActivation", () => {
    it("interpreter/interpreter_test.go/TestFolderActivation", () => {
      const parent = executionFrame({ input: emptyActivation() });
      const folder = parent.push(activation({ bindings: {} }));
      try {
        expect(folder.parentFrame()).toBe(parent);
        expect(folder.pop()).toBe(parent);
      } finally {
        parent.close();
      }
    });
  });

  /**
   * TestEvalWatchConstructor tracks the upstream eval watch coverage.
   */
  describe("interpreter/interpreter_test.go/TestEvalWatchConstructor", () => {
    it("interpreter/interpreter_test.go/TestEvalWatchConstructor", () => {
      const watched = watchConstructor({
        constructor: listInterpretable({
          id: 1,
          elements: [constValue({ id: 2, value: IntOne })],
        }),
        observer: () => {},
      });
      expect(watched.initVals()).toHaveLength(1);
      expect(watched.type()).toBe(ListType);
    });
  });

  /**
   * TestCustomDecorator tracks the upstream custom decorator coverage.
   */
  describe("interpreter/interpreter_test.go/TestCustomDecorator", () => {
    it("interpreter/interpreter_test.go/TestCustomDecorator", () => {
      const decorator: InterpretableDecorator = (value) => value;
      const nextPlanner = {
        ...defaultPlannerState(),
        ...customDecoratorConfig({ decorator }),
      };
      expect(nextPlanner.decorators).toHaveLength(1);
      const wrapped = nextPlanner.decorators[0]!(constValue({ id: 1, value: IntOne }));
      expect(wrapped.id()).toBe(1);
    });
  });

  /**
   * TestCostTrackerActualCost tracks the upstream actual runtime cost coverage.
   */
  describe("interpreter/interpreter_test.go/TestCostTrackerActualCost", () => {
    it("interpreter/interpreter_test.go/TestCostTrackerActualCost", () => {
      const tracker = new CostTracker({ cost: 42 });
      expect(tracker.actualCost()).toBe(42);
    });
  });

  /**
   * TestV2Adapter tracks the upstream V2 adapter coverage.
   */
  describe("interpreter/interpreter_test.go/TestV2Adapter", () => {
    it("interpreter/interpreter_test.go/TestV2Adapter", () => {
      const legacy: Interpretable = {
        id: () => 42,
        eval: () => IntOne,
      };
      const runtime = interpreter({
        dispatcher: {
          add: () => undefined,
          findOverload: () => [undefined, false],
          overloadIds: () => [],
        },
        provider: registry(),
        adapter: registry(),
        attrFactory: {
          absoluteAttribute: () => {
            throw new Error("not used");
          },
          maybeAttribute: () => {
            throw new Error("not used");
          },
          qualifier: () => {
            throw new Error("not used");
          },
          conditionalAttribute: (
            _id: number,
            _expr: { exec(frame: ExecutionFrame): Val; eval(vars: Activation): Val },
            _truthy: Attribute,
            _falsy: Attribute,
          ): Attribute => {
            throw new Error("Function not implemented.");
          },
          relativeAttribute: (
            _id: number,
            _operand: { exec(frame: ExecutionFrame): Val; eval(vars: Activation): Val },
          ): Attribute => {
            throw new Error("Function not implemented.");
          },
        },
      });
      const adapted = runtime.adapt({ interpretable: legacy });
      expect(adapted.id()).toBe(42);
      const frame = executionFrame({ input: emptyActivation() });
      try {
        expect(adapted.exec(frame)).toBe(IntOne);
      } finally {
        frame.close();
      }
    });
  });

  /**
   * TestInterpretableArgs tracks the upstream interpretable argument coverage.
   */
  describe("interpreter/interpreter_test.go/TestInterpretableArgs", () => {
    it("interpreter/interpreter_test.go/TestInterpretableArgs", () => {
      const calls: Array<{ call: InterpretableCall; want: number }> = [
        {
          call: callInterpretable({
            id: 1,
            functionName: "_!=_",
            args: [constValue({ id: 2, value: IntOne }), constValue({ id: 3, value: IntOne })],
          }),
          want: 2,
        },
        {
          call: callInterpretable({
            id: 4,
            functionName: "zero",
            args: [],
            impl: () => IntZero,
          }),
          want: 0,
        },
        {
          call: callInterpretable({
            id: 5,
            functionName: "f",
            args: [constValue({ id: 6, value: IntOne })],
            impl: (arg) => arg,
          }),
          want: 1,
        },
      ];
      for (const testCase of calls) {
        expect(testCase.call.args()).toHaveLength(testCase.want);
      }
    });
  });

  /**
   * TestNewCall tracks the upstream call-construction coverage.
   */
  describe("interpreter/interpreter_test.go/TestNewCall", () => {
    it("interpreter/interpreter_test.go/TestNewCall", () => {
      const call = callInterpretable({
        id: 10,
        functionName: "f",
        overloadId: "f_overload",
        args: [constValue({ id: 1, value: IntOne })],
        impl: () => True,
      });
      expect(call.id()).toBe(10);
      expect(call.functionName()).toBe("f");
      expect(call.overloadId()).toBe("f_overload");
    });
  });

  /**
   * TestExhaustiveOperatorsLegacyEval tracks the upstream legacy eval coverage.
   */
  describe("interpreter/interpreter_test.go/TestExhaustiveOperatorsLegacyEval", () => {
    it("interpreter/interpreter_test.go/TestExhaustiveOperatorsLegacyEval", () => {
      const calls: Interpretable[] = [
        callInterpretable({
          id: 1,
          functionName: "_||_",
          args: [constValue({ id: 2, value: True }), constValue({ id: 3, value: False })],
        }),
        callInterpretable({
          id: 4,
          functionName: "_&&_",
          args: [constValue({ id: 5, value: True }), constValue({ id: 6, value: True })],
        }),
      ];
      for (const expr of calls) {
        expect(() => expr.eval(emptyActivation())).not.toThrow();
      }
    });
  });

  /**
   * TestFindFrame tracks the upstream frame lookup coverage.
   */
  describe("interpreter/interpreter_test.go/TestFindFrame", () => {
    it("interpreter/interpreter_test.go/TestFindFrame", () => {
      const frame = executionFrame({ input: emptyActivation() });
      try {
        const nestedWrapper = {
          unwrap: () => ({
            unwrap: () => frame,
            resolveName: frame.resolveName.bind(frame),
            parent: frame.parent.bind(frame),
          }),
          resolveName: frame.resolveName.bind(frame),
          parent: frame.parent.bind(frame),
        };
        const parentWrapper = {
          resolveName: frame.resolveName.bind(frame),
          parent: () => frame,
        };
        expect(findFrame(nestedWrapper)).toBe(frame);
        expect(findFrame(parentWrapper)).toBe(frame);
      } finally {
        frame.close();
      }
    });
  });

  /**
   * TestObservableInterpretable tracks the upstream observable interpretable coverage.
   */
  describe("interpreter/interpreter_test.go/TestObservableInterpretable", () => {
    it("interpreter/interpreter_test.go/TestObservableInterpretable", () => {
      const observable = new ObservableInterpretable({
        interpretable: constValue({ id: 12, value: True }),
        observers: [],
      });
      expect(observable.id()).toBe(12);
      expect(observable.eval(emptyActivation())).toBe(True);
    });
  });
});
