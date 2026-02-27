import type { CheckedExpr, Type } from "../gen/google/api/expr/v1alpha1/checked_pb.js";
import {
  Type_PrimitiveType,
  Type_WellKnownType,
} from "../gen/google/api/expr/v1alpha1/checked_pb.js";
import type {
  Expr,
  Expr_Call,
  Expr_Comprehension,
  Expr_CreateList,
  Expr_CreateStruct,
  Expr_Select,
} from "../gen/google/api/expr/v1alpha1/syntax_pb.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface Adorner {
  getMetadata(expr: Expr): string;
}

/**
 * Produces the adorned debug string for a v1alpha1 Expr, following the same
 * format as cel-go's debug.ToAdornedDebugString / cel-spec's toDebugString.
 *
 * The default adorner emits nothing (plain structure only).
 * Pass KindAdorner.singleton to get `^#N:*type#` annotations on every node.
 */
export function toDebugString(expr: Expr, adorner: Adorner = EmptyAdorner.singleton): string {
  const w = new Writer(adorner);
  w.buffer(expr);
  return w.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Adorners
// ─────────────────────────────────────────────────────────────────────────────

class EmptyAdorner implements Adorner {
  static readonly singleton = new EmptyAdorner();
  private constructor() {}
  getMetadata(_expr: Expr): string {
    return "";
  }
}

/**
 * Annotates every node with `^#<id>:<GoTypeName>#`, mirroring cel-go's
 * KindAdorner but using google.api.expr.v1alpha1 type names.
 */
export class KindAdorner implements Adorner {
  static readonly singleton = new KindAdorner();
  private constructor() {}

  getMetadata(expr: Expr): string {
    return `^#${expr.id}:${getExprTypeName(expr)}#`;
  }
}

/**
 * Annotates every node with `^#<id>[<line>,<col>]#` using the positions map
 * from SourceInfo.
 */
export class LocationAdorner implements Adorner {
  constructor(
    private readonly positions: Record<string, number>,
    private readonly lineOffsets: number[],
  ) {}

  getMetadata(expr: Expr): string {
    const offset = this.positions[expr.id.toString()];
    if (offset === undefined) return "";
    const { line, col } = offsetToLineCol(offset, this.lineOffsets);
    return `^#${expr.id}[${line},${col}]#`;
  }
}

/**
 * Mirrors cel-go's SemanticAdorner / cel-es's SemanticAdorner.
 *
 * Annotates every node with `~<type>` (from the checkedExpr typeMap) and, for
 * idents and calls, `^<name-or-overloadId>` (from the referenceMap).
 *
 * Type names use CEL-standard short forms: `int`, `uint`, `bool`, `double`,
 * `string`, `bytes`, `null`, `timestamp`, `duration`, `dyn`, `!error!`.
 */
export class SemanticAdorner implements Adorner {
  constructor(private readonly checked: CheckedExpr) {}

  getMetadata(expr: Expr): string {
    let result = "";

    const t = this.checked.typeMap[expr.id.toString()];
    if (t !== undefined) {
      result += `~${formatType(t)}`;
    }

    switch (expr.exprKind.case) {
      case "identExpr":
      case "callExpr":
      case "selectExpr":
      case "listExpr":
      case "structExpr": {
        const ref = this.checked.referenceMap[expr.id.toString()];
        if (ref !== undefined) {
          if (ref.overloadId.length === 0) {
            result += `^${ref.name}`;
          } else {
            // Show only the single matched overload (checker resolves to one).
            // If somehow multiple remain, join with | like cel-go does.
            const ids = [...ref.overloadId].sort();
            result += `^${ids.join("|")}`;
          }
        }
        break;
      }
      default:
        break;
    }

    return result;
  }
}

/**
 * Format a type using the standard short names used in adorned debug
 * strings (cel-go / cel-es convention), NOT the proto-style names from
 * typeToString.
 */
export function formatType(t: Type | undefined): string {
  if (!t || !t.typeKind.case) return "dyn";
  switch (t.typeKind.case) {
    case "dyn":
      return "dyn";
    case "error":
      return "!error!";
    case "null":
      return "null";
    case "primitive":
      switch (t.typeKind.value) {
        case Type_PrimitiveType.BOOL:
          return "bool";
        case Type_PrimitiveType.INT64:
          return "int";
        case Type_PrimitiveType.UINT64:
          return "uint";
        case Type_PrimitiveType.DOUBLE:
          return "double";
        case Type_PrimitiveType.STRING:
          return "string";
        case Type_PrimitiveType.BYTES:
          return "bytes";
        default:
          return "dyn";
      }
    case "wellKnown":
      switch (t.typeKind.value) {
        case Type_WellKnownType.TIMESTAMP:
          return "timestamp";
        case Type_WellKnownType.DURATION:
          return "duration";
        case Type_WellKnownType.ANY:
          return "any";
        default:
          return "dyn";
      }
    case "messageType":
      return t.typeKind.value;
    case "listType":
      return `list(${formatType(t.typeKind.value.elemType as Type)})`;
    case "mapType":
      return `map(${formatType(t.typeKind.value.keyType as Type)}, ${formatType(t.typeKind.value.valueType as Type)})`;
    case "typeParam":
      return t.typeKind.value;
    default:
      return "dyn";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Writer
// ─────────────────────────────────────────────────────────────────────────────

class Writer {
  private content = "";
  private indent = 0;
  private lineStart = true;

  constructor(private readonly adorner: Adorner) {}

  buffer(expr: Expr | undefined): void {
    if (!expr) return;

    switch (expr.exprKind.case) {
      case "constExpr":
        this.append(formatConstant(expr));
        break;
      case "identExpr":
        this.append(expr.exprKind.value.name);
        break;
      case "selectExpr":
        this.appendSelect(expr.exprKind.value);
        break;
      case "callExpr":
        this.appendCall(expr.exprKind.value);
        break;
      case "listExpr":
        this.appendList(expr.exprKind.value);
        break;
      case "structExpr":
        this.appendStruct(expr.exprKind.value);
        break;
      case "comprehensionExpr":
        this.appendComprehension(expr.exprKind.value);
        break;
    }

    this.append(this.adorner.getMetadata(expr));
  }

  private appendSelect(sel: Expr_Select): void {
    this.buffer(sel.operand);
    this.append(".");
    this.append(sel.field);
    if (sel.testOnly) this.append("~test-only~");
  }

  private appendCall(call: Expr_Call): void {
    if (call.target !== undefined) {
      this.buffer(call.target);
      this.append(".");
    }
    this.append(call.function);
    this.append("(");
    if (call.args.length > 0) {
      this.addIndent();
      this.appendLine();
      for (let i = 0; i < call.args.length; i++) {
        if (i > 0) {
          this.append(",");
          this.appendLine();
        }
        this.buffer(call.args[i]);
      }
      this.removeIndent();
      this.appendLine();
    }
    this.append(")");
  }

  private appendList(list: Expr_CreateList): void {
    this.append("[");
    if (list.elements.length > 0) {
      this.addIndent();
      this.appendLine();
      for (let i = 0; i < list.elements.length; i++) {
        if (i > 0) {
          this.append(",");
          this.appendLine();
        }
        this.buffer(list.elements[i]);
      }
      this.removeIndent();
      this.appendLine();
    }
    this.append("]");
  }

  private appendStruct(struct: Expr_CreateStruct): void {
    this.append(struct.messageName ?? "");
    this.append("{");
    if (struct.entries.length > 0) {
      this.addIndent();
      this.appendLine();
      for (let i = 0; i < struct.entries.length; i++) {
        if (i > 0) {
          this.append(",");
          this.appendLine();
        }
        const entry = struct.entries[i];
        if (entry.keyKind.case === "fieldKey") {
          this.append(entry.keyKind.value);
        } else if (entry.keyKind.case === "mapKey") {
          this.buffer(entry.keyKind.value);
        }
        this.append(":");
        this.buffer(entry.value);
      }
      this.removeIndent();
      this.appendLine();
    }
    this.append("}");
  }

  private appendComprehension(c: Expr_Comprehension): void {
    this.append("__comprehension__(");
    this.addIndent();
    this.appendLine();
    this.append("// Variable");
    this.appendLine();
    this.append(c.iterVar);
    this.append(",");
    this.appendLine();
    this.append("// Target");
    this.appendLine();
    this.buffer(c.iterRange);
    this.append(",");
    this.appendLine();
    this.append("// Accumulator");
    this.appendLine();
    this.append(c.accuVar);
    this.append(",");
    this.appendLine();
    this.append("// Init");
    this.appendLine();
    this.buffer(c.accuInit);
    this.append(",");
    this.appendLine();
    this.append("// LoopCondition");
    this.appendLine();
    this.buffer(c.loopCondition);
    this.append(",");
    this.appendLine();
    this.append("// LoopStep");
    this.appendLine();
    this.buffer(c.loopStep);
    this.append(",");
    this.appendLine();
    this.append("// Result");
    this.appendLine();
    this.buffer(c.result);
    this.append(")");
    this.removeIndent();
  }

  private append(s: string): void {
    if (this.lineStart) {
      this.content += "  ".repeat(this.indent);
      this.lineStart = false;
    }
    this.content += s;
  }

  private appendLine(): void {
    this.content += "\n";
    this.lineStart = true;
  }

  private addIndent(): void {
    this.indent++;
  }

  private removeIndent(): void {
    if (--this.indent < 0) throw new Error("negative indent");
  }

  toString(): string {
    return this.content;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getExprTypeName(expr: Expr): string {
  switch (expr.exprKind.case) {
    case "constExpr": {
      const kind = expr.exprKind.value.constantKind.case;
      const map: Record<string, string> = {
        nullValue: "*expr.Constant_NullValue",
        boolValue: "*expr.Constant_BoolValue",
        int64Value: "*expr.Constant_Int64Value",
        uint64Value: "*expr.Constant_Uint64Value",
        doubleValue: "*expr.Constant_DoubleValue",
        stringValue: "*expr.Constant_StringValue",
        bytesValue: "*expr.Constant_BytesValue",
      };
      return map[kind ?? ""] ?? "*expr.Constant";
    }
    case "identExpr":
      return "*expr.Expr_IdentExpr";
    case "selectExpr":
      return "*expr.Expr_SelectExpr";
    case "callExpr":
      return "*expr.Expr_CallExpr";
    case "listExpr":
      return "*expr.Expr_ListExpr";
    case "structExpr":
      return "*expr.Expr_StructExpr";
    case "comprehensionExpr":
      return "*expr.Expr_ComprehensionExpr";
    default:
      return "*expr.Expr";
  }
}

function formatConstant(expr: Expr): string {
  if (expr.exprKind.case !== "constExpr") return "?";
  const c = expr.exprKind.value.constantKind;
  switch (c.case) {
    case "nullValue":
      return "null";
    case "boolValue":
      return c.value ? "true" : "false";
    case "int64Value":
      return c.value.toString();
    case "uint64Value":
      return `${c.value.toString()}u`;
    case "doubleValue": {
      const s = c.value.toString();
      // Match Go's strconv.FormatFloat default formatting
      return s.includes(".") || s.includes("e") ? s : `${s}.0`;
    }
    case "stringValue":
      return JSON.stringify(c.value);
    case "bytesValue":
      return `b"${Array.from(c.value)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}"`;
    default:
      return "?";
  }
}

function offsetToLineCol(offset: number, lineOffsets: number[]): { line: number; col: number } {
  if (lineOffsets.length === 0 || offset <= lineOffsets[0]) {
    return { line: 1, col: offset };
  }
  let lo = 0,
    hi = lineOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineOffsets[mid] < offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 2, col: offset - (lineOffsets[lo] + 1) };
}
