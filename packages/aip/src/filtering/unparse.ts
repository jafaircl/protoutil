import { create } from "@bufbuild/protobuf";
import {
  type Expr,
  type Expr_Call,
  type Expr_Comprehension,
  type Expr_CreateList,
  type Expr_CreateStruct,
  type Expr_Select,
  ExprSchema,
} from "../gen/google/api/expr/v1alpha1/syntax_pb.js";

// ─────────────────────────────────────────────────────────────────────────────
// Precedence table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Operator precedence levels (higher = binds tighter).
 * OR < AND < comparisons/has < unary NOT
 */
const PRECEDENCE: Record<string, number> = {
  "_||_": 1,
  "_&&_": 2,
  "_==_": 3,
  "_!=_": 3,
  "_<_": 3,
  "_<=_": 3,
  "_>_": 3,
  "_>=_": 3,
  "_:_": 3,
  "@in": 3,
  "@not": 4,
};

const INFIX_OP: Record<string, string> = {
  "_&&_": "AND",
  "_||_": "OR",
  "_==_": "=",
  "_!=_": "!=",
  "_<_": "<",
  "_<=_": "<=",
  "_>_": ">",
  "_>=_": ">=",
  "_:_": ":",
  "_+_": "+",
  "_-_": "-",
  "_*_": "*",
  "_/_": "/",
  "_%_": "%",
};

/** Returns the precedence of the outermost operator of an Expr, or Infinity for atoms. */
function exprPrecedence(expr: Expr): number {
  if (expr.exprKind.case !== "callExpr") return Infinity;
  const fn = (expr.exprKind.value satisfies Expr_Call).function;
  return PRECEDENCE[fn] ?? Infinity;
}

/**
 * Wrap `str` in parentheses if `childPrec` is strictly lower than `parentPrec`.
 * Equal precedence never needs parens because all our operators are left-associative
 * and the parser always produces left-associative trees.
 */
function maybeWrap(str: string, childPrec: number, parentPrec: number): string {
  return childPrec < parentPrec ? `(${str})` : str;
}

// ─────────────────────────────────────────────────────────────────────────────
// unparse
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts an Expr back to a CEL / AIP filter string.
 * Parentheses are only emitted when required by operator precedence.
 */
export function unparse(expr: Expr): string {
  return unparseExpr(expr);
}

function unparseExpr(expr: Expr): string {
  switch (expr.exprKind.case) {
    case "constExpr":
      return unparseConstant(expr);

    case "identExpr":
      return expr.exprKind.value.name || "_";

    case "selectExpr": {
      const sel = expr.exprKind.value satisfies Expr_Select;
      const operandStr = unparseExpr(sel.operand ?? create(ExprSchema));
      return sel.testOnly ? `has(${operandStr}.${sel.field})` : `${operandStr}.${sel.field}`;
    }

    case "callExpr": {
      const call = expr.exprKind.value satisfies Expr_Call;
      const fn = call.function;

      // Method call: target.fn(args)
      if (call.target) {
        const args = call.args.map((a) => unparseExpr(a));
        return `${unparseExpr(call.target)}.${fn}(${args.join(", ")})`;
      }

      // Unary NOT
      if (fn === "@not" && call.args.length === 1) {
        const inner = call.args[0];
        // Only wrap if the inner expression is AND or OR — comparisons and
        // atoms bind tighter than NOT and never need parens.
        const innerPrec = exprPrecedence(inner);
        const needsParens = innerPrec <= (PRECEDENCE["_&&_"] ?? 2);
        const innerStr = needsParens ? `(${unparseExpr(inner)})` : unparseExpr(inner);
        return `NOT ${innerStr}`;
      }

      // Has / @in
      if (fn === "@in" && call.args.length === 2) {
        return `${unparseExpr(call.args[0])}:${unparseExpr(call.args[1])}`;
      }

      // Infix binary operators
      if (fn in INFIX_OP && call.args.length === 2) {
        const myPrec = PRECEDENCE[fn] ?? 3;
        const left = call.args[0];
        const right = call.args[1];

        const leftStr = maybeWrap(unparseExpr(left), exprPrecedence(left), myPrec);
        const rightStr = maybeWrap(unparseExpr(right), exprPrecedence(right), myPrec);

        return `${leftStr} ${INFIX_OP[fn]} ${rightStr}`;
      }

      // General function call
      const args = call.args.map((a) => unparseExpr(a));
      return `${fn}(${args.join(", ")})`;
    }

    case "listExpr": {
      const list = expr.exprKind.value satisfies Expr_CreateList;
      return `[${list.elements.map((e) => unparseExpr(e)).join(", ")}]`;
    }

    case "structExpr": {
      const struct = expr.exprKind.value satisfies Expr_CreateStruct;
      const entries = struct.entries.map((e) => {
        const val = unparseExpr(e.value ?? create(ExprSchema));
        return e.keyKind.case === "fieldKey"
          ? `${e.keyKind.value}: ${val}`
          : `${unparseExpr(e.keyKind.value as Expr)}: ${val}`;
      });
      return struct.messageName
        ? `${struct.messageName}{${entries.join(", ")}}`
        : `{${entries.join(", ")}}`;
    }

    case "comprehensionExpr": {
      const c = expr.exprKind.value satisfies Expr_Comprehension;
      const empty = { id: 0n, exprKind: { case: undefined } } satisfies Partial<Expr> as Expr;
      return (
        `__comprehension__(${c.iterVar}, ${unparseExpr(c.iterRange ?? empty)}, ` +
        `${c.accuVar}, ${unparseExpr(c.accuInit ?? empty)}, ` +
        `${unparseExpr(c.loopCondition ?? empty)}, ` +
        `${unparseExpr(c.loopStep ?? empty)}, ` +
        `${unparseExpr(c.result ?? empty)})`
      );
    }

    default:
      return "?";
  }
}

function unparseConstant(expr: Expr): string {
  if (expr.exprKind.case !== "constExpr") return "?";
  const c = expr.exprKind.value;
  switch (c.constantKind.case) {
    case "nullValue":
      return "null";
    case "boolValue":
      return c.constantKind.value ? "true" : "false";
    case "int64Value":
      return String(c.constantKind.value);
    case "uint64Value":
      return `${c.constantKind.value}u`;
    case "doubleValue": {
      const s = String(c.constantKind.value);
      return s.includes(".") || s.includes("e") ? s : `${s}.0`;
    }
    case "stringValue":
      return JSON.stringify(c.constantKind.value);
    case "bytesValue":
      return `b"${Array.from(c.constantKind.value)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}"`;
    default:
      return "?";
  }
}
