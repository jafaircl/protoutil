import type { AST, Expr } from "../common/ast/index.js";
import { ExprKind } from "../common/ast/index.js";
import { toAdornedDebugString } from "../common/debug.js";
import { formatCheckedType } from "./format.js";

/**
 * print renders an expression using checker metadata annotations.
 */
export function print(expr: Expr, checked: AST): string {
  return toAdornedDebugString(expr, {
    getMetadata(element: unknown): string {
      if (!element || typeof element !== "object" || !("id" in (element as object))) {
        return "";
      }
      const node = element as Expr;
      let result = "";
      const type = checked.typeMap().get(node.id());
      if (type) {
        result += `~${formatCheckedType(type)}`;
      }
      switch (node.kind()) {
        case ExprKind.Ident:
        case ExprKind.Call:
        case ExprKind.List:
        case ExprKind.Struct:
        case ExprKind.Select: {
          const reference = checked.referenceMap().get(node.id());
          if (!reference) {
            return result;
          }
          if (reference.overloadIds.length === 0) {
            result += `^${reference.name}`;
            return result;
          }
          result += `^${[...reference.overloadIds].sort().join("|")}`;
          return result;
        }
        default:
          return result;
      }
    },
  });
}
