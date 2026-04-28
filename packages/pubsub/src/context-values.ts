/**
 * ContextValues provides a bag for passing arbitrary data through the interceptor
 * chain and to handlers within a single delivery.
 *
 * Unlike CloudEvent metadata (which crosses process boundaries), contextValues is an
 * in-process carrier for things like trace IDs, user authentication, or reentry guards.
 */
export interface ContextValues {
  /**
   * get returns a context value.
   */
  get<T>(key: ContextKey<T>): T;

  /**
   * set sets a context value. It returns the ContextValues to allow chaining.
   */
  set<T>(key: ContextKey<T>, value: T): this;

  /**
   * delete deletes a context value. It returns the ContextValues to allow chaining.
   */
  delete(key: ContextKey<unknown>): this;
}

/**
 * createContextValues creates a new ContextValues.
 */
export function createContextValues(): ContextValues {
  return {
    get<T>(key: ContextKey<T>) {
      return key.id in this ? (this[key.id] as T) : key.defaultValue;
    },
    set<T>(key: ContextKey<T>, value: T) {
      this[key.id] = value;
      return this;
    },
    delete(key) {
      delete this[key.id];
      return this;
    },
  } as Record<symbol, unknown> & ContextValues;
}

/**
 * ContextKey is a unique identifier for a context value.
 */
export type ContextKey<T> = {
  id: symbol;
  defaultValue: T;
};

/**
 * createContextKey creates a new ContextKey.
 */
export function createContextKey<T>(
  defaultValue: T,
  options?: { description?: string },
): ContextKey<T> {
  return { id: Symbol(options?.description), defaultValue };
}

/**
 * withReentryGuard runs a function while holding a boolean context key.
 *
 * If the guard key is already set, the function still runs, but the helper
 * does not modify the current guard state. This makes it safe to use in
 * interceptors that may trigger nested calls. To carry the guard into a nested
 * call, pass the same `contextValues` bag in that call's options.
 */
export async function withReentryGuard<T>(
  values: ContextValues,
  key: ContextKey<boolean>,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (values.get(key)) {
    return await fn();
  }
  values.set(key, true);
  try {
    return await fn();
  } finally {
    values.delete(key);
  }
}
