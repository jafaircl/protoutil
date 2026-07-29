import type { Env } from "../cel/env.js";
import type { AST } from "../common/ast/ast.js";
import type { Rule, Variable } from "./models.js";

/**
 * RuleComposerOptions configures policy expression composition.
 */
export interface RuleComposerOptions {
  /**
   * expressionUnnestHeight bounds composed expression height before intermediate
   * bindings are introduced. The TypeScript composer currently relies on CEL bind
   * expressions for every policy variable, which already bounds repeated work.
   */
  expressionUnnestHeight?: number;
}

/**
 * ComposeRuleOptions identifies the rule and environment to compose.
 */
export interface ComposeRuleOptions {
  /** env compiles the resulting CEL expression. */
  env: Env;
  /** rule is the policy rule graph to compose. */
  rule: Rule;
  /** options configures composition behavior. */
  options?: RuleComposerOptions;
}

/**
 * ComposedRule contains a single CEL expression and whether it may produce no value.
 */
export interface ComposedRule {
  /** expression is the composed CEL source. */
  expression: string;
  /** optional reports whether some evaluation path has no output. */
  optional: boolean;
}

/**
 * composeRule composes a policy rule graph into one checked CEL AST.
 */
export function composeRule(options: ComposeRuleOptions): AST {
  const composed = composeRuleSource(options.rule, new Map<string, string>(), { value: 0 });
  return options.env.compile(composed.expression);
}

/**
 * composeRuleSource converts a rule graph into a CEL source expression.
 */
export function composeRuleSource(
  rule: Rule,
  inheritedNames: ReadonlyMap<string, string> = new Map(),
  counter: { value: number } = { value: 0 },
): ComposedRule {
  const names = new Map(inheritedNames);
  const variables: Array<{ variable: Variable; expression: string }> = [];
  for (const value of rule.variables()) {
    counter.value += 1;
    const expression = rewriteVariables(value.expression().value, names);
    variables.push({ variable: value, expression });
    names.set(value.name().value, `(${expression})`);
  }

  let fallback: ComposedRule | undefined;
  const matches = rule.matches();
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const current = matches[index]!;
    const condition = rewriteVariables(current.condition().value || "true", names);
    const unconditional = condition.trim() === "true";
    let branch: ComposedRule;
    if (current.hasOutput()) {
      branch = {
        expression: rewriteVariables(current.output().value, names),
        optional: false,
      };
    } else if (current.hasRule()) {
      branch = composeRuleSource(current.rule()!, names, counter);
    } else {
      continue;
    }

    fallback = combineFirstMatch({
      condition,
      unconditional,
      branch,
      fallback,
    });
  }

  return fallback ?? { expression: "optional.none()", optional: true };
}

/**
 * CombineFirstMatchOptions describes one first-match composition step.
 */
interface CombineFirstMatchOptions {
  /** condition guards the current branch. */
  condition: string;
  /** unconditional reports whether the condition is exactly true. */
  unconditional: boolean;
  /** branch is the current output or nested rule. */
  branch: ComposedRule;
  /** fallback is the remainder of the match list. */
  fallback?: ComposedRule;
}

/**
 * combineFirstMatch combines one branch with the remaining first-match expression.
 */
function combineFirstMatch(options: CombineFirstMatchOptions): ComposedRule {
  const { branch, condition, fallback, unconditional } = options;
  if (!fallback) {
    if (unconditional) {
      return branch;
    }
    return branch.optional
      ? {
          expression: `${condition} ? ${branch.expression} : optional.none()`,
          optional: true,
        }
      : {
          expression: `${condition} ? optional.of(${branch.expression}) : optional.none()`,
          optional: true,
        };
  }

  if (unconditional && !branch.optional) {
    return branch;
  }

  if (unconditional && branch.optional) {
    return fallback.optional
      ? {
          expression: `${branch.expression}.or(${asOptional(fallback)})`,
          optional: true,
        }
      : {
          expression: `${branch.expression}.orValue(${fallback.expression})`,
          optional: false,
        };
  }

  if (branch.optional) {
    const guarded = `${condition} ? ${branch.expression} : optional.none()`;
    return fallback.optional
      ? {
          expression: `(${guarded}).or(${asOptional(fallback)})`,
          optional: true,
        }
      : {
          expression: `(${guarded}).orValue(${fallback.expression})`,
          optional: false,
        };
  }

  if (fallback.optional) {
    return {
      expression: `${condition} ? optional.of(${branch.expression}) : ${fallback.expression}`,
      optional: true,
    };
  }
  return {
    expression: `${condition} ? ${branch.expression} : ${fallback.expression}`,
    optional: false,
  };
}

/**
 * asOptional wraps a concrete expression in an optional value when necessary.
 */
function asOptional(value: ComposedRule): string {
  return value.optional ? value.expression : `optional.of(${value.expression})`;
}

/**
 * rewriteVariables maps policy namespace selections to hygienic local bind names.
 */
function rewriteVariables(expression: string, names: ReadonlyMap<string, string>): string {
  return expression.replace(/\bvariables\.([A-Za-z_][A-Za-z0-9_]*)\b/g, (reference, name) => {
    return names.get(name) ?? reference;
  });
}
