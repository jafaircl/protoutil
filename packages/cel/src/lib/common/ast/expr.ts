/* eslint-disable no-case-declarations */
import { Expr } from '../../protogen-exports/index.js';
import {
  isMapProtoExpr,
  unwrapCallProtoExpr,
  unwrapComprehensionProtoExpr,
  unwrapConstantProtoExpr,
  unwrapIdentProtoExpr,
  unwrapListProtoExpr,
  unwrapMapProtoExpr,
  unwrapMessageProtoExpr,
  unwrapSelectProtoExpr,
  unwrapStructProtoExpr,
} from '../pb/expressions.js';
import { isNil } from '../utils.js';

/**
 * SetKindCase replaces the contents of the current expression with the
 * contents of the other.
 *
 * The SetKindCase takes ownership of any expression instances references
 * within the input Expr. A shallow copy is made of the Expr value itself,
 * but not a deep one.
 *
 * This method should only be used during AST rewrites using temporary Expr
 * values.
 */
export function setExprKindCase(e: Expr, other?: Expr) {
  if (isNil(e)) {
    return;
  }
  if (isNil(other)) {
    e.exprKind = { case: undefined, value: undefined };
    return;
  }

  switch (other.exprKind.case) {
    case 'callExpr':
      const c = unwrapCallProtoExpr(other);
      if (isNil(c)) return;
      e.exprKind = { case: 'callExpr', value: c };
      break;
    case 'comprehensionExpr':
      const comp = unwrapComprehensionProtoExpr(other);
      if (isNil(comp)) return;
      e.exprKind = { case: 'comprehensionExpr', value: comp };
      break;
    case 'constExpr':
      const constant = unwrapConstantProtoExpr(other);
      if (isNil(constant)) return;
      e.exprKind = { case: 'constExpr', value: constant };
      break;
    case 'identExpr':
      const ident = unwrapIdentProtoExpr(other);
      if (isNil(ident)) return;
      e.exprKind = { case: 'identExpr', value: ident };
      break;
    case 'listExpr':
      const list = unwrapListProtoExpr(other);
      if (isNil(list)) return;
      e.exprKind = { case: 'listExpr', value: list };
      break;
    case 'selectExpr':
      const select = unwrapSelectProtoExpr(other);
      if (isNil(select)) return;
      e.exprKind = { case: 'selectExpr', value: select };
      break;
    case 'structExpr':
      const struct = unwrapStructProtoExpr(other);
      if (isNil(struct)) return;
      e.exprKind = { case: 'structExpr', value: struct };
      break;
    default:
      e.exprKind = { case: undefined, value: undefined };
      break;
  }
}

/**
 * IDGenerator produces unique ids suitable for tagging expression nodes
 */
export type IDGenerator = (originalID: bigint) => bigint;

/**
 * RenumberIDs traverses the expression tree and renumbers all expression IDs
 */
export function renumberIDs(expr: Expr, idGen: (id: bigint) => bigint): Expr {
  expr.id = idGen(expr.id);
  switch (expr.exprKind.case) {
    case 'callExpr':
      const call = unwrapCallProtoExpr(expr);
      if (call?.target) {
        renumberIDs(call.target, idGen);
      }
      for (const arg of call?.args ?? []) {
        renumberIDs(arg, idGen);
      }
      break;
    case 'comprehensionExpr':
      const compre = unwrapComprehensionProtoExpr(expr);
      if (compre?.iterRange) {
        renumberIDs(compre.iterRange, idGen);
      }
      if (compre?.accuInit) {
        renumberIDs(compre.accuInit, idGen);
      }
      if (compre?.loopCondition) {
        renumberIDs(compre.loopCondition, idGen);
      }
      if (compre?.loopStep) {
        renumberIDs(compre.loopStep, idGen);
      }
      if (compre?.result) {
        renumberIDs(compre.result, idGen);
      }
      break;
    case 'listExpr':
      const list = unwrapListProtoExpr(expr);
      for (const item of list?.elements ?? []) {
        renumberIDs(item, idGen);
      }
      break;
    case 'selectExpr':
      const select = unwrapSelectProtoExpr(expr);
      if (select?.operand) {
        renumberIDs(select.operand, idGen);
      }
      break;
    case 'structExpr':
      if (isMapProtoExpr(expr)) {
        const map = unwrapMapProtoExpr(expr);
        for (const entry of map?.entries ?? []) {
          entry.id = idGen(entry.id);
          if (entry.keyKind.value) {
            renumberIDs(entry.keyKind.value, idGen);
          }
          if (entry.value) {
            renumberIDs(entry.value, idGen);
          }
        }
      } else {
        const message = unwrapMessageProtoExpr(expr);
        for (const field of message?.entries ?? []) {
          field.id = idGen(field.id);
          if (field.value) {
            renumberIDs(field.value, idGen);
          }
        }
      }
      break;
    default:
      break;
  }
  return expr;
}
