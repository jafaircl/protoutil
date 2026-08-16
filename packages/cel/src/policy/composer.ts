import { astOutputType, type Env, unwrapAst } from "../cel/env.js";
import { type ASTOptimizer, type OptimizerContext, staticOptimizer } from "../cel/optimizer.js";
import type { AST } from "../common/ast/ast.js";
import { type Expr, ExprKind, postOrderVisit } from "../common/ast/index.js";
import { variable } from "../common/decls.js";
import { DynType, exprTypeToType, type Type } from "../common/types/types.js";
import type { CompiledRule, CompiledVariable } from "./compiler.js";
import { RelativeSource } from "./source.js";

/**
 * RuleComposerOptions configures policy expression composition.
 */
export interface RuleComposerOptions {
  /**
   * expressionUnnestHeight determines the height at which nested expressions are
   * split into local variables within the `cel.@block` declaration.
   */
  expressionUnnestHeight?: number;
}

/**
 * ComposeRuleOptions identifies the compiled rule and environment to compose.
 */
export interface ComposeRuleOptions {
  /** env type-checks the composed CEL expression. */
  env: Env;
  /** rule is the compiled policy rule graph to compose. */
  rule: CompiledRule;
  /** options configures composition behavior. */
  options?: RuleComposerOptions;
}

/**
 * composeRule stitches a compiled policy rule graph into one checked CEL AST.
 */
export function composeRule(options: ComposeRuleOptions): AST {
  const expressionUnnestHeight = options.options?.expressionUnnestHeight ?? 25;
  if (expressionUnnestHeight <= 0) {
    throw new Error(`invalid unnest height: value must be positive: ${expressionUnnestHeight}`);
  }

  const composition = new RuleCompositionOptimizer(options.rule);
  const unnester = new RuleUnnestOptimizer(composition, expressionUnnestHeight);
  const placeholder = unwrapAst(options.env.compile("true"));
  const source = recoverOriginalSource(options.rule);
  return staticOptimizer({
    optimizers: [composition, unnester],
    ...(source ? { source } : {}),
  }).optimize(options.env, placeholder);
}

/**
 * VariableIndex records one lazily evaluated policy variable in a `cel.@block`.
 */
interface VariableIndex {
  /** index is the variable's position in the block declaration. */
  index: number;
  /** indexVariable is the internal identifier used by the composed expression. */
  indexVariable: string;
  /** localVariable is the policy-visible variable name. */
  localVariable: string;
  /** expression computes the variable value. */
  expression: Expr;
  /** type is the checked variable expression type. */
  type: Type;
}

/**
 * CompositionStep is an intermediate condition and output during first-match composition.
 */
interface CompositionStep {
  /** condition guards the output expression. */
  condition: Expr;
  /** expression is the output produced when the condition matches. */
  expression: Expr;
  /** optional reports whether this step may produce no value. */
  optional: boolean;
}

/**
 * CombineStepOptions contains two adjacent first-match composition steps.
 */
interface CombineStepOptions {
  /** context constructs checked-AST-compatible replacement nodes. */
  context: OptimizerContext;
  /** current is the higher-priority match being added. */
  current: CompositionStep;
  /** remaining is the already-composed lower-priority match sequence. */
  remaining?: CompositionStep;
}

/**
 * RuleCompositionOptimizer composes `CompiledRule` nodes using copied checked ASTs.
 */
class RuleCompositionOptimizer implements ASTOptimizer {
  /** nextVariableIndex is the next internal block slot number. */
  private nextVariableIndex = 0;
  /** variableIndices contains all block slots in evaluation dependency order. */
  private readonly variableIndices: VariableIndex[] = [];
  /** scopes maps policy variable names to their active block slots. */
  private readonly scopes: Array<Map<string, number>> = [];

  /** constructor stores the root compiled rule. */
  public constructor(private readonly rule: CompiledRule) {}

  /** variableCount returns the number of policy variable slots created during composition. */
  public variableCount(): number {
    return this.variableIndices.length;
  }

  /**
   * optimize replaces the placeholder AST with the composed rule expression.
   */
  public optimize(context: OptimizerContext, _input: AST): AST {
    const ruleExpression = this.optimizeRule(context, this.rule);
    if (this.variableIndices.length === 0) {
      return context.ast(ruleExpression);
    }

    // Policy variables are lazy and memoized. The block extension provides those semantics
    // while keeping each compiled variable AST intact.
    for (const variableIndex of this.variableIndices) {
      context.extendEnv({
        variables: [variable(variableIndex.indexVariable, variableIndex.type)],
      });
    }
    return context.ast(
      context.call({
        functionName: "cel.@block",
        arguments: [
          context.list({
            elements: this.variableIndices.map((value) => value.expression),
          }),
          ruleExpression,
        ],
      }),
    );
  }

  /**
   * optimizeRule recursively composes one compiled rule using first-match semantics.
   */
  private optimizeRule(context: OptimizerContext, rule: CompiledRule): Expr {
    this.enterScope();
    for (const variable of rule.variables()) {
      this.registerVariable(context, variable);
    }

    let output: CompositionStep | undefined;
    if (rule.hasOptionalOutput()) {
      output = {
        condition: context.literal(true),
        expression: context.call({ functionName: "optional.none" }),
        optional: true,
      };
    }

    const matches = rule.matches();
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const current = matches[index]!;
      const condition = context.copyAstAndMetadata(current.condition());
      const compiledOutput = current.output();
      if (compiledOutput) {
        output = combineStep({
          context,
          current: {
            condition,
            expression: context.copyAstAndMetadata(compiledOutput.expression()),
            optional: false,
          },
          remaining: output,
        });
        continue;
      }

      const nestedRule = current.nestedRule();
      if (nestedRule) {
        output = combineStep({
          context,
          current: {
            condition,
            expression: this.optimizeRule(context, nestedRule),
            optional: nestedRule.hasOptionalOutput(),
          },
          remaining: output,
        });
      }
    }

    if (!output) {
      this.exitScope();
      return context.call({ functionName: "optional.none" });
    }
    this.rewriteVariableNames(context, output.expression);
    this.exitScope();
    return output.expression;
  }

  /**
   * registerVariable assigns one compiled variable to a lazy block slot.
   */
  private registerVariable(context: OptimizerContext, variable: CompiledVariable): void {
    const localVariable = `variables.${variable.name()}`;
    const indexVariable = `@index${this.nextVariableIndex}`;
    const expression = context.copyAstAndMetadata(variable.expression());
    this.rewriteVariableNames(context, expression);
    const variableIndex: VariableIndex = {
      index: this.nextVariableIndex,
      indexVariable,
      localVariable,
      expression,
      type: astOutputType(variable.expression()),
    };
    this.variableIndices.push(variableIndex);
    this.scopes.at(-1)?.set(localVariable, variableIndex.index);
    this.nextVariableIndex += 1;
  }

  /**
   * rewriteVariableNames replaces policy variable identifiers with their scoped block slots.
   */
  private rewriteVariableNames(context: OptimizerContext, expression: Expr): void {
    postOrderVisit(expression, (candidate) => {
      let name = candidate.kind() === ExprKind.Ident ? candidate.asIdent() : undefined;
      if (candidate.kind() === ExprKind.Select) {
        const selection = candidate.asSelect();
        if (selection?.operand().asIdent() === "variables") {
          name = `variables.${selection.fieldName()}`;
        }
      }
      if (!name?.startsWith("variables.")) {
        return;
      }
      const index = this.lookupLocal(name);
      if (index === undefined) {
        return;
      }
      context.updateExpr({
        target: candidate,
        updated: context.ident(this.variableIndices[index]!.indexVariable),
      });
    });
  }

  /** lookupLocal resolves a policy variable from innermost to outermost scope. */
  private lookupLocal(name: string): number | undefined {
    for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
      const variableIndex = this.scopes[index]!.get(name);
      if (variableIndex !== undefined) {
        return variableIndex;
      }
    }
    return undefined;
  }

  /** enterScope creates a nested policy-variable scope. */
  private enterScope(): void {
    this.scopes.push(new Map());
  }

  /** exitScope removes the innermost policy-variable scope. */
  private exitScope(): void {
    this.scopes.pop();
  }
}

/**
 * UnnestedExpression records a call extracted into a lazy block slot.
 */
interface UnnestedExpression {
  /** indexVariable is the internal block identifier for the extracted call. */
  indexVariable: string;
  /** expression computes the extracted call value. */
  expression: Expr;
  /** type is the checked result type of the extracted call. */
  type: Type;
}

/**
 * RuleUnnestOptimizer splits deep call trees into lazy `cel.@block` slots.
 */
class RuleUnnestOptimizer implements ASTOptimizer {
  /** constructor stores the composition state and configured height threshold. */
  public constructor(
    private readonly composition: RuleCompositionOptimizer,
    private readonly expressionUnnestHeight: number,
  ) {}

  /**
   * optimize extracts eligible call subtrees while preserving existing policy-variable slots.
   */
  public optimize(context: OptimizerContext, input: AST): AST {
    let ruleExpression = input.expr();
    const variableExpressions: Expr[] = [];
    const rootCall = ruleExpression.asCall();
    if (rootCall?.functionName() === "cel.@block") {
      const argumentsList = rootCall.args()[0]?.asList();
      const result = rootCall.args()[1];
      if (!argumentsList || !result) {
        throw new Error("invalid cel.@block produced by policy composer");
      }
      ruleExpression = result;
      for (const expression of argumentsList.elements()) {
        variableExpressions.push(expression);
      }
      if (variableExpressions.length !== this.composition.variableCount()) {
        throw new Error("ast block list and computed one have different sizes");
      }
    }

    const candidates = unnestCandidates({
      expression: ruleExpression,
      heights: expressionHeights(ruleExpression),
      minimumHeight: this.expressionUnnestHeight,
    });
    // The root must remain the rule result. Every lower call is ordered leaf-to-root, so later
    // extracted slots may safely reference earlier slots.
    const extracted: UnnestedExpression[] = [];
    for (const candidate of candidates.slice(0, -1)) {
      const index = this.composition.variableCount() + extracted.length;
      const indexVariable = `@index${index}`;
      extracted.push({
        indexVariable,
        expression: context.copyAstAndMetadata(context.ast(candidate)),
        type: expressionType(input, candidate),
      });
      context.updateExpr({
        target: candidate,
        updated: context.ident(indexVariable),
      });
    }

    if (variableExpressions.length === 0 && extracted.length === 0) {
      return input;
    }
    // The optimizer context is shared between passes, so the composition pass has already
    // declared the original policy-variable slots. Only newly extracted slots need declarations.
    for (const value of extracted) {
      variableExpressions.push(value.expression);
      context.extendEnv({
        variables: [variable(value.indexVariable, value.type)],
      });
    }
    return context.ast(
      context.call({
        functionName: "cel.@block",
        arguments: [context.list({ elements: variableExpressions }), ruleExpression],
      }),
    );
  }
}

/**
 * UnnestCandidatesOptions configures deep-call candidate discovery.
 */
interface UnnestCandidatesOptions {
  /** expression is the composed rule result. */
  expression: Expr;
  /** heights maps expression ids to their subtree heights. */
  heights: ReadonlyMap<number, number>;
  /** minimumHeight is the threshold at which calls become candidates. */
  minimumHeight: number;
}

/**
 * unnestCandidates returns eligible calls in leaf-to-root order.
 */
function unnestCandidates(options: UnnestCandidatesOptions): Expr[] {
  const candidates: Expr[] = [];
  const visit = (expression: Expr, insideComprehension: boolean): void => {
    const inComprehension = insideComprehension || expression.kind() === ExprKind.Comprehension;
    for (const child of expression.children()) {
      visit(child, inComprehension);
    }
    // Expressions inside comprehensions may reference iteration or accumulator variables whose
    // scope does not exist outside the comprehension body.
    if (
      !insideComprehension &&
      expression.kind() === ExprKind.Call &&
      (options.heights.get(expression.id()) ?? 0) >= options.minimumHeight
    ) {
      candidates.push(expression);
    }
  };
  visit(options.expression, false);
  return candidates;
}

/**
 * expressionHeights computes subtree height for each expression id.
 */
function expressionHeights(expression: Expr): Map<number, number> {
  const result = new Map<number, number>();
  const visit = (candidate: Expr): number => {
    const childHeights = candidate.children().map(visit);
    const height =
      childHeights.length === 0
        ? candidate.kind() === ExprKind.Ident ||
          candidate.kind() === ExprKind.Literal ||
          candidate.kind() === ExprKind.Unspecified
          ? 0
          : 1
        : Math.max(...childHeights) + 1;
    result.set(candidate.id(), height);
    return height;
  };
  visit(expression);
  return result;
}

/**
 * expressionType returns a CEL-native type for one checked AST expression.
 */
function expressionType(ast: AST, expression: Expr): Type {
  const type = ast.getType(expression.id());
  return type ? exprTypeToType(type) : DynType;
}

/**
 * combineStep assembles two ordered match outputs according to cel-go first-match semantics.
 */
function combineStep(options: CombineStepOptions): CompositionStep {
  const { context, current, remaining } = options;
  if (!remaining) {
    return current;
  }
  const unconditional = isLiteralTrue(current.condition);
  const trueCondition = context.literal(true);

  if (!current.optional) {
    if (remaining.optional) {
      if (!unconditional) {
        return {
          condition: trueCondition,
          expression: context.call({
            functionName: "_?_:_",
            arguments: [
              current.condition,
              context.call({
                functionName: "optional.of",
                arguments: [current.expression],
              }),
              remaining.expression,
            ],
          }),
          optional: true,
        };
      }
      // An unconditional non-optional step prunes the remaining optional output.
      return current;
    }
    return {
      condition: trueCondition,
      expression: context.call({
        functionName: "_?_:_",
        arguments: [current.condition, current.expression, remaining.expression],
      }),
      optional: false,
    };
  }

  if (remaining.optional) {
    if (!unconditional) {
      return {
        condition: trueCondition,
        expression: context.call({
          functionName: "_?_:_",
          arguments: [current.condition, current.expression, remaining.expression],
        }),
        optional: true,
      };
    }
    if (!isOptionalNone(remaining.expression)) {
      return {
        condition: trueCondition,
        expression: context.memberCall({
          functionName: "or",
          target: current.expression,
          arguments: [remaining.expression],
        }),
        optional: true,
      };
    }
    return current;
  }

  if (!unconditional) {
    return {
      condition: trueCondition,
      expression: context.call({
        functionName: "_?_:_",
        arguments: [
          current.condition,
          current.expression,
          context.call({
            functionName: "optional.of",
            arguments: [remaining.expression],
          }),
        ],
      }),
      optional: true,
    };
  }
  return {
    condition: trueCondition,
    expression: context.memberCall({
      functionName: "orValue",
      target: current.expression,
      arguments: [remaining.expression],
    }),
    optional: false,
  };
}

/** isLiteralTrue reports whether an expression is the literal boolean `true`. */
function isLiteralTrue(expression: Expr): boolean {
  return expression.kind() === ExprKind.Literal && expression.asLiteral() === true;
}

/** isOptionalNone reports whether an expression is a zero-argument `optional.none` call. */
function isOptionalNone(expression: Expr): boolean {
  const call = expression.asCall();
  return (
    expression.kind() === ExprKind.Call &&
    call?.functionName() === "optional.none" &&
    call.args().length === 0
  );
}

/**
 * recoverOriginalSource finds a compiled expression carrying the original policy source.
 */
function recoverOriginalSource(rule: CompiledRule) {
  const firstMatch = rule.matches()[0];
  if (!firstMatch) {
    return undefined;
  }
  const expressionSource =
    firstMatch.output()?.expression().source() ?? firstMatch.condition().source();
  return expressionSource instanceof RelativeSource
    ? expressionSource.containingSource()
    : expressionSource;
}
