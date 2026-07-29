import type { AST, Expr, NavigableExpr } from "../common/ast/index.js";
import { ExprKind, matchDescendants, navigateAst } from "../common/ast/index.js";
import { toQualifiedName } from "../common/containers.js";
import * as operators from "../common/operators.js";
import * as overloads from "../common/overloads.js";
import { SizerType } from "../common/types/traits/traits.js";
import { exprTypeToType, Kind, NullType, type Type } from "../common/types/types.js";
import type { ASTOptimizer, OptimizerContext } from "./optimizer.js";

/**
 * InlineVariableOptions declares a variable and the checked expression which replaces it.
 */
export interface InlineVariableOptions {
  /**
   * alias is used by generated `cel.bind` calls when the variable occurs more than once.
   *
   * The variable name is used when this property is omitted.
   */
  alias?: string;
  /** definition is the checked expression graph substituted for the variable. */
  definition: AST;
  /** name is the qualified variable or field selection to replace. */
  name: string;
}

/**
 * InlineVariable holds a variable name and an AST expression graph used to replace it.
 */
export class InlineVariable {
  /** constructor records the variable replacement configuration. */
  constructor(private readonly options: InlineVariableOptions) {}

  /** name returns the qualified variable or field selection to replace. */
  public name(): string {
    return this.options.name;
  }

  /** alias returns the identifier used for generated `cel.bind` calls. */
  public alias(): string {
    return this.options.alias ?? this.options.name;
  }

  /** expr returns the inlined expression value. */
  public expr(): Expr {
    return this.options.definition.expr();
  }

  /** type returns the checked type of the inlined expression. */
  public type(): Type {
    return exprTypeToType(this.options.definition.getType(this.expr().id())!);
  }

  /** definition returns the complete checked replacement AST. */
  public definition(): AST {
    return this.options.definition;
  }
}

/**
 * InliningOptimizerOptions configures the variables replaced by an inlining pass.
 */
export interface InliningOptimizerOptions {
  /** variables contains the variable definitions applied in order. */
  variables?: InlineVariable[];
}

/**
 * InlineDefinitions maps variable names to checked expression definitions.
 */
export type InlineDefinitions = Record<string, AST>;

/**
 * InliningOptimizer replaces variables with checked expression definitions.
 *
 * A single occurrence is replaced directly. Multiple bindable occurrences are replaced with an
 * expanded `cel.bind` expression at their least common ancestor so the definition is evaluated once.
 */
export class InliningOptimizer implements ASTOptimizer {
  /** variables stores the ordered inline definitions. */
  private readonly variables: InlineVariable[];

  /** constructor configures the optimizer from a plain option object. */
  constructor(options: InliningOptimizerOptions = {}) {
    this.variables = [...(options.variables ?? [])];
  }

  /** optimize applies each variable definition to the checked AST. */
  public optimize(context: OptimizerContext, ast: AST): AST {
    const root = navigateAst(ast);
    for (const inlineValue of this.variables) {
      const matches = matchDescendants(root, (expression) =>
        this.matchesVariable(expression, inlineValue.name()),
      );
      if (matches.length === 0) {
        continue;
      }

      if (matches.length === 1 || !isBindable(matches, inlineValue.expr(), inlineValue.type())) {
        for (const match of matches) {
          const copied = context.copyAstAndMetadata(inlineValue.definition());
          this.inlineExpr(context, match, copied, inlineValue.type());
        }
        continue;
      }

      // Find the least common ancestor while replacing each occurrence with the binding alias.
      let leastCommonAncestor = root;
      let leastCommonAncestorCount = 0;
      const ancestors = new Map<number, number>();
      for (const match of matches) {
        let parent: NavigableExpr | undefined = match;
        let found = true;
        while (found && parent) {
          const ancestorCount = ancestors.get(parent.id());
          if (ancestorCount === undefined) {
            ancestors.set(parent.id(), 1);
            [parent, found] = parent.parent();
            continue;
          }
          if (
            leastCommonAncestorCount < ancestorCount ||
            (leastCommonAncestorCount === ancestorCount &&
              leastCommonAncestor.depth() < parent.depth())
          ) {
            leastCommonAncestor = parent;
            leastCommonAncestorCount = ancestorCount;
          }
          ancestors.set(parent.id(), ancestorCount + 1);
          [parent, found] = parent.parent();
        }
        this.inlineExpr(context, match, context.ident(inlineValue.alias()), inlineValue.type());
      }

      const copied = context.copyAstAndMetadata(inlineValue.definition());
      const binding = context.bindMacro({
        macroId: leastCommonAncestor.id(),
        remainingExpression: leastCommonAncestor,
        variableInitializer: copied,
        variableName: inlineValue.alias(),
      });
      this.inlineExpr(context, leastCommonAncestor, binding.astExpr, inlineValue.type());
      context.setMacroCall({
        expr: binding.macroExpr,
        id: leastCommonAncestor.id(),
      });
    }
    return ast;
  }

  /**
   * inlineExpr replaces an expression unless a presence test requires a type-safe rewrite.
   */
  private inlineExpr(
    context: OptimizerContext,
    previous: NavigableExpr,
    inlined: Expr,
    inlinedType: Type,
  ): void {
    const selection = previous.asSelect();
    if (previous.kind() !== ExprKind.Select || !selection?.isTestOnly()) {
      context.updateExpr({ target: previous, updated: inlined });
      return;
    }
    this.rewritePresenceExpr(context, previous, inlined, inlinedType);
  }

  /**
   * rewritePresenceExpr converts an inlined presence test to a type-safe expression.
   */
  private rewritePresenceExpr(
    context: OptimizerContext,
    previous: Expr,
    inlined: Expr,
    inlinedType: Type,
  ): void {
    if (inlined.kind() === ExprKind.Select) {
      const presence = context.hasMacro({
        macroId: previous.id(),
        selection: inlined,
      });
      context.updateExpr({ target: previous, updated: presence.astExpr });
      context.setMacroCall({ id: previous.id(), expr: presence.macroExpr });
      return;
    }

    context.clearMacroCall(previous.id());
    if (inlinedType.isAssignableType(NullType)) {
      context.updateExpr({
        target: previous,
        updated: context.call({
          functionName: operators.NotEquals,
          arguments: [inlined, context.literal(null)],
        }),
      });
      return;
    }
    if (inlinedType.hasTrait(SizerType)) {
      context.updateExpr({
        target: previous,
        updated: context.call({
          functionName: operators.NotEquals,
          arguments: [
            context.memberCall({
              functionName: overloads.Size,
              target: inlined,
            }),
            context.literal(0n),
          ],
        }),
      });
      return;
    }
    const zero = zeroValueExpr(context, inlinedType);
    if (zero) {
      context.updateExpr({
        target: previous,
        updated: context.call({
          functionName: operators.NotEquals,
          arguments: [inlined, zero],
        }),
      });
      return;
    }
    throw new Error(
      `unable to inline expression type ${inlinedType.toString()} into presence test`,
    );
  }

  /**
   * matchesVariable matches identifiers, qualified selections, and unshadowed presence tests.
   */
  private matchesVariable(expression: NavigableExpr, variableName: string): boolean {
    const [name, found] = maybeAsVariableName(expression);
    if (!found || name !== variableName) {
      return false;
    }

    let [parent, hasParent] = expression.parent();
    while (hasParent && parent) {
      if (parent.kind() === ExprKind.Comprehension) {
        const comprehension = parent.asComprehension()!;
        if (
          variableName === comprehension.accuVar() ||
          variableName === comprehension.iterVar() ||
          variableName === comprehension.iterVar2()
        ) {
          return false;
        }
      }
      [parent, hasParent] = parent.parent();
    }
    return true;
  }
}

/**
 * inlineVariable declares a variable name to be replaced by a checked expression.
 */
export function inlineVariable(options: InlineVariableOptions): InlineVariable {
  return new InlineVariable(options);
}

/**
 * inliningOptimizer creates an optimizer which replaces configured variables.
 */
export function inliningOptimizer(options: InliningOptimizerOptions = {}): InliningOptimizer {
  return new InliningOptimizer(options);
}

/**
 * inline creates an inlining optimizer from variable names and checked definitions.
 */
export function inline(definitions: InlineDefinitions): InliningOptimizer {
  return inliningOptimizer({
    variables: Object.entries(definitions).map(([name, definition]) =>
      inlineVariable({ name, definition }),
    ),
  });
}

/**
 * zeroValueExpr creates the empty or zero value expression for a CEL type when supported.
 */
function zeroValueExpr(context: OptimizerContext, type: Type): Expr | undefined {
  switch (type.kind()) {
    case Kind.Bool:
      return context.literal(false);
    case Kind.Double:
      return context.literal(0);
    case Kind.Duration:
      return context.call({
        functionName: overloads.TypeConvertDuration,
        arguments: [context.literal("0s")],
      });
    case Kind.Int:
      return context.literal(0n);
    case Kind.Timestamp:
      return context.call({
        functionName: overloads.TypeConvertTimestamp,
        arguments: [context.literal(0n)],
      });
    case Kind.Struct:
      return context.struct({ typeName: type.typeName(), fields: [] });
    case Kind.Uint:
      return context.literal({
        $typeName: "cel.expr.Constant",
        constantKind: { case: "uint64Value", value: 0n },
      });
    default:
      return undefined;
  }
}

/**
 * isBindable reports whether repeated matches can safely use a generated `cel.bind`.
 */
function isBindable(matches: NavigableExpr[], _inlined: Expr, inlinedType: Type): boolean {
  if (inlinedType.isAssignableType(NullType) || inlinedType.hasTrait(SizerType)) {
    return true;
  }
  for (const match of matches) {
    if (match.kind() === ExprKind.Select && match.asSelect()?.isTestOnly()) {
      return false;
    }
  }
  return true;
}

/**
 * maybeAsVariableName converts an identifier or selection into a qualified variable name.
 */
function maybeAsVariableName(expression: NavigableExpr): [string, boolean] {
  if (expression.kind() === ExprKind.Ident) {
    return [expression.asIdent() ?? "", true];
  }
  if (expression.kind() === ExprKind.Select) {
    const selection = expression.asSelect()!;
    const [qualifier, found] = toQualifiedName(selection.operand());
    if (found) {
      return [`${qualifier}.${selection.fieldName()}`, true];
    }
  }
  return ["", false];
}
