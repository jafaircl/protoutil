import {
  type AST,
  type ConstantValue,
  type Expr,
  ExprKind,
  protoToExpr,
  type SourceInfo,
  sourceInfo,
} from "../common/ast/index.js";
import * as operators from "../common/operators.js";
import type { Constant, Expr as ProtoExpr } from "../gen/cel/expr/syntax_pb.js";

const IDENTIFIER_PART = /^[A-Za-z_][0-9A-Za-z_]*$/;
const DEFAULT_WRAP_ON_COLUMN = 80;
const DEFAULT_WRAP_AFTER_COLUMN_LIMIT = true;
const DEFAULT_OPERATORS_TO_WRAP_ON = [operators.LogicalAnd, operators.LogicalOr] as const;

/**
 * UnparserConfig configures CEL source formatting during unparsing.
 */
export interface UnparserConfig {
  /**
   * Wraps configured operators once the current line length reaches this column.
   */
  wrapOnColumn?: number;
  /**
   * Replaces the default wrap operators with the provided operator symbols.
   */
  operatorsToWrapOn?: string[];
  /**
   * Places wrapped operators after the column break when true, or before it when false.
   */
  wrapAfterColumnLimit?: boolean;
}

/**
 * ResolvedUnparserConfig stores validated unparser settings.
 */
export interface ResolvedUnparserConfig {
  /**
   * Wrap column limit used for configured operators.
   */
  wrapOnColumn: number;
  /**
   * Set of operators that trigger line wrapping.
   */
  operatorsToWrapOn: Map<string, true>;
  /**
   * Controls whether wrapped operators stay on the previous line.
   */
  wrapAfterColumnLimit: boolean;
}

/**
 * UnparseResult contains either the rendered CEL source or the error encountered while producing it.
 */
export interface UnparseResult {
  source?: string;
  error?: Error;
}

/**
 * Unparser reconstructs human-readable CEL source text from an expression tree.
 */
export class Unparser {
  private readonly config: ResolvedUnparserConfig;

  /**
   * Creates an unparser using validated formatting options.
   */
  constructor(config: UnparserConfig = {}) {
    this.config = unparserConfig(config);
  }

  /**
   * Unparses an AST or expression into CEL source text.
   */
  public unparse(input: AST | Expr | ProtoExpr, info?: SourceInfo): string {
    const [expr, sourceInfo] = normalizeUnparseInput(input, info);
    const writer = new UnparseWriter(sourceInfo, this.config);
    writer.visit(expr);
    return writer.toString();
  }
}

/**
 * unparserConfig validates and resolves user-provided unparser settings.
 */
export function unparserConfig(config: UnparserConfig = {}): ResolvedUnparserConfig {
  const wrapOnColumn = config.wrapOnColumn ?? DEFAULT_WRAP_ON_COLUMN;
  if (wrapOnColumn < 1) {
    throw new Error(
      `Invalid unparser option. Wrap column value must be greater than or equal to 1. Got ${wrapOnColumn} instead`,
    );
  }

  const operatorsToWrapOn = new Map<string, true>();
  for (const operator of config.operatorsToWrapOn ?? DEFAULT_OPERATORS_TO_WRAP_ON) {
    const [, found] = operators.findReverse(operator);
    if (!found) {
      throw new Error(`Invalid unparser option. Unsupported operator: ${operator}`);
    }
    if (operators.arity(operator) < 2) {
      throw new Error(`Invalid unparser option. Unary operators are unsupported: ${operator}`);
    }
    operatorsToWrapOn.set(operator, true);
  }

  return {
    wrapOnColumn,
    operatorsToWrapOn,
    wrapAfterColumnLimit: config.wrapAfterColumnLimit ?? DEFAULT_WRAP_AFTER_COLUMN_LIMIT,
  };
}

/**
 * unparse provides an idiomatic top-level helper for AST, Expr, and protobuf Expr values.
 */
export function unparse(
  input: AST | Expr | ProtoExpr,
  infoOrConfig?: SourceInfo | UnparserConfig,
  config?: UnparserConfig,
): string {
  if (isSourceInfoLike(infoOrConfig)) {
    return new Unparser(config).unparse(input, infoOrConfig);
  }
  return new Unparser(infoOrConfig).unparse(input);
}

/**
 * tryUnparse provides a non-throwing companion to `unparse()`.
 */
export function tryUnparse(
  input: AST | Expr | ProtoExpr,
  infoOrConfig?: SourceInfo | UnparserConfig,
  config?: UnparserConfig,
): UnparseResult {
  try {
    return { source: unparse(input, infoOrConfig as SourceInfo | UnparserConfig, config) };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * normalizeUnparseInput adapts AST, Expr, and protobuf Expr inputs to the common unparser surface.
 */
function normalizeUnparseInput(
  input: AST | Expr | ProtoExpr,
  info?: SourceInfo,
): [Expr, SourceInfo] {
  if (isAstLike(input)) {
    return [input.expr(), input.sourceInfo()];
  }
  if (isExprLike(input)) {
    return [input, info ?? sourceInfo()];
  }
  return [protoToExpr(input), info ?? sourceInfo()];
}

/**
 * maybeQuoteField quotes field names that are not valid CEL selectors.
 */
function maybeQuoteField(field: string): string {
  if (!IDENTIFIER_PART.test(field) || field === "in") {
    return `\`${field}\``;
  }
  return field;
}

/**
 * isLeftRecursive mirrors cel-go's left-recursive operator rule used for parenthesization.
 */
function isLeftRecursive(operator: string): boolean {
  return operator !== operators.LogicalAnd && operator !== operators.LogicalOr;
}

/**
 * isSamePrecedence reports whether the expression is a call with the same precedence as the operator.
 */
function isSamePrecedence(operator: string, expr: Expr): boolean {
  if (expr.kind() !== ExprKind.Call) {
    return false;
  }
  return (
    operators.precedence(operator) === operators.precedence(expr.asCall()?.functionName() ?? "")
  );
}

/**
 * isLowerPrecedence reports whether the operator binds more weakly than the expression call.
 */
function isLowerPrecedence(operator: string, expr: Expr): boolean {
  const call = expr.asCall();
  if (!call) {
    return false;
  }
  return operators.precedence(operator) < operators.precedence(call.functionName());
}

/**
 * isComplexOperator reports whether the expression is a binary-or-higher call.
 */
function isComplexOperator(expr: Expr): boolean {
  const call = expr.asCall();
  return expr.kind() === ExprKind.Call && (call?.args().length ?? 0) >= 2;
}

/**
 * isComplexOperatorWithRespectTo mirrors cel-go's precedence test for nested binary expressions.
 */
function isComplexOperatorWithRespectTo(operator: string, expr: Expr): boolean {
  const call = expr.asCall();
  if (expr.kind() !== ExprKind.Call || (call?.args().length ?? 0) < 2) {
    return false;
  }
  return isLowerPrecedence(operator, expr);
}

/**
 * isBinaryOrTernaryOperator reports whether the expression is a binary operator or ternary conditional.
 */
function isBinaryOrTernaryOperator(expr: Expr): boolean {
  const call = expr.asCall();
  if (expr.kind() !== ExprKind.Call || !call || call.args().length < 2) {
    return false;
  }
  const [, isBinary] = operators.findReverseBinaryOperator(call.functionName());
  return isBinary || isSamePrecedence(operators.Conditional, expr);
}

/**
 * bytesToOctets renders byte literals using three-digit octal escapes like cel-go.
 */
function bytesToOctets(value: Uint8Array): string {
  return [...value].map((byte) => `\\${byte.toString(8).padStart(3, "0")}`).join("");
}

/**
 * normalizeStoredBytes matches the local parser's bytes-literal storage so unparsing round-trips.
 */
function normalizeStoredBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

/**
 * formatStringLiteral renders CEL strings using double quotes and CEL-compatible escapes.
 */
function formatStringLiteral(value: string): string {
  let out = '"';
  for (const char of value) {
    switch (char) {
      case '"':
        out += '\\"';
        break;
      case "\\":
        out += "\\\\";
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
      case "\v":
        out += "\\v";
        break;
      default: {
        const codePoint = char.codePointAt(0) ?? 0;
        if (codePoint < 0x20) {
          out += `\\u${codePoint.toString(16).padStart(4, "0")}`;
        } else {
          out += char;
        }
      }
    }
  }
  return `${out}"`;
}

/**
 * formatExponent pads CEL scientific exponents the same way cel-go prints `%g`.
 */
function formatExponent(text: string): string {
  const match = /^(.+)e([+-]?)(\d+)$/.exec(text);
  if (!match) {
    return text;
  }
  const sign = match[2] === "-" ? "-" : "+";
  return `${match[1]}e${sign}${match[3].padStart(2, "0")}`;
}

/**
 * trimExponentialMantissa removes trailing zeroes so the exponential mantissa stays minimal.
 */
function trimExponentialMantissa(text: string): string {
  const [mantissa, exponent] = text.split("e");
  if (!mantissa || exponent === undefined) {
    return text;
  }
  const trimmedMantissa = mantissa.includes(".")
    ? mantissa.replace(/(?:\.0+|(\.\d*?[1-9]))0+$/, "$1")
    : mantissa;
  return `${trimmedMantissa}e${exponent}`;
}

/**
 * formatDoubleLiteral approximates cel-go's `%g` formatting rules for CEL double literals.
 */
function formatDoubleLiteral(value: number): string {
  const abs = Math.abs(value);
  const useScientific = abs !== 0 && (abs < 1e-4 || abs >= 1e6);
  const rendered = useScientific
    ? formatExponent(trimExponentialMantissa(value.toExponential()))
    : value.toString();
  if (!/[.eE]/.test(rendered)) {
    return `${rendered}.0`;
  }
  return rendered;
}

/**
 * formatConstantLiteral converts a CEL constant value into source text.
 */
function formatConstantLiteral(value: ConstantValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    return formatDoubleLiteral(value);
  }
  if (typeof value === "string") {
    return formatStringLiteral(value);
  }
  if (value instanceof Uint8Array) {
    return `b"${bytesToOctets(normalizeStoredBytes(value))}"`;
  }
  return formatProtoConstant(value);
}

/**
 * formatProtoConstant handles literal values preserved in generated protobuf form.
 */
function formatProtoConstant(value: Constant): string {
  switch (value.constantKind.case) {
    case "nullValue":
      return "null";
    case "boolValue":
      return value.constantKind.value ? "true" : "false";
    case "int64Value":
      return value.constantKind.value.toString();
    case "uint64Value":
      return `${value.constantKind.value.toString()}u`;
    case "doubleValue":
      return formatDoubleLiteral(value.constantKind.value);
    case "stringValue":
      return formatStringLiteral(value.constantKind.value);
    case "bytesValue":
      return `b"${bytesToOctets(normalizeStoredBytes(value.constantKind.value))}"`;
    default:
      throw new Error("unsupported constant");
  }
}

/**
 * isAstLike narrows objects that expose the local AST surface.
 */
function isAstLike(value: unknown): value is AST {
  return typeof value === "object" && value !== null && "expr" in value && "sourceInfo" in value;
}

/**
 * isExprLike narrows objects that expose the local Expr surface.
 */
function isExprLike(value: unknown): value is Expr {
  return typeof value === "object" && value !== null && "kind" in value && "toProto" in value;
}

/**
 * isSourceInfoLike narrows objects that expose the local SourceInfo surface.
 */
function isSourceInfoLike(value: unknown): value is SourceInfo {
  return typeof value === "object" && value !== null && "getMacroCall" in value;
}

/**
 * UnparseWriter mirrors cel-go's visitor-style unparser and owns the output buffer.
 */
class UnparseWriter {
  private readonly parts: string[] = [];
  private lastWrappedIndex = 0;

  /**
   * Binds the writer to source info and resolved formatting options.
   */
  constructor(
    private readonly info: SourceInfo,
    private readonly config: ResolvedUnparserConfig,
  ) {}

  /**
   * toString returns the accumulated CEL source text.
   */
  public toString(): string {
    return this.parts.join("");
  }

  /**
   * visit walks the expression tree and appends CEL source text for each node.
   */
  public visit(expr: Expr): void {
    if (this.visitMaybeMacroCall(expr)) {
      return;
    }
    if (expr.kind() === ExprKind.Unspecified) {
      throw new Error("unsupported expression");
    }
    switch (expr.kind()) {
      case ExprKind.Call:
        this.visitCall(expr);
        return;
      case ExprKind.Literal:
        this.visitConst(expr);
        return;
      case ExprKind.Ident:
        this.visitIdent(expr);
        return;
      case ExprKind.List:
        this.visitList(expr);
        return;
      case ExprKind.Map:
        this.visitStructMap(expr);
        return;
      case ExprKind.Select:
        this.visitSelect(expr);
        return;
      case ExprKind.Struct:
        this.visitStructMessage(expr);
        return;
      default:
        throw new Error("unsupported expression");
    }
  }

  /**
   * append writes raw text to the output buffer.
   */
  private append(text: string): void {
    this.parts.push(text);
  }

  /**
   * length returns the current output length.
   */
  private length(): number {
    return this.toString().length;
  }

  /**
   * visitMaybeMacroCall restores macro source text when source info preserved the original call.
   */
  private visitMaybeMacroCall(expr: Expr): boolean {
    const [call, found] = this.info.getMacroCall(expr.id());
    if (!found || !call) {
      return false;
    }
    this.visit(call);
    return true;
  }

  /**
   * visitMaybeNested adds parentheses only when they are required for semantics.
   */
  private visitMaybeNested(expr: Expr, nested: boolean): void {
    if (nested) {
      this.append("(");
    }
    this.visit(expr);
    if (nested) {
      this.append(")");
    }
  }

  /**
   * visitCall dispatches operator calls and ordinary function calls.
   */
  private visitCall(expr: Expr): void {
    const call = expr.asCall();
    if (!call) {
      throw new Error("unsupported expression");
    }
    switch (call.functionName()) {
      case operators.Conditional:
        this.visitCallConditional(expr);
        return;
      case operators.OptSelect:
        this.visitOptionalSelect(expr);
        return;
      case operators.Index:
        this.visitCallIndex(expr, "[");
        return;
      case operators.OptIndex:
        this.visitCallIndex(expr, "[?");
        return;
      case operators.LogicalNot:
      case operators.Negate:
        this.visitCallUnary(expr);
        return;
      case operators.Add:
      case operators.Divide:
      case operators.Equals:
      case operators.Greater:
      case operators.GreaterEquals:
      case operators.In:
      case operators.Less:
      case operators.LessEquals:
      case operators.LogicalAnd:
      case operators.LogicalOr:
      case operators.Modulo:
      case operators.Multiply:
      case operators.NotEquals:
      case operators.OldIn:
      case operators.Subtract:
        this.visitCallBinary(expr);
        return;
      default:
        this.visitCallFunction(expr);
    }
  }

  /**
   * visitCallBinary prints binary operators while preserving precedence and associativity.
   */
  private visitCallBinary(expr: Expr): void {
    const call = expr.asCall();
    const args = call?.args() ?? [];
    if (!call || args.length < 2) {
      throw new Error("unsupported expression");
    }
    const operator = call.functionName();
    const [displayName, found] = operators.findReverseBinaryOperator(operator);
    if (!found) {
      throw new Error(`cannot unmangle operator: ${operator}`);
    }

    // cel-go only builds binary trees for these operators by default, but we support
    // variadic shapes as the local parser can optionally emit them.
    this.visitMaybeNested(args[0]!, isComplexOperatorWithRespectTo(operator, args[0]!));
    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index]!;
      let nested = isComplexOperatorWithRespectTo(operator, arg);
      if (!nested && isLeftRecursive(operator)) {
        nested = isSamePrecedence(operator, arg);
      }
      this.writeOperatorWithWrapping(operator, displayName);
      this.visitMaybeNested(arg, nested);
    }
  }

  /**
   * visitCallConditional prints ternary expressions, parenthesizing nested conditionals as needed.
   */
  private visitCallConditional(expr: Expr): void {
    const args = expr.asCall()?.args() ?? [];
    if (args.length !== 3) {
      throw new Error("unsupported expression");
    }

    let nested = isSamePrecedence(operators.Conditional, args[0]!) || isComplexOperator(args[0]!);
    this.visitMaybeNested(args[0]!, nested);
    this.writeOperatorWithWrapping(operators.Conditional, "?");

    nested = isSamePrecedence(operators.Conditional, args[1]!) || isComplexOperator(args[1]!);
    this.visitMaybeNested(args[1]!, nested);
    this.append(" : ");

    nested = isSamePrecedence(operators.Conditional, args[2]!) || isComplexOperator(args[2]!);
    this.visitMaybeNested(args[2]!, nested);
  }

  /**
   * visitCallFunction prints ordinary global and receiver-style function calls.
   */
  private visitCallFunction(expr: Expr): void {
    const call = expr.asCall();
    if (!call) {
      throw new Error("unsupported expression");
    }
    if (call.isMemberFunction()) {
      this.visitMaybeNested(call.target(), isBinaryOrTernaryOperator(call.target()));
      this.append(".");
    }
    this.append(call.functionName());
    this.append("(");
    for (const [index, arg] of call.args().entries()) {
      this.visit(arg);
      if (index < call.args().length - 1) {
        this.append(", ");
      }
    }
    this.append(")");
  }

  /**
   * visitCallIndex prints index and optional-index expressions.
   */
  private visitCallIndex(expr: Expr, opener: "[" | "[?"): void {
    const args = expr.asCall()?.args() ?? [];
    if (args.length !== 2) {
      throw new Error("unsupported expression");
    }
    this.visitMaybeNested(args[0]!, isBinaryOrTernaryOperator(args[0]!));
    this.append(opener);
    this.visit(args[1]!);
    this.append("]");
  }

  /**
   * visitCallUnary prints unary operators and parenthesizes complex operands.
   */
  private visitCallUnary(expr: Expr): void {
    const call = expr.asCall();
    const args = call?.args() ?? [];
    if (!call || args.length !== 1) {
      throw new Error("unsupported expression");
    }
    const [displayName, found] = operators.findReverse(call.functionName());
    if (!found) {
      throw new Error(`cannot unmangle operator: ${call.functionName()}`);
    }
    this.append(displayName);
    this.visitMaybeNested(args[0]!, isComplexOperator(args[0]!));
  }

  /**
   * visitConst prints CEL literal constants.
   */
  private visitConst(expr: Expr): void {
    const value = expr.asLiteral();
    if (value === undefined) {
      throw new Error("unsupported constant");
    }
    this.append(formatConstantLiteral(value));
  }

  /**
   * visitIdent prints identifier expressions.
   */
  private visitIdent(expr: Expr): void {
    this.append(expr.asIdent() ?? "");
  }

  /**
   * visitList prints list literals, including optional element markers.
   */
  private visitList(expr: Expr): void {
    const list = expr.asList();
    if (!list) {
      throw new Error("unsupported expression");
    }
    this.append("[");
    for (const [index, element] of list.elements().entries()) {
      if (list.isOptional(index)) {
        this.append("?");
      }
      this.visit(element);
      if (index < list.elements().length - 1) {
        this.append(", ");
      }
    }
    this.append("]");
  }

  /**
   * visitOptionalSelect prints `.?field` expressions represented as calls in the AST.
   */
  private visitOptionalSelect(expr: Expr): void {
    const args = expr.asCall()?.args() ?? [];
    if (args.length !== 2) {
      throw new Error("unsupported expression");
    }
    const field = args[1]?.asLiteral();
    if (typeof field !== "string") {
      throw new Error("unsupported expression");
    }
    this.visitSelectInternal(args[0]!, false, ".?", field);
  }

  /**
   * visitSelect prints field selection and `has()` macro forms.
   */
  private visitSelect(expr: Expr): void {
    const select = expr.asSelect();
    if (!select) {
      throw new Error("unsupported expression");
    }
    this.visitSelectInternal(select.operand(), select.isTestOnly(), ".", select.fieldName());
  }

  /**
   * visitSelectInternal shares the selection rendering logic between ordinary and optional selects.
   */
  private visitSelectInternal(
    operand: Expr,
    testOnly: boolean,
    operatorText: "." | ".?",
    field: string,
  ): void {
    // `has(x.y)` is stored as a presence-test select and should round-trip as the macro call.
    if (testOnly) {
      this.append("has(");
    }
    this.visitMaybeNested(operand, !testOnly && isBinaryOrTernaryOperator(operand));
    this.append(operatorText);
    this.append(maybeQuoteField(field));
    if (testOnly) {
      this.append(")");
    }
  }

  /**
   * visitStructMessage prints protobuf-style message construction expressions.
   */
  private visitStructMessage(expr: Expr): void {
    const structExpr = expr.asStruct();
    if (!structExpr) {
      throw new Error("unsupported expression");
    }
    this.append(structExpr.typeName());
    this.append("{");
    for (const [index, fieldExpr] of structExpr.fields().entries()) {
      const field = fieldExpr.asStructField();
      const value = field?.value();
      if (!field || !value) {
        throw new Error("unsupported expression");
      }
      if (field.isOptional()) {
        this.append("?");
      }
      this.append(maybeQuoteField(field.name()));
      this.append(": ");
      this.visit(value);
      if (index < structExpr.fields().length - 1) {
        this.append(", ");
      }
    }
    this.append("}");
  }

  /**
   * visitStructMap prints map literals using entry order from the AST.
   */
  private visitStructMap(expr: Expr): void {
    const mapExpr = expr.asMap();
    if (!mapExpr) {
      throw new Error("unsupported expression");
    }
    this.append("{");
    for (const [index, entryExpr] of mapExpr.entries().entries()) {
      const entry = entryExpr.asMapEntry();
      const key = entry?.key();
      const value = entry?.value();
      if (!entry || !key || !value) {
        throw new Error("unsupported expression");
      }
      if (entry.isOptional()) {
        this.append("?");
      }
      this.visit(key);
      this.append(": ");
      this.visit(value);
      if (index < mapExpr.entries().length - 1) {
        this.append(", ");
      }
    }
    this.append("}");
  }

  /**
   * writeOperatorWithWrapping inserts spaces or line breaks for configured operators.
   */
  private writeOperatorWithWrapping(operator: string, displayName: string): void {
    const wrapOperatorExists = this.config.operatorsToWrapOn.has(operator);
    const lineLength = this.length() - this.lastWrappedIndex + operator.length;

    if (wrapOperatorExists && lineLength >= this.config.wrapOnColumn) {
      this.lastWrappedIndex = this.length();
      // cel-go supports wrapping either after the operator or before it depending on config.
      if (this.config.wrapAfterColumnLimit) {
        this.append(` ${displayName}\n`);
      } else {
        this.append(`\n${displayName} `);
      }
      return;
    }
    this.append(` ${displayName} `);
  }
}
