/**
 * Debug string utilities for CEL expressions and type-check errors.
 *
 * Produces output matching the CEL reference implementation format:
 *
 *   ERROR: <input>:1:24: undefined field 'undefined'
 *   | x.single_nested_message.undefined == x.undefined
 *   | .......................^
 *
 * Also includes a toExprString() for pretty-printing Expr trees.
 */

import type { CheckedExpr } from "../gen/google/api/expr/v1alpha1/checked_pb.js";
import type { Constant, Expr, SourceInfo } from "../gen/google/api/expr/v1alpha1/syntax_pb.js";
import type { SourcePosition, TypeCheckError } from "./checker.js";
import { offsetToLineCol } from "./parser.js";
import { typeToString } from "./types.js";

/**
 * Format a list of TypeCheckErrors into the CEL standard debug format:
 *
 *   ERROR: <input>:1:5: unknown identifier 'foo'
 *   | some expression here
 *   | ....^
 *
 * @param errors    The errors from typeCheck()
 * @param source    The original source string
 * @param sourceInfo The SourceInfo from ParsedExpr (for positions)
 */
export function toDebugString(
  errors: TypeCheckError[],
  source: string,
  sourceInfo: SourceInfo,
): string {
  if (errors.length === 0) return "";

  const lines = source.split("\n");
  const parts: string[] = [];

  for (const error of errors) {
    const offset = sourceInfo.positions[String(error.exprId)];
    if (offset === undefined) {
      parts.push(`ERROR: ${sourceInfo.location}: ${error.message}`);
      continue;
    }

    const { line, column } = offsetToLineCol(offset, sourceInfo.lineOffsets);
    // Location string: "file:line:col" — column is 0-based in v1alpha1, show 1-based for humans
    const location = `${sourceInfo.location}:${line}:${column + 1}`;

    const sourceLine = lines[line - 1] ?? "";
    // Build pointer line: dots up to column, then ^
    const pointer = `${".".repeat(column)}^`;

    parts.push(`ERROR: ${location}: ${error.message}\n` + `| ${sourceLine}\n` + `| ${pointer}`);
  }

  return parts.join("\n");
}

/**
 * Format a single SourcePosition into the CEL location string.
 */
export function formatPosition(pos: SourcePosition): string {
  return `${pos.location}:${pos.line}:${pos.column + 1}`;
}

/**
 * Convert an Expr tree back to a human-readable CEL expression string.
 * Useful for debugging ASTs.
 */
export function toExprString(expr: Expr, checkedExpr?: CheckedExpr): string {
  return exprToStr(expr, checkedExpr);
}

function exprToStr(expr: Expr, ce?: CheckedExpr): string {
  const kind = expr.exprKind;
  switch (kind.case) {
    case "constExpr":
      return constantToStr(kind.value);

    case "identExpr":
      return kind.value.name || "_";

    case "selectExpr": {
      const op = exprToStr(kind.value.operand as Expr, ce);
      const prefix = kind.value.testOnly ? "has(" : "";
      const suffix = kind.value.testOnly ? ")" : "";
      return `${prefix}${op}.${kind.value.field}${suffix}`;
    }

    case "callExpr": {
      const fn = kind.value.function;
      const args = kind.value.args.map((a) => exprToStr(a, ce));

      if (kind.value.target) {
        const target = exprToStr(kind.value.target, ce);
        // Method call
        return `${target}.${fn}(${args.join(", ")})`;
      }

      // Infix operators
      const INFIX: Record<string, string> = {
        "_&&_": "AND",
        "_||_": "OR",
        "_==_": "=",
        "_!=_": "!=",
        "_<_": "<",
        "_<=_": "<=",
        "_>_": ">",
        "_>=_": ">=",
        "_+_": "+",
        "_-_": "-",
        "_*_": "*",
        "_/_": "/",
        "_%_": "%",
      };
      if (fn in INFIX && args.length === 2) {
        return `(${args[0]} ${INFIX[fn]} ${args[1]})`;
      }
      if (fn === "@not" && args.length === 1) return `!${args[0]}`;
      if (fn === "@in" && args.length === 2) return `(${args[0]} : ${args[1]})`;

      return `${fn}(${args.join(", ")})`;
    }

    case "listExpr": {
      const elems = kind.value.elements.map((e) => exprToStr(e, ce));
      return `[${elems.join(", ")}]`;
    }

    case "structExpr": {
      const entries = kind.value.entries.map((e) => {
        const val = exprToStr(e.value as Expr, ce);
        if (e.keyKind.case === "fieldKey") return `${e.keyKind.value}: ${val}`;
        return `${exprToStr(e.keyKind.value as Expr, ce)}: ${val}`;
      });
      const name = kind.value.messageName;
      return name ? `${name}{${entries.join(", ")}}` : `{${entries.join(", ")}}`;
    }

    case "comprehensionExpr": {
      const c = kind.value;
      return (
        `__comprehension__(${c.iterVar}, ${exprToStr(c.iterRange as Expr, ce)}, ` +
        `${c.accuVar}, ${exprToStr(c.accuInit as Expr, ce)}, ` +
        `${exprToStr(c.loopCondition as Expr, ce)}, ${exprToStr(c.loopStep as Expr, ce)}, ` +
        `${exprToStr(c.result as Expr, ce)})`
      );
    }

    default:
      return "?";
  }
}

function constantToStr(c: Constant): string {
  switch (c.constantKind.case) {
    case "nullValue":
      return "null";
    case "boolValue":
      return c.constantKind.value ? "true" : "false";
    case "int64Value":
      return c.constantKind.value.toString();
    case "uint64Value":
      return `${c.constantKind.value}u`;
    case "doubleValue": {
      const s = c.constantKind.value.toString();
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

/**
 * Produce a detailed multi-line debug dump of a CheckedExpr:
 *   - The expression string
 *   - Type annotations for each node
 *   - Any references
 */
export function checkedExprDebugString(checkedExpr: CheckedExpr, source?: string): string {
  const lines: string[] = [];

  if (source) {
    lines.push(`// Source: ${source}`);
    lines.push(`// Parsed: ${toExprString(checkedExpr.expr as Expr, checkedExpr)}`);
    lines.push("");
  }

  lines.push("// Type map (expr_id → type):");
  for (const [id, type] of Object.entries(checkedExpr.typeMap)) {
    lines.push(`  #${id} → ${typeToString(type)}`);
  }

  if (Object.keys(checkedExpr.referenceMap).length > 0) {
    lines.push("\n// Reference map (expr_id → declaration):");
    for (const [id, ref] of Object.entries(checkedExpr.referenceMap)) {
      const ovStr = ref.overloadId.length > 0 ? ` [${ref.overloadId.join(", ")}]` : "";
      const valStr = ref.value ? ` = ${constantToStr(ref.value)}` : "";
      lines.push(`  #${id} → ${ref.name}${ovStr}${valStr}`);
    }
  }

  return lines.join("\n");
}

/**
 * Renders an Expr AST as a compact s-expression string, useful for
 * asserting tree shape without wading through protobuf object noise.
 *
 * Examples:
 *  _&&_(_||_(_==_(status,"ACTIVE"), _==_(status,"PENDING")), @not(::(labels,deprecated)))
 *  _==_(a, "hello")
 *  ident(x)
 */
export function prettyExpr(expr: Expr | undefined): string {
  if (!expr) return "undefined";
  switch (expr.exprKind.case) {
    case "identExpr":
      return `ident(${expr.exprKind.value.name || "_"})`;
    case "constExpr": {
      const c = expr.exprKind.value.constantKind;
      switch (c.case) {
        case "stringValue":
          return JSON.stringify(c.value);
        case "int64Value":
          return String(c.value);
        case "uint64Value":
          return `${c.value}u`;
        case "doubleValue":
          return String(c.value);
        case "boolValue":
          return String(c.value);
        case "nullValue":
          return "null";
        default:
          return "const(?)";
      }
    }
    case "selectExpr": {
      const sel = expr.exprKind.value;
      return `select(${prettyExpr(sel.operand)}.${sel.field})`;
    }
    case "callExpr": {
      const call = expr.exprKind.value;
      const fn = call.function;
      const parts = [
        ...(call.target ? [prettyExpr(call.target)] : []),
        ...call.args.map(prettyExpr),
      ];
      return `${fn}(${parts.join(", ")})`;
    }
    case "listExpr":
      return `[${expr.exprKind.value.elements.map(prettyExpr).join(", ")}]`;
    default:
      return `?(${expr.exprKind.case})`;
  }
}
