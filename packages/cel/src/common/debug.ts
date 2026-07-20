import type { Constant } from "../gen/cel/expr/syntax_pb.js";
import {
  type CallExpr,
  type ComprehensionExpr,
  type ConstantValue,
  type Expr,
  ExprKind,
  type ListExpr,
  type MapExpr,
  type SelectExpr,
  type StructExpr,
} from "./ast/index.js";

/**
 * Adorner returns debug metadata that will be tacked on to the string representation of an expression.
 */
export interface Adorner {
  /**
   * GetMetadata returns metadata for the input context.
   */
  getMetadata(ctx: unknown): string;
}

/**
 * Writer buffers expressions into an internal string representation.
 */
export interface Writer {
  /**
   * Buffer pushes an expression into the internal queue of expressions to write.
   */
  buffer(expr: Expr | undefined): void;

  /**
   * String returns the rendered debug string.
   */
  toString(): string;
}

class EmptyDebugAdorner implements Adorner {
  public getMetadata(): string {
    return "";
  }
}

const emptyAdorner: Adorner = new EmptyDebugAdorner();

/**
 * ToDebugString gives the unadorned string representation of the Expr.
 */
export function toDebugString(expr: Expr): string {
  return toAdornedDebugString(expr, emptyAdorner);
}

/**
 * ToAdornedDebugString gives the adorned string representation of the Expr.
 */
export function toAdornedDebugString(expr: Expr, adorner: Adorner): string {
  const writer = debugWriter(adorner);
  writer.buffer(expr);
  return writer.toString();
}

/**
 * ToDebugStringWithIds returns a string representation with AST node IDs.
 */
export function toDebugStringWithIds(expr: Expr): string {
  return toAdornedDebugString(expr, new IdAdorner());
}

class DebugWriter implements Writer {
  private readonly bufferValue: string[] = [];
  private indent = 0;
  private lineStart = true;

  constructor(private readonly adorner: Adorner) {}

  public buffer(expr: Expr | undefined): void {
    if (!expr) {
      return;
    }
    switch (expr.kind()) {
      case ExprKind.Literal:
        this.append(formatLiteral(expr.asLiteral()));
        break;
      case ExprKind.Ident:
        this.append(expr.asIdent() ?? "");
        break;
      case ExprKind.Select:
        this.appendSelect(expr.asSelect());
        break;
      case ExprKind.Call:
        this.appendCall(expr.asCall());
        break;
      case ExprKind.List:
        this.appendList(expr.asList());
        break;
      case ExprKind.Map:
        this.appendMap(expr.asMap());
        break;
      case ExprKind.Struct:
        this.appendStruct(expr.asStruct());
        break;
      case ExprKind.Comprehension:
        this.appendComprehension(expr.asComprehension());
        break;
      default:
        break;
    }
    this.adorn(expr);
  }

  public toString(): string {
    return this.bufferValue.join("");
  }

  private appendSelect(select: SelectExpr | undefined): void {
    if (!select) {
      return;
    }
    this.buffer(select.operand());
    this.append(".");
    this.append(select.fieldName());
    if (select.isTestOnly()) {
      this.append("~test-only~");
    }
  }

  private appendCall(call: CallExpr | undefined): void {
    if (!call) {
      return;
    }
    if (call.isMemberFunction()) {
      this.buffer(call.target());
      this.append(".");
    }
    this.append(call.functionName());
    this.append("(");
    if (call.args().length > 0) {
      this.addIndent();
      this.appendLine();
      for (const [index, arg] of call.args().entries()) {
        if (index > 0) {
          this.append(",");
          this.appendLine();
        }
        this.buffer(arg);
      }
      this.removeIndent();
      this.appendLine();
    }
    this.append(")");
  }

  private appendList(list: ListExpr | undefined): void {
    if (!list) {
      return;
    }
    this.append("[");
    if (list.elements().length > 0) {
      this.appendLine();
      this.addIndent();
      for (const [index, element] of list.elements().entries()) {
        if (index > 0) {
          this.append(",");
          this.appendLine();
        }
        this.buffer(element);
      }
      this.removeIndent();
      this.appendLine();
    }
    this.append("]");
  }

  private appendStruct(structExpr: StructExpr | undefined): void {
    if (!structExpr) {
      return;
    }
    this.append(structExpr.typeName());
    this.append("{");
    if (structExpr.fields().length > 0) {
      this.appendLine();
      this.addIndent();
      for (const [index, entry] of structExpr.fields().entries()) {
        const field = entry.asStructField();
        if (!field) {
          continue;
        }
        if (index > 0) {
          this.append(",");
          this.appendLine();
        }
        if (field.isOptional()) {
          this.append("?");
        }
        this.append(field.name());
        this.append(":");
        this.buffer(field.value());
        this.adorn(entry);
      }
      this.removeIndent();
      this.appendLine();
    }
    this.append("}");
  }

  private appendMap(mapExpr: MapExpr | undefined): void {
    if (!mapExpr) {
      return;
    }
    this.append("{");
    if (mapExpr.size() > 0) {
      this.appendLine();
      this.addIndent();
      for (const [index, entryExpr] of mapExpr.entries().entries()) {
        const entry = entryExpr.asMapEntry();
        if (!entry) {
          continue;
        }
        if (index > 0) {
          this.append(",");
          this.appendLine();
        }
        if (entry.isOptional()) {
          this.append("?");
        }
        this.buffer(entry.key());
        this.append(":");
        this.buffer(entry.value());
        this.adorn(entryExpr);
      }
      this.removeIndent();
      this.appendLine();
    }
    this.append("}");
  }

  private appendComprehension(comprehension: ComprehensionExpr | undefined): void {
    if (!comprehension) {
      return;
    }
    this.append("__comprehension__(");
    this.addIndent();
    this.appendLine();
    this.append("// Variable");
    this.appendLine();
    this.append(comprehension.iterVar());
    this.append(",");
    this.appendLine();
    if (comprehension.iterVar2() !== "") {
      this.append(comprehension.iterVar2());
      this.append(",");
      this.appendLine();
    }
    this.append("// Target");
    this.appendLine();
    this.buffer(comprehension.iterRange());
    this.append(",");
    this.appendLine();
    this.append("// Accumulator");
    this.appendLine();
    this.append(comprehension.accuVar());
    this.append(",");
    this.appendLine();
    this.append("// Init");
    this.appendLine();
    this.buffer(comprehension.accuInit());
    this.append(",");
    this.appendLine();
    this.append("// LoopCondition");
    this.appendLine();
    this.buffer(comprehension.loopCondition());
    this.append(",");
    this.appendLine();
    this.append("// LoopStep");
    this.appendLine();
    this.buffer(comprehension.loopStep());
    this.append(",");
    this.appendLine();
    this.append("// Result");
    this.appendLine();
    this.buffer(comprehension.result());
    this.append(")");
    this.removeIndent();
  }

  private append(text: string): void {
    this.doIndent();
    this.bufferValue.push(text);
  }

  private doIndent(): void {
    if (!this.lineStart) {
      return;
    }
    this.lineStart = false;
    this.bufferValue.push("  ".repeat(this.indent));
  }

  private adorn(expr: unknown): void {
    this.append(this.adorner.getMetadata(expr));
  }

  private appendLine(): void {
    this.bufferValue.push("\n");
    this.lineStart = true;
  }

  private addIndent(): void {
    this.indent += 1;
  }

  private removeIndent(): void {
    this.indent -= 1;
    if (this.indent < 0) {
      throw new Error("negative indent");
    }
  }
}

class IdAdorner implements Adorner {
  public getMetadata(elem: unknown): string {
    if (!elem || typeof elem !== "object" || !("id" in elem)) {
      return "";
    }
    const value = elem as { id(): number };
    return `@id:${value.id()} `;
  }
}

function debugWriter(adorner: Adorner): DebugWriter {
  return new DebugWriter(adorner);
}

function formatLiteral(value: ConstantValue | undefined): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return `${value}`;
    case "bigint":
      return `${value}`;
    case "number":
      return `${value}`;
    case "string":
      return formatStringLiteral(value);
    case "undefined":
      return "";
    default:
      if (value instanceof Uint8Array) {
        return `b${JSON.stringify(new TextDecoder().decode(value))}`;
      }
      if (isConstant(value)) {
        return formatProtoConstant(value);
      }
      throw new Error("unknown constant type");
  }
}

function isConstant(value: ConstantValue): value is Constant {
  return typeof value === "object" && value !== null && "$typeName" in value;
}

function formatProtoConstant(value: Constant): string {
  switch (value.constantKind.case) {
    case "nullValue":
      return "null";
    case "boolValue":
      return `${value.constantKind.value}`;
    case "int64Value":
      return `${value.constantKind.value}`;
    case "uint64Value":
      return `${value.constantKind.value}u`;
    case "doubleValue":
      return `${value.constantKind.value}`;
    case "stringValue":
      return formatStringLiteral(value.constantKind.value);
    case "bytesValue":
      return `b${JSON.stringify(new TextDecoder().decode(value.constantKind.value))}`;
    default:
      return "";
  }
}

function formatStringLiteral(value: string): string {
  let out = `"`;
  for (const char of value) {
    switch (char) {
      case "\u0007":
        out += "\\a";
        break;
      case "\b":
        out += "\\b";
        break;
      case "\f":
        out += "\\f";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      case "\u000b":
        out += "\\v";
        break;
      case `"`:
        out += '\\"';
        break;
      case "\\":
        out += "\\\\";
        break;
      default: {
        const point = char.codePointAt(0)!;
        if (point < 0x20 || point === 0x7f) {
          out += `\\u${point.toString(16).padStart(4, "0")}`;
        } else {
          out += char;
        }
      }
    }
  }
  out += `"`;
  return out;
}
