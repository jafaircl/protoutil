/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-case-declarations */
import { Expr, Expr_CreateStruct_Entry } from 'src/lib/protogen-exports/index.js';
import {
  isMapEntryProtoExpr,
  isMapProtoExpr,
  unwrapCallProtoExpr,
  unwrapComprehensionProtoExpr,
  unwrapListProtoExpr,
  unwrapMapProtoExpr,
  unwrapMessageProtoExpr,
  unwrapSelectProtoExpr,
} from '../pb/expressions.js';
import { AST } from './ast.js';

export class NavigableExpr {
  constructor(private _ast: AST, private _parent?: NavigableExpr, private _depth = 0) {}

  parent() {
    if (!this._parent) {
      return undefined;
    }
    return this._parent;
  }

  id() {
    return this._ast.expr().id;
  }

  kind() {
    return this._ast.expr().exprKind.case;
  }

  type() {
    return this._ast.getType(this.id());
  }

  children(): NavigableExpr[] {
    const expr = this._ast.expr();
    switch (expr.exprKind.case) {
      case 'selectExpr':
        if (expr.exprKind.value.operand) {
          return [
            new NavigableExpr(
              new AST(expr.exprKind.value.operand, this._ast.sourceInfo()),
              this,
              this._depth + 1
            ),
          ];
        }
        return [];
      case 'callExpr':
        const args = expr.exprKind.value.args.map(
          (e) => new NavigableExpr(new AST(e, this._ast.sourceInfo()), this, this._depth + 1)
        );
        if (expr.exprKind.value.target) {
          args.unshift(
            new NavigableExpr(
              new AST(expr.exprKind.value.target, this._ast.sourceInfo()),
              this,
              this._depth + 1
            )
          );
        }
        return args;
      case 'listExpr':
        return expr.exprKind.value.elements.map(
          (e) => new NavigableExpr(new AST(e, this._ast.sourceInfo()), this, this._depth + 1)
        );
      case 'structExpr':
        const entries: NavigableExpr[] = [];
        for (const entry of expr.exprKind.value.entries) {
          if (isMapEntryProtoExpr(entry)) {
            entries.push(
              new NavigableExpr(
                new AST(entry.keyKind.value, this._ast.sourceInfo()),
                this,
                this._depth + 1
              )
            );
          }
          if (entry.value) {
            entries.push(
              new NavigableExpr(new AST(entry.value, this._ast.sourceInfo()), this, this._depth + 1)
            );
          }
        }
        return entries;
      case 'comprehensionExpr':
        const compre = expr.exprKind.value;
        const retval: NavigableExpr[] = [];
        if (compre.iterRange) {
          retval.push(
            new NavigableExpr(
              new AST(compre.iterRange, this._ast.sourceInfo()),
              this,
              this._depth + 1
            )
          );
        }
        if (compre.accuInit) {
          retval.push(
            new NavigableExpr(
              new AST(compre.accuInit, this._ast.sourceInfo()),
              this,
              this._depth + 1
            )
          );
        }
        if (compre.loopCondition) {
          retval.push(
            new NavigableExpr(
              new AST(compre.loopCondition, this._ast.sourceInfo()),
              this,
              this._depth + 1
            )
          );
        }
        if (compre.loopStep) {
          retval.push(
            new NavigableExpr(
              new AST(compre.loopStep, this._ast.sourceInfo()),
              this,
              this._depth + 1
            )
          );
        }
        if (compre.result) {
          retval.push(
            new NavigableExpr(new AST(compre.result, this._ast.sourceInfo()), this, this._depth + 1)
          );
        }
        return retval;
      default:
        return [];
    }
  }

  expr() {
    return this._ast.expr();
  }

  depth() {
    return this._depth;
  }
}

/**
 * Visitor defines an object for visiting Expr and EntryExpr nodes within an expression graph.
 */
export interface Visitor {
  // VisitExpr visits the input expression.
  visitExpr(e: Expr, depth?: number): void;

  // VisitEntryExpr visits the input entry expression, i.e. a struct field or map entry.
  visitEntryExpr(e: Expr_CreateStruct_Entry, depth?: number): void;
}

export class baseVisitor implements Visitor {
  constructor(
    private readonly _visitExpr?: (e: Expr, depth: number) => void,
    private readonly _visitEntryExpr?: (e: Expr_CreateStruct_Entry, depth: number) => void
  ) {}

  visitExpr(e: Expr, depth: number) {
    if (this._visitExpr) {
      this._visitExpr(e, depth);
    }
  }

  visitEntryExpr(e: Expr_CreateStruct_Entry, depth: number) {
    if (this._visitEntryExpr) {
      this._visitEntryExpr(e, depth);
    }
  }
}

/**
 * NewExprVisitor creates a visitor which only visits expression nodes.
 */
export function newExprVisitor(v: (e: Expr) => void): Visitor {
  return new baseVisitor(v);
}

/**
 * PostOrderVisit walks the expression graph and calls the visitor in post-order (bottom-up).
 */
export function postOrderVisit(expr: Expr, visitor: Visitor): void {
  visit(expr, visitor, ExprVisitOrder.POST_ORDER, 0, 0);
}

/**
 * PreOrderVisit walks the expression graph and calls the visitor in pre-order (top-down).
 */
export function preOrderVisit(expr: Expr, visitor: Visitor): void {
  visit(expr, visitor, ExprVisitOrder.PRE_ORDER, 0, 0);
}

export enum ExprVisitOrder {
  PRE_ORDER,
  POST_ORDER,
}

/**
 * Visit traverses the expression tree and calls the visitor function foreach
 * expression node.
 */
export function visit(
  expr: Expr,
  visitor: Visitor,
  order: ExprVisitOrder,
  depth: number,
  maxDepth: number
): void {
  if (maxDepth > 0 && depth == maxDepth) {
    return;
  }
  if (order == ExprVisitOrder.PRE_ORDER) {
    visitor.visitExpr(expr, depth);
  }
  switch (expr.exprKind.case) {
    case 'callExpr':
      const c1 = unwrapCallProtoExpr(expr)!;
      if (c1.target) {
        visit(c1.target, visitor, order, depth + 1, maxDepth);
      }
      for (const arg of c1.args) {
        visit(arg, visitor, order, depth + 1, maxDepth);
      }
      break;
    case 'comprehensionExpr':
      const c2 = unwrapComprehensionProtoExpr(expr)!;
      visit(c2.iterRange!, visitor, order, depth + 1, maxDepth);
      visit(c2.accuInit!, visitor, order, depth + 1, maxDepth);
      visit(c2.loopCondition!, visitor, order, depth + 1, maxDepth);
      visit(c2.loopStep!, visitor, order, depth + 1, maxDepth);
      visit(c2.result!, visitor, order, depth + 1, maxDepth);
      break;
    case 'listExpr':
      const l = unwrapListProtoExpr(expr)!;
      for (const elem of l.elements) {
        visit(elem, visitor, order, depth + 1, maxDepth);
      }
      break;
    case 'structExpr':
      if (isMapProtoExpr(expr)) {
        const m = unwrapMapProtoExpr(expr)!;
        for (const e of m.entries) {
          if (order == ExprVisitOrder.PRE_ORDER) {
            visitor.visitEntryExpr(e, depth);
          }
          visit(e.keyKind.value!, visitor, order, depth + 1, maxDepth);
          visit(e.value!, visitor, order, depth + 1, maxDepth);
          if (order == ExprVisitOrder.POST_ORDER) {
            visitor.visitEntryExpr(e, depth);
          }
        }
      } else {
        const s = unwrapMessageProtoExpr(expr)!;
        for (const f of s.entries) {
          if (order == ExprVisitOrder.PRE_ORDER) {
            visitor.visitEntryExpr(f, depth);
          }
          visit(f.value!, visitor, order, depth + 1, maxDepth);
          if (order == ExprVisitOrder.POST_ORDER) {
            visitor.visitEntryExpr(f, depth);
          }
        }
      }
      break;
    case 'selectExpr':
      visit(unwrapSelectProtoExpr(expr)!.operand!, visitor, order, depth + 1, maxDepth);
      break;
    default:
      break;
  }
  if (order == ExprVisitOrder.POST_ORDER) {
    visitor.visitExpr(expr, depth);
  }
}

/**
 * ExprMatcher takes a NavigableExpr in and indicates whether the value is a match.
 *
 * This function type should be use with the `Match` and `MatchList` calls.
 */
export type ExprMatcher = (e: Expr) => boolean;

export interface NavigableExprVisitor {
  visitExpr(e: NavigableExpr): void;
}

export class baseNavigableExprVisitor {
  constructor(private readonly _visitExpr?: (e: NavigableExpr) => void) {}

  visitExpr(e: NavigableExpr): void {
    if (this._visitExpr) {
      this._visitExpr(e);
    }
  }
}

export function newNavigableExprVisitor(v: (e: NavigableExpr) => void): NavigableExprVisitor {
  return new baseNavigableExprVisitor(v);
}

export function postOrderVisitNavigable(expr: NavigableExpr, visitor: NavigableExprVisitor): void {
  visitNavigable(expr, visitor, ExprVisitOrder.POST_ORDER);
}

export function preOrderVisitNavigable(expr: NavigableExpr, visitor: NavigableExprVisitor): void {
  visitNavigable(expr, visitor, ExprVisitOrder.PRE_ORDER);
}

export function visitNavigable(
  expr: NavigableExpr,
  visitor: NavigableExprVisitor,
  order: ExprVisitOrder,
  maxDepth = 0
): void {
  if (expr.depth() >= maxDepth && maxDepth > 0) {
    return;
  }
  if (order == ExprVisitOrder.PRE_ORDER) {
    visitor.visitExpr(expr);
  }
  for (const child of expr.children()) {
    visitNavigable(child, visitor, order);
  }
  if (order == ExprVisitOrder.POST_ORDER) {
    visitor.visitExpr(expr);
  }
}

export type NavigableExprMatcher = (e: NavigableExpr) => boolean;

/**
 * ConstantValueMatcher returns an ExprMatcher which will return true if the input NavigableExpr
 * is comprised of all constant values, such as a simple literal or even list and map literal.
 */
export function constantValueMatcher(): NavigableExprMatcher {
  return matchIsConstantValue;
}

function matchIsConstantValue(e: NavigableExpr): boolean {
  if (e.kind() === 'constExpr') {
    return true;
  }
  if (e.kind() === 'structExpr' || e.kind() === 'listExpr') {
    for (const child of e.children()) {
      if (!matchIsConstantValue(child)) {
        return false;
      }
    }
    return true;
  }
  return false;
}

/**
 * KindMatcher returns an ExprMatcher which will return true if the input NavigableExpr.Kind() matches
 * the specified `kind`.
 */
export function kindMatcher(kind: Expr['exprKind']['case']): NavigableExprMatcher {
  return (e) => e.kind() === kind;
}

/**
 * MatchDescendants takes a NavigableExpr and ExprMatcher and produces a list of NavigableExpr values
 * matching the input criteria in post-order (bottom up).
 */
export function matchDescendants(
  expr: NavigableExpr,
  matcher: NavigableExprMatcher
): NavigableExpr[] {
  const matches: NavigableExpr[] = [];
  const navVisitor = new baseNavigableExprVisitor((e) => {
    if (matcher(e)) {
      matches.push(e);
    }
  });
  visitNavigable(expr, navVisitor, ExprVisitOrder.POST_ORDER, 0);
  return matches;
}

/**
 * MatchSubset applies an ExprMatcher to a list of NavigableExpr values and their descendants, producing a
 * subset of NavigableExpr values which match.
 */
export function matchSubset(
  exprs: NavigableExpr[],
  matcher: NavigableExprMatcher
): NavigableExpr[] {
  const matches: NavigableExpr[] = [];
  const navVisitor = new baseNavigableExprVisitor((e) => {
    if (matcher(e)) {
      matches.push(e);
    }
  });
  for (const expr of exprs) {
    visitNavigable(expr, navVisitor, ExprVisitOrder.POST_ORDER, 1);
  }
  return matches;
}
