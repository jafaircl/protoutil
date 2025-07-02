/* eslint-disable @typescript-eslint/no-explicit-any */
import { Container } from '../common/container.js';
import { Adapter, Provider } from '../common/ref/provider.js';
import { RefVal } from '../common/ref/reference.js';
import { defaultTypeAdapter } from '../common/types/provider.js';
import { Type } from '../common/types/types.js';
import { AttributeTrail, qualifyAttribute, UnknownRefVal } from '../common/types/unknown.js';
import { isFunction, isNil } from '../common/utils.js';
import {
  Activation,
  asPartialActivation,
  isPartialActivation,
  PartialActivation,
} from './activation.js';
import {
  AttrFactory,
  AttrFactoryOption,
  Attribute,
  AttributeFactory,
  attrQualify,
  attrQualifyIfPresent,
  isAttribute,
  isConstantQualifier,
  MaybeAttribute,
  NamespacedAttribute,
  Qualifier,
} from './attributes.js';
import { Interpretable } from './interpretable.js';

/**
 * AttributePattern represents a top-level variable with an optional set of
 * qualifier patterns.
 *
 * When using a CEL expression within a container, e.g. a package or namespace,
 * the variable name in the pattern must match the qualified name produced
 * during the variable namespace resolution. For example, if variable `c`
 * appears in an expression whose container is `a.b`, the variable  name
 * supplied to the pattern must be `a.b.c`
 *
 * The qualifier patterns for attribute matching must be one of the following:
 *
 *   - valid map key type: string, int, uint, bool
 *   - wildcard (*)
 *
 * Examples:
 *
 *  1. ns.myvar["complex-value"]
 *  2. ns.myvar["complex-value"][0]
 *  3. ns.myvar["complex-value"].*.name
 *
 * The first example is simple: match an attribute where the variable is
 * 'ns.myvar' with a field access on 'complex-value'. The second example
 * expands the match to indicate that only a specific index `0` should match.
 * And lastly, the third example matches any indexed access that later selects
 * the 'name' field.
 */
export class AttributePattern {
  #variable: string;
  #qualifierPatterns: AttributeQualifierPattern[] = [];

  constructor(public readonly variable: string) {
    this.#variable = variable;
  }

  /**
   * QualString adds a string qualifier pattern to the AttributePattern. The
   * string may be a valid identifier, or string map key including empty string.
   */
  qualString(pattern: string): AttributePattern {
    this.#qualifierPatterns.push(new AttributeQualifierPattern(false, pattern));
    return this;
  }

  /**
   * QualInt adds an int qualifier pattern to the AttributePattern. The index
   * may be either a map or list index.
   */
  qualInt(pattern: bigint): AttributePattern {
    this.#qualifierPatterns.push(new AttributeQualifierPattern(false, pattern));
    return this;
  }

  /**
   * QualUint adds an uint qualifier pattern for a map index operation to the
   * AttributePattern.
   */
  qualUint(pattern: bigint): AttributePattern {
    this.#qualifierPatterns.push(new AttributeQualifierPattern(false, pattern));
    return this;
  }

  /**
   * QualBool adds a bool qualifier pattern for a map index operation to the
   * AttributePattern.
   */
  qualBool(pattern: boolean): AttributePattern {
    this.#qualifierPatterns.push(new AttributeQualifierPattern(false, pattern));
    return this;
  }

  /**
   * Wildcard adds a special sentinel qualifier pattern that will match any
   * single qualifier.
   */
  wildcard(): AttributePattern {
    this.#qualifierPatterns.push(new AttributeQualifierPattern(true));
    return this;
  }

  /**
   * VariableMatches returns true if the fully qualified variable matches the
   * AttributePattern fully qualified variable name.
   */
  variableMatches(variable: string): boolean {
    return this.#variable === variable;
  }

  /**
   * QualifierPatterns returns the set of AttributeQualifierPattern values on
   * the AttributePattern.
   */
  qualifierPatterns(): AttributeQualifierPattern[] {
    return this.#qualifierPatterns;
  }
}

/**
 * AttributeQualifierPattern holds a wildcard or valued qualifier pattern.
 */
export class AttributeQualifierPattern {
  constructor(private readonly wildcard: boolean, private readonly value?: any) {
    if (isNil(wildcard) && isNil(value)) {
      throw new Error('wildcard or value must be non-nil');
    }
  }

  /**
   * Matches returns true if the qualifier pattern is a wildcard, or the
   * Qualifier implements the qualifierValueEquator interface and its
   * IsValueEqualTo returns true for the qualifier pattern.
   */
  matches(q: Qualifier): boolean {
    if (this.wildcard === true) {
      return true;
    }
    return isQualifierValueEquator(q) && q.qualifierValueEquals(this.value);
  }
}

/**
 * qualifierValueEquator defines an interface for determining if an input value, of valid map key type, is equal to the value held in the Qualifier. This interface is used by the AttributeQualifierPattern to determine pattern matches for non-wildcard qualifier patterns.
 *
 * Note: Attribute values are also Qualifier values; however, Attributes are resolved before qualification happens. This is an implementation detail, but one relevant to why the Attribute types do not surface in the list of implementations.
 *
 * See: partialAttributeFactory.matchesUnknownPatterns for more details on how this interface is used.
 */
export interface QualifierValueEquator {
  /**
   * QualifierValueEquals returns true if the input value is equal to the value
   * held in the Qualifier.
   */
  qualifierValueEquals(value: any): boolean;
}

export function isQualifierValueEquator(val: any): val is QualifierValueEquator {
  return val && isFunction(val.qualifierValueEquals);
}

/**
 * numericValueEquals uses CEL equality to determine whether two number values
 * are equal
 */
export function numericValueEquals(value: any, celValue: RefVal): boolean {
  const val = defaultTypeAdapter.nativeToValue(value);
  return celValue.equal(val).value() === true;
}

export class PartialAttributeFactory implements AttributeFactory {
  private _attributeFactory: AttrFactory;

  constructor(
    public readonly container: Container,
    public readonly adapter: Adapter,
    public readonly provider: Provider,
    ...opts: AttrFactoryOption[]
  ) {
    this._attributeFactory = new AttrFactory(container, adapter, provider, ...opts);
  }

  /**
   * AbsoluteAttribute implementation of the AttributeFactory interface which wraps the
   * NamespacedAttribute resolution in an internal attributeMatcher object to dynamically match
   * unknown patterns from PartialActivation inputs if given.
   */
  absoluteAttribute(id: bigint, ...names: string[]): NamespacedAttribute {
    const attr = this._attributeFactory.absoluteAttribute(id, ...names);
    return new AttributeMatcher(attr, this);
  }

  conditionalAttribute(id: bigint, expr: Interpretable, t: Attribute, f: Attribute): Attribute {
    return this._attributeFactory.conditionalAttribute(id, expr, t, f);
  }

  /**
   * MaybeAttribute implementation of the AttributeFactory interface which ensure that the set of
   * 'maybe' NamespacedAttribute values are produced using the partialAttributeFactory rather than
   * the base AttributeFactory implementation.
   */
  maybeAttribute(id: bigint, name: string): Attribute {
    return new MaybeAttribute(
      id,
      [this.absoluteAttribute(id, ...this.container.resolveCandidateNames(name))],
      this.adapter,
      this.provider,
      this
    );
  }

  relativeAttribute(id: bigint, operand: Interpretable): Attribute {
    return this._attributeFactory.relativeAttribute(id, operand);
  }

  newQualifier(objType: Type | null, qualID: bigint, val: any, opt: boolean): Qualifier | Error {
    return this._attributeFactory.newQualifier(objType, qualID, val, opt);
  }

  /**
   * matchesUnknownPatterns returns true if the variable names and qualifiers for a given
   * Attribute value match any of the ActivationPattern objects in the set of unknown activation
   * patterns on the given PartialActivation.
   *
   * For example, in the expression `a.b`, the Attribute is composed of variable `a`, with string
   * qualifier `b`. When a PartialActivation is supplied, it indicates that some or all of the data
   * provided in the input is unknown by specifying unknown AttributePatterns. An AttributePattern
   * that refers to variable `a` with a string qualifier of `c` will not match `a.b`; however, any
   * of the following patterns will match Attribute `a.b`:
   *
   * - `AttributePattern("a")`
   * - `AttributePattern("a").Wildcard()`
   * - `AttributePattern("a").QualString("b")`
   * - `AttributePattern("a").QualString("b").QualInt(0)`
   *
   * Any AttributePattern which overlaps an Attribute or vice-versa will produce an Unknown result
   * for the last pattern matched variable or qualifier in the Attribute. In the first matching
   * example, the expression id representing variable `a` would be listed in the Unknown result,
   * whereas in the other pattern examples, the qualifier `b` would be returned as the Unknown.
   */
  matchesUnknownPatterns(
    vars: PartialActivation,
    attrID: bigint,
    variableNames: string[],
    qualifiers: Qualifier[]
  ) {
    const patterns = vars.unknownAttributePatterns();
    const candidateIndices = new Set<number>();
    for (const variable of variableNames) {
      for (let i = 0; i < patterns.length; i++) {
        const pat = patterns[i];
        if (pat.variableMatches(variable)) {
          if (qualifiers.length === 0) {
            return new UnknownRefVal(attrID, new AttributeTrail(variable));
          }
          candidateIndices.add(i);
        }
      }
    }
    // Determine whether to return early if there are no candidate unknown patterns.
    if (candidateIndices.size === 0) {
      return null;
    }
    // Resolve the attribute qualifiers into a static set. This prevents more dynamic
    // Attribute resolutions than necessary when there are multiple unknown patterns
    // that traverse the same Attribute-based qualifier field.
    const newQuals: Qualifier[] = [];
    for (let i = 0; i < qualifiers.length; i++) {
      let qual: Qualifier | Error = qualifiers[i];
      if (isAttribute(qual)) {
        const attr = qual;
        const valOrErr = attr.resolve(vars);
        if (valOrErr instanceof Error) {
          return valOrErr;
        }
        // If this resolution behavior ever changes, new implementations of the
        // qualifierValueEquator may be required to handle proper resolution.
        qual = this.newQualifier(null, qual.id(), valOrErr, attr.isOptional());
        if (qual instanceof Error) {
          return qual;
        }
      }
      newQuals[i] = qual;
    }
    // Determine whether any of the unknown patterns match.
    for (const patIdx of candidateIndices) {
      const pat = patterns[patIdx];
      let isUnk = true;
      let matchExprID = attrID;
      const qualPats = pat.qualifierPatterns();
      for (let i = 0; i < newQuals.length; i++) {
        if (i >= qualPats.length) {
          break;
        }
        const qual = newQuals[i];
        matchExprID = qual.id();
        const qualPat = qualPats[i];
        // Note, the AttributeQualifierPattern relies on the input Qualifier not being an
        // Attribute, since there is no way to resolve the Attribute with the information
        // provided to the Matches call.
        if (!qualPat.matches(qual)) {
          isUnk = false;
          break;
        }
      }
      if (isUnk) {
        const attr = new AttributeTrail(pat.variable);
        for (let i = 0; i < qualPats.length && i < newQuals.length; i++) {
          const qual = newQuals[i];
          const ok = isConstantQualifier(qual);
          if (ok) {
            const v = qual.value().value();
            switch (typeof v) {
              case 'boolean':
                qualifyAttribute(attr, v);
                break;
              case 'number':
                qualifyAttribute(attr, v);
                break;
              case 'bigint':
                qualifyAttribute(attr, v);
                break;
              case 'string':
                qualifyAttribute(attr, v);
                break;
              default:
                qualifyAttribute(attr, v.toString());
                break;
            }
          } else {
            qualifyAttribute(attr, '*');
          }
        }
        return new UnknownRefVal(matchExprID, attr);
      }
    }
    return null;
  }
}

/**
 * attributeMatcher embeds the NamespacedAttribute interface which allows it to participate in
 * AttributePattern matching against Attribute values without having to modify the code paths that
 * identify Attributes in expressions.
 */
export class AttributeMatcher implements NamespacedAttribute {
  constructor(
    public readonly namespacedAttribute: NamespacedAttribute,
    public readonly fac: PartialAttributeFactory,
    public readonly _qualifiers: Qualifier[] = []
  ) {}

  candidateVariableNames(): string[] {
    return this.namespacedAttribute.candidateVariableNames();
  }

  qualifiers(): Qualifier[] {
    return this._qualifiers;
  }

  addQualifier(qualifier: Qualifier): Attribute | Error {
    // Add the qualifier to the embedded NamespacedAttribute. If the input to the Resolve
    // method is not a PartialActivation, or does not match an unknown attribute pattern, the
    // Resolve method is directly invoked on the underlying NamespacedAttribute.
    const attrOrErr = this.namespacedAttribute.addQualifier(qualifier);
    if (attrOrErr instanceof Error) {
      return attrOrErr;
    }
    // The attributeMatcher overloads TryResolve and will attempt to match unknown patterns against
    // the variable name and qualifier set contained within the Attribute. These values are not
    // directly inspectable on the top-level NamespacedAttribute interface and so are tracked within
    // the attributeMatcher.
    this._qualifiers.push(qualifier);
    return this;
  }

  /**
   * Resolve is an implementation of the NamespacedAttribute interface method which tests
   * for matching unknown attribute patterns and returns types.Unknown if present. Otherwise,
   * the standard Resolve logic applies.
   */
  resolve(vars: Activation) {
    const id = this.namespacedAttribute.id();
    // Bug in how partial activation is resolved, should search parents as well.
    const partial = asPartialActivation(vars);
    if (isPartialActivation(partial)) {
      const unk = this.fac.matchesUnknownPatterns(
        partial,
        id,
        this.candidateVariableNames(),
        this.qualifiers()
      );
      if (unk instanceof Error) {
        return unk;
      }
      if (!isNil(unk)) {
        return unk;
      }
    }
    return this.namespacedAttribute.resolve(vars);
  }

  id(): bigint {
    return this.namespacedAttribute.id();
  }

  isOptional(): boolean {
    return this.namespacedAttribute.isOptional();
  }

  qualify(vars: Activation, obj: any) {
    return attrQualify(this.fac, vars, obj, this);
  }

  qualifyIfPresent(
    vars: Activation,
    obj: any,
    presenceOnly: boolean
  ): [any | null, boolean, Error | null] {
    return attrQualifyIfPresent(this.fac, vars, obj, this, presenceOnly);
  }
}
