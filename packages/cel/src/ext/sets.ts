import type { LibraryAliaser, LibraryVersioner, SingletonLibrary } from "../cel/library.js";
import type { ASTOptimizer, OptimizerContext } from "../cel/optimizer.js";
import {
  type AstNode,
  CallEstimate,
  type CostEstimator,
  type FunctionEstimator,
  sizeEstimate,
} from "../checker/cost.js";
import type { AST, ConstantValue, Expr } from "../common/ast/index.js";
import { ExprKind, matchDescendants, navigateAst } from "../common/ast/index.js";
import { func, overload } from "../common/decls.js";
import * as operators from "../common/operators.js";
import { False, True } from "../common/types/bool.js";
import { Int } from "../common/types/int.js";
import type { Val } from "../common/types/ref/index.js";
import type { Lister } from "../common/types/traits/index.js";
import { BoolType, listType, typeParamType } from "../common/types/types.js";
import type { FunctionTracker } from "../interpreter/runtime-cost.js";

/** uint64Max is the maximum bound used by CEL cost estimates with unknown sizes. */
const uint64Max = (1n << 64n) - 1n;

/**
 * SetsOptions configures the set relationship extension library.
 */
export interface SetsOptions {
  /**
   * version records the selected library version.
   */
  readonly version?: number;
}

/**
 * SetsLibrary describes the singleton set extension and its serialization metadata.
 */
export type SetsLibrary = SingletonLibrary & LibraryAliaser & LibraryVersioner;

/**
 * sets configures namespaced set relationship functions over CEL lists.
 *
 * CEL has no dedicated set type, but lists are often known to behave like
 * sets. This library provides containment, equivalence, and intersection using
 * standard CEL equality.
 */
export function sets(options: SetsOptions = {}): SetsLibrary {
  const version = options.version ?? Number.MAX_SAFE_INTEGER;
  const genericList = listType(typeParamType("T"));
  return {
    libraryAlias: "sets",
    libraryName: "cel.lib.ext.sets",
    libraryVersion: version,
    compileOptions: {
      functions: [
        func("sets.contains", {
          overloads: [
            overload("list_sets_contains_list", [genericList, genericList], BoolType, {
              binaryBinding: setsContains,
            }),
          ],
        }),
        func("sets.equivalent", {
          overloads: [
            overload("list_sets_equivalent_list", [genericList, genericList], BoolType, {
              binaryBinding: setsEquivalent,
            }),
          ],
        }),
        func("sets.intersects", {
          overloads: [
            overload("list_sets_intersects_list", [genericList, genericList], BoolType, {
              binaryBinding: setsIntersects,
            }),
          ],
        }),
      ],
      cost: {
        overloadCostEstimates: {
          list_sets_contains_list: estimateSetsCost(1),
          list_sets_equivalent_list: estimateSetsCost(2),
          list_sets_intersects_list: estimateSetsCost(1),
        },
      },
    },
    programOptions: {
      costTracking: {
        overloadTrackers: {
          list_sets_contains_list: trackSetsCost(1),
          list_sets_equivalent_list: trackSetsCost(2),
          list_sets_intersects_list: trackSetsCost(1),
        },
      },
    },
  };
}

/**
 * setMembershipOptimizer rewrites membership tests against constant lists to map membership.
 *
 * Constant lists containing doubles are retained because CEL's numeric equality can equate double
 * keys with integer keys. Lists containing runtime expressions are also retained. The optimized
 * map stores `true` for each key and preserves the behavior of the original `in` expression.
 */
export function setMembershipOptimizer(): ASTOptimizer {
  return {
    optimize: (context, ast) => optimizeSetMembership(context, ast),
  };
}

/**
 * optimizeSetMembership applies constant list membership rewrites throughout an AST.
 */
function optimizeSetMembership(context: OptimizerContext, ast: AST): AST {
  const calls = matchDescendants(
    navigateAst(ast),
    (expression) =>
      expression.kind() === ExprKind.Call && expression.asCall()?.functionName() === operators.In,
  );
  for (const call of calls) {
    const list = call.asCall()?.args()[1];
    if (list?.kind() !== ExprKind.List) {
      continue;
    }
    const keys = list
      .asList()!
      .elements()
      .map((element) => constantMembershipKey({ ast, context, expression: element }));
    if (keys.some((key) => key === undefined)) {
      continue;
    }
    // Use the optimizer update seam so nested macro source metadata is repaired together with
    // the semantic expression tree.
    context.updateExpr({
      target: list,
      updated: context.map(
        keys.map((key) =>
          context.mapEntry({
            key: key!,
            value: context.literal(true),
          }),
        ),
      ),
    });
  }
  return ast;
}

/**
 * constantMembershipKey returns a map-safe constant key for one list element.
 */
function constantMembershipKey(options: {
  context: OptimizerContext;
  ast: AST;
  expression: Expr;
}): Expr | undefined {
  if (options.expression.kind() === ExprKind.Literal) {
    const value = options.expression.asLiteral();
    return typeof value === "number" ? undefined : options.context.literal(value as ConstantValue);
  }
  const value = options.ast.referenceMap().get(options.expression.id())?.value;
  if (typeof value === "bigint" || typeof value === "string" || typeof value === "boolean") {
    return options.context.literal(value);
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return options.context.literal(BigInt(value));
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof value.value === "function"
  ) {
    const native = value.value();
    if (typeof native === "bigint") {
      return options.context.literal(native);
    }
    if (typeof native === "number" && Number.isInteger(native)) {
      return options.context.literal(BigInt(native));
    }
  }
  return undefined;
}

/**
 * setsIntersects reports whether either list contains an element equal to one in the other list.
 */
function setsIntersects(listA: Val, listB: Val): Val {
  const left = listA as Lister;
  const right = listB as Lister;
  const iterator = left.iterator();
  while (iterator.hasNext() === True) {
    if (right.contains(iterator.next()) === True) {
      return True;
    }
  }
  return False;
}

/**
 * setsContains reports whether the first list contains every element of the second list.
 */
function setsContains(list: Val, sublist: Val): Val {
  const values = list as Lister;
  const subset = sublist as Lister;
  const iterator = subset.iterator();
  while (iterator.hasNext() === True) {
    const exists = values.contains(iterator.next());
    if (exists !== True) {
      return exists;
    }
  }
  return True;
}

/**
 * setsEquivalent reports whether each list contains every element of the other list.
 */
function setsEquivalent(listA: Val, listB: Val): Val {
  const leftContainsRight = setsContains(listA, listB);
  return leftContainsRight === True ? setsContains(listB, listA) : leftContainsRight;
}

/**
 * estimateSetsCost estimates the cross-product comparisons performed by a set relationship.
 */
function estimateSetsCost(costFactor: number): FunctionEstimator {
  return (estimator, _target, args) => {
    if (args.length !== 2) {
      return undefined;
    }
    const leftSize = estimateSize(estimator, args[0]!);
    const rightSize = estimateSize(estimator, args[1]!);
    const cost = leftSize.multiply(rightSize).multiplyByCostFactor(costFactor);
    return new CallEstimate(cost.Min + 1n, cost.Max === uint64Max ? uint64Max : cost.Max + 1n);
  };
}

/**
 * estimateSize returns a statically known, externally hinted, or unbounded node size.
 */
function estimateSize(estimator: CostEstimator, node: AstNode) {
  return node.computedSize() ?? estimator.estimateSize(node) ?? sizeEstimate(0n, uint64Max);
}

/**
 * trackSetsCost records the cross-product comparison cost for evaluated list arguments.
 */
function trackSetsCost(costFactor: number): FunctionTracker {
  return {
    cost: ({ args }) => 1 + actualSize(args[0]!) * actualSize(args[1]!) * costFactor,
  };
}

/**
 * actualSize returns the size of a CEL list or one for a non-sized value.
 */
function actualSize(value: Val): number {
  const sized = value as Partial<Lister>;
  if (typeof sized.size !== "function") {
    return 1;
  }
  const size = sized.size();
  return size instanceof Int ? Number(size.value()) : 1;
}
