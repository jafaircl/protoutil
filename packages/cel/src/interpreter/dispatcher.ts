import type { Overload } from "../common/functions.js";

/**
 * Dispatcher resolves function calls to their appropriate overload.
 */
export interface Dispatcher {
  /**
   * add registers one or more overloads and rejects duplicate operator identifiers.
   */
  add(options: DispatcherAddOptions): void;

  /**
   * findOverload returns the overload registered for the provided operator identifier.
   */
  findOverload(overload: string): Overload | undefined;

  /**
   * overloadIds returns the set of all overload identifiers visible through the dispatcher chain.
   */
  overloadIds(): string[];
}

/**
 * DispatcherAddOptions configures dispatcher overload registration.
 */
export interface DispatcherAddOptions {
  /**
   * overloads lists the overload definitions to register.
   */
  overloads: Overload[];
}

/**
 * ExtendDispatcherOptions configures child-dispatcher creation.
 */
export interface ExtendDispatcherOptions {
  /**
   * parent is the dispatcher searched after the child-local overload set.
   */
  parent: Dispatcher;
}

/**
 * OverloadMap indexes overloads by operator identifier.
 */
type OverloadMap = Map<string, Overload>;

/**
 * DefaultDispatcher stores overloads and optionally delegates lookup to a parent dispatcher.
 */
class DefaultDispatcher implements Dispatcher {
  /**
   * constructor initializes the dispatcher with an optional parent.
   */
  constructor(
    private readonly overloadsValue: OverloadMap,
    private readonly parentValue?: Dispatcher,
  ) {}

  /**
   * add registers overloads on the current dispatcher.
   */
  public add(options: DispatcherAddOptions): void {
    for (const overload of options.overloads) {
      if (this.overloadsValue.has(overload.operator)) {
        throw new Error(`overload already exists '${overload.operator}'`);
      }
      this.overloadsValue.set(overload.operator, overload);
    }
  }

  /**
   * findOverload resolves the overload locally first, then through the parent dispatcher.
   */
  public findOverload(overload: string): Overload | undefined {
    const local = this.overloadsValue.get(overload);
    if (local !== undefined) {
      return local;
    }
    return this.parentValue?.findOverload(overload);
  }

  /**
   * overloadIds returns the visible overload identifiers without duplicating parent entries.
   */
  public overloadIds(): string[] {
    const ids = [...this.overloadsValue.keys()];
    if (this.parentValue === undefined) {
      return ids;
    }
    for (const parentId of this.parentValue.overloadIds()) {
      if (!this.overloadsValue.has(parentId)) {
        ids.push(parentId);
      }
    }
    return ids;
  }
}

/**
 * dispatcher returns an empty Dispatcher instance.
 */
export function dispatcher(): Dispatcher {
  return new DefaultDispatcher(new Map());
}

/**
 * extendDispatcher returns a dispatcher that inherits overloads from its parent.
 */
export function extendDispatcher(options: ExtendDispatcherOptions): Dispatcher {
  return new DefaultDispatcher(new Map(), options.parent);
}
