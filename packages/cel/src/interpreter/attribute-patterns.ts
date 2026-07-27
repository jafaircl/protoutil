import { type Container, defaultContainer } from "../common/containers.js";
import {
  type Adapter,
  attributeTrail,
  DefaultTypeAdapter,
  Double,
  Int,
  type Provider,
  qualifyAttribute,
  Uint,
  Unknown,
  type Val,
} from "../common/types/index.js";
import type { Activation, PartialActivation } from "./activation.js";
import { asPartialActivation } from "./activation.js";
import {
  type Attribute,
  type AttributeFactory,
  attributeFactory,
  isAttribute,
  isConstantQualifier,
  type NamespacedAttribute,
  type Qualifier,
  type QualifierOptions,
  ResolutionError,
} from "./attributes.js";
import type { ExecutionFrame } from "./frame.js";

/**
 * AttributePattern represents a top-level variable with an optional set of qualifier patterns.
 *
 * When using a CEL expression within a container, e.g. a package or namespace, the variable name
 * in the pattern must match the qualified name produced during the variable namespace resolution.
 * For example, if variable `c` appears in an expression whose container is `a.b`, the variable
 * name supplied to the pattern must be `a.b.c`
 *
 * The qualifier patterns for attribute matching must be one of the following:
 *
 * - valid map key type: string, int, uint, bool
 * - wildcard (*)
 *
 * Examples:
 *
 * 1. ns.myvar["complex-value"]
 * 2. ns.myvar["complex-value"][0]
 * 3. ns.myvar["complex-value"].*.name
 *
 * The first example is simple: match an attribute where the variable is 'ns.myvar' with a
 * field access on 'complex-value'. The second example expands the match to indicate that only
 * a specific index `0` should match. And lastly, the third example matches any indexed access
 * that later selects the 'name' field.
 */
export class AttributePattern {
  /**
   * qualifierPatternsValue stores the qualifier patterns attached to the variable pattern.
   */
  private readonly qualifierPatternsValue: AttributeQualifierPattern[] = [];

  /**
   * variableValue stores the fully-qualified variable name for the pattern.
   */
  constructor(private readonly variableValue: string) {}

  /**
   * QualString adds a string qualifier pattern to the AttributePattern.
   *
   * The string may be a valid identifier, or string map key including empty string.
   */
  public qualString(pattern: string): AttributePattern {
    this.qualifierPatternsValue.push(new AttributeQualifierPattern({ value: pattern }));
    return this;
  }

  /**
   * QualInt adds an int qualifier pattern to the AttributePattern.
   *
   * The index may be either a map or list index.
   */
  public qualInt(pattern: number | bigint | Int): AttributePattern {
    this.qualifierPatternsValue.push(new AttributeQualifierPattern({ value: pattern }));
    return this;
  }

  /**
   * QualUint adds a uint qualifier pattern for a map index operation to the AttributePattern.
   */
  public qualUint(pattern: bigint | Uint): AttributePattern {
    this.qualifierPatternsValue.push(new AttributeQualifierPattern({ value: pattern }));
    return this;
  }

  /**
   * QualBool adds a bool qualifier pattern for a map index operation to the AttributePattern.
   */
  public qualBool(pattern: boolean): AttributePattern {
    this.qualifierPatternsValue.push(new AttributeQualifierPattern({ value: pattern }));
    return this;
  }

  /**
   * Wildcard adds a special sentinel qualifier pattern that will match any single qualifier.
   */
  public wildcard(): AttributePattern {
    this.qualifierPatternsValue.push(new AttributeQualifierPattern({ wildcard: true }));
    return this;
  }

  /**
   * VariableMatches returns true if the fully qualified variable matches the AttributePattern
   * fully qualified variable name.
   */
  public variableMatches(variable: string): boolean {
    return this.variableValue === variable;
  }

  /**
   * Variable returns the fully-qualified variable name for the pattern.
   */
  public variable(): string {
    return this.variableValue;
  }

  /**
   * QualifierPatterns returns the set of AttributeQualifierPattern values on the AttributePattern.
   */
  public qualifierPatterns(): AttributeQualifierPattern[] {
    return this.qualifierPatternsValue;
  }
}

/**
 * AttributeQualifierPatternOptions configures an AttributeQualifierPattern instance.
 */
export interface AttributeQualifierPatternOptions {
  /**
   * wildcard indicates whether the pattern matches any qualifier.
   */
  wildcard?: boolean;

  /**
   * value stores the expected qualifier value for non-wildcard matches.
   */
  value?: unknown;
}

/**
 * AttributeQualifierPattern holds a wildcard or valued qualifier pattern.
 */
export class AttributeQualifierPattern {
  /**
   * wildcardValue stores whether the pattern matches any qualifier.
   */
  private readonly wildcardValue: boolean;

  /**
   * valueValue stores the concrete qualifier value for non-wildcard patterns.
   */
  private readonly valueValue: unknown;

  /**
   * constructor initializes a qualifier pattern from the provided options.
   */
  constructor(options: AttributeQualifierPatternOptions = {}) {
    this.wildcardValue = options.wildcard ?? false;
    this.valueValue = options.value;
  }

  /**
   * Wildcard returns whether the pattern matches any qualifier.
   */
  public wildcard(): boolean {
    return this.wildcardValue;
  }

  /**
   * Value returns the concrete qualifier value for non-wildcard patterns.
   */
  public value(): unknown {
    return this.valueValue;
  }

  /**
   * Matches returns true if the qualifier pattern is a wildcard or the qualifier equals the pattern value.
   */
  public matches(qualifierValue: Qualifier): boolean {
    if (this.wildcardValue) {
      return true;
    }
    return qualifierPatternMatches(qualifierValue, this.valueValue);
  }
}

/**
 * AttributePatternValue produces a new mutable AttributePattern based on a variable name.
 */
export function attributePattern(variable: string): AttributePattern {
  return new AttributePattern(variable);
}

/**
 * PartialAttributeFactoryOptions configures partial-attribute factory construction.
 */
export interface PartialAttributeFactoryOptions {
  /**
   * containerValue provides the CEL container used for unchecked candidate-name expansion.
   */
  containerValue?: Container;

  /**
   * adapter converts native values to CEL values.
   */
  adapter?: Adapter;

  /**
   * provider resolves identifiers that are not regular variables.
   */
  provider?: Provider;
}

/**
 * PartialAttributeFactory wraps a regular attribute factory with unknown-pattern matching behavior.
 */
class PartialAttributeFactory implements AttributeFactory {
  /**
   * baseFactoryValue stores the underlying attribute runtime.
   */
  private readonly baseFactoryValue: AttributeFactory;

  /**
   * constructor initializes the shared dependencies for partial attribute matching.
   */
  constructor(
    private readonly containerValue: Container,
    adapterValue: Adapter,
    providerValue: Provider,
  ) {
    this.baseFactoryValue = attributeFactory({
      containerValue,
      adapter: adapterValue,
      provider: providerValue,
    });
  }

  /**
   * absoluteAttribute wraps the base namespaced attribute with unknown-pattern matching behavior.
   */
  public absoluteAttribute(id: number, ...names: string[]): NamespacedAttribute {
    return new AttributeMatcher(this.baseFactoryValue.absoluteAttribute(id, ...names), this);
  }

  /**
   * maybeAttribute ensures unchecked attributes use the partial namespaced attributes as they expand.
   */
  public maybeAttribute(id: number, name: string): Attribute {
    const names = name.startsWith(".") ? [name] : this.containerValue.resolveCandidateNames(name);
    return new MaybeAttributeWithFactory(id, [this.absoluteAttribute(id, ...names)], this);
  }

  /**
   * conditionalAttribute delegates to the base attribute factory and then wraps the result.
   */
  public conditionalAttribute(
    id: number,
    expr: { exec(frame: ExecutionFrame): Val; eval(vars: Activation): Val },
    truthy: Attribute,
    falsy: Attribute,
  ): Attribute {
    return this.baseFactoryValue.conditionalAttribute(id, expr, truthy, falsy);
  }

  /**
   * relativeAttribute delegates to the base attribute factory.
   */
  public relativeAttribute(
    id: number,
    operand: { exec(frame: ExecutionFrame): Val; eval(vars: Activation): Val },
  ): Attribute {
    return this.baseFactoryValue.relativeAttribute(id, operand);
  }

  /**
   * qualifier delegates to the base attribute factory.
   */
  public qualifier(options: QualifierOptions): Qualifier {
    return this.baseFactoryValue.qualifier(options);
  }

  /**
   * matchesUnknownPatterns determines whether an attribute path overlaps one of the partial activation patterns.
   */
  public matchesUnknownPatterns(
    vars: PartialActivation,
    attrId: number,
    variableNames: string[],
    qualifiersValue: Qualifier[],
  ): Unknown | undefined {
    const patterns = vars.unknownAttributePatterns();
    const candidateIndices = new Set<number>();
    for (const variable of variableNames) {
      for (const [index, pattern] of patterns.entries()) {
        if (pattern.variableMatches(variable)) {
          if (qualifiersValue.length === 0) {
            return new Unknown(new Map([[attrId, [attributeTrail(variable)]]]));
          }
          candidateIndices.add(index);
        }
      }
    }
    if (candidateIndices.size === 0) {
      return undefined;
    }
    const resolvedQualifiers = qualifiersValue.map((qualifierValue) => {
      if (isAttribute(qualifierValue)) {
        const resolved = qualifierValue.resolve(vars);
        if (resolved instanceof Unknown) {
          return this.qualifier({
            id: qualifierValue.id(),
            value: resolved,
            optional: qualifierValue.isOptional(),
          });
        }
        return this.qualifier({
          id: qualifierValue.id(),
          value: resolved,
          optional: qualifierValue.isOptional(),
        });
      }
      return qualifierValue;
    });
    for (const index of candidateIndices) {
      const pattern = patterns[index]!;
      const qualifierPatterns = pattern.qualifierPatterns();
      let isUnknownValue = true;
      let matchExprId = attrId;
      for (const [qualifierIndex, qualifierValue] of resolvedQualifiers.entries()) {
        if (qualifierIndex >= qualifierPatterns.length) {
          break;
        }
        matchExprId = qualifierValue.id();
        if (!qualifierPatterns[qualifierIndex]!.matches(qualifierValue)) {
          isUnknownValue = false;
          break;
        }
      }
      if (isUnknownValue) {
        const attr = attributeTrail(pattern.variable());
        for (
          let qualifierIndex = 0;
          qualifierIndex < qualifierPatterns.length && qualifierIndex < resolvedQualifiers.length;
          qualifierIndex += 1
        ) {
          const qualifierValue = resolvedQualifiers[qualifierIndex]!;
          if (isConstantQualifier(qualifierValue)) {
            const rawValue = qualifierValue.value().value();
            if (
              typeof rawValue === "boolean" ||
              typeof rawValue === "number" ||
              typeof rawValue === "bigint" ||
              typeof rawValue === "string"
            ) {
              qualifyAttribute(attr, rawValue);
            } else {
              qualifyAttribute(attr, String(rawValue));
            }
          } else {
            qualifyAttribute(attr, "*");
          }
        }
        return new Unknown(new Map([[matchExprId, [attr]]]));
      }
    }
    return undefined;
  }
}

/**
 * AttributeMatcher wraps a namespaced attribute with partial-activation unknown matching behavior.
 */
class AttributeMatcher implements NamespacedAttribute {
  /**
   * qualifiersValue stores the inspectable qualifier path for unknown matching.
   */
  private readonly qualifiersValue: Qualifier[] = [];

  /**
   * constructor initializes the wrapped namespaced attribute.
   */
  constructor(
    private readonly namespacedAttributeValue: NamespacedAttribute,
    private readonly factoryValue: PartialAttributeFactory,
  ) {}

  /**
   * id proxies to the wrapped attribute.
   */
  public id(): number {
    return this.namespacedAttributeValue.id();
  }

  /**
   * isOptional proxies to the wrapped attribute.
   */
  public isOptional(): boolean {
    return this.namespacedAttributeValue.isOptional();
  }

  /**
   * addQualifier stores the qualifier locally and forwards it to the wrapped attribute.
   */
  public addQualifier(qualifierValue: Qualifier): Attribute {
    this.namespacedAttributeValue.addQualifier(qualifierValue);
    this.qualifiersValue.push(qualifierValue);
    return this;
  }

  /**
   * candidateVariableNames proxies to the wrapped attribute.
   */
  public candidateVariableNames(): string[] {
    return this.namespacedAttributeValue.candidateVariableNames();
  }

  /**
   * qualifiers returns the locally tracked qualifiers used for partial matching.
   */
  public qualifiers(): Qualifier[] {
    return this.qualifiersValue;
  }

  /**
   * qualify applies the current attribute as a qualifier.
   */
  public qualify(vars: Activation, obj: unknown): unknown {
    const value = this.resolve(vars);
    if (value instanceof Unknown) {
      return value;
    }
    return this.factoryValue
      .qualifier({ id: this.id(), value, optional: this.isOptional() })
      .qualify(vars, obj);
  }

  /**
   * qualifyIfPresent applies the current attribute as a presence-tested qualifier.
   */
  public qualifyIfPresent(
    vars: Activation,
    obj: unknown,
    presenceOnly: boolean,
  ): [unknown, boolean] {
    const value = this.resolve(vars);
    if (value instanceof Unknown) {
      return [value, true];
    }
    return this.factoryValue
      .qualifier({ id: this.id(), value, optional: this.isOptional() })
      .qualifyIfPresent(vars, obj, presenceOnly);
  }

  /**
   * resolve returns an unknown value when a partial activation pattern overlaps the attribute.
   */
  public resolve(vars: Activation): unknown {
    const [partial, found] = asPartialActivation(vars);
    if (found && partial) {
      const unknownValue = this.factoryValue.matchesUnknownPatterns(
        partial,
        this.id(),
        this.candidateVariableNames(),
        this.qualifiersValue,
      );
      if (unknownValue !== undefined) {
        return unknownValue;
      }
    }
    return this.namespacedAttributeValue.resolve(vars);
  }
}

/**
 * MaybeAttributeWithFactory mirrors the base maybe attribute but ensures it expands using partial namespaced attributes.
 */
class MaybeAttributeWithFactory implements Attribute {
  /**
   * constructor initializes the maybe-attribute state.
   */
  constructor(
    private readonly idValue: number,
    private attrsValue: NamespacedAttribute[],
    private readonly factoryValue: AttributeFactory,
  ) {}

  /**
   * id returns the id of the leading candidate attribute.
   */
  public id(): number {
    return this.attrsValue[0]!.id();
  }

  /**
   * isOptional returns false because the top-level attribute itself is not optional.
   */
  public isOptional(): boolean {
    return false;
  }

  /**
   * addQualifier appends the qualifier to every candidate attribute and creates more specific name candidates.
   */
  public addQualifier(qualifierValue: Qualifier): Attribute {
    const augmentedNames: string[] = [];
    const isConst = isConstantQualifier(qualifierValue);
    const rawString =
      isConst && typeof qualifierValue.value().value() === "string"
        ? (qualifierValue.value().value() as string)
        : undefined;
    for (const attr of this.attrsValue) {
      if (rawString !== undefined && attr.qualifiers().length === 0) {
        for (const name of attr.candidateVariableNames()) {
          augmentedNames.push(`${name}.${rawString}`);
        }
      }
      attr.addQualifier(qualifierValue);
    }
    if (augmentedNames.length > 0) {
      this.attrsValue = [
        this.factoryValue.absoluteAttribute(qualifierValue.id(), ...augmentedNames),
        ...this.attrsValue,
      ];
    }
    return this;
  }

  /**
   * qualify resolves the current attribute and applies it as a qualifier.
   */
  public qualify(vars: Activation, obj: unknown): unknown {
    const value = this.resolve(vars);
    if (value instanceof Unknown) {
      return value;
    }
    return this.factoryValue
      .qualifier({ id: this.id(), value, optional: this.isOptional() })
      .qualify(vars, obj);
  }

  /**
   * qualifyIfPresent resolves the current attribute and applies it as a presence-tested qualifier.
   */
  public qualifyIfPresent(
    vars: Activation,
    obj: unknown,
    presenceOnly: boolean,
  ): [unknown, boolean] {
    const value = this.resolve(vars);
    if (value instanceof Unknown) {
      return [value, true];
    }
    return this.factoryValue
      .qualifier({ id: this.id(), value, optional: this.isOptional() })
      .qualifyIfPresent(vars, obj, presenceOnly);
  }

  /**
   * resolve tries each candidate attribute until one succeeds or a non-missing error is encountered.
   */
  public resolve(vars: Activation): unknown {
    let deferredError: ResolutionError | undefined;
    for (const attr of this.attrsValue) {
      try {
        return attr.resolve(vars);
      } catch (error) {
        if (!(error instanceof ResolutionError) || !error.isMissingAttribute()) {
          throw error;
        }
        deferredError ??= error;
      }
    }
    throw deferredError ?? new ResolutionError(String(this.idValue));
  }
}

/**
 * partialAttributeFactory creates an attribute factory that understands partial activation unknown patterns.
 */
export function partialAttributeFactory(
  options: PartialAttributeFactoryOptions = {},
): AttributeFactory {
  return new PartialAttributeFactory(
    options.containerValue ?? defaultContainer,
    options.adapter ?? DefaultTypeAdapter,
    options.provider ??
      ({
        enumValue: () => {
          throw new Error("provider not configured");
        },
        findIdent: () => [undefined, false],
        findStructType: () => [undefined, false],
        findStructFieldNames: () => [[], false],
        findStructFieldType: () => [undefined, false],
        newValue: () => {
          throw new Error("provider not configured");
        },
      } satisfies Provider),
  );
}

/**
 * qualifierPatternMatches tests whether a qualifier equals the given pattern value.
 */
function qualifierPatternMatches(qualifierValue: Qualifier, patternValue: unknown): boolean {
  if (isConstantQualifier(qualifierValue)) {
    const qualifierConstant = qualifierValue.value().value();
    if (typeof qualifierConstant === "boolean") {
      return typeof patternValue === "boolean" && qualifierConstant === patternValue;
    }
    if (typeof qualifierConstant === "string") {
      return typeof patternValue === "string" && qualifierConstant === patternValue;
    }
    if (typeof qualifierConstant === "number" || typeof qualifierConstant === "bigint") {
      return numericValueEquals(patternValue, qualifierConstant);
    }
  }
  return false;
}

/**
 * numericValueEquals uses CEL equality to determine whether two number values are equal.
 */
function numericValueEquals(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeNumericValue(left);
  const normalizedRight = normalizeNumericValue(right);
  if (normalizedLeft === undefined || normalizedRight === undefined) {
    return false;
  }
  if (typeof normalizedLeft === "bigint" && typeof normalizedRight === "bigint") {
    return normalizedLeft === normalizedRight;
  }
  if (typeof normalizedLeft === "number" && typeof normalizedRight === "number") {
    return Object.is(normalizedLeft, normalizedRight);
  }
  if (typeof normalizedLeft === "bigint" && typeof normalizedRight === "number") {
    return Number.isInteger(normalizedRight) && BigInt(normalizedRight) === normalizedLeft;
  }
  if (typeof normalizedLeft === "number" && typeof normalizedRight === "bigint") {
    return Number.isInteger(normalizedLeft) && BigInt(normalizedLeft) === normalizedRight;
  }
  return false;
}

/**
 * normalizeNumericValue converts interpreter numeric representations to primitive number or bigint values.
 */
function normalizeNumericValue(value: unknown): number | bigint | undefined {
  if (value instanceof Int || value instanceof Uint || value instanceof Double) {
    return value.value();
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return value;
  }
  return undefined;
}
