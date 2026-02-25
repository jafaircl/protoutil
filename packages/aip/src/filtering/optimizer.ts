import { create } from "@bufbuild/protobuf";
import { type CheckedExpr, CheckedExprSchema } from "../gen/google/api/expr/v1alpha1/checked_pb.js";
import type { Expr } from "../gen/google/api/expr/v1alpha1/syntax_pb.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A pure AST transform. Receives the root Expr and returns a new one. */
export type Optimizer = (expr: Expr) => Expr;

// ─────────────────────────────────────────────────────────────────────────────
// optimize
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies a sequence of optimizers to a CheckedExpr, returning a new CheckedExpr.
 * Optimizers are applied left-to-right. The typeMap and referenceMap from the
 * input are preserved as-is; callers should re-check if they need updated type info.
 *
 * Example:
 * ```ts
 *   optimize(
 *     check(parse("name = 'test' AND retries < 2")),
 *     inline({ name: parse("user_name") }),
 *     fold({ retries: 3n })
 *   );
 * ```
 */
export function optimize(checkedExpr: CheckedExpr, ...optimizers: Optimizer[]): CheckedExpr {
  if (!checkedExpr.expr) return checkedExpr;

  let expr: Expr = checkedExpr.expr;
  for (const optimizer of optimizers) {
    expr = optimizer(expr);
  }

  return create(CheckedExprSchema, {
    ...checkedExpr,
    expr,
  });
}
