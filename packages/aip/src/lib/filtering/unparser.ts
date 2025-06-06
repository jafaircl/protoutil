import { toJsonString } from '@bufbuild/protobuf';
import { durationString, timestampDateString } from '@protoutil/core';
import { Expr, ExprSchema } from '../gen/google/api/expr/v1alpha1/syntax_pb.js';
import {
  FunctionAnd,
  FunctionEquals,
  FunctionFuzzyAnd,
  FunctionGreaterEquals,
  FunctionGreaterThan,
  FunctionHas,
  FunctionLessEquals,
  FunctionLessThan,
  FunctionNot,
  FunctionNotEquals,
  FunctionOr,
} from './functions.js';

/**
 * Unparser is a class that converts an expression tree into a string representation.
 * Note that this does not check the validity of the expression tree. For that, you
 * will need to use the `Checker` class or `checkFilter` function.
 */
export class Unparser {
  private _expr: Expr;

  constructor(expr: Expr) {
    this._expr = expr;
  }

  unparse(): string {
    return this.unparseExpr(this._expr);
  }

  unparseExpr(e: Expr) {
    switch (e.exprKind.case) {
      case 'constExpr':
        return this.unparseConstExpr(e);
      case 'identExpr':
        return this.unparseIdentExpr(e);
      case 'callExpr':
        return this.unparseCallExpr(e);
      case 'selectExpr':
        return this.unparseSelectExpr(e);
      default:
        throw new Error(`Unsupported expr: ${toJsonString(ExprSchema, e)}`);
    }
  }

  unparseConstExpr(e: Expr) {
    if (e.exprKind.case !== 'constExpr') {
      throw new Error(`expected const expression, got ${e.exprKind.case}`);
    }
    const constExpr = e.exprKind.value;
    switch (constExpr.constantKind.case) {
      case 'boolValue':
      case 'int64Value':
      case 'uint64Value':
      case 'doubleValue':
        return constExpr.constantKind.value.toString();
      case 'stringValue':
        return `"${constExpr.constantKind.value}"`;
      case 'nullValue':
        return 'null';
      case 'durationValue':
        return `duration("${durationString(constExpr.constantKind.value)}")`;
      case 'timestampValue':
        return `timestamp("${timestampDateString(constExpr.constantKind.value)}")`;
      default:
        throw new Error(`Unsupported constExpr: ${toJsonString(ExprSchema, e)}`);
    }
  }

  unparseCallExpr(e: Expr): string {
    if (e.exprKind.case !== 'callExpr') {
      throw new Error(`expected call expression, got ${e.exprKind.case}`);
    }
    const callExpr = e.exprKind.value;
    const args = callExpr.args.map((arg) => {
      const parsed = this.unparseExpr(arg);
      // If the child is another built-in function call (i.e AND, OR, etc.),
      // we need to wrap it in parentheses to avoid precedence issues.
      if (isCallExpr(arg) && !isFunctionCall(arg.exprKind.value.function)) {
        return `(${parsed})`;
      }
      return parsed;
    });
    if (callExpr.target) {
      const target = this.unparseExpr(callExpr.target);
      return `${target}.${callExpr.function}(${args.join(', ')})`;
    }
    switch (callExpr.function) {
      case FunctionFuzzyAnd:
        return `${args[0]} ${args[1]}`;
      case FunctionNot:
        return `NOT ${args[0]}`;
      case FunctionAnd:
      case FunctionOr:
      case FunctionEquals:
      case FunctionNotEquals:
      case FunctionLessThan:
      case FunctionLessEquals:
      case FunctionGreaterEquals:
      case FunctionGreaterThan:
        return `${args[0]} ${callExpr.function} ${args[1]}`;
      case FunctionHas:
        return `${args[0]}:${args[1]}`;
      default:
        return `${callExpr.function}(${args.join(', ')})`;
    }
  }

  unparseIdentExpr(e: Expr) {
    if (e.exprKind.case !== 'identExpr') {
      throw new Error(`expected ident expression, got ${e.exprKind.case}`);
    }
    const identExpr = e.exprKind.value;
    return identExpr.name;
  }

  unparseSelectExpr(e: Expr): string {
    if (e.exprKind.case !== 'selectExpr') {
      throw new Error(`expected select expression, got ${e.exprKind.case}`);
    }
    const selectExpr = e.exprKind.value;
    if (!selectExpr.operand) {
      throw new Error(`select expression has no operand`);
    }
    const target = this.unparseExpr(selectExpr.operand);
    return `${target}.${selectExpr.field}`;
  }
}

function isCallExpr(e: Expr): e is Expr & { exprKind: { case: 'callExpr' } } {
  return e.exprKind.case === 'callExpr';
}

function isFunctionCall(fn: string) {
  switch (fn) {
    case FunctionFuzzyAnd:
    case FunctionNot:
    case FunctionAnd:
    case FunctionOr:
    case FunctionEquals:
    case FunctionNotEquals:
    case FunctionLessThan:
    case FunctionLessEquals:
    case FunctionGreaterEquals:
    case FunctionGreaterThan:
    case FunctionHas:
      return false;
    default:
      return true;
  }
}
