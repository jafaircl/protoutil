import { astOutputType, type Env, type Issues, issues } from "../cel/env.js";
import type { AST } from "../common/ast/ast.js";
import { variableDecl } from "../common/decls.js";
import { errorsValue } from "../common/errors.js";
import type { Type } from "../common/types/types.js";
import { DynType } from "../common/types/types.js";
import { composeRuleSource } from "./composer.js";
import type { Match, Policy, Rule, ValueString, Variable } from "./models.js";

/**
 * CompilerOptions configures policy compilation without functional options.
 */
export interface CompilerOptions {
  /** maxNestedExpressions limits the combined variable and nested-rule count. */
  maxNestedExpressions?: number;
  /** matchOutputCompiler customizes output compilation. */
  matchOutputCompiler?: MatchOutputCompiler;
}

/**
 * MatchOutputCompiler compiles a match output using an application-defined strategy.
 */
export interface MatchOutputCompiler {
  /** compile compiles one match output expression. */
  compile(options: MatchOutputCompileOptions): AST;
}

/**
 * MatchOutputCompileOptions provides context for custom match output compilation.
 */
export interface MatchOutputCompileOptions {
  /** env is the environment active at the match. */
  env: Env;
  /** match is the match whose output is being compiled. */
  match: Match;
  /** policy is the containing policy. */
  policy: Policy;
}

/**
 * CompilePolicyResult contains the composed AST and compilation diagnostics.
 */
export interface CompilePolicyResult {
  /** ast is the compiled policy expression when compilation succeeds. */
  ast?: AST;
  /** issues contains policy and CEL diagnostics. */
  issues: Issues;
}

/**
 * compilePolicy combines policy compilation and composition into a single call.
 */
export function compilePolicy(
  env: Env,
  parsedPolicy: Policy,
  options: CompilerOptions = {},
): CompilePolicyResult {
  const compiled = compilePolicyRule(env, parsedPolicy, options);
  if (!compiled.rule || compiled.issues.err()) {
    return { issues: compiled.issues };
  }
  const root = parsedPolicy.rule();
  if (!root) {
    compiled.issues.reportErrorAtId({
      id: parsedPolicy.name().id,
      message: "policy does not specify a rule",
    });
    return { issues: compiled.issues };
  }

  const composed = composeRuleSource(root);
  const result = env.tryCompile(composed.expression);
  if (result.errors) {
    return { issues: compiled.issues.append(result.errors) };
  }
  return { ast: result.ast, issues: compiled.issues };
}

/**
 * CompilePolicyRuleResult contains the intermediate rule graph and diagnostics.
 */
export interface CompilePolicyRuleResult {
  /** rule is the compiled rule graph when policy structure is valid. */
  rule?: CompiledRule;
  /** issues contains compilation diagnostics. */
  issues: Issues;
}

/**
 * compilePolicyRule compiles each expression in a policy rule graph.
 */
export function compilePolicyRule(
  env: Env,
  parsedPolicy: Policy,
  options: CompilerOptions = {},
): CompilePolicyRuleResult {
  const diagnostics = issues({
    errors: errorsValue(parsedPolicy.source()),
    sourceInfo: parsedPolicy.sourceInfo(),
  });
  const limit = options.maxNestedExpressions ?? 100;
  if (limit <= 0) {
    diagnostics.reportErrorAtId({
      id: parsedPolicy.name().id,
      message: "error configuring compiler option: nested expression limit must be positive: %s",
      args: [limit],
    });
    return { issues: diagnostics };
  }
  const root = parsedPolicy.rule();
  if (!root) {
    diagnostics.reportErrorAtId({
      id: parsedPolicy.name().id,
      message: "policy does not specify a rule",
    });
    return { issues: diagnostics };
  }

  const state: CompileState = { nestedCount: 0, limit };
  const compiled = compileRule({
    env,
    policy: parsedPolicy,
    rule: root,
    issues: diagnostics,
    state,
  });
  return diagnostics.err()
    ? { rule: compiled, issues: diagnostics }
    : { rule: compiled, issues: diagnostics };
}

/**
 * CompiledRule represents variables and match blocks associated with a rule.
 */
export class CompiledRule {
  /** constructor stores the compiled form of a rule. */
  public constructor(
    private readonly sourceIdValue: number,
    private readonly idValue: ValueString,
    private readonly variablesValue: CompiledVariable[],
    private readonly matchesValue: CompiledMatch[],
  ) {}

  /** sourceId returns the source metadata identifier associated with the rule. */
  public sourceId(): number {
    return this.sourceIdValue;
  }

  /** id returns the expression identifier associated with the rule. */
  public id(): ValueString {
    return this.idValue;
  }

  /** variables returns compiled variables associated with the rule. */
  public variables(): CompiledVariable[] {
    return [...this.variablesValue];
  }

  /** matches returns compiled matches associated with the rule. */
  public matches(): CompiledMatch[] {
    return [...this.matchesValue];
  }

  /** outputType returns the output type shared by all match clauses. */
  public outputType(): Type {
    return this.matchesValue[0]?.outputType() ?? DynType;
  }

  /**
   * hasOptionalOutput reports whether some evaluation path may produce no value.
   */
  public hasOptionalOutput(): boolean {
    let optionalOutput = false;
    for (const compiledMatch of this.matchesValue) {
      const nested = compiledMatch.nestedRule();
      if (nested?.hasOptionalOutput()) {
        // An unconditional nested optional rule may fall through to the next parent match.
        if (!compiledMatch.conditionIsTrue()) {
          return true;
        }
        optionalOutput = true;
      } else if (compiledMatch.conditionIsTrue()) {
        return false;
      } else {
        optionalOutput = true;
      }
    }
    return optionalOutput;
  }
}

/**
 * CompiledVariable represents a variable name, expression, and output type.
 */
export class CompiledVariable {
  /** constructor stores one compiled variable. */
  public constructor(
    private readonly sourceIdValue: number,
    private readonly nameValue: string,
    private readonly expressionValue: AST,
  ) {}

  /** sourceId returns the source metadata identifier associated with the variable. */
  public sourceId(): number {
    return this.sourceIdValue;
  }

  /** name returns the variable name. */
  public name(): string {
    return this.nameValue;
  }

  /** expression returns the checked variable expression. */
  public expression(): AST {
    return this.expressionValue;
  }
}

/**
 * OutputValue represents a compiled output expression.
 */
export class OutputValue {
  /** constructor stores one compiled match output. */
  public constructor(
    private readonly sourceIdValue: number,
    private readonly expressionValue: AST,
  ) {}

  /** sourceId returns the source identifier associated with the output. */
  public sourceId(): number {
    return this.sourceIdValue;
  }

  /** expression returns the checked output expression. */
  public expression(): AST {
    return this.expressionValue;
  }
}

/**
 * CompiledMatch represents a condition and either an output or nested rule.
 */
export class CompiledMatch {
  /** constructor stores one compiled match. */
  public constructor(
    private readonly sourceIdValue: number,
    private readonly conditionValue: AST,
    private readonly conditionSourceValue: string,
    private readonly outputValue?: OutputValue,
    private readonly nestedRuleValue?: CompiledRule,
  ) {}

  /** sourceId returns the source identifier associated with the match. */
  public sourceId(): number {
    return this.sourceIdValue;
  }

  /** condition returns the compiled predicate. */
  public condition(): AST {
    return this.conditionValue;
  }

  /** conditionIsTrue reports whether the condition is the literal true expression. */
  public conditionIsTrue(): boolean {
    return this.conditionSourceValue.trim() === "true";
  }

  /** output returns the compiled output when set. */
  public output(): OutputValue | undefined {
    return this.outputValue;
  }

  /** nestedRule returns the compiled nested rule when set. */
  public nestedRule(): CompiledRule | undefined {
    return this.nestedRuleValue;
  }

  /** outputType returns the output type of the output or nested rule. */
  public outputType(): Type {
    const ast = this.outputValue?.expression();
    if (ast) {
      return astOutputType(ast);
    }
    return this.nestedRuleValue?.outputType() ?? DynType;
  }
}

/**
 * CompileState tracks the resource limit across a complete rule graph.
 */
interface CompileState {
  /** nestedCount is the number of variables and nested rules compiled so far. */
  nestedCount: number;
  /** limit is the configured maximum nested expression count. */
  limit: number;
}

/**
 * CompileRuleOptions describes one recursive rule compilation.
 */
interface CompileRuleOptions {
  /** env is the active CEL environment. */
  env: Env;
  /** policy is the containing policy. */
  policy: Policy;
  /** rule is the rule being compiled. */
  rule: Rule;
  /** issues accumulates diagnostics. */
  issues: Issues;
  /** state tracks the global nesting limit. */
  state: CompileState;
}

/**
 * compileRule recursively compiles variables, conditions, outputs, and nested rules.
 */
function compileRule(options: CompileRuleOptions): CompiledRule {
  const variables: CompiledVariable[] = [];
  let activeEnv = options.env;
  for (const value of options.rule.variables()) {
    const result = activeEnv.tryCompile(value.expression().value);
    if (result.errors) {
      appendIssues(options.issues, result.errors);
    }
    variables.push(new CompiledVariable(value.name().id, value.name().value, result.ast));
    const variableType = astOutputType(result.ast);
    activeEnv = activeEnv.extend({
      variables: [variableDecl(`variables.${value.name().value}`, variableType)],
    });
    incrementNesting(options, value, "variable");
  }

  const matches: CompiledMatch[] = [];
  for (const value of options.rule.matches()) {
    const condition = activeEnv.tryCompile(value.condition().value || "true");
    if (condition.errors) {
      appendIssues(options.issues, condition.errors);
    }
    let output: OutputValue | undefined;
    let nested: CompiledRule | undefined;
    if (value.hasOutput()) {
      const compiledOutput = activeEnv.tryCompile(value.output().value);
      if (compiledOutput.errors) {
        appendIssues(options.issues, compiledOutput.errors);
      }
      output = new OutputValue(value.output().id, compiledOutput.ast);
    } else if (value.hasRule()) {
      nested = compileRule({ ...options, env: activeEnv, rule: value.rule()! });
      incrementNesting(options, value.rule()!, "rule");
    }
    matches.push(
      new CompiledMatch(value.sourceId(), condition.ast, value.condition().value, output, nested),
    );
  }

  const compiled = new CompiledRule(options.rule.sourceId(), options.rule.id(), variables, matches);
  validateUnreachable(compiled, options.issues);
  return compiled;
}

/**
 * incrementNesting applies the compiler's nested expression resource limit.
 */
function incrementNesting(
  options: CompileRuleOptions,
  value: Variable | Rule,
  kind: "variable" | "rule",
): void {
  options.state.nestedCount += 1;
  if (options.state.nestedCount === options.state.limit + 1) {
    const id = value instanceof Object && "sourceId" in value ? value.sourceId() : 0;
    options.issues.reportErrorAtId({
      id,
      message: `${kind} exceeds nested expression limit`,
    });
  }
}

/**
 * validateUnreachable rejects unconditional exhaustive matches followed by other matches.
 */
function validateUnreachable(rule: CompiledRule, diagnostics: Issues): void {
  const matches = rule.matches();
  for (let index = matches.length - 2; index >= 0; index -= 1) {
    const value = matches[index]!;
    const exhaustive =
      value.conditionIsTrue() && (!value.nestedRule() || !value.nestedRule()!.hasOptionalOutput());
    if (exhaustive) {
      diagnostics.reportErrorAtId({
        id: value.output()
          ? value.sourceId()
          : (value.nestedRule()?.sourceId() ?? value.sourceId()),
        message: value.output()
          ? "match creates unreachable outputs"
          : "rule creates unreachable outputs",
      });
      return;
    }
  }
}

/**
 * appendIssues copies diagnostics into the policy issue accumulator.
 */
function appendIssues(target: Issues, source: Issues): void {
  const combined = target.append(source);
  // Issues are immutable when appended, so replay the source diagnostics at their original ids.
  if (combined !== target) {
    for (const error of source.errors()) {
      target.reportErrorAtId({ id: error.exprId, message: "%s", args: [error.message] });
    }
  }
}
