import type { LibraryAliaser, LibraryVersioner, SingletonLibrary } from "../cel/library.js";
import {
  type AstNode,
  CallEstimate,
  CostEstimate,
  type CostEstimator,
  type FunctionEstimator,
  type SizeEstimate,
  sizeEstimate,
} from "../checker/cost.js";
import { type Expr, ExprKind } from "../common/ast/index.js";
import { ListCreateBaseCost, StringTraversalCostFactor } from "../common/cost.js";
import { functionDecl, memberOverload, overload } from "../common/decls.js";
import * as operators from "../common/operators.js";
import { True } from "../common/types/bool.js";
import { err } from "../common/types/err.js";
import { Int, IntNegOne } from "../common/types/int.js";
import { refValList } from "../common/types/list.js";
import { DefaultTypeAdapter } from "../common/types/provider.js";
import type { Val } from "../common/types/ref/index.js";
import type { Comparer, Lister } from "../common/types/traits/index.js";
import {
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  IntType,
  Kind,
  ListType,
  listType,
  StringType,
  TimestampType,
  type Type,
  typeParamType,
  UintType,
} from "../common/types/types.js";
import { equal } from "../common/types/util.js";
import type { FunctionTracker } from "../interpreter/runtime-cost.js";
import { receiverMacro } from "../parser/macro.js";
import type { ExprHelper, Macro } from "../parser/options.js";

/** defaultMaxRangeSize limits the default memory allocated by `lists.range`. */
const defaultMaxRangeSize = 1_000_000;
/** uint64Max is the maximum bound used for unknown CEL cost sizes. */
const uint64Max = (1n << 64n) - 1n;
/** comparableTypes lists the CEL types accepted as list sort keys. */
const comparableTypes = [
  IntType,
  UintType,
  DoubleType,
  BoolType,
  DurationType,
  TimestampType,
  StringType,
  BytesType,
] as const;

/**
 * ListsOptions configures the list manipulation extension library.
 */
export interface ListsOptions {
  /**
   * maxRangeSize sets the maximum number of elements `lists.range` may allocate.
   *
   * A zero value disables the limit.
   */
  readonly maxRangeSize?: number;
  /** version limits the library to functions introduced at or below this version. */
  readonly version?: number;
}

/** ListsLibrary describes the singleton list extension and serialization metadata. */
export type ListsLibrary = SingletonLibrary & LibraryAliaser & LibraryVersioner;

/**
 * lists configures extended functions for list manipulation.
 *
 * All indices are zero-based. Version zero provides `slice`; version one adds
 * `flatten`; version two adds `distinct`, `range`, `reverse`, `sort`, and
 * `sortBy`; version three adds checker and runtime cost support.
 */
export function lists(options: ListsOptions = {}): ListsLibrary {
  const version = options.version ?? Number.MAX_SAFE_INTEGER;
  const maxRangeSize = options.maxRangeSize ?? defaultMaxRangeSize;
  const elementType = typeParamType("T");
  const genericList = listType(elementType);
  const functions = [
    functionDecl("slice", {
      overloads: [
        memberOverload("list_slice", [genericList, IntType, IntType], genericList, {
          functionBinding: (...args) =>
            sliceList({
              end: args[2]!,
              list: args[0]!,
              start: args[1]!,
            }),
        }),
      ],
    }),
  ];
  const macros: Macro[] = [];

  if (version >= 1) {
    functions.push(
      functionDecl("flatten", {
        singletonBinding: {
          func: (...args) => flattenBinding(args),
        },
        overloads: [
          memberOverload("list_flatten", [listType(genericList)], genericList),
          memberOverload("list_flatten_int", [listType(DynType), IntType], listType(DynType)),
        ],
      }),
    );
  }

  if (version >= 2) {
    functions.push(sortDeclaration());
    functions.push(sortByAssociatedKeysDeclaration());
    functions.push(
      functionDecl("lists.range", {
        overloads: [
          overload("lists_range", [IntType], listType(IntType), {
            unaryBinding: (value) => generateRange(value, maxRangeSize),
          }),
        ],
      }),
      functionDecl("reverse", {
        overloads: [
          memberOverload("list_reverse", [genericList], genericList, {
            unaryBinding: reverseList,
          }),
        ],
      }),
      functionDecl("distinct", {
        overloads: [
          memberOverload("list_distinct", [genericList], genericList, {
            unaryBinding: distinctList,
          }),
        ],
      }),
    );
    macros.push(sortByMacro());
  }

  const overloadCostEstimates: Record<string, FunctionEstimator> = {};
  const overloadTrackers: Record<string, FunctionTracker> = {};
  if (version >= 3) {
    Object.assign(overloadCostEstimates, {
      list_slice: estimateListSlice,
      list_flatten: version === 3 ? estimateListFlattenLegacy : estimateListFlatten,
      list_flatten_int: version === 3 ? estimateListFlattenLegacy : estimateListFlatten,
      lists_range: estimateListsRange,
      list_reverse: estimateListReverse,
      list_distinct: version === 3 ? estimateListDistinctLegacy : estimateListDistinct,
    });
    Object.assign(overloadTrackers, {
      list_slice: trackListOutputSize,
      list_flatten: version === 3 ? trackListFlattenLegacy : trackListFlatten,
      list_flatten_int: version === 3 ? trackListFlattenLegacy : trackListFlatten,
      lists_range: trackListOutputSize,
      list_reverse: trackListOutputSize,
      list_distinct: trackListDistinct,
    });
    for (const type of comparableTypes) {
      overloadCostEstimates[`list_${type.typeName()}_sort`] =
        version === 3 ? estimateListSortLegacy(type) : estimateListSort(type);
      overloadCostEstimates[`list_${type.typeName()}_sortByAssociatedKeys`] =
        version === 3 ? estimateListSortByLegacy(type) : estimateListSortBy(type);
      overloadTrackers[`list_${type.typeName()}_sort`] = trackListSort;
      overloadTrackers[`list_${type.typeName()}_sortByAssociatedKeys`] = trackListSortBy;
    }
  }

  return {
    libraryAlias: "lists",
    libraryName: "cel.lib.ext.lists",
    libraryVersion: version,
    compileOptions: {
      functions,
      macros: { custom: macros },
      cost:
        version >= 3
          ? {
              overloadCostEstimates,
            }
          : undefined,
    },
    programOptions:
      version >= 3
        ? {
            costTracking: { overloadTrackers },
          }
        : {},
  };
}

/** sortDeclaration creates typed `sort` overloads with one shared runtime binding. */
function sortDeclaration() {
  return functionDecl("sort", {
    singletonBinding: { unary: sortList },
    overloads: comparableTypes.map((type) =>
      memberOverload(`list_${type.typeName()}_sort`, [listType(type)], listType(type)),
    ),
  });
}

/** sortByAssociatedKeysDeclaration creates the internal sort-by-key overload set. */
function sortByAssociatedKeysDeclaration() {
  const genericList = listType(typeParamType("T"));
  return functionDecl("@sortByAssociatedKeys", {
    singletonBinding: { binary: sortListByAssociatedKeys },
    overloads: comparableTypes.map((type) =>
      memberOverload(
        `list_${type.typeName()}_sortByAssociatedKeys`,
        [genericList, listType(type)],
        genericList,
      ),
    ),
  });
}

/** generateRange returns integers from zero through `size - 1`. */
function generateRange(size: Val, maxSize: number): Val {
  if (!(size instanceof Int)) {
    return err("no such overload: lists.range");
  }
  const count = size.value();
  if (count < 0n) {
    return err(`lists.range: size must be non-negative, got ${count}`);
  }
  if (maxSize > 0 && count > BigInt(maxSize)) {
    return err(`lists.range: size ${count} exceeds maximum allowed (${maxSize})`);
  }
  const values: Val[] = [];
  for (let index = 0n; index < count; index += 1n) {
    values.push(new Int(index));
  }
  return refValList(DefaultTypeAdapter, values);
}

/** reverseList returns the elements of a list in reverse order. */
function reverseList(value: Val): Val {
  const list = value as Lister;
  const length = listSize(list);
  const values: Val[] = [];
  for (let index = length - 1; index >= 0; index -= 1) {
    values.push(list.get(new Int(BigInt(index))));
  }
  return refValList(DefaultTypeAdapter, values);
}

/** sliceList returns the half-open list interval selected by start and end. */
function sliceList(options: { end: Val; list: Val; start: Val }): Val {
  const list = options.list as Lister;
  const start = (options.start as Int).value();
  const end = (options.end as Int).value();
  const length = BigInt(listSize(list));
  if (start < 0n || end < 0n) {
    return err(`cannot slice(${start}, ${end}), negative indexes not supported`);
  }
  if (start > end) {
    return err(
      `cannot slice(${start}, ${end}), start index must be less than or equal to end index`,
    );
  }
  if (length < end) {
    return err(`cannot slice(${start}, ${end}), list is length ${length}`);
  }
  const values: Val[] = [];
  for (let index = start; index < end; index += 1n) {
    values.push(list.get(new Int(index)));
  }
  return refValList(DefaultTypeAdapter, values);
}

/** flattenBinding validates dynamic arguments before flattening one list. */
function flattenBinding(args: Val[]): Val {
  const list = asLister(args[0]);
  if (!list) {
    return err("no such overload");
  }
  const depthArg = args[1];
  if (depthArg !== undefined && !(depthArg instanceof Int)) {
    return err("no such overload");
  }
  const depth = depthArg instanceof Int ? depthArg.value() : 1n;
  if (depth < 0n) {
    return err("level must be non-negative");
  }
  return refValList(DefaultTypeAdapter, flattenList(list, depth));
}

/** flattenList recursively flattens nested lists to the requested depth. */
function flattenList(list: Lister, depth: bigint): Val[] {
  const values: Val[] = [];
  const iterator = list.iterator();
  while (iterator.hasNext() === True) {
    const value = iterator.next();
    const nested = asLister(value);
    if (!nested || depth === 0n) {
      values.push(value);
    } else {
      values.push(...flattenList(nested, depth - 1n));
    }
  }
  return values;
}

/** sortList sorts a list by its own elements. */
function sortList(value: Val): Val {
  return sortListByAssociatedKeys(value, value);
}

/**
 * sortListByAssociatedKeys sorts arbitrary values according to a parallel comparable key list.
 */
function sortListByAssociatedKeys(value: Val, keyValue: Val): Val {
  const list = value as Lister;
  const keys = keyValue as Lister;
  const length = listSize(list);
  const keyLength = listSize(keys);
  if (length !== keyLength) {
    return err(
      `@sortByAssociatedKeys() expected a list of the same size as the associated keys list, but got ${length} and ${keyLength} elements respectively`,
    );
  }
  if (length === 0) {
    return value;
  }
  const first = keys.get(new Int(0n));
  if (!isComparer(first)) {
    return err("list elements must be comparable");
  }
  const indices = Array.from({ length }, (_unused, index) => index);
  let failure: Val | undefined;
  indices.sort((left, right) => {
    const leftKey = keys.get(new Int(BigInt(left)));
    const rightKey = keys.get(new Int(BigInt(right)));
    if (
      leftKey.type().typeName() !== first.type().typeName() ||
      rightKey.type().typeName() !== first.type().typeName()
    ) {
      failure = err("list elements must have the same type");
      return 0;
    }
    const compared = (leftKey as unknown as Comparer).compare(rightKey);
    return compared === IntNegOne ? -1 : compared instanceof Int ? Number(compared.value()) : 0;
  });
  if (failure) {
    return failure;
  }
  return refValList(
    DefaultTypeAdapter,
    indices.map((index) => list.get(new Int(BigInt(index)))),
  );
}

/** distinctList returns first occurrences under standard CEL equality. */
function distinctList(value: Val): Val {
  const list = value as Lister;
  const length = listSize(list);
  if (length === 0) {
    return value;
  }
  const unique: Val[] = [];
  for (let index = 0; index < length; index += 1) {
    const candidate = list.get(new Int(BigInt(index)));
    if (!unique.some((other) => equal(candidate, other) === True)) {
      unique.push(candidate);
    }
  }
  return refValList(DefaultTypeAdapter, unique);
}

/** sortByMacro expands `list.sortBy(var, key)` into one bound list and a key map. */
function sortByMacro(): Macro {
  return receiverMacro("sortBy", 2, (helper, target, args) => {
    if (!target) {
      return helper.error(0, "missing macro target");
    }
    return expandSortBy({ args, helper, target });
  });
}

/** expandSortBy performs the CEL-Go `sortBy` macro expansion. */
function expandSortBy(options: { args: Expr[]; helper: ExprHelper; target: Expr }): Expr | Error {
  const { args, helper, target } = options;
  const targetKind = target.kind();
  if (
    ![
      ExprKind.List,
      ExprKind.Select,
      ExprKind.Ident,
      ExprKind.Comprehension,
      ExprKind.Call,
    ].includes(targetKind)
  ) {
    return helper.error(
      target.id(),
      "sortBy can only be applied to a list, identifier, comprehension, call or select expression",
    );
  }
  const iterVar = args[0]?.kind() === ExprKind.Ident ? args[0].asIdent() : undefined;
  if (!iterVar) {
    return helper.error(args[0]?.id() ?? 0, "argument is not an identifier");
  }
  const boundName = "@__sortBy_input__";
  const bound = helper.ident(boundName);
  const mappedKeys = helper.comprehension(
    helper.copy(bound),
    iterVar,
    helper.accuIdentName(),
    helper.list(),
    helper.literal(true),
    helper.call(operators.Add, helper.accuIdent(), helper.list(args[1]!)),
    helper.accuIdent(),
  );
  const call = helper.memberCall("@sortByAssociatedKeys", helper.copy(bound), mappedKeys);
  return helper.comprehension(
    helper.list(),
    "#unused",
    boundName,
    target,
    helper.literal(false),
    helper.ident(boundName),
    call,
  );
}

/** asLister returns a list trait value when the dynamic input supports list operations. */
function asLister(value: Val | undefined): Lister | undefined {
  const possible = value as Partial<Lister> | undefined;
  return value?.type().typeName() === ListType.typeName() &&
    typeof possible?.iterator === "function" &&
    typeof possible.get === "function"
    ? (possible as Lister)
    : undefined;
}

/** isComparer reports whether a value supports CEL ordering. */
function isComparer(value: Val): value is Val & Comparer {
  return typeof (value as Partial<Comparer>).compare === "function";
}

/** listSize converts a CEL list's integer size to a JavaScript number. */
function listSize(list: Lister): number {
  return Number((list.size() as Int).value());
}

/** estimateSize returns a computed, hinted, or unbounded node size. */
function estimateSize(estimator: CostEstimator, node: AstNode): SizeEstimate {
  return node.computedSize() ?? estimator.estimateSize(node) ?? sizeEstimate(0n, uint64Max);
}

/** nodeAsUintValue returns a non-negative integer literal or the supplied default. */
function nodeAsUintValue(node: AstNode, defaultValue: bigint): bigint {
  const expr = node.expr();
  if (expr?.kind() !== ExprKind.Literal) {
    return defaultValue;
  }
  const value = expr.asLiteral();
  if (typeof value === "bigint") {
    return value >= 0n ? value : 0n;
  }
  return value instanceof Int && value.value() >= 0n ? value.value() : 0n;
}

/** estimateListSlice computes an O(n) allocating slice operation. */
function estimateListSlice(
  estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
): CallEstimate | undefined {
  if (!target || args.length !== 2) {
    return undefined;
  }
  const size = estimateSize(estimator, target);
  const start = nodeAsUintValue(args[0]!, 0n);
  const end = nodeAsUintValue(args[1]!, size.Max);
  return estimateAllocatingListCall(1, sizeEstimate(end - start, end - start));
}

/** estimateListsRange computes an O(n) allocating range operation. */
function estimateListsRange(
  _estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
): CallEstimate | undefined {
  if (target || args.length !== 1) {
    return undefined;
  }
  const size = nodeAsUintValue(args[0]!, uint64Max);
  return estimateAllocatingListCall(1, sizeEstimate(size, size));
}

/** estimateListReverse computes an O(n) allocating reverse operation. */
function estimateListReverse(
  estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
): CallEstimate | undefined {
  return target && args.length === 0
    ? estimateAllocatingListCall(1, estimateSize(estimator, target))
    : undefined;
}

/** estimateListFlatten computes an O(n) flatten operation over the total flattened item count. */
function estimateListFlatten(
  estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
): CallEstimate | undefined {
  if (!target || args.length > 1) {
    return undefined;
  }
  const depth = args.length === 1 ? nodeAsUintValue(args[0]!, uint64Max) : 1n;
  const targetExpr = target.expr();
  const resultSize =
    targetExpr?.kind() === ExprKind.List
      ? estimateLiteralFlattenSize(targetExpr, depth)
      : estimateFlattenSize(estimator, target, depth);
  return estimateAllocatingListCall(1, resultSize);
}

/**
 * FlattenPathAstNode represents a synthetic list-item path used for checker size hints.
 */
class FlattenPathAstNode implements AstNode {
  /** constructor records the synthetic field path and its inferred element type. */
  public constructor(
    private readonly pathValue: string[],
    private readonly typeValue: Type,
  ) {}

  /** path returns the synthetic list-item path. */
  public path(): string[] {
    return [...this.pathValue];
  }

  /** type returns the inferred list element type. */
  public type(): Type {
    return this.typeValue;
  }

  /** expr reports that a synthetic path has no source expression. */
  public expr(): undefined {
    return undefined;
  }

  /** computedSize reports that size must be supplied by the estimator. */
  public computedSize(): undefined {
    return undefined;
  }
}

/** estimateFlattenSize estimates nested flattened output size from list-item path hints. */
function estimateFlattenSize(
  estimator: CostEstimator,
  node: AstNode,
  depth: bigint,
): SizeEstimate {
  const size = estimateSize(estimator, node);
  if (depth === 0n || node.type().kind() !== Kind.List) {
    return size;
  }
  const elementType = node.type().parameters()[0];
  const path = node.path();
  if (elementType === undefined || path === undefined) {
    return size;
  }
  const elementNode = new FlattenPathAstNode([...path, "@items"], elementType);
  return size.multiply(estimateFlattenSize(estimator, elementNode, depth - 1n));
}

/** estimateLiteralFlattenSize counts the result items produced by flattening a list literal. */
function estimateLiteralFlattenSize(expression: Expr, depth: bigint): SizeEstimate {
  if (depth === 0n) {
    const size = expression.kind() === ExprKind.List ? BigInt(expression.asList()!.size()) : 1n;
    return sizeEstimate(size, size);
  }
  if (expression.kind() !== ExprKind.List) {
    return sizeEstimate(1n, 1n);
  }
  let total = 0n;
  for (const element of expression.asList()!.elements()) {
    total += estimateLiteralFlattenSize(element, depth - 1n).Max;
  }
  return sizeEstimate(total, total);
}

/** estimateListFlattenLegacy computes the version-three cost from input size and flatten depth. */
function estimateListFlattenLegacy(
  estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
): CallEstimate | undefined {
  if (!target || args.length > 1) {
    return undefined;
  }
  const depth = args.length === 1 ? nodeAsUintValue(args[0]!, uint64Max) : 1n;
  return estimateAllocatingListCall(Number(depth), estimateSize(estimator, target));
}

/** estimateListDistinct computes the worst-case O(n²) distinct operation. */
function estimateListDistinct(
  estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
): CallEstimate | undefined {
  if (!target || args.length !== 0) {
    return undefined;
  }
  const size = estimateSize(estimator, target);
  const itemSize = estimateItemSize(estimator, target);
  const elementCost = estimateElementEqualityCost(target.type().parameters()[0] ?? DynType, itemSize);
  const cost = size.multiply(size).multiplyByCost(elementCost).multiplyByCostFactor(2);
  const resultSize = sizeEstimate(size.Min > 0n ? 1n : 0n, size.Max);
  return estimateListCallWithDirectCost(cost, resultSize);
}

/** estimateListSort returns the cost estimator for a concrete sort element type. */
function estimateListSort(type: Type): FunctionEstimator {
  return (estimator, target, args) =>
    target && args.length === 0 ? estimateListSortCost(estimator, target, type) : undefined;
}

/** estimateListSortBy returns the cost estimator for one concrete key type. */
function estimateListSortBy(type: Type): FunctionEstimator {
  return (estimator, target, args) =>
    target && args.length === 1
      ? estimateListSortByCost(estimator, target, args[0]!, type)
      : undefined;
}

/** estimateListSortCost computes the worst-case O(n²) sort comparison cost. */
function estimateListSortCost(estimator: CostEstimator, node: AstNode, type: Type): CallEstimate {
  const size = estimateSize(estimator, node);
  const elementCost = estimateElementEqualityCost(type, estimateItemSize(estimator, node));
  const cost = size.multiply(size).multiplyByCost(elementCost).multiplyByCostFactor(2);
  return estimateListCallWithDirectCost(cost, size);
}

/** estimateListSortByCost estimates key comparisons using target item-size hints. */
function estimateListSortByCost(
  estimator: CostEstimator,
  target: AstNode,
  keys: AstNode,
  type: Type,
): CallEstimate {
  const size = estimateSize(estimator, keys);
  const elementCost = estimateElementEqualityCost(type, estimateItemSize(estimator, target));
  const cost = size.multiply(size).multiplyByCost(elementCost).multiplyByCostFactor(2);
  return estimateListCallWithDirectCost(cost, size);
}

/** estimateAllocatingListCall adds dispatch and list allocation to a traversal cost. */
function estimateAllocatingListCall(costFactor: number, listSizeValue: SizeEstimate) {
  return estimateListCallWithDirectCost(
    listSizeValue.multiplyByCostFactor(costFactor),
    listSizeValue,
  );
}

/** estimateListCallWithDirectCost adds call dispatch and list allocation to a direct cost. */
function estimateListCallWithDirectCost(cost: CostEstimate, resultSize: SizeEstimate): CallEstimate {
  const total = cost.add(
    new CostEstimate(BigInt(ListCreateBaseCost + 1), BigInt(ListCreateBaseCost + 1)),
  );
  return new CallEstimate(total.Min, total.Max, resultSize);
}

/** estimateItemSize returns an estimator hint for a list's synthetic item path. */
function estimateItemSize(estimator: CostEstimator, node: AstNode): SizeEstimate {
  const path = node.path();
  if (path === undefined) {
    return sizeEstimate(0n, uint64Max);
  }
  const elementType = node.type().parameters()[0] ?? DynType;
  return (
    estimator.estimateSize(new FlattenPathAstNode([...path, "@items"], elementType)) ??
    sizeEstimate(0n, uint64Max)
  );
}

/** estimateElementEqualityCost estimates equality work for one list element. */
function estimateElementEqualityCost(type: Type, itemSize: SizeEstimate): CostEstimate {
  switch (type.kind()) {
    case Kind.String:
    case Kind.Bytes:
      return itemSize.multiplyByCostFactor(StringTraversalCostFactor);
    case Kind.List:
    case Kind.Map:
    case Kind.Struct:
      return new CostEstimate(0n, uint64Max);
    default:
      return new CostEstimate(1n, 1n);
  }
}

/** estimateListDistinctLegacy computes the version-three O(n²) distinct cost. */
function estimateListDistinctLegacy(
  estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
): CallEstimate | undefined {
  if (!target || args.length !== 0) {
    return undefined;
  }
  const size = estimateSize(estimator, target);
  const elementType = target.type().parameters()[0];
  const factor =
    elementType === StringType || elementType === BytesType
      ? 2 + StringTraversalCostFactor
      : 2;
  return estimateAllocatingListCall(factor, size.multiply(size));
}

/** estimateListSortLegacy returns the version-three estimator for a concrete sort type. */
function estimateListSortLegacy(type: Type): FunctionEstimator {
  return (estimator, target, args) =>
    target && args.length === 0 ? estimateListSortCostLegacy(estimator, target, type) : undefined;
}

/** estimateListSortByLegacy returns the version-three estimator for a concrete key type. */
function estimateListSortByLegacy(type: Type): FunctionEstimator {
  return (estimator, target, args) =>
    target && args.length === 1
      ? estimateListSortCostLegacy(estimator, args[0]!, type)
      : undefined;
}

/** estimateListSortCostLegacy computes the version-three O(n²) comparison cost. */
function estimateListSortCostLegacy(
  estimator: CostEstimator,
  node: AstNode,
  type: Type,
): CallEstimate {
  const size = estimateSize(estimator, node);
  const factor = 2 + (type === StringType || type === BytesType ? StringTraversalCostFactor : 0);
  return estimateAllocatingListCall(factor, size.multiply(size));
}

/** trackListOutputSize computes cost from the resulting list size. */
const trackListOutputSize: FunctionTracker = {
  cost: ({ result }) => trackAllocatingListCall(1, actualSize(result)),
};

/** trackListFlatten computes cost from the size of the flattened result list. */
const trackListFlatten: FunctionTracker = {
  cost: ({ result }) => trackAllocatingListCall(1, actualSize(result)),
};

/** trackListFlattenLegacy computes the version-three cost from input size and flatten depth. */
const trackListFlattenLegacy: FunctionTracker = {
  cost: ({ args }) => {
    const depth = args.length === 2 ? Number((args[1] as Int).value()) : 1;
    return trackAllocatingListCall(depth, actualSize(args[0]!));
  },
};

/** trackListDistinct computes worst-case self-comparison cost. */
const trackListDistinct: FunctionTracker = {
  cost: ({ args }) => trackListSelfCompare(args[0] as Lister),
};

/** trackListSort computes worst-case self-comparison cost. */
const trackListSort: FunctionTracker = {
  cost: ({ args }) => trackListSelfCompare(args[0] as Lister),
};

/** trackListSortBy computes worst-case comparisons over the associated keys. */
const trackListSortBy: FunctionTracker = {
  cost: ({ args }) => trackListSelfCompare(args[1] as Lister),
};

/** trackListSelfCompare computes worst-case O(n²) comparisons for one list. */
function trackListSelfCompare(list: Lister): number {
  const size = actualSize(list);
  let costFactor = 2;
  if (size > 0) {
    const type = list.get(new Int(0n)).type();
    if (type === StringType || type === BytesType) {
      costFactor += StringTraversalCostFactor;
    }
  }
  return trackAllocatingListCall(costFactor, size * size);
}

/** trackAllocatingListCall adds dispatch and allocation to one measured traversal. */
function trackAllocatingListCall(costFactor: number, size: number): number {
  return Math.trunc(size * Math.max(costFactor, 1)) + 1 + ListCreateBaseCost;
}

/** actualSize returns a CEL list size, or one for a non-list value. */
function actualSize(value: Val): number {
  const list = asLister(value);
  return list ? listSize(list) : 1;
}
