import { create } from "@bufbuild/protobuf";
import {
  BOOL,
  type CheckedExpr,
  type Expr,
  outputType,
  TypeSchema,
  typeToString,
} from "@protoutil/aip/filtering";
import { durationNanos } from "@protoutil/core/wkt";
import { TranslationError } from "./errors";

/**
 * Asserts that the checked expression evaluates to a boolean type.
 * Throws a {@link TranslationError} if the output type is not `BOOL`.
 */
export function assertBoolOutput(checkedExpr: CheckedExpr): void {
  const type = outputType(checkedExpr);
  if (
    !type ||
    type.typeKind?.case !== "primitive" ||
    type.typeKind.value !== BOOL.typeKind?.value
  ) {
    throw new TranslationError(
      `filter expression must evaluate to a boolean, got ${typeToString(create(TypeSchema, type))}`,
    );
  }
}

export function quoteIdent(name: string, quoteStyle = `"`): string {
  const escaped = name.replaceAll(quoteStyle, quoteStyle + quoteStyle);
  return `${quoteStyle}${escaped}${quoteStyle}`;
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

export function isStringConst(expr: Expr): expr is Expr & {
  exprKind: { case: "constExpr"; value: { constantKind: { case: "stringValue"; value: string } } };
} {
  return (
    expr.exprKind.case === "constExpr" && expr.exprKind.value.constantKind.case === "stringValue"
  );
}

export function isNullConst(expr: Expr): expr is Expr & {
  exprKind: { case: "constExpr"; value: { constantKind: { case: "nullValue"; value: unknown } } };
} {
  return (
    expr.exprKind.case === "constExpr" && expr.exprKind.value.constantKind.case === "nullValue"
  );
}

// ---------------------------------------------------------------------------
// Field path emission — produces quoted SQL column reference
// ---------------------------------------------------------------------------

export function emitIdent(expr: Expr, quoteStyle = `"`): string {
  if (expr.exprKind.case === "identExpr") {
    return quoteIdent(expr.exprKind.value.name, quoteStyle);
  }
  if (expr.exprKind.case === "selectExpr") {
    const sel = expr.exprKind.value;
    if (!sel.operand) {
      throw new TranslationError(`Expected operand, got ${sel}`);
    }
    return `${emitIdent(sel.operand, quoteStyle)}.${quoteIdent(sel.field, quoteStyle)}`;
  }
  throw new TranslationError(`Expected field reference, got ${expr.exprKind.case}`);
}

const RFC3339_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isTimestampString(s: string): boolean {
  return RFC3339_RE.test(s);
}

export function hasWildcard(s: string): boolean {
  return s.startsWith("*") || s.endsWith("*");
}

export function wildcardToLike(s: string): string {
  const hasLeading = s.startsWith("*");
  const hasTrailing = s.endsWith("*");
  const inner = s.replace(/^\*|\*$/g, "");
  return `${hasLeading ? "%" : ""}${inner}${hasTrailing ? "%" : ""}`;
}

export function constStringValue(expr: Expr, context: string): string {
  if (
    expr.exprKind.case !== "constExpr" ||
    expr.exprKind.value.constantKind.case !== "stringValue"
  ) {
    throw new TranslationError(`${context}: argument must be a string literal`);
  }
  return expr.exprKind.value.constantKind.value;
}

/**
 * Extract the total nanoseconds from a `durationValue` constant expression.
 * Throws if the expression is not a duration constant.
 */
export function durationConstNanos(expr: Expr): bigint {
  if (
    expr.exprKind.case !== "constExpr" ||
    expr.exprKind.value.constantKind.case !== "durationValue"
  ) {
    throw new TranslationError("expected duration argument");
  }
  return durationNanos(expr.exprKind.value.constantKind.value);
}
