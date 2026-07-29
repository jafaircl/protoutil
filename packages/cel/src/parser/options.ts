import type { ConstantValue, EntryExpr, Expr } from "../common/ast/index.js";
import type { Doc } from "../common/doc.js";
import { AllMacros } from "./macro.js";

/**
 * ParserOptions mirrors the behavior flags from cel-go's parser options.
 */
export interface ParserOptions {
  /**
   * Limits recursive descent depth while parsing nested expressions.
   */
  maxRecursionDepth: number;
  /**
   * Limits the number of syntax errors reported for a single parse.
   */
  errorReportingLimit: number;
  /**
   * Limits how many parser recovery attempts may occur before bailing out.
   */
  errorRecoveryLimit: number;
  /**
   * Limits how far parser recovery may scan ahead for a viable token.
   */
  errorRecoveryTokenLookaheadLimit: number;
  /**
   * Limits the source size measured in Unicode code points.
   */
  expressionSizeCodePointLimit: number;
  /**
   * Preserves original macro call shapes in source info.
   */
  populateMacroCalls: boolean;
  /**
   * Enables optional select, index, and initializer syntax.
   */
  enableOptionalSyntax: boolean;
  /**
   * Emits compact logical operator calls for like-kind chains.
   */
  enableVariadicOperatorASTs: boolean;
  /**
   * Enables backtick-escaped identifiers.
   */
  enableIdentEscapeSyntax: boolean;
  /**
   * Chooses the hidden accumulator identifier used by comprehensions.
   */
  enableHiddenAccumulatorName: boolean;
  /**
   * Registers parser macros by signature.
   */
  macros: Map<string, Macro>;
  /**
   * Controls whether the standard parser macros are registered.
   */
  enableStandardMacros: boolean;
}

/**
 * ParserConfig provides a partial parser option override surface.
 */
export type ParserConfig = Partial<ParserOptions>;

/**
 * Macro describes a parser macro signature and expander.
 */
export interface Macro {
  /**
   * Names the function or receiver method matched by the macro.
   */
  function: string;
  /**
   * Declares the accepted positional argument count.
   */
  argCount: number | "*";
  /**
   * Indicates whether the macro matches receiver-style calls.
   */
  receiverStyle: boolean;
  /**
   * Expands the parsed call into its semantic CEL expression.
   */
  expander: MacroExpander;
  /**
   * Returns structured documentation for the macro when available.
   */
  documentation?(): Doc | undefined;
}

/**
 * MacroExpander converts a matched call into an expanded CEL expression.
 */
export type MacroExpander = (
  eh: ExprHelper,
  target: Expr | undefined,
  args: Expr[],
) => Expr | Error | undefined;

/**
 * ExprHelper assists macro implementations with parser-consistent id allocation and AST creation.
 */
export interface ExprHelper {
  /**
   * Copies an expression and assigns fresh ids to the clone tree.
   */
  copy(expr: Expr): Expr;
  /**
   * Builds a literal expression.
   */
  literal(value: ConstantValue): Expr;
  /**
   * Builds a list literal expression.
   */
  list(...elems: Expr[]): Expr;
  /**
   * Builds a map literal expression.
   */
  map(...entries: EntryExpr[]): Expr;
  /**
   * Builds a map entry expression.
   */
  mapEntry(key: Expr, value: Expr, optional: boolean): EntryExpr;
  /**
   * Builds a message construction expression.
   */
  struct(typeName: string, ...fields: EntryExpr[]): Expr;
  /**
   * Builds a message field initializer expression.
   */
  structField(name: string, value: Expr, optional: boolean): EntryExpr;
  /**
   * Builds a comprehension expression.
   */
  comprehension(
    iterRange: Expr,
    iterVar: string,
    accuVar: string,
    accuInit: Expr,
    condition: Expr,
    step: Expr,
    result: Expr,
  ): Expr;
  /**
   * Builds a two-variable comprehension expression.
   */
  comprehensionTwoVar(
    iterRange: Expr,
    iterVar: string,
    iterVar2: string,
    accuVar: string,
    accuInit: Expr,
    condition: Expr,
    step: Expr,
    result: Expr,
  ): Expr;
  /**
   * Builds an identifier expression.
   */
  ident(name: string): Expr;
  /**
   * Builds the accumulator identifier expression.
   */
  accuIdent(): Expr;
  /**
   * Returns the accumulator identifier name.
   */
  accuIdentName(): string;
  /**
   * Builds a global call expression.
   */
  call(fn: string, ...args: Expr[]): Expr;
  /**
   * Builds a receiver-style call expression.
   */
  memberCall(fn: string, target: Expr, ...args: Expr[]): Expr;
  /**
   * Builds a field presence test expression.
   */
  presenceTest(operand: Expr, field: string): Expr;
  /**
   * Builds an ordinary field selection expression.
   */
  select(operand: Expr, field: string): Expr;
  /**
   * Builds a parser error value tied to a specific expression id.
   */
  error(id: number, message: string, anchor?: "start" | "stop"): Error;
}

/**
 * parserOptions returns the default parser configuration.
 */
export function parserOptions(config: ParserConfig = {}): ParserOptions {
  validateParserConfig(config);
  return {
    maxRecursionDepth:
      config.maxRecursionDepth === -1 ? Number.MAX_SAFE_INTEGER : (config.maxRecursionDepth ?? 250),
    errorReportingLimit: config.errorReportingLimit ?? 100,
    errorRecoveryLimit:
      config.errorRecoveryLimit === -1
        ? Number.MAX_SAFE_INTEGER
        : (config.errorRecoveryLimit ?? 30),
    errorRecoveryTokenLookaheadLimit: config.errorRecoveryTokenLookaheadLimit ?? 256,
    expressionSizeCodePointLimit:
      config.expressionSizeCodePointLimit === -1
        ? Number.MAX_SAFE_INTEGER
        : (config.expressionSizeCodePointLimit ?? 100_000),
    populateMacroCalls: config.populateMacroCalls ?? false,
    enableOptionalSyntax: config.enableOptionalSyntax ?? false,
    enableVariadicOperatorASTs: config.enableVariadicOperatorASTs ?? false,
    enableIdentEscapeSyntax: config.enableIdentEscapeSyntax ?? true,
    enableHiddenAccumulatorName: config.enableHiddenAccumulatorName ?? true,
    macros:
      config.enableStandardMacros === false
        ? customMacroMap(config.macros?.values() ?? [])
        : macroMap(config.macros?.values() ?? []),
    enableStandardMacros: config.enableStandardMacros ?? true,
  };
}

/**
 * validateParserConfig enforces the same parser option invariants as cel-go.
 */
function validateParserConfig(config: ParserConfig): void {
  if (config.maxRecursionDepth !== undefined && config.maxRecursionDepth < -1) {
    throw new Error(
      `max recursion depth must be greater than or equal to -1: ${config.maxRecursionDepth}`,
    );
  }
  if (
    config.expressionSizeCodePointLimit !== undefined &&
    config.expressionSizeCodePointLimit < -1
  ) {
    throw new Error(
      `expression size code point limit must be greater than or equal to -1: ${config.expressionSizeCodePointLimit}`,
    );
  }
  if (config.errorReportingLimit !== undefined && config.errorReportingLimit <= 0) {
    throw new Error(`error reporting limit must be greater than 0: ${config.errorReportingLimit}`);
  }
  if (config.errorRecoveryLimit !== undefined && config.errorRecoveryLimit < -1) {
    throw new Error(
      `error recovery limit must be greater than or equal to -1: ${config.errorRecoveryLimit}`,
    );
  }
  if (
    config.errorRecoveryTokenLookaheadLimit !== undefined &&
    config.errorRecoveryTokenLookaheadLimit < 1
  ) {
    throw new Error(
      "error recovery lookahead token limit must be at least 1: " +
        config.errorRecoveryTokenLookaheadLimit,
    );
  }
}

/**
 * macroMap copies macros into a signature-keyed lookup table layered on top of the built-ins.
 */
export function macroMap(macros: Iterable<Macro> = []): Map<string, Macro> {
  const result = new Map<string, Macro>();
  for (const macro of AllMacros) {
    result.set(macroKey(macro.function, macro.argCount, macro.receiverStyle), macro);
  }
  for (const macro of macros) {
    result.set(macroKey(macro.function, macro.argCount, macro.receiverStyle), macro);
  }
  return result;
}

/**
 * customMacroMap copies only caller-provided macros into a signature-keyed lookup table.
 */
function customMacroMap(macros: Iterable<Macro>): Map<string, Macro> {
  const result = new Map<string, Macro>();
  for (const macro of macros) {
    result.set(macroKey(macro.function, macro.argCount, macro.receiverStyle), macro);
  }
  return result;
}

/**
 * macroKey formats a macro lookup key.
 */
export function macroKey(
  functionName: string,
  argCount: number | "*",
  receiverStyle: boolean,
): string {
  return `${functionName}:${argCount}:${receiverStyle}`;
}
