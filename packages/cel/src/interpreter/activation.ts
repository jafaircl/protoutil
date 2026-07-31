import type { Val } from "../common/types/index.js";
import { AttributePattern, attributePattern } from "./attribute-patterns.js";

/**
 * Activation used to resolve identifiers by name and references by id.
 *
 * An Activation is the primary mechanism by which a caller supplies input into a CEL program.
 */
export interface Activation {
  /**
   * ResolveName returns a value from the activation by qualified name, or false if the name
   * could not be found.
   */
  resolveName(name: string): [unknown, boolean];

  /**
   * Parent returns the parent of the current activation.
   *
   * If non-undefined, the parent will be searched during resolve calls.
   */
  parent(): Activation | undefined;
}

/**
 * ActivationBindings represents the inputs supported by activation construction.
 */
export type ActivationBindings = Activation | Record<string, unknown>;

/**
 * ActivationOptions configures activation construction.
 */
export interface ActivationOptions {
  /**
   * bindings contains either an existing activation or a map of qualified names to values.
   */
  bindings: unknown;
}

/**
 * HierarchicalActivationOptions configures hierarchical activation construction.
 */
export interface HierarchicalActivationOptions {
  /**
   * parent is the activation searched after the child.
   */
  parent: Activation;

  /**
   * child is the activation searched first.
   */
  child: Activation;
}

/**
 * PartialActivationOptions configures partial activation construction.
 */
export interface PartialActivationOptions {
  /**
   * bindings contains either an existing activation or a map of qualified names to values.
   */
  bindings: unknown;

  /**
   * unknowns lists the attribute patterns that should resolve to unknown results later in evaluation.
   */
  unknowns: AttributePattern[];
}

/**
 * ActivationWrapper identifies an object carrying local variables which should not be exposed to the user.
 *
 * Activations used for such purposes can be unwrapped to return the activation which omits local state.
 */
export interface ActivationWrapper {
  /**
   * Unwrap returns the Activation which omits local state.
   */
  unwrap(): Activation;
}

/**
 * PartialActivation extends the Activation interface with a set of UnknownAttributePatterns.
 */
export interface PartialActivation extends Activation {
  /**
   * UnknownAttributePatterns returns a set of AttributePattern values which match Attribute
   * expressions for data accesses whose values are not yet known.
   */
  unknownAttributePatterns(): AttributePattern[];
}

/**
 * PartialActivationConverter indicates whether an Activation implementation supports conversion to a PartialActivation.
 */
export interface PartialActivationConverter {
  /**
   * AsPartialActivation converts the current activation to a PartialActivation.
   */
  asPartialActivation(): [PartialActivation | undefined, boolean];
}

/**
 * LocalVariableHolder identifies an activation scope which can recognize local variables.
 */
export interface LocalVariableHolder {
  /** isLocalVariable reports whether name is locally bound in this activation hierarchy. */
  isLocalVariable(name: string): boolean;
}

/**
 * EmptyActivationImpl is a variable-free activation.
 */
class EmptyActivationImpl implements Activation {
  /**
   * ResolveName returns no value because the activation is empty.
   */
  public resolveName(_: string): [unknown, boolean] {
    return [undefined, false];
  }

  /**
   * Parent returns undefined because the activation is not hierarchical.
   */
  public parent(): Activation | undefined {
    return undefined;
  }
}

/**
 * emptyActivationValue is the shared variable-free activation instance.
 */
const emptyActivationValue = new EmptyActivationImpl();

/**
 * LazyBinding is the zero-argument function shape treated as a lazy variable binding.
 */
type LazyBinding = () => unknown;

/**
 * MapActivation implements Activation with named bindings.
 *
 * Named bindings may lazily supply values by providing a function which accepts no arguments and
 * produces an interface value.
 */
class MapActivation implements Activation {
  /**
   * constructor initializes the activation with its backing bindings map.
   */
  constructor(private readonly bindingsValue: Record<string, unknown>) {}

  /**
   * Parent returns undefined because the activation is not hierarchical.
   */
  public parent(): Activation | undefined {
    return undefined;
  }

  /**
   * ResolveName looks up the name in the map and memoizes lazy bindings after the first call.
   */
  public resolveName(name: string): [unknown, boolean] {
    if (!Object.hasOwn(this.bindingsValue, name)) {
      return [undefined, false];
    }
    let object = this.bindingsValue[name];
    if (typeof object === "function") {
      // CEL uses zero-argument functions as lazy bindings and caches the produced value.
      object = (object as LazyBinding)();
      this.bindingsValue[name] = object as Val | unknown;
    }
    return [object, true];
  }
}

/**
 * HierarchicalActivationImpl implements Activation with parent and child scopes.
 */
class HierarchicalActivationImpl
  implements Activation, ActivationWrapper, PartialActivationConverter, LocalVariableHolder
{
  /**
   * constructor initializes the parent-child activation chain.
   */
  constructor(
    private readonly parentValue: Activation,
    private readonly childValue: Activation,
  ) {}

  /**
   * Parent returns the parent activation.
   */
  public parent(): Activation | undefined {
    return this.parentValue;
  }

  /**
   * ResolveName checks the child first and then falls back to the parent.
   */
  public resolveName(name: string): [unknown, boolean] {
    const [object, found] = this.childValue.resolveName(name);
    if (found) {
      return [object, found];
    }
    return this.parentValue.resolveName(name);
  }

  /**
   * Unwrap returns the parent activation, stripping the local child scope.
   *
   * This allows global disambiguation to skip past locally introduced variables.
   */
  public unwrap(): Activation {
    return this.parentValue;
  }

  /**
   * AsPartialActivation checks the child first via direct type assertion, then walks the parent hierarchy.
   *
   * This mirrors the upstream behavior and avoids recursion through future frame-based wrappers.
   */
  public asPartialActivation(): [PartialActivation | undefined, boolean] {
    if (isPartialActivationConverter(this.childValue)) {
      const [partial, found] = this.childValue.asPartialActivation();
      if (found) {
        return [partial, true];
      }
    }
    return asPartialActivation(this.parentValue);
  }

  /**
   * isLocalVariable searches child and parent local scopes for a variable name.
   */
  public isLocalVariable(name: string): boolean {
    if (isLocalVariableHolder(this.childValue) && this.childValue.isLocalVariable(name)) {
      return true;
    }
    return isLocalVariableHolder(this.parentValue) && this.parentValue.isLocalVariable(name);
  }
}

/**
 * PartActivation is the default implementation of the PartialActivation interface.
 */
class PartActivation implements PartialActivation, PartialActivationConverter {
  /**
   * constructor initializes the wrapped activation and unknown attribute patterns.
   */
  constructor(
    private readonly activationValue: Activation,
    private readonly unknownsValue: AttributePattern[],
  ) {}

  /**
   * ResolveName delegates to the wrapped activation.
   */
  public resolveName(name: string): [unknown, boolean] {
    return this.activationValue.resolveName(name);
  }

  /**
   * Parent delegates to the wrapped activation.
   */
  public parent(): Activation | undefined {
    return this.activationValue.parent();
  }

  /**
   * UnknownAttributePatterns returns the patterns that should later yield unknown results.
   */
  public unknownAttributePatterns(): AttributePattern[] {
    return this.unknownsValue;
  }

  /**
   * AsPartialActivation returns the current instance as a PartialActivation.
   */
  public asPartialActivation(): [PartialActivation | undefined, boolean] {
    return [this, true];
  }
}

/**
 * EmptyActivation returns a variable-free activation.
 */
export function emptyActivation(): Activation {
  return emptyActivationValue;
}

/**
 * ActivationValue returns an activation based on a map-based binding where the map keys are
 * expected to be qualified names used with ResolveName calls.
 *
 * The input `bindings` may either be of type `Activation` or `map[string]any`.
 *
 * Lazy bindings may be supplied within the map-based input in either of the following forms:
 * - `() => any`
 * - `() => ref.Val`
 *
 * The output of the lazy binding will overwrite the variable reference in the internal map.
 */
export function activation(options: ActivationOptions): Activation {
  const { bindings } = options;
  if (bindings == null) {
    throw new globalThis.Error("bindings must be non-nil");
  }
  if (isActivation(bindings)) {
    return bindings;
  }
  if (!isStringRecord(bindings)) {
    throw new globalThis.Error(
      `activation input must be an activation or map[string]interface: got ${typeof bindings}`,
    );
  }
  return new MapActivation(bindings);
}

/**
 * HierarchicalActivation takes two activations and produces a new one which prioritizes
 * resolution in the child first and parent(s) second.
 */
export function hierarchicalActivation(options: HierarchicalActivationOptions): Activation {
  return new HierarchicalActivationImpl(options.parent, options.child);
}

/**
 * PartialActivation returns an Activation which contains a list of AttributePattern values
 * representing field and index operations that should result in an unknown value later in evaluation.
 *
 * The `bindings` value may be any value type supported by the activation call, but is typically
 * either an existing Activation or `map[string]any`.
 */
export function partialActivation(options: PartialActivationOptions): PartialActivation {
  return new PartActivation(activation({ bindings: options.bindings }), options.unknowns);
}

/**
 * AsPartialActivation walks the activation hierarchy and returns the first PartialActivation, if found.
 */
export function asPartialActivation(vars: Activation): [PartialActivation | undefined, boolean] {
  // Only internal activation instances may implement this interface.
  if (isPartialActivationConverter(vars)) {
    return vars.asPartialActivation();
  }
  // Since Activations may be hierarchical, test whether a parent converts to a PartialActivation.
  const parentValue = vars.parent();
  if (parentValue !== undefined) {
    return asPartialActivation(parentValue);
  }
  return [undefined, false];
}

/**
 * isActivation returns whether the input satisfies the Activation interface.
 */
export function isActivation(value: unknown): value is Activation {
  return (
    typeof value === "object" &&
    value !== null &&
    "resolveName" in value &&
    typeof (value as { resolveName?: unknown }).resolveName === "function" &&
    "parent" in value &&
    typeof (value as { parent?: unknown }).parent === "function"
  );
}

/**
 * isPartialActivationConverter returns whether the input can convert itself into a PartialActivation.
 */
export function isPartialActivationConverter(
  value: Activation,
): value is Activation & PartialActivationConverter {
  return "asPartialActivation" in value && typeof value.asPartialActivation === "function";
}

/**
 * isLocalVariableHolder reports whether an activation tracks locally bound variable names.
 */
export function isLocalVariableHolder(
  value: Activation,
): value is Activation & LocalVariableHolder {
  return "isLocalVariable" in value && typeof value.isLocalVariable === "function";
}

/**
 * AttributePatternValue re-exports the interpreter attribute pattern constructor.
 */
export { AttributePattern, attributePattern };

/**
 * isStringRecord returns whether the input is a plain object with string keys.
 */
function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
