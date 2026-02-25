import type { Expr, ParsedExpr } from "../gen/google/api/expr/v1alpha1/syntax_pb.js";
import type { Optimizer } from "./optimizer.js";
import { cloneExpr, mapExpr } from "./utils.js";

/**
 * Creates an optimizer that replaces ident nodes with arbitrary Expr subtrees.
 * Each replacement Expr is deep-cloned with fresh ids on every substitution
 * to ensure unique node ids in the output tree.
 *
 * Example:
 *   inline({ name: parse("user.profile.name") })
 */
export function inline(replacements: Record<string, ParsedExpr>): Optimizer {
  let idCounter = 100_000n;
  const nextId = (): bigint => idCounter++;

  return (root: Expr): Expr => {
    return mapExpr(root, (expr: Expr) => {
      if (expr.exprKind.case !== "identExpr") return expr;
      const replacement = replacements[expr.exprKind.value.name];
      if (!replacement?.expr) return expr;
      return cloneExpr(replacement.expr, nextId);
    });
  };
}
