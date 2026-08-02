import { create } from "@bufbuild/protobuf";
import { container, defaultContainer } from "../common/containers.js";
import { StringTraversalCostFactor } from "../common/cost.js";
import { type FunctionDecl, func, memberOverload, overload, variable } from "../common/decls.js";
import * as overloadIds from "../common/overloads.js";
import {
  BoolType,
  BytesType,
  DoubleType,
  IntType,
  Kind,
  NullType,
  OptionalType,
  type Registry,
  registry,
  StringType,
  type Type,
  UintType,
} from "../common/types/index.js";
import { resolveSyncedExpr } from "../common/types/spec-helpers.js";
import { TestAllTypesSchema as Proto2TestAllTypesSchema } from "../gen/test/proto2pb/test_all_types_pb.js";
import { TestAllTypesSchema as Proto3TestAllTypesSchema } from "../gen/test/proto3pb/test_all_types_pb.js";
import type { ParserConfig } from "../parser/options.js";
import {
  type AstNode,
  CallEstimate,
  type CostEstimate,
  type CostOptions,
  type FunctionEstimator,
  fixedCostEstimate,
  SizeEstimate,
} from "./cost.js";
import type { CheckerOptions } from "./options.js";

/**
 * SyncedCheckerCase mirrors the serialized checker/checker_test.go table rows.
 */
export interface SyncedCheckerCase {
  in: string;
  out?: string;
  outType?: unknown;
  container?: string;
  env?: { $expr?: string };
  err?: string;
  disableStdEnv?: boolean;
  opts?: Array<{ $expr?: string }>;
}

/**
 * ResolvedCheckerCase contains the local values needed to execute a synced checker row.
 */
export interface ResolvedCheckerCase {
  input: string;
  output?: string;
  outputType?: Type;
  expectedError?: string;
  disableStdEnv: boolean;
  parserConfig: ParserConfig;
  checkerOptions: CheckerOptions;
  sourceContainerName: string;
  idents: Array<ReturnType<typeof variable>>;
  functions: FunctionDecl[];
}

/**
 * SyncedCostCase mirrors the serialized checker/cost_test.go table rows.
 */
export interface SyncedCostCase {
  expr: string;
  name: string;
  vars?: Array<{ $expr?: string }>;
  hints?: Record<string, number>;
  options?: Array<{ $expr?: string }>;
  wanted: { $expr?: string };
}

/**
 * ResolvedCostCase contains the local values needed to execute a synced cost row.
 */
export interface ResolvedCostCase {
  expr: string;
  hints: Record<string, number>;
  options: CostOptions;
  vars: Array<ReturnType<typeof variable>>;
  wanted: CostEstimate;
}

const overloadIdByName = new Map<string, string>();
for (const [name, value] of Object.entries(overloadIds)) {
  if (typeof value === "string") {
    overloadIdByName.set(name, value);
  }
}

type ParsedTestEnv = {
  idents: Array<ReturnType<typeof variable>>;
  functions: FunctionDecl[];
  variadicASTs: boolean;
  optionalSyntax: boolean;
  jsonFieldNames: boolean;
};

/**
 * resolveCheckerCase decodes one synced checker row into local parser and env inputs.
 */
export function resolveCheckerCase(testCase: SyncedCheckerCase): ResolvedCheckerCase {
  const envValue = resolveTestEnv(testCase.env?.$expr);
  const checkerOptions = resolveCheckerOptions(testCase.opts);
  if (envValue.jsonFieldNames) {
    checkerOptions.jsonFieldNames = true;
  }
  return {
    input: testCase.in,
    output: testCase.out,
    outputType: testCase.outType ? (resolveCheckerTypeExpr(testCase.outType) as Type) : undefined,
    expectedError: testCase.err,
    disableStdEnv: Boolean(testCase.disableStdEnv),
    parserConfig: {
      enableOptionalSyntax: envValue.optionalSyntax,
      enableVariadicOperatorASTs: envValue.variadicASTs,
    },
    checkerOptions,
    sourceContainerName: testCase.container ?? "",
    idents: envValue.idents,
    functions: envValue.functions,
  };
}

/**
 * checkerRegistry creates the proto registry used by checker tests.
 */
export function checkerRegistry(jsonFieldNames = false, optionalSyntax = false): Registry {
  const reg = registry(
    [create(Proto2TestAllTypesSchema), Proto2TestAllTypesSchema],
    [create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema],
  );
  reg.withJSONFieldNames(jsonFieldNames);
  if (optionalSyntax) {
    reg.registerType(OptionalType);
  }
  return reg;
}

/**
 * checkerContainer returns the configured source container for a checker test row.
 */
export function checkerContainer(name: string) {
  return name.length === 0 ? defaultContainer : container({ name });
}

/**
 * normalizeComparisonString mirrors cel-go's whitespace-insensitive test comparison helper.
 */
export function normalizeComparisonString(value: string): string {
  return value.replace(/[ \n\t\r]/g, "");
}

/**
 * resolveCostCase decodes one synced checker cost row into local parser, env, and expectation values.
 */
export function resolveCostCase(testCase: SyncedCostCase): ResolvedCostCase {
  return {
    expr: testCase.expr,
    hints: testCase.hints ?? {},
    options: resolveCostOptions(testCase.options),
    vars: (testCase.vars ?? []).map((variable) => parseCostVariableDecl(variable.$expr ?? "")),
    wanted: resolveCostEstimateExpr(testCase.wanted.$expr ?? ""),
  };
}

function resolveCheckerOptions(options: Array<{ $expr?: string }> | undefined): CheckerOptions {
  if (!options || options.length === 0) {
    return { crossTypeNumericComparisons: true };
  }
  const resolved: CheckerOptions = {};
  for (const option of options) {
    switch (option.$expr) {
      case "CrossTypeNumericComparisons(true)":
        resolved.crossTypeNumericComparisons = true;
        break;
      case "CrossTypeNumericComparisons(false)":
        resolved.crossTypeNumericComparisons = false;
        break;
      default:
        throw new Error(`unsupported checker option expr: ${option.$expr}`);
    }
  }
  return resolved;
}

function resolveCostOptions(options: Array<{ $expr?: string }> | undefined): CostOptions {
  if (!options || options.length === 0) {
    return {};
  }
  const resolved: CostOptions = {};
  for (const option of options) {
    const expr = option.$expr?.trim();
    switch (expr) {
      case "PresenceTestHasCost(true)":
        resolved.presenceTestHasCost = true;
        break;
      case "PresenceTestHasCost(false)":
        resolved.presenceTestHasCost = false;
        break;
      default:
        if (expr?.startsWith("OverloadCostEstimate(")) {
          resolved.overloadCostEstimates ??= {};
          const [overloadId, estimator] = resolveOverloadCostEstimate(expr);
          resolved.overloadCostEstimates[overloadId] = estimator;
          break;
        }
        throw new Error(`unsupported checker cost option expr: ${option.$expr}`);
    }
  }
  return resolved;
}

function resolveTestEnv(expr: string | undefined): ParsedTestEnv {
  if (!expr) {
    return emptyTestEnv();
  }
  if (expr === 'testEnvs(t)["default"]') {
    return defaultTestEnv();
  }
  if (!expr.startsWith("testEnv{") || !expr.endsWith("}")) {
    throw new Error(`unsupported checker env expr: ${expr}`);
  }
  const body = expr.slice("testEnv{".length, -1).trim();
  if (body.length === 0) {
    return emptyTestEnv();
  }
  const resolved = emptyTestEnv();
  for (const entry of splitTopLevel(body)) {
    const colon = entry.indexOf(":");
    if (colon < 0) {
      throw new Error(`unsupported checker env field: ${entry}`);
    }
    const key = entry.slice(0, colon).trim();
    const value = entry
      .slice(colon + 1)
      .trim()
      .replace(/,$/, "")
      .trim();
    switch (key) {
      case "idents":
        resolved.idents = parseVariableDeclList(value);
        break;
      case "functions":
        resolved.functions = parseFunctionDeclList(value);
        break;
      case "variadicASTs":
        resolved.variadicASTs = value === "true";
        break;
      case "optionalSyntax":
        resolved.optionalSyntax = value === "true";
        break;
      case "jsonFieldNames":
        resolved.jsonFieldNames = value === "true";
        break;
      default:
        throw new Error(`unsupported checker env field: ${key}`);
    }
  }
  return resolved;
}

function emptyTestEnv(): ParsedTestEnv {
  return {
    idents: [],
    functions: [],
    variadicASTs: false,
    optionalSyntax: false,
    jsonFieldNames: false,
  };
}

function defaultTestEnv(): ParsedTestEnv {
  return {
    idents: [
      variable("is", StringType),
      variable("ii", IntType),
      variable("iu", UintType),
      variable("iz", BoolType),
      variable("ib", BytesType),
      variable("id", DoubleType),
      variable("ix", NullType),
    ],
    functions: [
      func("fg_s", {
        overloads: [overload("fg_s_0", [], StringType)],
      }),
      func("fi_s_s", {
        overloads: [memberOverload("fi_s_s_0", [StringType], StringType)],
      }),
    ],
    variadicASTs: false,
    optionalSyntax: false,
    jsonFieldNames: false,
  };
}

function parseVariableDeclList(source: string): Array<ReturnType<typeof variable>> {
  const body = unwrapGoComposite(source, "[]*decls.VariableDecl");
  if (body.length === 0) {
    return [];
  }
  return splitTopLevel(body).map(parseVariableDecl);
}

function parseVariableDecl(source: string): ReturnType<typeof variable> {
  const args = parseCall(source, "decls.NewVariable");
  return variable(unquoteGoString(args[0]!), resolveCheckerTypeExpr({ $expr: args[1]! }) as Type);
}

function parseCostVariableDecl(source: string): ReturnType<typeof variable> {
  const args = parseCall(source.trim(), "decls.NewVariable");
  return variable(unquoteGoString(args[0]!), resolveCostTypeExpr(args[1]!));
}

function parseFunctionDeclList(source: string): FunctionDecl[] {
  const body = unwrapGoComposite(source, "[]*decls.FunctionDecl");
  if (body.length === 0) {
    return [];
  }
  return splitTopLevel(body).map(parseFunctionDecl);
}

function parseFunctionDecl(source: string): FunctionDecl {
  const args = parseCall(source, "testFunction");
  const name = unquoteGoString(args[1]!);
  const overloads = args.slice(2).map(parseOverloadDecl);
  return func(name, { overloads });
}

function parseOverloadDecl(source: string) {
  if (source.startsWith("decls.MemberOverload(")) {
    const args = parseCall(source, "decls.MemberOverload");
    return memberOverload(
      unquoteGoString(args[0]!),
      parseTypeList(args[1]!),
      resolveCheckerTypeExpr({ $expr: args[2]! }) as Type,
    );
  }
  if (source.startsWith("decls.Overload(")) {
    const args = parseCall(source, "decls.Overload");
    return overload(
      unquoteGoString(args[0]!),
      parseTypeList(args[1]!),
      resolveCheckerTypeExpr({ $expr: args[2]! }) as Type,
    );
  }
  throw new Error(`unsupported checker overload expr: ${source}`);
}

function parseTypeList(source: string): Type[] {
  const body = unwrapGoComposite(source, "[]*types.Type");
  if (body.length === 0) {
    return [];
  }
  return splitTopLevel(body).map((entry) => resolveCheckerTypeExpr({ $expr: entry }) as Type);
}

function resolveCheckerTypeExpr(value: unknown): unknown {
  const expr = (value as { $expr?: string } | undefined)?.$expr?.trim();
  if (!expr) {
    return resolveSyncedExpr(value);
  }
  const objectMatch = /^NewObjectType\(\s*"([\s\S]*?)"\s*,?\s*\)$/.exec(stripTypePrefixes(expr));
  if (objectMatch) {
    return resolveSyncedExpr({ $expr: `NewObjectType("${objectMatch[1]!}")` });
  }
  return resolveSyncedExpr({ $expr: stripTypePrefixes(expr) });
}

function resolveCostTypeExpr(expr: string): Type {
  switch (expr.trim()) {
    case "allTypes":
      return resolveCheckerTypeExpr({
        $expr: 'types.NewObjectType("google.expr.proto3.test.TestAllTypes")',
      }) as Type;
    case "allList":
      return resolveCheckerTypeExpr({
        $expr: 'types.NewListType(types.NewObjectType("google.expr.proto3.test.TestAllTypes"))',
      }) as Type;
    case "intList":
      return resolveCheckerTypeExpr({ $expr: "types.NewListType(types.IntType)" }) as Type;
    case "nestedList":
      return resolveCheckerTypeExpr({
        $expr:
          'types.NewListType(types.NewListType(types.NewObjectType("google.expr.proto3.test.TestAllTypes")))',
      }) as Type;
    case "allMap":
      return resolveCheckerTypeExpr({
        $expr:
          'types.NewMapType(types.StringType, types.NewObjectType("google.expr.proto3.test.TestAllTypes"))',
      }) as Type;
    case "nestedMap":
      return resolveCheckerTypeExpr({
        $expr:
          'types.NewMapType(types.StringType, types.NewMapType(types.StringType, types.NewObjectType("google.expr.proto3.test.TestAllTypes")))',
      }) as Type;
    default:
      return resolveCheckerTypeExpr({ $expr: expr }) as Type;
  }
}

function resolveCostEstimateExpr(expr: string): CostEstimate {
  const trimmed = expr.trim();
  if (trimmed === "zeroCost") {
    return fixedCostEstimate(0);
  }
  if (trimmed === "oneCost") {
    return fixedCostEstimate(1);
  }
  const match = /^CostEstimate\{Min:\s*(\d+),\s*Max:\s*(\d+)\}$/.exec(trimmed);
  if (match) {
    return new (fixedCostEstimate(0).constructor as typeof CostEstimate)(
      BigInt(match[1]!),
      BigInt(match[2]!),
    );
  }
  const fixedMatch = /^FixedCostEstimate\((\d+)\)$/.exec(trimmed);
  if (fixedMatch) {
    return fixedCostEstimate(BigInt(fixedMatch[1]!));
  }
  throw new Error(`unsupported checker cost estimate expr: ${expr}`);
}

function resolveOverloadCostEstimate(source: string): [string, FunctionEstimator] {
  const args = parseCall(source.replace(/\s+/g, " ").trim(), "OverloadCostEstimate");
  const overloadId = resolveOverloadId(args[0]!);
  const estimatorSource = args[1]!.replace(/\s+/g, " ").trim();
  if (estimatorSource.includes("MultiplyByCostFactor(0.2)")) {
    return [overloadId, containsCostEstimator(0.2)];
  }
  if (estimatorSource.includes("listElementNode(*target)")) {
    return [overloadId, listBytesMaxEstimator];
  }
  throw new Error(`unsupported overload cost estimator expr: ${source}`);
}

function resolveOverloadId(source: string): string {
  const trimmed = source.trim();
  if (trimmed.startsWith("overloads.")) {
    const name = trimmed.slice("overloads.".length);
    const value = overloadIdByName.get(name);
    if (value !== undefined) {
      return value;
    }
    throw new Error(`unsupported overload id expr: ${source}`);
  }
  return unquoteGoString(trimmed);
}

function containsCostEstimator(factor: number): FunctionEstimator {
  return (estimator, target, args) => {
    if (!target || args.length !== 1) {
      return undefined;
    }
    const stringSize = estimateCostNodeSize(estimator, target).multiplyByCostFactor(factor);
    const substringSize = estimateCostNodeSize(estimator, args[0]!).multiplyByCostFactor(factor);
    const cost = stringSize.multiply(substringSize);
    return new CallEstimate(cost.Min, cost.Max);
  };
}

function listBytesMaxEstimator(
  estimator: { estimateSize(element: AstNode): SizeEstimate | undefined },
  target: AstNode | undefined,
): CallEstimate | undefined {
  if (!target) {
    return undefined;
  }
  let elementCost = fixedCostEstimate(1);
  const elementNode = listElementNode(target);
  if (elementNode) {
    const kind = elementNode.type().kind();
    if (kind === Kind.Bytes || kind === Kind.String) {
      elementCost = elementCost.add(
        estimateAstNodeSize(estimator, elementNode).multiplyByCostFactor(StringTraversalCostFactor),
      );
    }
    const cost = estimateAstNodeSize(estimator, target).multiplyByCost(elementCost);
    return new CallEstimate(cost.Min, cost.Max);
  }
  return undefined;
}

function estimateCostNodeSize(
  estimator: { estimateSize(element: AstNode): SizeEstimate | undefined },
  node: AstNode,
): SizeEstimate {
  return estimateAstNodeSize(estimator, node);
}

function estimateAstNodeSize(
  estimator: { estimateSize(element: AstNode): SizeEstimate | undefined },
  node: AstNode,
): SizeEstimate {
  return (
    node.computedSize() ?? estimator.estimateSize(node) ?? new SizeEstimate(0n, (1n << 64n) - 1n)
  );
}

function listElementNode(list: AstNode): AstNode | undefined {
  const params = list.type().parameters();
  if (params.length === 0) {
    return undefined;
  }
  const path = list.path();
  const itemPath = path ? [...path, "@items"] : undefined;
  return {
    path: () => itemPath,
    type: () => params[0]!,
    expr: () => undefined,
    computedSize: () => undefined,
  };
}

function stripTypePrefixes(expr: string): string {
  return expr
    .replace(/\btypes\./g, "")
    .replace(/\bdecls\./g, "")
    .replace(/\bproto3pb\./g, "")
    .replace(/\bproto2pb\./g, "");
}

function parseCall(source: string, callee: string): string[] {
  if (!source.startsWith(`${callee}(`) || !source.endsWith(")")) {
    throw new Error(`unsupported checker call expr: ${source}`);
  }
  return splitTopLevel(source.slice(callee.length + 1, -1));
}

function unwrapGoComposite(source: string, prefix: string): string {
  const trimmed = source.trim();
  if (!trimmed.startsWith(`${prefix}{`) || !trimmed.endsWith("}")) {
    throw new Error(`unsupported checker composite expr: ${source}`);
  }
  return trimmed.slice(prefix.length + 1, -1).trim();
}

function splitTopLevel(source: string): string[] {
  const out: string[] = [];
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inString = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    const prev = index > 0 ? source[index - 1] : "";
    if (char === '"' && prev !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "(") {
      depthParen += 1;
      continue;
    }
    if (char === ")") {
      depthParen -= 1;
      continue;
    }
    if (char === "{") {
      depthBrace += 1;
      continue;
    }
    if (char === "}") {
      depthBrace -= 1;
      continue;
    }
    if (char === "[") {
      depthBracket += 1;
      continue;
    }
    if (char === "]") {
      depthBracket -= 1;
      continue;
    }
    if (char === "," && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      const entry = source.slice(start, index).trim();
      if (entry.length !== 0) {
        out.push(entry);
      }
      start = index + 1;
    }
  }
  const tail = source.slice(start).trim();
  if (tail.length !== 0) {
    out.push(tail);
  }
  return out;
}

function unquoteGoString(value: string): string {
  return value.replace(/^"/, "").replace(/"$/, "").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
