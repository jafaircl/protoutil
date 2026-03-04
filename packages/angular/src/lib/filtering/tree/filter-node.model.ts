/**
 * filter-node.model.ts
 *
 * Data model for the filter tree. A FilterNode is either:
 *   - A "leaf": no children, has an `expr` (the actual filter expression)
 *   - A "branch": has children and a `conjunction` ("_&&_" | "_||_")
 *
 * The privateSymbol acts as a brand to prevent arbitrary objects from being
 * treated as FilterNodes (i.e. isFilterNode() is a reliable type-guard).
 */

import { create } from "@bufbuild/protobuf";
import { type Expr, ExprSchema } from "@protoutil/aip/filtering";

/** Brand symbol — must be present on every FilterNode instance. */
const privateSymbol = Symbol.for("FilterNode");

export interface FilterNode {
  [privateSymbol]: unknown;
  id: string;
  /** Child nodes. Empty array for leaves. */
  children: FilterNode[];
  /** Present only on leaves. */
  expr?: Expr;
  /** Present only on branches. */
  conjunction?: "_&&_" | "_||_";
}

/** Type-guard: true if `obj` is a branded FilterNode. */
export function isFilterNode(obj: unknown): obj is FilterNode {
  return typeof obj === "object" && obj !== null && privateSymbol in obj;
}

/** True if the node is a leaf (has no conjunction). */
export function isFilterLeafNode(node: FilterNode): boolean {
  return isFilterNode(node) && typeof node.conjunction !== "string";
}

/** True if the node is a branch (has a conjunction, may have zero children). */
export function isFilterBranchNode(node: FilterNode): boolean {
  return isFilterNode(node) && typeof node.conjunction === "string";
}

/** Create a new leaf node wrapping the given Expr. */
export function createFilterLeafNode(expr: Expr, id: string = crypto.randomUUID()): FilterNode {
  return {
    [privateSymbol]: {},
    id,
    expr,
    children: [],
  };
}

/** Create a new branch node with the given children and conjunction. */
export function createFilterBranchNode(
  children: FilterNode[],
  conjunction: "_&&_" | "_||_",
  id: string = crypto.randomUUID(),
): FilterNode {
  return {
    [privateSymbol]: {},
    id,
    children,
    conjunction,
  };
}

/**
 * Deep-clone a FilterNode tree.
 * Required when mutating the tree so that Angular signal change-detection
 * sees a new object reference.
 */
export function cloneNode(node: FilterNode): FilterNode {
  return {
    [privateSymbol]: {},
    id: node.id,
    expr: node.expr,
    conjunction: node.conjunction,
    children: node.children.map(cloneNode),
  };
}

/**
 * Converts a filter `Expr` into a `FilterNode` tree.
 *
 * `_&&_` / `_||_` calls become branch nodes with flattening of consecutive
 * same-conjunction nodes (so `a && b && c` yields one AND branch with three
 * leaf children rather than a nested binary tree).
 *
 * Everything else becomes a leaf node.
 */
export function exprToFilterNode(expr: Expr): FilterNode {
  if (expr.exprKind.case === "callExpr") {
    const call = expr.exprKind.value;
    if (call.function === "_&&_" || call.function === "_||_") {
      // Flatten consecutive same-conjunction children into a single branch.
      const children: FilterNode[] = [];
      for (const arg of call.args) {
        if (arg.exprKind.case === "callExpr" && arg.exprKind.value.function === call.function) {
          const childBranch = exprToFilterNode(arg);
          children.push(...childBranch.children);
        } else {
          children.push(exprToFilterNode(arg));
        }
      }

      return createFilterBranchNode(children, call.function);
    }
  }

  return createFilterLeafNode(expr);
}

/**
 * Converts a `FilterNode` tree back into a filter `Expr`.
 *
 * Branch nodes are folded into a left-associative binary call chain:
 * `((a && b) && c) && d …`
 *
 * Leaf nodes return their `expr` unchanged.
 */
export function filterNodeToExpr(node: FilterNode): Expr | undefined {
  // Empty branch — no filter expression.
  if (node.conjunction != null && node.children.length === 0) {
    return undefined;
  }

  if (isFilterBranchNode(node)) {
    if (node.children.length === 1) {
      return filterNodeToExpr(node.children[0]);
    }

    const fn = node.conjunction;
    const childExprs = node.children.map(filterNodeToExpr).filter((e): e is Expr => e != null);

    if (childExprs.length === 0) return undefined;
    if (childExprs.length === 1) return childExprs[0];

    const [first, ...rest] = childExprs;
    return rest.reduce<Expr>(
      (acc, child) =>
        create(ExprSchema, {
          exprKind: {
            case: "callExpr",
            value: { function: fn, args: [acc, child] },
          },
        }),
      first,
    );
  }

  if (isFilterLeafNode(node) && node.expr != null) {
    return node.expr;
  }

  throw new Error(`FilterNode "${node.id}" is invalid: leaf nodes must have "expr" set.`);
}
