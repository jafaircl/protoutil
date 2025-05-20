import { Expr, Expr_Call } from '@buf/google_cel-spec.bufbuild_es/cel/expr/syntax_pb.js';
import {
  CONDITIONAL_OPERATOR,
  findReverseBinaryOperator,
  LOGICAL_AND_OPERATOR,
  LOGICAL_OR_OPERATOR,
  precedence,
} from './operators.js';

/**
 * isLeftRecursive indicates whether the parser resolves the call in a
 * left-recursive manner as this can have an effect of how parentheses affect
 * the order of operations in the AST.
 */
export function isLeftRecursive(op: string) {
  return op !== LOGICAL_OR_OPERATOR && op !== LOGICAL_AND_OPERATOR;
}

/**
 * isSamePrecedence indicates whether the precedence of the input operator is
 * the same as the precedence of the (possible) operation represented in the
 * input Expr.
 *
 * If the expr is not a Call, the result is false.
 */
export function isSamePrecedence(op: string, expr: Expr) {
  if (expr.exprKind.case !== 'callExpr') {
    return false;
  }
  return precedence(op) === precedence(expr.exprKind.value.function);
}

/**
 * isLowerPrecedence indicates whether the precedence of the input operator is
 * lower precedence than the (possible) operation represented in the input Expr.
 *
 * If the expr is not a Call, the result is false.
 */
export function isLowerPrecedence(op: string, expr: Expr) {
  return precedence(op) < precedence((expr.exprKind.value as Expr_Call).function);
}

/**
 * Indicates whether the expr is a complex operator, i.e., a call expression
 * with 2 or more arguments.
 */
export function isComplexOperator(expr: Expr) {
  if (expr.exprKind.case == 'callExpr' && expr.exprKind.value.args.length >= 2) {
    return true;
  }
  return false;
}

/**
 * Indicates whether it is a complex operation compared to another.
 * expr is *not* considered complex if it is not a call expression or has
 * less than two arguments, or if it has a higher precedence than op.
 */
export function isComplexOperatorWithRespectTo(op: string, expr: Expr) {
  if (expr.exprKind.case !== 'callExpr' || expr.exprKind.value.args.length < 2) {
    return false;
  }
  return isLowerPrecedence(op, expr);
}

/**
 * Indicate whether this is a binary or ternary operator.
 */
export function isBinaryOrTernaryOperator(expr: Expr) {
  if (expr.exprKind.case !== 'callExpr' || expr.exprKind.value.args.length < 2) {
    return false;
  }
  const isBinaryOp = findReverseBinaryOperator(expr.exprKind.value.function) !== '';
  return isBinaryOp || isSamePrecedence(CONDITIONAL_OPERATOR, expr);
}

/**
 * bytesToOctets converts byte sequences to a string using a three digit octal
 * encoded value per byte.
 */
export function bytesToOctets(bytes: Uint8Array): string {
  let result = '';
  for (const byte of bytes) {
    result += `\\${byte.toString(8).padStart(3, '0')}`;
  }
  return result;
}

/**
 * Determine whether the expression is a string literal.
 */
export function isStringLiteral(expr: Expr): expr is Expr & {
  exprKind: { case: 'constExpr'; value: { constantKind: { case: 'stringValue' } } };
} {
  if (!expr) {
    return false;
  }
  if (expr.exprKind.case !== 'constExpr') {
    return false;
  }
  const constant = expr.exprKind.value.constantKind;
  return constant.case === 'stringValue';
}

/**
 * Determine whether the expression is an integer literal.
 */
export function isIntegerLiteral(expr: Expr): expr is Expr & {
  exprKind: { case: 'constExpr'; value: { constantKind: { case: 'int64Value' } } };
} {
  if (!expr) {
    return false;
  }
  if (expr.exprKind.case !== 'constExpr') {
    return false;
  }
  const constant = expr.exprKind.value.constantKind;
  return constant.case === 'int64Value';
}

export function unwrapStringConstant(expr: Expr): string | undefined {
  if (expr.exprKind.case !== 'constExpr') {
    return undefined;
  }
  const constant = expr.exprKind.value.constantKind;
  if (constant.case !== 'stringValue') {
    return undefined;
  }
  return constant.value;
}
