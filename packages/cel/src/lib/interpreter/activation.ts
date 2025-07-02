/* eslint-disable @typescript-eslint/no-explicit-any */

import { RefVal } from '../common/ref/reference.js';
import { HashMap, isFunction, isMap, isNil, isPlainObject, objectToMap } from '../common/utils.js';
import { AttributePattern } from './attribute-patterns.js';

/**
 * Activation used to resolve identifiers by name and references by id.
 *
 * An Activation is the primary mechanism by which a caller supplies input
 * into a CEL program.
 */
export interface Activation {
  /**
   * ResolveName returns a value from the activation by qualified name, or
   * null if the name could not be found.
   */
  resolveName<T = any>(name: string): T | null;

  /**
   * Parent returns the parent of the current activation, may be nil. If
   * non-nil, the parent will be searched during resolve calls.
   */
  parent(): Activation | null;
}

export function isActivation(value: any): value is Activation {
  return !isNil(value) && isFunction(value['resolveName']) && isFunction(value['parent']);
}

/**
 * EmptyActivation returns a variable-free activation.
 */
export class EmptyActivation implements Activation {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolveName(name: string): null {
    return null;
  }

  parent() {
    return null;
  }
}

/**
 * mapActivation which implements Activation and maps of named values.
 *
 * Named bindings may lazily supply values by providing a function which
 * accepts no arguments and produces an interface value.
 */
export class MapActivation implements Activation {
  #bindings: Map<any, any>;

  constructor(bindings: Map<any, any> | Record<any, any> = new Map()) {
    this.#bindings = isMap(bindings) ? bindings : objectToMap(bindings);
  }

  resolveName<T = any>(name: string): T | null {
    if (!this.#bindings.has(name)) {
      return null;
    }
    let obj = this.#bindings.get(name);
    if (isNil(obj)) {
      return null;
    }
    if (isFunction(obj)) {
      obj = obj();
      this.#bindings.set(name, obj);
    }
    return obj;
  }

  parent() {
    return null;
  }
}

/**
 * HierarchicalActivation which implements Activation and contains a parent and
 * child activation.
 */
export class HierarchicalActivation implements Activation {
  #parent: Activation;
  #child: Activation;

  constructor(parent: Activation, child: Activation) {
    this.#parent = parent;
    this.#child = child;
  }

  resolveName<T = any>(name: string): T | null {
    const value = this.#child.resolveName(name);
    if (!isNil(value)) {
      return value;
    }
    return this.#parent.resolveName(name);
  }

  parent() {
    return this.#parent;
  }
}

/**
 * NewActivation returns an activation based on a map-based binding where the
 * map keys are expected to be qualified names used with ResolveName calls.
 *
 * The input `bindings` may either be of type `Activation` or
 * `map[stringinterface{}`.
 *
 * Lazy bindings may be supplied within the map-based input in either of the
 * following forms:
 *   - func() interface{}
 *   - func() ref.Val
 *
 * The output of the lazy binding will overwrite the variable reference in the
 * internal map.
 *
 * Values which are not represented as ref.Val types on input may be adapted to
 * a ref.Val using the ref.TypeAdapter configured in the environment.
 */
export function newActivation(bindings: any) {
  if (isNil(bindings)) {
    throw new Error('activation input must not be nil');
  }
  if (isActivation(bindings)) {
    return bindings;
  }
  if (!isMap(bindings) && !isPlainObject(bindings) && !(bindings instanceof HashMap)) {
    throw new Error(
      `activation input must be an activation or map[string]interface: got ${typeof bindings}`
    );
  }
  return new MapActivation(bindings);
}

/**
 * PartialActivation extends the Activation interface with a set of
 * UnknownAttributePatterns.
 */
export interface PartialActivation extends Activation {
  /**
   * UnknownAttributePaths returns a set of AttributePattern values which match Attribute
   * expressions for data accesses whose values are not yet known.
   */
  unknownAttributePatterns(): AttributePattern[];
}

export class PartActivation implements PartialActivation, PartialActivationConverter {
  private _activation: Activation;
  private _unknowns: AttributePattern[];

  constructor(activation: Activation, unknowns: AttributePattern[]) {
    this._activation = activation;
    this._unknowns = unknowns ?? [];
  }

  resolveName<T = any>(name: string): T | null {
    return this._activation.resolveName(name);
  }

  parent() {
    return this._activation.parent();
  }

  /**
   * UnknownAttributePatterns returns a set of AttributePattern values which
   * match Attribute expressions for data accesses whose values are not yet
   * known.
   */
  unknownAttributePatterns() {
    return this._unknowns;
  }

  /**
   * AsPartialActivation returns the partActivation as a PartialActivation interface.
   */
  asPartialActivation(): PartialActivation {
    return this;
  }
}

export interface PartialActivationConverter {
  asPartialActivation(): PartialActivation;
}

export function isPartialActivationConverter(value: any): value is PartialActivationConverter {
  return !isNil(value) && isFunction(value['asPartialActivation']);
}

export function isPartialActivation(value: any): value is PartialActivation {
  return !isNil(value) && isFunction(value['unknownAttributePatterns']) && isActivation(value);
}

/**
 * AsPartialActivation walks the activation hierarchy and returns the first PartialActivation, if found.
 */
export function asPartialActivation(vars: Activation): PartialActivation | null {
  if (isPartialActivation(vars)) {
    return vars;
  }
  if (isPartialActivationConverter(vars)) {
    return vars.asPartialActivation();
  }
  // Since Activations may be hierarchical, test whether a parent converts to a PartialActivation
  const parent = vars.parent();
  if (!isNil(parent)) {
    return asPartialActivation(parent);
  }
  return null;
}

/**
 * varActivation represents a single mutable variable binding.
 *
 * This activation type should only be used within folds as the fold loop controls the object
 * life-cycle.
 */
export class varActivation implements Activation {
  constructor(
    private _parent: Activation,
    private _name: string,
    public val: RefVal | null = null
  ) {}

  resolveName<T = any>(name: string): T | null {
    if (this._name === name) {
      return (this.val as T) ?? null;
    }
    return this._parent.resolveName(name);
  }

  parent(): Activation | null {
    return this._parent;
  }
}
