import { create } from "@bufbuild/protobuf";
import { AnySchema, anyPack } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { check } from "../checker/checker.js";
import { env } from "../checker/env.js";
import { container, defaultContainer } from "../common/containers.js";
import { functionDecl, overload, variableDecl } from "../common/decls.js";
import * as operators from "../common/operators.js";
import { textSource } from "../common/source.js";
import { syncedCases } from "../common/spec-helpers.js";
import { standardFunctions } from "../common/stdlib.js";
import {
  attributeTrail,
  Bool,
  BoolType,
  String as CelString,
  Err,
  False,
  IntType,
  labelErrNode,
  mapType,
  noSuchOverloadErr,
  OptionalNone,
  objectType,
  optionalOf,
  qualifyAttribute,
  registry,
  StringType,
  True,
  type Type,
  Unknown,
  type Val,
} from "../common/types/index.js";
import { resolveSyncedExpr } from "../common/types/spec-helpers.js";
import { TestAllTypesSchema as Proto2TestAllTypesSchema } from "../gen/test/proto2pb/test_all_types_pb.js";
import {
  NestedTestAllTypesSchema as Proto3NestedTestAllTypesSchema,
  TestAllTypes_NestedMessageSchema as Proto3TestAllTypesNestedMessageSchema,
  TestAllTypesSchema as Proto3TestAllTypesSchema,
} from "../gen/test/proto3pb/test_all_types_pb.js";
import { parse } from "../parser/parser.js";
import { activation, emptyActivation, partialActivation } from "./activation.js";
import { attributePattern, partialAttributeFactory } from "./attribute-patterns.js";
import {
  type Attribute,
  type AttributeFactory,
  attributeFactory,
  type Qualifier,
} from "./attributes.js";
import { dispatcher } from "./dispatcher.js";
import { evalState } from "./eval-state.js";
import { executionFrame } from "./frame.js";
import { constValue } from "./interpretable.js";
import { evalStateObserverConfig, interpreter } from "./interpreter.js";
import { resolveAttributePatternExpr } from "./spec-helpers.js";

describe("interpreter/attributes_test.go/TestAttribute_StringRepresentation", () => {
  it("provides non-empty diagnostic strings for every attribute kind and trail", () => {
    const reg = registry();
    const factory = attributeFactory({
      containerValue: defaultContainer,
      adapter: reg,
      provider: reg,
    });
    const absolute = factory.absoluteAttribute(1, "a.b");
    const maybe = factory.maybeAttribute(2, "c");
    const relative = factory.relativeAttribute(3, constValue({ id: 1, value: new CelString("d") }));
    const conditional = factory.conditionalAttribute(
      4,
      constValue({ id: 1, value: True }),
      absolute,
      maybe,
    );

    for (const value of [absolute, maybe, relative, conditional, attributeTrail("x")]) {
      expect(String(value)).not.toBe("");
    }
  });
});

/**
 * Proto test registry keeps the protobuf test descriptors aligned with the upstream attribute tests.
 */
const protoTestRegistry = registry(
  [create(Proto2TestAllTypesSchema), Proto2TestAllTypesSchema],
  [create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema],
  [create(Proto3NestedTestAllTypesSchema), Proto3NestedTestAllTypesSchema],
  [create(Proto3TestAllTypesNestedMessageSchema), Proto3TestAllTypesNestedMessageSchema],
);

/**
 * OptionalAttributeCase mirrors one row in the upstream optional attribute table.
 */
interface OptionalAttributeCase {
  /**
   * comment describes the upstream case being exercised.
   */
  comment: string;

  /**
   * varName is the base variable name for the attribute under test.
   */
  varName: string;

  /**
   * quals lists non-optional qualifiers.
   */
  quals?: unknown[];

  /**
   * optQuals lists optional qualifiers.
   */
  optQuals?: unknown[];

  /**
   * vars provides the activation bindings for the case.
   */
  vars: Record<string, unknown>;

  /**
   * out is the expected resolved value for successful cases.
   */
  out?: unknown;

  /**
   * err is the expected error message for failing cases.
   */
  err?: string;
}

/**
 * AttributeStateCase mirrors one row in the upstream state-tracking table.
 */
interface AttributeStateCase {
  /**
   * expr is the CEL expression under test.
   */
  expr: string;

  /**
   * vars lists declarations required by the checker.
   */
  vars: Array<ReturnType<typeof variableDecl>>;

  /**
   * input is the activation or partial activation used for evaluation.
   */
  input: unknown;

  /**
   * out is the expected evaluation result.
   */
  out: Val;

  /**
   * state maps expression ids to expected observed values.
   */
  state: Record<number, unknown>;
}

/**
 * NestedMessageQualifier is a custom qualifier used to mirror the upstream custom-qualifier test seam.
 */
class NestedMessageQualifier implements Qualifier {
  /**
   * constructor stores the custom qualifier metadata.
   */
  constructor(
    private readonly idValue: number,
    private readonly optionalValue: boolean,
  ) {}

  /**
   * id returns the qualifier expression id.
   */
  public id(): number {
    return this.idValue;
  }

  /**
   * isOptional returns whether the qualifier is optional.
   */
  public isOptional(): boolean {
    return this.optionalValue;
  }

  /**
   * qualify extracts the `bb` field from the nested test message.
   */
  public qualify(_: ReturnType<typeof emptyActivation>, obj: unknown): unknown {
    return (obj as { bb: number }).bb;
  }

  /**
   * qualifyIfPresent reports field presence according to the upstream custom qualifier behavior.
   */
  public qualifyIfPresent(
    _: ReturnType<typeof emptyActivation>,
    obj: unknown,
    presenceOnly: boolean,
  ): [unknown, boolean] {
    const value = (obj as { bb: number }).bb;
    if (value === 0) {
      return [undefined, false];
    }
    return [presenceOnly ? undefined : value, true];
  }
}

/**
 * customNestedMessageFactory wraps the default attribute factory with the upstream custom qualifier seam.
 */
function customNestedMessageFactory(baseFactory: AttributeFactory): AttributeFactory {
  return {
    absoluteAttribute: baseFactory.absoluteAttribute.bind(baseFactory),
    conditionalAttribute: baseFactory.conditionalAttribute.bind(baseFactory),
    maybeAttribute: baseFactory.maybeAttribute.bind(baseFactory),
    relativeAttribute: baseFactory.relativeAttribute.bind(baseFactory),
    qualifier: (options) => {
      if (options.value === "bb" || options.value instanceof CelString) {
        const text = options.value instanceof CelString ? options.value.value() : options.value;
        if (text === "bb") {
          return new NestedMessageQualifier(options.id, options.optional);
        }
      }
      return baseFactory.qualifier(options);
    },
  };
}

/**
 * testQualifier mirrors the upstream helper that constructs a qualifier and fails fast when setup is invalid.
 */
function testQualifier(
  fac: AttributeFactory,
  id: number,
  value: unknown,
  optional = false,
): Qualifier {
  return fac.qualifier({ id, value, optional });
}

/**
 * attachQualifier mirrors the upstream helper that appends a qualifier and returns the attribute for chaining.
 */
function attachQualifier(attr: Attribute, qualifier: Qualifier): Attribute {
  attr.addQualifier(qualifier);
  return attr;
}

/**
 * unknownValue creates an expected unknown value for the provided attribute trail and expression id.
 */
function unknownValue(
  id: number,
  variable: string,
  ...qualifiers: Array<boolean | number | bigint | string>
): Unknown {
  const attr = attributeTrail(variable);
  for (const qualifier of qualifiers) {
    qualifyAttribute(attr, qualifier);
  }
  return new Unknown(new Map([[id, [attr]]]));
}

/**
 * compareResolvedValue compares runtime values across CEL scalars, optionals, unknowns, and error values.
 */
function compareResolvedValue(actual: unknown, expected: unknown): void {
  if (actual instanceof Unknown && expected instanceof Unknown) {
    expect(actual.contains(expected)).toBe(true);
    expect(expected.contains(actual)).toBe(true);
    return;
  }
  if (actual instanceof Err && expected instanceof Err) {
    expect(actual.message).toBe(expected.message);
    expect(actual.nodeId()).toBe(expected.nodeId());
    return;
  }
  const actualVal =
    typeof actual === "object" && actual !== null && "type" in actual
      ? (actual as Val)
      : protoTestRegistry.nativeToValue(actual);
  const expectedVal =
    typeof expected === "object" && expected !== null && "type" in expected
      ? (expected as Val)
      : protoTestRegistry.nativeToValue(expected);
  const equal = actualVal.equal(expectedVal);
  expect(equal).toBeInstanceOf(Bool);
  expect((equal as Bool).value()).toBe(true);
}

/**
 * checkerEnv creates the local checker environment used by the state-tracking test port.
 */
function checkerEnv() {
  const out = env(defaultContainer, protoTestRegistry, {
    crossTypeNumericComparisons: true,
  });
  out.addFunctions(...standardFunctions());
  out.addFunctions(
    functionDecl(operators.OptIndex, {
      overloads: [
        overload(
          "optional_bool_map_index_string",
          [mapType(BoolType, StringType), BoolType],
          StringType,
        ),
      ],
    }),
  );
  return out;
}

/**
 * runtimeActivation normalizes either raw bindings or a pre-built activation into an execution input.
 */
function runtimeActivation(input: unknown) {
  if (
    typeof input === "object" &&
    input !== null &&
    "resolveName" in input &&
    typeof (input as { resolveName?: unknown }).resolveName === "function"
  ) {
    return input;
  }
  return activation({ bindings: input });
}

/**
 * splitFixtureArgs splits a comma-separated Go argument list while preserving nested calls and literals.
 */
function splitFixtureArgs(source: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const prev = index > 0 ? source[index - 1] : "";
    if (char === '"' && prev !== "\\") {
      inString = !inString;
      continue;
    }
    if (!inString && (char === "(" || char === "{" || char === "[")) {
      depth += 1;
      continue;
    }
    if (!inString && (char === ")" || char === "}" || char === "]")) {
      depth -= 1;
      continue;
    }
    if (!inString && depth === 0 && char === ",") {
      out.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  out.push(source.slice(start).trim());
  return out.filter((entry) => entry.length !== 0);
}

/**
 * unquoteFixtureString removes Go string quotes and decodes the escape sequences used in synced fixtures.
 */
function unquoteFixtureString(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
}

/**
 * resolveFixtureCallArgs returns the argument list for a Go call expression with the provided prefix.
 */
function resolveFixtureCallArgs(source: string, prefix: string): string[] {
  if (!source.startsWith(`${prefix}(`) || !source.endsWith(")")) {
    throw new Error(`unsupported fixture call: ${source}`);
  }
  return splitFixtureArgs(source.slice(prefix.length + 1, -1));
}

/**
 * resolveFixtureScalar converts a simple synced fixture scalar expression into its runtime value.
 */
function resolveFixtureScalar(value: unknown): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  const expr = (value as { $expr?: string } | undefined)?.$expr?.trim();
  if (!expr) {
    return value;
  }
  if (expr === "true" || expr === "false") {
    return expr === "true";
  }
  if (/^"(?:[^"\\]|\\.)*"$/.test(expr)) {
    return unquoteFixtureString(expr.slice(1, -1));
  }
  if (expr === "types.OptionalNone") {
    return OptionalNone;
  }
  if (expr === "types.True") {
    return True;
  }
  if (expr === "types.False") {
    return False;
  }
  if (expr === "types.LabelErrNode(9, types.NoSuchOverloadErr())") {
    return labelErrNode(9, noSuchOverloadErr());
  }
  if (
    expr ===
    'types.NewUnknown(5, types.QualifyAttribute[string](types.NewAttributeTrail("a"), "b"))'
  ) {
    return unknownValue(5, "a", "b");
  }
  if (expr.startsWith("errors.New(")) {
    const [message] = resolveFixtureCallArgs(expr, "errors.New");
    return unquoteFixtureString(message!.slice(1, -1));
  }
  if (expr.startsWith("uint32(") && expr.endsWith(")")) {
    return Number(expr.slice(7, -1));
  }
  if (expr.startsWith("uint64(") && expr.endsWith(")")) {
    return BigInt(expr.slice(7, -1));
  }
  if (expr.startsWith("int32(") && expr.endsWith(")")) {
    return Number(expr.slice(6, -1));
  }
  if (expr.startsWith("int64(") && expr.endsWith(")")) {
    return BigInt(expr.slice(6, -1));
  }
  if (expr.startsWith("float32(") && expr.endsWith(")")) {
    return Number(expr.slice(8, -1));
  }
  if (expr.startsWith("uint(") && expr.endsWith(")")) {
    return BigInt(expr.slice(5, -1));
  }
  if (expr.startsWith("types.OptionalOf(reg.NativeToValue(") && expr.endsWith("))")) {
    const inner = expr.slice("types.OptionalOf(reg.NativeToValue(".length, -2);
    return optionalOf(protoTestRegistry.nativeToValue(resolveGoNativeLiteral(inner)));
  }
  if (expr.startsWith("types.OptionalOf(") && expr.endsWith(")")) {
    return optionalOf(
      resolveFixtureScalar({ $expr: expr.slice("types.OptionalOf(".length, -1) }) as Val,
    );
  }
  if (expr.startsWith("types.DefaultTypeAdapter.NativeToValue(") && expr.endsWith(")")) {
    const inner = expr.slice("types.DefaultTypeAdapter.NativeToValue(".length, -1);
    return protoTestRegistry.nativeToValue(resolveGoNativeLiteral(inner));
  }
  if (expr.startsWith("&proto3pb.TestAllTypes{")) {
    if (expr === "&proto3pb.TestAllTypes{}") {
      return create(Proto3TestAllTypesSchema);
    }
    if (expr === "&proto3pb.TestAllTypes{SingleInt32: 1}") {
      return create(Proto3TestAllTypesSchema, { singleInt32: 1 });
    }
  }
  if (expr.startsWith("partialActivation(")) {
    return resolvePartialActivationExpr(expr);
  }
  return resolveSyncedExpr({ $expr: expr.startsWith("types.") ? expr.slice(6) : expr });
}

/**
 * resolveGoMapKey converts the small set of synced Go map-key expressions into JavaScript property keys.
 */
function resolveGoMapKey(source: string): string {
  const trimmed = source.trim().replace(/,$/, "");
  if (/^"(?:[^"\\]|\\.)*"$/.test(trimmed)) {
    return unquoteFixtureString(trimmed.slice(1, -1));
  }
  if (trimmed === "true" || trimmed === "false") {
    return trimmed;
  }
  if (trimmed.startsWith("types.String(") && trimmed.endsWith(")")) {
    return (resolveFixtureScalar({ $expr: trimmed }) as CelString).value();
  }
  if (/^(?:int|uint|float)\d*\(/.test(trimmed)) {
    return String(resolveFixtureScalar({ $expr: trimmed }));
  }
  return trimmed;
}

/**
 * resolveGoNativeLiteral decodes the map and slice literals embedded in synced attribute fixtures.
 */
function resolveGoNativeLiteral(source: string): unknown {
  const trimmed = source.trim().replace(/,$/, "");
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed === "true" || trimmed === "false") {
    return trimmed === "true";
  }
  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (/^"(?:[^"\\]|\\.)*"$/.test(trimmed)) {
    return unquoteFixtureString(trimmed.slice(1, -1));
  }
  if (trimmed.startsWith("map[") && trimmed.endsWith("}")) {
    const openBrace = trimmed.indexOf("{");
    const body = trimmed.slice(openBrace + 1, -1).trim();
    if (body.length === 0) {
      return trimmed.startsWith("map[ref.Val]ref.Val{") ? new Map() : {};
    }
    if (trimmed.startsWith("map[ref.Val]ref.Val{")) {
      return new Map(
        splitFixtureArgs(body).map((entry) => {
          const separator = entry.indexOf(":");
          const keySource = entry.slice(0, separator);
          const valueSource = entry.slice(separator + 1);
          return [
            resolveFixtureScalar({ $expr: keySource.trim() }) as Val,
            resolveFixtureScalar({ $expr: valueSource.trim() }) as Val,
          ];
        }),
      );
    }
    return Object.fromEntries(
      splitFixtureArgs(body).map((entry) => {
        const separator = entry.indexOf(":");
        const keySource = entry.slice(0, separator);
        const valueSource = entry.slice(separator + 1);
        return [resolveGoMapKey(keySource), resolveGoNativeLiteral(valueSource)];
      }),
    );
  }
  if (trimmed.startsWith("[]") && trimmed.endsWith("}")) {
    const body = trimmed.slice(trimmed.indexOf("{") + 1, -1).trim();
    return body.length === 0 ? [] : splitFixtureArgs(body).map(resolveGoNativeLiteral);
  }
  if (trimmed.startsWith("types.")) {
    return resolveFixtureScalar({ $expr: trimmed });
  }
  throw new Error(`unsupported Go literal fixture: ${source}`);
}

/**
 * resolvePartialActivationExpr recreates the partial-activation helper used by the upstream state-tracking rows.
 */
function resolvePartialActivationExpr(expr: string) {
  const args = resolveFixtureCallArgs(expr, "partialActivation");
  const bindings = resolveGoNativeLiteral(args[0]!) as Record<string, unknown>;
  const unknowns =
    args.length > 1
      ? args
          .slice(1)
          .filter((entry) => entry.length !== 0)
          .map((entry) => resolveAttributePatternExpr({ $expr: entry }))
      : [];
  return partialActivation({ bindings, unknowns });
}

/**
 * resolveVariableDeclExpr decodes the synced checker declaration literals used by the attribute state tests.
 */
function resolveVariableDeclExpr(value: { $expr?: string }): ReturnType<typeof variableDecl> {
  const args = resolveFixtureCallArgs(value.$expr ?? "", "decls.NewVariable");
  return variableDecl(
    unquoteFixtureString(args[0]!.slice(1, -1)),
    resolveSyncedExpr({ $expr: args[1]!.replace(/\btypes\./g, "") }) as Type,
  );
}

/**
 * resolveOptionalQualifier decodes synced optional-table qualifiers into local qualifier inputs.
 */
function resolveOptionalQualifier(
  attrs: AttributeFactory,
  value: unknown,
  optional: boolean,
): unknown {
  const expr = (value as { $expr?: string } | undefined)?.$expr?.trim();
  if (!expr) {
    const scalar = resolveFixtureScalar(value);
    if (
      typeof scalar === "bigint" &&
      scalar >= BigInt(Number.MIN_SAFE_INTEGER) &&
      scalar <= BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      return Number(scalar);
    }
    return scalar;
  }
  if (expr === 'attrs.AbsoluteAttribute(0, "b")') {
    return attrs.absoluteAttribute(0, "b");
  }
  if (expr === 'attrs.MaybeAttribute(102, "c.d.e")') {
    return attrs.maybeAttribute(102, "c.d.e");
  }
  if (
    expr ===
    'attrs.ConditionalAttribute(0,\n\t\t\t\t\tNewConstValue(100, types.False),\n\t\t\t\t\tattrs.AbsoluteAttribute(101, "b"),\n\t\t\t\t\tattrs.MaybeAttribute(102, "c.d.e"))'
  ) {
    return attrs.conditionalAttribute(
      0,
      constValue({ id: 100, value: False }),
      attrs.absoluteAttribute(101, "b"),
      attrs.maybeAttribute(102, "c.d.e"),
    );
  }
  if (
    expr ===
    'addQualifier(t, attrs.MaybeAttribute(102, "c.d"), makeQualifier(t, attrs, nil, 103, "e"))'
  ) {
    return attachQualifier(attrs.maybeAttribute(102, "c.d"), testQualifier(attrs, 103, "e"));
  }
  if (
    expr ===
    'makeOptQualifier(t,\n\t\t\t\t\tattrs,\n\t\t\t\t\ttypes.NewObjectType("google.expr.proto3.test.TestAllTypes"),\n\t\t\t\t\t103,\n\t\t\t\t\t"single_int32",\n\t\t\t\t)'
  ) {
    return testQualifier(attrs, 103, "single_int32", true);
  }
  return testQualifier(attrs, optional ? 999 : 998, resolveFixtureScalar(value), optional);
}

/**
 * resolveOptionalCases loads the upstream optional-attribute rows from synced test data.
 */
function resolveOptionalCases(attrs: AttributeFactory): OptionalAttributeCase[] {
  return syncedCases<Record<string, unknown>>(
    "interpreter/attributes_test.go/TestAttributesOptional",
  ).map((testCase, index) => ({
    comment: `synced-${index}`,
    varName: testCase.varName as string,
    quals: ((testCase.quals as unknown[]) ?? []).map((value) =>
      resolveOptionalQualifier(attrs, value, false),
    ),
    optQuals: ((testCase.optQuals as unknown[]) ?? []).map((value) =>
      resolveOptionalQualifier(attrs, value, true),
    ),
    vars: resolveFixtureValueTree(testCase.vars) as Record<string, unknown>,
    out: testCase.out === undefined ? undefined : resolveFixtureScalar(testCase.out),
    err: testCase.err === undefined ? undefined : (resolveFixtureScalar(testCase.err) as string),
  }));
}

/**
 * resolveStateValue normalizes synced observed-state payloads before the local equality assertions run.
 */
function resolveStateValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(resolveStateValue);
  }
  if (value && typeof value === "object" && !("$expr" in (value as Record<string, unknown>))) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        resolveGoMapKey(key),
        resolveStateValue(entry),
      ]),
    );
  }
  return resolveFixtureScalar(value);
}

/**
 * resolveFixtureValueTree recursively resolves synced fixture trees that may contain embedded `$expr` leaves.
 */
function resolveFixtureValueTree(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(resolveFixtureValueTree);
  }
  if (value && typeof value === "object") {
    if ("$expr" in (value as Record<string, unknown>)) {
      return resolveFixtureScalar(value);
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        resolveFixtureValueTree(entry),
      ]),
    );
  }
  return value;
}

/**
 * resolveAttributeStateCases loads the upstream eval-state rows from synced test data.
 */
function resolveAttributeStateCases(): AttributeStateCase[] {
  return syncedCases<Record<string, unknown>>(
    "interpreter/attributes_test.go/TestAttributeStateTracking",
  ).map((testCase) => ({
    expr: testCase.expr as string,
    vars: ((testCase.vars as Array<{ $expr?: string }>) ?? []).map(resolveVariableDeclExpr),
    input:
      testCase.in &&
      typeof testCase.in === "object" &&
      "$expr" in (testCase.in as Record<string, unknown>)
        ? resolveFixtureScalar(testCase.in)
        : resolveSyncedExpr(testCase.in),
    out: resolveFixtureScalar(testCase.out) as Val,
    state: Object.fromEntries(
      Object.entries((testCase.state as Record<string, unknown>) ?? {}).map(([id, value]) => [
        Number(id),
        resolveStateValue(value),
      ]),
    ) as Record<number, unknown>,
  }));
}

/**
 * resolveNarrowQualifier decodes the synced narrow-map-key qualifier fixtures.
 */
function resolveNarrowQualifier(value: { $expr?: string }): bigint | number {
  const expr = value.$expr ?? "";
  if (expr === "int64(1) << 32" || expr === "uint64(1) << 32") {
    return 1n << 32n;
  }
  if (expr === "int64(0)") {
    return 0;
  }
  if (expr === "uint64(0)") {
    return 0;
  }
  throw new Error(`unsupported narrow qualifier fixture: ${expr}`);
}

/**
 * resolveQualifyIfPresentQualifier decodes synced qualify-if-present fixtures into local qualifier instances.
 */
function resolveQualifyIfPresentQualifier(
  fac: AttributeFactory,
  value: { $expr?: string },
): Qualifier {
  const expr = value.$expr ?? "";
  if (expr === 'fac.AbsoluteAttribute(1, "a")') {
    return fac.absoluteAttribute(1, "a");
  }
  if (expr === 'fac.MaybeAttribute(1, "a")') {
    return fac.maybeAttribute(1, "a");
  }
  if (expr === 'fac.RelativeAttribute(2, NewConstValue(1, types.String("b")))') {
    return fac.relativeAttribute(2, constValue({ id: 1, value: new CelString("b") }));
  }
  if (expr.startsWith("makeOptQualifier(t, fac, nil, 1, ") && expr.endsWith(")")) {
    const inner = expr.slice("makeOptQualifier(t, fac, nil, 1, ".length, -1);
    return testQualifier(fac, 1, resolveFixtureScalar({ $expr: inner }), true);
  }
  throw new Error(`unsupported qualify-if-present fixture: ${expr}`);
}

/**
 * resolveQualifyIfPresentObject converts synced map-key fixtures into the object shape expected by qualification.
 */
function resolveQualifyIfPresentObject(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      resolveGoMapKey(key),
      entry,
    ]),
  );
}

/**
 * standardDispatcher builds a dispatcher loaded with the CEL standard runtime overloads.
 */
function standardDispatcher() {
  const out = dispatcher();
  for (const fn of standardFunctions()) {
    const overloads = fn.bindings();
    if (overloads.length !== 0) {
      out.add({ overloads });
    }
  }
  return out;
}

/**
 * attributes_test.go coverage tracks the upstream attribute tests.
 */
describe("interpreter/attributes_test.go", () => {
  /**
   * TestAttributesAbsoluteAttr ports the upstream absolute attribute coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributesAbsoluteAttr", () => {
    it("interpreter/attributes_test.go/TestAttributesAbsoluteAttr", () => {
      const attrs = attributeFactory({
        containerValue: container({ name: "acme.ns" }),
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const vars = activation({
        bindings: {
          "acme.a": {
            b: {
              4: {
                false: "success",
              },
            },
          },
        },
      });
      const attr = attrs.absoluteAttribute(1, "acme.a");
      attr.addQualifier(testQualifier(attrs, 2, "b"));
      attr.addQualifier(testQualifier(attrs, 3, 4n));
      attr.addQualifier(testQualifier(attrs, 4, false));
      expect(attr.resolve(vars)).toBe("success");
    });
  });

  /**
   * TestAttributesAbsoluteAttrType ports the upstream absolute attribute type coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributesAbsoluteAttrType", () => {
    it("interpreter/attributes_test.go/TestAttributesAbsoluteAttrType", () => {
      const attrs = attributeFactory({
        containerValue: defaultContainer,
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      expect(attrs.absoluteAttribute(1, "int").resolve(emptyActivation())).toBe(IntType);
    });
  });

  /**
   * TestAttributesAbsoluteAttrError ports the upstream absolute attribute error coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributesAbsoluteAttrError", () => {
    it("interpreter/attributes_test.go/TestAttributesAbsoluteAttrError", () => {
      const attrs = attributeFactory({
        containerValue: defaultContainer,
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const vars = activation({
        bindings: {
          err: new Err("invalid variable computation"),
        },
      });
      const attr = attrs.absoluteAttribute(1, "err");
      attr.addQualifier(testQualifier(attrs, 2, "message"));
      expect(() => attr.resolve(vars)).toThrow("invalid variable computation");
    });
  });

  /**
   * TestAttributesRelativeAttr ports the upstream relative attribute coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributesRelativeAttr", () => {
    it("interpreter/attributes_test.go/TestAttributesRelativeAttr", () => {
      const attrs = attributeFactory({
        containerValue: defaultContainer,
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const data = {
        a: {
          [-1]: [2, 42],
        },
        b: 1,
      };
      const vars = activation({ bindings: data });
      const attr = attrs.relativeAttribute(
        1,
        constValue({ id: 1, value: protoTestRegistry.nativeToValue(data) }),
      );
      attr.addQualifier(testQualifier(attrs, 2, "a"));
      attr.addQualifier(testQualifier(attrs, 3, -1));
      attr.addQualifier(attrs.absoluteAttribute(4, "b"));
      compareResolvedValue(attr.resolve(vars), 42);
    });
  });

  /**
   * TestAttributesRelativeAttrOneOf ports the upstream oneof attribute coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributesRelativeAttrOneOf", () => {
    it("interpreter/attributes_test.go/TestAttributesRelativeAttrOneOf", () => {
      const attrs = attributeFactory({
        containerValue: container({ name: "acme.ns" }),
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const data = {
        a: {
          [-1]: [2, 42],
        },
        "acme.b": 1,
      };
      const vars = activation({ bindings: data });
      const attr = attrs.relativeAttribute(
        1,
        constValue({ id: 1, value: protoTestRegistry.nativeToValue(data) }),
      );
      attr.addQualifier(testQualifier(attrs, 2, "a"));
      attr.addQualifier(testQualifier(attrs, 3, -1));
      attr.addQualifier(attrs.maybeAttribute(4, "b"));
      compareResolvedValue(attr.resolve(vars), 42);
    });
  });

  /**
   * TestAttributesRelativeAttrConditional ports the upstream conditional attribute coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributesRelativeAttrConditional", () => {
    it("interpreter/attributes_test.go/TestAttributesRelativeAttrConditional", () => {
      const attrs = attributeFactory({
        containerValue: defaultContainer,
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const data = {
        a: {
          [-1]: [2, 42],
        },
        b: [0, 1],
        c: [1, 0],
      };
      const vars = activation({ bindings: data });
      const condAttr = attrs.conditionalAttribute(
        4,
        constValue({ id: 2, value: False }),
        attrs.absoluteAttribute(5, "b"),
        attrs.absoluteAttribute(6, "c"),
      );
      condAttr.addQualifier(testQualifier(attrs, 7, 0));
      const attr = attrs.relativeAttribute(
        1,
        constValue({ id: 1, value: protoTestRegistry.nativeToValue(data) }),
      );
      attr.addQualifier(testQualifier(attrs, 2, "a"));
      attr.addQualifier(testQualifier(attrs, 3, -1));
      attr.addQualifier(condAttr);
      compareResolvedValue(attr.resolve(vars), 42);
    });
  });

  /**
   * TestAttributesRelativeAttrRelativeQualifier ports the upstream relative qualifier coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributesRelativeAttrRelativeQualifier", () => {
    it("interpreter/attributes_test.go/TestAttributesRelativeAttrRelativeQualifier", () => {
      const attrs = attributeFactory({
        containerValue: container({ name: "acme.ns" }),
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const data = {
        a: {
          [-1]: {
            first: 1n,
            second: 2n,
            third: 3n,
          },
        },
        b: 2n,
      };
      const vars = activation({ bindings: data });
      const mp = {
        1: "first",
        2: "second",
        3: "third",
      };
      const relAttr = attrs.relativeAttribute(
        4,
        constValue({ id: 4, value: protoTestRegistry.nativeToValue(mp) }),
      );
      relAttr.addQualifier(testQualifier(attrs, 5, attrs.absoluteAttribute(5, "b")));
      const attr = attrs.relativeAttribute(
        1,
        constValue({ id: 1, value: protoTestRegistry.nativeToValue(data) }),
      );
      attr.addQualifier(testQualifier(attrs, 2, "a"));
      attr.addQualifier(testQualifier(attrs, 3, -1));
      attr.addQualifier(relAttr);
      compareResolvedValue(attr.resolve(vars), 2n);
    });
  });

  /**
   * TestAttributesOneofAttr ports the upstream maybe-attribute namespace coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributesOneofAttr", () => {
    it("interpreter/attributes_test.go/TestAttributesOneofAttr", () => {
      const attrs = attributeFactory({
        containerValue: container({ name: "acme.ns" }),
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const vars = activation({
        bindings: {
          a: {
            b: [2, 42],
          },
          "acme.a.b": 1,
          "acme.ns.a.b": "found",
        },
      });
      const attr = attrs.maybeAttribute(1, "a");
      attr.addQualifier(testQualifier(attrs, 2, "b"));
      expect(attr.resolve(vars)).toBe("found");
    });
  });

  /**
   * TestAttributesConditionalAttrTrueBranch ports the upstream true-branch conditional coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributesConditionalAttrTrueBranch", () => {
    it("interpreter/attributes_test.go/TestAttributesConditionalAttrTrueBranch", () => {
      const attrs = attributeFactory({
        containerValue: defaultContainer,
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const vars = activation({
        bindings: {
          a: {
            [-1]: [2, 42],
          },
          b: {
            c: {
              [-1]: [2n, 42n],
            },
          },
        },
      });
      const truthy = attrs.absoluteAttribute(2, "a");
      const falsy = attrs.maybeAttribute(3, "b");
      falsy.addQualifier(testQualifier(attrs, 4, "c"));
      const cond = attrs.conditionalAttribute(1, constValue({ id: 0, value: True }), truthy, falsy);
      cond.addQualifier(testQualifier(attrs, 5, -1));
      cond.addQualifier(testQualifier(attrs, 6, 1));
      expect(cond.resolve(vars)).toBe(42);
    });
  });

  /**
   * TestAttributesConditionalAttrFalseBranch ports the upstream false-branch conditional coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributesConditionalAttrFalseBranch", () => {
    it("interpreter/attributes_test.go/TestAttributesConditionalAttrFalseBranch", () => {
      const attrs = attributeFactory({
        containerValue: defaultContainer,
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const vars = activation({
        bindings: {
          a: {
            [-1]: [2, 42],
          },
          b: {
            c: {
              [-1]: [2n, 42n],
            },
          },
        },
      });
      const truthy = attrs.absoluteAttribute(2, "a");
      const falsy = attrs.maybeAttribute(3, "b");
      falsy.addQualifier(testQualifier(attrs, 4, "c"));
      const cond = attrs.conditionalAttribute(
        1,
        constValue({ id: 0, value: False }),
        truthy,
        falsy,
      );
      cond.addQualifier(testQualifier(attrs, 5, -1));
      cond.addQualifier(testQualifier(attrs, 6, 1));
      expect(cond.resolve(vars)).toBe(42n);
    });
  });

  /**
   * TestAttributesNarrowMapKeyQualifier ports the upstream narrowing coverage that prevents lossy key coercion.
   */
  describe("interpreter/attributes_test.go/TestAttributesNarrowMapKeyQualifier", () => {
    it("interpreter/attributes_test.go/TestAttributesNarrowMapKeyQualifier", () => {
      const attrs = attributeFactory({
        containerValue: defaultContainer,
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const vars = activation({
        bindings: {
          i32: new Map<number, string>([[0, "zero"]]),
          u32: new Map<number, string>([[0, "zero"]]),
        },
      });
      const tests = syncedCases<Record<string, unknown>>(
        "interpreter/attributes_test.go/TestAttributesNarrowMapKeyQualifier",
      );
      for (const [index, testCase] of tests.entries()) {
        const attr = attrs.absoluteAttribute(1, testCase.varName as string);
        attr.addQualifier(
          testQualifier(attrs, 2, resolveNarrowQualifier(testCase.qual as { $expr?: string })),
        );
        try {
          const out = attr.resolve(vars);
          expect(out, `case ${index}`).toBe(testCase.out);
        } catch (error) {
          expect((error as Error).message, `case ${index}`).toBe(
            resolveFixtureScalar(testCase.err),
          );
        }
      }
    });
  });

  /**
   * TestAttributesOptional ports the upstream optional attribute table.
   */
  describe("interpreter/attributes_test.go/TestAttributesOptional", () => {
    it("interpreter/attributes_test.go/TestAttributesOptional", () => {
      const attrs = attributeFactory({
        containerValue: container({ name: "ns" }),
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      for (const [index, testCase] of resolveOptionalCases(attrs).entries()) {
        const attr = attrs.absoluteAttribute(1, testCase.varName);
        let nextId = 1;
        for (const qualifier of testCase.quals ?? []) {
          nextId += 1;
          attr.addQualifier(testQualifier(attrs, nextId, qualifier));
        }
        for (const qualifier of testCase.optQuals ?? []) {
          nextId += 1;
          attr.addQualifier(testQualifier(attrs, nextId, qualifier, true));
        }
        const vars = activation({ bindings: testCase.vars });
        try {
          const out = attr.resolve(vars);
          if (testCase.err) {
            throw new Error(`expected error ${testCase.err}, got ${String(out)}`);
          }
          try {
            compareResolvedValue(out, testCase.out);
          } catch (error) {
            throw new Error(`${index}: ${testCase.comment}: ${(error as Error).message}`);
          }
        } catch (error) {
          if (!testCase.err) {
            throw error;
          }
          expect((error as Error).message, `${index}: ${testCase.comment}`).toBe(testCase.err);
        }
      }
    });
  });

  /**
   * TestAttributesConditionalAttrErrorUnknown ports the upstream error and unknown propagation coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributesConditionalAttrErrorUnknown", () => {
    it("interpreter/attributes_test.go/TestAttributesConditionalAttrErrorUnknown", () => {
      const attrs = attributeFactory({
        containerValue: defaultContainer,
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const truthy = attrs.absoluteAttribute(2, "a");
      const falsy = attrs.maybeAttribute(3, "b");
      const condErr = attrs.conditionalAttribute(
        1,
        constValue({ id: 0, value: new Err("test error") }),
        truthy,
        falsy,
      );
      expect(() => condErr.resolve(emptyActivation())).toThrow("test error");

      const condUnknown = attrs.conditionalAttribute(
        1,
        constValue({ id: 0, value: unknownValue(1, "") }),
        truthy,
        falsy,
      );
      const out = condUnknown.resolve(emptyActivation());
      expect(out).toBeInstanceOf(Unknown);
    });
  });

  /**
   * TestResolverCustomQualifier ports the upstream custom qualifier coverage.
   */
  describe("interpreter/attributes_test.go/TestResolverCustomQualifier", () => {
    it("interpreter/attributes_test.go/TestResolverCustomQualifier", () => {
      const attrs = customNestedMessageFactory(
        attributeFactory({
          containerValue: defaultContainer,
          adapter: protoTestRegistry,
          provider: protoTestRegistry,
        }),
      );
      const vars = activation({
        bindings: {
          msg: create(Proto3TestAllTypesNestedMessageSchema, { bb: 123 }),
        },
      });
      const attr = attrs.absoluteAttribute(1, "msg");
      attr.addQualifier(testQualifier(attrs, 2, "bb"));
      expect(attr.resolve(vars)).toBe(123);
    });
  });

  /**
   * TestAttributesMissingMsg ports the upstream missing-message coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributesMissingMsg", () => {
    it("interpreter/attributes_test.go/TestAttributesMissingMsg", () => {
      const attrs = attributeFactory({
        containerValue: defaultContainer,
        adapter: registry(),
        provider: registry(),
      });
      const vars = activation({
        bindings: {
          missing_msg: create(AnySchema, {
            typeUrl: "type.googleapis.com/google.expr.proto3.test.TestAllTypes",
            value: new Uint8Array(),
          }),
        },
      });
      const attr = attrs.absoluteAttribute(1, "missing_msg");
      attr.addQualifier(testQualifier(attrs, 2, "field"));
      expect(() => attr.resolve(vars)).toThrow(
        "unknown type: 'google.expr.proto3.test.TestAllTypes'",
      );
    });
  });

  /**
   * TestAttributeMissingMsgUnknownField ports the upstream partial-activation unknown field coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributeMissingMsgUnknownField", () => {
    it("interpreter/attributes_test.go/TestAttributeMissingMsgUnknownField", () => {
      const reg = registry();
      const attrs = partialAttributeFactory({
        containerValue: defaultContainer,
        adapter: reg,
        provider: reg,
      });
      const vars = partialActivation({
        bindings: {
          missing_msg: anyPack(Proto3TestAllTypesSchema, create(Proto3TestAllTypesSchema)),
        },
        unknowns: [attributePattern("missing_msg").qualString("field")],
      });
      const attr = attrs.absoluteAttribute(1, "missing_msg");
      attr.addQualifier(testQualifier(attrs, 2, "field"));
      expect(attr.resolve(vars)).toBeInstanceOf(Unknown);
    });
  });

  /**
   * TestAttributeStateTracking ports the upstream eval-state attribute coverage.
   */
  describe("interpreter/attributes_test.go/TestAttributeStateTracking", () => {
    it("interpreter/attributes_test.go/TestAttributeStateTracking", () => {
      for (const testCase of resolveAttributeStateCases()) {
        const checkedEnv = checkerEnv();
        checkedEnv.addIdents(...testCase.vars);
        const parsed = parse(testCase.expr, { enableOptionalSyntax: true });
        const checked = check(parsed, textSource(testCase.expr), checkedEnv);
        const state = evalState();
        const attrs =
          typeof testCase.input === "object" &&
          testCase.input !== null &&
          "unknownAttributePatterns" in testCase.input
            ? partialAttributeFactory({
                containerValue: defaultContainer,
                adapter: protoTestRegistry,
                provider: protoTestRegistry,
              })
            : attributeFactory({
                containerValue: defaultContainer,
                adapter: protoTestRegistry,
                provider: protoTestRegistry,
              });
        const program = interpreter({
          dispatcher: standardDispatcher(),
          provider: protoTestRegistry,
          adapter: protoTestRegistry,
          attrFactory: attrs,
        }).interpretable({
          exprAst: checked,
          plannerConfig: evalStateObserverConfig({ factory: () => state }),
        });
        const frame = executionFrame({ input: runtimeActivation(testCase.input) });
        try {
          const out = program.exec(frame);
          compareResolvedValue(out, testCase.out);
          for (const [id, expected] of Object.entries(testCase.state)) {
            const [observed, found] = state.value(Number(id));
            expect(found, `${testCase.expr}:${id}`).toBe(true);
            try {
              compareResolvedValue(observed, expected);
            } catch (error) {
              throw new Error(`${testCase.expr}:${id}: ${(error as Error).message}`);
            }
          }
        } finally {
          frame.close();
        }
      }
    });
  });

  /**
   * TestConditionalAttributeQualify ports the upstream direct qualify and qualify-if-present coverage.
   */
  describe("interpreter/attributes_test.go/TestConditionalAttributeQualify", () => {
    it("interpreter/attributes_test.go/TestConditionalAttributeQualify", () => {
      const fac = attributeFactory({
        containerValue: defaultContainer,
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const truthy = fac.absoluteAttribute(1, "a");
      const falsy = fac.absoluteAttribute(2, "b");
      const cond = fac.conditionalAttribute(3, constValue({ id: 4, value: True }), truthy, falsy);
      const vars = activation({ bindings: { a: "key", b: "other" } });
      const obj = { key: 100 };
      expect(cond.qualify(vars, obj)).toBe(100);
      const [out, found] = cond.qualifyIfPresent(vars, obj, false);
      expect(found).toBe(true);
      expect(out).toBe(100);
    });
  });

  /**
   * TestQualifyIfPresent ports the upstream optional qualifier coverage across attribute and constant qualifier kinds.
   */
  describe("interpreter/attributes_test.go/TestQualifyIfPresent", () => {
    it("interpreter/attributes_test.go/TestQualifyIfPresent", () => {
      const fac = attributeFactory({
        containerValue: defaultContainer,
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const vars = activation({
        bindings: {
          a: "b",
          c: 1,
        },
      });
      const cases = syncedCases<Record<string, unknown>>(
        "interpreter/attributes_test.go/TestQualifyIfPresent",
      ).map((testCase) => ({
        name: testCase.name as string,
        qual: resolveQualifyIfPresentQualifier(fac, testCase.qual as { $expr?: string }),
        obj: resolveQualifyIfPresentObject(testCase.obj),
        out: testCase.out,
      }));
      for (const testCase of cases) {
        const [out, found] = testCase.qual.qualifyIfPresent(vars, testCase.obj, false);
        expect(found, testCase.name).toBe(true);
        expect(out, testCase.name).toEqual(testCase.out);
      }
    });
  });

  /**
   * BenchmarkResolverFieldQualifier verifies that checked protobuf selections use the upstream
   * precomputed field-access seam rather than the generic string qualifier.
   */
  describe("interpreter/attributes_test.go/BenchmarkResolverFieldQualifier", () => {
    it("plans a typed protobuf field qualifier", () => {
      const fac = attributeFactory({
        containerValue: defaultContainer,
        adapter: protoTestRegistry,
        provider: protoTestRegistry,
      });
      const qualifier = fac.qualifier({
        id: 2,
        objectType: objectType(Proto3TestAllTypesSchema.typeName),
        value: "single_nested_message",
        optional: false,
      });

      expect(qualifier.constructor.name).toBe("FieldQualifier");
    });
  });
});
