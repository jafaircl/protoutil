import {
  type AST,
  ExprKind,
  kindMatcher,
  matchDescendants,
  type NavigableExpr,
  navigateAst,
} from "../common/ast/index.js";
import type { Errors } from "../common/errors.js";
import * as overloads from "../common/overloads.js";
import { regexProgramSize } from "../common/types/regex.js";
import { compileRegexPattern } from "../common/types/string.js";
import { exprTypeToType, type Type } from "../common/types/types.js";
import type { Env } from "./env.js";

/**
 * DurationValidatorName is the unique duration literal validator name.
 */
const DurationValidatorName = "cel.validator.duration";

/**
 * RegexValidatorName is the unique regular-expression literal validator name.
 */
const RegexValidatorName = "cel.validator.matches";

/**
 * TimestampValidatorName is the unique timestamp literal validator name.
 */
const TimestampValidatorName = "cel.validator.timestamp";

/**
 * HomogeneousValidatorName is the unique aggregate literal validator name.
 */
const HomogeneousValidatorName = "cel.validator.homogeneous_literals";

/**
 * NestingLimitValidatorName is the unique comprehension nesting validator name.
 */
const NestingLimitValidatorName = "cel.validator.comprehension_nesting_limit";

/**
 * BindNestingLimitValidatorName is the unique cel.bind nesting validator name.
 */
const BindNestingLimitValidatorName = "cel.validator.bind_nesting_limit";

/**
 * RegexProgramSizeLimitValidatorName is the unique regex program-size validator name.
 */
const RegexProgramSizeLimitValidatorName = "cel.validator.regex_program_size_limit";

/**
 * HomogeneousAggregateLiteralExemptFunctions is the ValidatorConfig key used to configure
 * function names exempt from homogeneous type checks.
 *
 * For example, string formatting accepts a mixed element-type argument list corresponding to
 * format control clauses, even though other mixed element-type lists are usually unexpected.
 */
export const HomogeneousAggregateLiteralExemptFunctions = `${HomogeneousValidatorName}.exempt`;

/**
 * ValidatorConfig provides read access to validator configuration state.
 */
export interface ValidatorConfig {
  /**
   * Returns the configured value for a name, or the supplied default when no value is present.
   */
  getOrDefault<T>(name: string, defaultValue: T): T;
}

/**
 * MutableValidatorConfig provides mutation of validator configuration settings.
 */
export interface MutableValidatorConfig extends ValidatorConfig {
  /**
   * Sets a validator option while preserving the type established by an earlier value.
   */
  set(name: string, value: unknown): void;
}

/**
 * ASTValidator defines a singleton validator for a type-checked AST.
 */
export interface ASTValidator {
  /** config returns serializable validator settings when the validator has configuration. */
  config?(): Record<string, unknown>;
  /** Name returns the validator's unique name. */
  name(): string;
  /** Validate inspects a checked AST and reports any issues it finds. */
  validate(environment: Env, config: ValidatorConfig, ast: AST, issues: Errors): void;
}

/**
 * ValidatorConfigValue stores configuration shared by the validators in an environment.
 */
class ValidatorConfigValue implements MutableValidatorConfig {
  /** Data contains validator configuration keyed by its stable public name. */
  private readonly data = new Map<string, unknown>([
    [HomogeneousAggregateLiteralExemptFunctions, []],
  ]);

  /** Returns the configured value, or the supplied default when absent. */
  public getOrDefault<T>(name: string, defaultValue: T): T {
    return (this.data.has(name) ? this.data.get(name) : defaultValue) as T;
  }

  /** Sets a configuration value while requiring the same value category on replacement. */
  public set(name: string, value: unknown): void {
    if (this.data.has(name) && valueCategory(this.data.get(name)) !== valueCategory(value)) {
      throw new Error(
        `incompatible configuration type for ${name}, got ${valueCategory(value)}, wanted ${valueCategory(this.data.get(name))}`,
      );
    }
    this.data.set(name, value);
  }
}

/**
 * validatorConfig initializes validator configuration with core CEL defaults.
 */
export function validatorConfig(): MutableValidatorConfig {
  return new ValidatorConfigValue();
}

/**
 * extendedValidations collects common AST validations that reduce likely runtime errors.
 */
export function extendedValidations(): ASTValidator[] {
  return [
    validateDurationLiterals(),
    validateTimestampLiterals(),
    validateRegexLiterals(),
    validateHomogeneousAggregateLiterals(),
  ];
}

/**
 * validateDurationLiterals ensures duration literal arguments are valid immediately after checking.
 */
export function validateDurationLiterals(): ASTValidator {
  return new FormatValidator(DurationValidatorName, overloads.TypeConvertDuration, "duration");
}

/**
 * validateTimestampLiterals ensures timestamp literal arguments are valid immediately after checking.
 */
export function validateTimestampLiterals(): ASTValidator {
  return new FormatValidator(TimestampValidatorName, overloads.TypeConvertTimestamp, "timestamp");
}

/**
 * validateRegexLiterals ensures regular-expression patterns are valid immediately after checking.
 */
export function validateRegexLiterals(): ASTValidator {
  return new FormatValidator(RegexValidatorName, overloads.Matches, "matches");
}

/**
 * validateHomogeneousAggregateLiterals checks that list elements, map keys, and map values have
 * equivalent types.
 */
export function validateHomogeneousAggregateLiterals(): ASTValidator {
  return new HomogeneousAggregateLiteralValidator();
}

/**
 * validateComprehensionNestingLimit ensures comprehension nesting does not exceed the limit.
 *
 * Empty iteration ranges do not contribute to nesting because they have no looping cost. This also
 * permits comprehension-shaped local variable bindings such as `cel.bind`.
 */
export function validateComprehensionNestingLimit(limit: number): ASTValidator {
  return new NestingLimitValidator(limit);
}

/**
 * validateBindNestingLimit ensures that cel.bind macro nesting does not exceed the limit.
 *
 * This validator can be useful for preventing arbitrarily nested cel.bind macro calls.
 */
export function validateBindNestingLimit(limit: number): ASTValidator {
  return new BindNestingLimitValidator(limit);
}

/**
 * validateRegexProgramSizeLimit ensures literal regex programs do not exceed the limit.
 */
export function validateRegexProgramSizeLimit(limit: number): ASTValidator {
  return new RegexProgramSizeLimitValidator(limit);
}

/**
 * FormatKind identifies the constant argument syntax checked by a format validator.
 */
type FormatKind = "duration" | "matches" | "timestamp";

/**
 * FormatValidator validates literal arguments to a named CEL function.
 */
class FormatValidator implements ASTValidator {
  /**
   * Creates a validator for a function and its first non-target argument.
   */
  public constructor(
    /** ValidatorName is the stable singleton validator name. */
    private readonly validatorName: string,
    /** FunctionName is the CEL function inspected in the checked AST. */
    private readonly functionName: string,
    /** FormatKind selects the literal validation rule. */
    private readonly formatKind: FormatKind,
  ) {}

  /** Name returns the unique name of this function format validator. */
  public name(): string {
    return this.validatorName;
  }

  /**
   * Validate finds matching calls with constant arguments and validates their literal formats.
   */
  public validate(_environment: Env, _config: ValidatorConfig, ast: AST, issues: Errors): void {
    const calls = matchDescendants(
      navigateAst(ast),
      (expr) =>
        expr.kind() === ExprKind.Call && expr.asCall()?.functionName() === this.functionName,
    );
    for (const call of calls) {
      const argument = call.asCall()?.args()[0];
      if (argument === undefined || argument.kind() !== ExprKind.Literal) {
        continue;
      }
      if (!this.isValid(argument.asLiteral())) {
        issues.reportErrorAtId(
          argument.id(),
          ast.sourceInfo().getStartLocation(argument.id()),
          "invalid %s argument",
          this.functionName,
        );
      }
    }
  }

  /**
   * Reports whether a literal satisfies the configured format rule.
   */
  private isValid(value: unknown): boolean {
    switch (this.formatKind) {
      case "duration":
        return (
          typeof value === "string" && /^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+$/.test(value)
        );
      case "timestamp":
        if (typeof value === "string") {
          const timestamp = Date.parse(value);
          return (
            Number.isFinite(timestamp) &&
            /^\d{4}-\d{2}-\d{2}T/.test(value) &&
            new Date(timestamp).toISOString().startsWith(value.slice(0, 10))
          );
        }
        if (typeof value === "bigint") {
          return value >= -62_135_596_800n && value <= 253_402_300_799n;
        }
        return false;
      case "matches":
        if (typeof value !== "string") {
          return false;
        }
        try {
          compileRegexPattern(value);
          return true;
        } catch {
          return false;
        }
    }
  }
}

/**
 * HomogeneousAggregateLiteralValidator rejects mixed aggregate literal types.
 */
class HomogeneousAggregateLiteralValidator implements ASTValidator {
  /** Name returns the unique homogeneous type validator name. */
  public name(): string {
    return HomogeneousValidatorName;
  }

  /**
   * Validate checks list elements, map keys, and map values for equivalent checked types.
   */
  public validate(_environment: Env, config: ValidatorConfig, ast: AST, issues: Errors): void {
    const exemptFunctions = config.getOrDefault<string[]>(
      HomogeneousAggregateLiteralExemptFunctions,
      [],
    );
    const root = navigateAst(ast);
    for (const listExpr of matchDescendants(root, kindMatcher(ExprKind.List))) {
      if (inExemptFunction(listExpr, exemptFunctions)) {
        continue;
      }
      const list = listExpr.asList()!;
      let elementType: Type | undefined;
      for (const [index, element] of list.elements().entries()) {
        let actualType = checkedType(ast, element.id());
        if (list.isOptional(index)) {
          actualType = actualType?.parameters()[0];
        }
        if (elementType === undefined) {
          elementType = actualType;
        } else if (actualType !== undefined && !elementType.isEquivalentType(actualType)) {
          reportTypeMismatch(ast, issues, element.id(), elementType, actualType);
          break;
        }
      }
    }

    for (const mapExpr of matchDescendants(root, kindMatcher(ExprKind.Map))) {
      if (inExemptFunction(mapExpr, exemptFunctions)) {
        continue;
      }
      let keyType: Type | undefined;
      let valueType: Type | undefined;
      for (const entry of mapExpr.asMap()!.entries()) {
        const mapEntry = entry.asMapEntry()!;
        const key = mapEntry.key();
        const value = mapEntry.value();
        const actualKeyType = checkedType(ast, key.id());
        let actualValueType = checkedType(ast, value.id());
        if (mapEntry.isOptional()) {
          actualValueType = actualValueType?.parameters()[0];
        }
        if (keyType === undefined && valueType === undefined) {
          keyType = actualKeyType;
          valueType = actualValueType;
          continue;
        }
        if (
          keyType !== undefined &&
          actualKeyType !== undefined &&
          !keyType.isEquivalentType(actualKeyType)
        ) {
          reportTypeMismatch(ast, issues, key.id(), keyType, actualKeyType);
        }
        if (
          valueType !== undefined &&
          actualValueType !== undefined &&
          !valueType.isEquivalentType(actualValueType)
        ) {
          reportTypeMismatch(ast, issues, value.id(), valueType, actualValueType);
        }
      }
    }
  }
}

/**
 * NestingLimitValidator limits the depth of non-empty comprehension iteration.
 */
class NestingLimitValidator implements ASTValidator {
  /**
   * Creates a validator with a maximum non-empty comprehension depth.
   */
  public constructor(
    /** Limit is the maximum permitted nesting depth. */
    private readonly limit: number,
  ) {}

  /** Name returns the nesting-limit validator name. */
  public name(): string {
    return NestingLimitValidatorName;
  }

  /** config returns the serializable comprehension nesting limit. */
  public config(): Record<string, unknown> {
    return { limit: this.limit };
  }

  /** Validate reports comprehensions nested beyond the configured limit. */
  public validate(_environment: Env, _config: ValidatorConfig, ast: AST, issues: Errors): void {
    const comprehensions = matchDescendants(navigateAst(ast), kindMatcher(ExprKind.Comprehension));
    if (comprehensions.length <= this.limit) {
      return;
    }
    for (const comprehension of comprehensions) {
      let count = 0;
      let current: NavigableExpr | undefined = comprehension;
      while (current !== undefined) {
        if (current.kind() === ExprKind.Comprehension) {
          const range = current.asComprehension()!.iterRange();
          const emptyRange = range.kind() === ExprKind.List && range.asList()?.size() === 0;
          if (!emptyRange) {
            count += 1;
            if (count > this.limit) {
              issues.reportErrorAtId(
                comprehension.id(),
                ast.sourceInfo().getStartLocation(comprehension.id()),
                "comprehension exceeds nesting limit",
              );
              break;
            }
          }
        }
        [current] = current.parent();
      }
    }
  }
}

/**
 * BindNestingLimitValidator limits the depth of nested cel.bind macro expansions.
 */
class BindNestingLimitValidator implements ASTValidator {
  /** constructor records the maximum permitted bind nesting depth. */
  public constructor(private readonly limit: number) {}

  /** name returns the cel.bind nesting-limit validator name. */
  public name(): string {
    return BindNestingLimitValidatorName;
  }

  /** config returns the serializable cel.bind nesting limit. */
  public config(): Record<string, unknown> {
    return { limit: this.limit };
  }

  /** validate reports cel.bind comprehensions nested beyond the configured limit. */
  public validate(_environment: Env, _config: ValidatorConfig, ast: AST, issues: Errors): void {
    const binds = matchDescendants(
      navigateAst(ast),
      (expression) => expression.kind() === ExprKind.Comprehension && isCelBind(expression),
    );
    if (binds.length <= this.limit) {
      return;
    }
    for (const bind of binds) {
      let count = 0;
      let current: NavigableExpr | undefined = bind;
      while (current !== undefined) {
        if (isCelBind(current)) {
          count++;
          if (count > this.limit) {
            issues.reportErrorAtId(
              bind.id(),
              ast.sourceInfo().getStartLocation(bind.id()),
              "cel.bind exceeds nesting limit",
            );
            break;
          }
        }
        [current] = current.parent();
      }
    }
  }
}

/**
 * RegexProgramSizeLimitValidator limits the compiled instruction count of literal regex patterns.
 */
class RegexProgramSizeLimitValidator implements ASTValidator {
  /** constructor records the maximum permitted regex instruction count. */
  public constructor(private readonly limit: number) {}

  /** name returns the regex program-size validator name. */
  public name(): string {
    return RegexProgramSizeLimitValidatorName;
  }

  /** config returns the serializable regex program-size limit. */
  public config(): Record<string, unknown> {
    return { limit: this.limit };
  }

  /** validate reports literal regular expressions whose programs exceed the configured limit. */
  public validate(_environment: Env, _config: ValidatorConfig, ast: AST, issues: Errors): void {
    if (this.limit <= 0) {
      return;
    }
    const calls = matchDescendants(navigateAst(ast), kindMatcher(ExprKind.Call));
    for (const expression of calls) {
      const call = expression.asCall()!;
      if (!isRegexFunctionName(call.functionName())) {
        continue;
      }
      const patternIndex =
        (call.functionName() === overloads.Matches || call.functionName() === "matches") &&
        call.isMemberFunction()
          ? 0
          : 1;
      const argument = call.args()[patternIndex];
      if (argument?.kind() !== ExprKind.Literal || typeof argument.asLiteral() !== "string") {
        continue;
      }
      try {
        const size = regexProgramSize(argument.asLiteral() as string);
        if (size > this.limit) {
          issues.reportErrorAtId(
            argument.id(),
            ast.sourceInfo().getStartLocation(argument.id()),
            "regex program size %d exceeds limit of %d",
            size,
            this.limit,
          );
        }
      } catch {
        // Invalid regex literals are handled by the format validator.
      }
    }
  }
}

/**
 * isRegexFunctionName reports whether a function interprets one argument as a regex pattern.
 */
function isRegexFunctionName(functionName: string): boolean {
  return (
    functionName === overloads.Matches ||
    functionName === "matches" ||
    functionName === "regex.extract" ||
    functionName === "regex.extractAll" ||
    functionName === "regex.replace"
  );
}

/**
 * isCelBind reports whether a comprehension has the canonical cel.bind expansion shape.
 */
function isCelBind(expression: NavigableExpr): boolean {
  if (expression.kind() !== ExprKind.Comprehension) {
    return false;
  }
  const comprehension = expression.asComprehension()!;
  const iterRange = comprehension.iterRange();
  const loopCondition = comprehension.loopCondition();
  const loopStep = comprehension.loopStep();
  return (
    iterRange.kind() === ExprKind.List &&
    iterRange.asList()?.size() === 0 &&
    comprehension.iterVar() === "#unused" &&
    loopCondition.kind() === ExprKind.Literal &&
    loopCondition.asLiteral() === false &&
    loopStep.kind() === ExprKind.Ident &&
    loopStep.asIdent() === comprehension.accuVar()
  );
}

/**
 * Reports a homogeneous aggregate type mismatch at an expression id.
 */
function reportTypeMismatch(
  ast: AST,
  issues: Errors,
  id: number,
  expected: Type,
  actual: Type,
): void {
  issues.reportErrorAtId(
    id,
    ast.sourceInfo().getStartLocation(id),
    "expected type '%s' but found '%s'",
    expected.toString(),
    actual.toString(),
  );
}

/**
 * Converts checked protobuf type metadata into the native CEL type representation.
 */
function checkedType(ast: AST, id: number): Type | undefined {
  const type = ast.getType(id);
  return type === undefined ? undefined : exprTypeToType(type);
}

/**
 * Reports whether an expression is nested inside an exempt function call.
 */
function inExemptFunction(expression: NavigableExpr, exemptFunctions: string[]): boolean {
  let [parent, found] = expression.parent();
  while (found && parent !== undefined) {
    if (
      parent.kind() === ExprKind.Call &&
      exemptFunctions.includes(parent.asCall()?.functionName() ?? "")
    ) {
      return true;
    }
    [parent, found] = parent.parent();
  }
  return false;
}

/**
 * Returns a stable runtime category for validator configuration type checks.
 */
function valueCategory(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}
