/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { AST } from '../common/ast/ast.js';
import { matchDescendants, NavigableExpr, NavigableExprMatcher } from '../common/ast/navigable.js';
import { NOT_EQUALS_OPERATOR } from '../common/operators.js';
import {
  isIdentProtoExpr,
  isSelectProtoExpr,
  unwrapSelectProtoExpr,
} from '../common/pb/expressions.js';
import { IntRefVal } from '../common/types/int.js';
import { NullRefVal } from '../common/types/null.js';
import { Trait } from '../common/types/traits/trait.js';
import { isNil, toQualifiedName } from '../common/utils.js';
import { Expr } from '../protogen-exports/index.js';
import { NullType, Type } from './decls.js';
import { ASTOptimizer, OptimizerContext } from './optimizer.js';

/**
 * InlineVariable holds a variable name to be matched and an AST representing
 * the expression graph which should be used to replace it.
 */
export class InlineVariable {
  private readonly _alias: string;

  constructor(private readonly _name: string, private readonly _def: AST, alias?: string) {
    if (!alias) {
      this._alias = this._name;
    } else {
      this._alias = alias;
    }
  }

  /**
   * Name returns the qualified variable or field selection to replace.
   */
  name() {
    return this._name;
  }

  /**
   * Alias returns the alias to use when performing cel.bind() calls during inlining.
   */
  alias() {
    return this._alias;
  }

  /**
   * Expr returns the inlined expression value.
   */
  expr() {
    return this._def.expr();
  }

  /**
   * Type indicates the inlined expression type.
   */
  type() {
    return this._def.getType(this.expr().id);
  }

  def() {
    return this._def;
  }
}

/**
 * InliningOptimizer creates an optimizer which replaces variables with expression definitions.
 *
 * If a variable occurs one time, the variable is replaced by the inline definition. If the
 * variable occurs more than once, the variable occurences are replaced by a cel.bind() call.
 */
export class InliningOptimizer implements ASTOptimizer {
  private readonly _variables: InlineVariable[];

  constructor(...variables: InlineVariable[]) {
    this._variables = variables;
  }

  optimize(ctx: OptimizerContext, a: AST): AST {
    const root = new NavigableExpr(a);
    for (const inlineVar of this._variables) {
      const matches = matchDescendants(root, this.matchVariable(inlineVar.name()));
      // Skip cases where the variable isn't in the expression graph
      if (matches.length === 0) {
        continue;
      }

      // For a single match, do a direct replacement of the expression sub-graph.
      if (matches.length === 1 || !isBindable(matches, inlineVar.expr(), inlineVar.type()!)) {
        for (const match of matches) {
          // Copy the inlined AST expr and source info.
          const copyExpr = ctx.optimizerExprFactory.copyASTAndMetadata(inlineVar.def());
          this.inlineExpr(ctx, match.expr(), copyExpr, inlineVar.type()!);
        }
        continue;
      }

      // For multiple matches, find the least common ancestor (lca) and insert the
      // variable as a cel.bind() macro.
      let lca = root;
      let lcaAncestorCount = 0;
      const ancestors = new Map<bigint, number>();
      let parent: NavigableExpr | null = null;
      let found = false;
      for (const match of matches) {
        // Update the identifier matches with the provided alias.
        parent = match;
        found = true;
        while (found) {
          const ancestorCount = ancestors.get(parent!.id());
          const hasAncestor = !isNil(ancestorCount);
          if (!hasAncestor) {
            ancestors.set(parent!.id(), 1);
            parent = parent!.parent() ?? null;
            found = !isNil(parent);
            continue;
          }
          if (
            lcaAncestorCount < ancestorCount ||
            (lcaAncestorCount === ancestorCount && lca.depth() < parent!.depth())
          ) {
            lca = parent!;
            lcaAncestorCount = ancestorCount;
          }
          ancestors.set(parent!.id(), ancestorCount + 1);
          parent = parent!.parent() ?? null;
          found = !isNil(parent);
        }
        const aliasExpr = ctx.optimizerExprFactory.newIdent(inlineVar.alias());
        this.inlineExpr(ctx, match.expr(), aliasExpr, inlineVar.type()!);
      }

      // Copy the inlined AST expr and source info.
      const copyExpr = ctx.optimizerExprFactory.copyASTAndMetadata(inlineVar.def());
      // Update the least common ancestor by inserting a cel.bind() call to the alias.
      const [inlined, bindMacro] = ctx.optimizerExprFactory.newBindMacro(
        lca.id(),
        inlineVar.alias(),
        copyExpr,
        lca.expr()
      );
      this.inlineExpr(ctx, lca.expr(), inlined, inlineVar.type()!);
      ctx.optimizerExprFactory.setMacroCall(lca.id(), bindMacro);
    }
    return a;
  }

  /**
   * inlineExpr replaces the current expression with the inlined one, unless the location of the inlining
   * happens within a presence test, e.g. has(a.b.c) -> inline alpha for a.b.c in which case an attempt is
   * made to determine whether the inlined value can be presence or existence tested.
   */
  inlineExpr(ctx: OptimizerContext, prev: Expr, inlined: Expr, inlinedType: Type) {
    switch (prev.exprKind.case) {
      case 'selectExpr':
        const sel = unwrapSelectProtoExpr(prev);
        if (!sel?.testOnly) {
          ctx.optimizerExprFactory.updateExpr(prev, inlined);
          return;
        }
        this.rewritePresenceExpr(ctx, prev, inlined, inlinedType);
        break;
      default:
        ctx.optimizerExprFactory.updateExpr(prev, inlined);
        break;
    }
  }

  /**
   * rewritePresenceExpr converts the inlined expression, when it occurs within a has() macro, to type-safe
   * expression appropriate for the inlined type, if possible.
   *
   * If the rewrite is not possible an error is reported at the inline expression site.
   */
  rewritePresenceExpr(ctx: OptimizerContext, prev: Expr, inlined: Expr, inlinedType: Type) {
    // If the input inlined expression is not a select expression it won't work with the has()
    // macro. Attempt to rewrite the presence test in terms of the typed input, otherwise error.
    if (inlined.exprKind.case === 'selectExpr') {
      const [presenceTest, hasMacro] = ctx.optimizerExprFactory.newHasMacro(prev.id, inlined);
      ctx.optimizerExprFactory.updateExpr(prev, presenceTest);
      ctx.optimizerExprFactory.setMacroCall(prev.id, hasMacro);
      return;
    }

    ctx.optimizerExprFactory.clearMacroCall(prev.id);
    if (inlinedType.isAssignableType(NullType)) {
      ctx.optimizerExprFactory.updateExpr(
        prev,
        ctx.optimizerExprFactory.newCall(NOT_EQUALS_OPERATOR, [
          inlined,
          ctx.optimizerExprFactory.newLiteral(new NullRefVal()),
        ])
      );
      return;
    }
    if (inlinedType.hasTrait(Trait.SIZER_TYPE)) {
      ctx.optimizerExprFactory.updateExpr(
        prev,
        ctx.optimizerExprFactory.newCall(NOT_EQUALS_OPERATOR, [
          ctx.optimizerExprFactory.newMemberCall('size', inlined, []),
          ctx.optimizerExprFactory.newLiteral(IntRefVal.IntZero),
        ])
      );
      return;
    }
    ctx.issues.reportErrorAtID(
      prev.id,
      `unable to inline expression type ${inlinedType.typeName()} into presence test`
    );
  }

  /**
   * matchVariable matches simple identifiers, select expressions, and presence test expressions
   * which match the (potentially) qualified variable name provided as input.
   *
   * Note, this function does not support inlining against select expressions which includes optional
   * field selection. This may be a future refinement.
   */
  matchVariable(varName: string): NavigableExprMatcher {
    return (e) => {
      const _e = e.expr();
      if (isIdentProtoExpr(_e) && _e.exprKind.value.name === varName) {
        return true;
      }
      if (isSelectProtoExpr(_e)) {
        const sel = unwrapSelectProtoExpr(_e)!;
        // While the `ToQualifiedName` call could take the select directly, this
        // would skip presence tests from possible matches, which we would like
        // to include.
        const qualName = toQualifiedName(sel.operand!);
        return !isNil(qualName) && `${qualName}.${sel.field}` === varName;
      }
      return false;
    };
  }
}

/**
 * isBindable indicates whether the inlined type can be used within a cel.bind() if the expression
 * being replaced occurs within a presence test. Value types with a size() method or field selection
 * support can be bound.
 *
 * In future iterations, support may also be added for indexer types which can be rewritten as an `in`
 * expression; however, this would imply a rewrite of the inlined expression that may not be necessary
 * in most cases.
 */
function isBindable(matches: NavigableExpr[], inlined: Expr, inlinedType: Type) {
  if (inlinedType.isAssignableType(NullType) || inlinedType.hasTrait(Trait.SIZER_TYPE)) {
    return true;
  }
  for (const m of matches) {
    if (!isSelectProtoExpr(m.expr())) {
      continue;
    }
    const sel = unwrapSelectProtoExpr(m.expr());
    if (sel?.testOnly) {
      return false;
    }
  }
  return true;
}
