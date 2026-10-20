import type { Type } from "../../gen/cel/expr/checked_pb.js";
import type { AST } from "./ast.js";
import type { Expr, ExprKind } from "./expr.js";

/**
 * NavigableExpr augments an expression with parent, child, and type metadata.
 */
export interface NavigableExpr extends Expr {
  /**
   * Type of the expression.
   *
   * If the expression is type-checked, the type-check metadata is returned.
   */
  type(): Type | undefined;
  /** Parent returns the parent expression node, if one exists. */
  parent(): [NavigableExpr | undefined, boolean];
  /** Children returns a list of child expression nodes. */
  children(): NavigableExpr[];
  /**
   * Depth indicates the depth in the expression tree.
   *
   * The root expression has depth 0.
   */
  depth(): number;
}

/**
 * NavigableExprImpl provides the default NavigableExpr implementation.
 */
class NavigableExprImpl implements NavigableExpr {
  constructor(
    private readonly ast: AST,
    private readonly exprValue: Expr,
    private readonly parentValue?: NavigableExpr,
    private readonly depthValue = 0,
  ) {}

  public id(): number {
    return this.exprValue.id();
  }

  public kind(): ExprKind {
    return this.exprValue.kind();
  }

  public asCall() {
    return this.exprValue.asCall();
  }

  public asComprehension() {
    return this.exprValue.asComprehension();
  }

  public asIdent() {
    return this.exprValue.asIdent();
  }

  public asLiteral() {
    return this.exprValue.asLiteral();
  }

  public asList() {
    return this.exprValue.asList();
  }

  public asMap() {
    return this.exprValue.asMap();
  }

  public asSelect() {
    return this.exprValue.asSelect();
  }

  public asStruct() {
    return this.exprValue.asStruct();
  }

  public renumberIds(generator: Parameters<Expr["renumberIds"]>[0]): void {
    this.exprValue.renumberIds(generator);
  }

  public setKindCase(other: Expr): void {
    this.exprValue.setKindCase(other);
  }

  public toProto() {
    return this.exprValue.toProto();
  }

  public type(): Type | undefined {
    return this.ast.getType(this.id());
  }

  public parent(): [NavigableExpr | undefined, boolean] {
    return [this.parentValue, this.parentValue !== undefined];
  }

  public children(): NavigableExpr[] {
    return this.exprValue
      .children()
      .map((child) => new NavigableExprImpl(this.ast, child, this, this.depthValue + 1));
  }

  public depth(): number {
    return this.depthValue;
  }
}

/**
 * NavigateAST returns a navigable view over the AST root expression.
 */
export function navigateAst(ast: AST): NavigableExpr {
  return new NavigableExprImpl(ast, ast.expr());
}

/**
 * NavigateExpr returns a navigable view over an expression using AST-backed type metadata.
 */
export function navigateExpr(ast: AST, expr: Expr): NavigableExpr {
  if ("parent" in expr && "depth" in expr) {
    const navigable = expr as NavigableExpr;
    const [parent, found] = navigable.parent();
    return new NavigableExprImpl(ast, expr, found ? parent : undefined, navigable.depth());
  }
  return new NavigableExprImpl(ast, expr);
}

/**
 * exceedsDepth determines whether an AST contains expressions nested at or beyond maxDepth.
 *
 * The root expression has depth zero. Traversal stops at the first prohibited depth so checking
 * adversarially deep loaded ASTs does not itself overflow the JavaScript call stack.
 */
export function exceedsDepth(ast: AST | undefined, maxDepth: number): boolean {
  if (ast === undefined || maxDepth <= 0 || ast.expr().kind() === 0) {
    return false;
  }
  const pending: Array<{ expression: Expr; depth: number }> = [
    { expression: ast.expr(), depth: 0 },
  ];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.depth >= maxDepth) {
      return true;
    }
    for (const child of current.expression.children()) {
      pending.push({ expression: child, depth: current.depth + 1 });
    }
  }
  return false;
}

/**
 * MatchDescendants returns descendant expressions that satisfy the matcher.
 */
export function matchDescendants(
  expr: NavigableExpr,
  matcher: (expr: NavigableExpr) => boolean,
): NavigableExpr[] {
  const matches: NavigableExpr[] = [];
  const walk = (node: NavigableExpr): void => {
    for (const child of node.children()) {
      walk(child);
    }
    if (matcher(node)) {
      matches.push(node);
    }
  };
  walk(expr);
  return matches;
}

/**
 * MatchSubset filters an existing navigable expression subset.
 */
export function matchSubset(
  exprs: NavigableExpr[],
  matcher: (expr: NavigableExpr) => boolean,
): NavigableExpr[] {
  return exprs.filter((expr) => matcher(expr));
}

/**
 * AllMatcher matches every expression.
 */
export function allMatcher(): (expr: NavigableExpr) => boolean {
  return () => true;
}

/**
 * ConstantValueMatcher matches expressions composed entirely of constant values.
 */
export function constantValueMatcher(): (expr: NavigableExpr) => boolean {
  const isConstantValue = (expr: NavigableExpr): boolean => {
    if (expr.kind() === 5) {
      return true;
    }
    if (expr.kind() === 4 || expr.kind() === 6 || expr.kind() === 8) {
      return expr.children().every((child) => isConstantValue(child));
    }
    return false;
  };
  return isConstantValue;
}

/**
 * FunctionMatcher matches call expressions by function name.
 */
export function functionMatcher(functionName: string): (expr: NavigableExpr) => boolean {
  return (expr) => expr.kind() === 1 && expr.asCall()?.functionName() === functionName;
}

/**
 * KindMatcher matches expressions by kind.
 */
export function kindMatcher(kind: ExprKind): (expr: NavigableExpr) => boolean {
  return (expr) => expr.kind() === kind;
}
