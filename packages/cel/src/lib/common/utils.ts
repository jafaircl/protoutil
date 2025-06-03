/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-case-declarations */
import stringify from 'safe-stable-stringify';
import { Expr } from '../protogen/cel/expr/syntax_pb.js';

export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isFunction(value: unknown): value is (...args: any[]) => any {
  return typeof value === 'function';
}

export function isString(value: unknown): value is string {
  return Object.prototype.toString.call(value).slice(8, -1) === 'String';
}

export function isMap<K, V>(value: unknown): value is Map<K, V> {
  return value instanceof Map;
}

export function isSet<K>(value: unknown): value is Set<K> {
  return value instanceof Set;
}

export function isPlainObject<K extends string | number | symbol, V>(
  value: unknown | Record<K, V>
): value is Record<K, V> {
  if (typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype.constructor.name === 'Object';
}

export function isBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isEmpty(value: unknown): boolean {
  if (isNil(value)) {
    return true;
  }
  if (isString(value)) {
    return value.length === 0;
  }
  if (isMap(value) || isSet(value)) {
    return value.size === 0;
  }
  if (isPlainObject(value)) {
    return Object.keys(value).length === 0;
  }
  return false;
}

export function unquote(str: string) {
  const reg = /['"`]/;
  if (!str) {
    return '';
  }
  if (reg.test(str.charAt(0))) {
    str = str.substr(1);
  }
  if (reg.test(str.charAt(str.length - 1))) {
    str = str.substr(0, str.length - 1);
  }
  return str;
}

export function mapToObject<K extends string | number | symbol, V>(map: Map<K, V>) {
  const obj = {} as Record<K, V>;
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj;
}

/**
 * ObjectToMap is a helper function to convert a record to a map. For use in
 * cases where a map's structure is complicated and would be easier to define
 * as a record. The limitation is that only string, number, and symbol keys are
 * supported. But, a Map can be a value in the record. So, nested maps with
 * arbitrary keys are still supported.
 */
export function objectToMap<K extends string | number | symbol, V>(obj: Record<K, V>) {
  const map = new Map<K, V>();
  for (const key of Object.keys(obj) as K[]) {
    map.set(key, obj[key]);
  }
  return map;
}

export function reverseMap<K, V>(m: Map<K, V>): Map<V, K> {
  const result = new Map<V, K>();
  for (const [k, v] of m) {
    result.set(v, k);
  }
  return result;
}

/**
 * Converts an expression AST into a qualified name if possible, or an empty
 * string otherwise.
 *
 * @param expr the expression AST
 * @returns a qualified name or an empty string
 */
export function toQualifiedName(expr: Expr): string | null {
  switch (expr.exprKind.case) {
    case 'identExpr':
      return expr.exprKind.value.name;
    case 'selectExpr':
      const sel = expr.exprKind.value;
      // Test only expressions are not valid as qualified names.
      if (sel.testOnly) {
        return null;
      }
      const qual = toQualifiedName(sel.operand!);
      if (!isNil(qual)) {
        return `${qual}.${sel.field}`;
      }
      break;
    default:
      break;
  }
  return null;
}

export function isHexString(input: string) {
  return /^-?0x[0-9a-f]+$/i.test(input);
}

export function isOctalString(input: string) {
  return /^-?0o[0-7]+$/i.test(input);
}

export function isScientificNotationString(input: string) {
  return /^-?\d+\.?\d*e-?\d+$/i.test(input);
}

/**
 * FitsInBits returns true if the value fits within the specified number of
 * bits. The signed flag is used to determine if the value is signed or
 * unsigned.
 */
export function fitsInBits(value: bigint, bits: number, signed: boolean) {
  if (signed) {
    return BigInt.asIntN(bits, value) === value;
  }
  return BigInt.asUintN(bits, value) === value;
}

/**
 * SafeParseInt parses a string into an integer, ensuring that the value fits
 * within the specified number of bits.
 */
export function safeParseInt(input: string, bits: number, signed: boolean): bigint {
  // Clean the string
  input = input.trim().toLowerCase();

  // Determine if the number is negative
  const isNegative = input.startsWith('-');
  if (isNegative) {
    if (!signed) {
      throw new Error(`Invalid value: unsigned value ${input} cannot be negative`);
    }

    input = input.substring(1);
  }

  let value = BigInt(input);
  if (isNegative) {
    value = -value;
  }

  if (!fitsInBits(value, bits, signed)) {
    throw new Error(`Invalid value: ${value} does not fit in ${bits} bits`);
  }
  return value;
}

/**
 * SafeParseFloat parses a string into a float, ensuring that the value fits
 * within the specified number of bits.
 *
 * TODO: this probably cannot actually parse a 64 bit float since JS loses precision past 2^53
 */
export function safeParseFloat(input: string, bits: number, signed: boolean): number {
  if (bits <= 0 || bits > 64) {
    throw new Error(`Invalid bits: ${bits} is not a valid number of bits`);
  }
  const value = parseFloat(input);
  if (isNaN(value)) {
    throw new Error(`Invalid value: ${input} is not a number`);
  }

  if (signed) {
    if (value < -(2 ** (bits - 1)) || value >= 2 ** (bits - 1)) {
      throw new Error(`Invalid value: ${value} does not fit in ${bits} bits`);
    }
  } else {
    if (value < 0 || value >= 2 ** bits) {
      throw new Error(`Invalid value: ${value} does not fit in ${bits} bits`);
    }
  }
  return value;
}

export class HashMap<K, V> extends Map<K, V> {
  private _keyMap = new Map<string, K>();
  private _valueMap = new Map<string, V>();
  private _hasherFn = stringify;

  constructor(entries?: readonly (readonly [K, V])[]) {
    super();
    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  /**
   * Returns the number of elements in the HashSet
   */
  override get size(): number {
    return this._keyMap.size;
  }

  /**
   * Returns the toStringTag of the class
   */
  override get [Symbol.toStringTag](): string {
    return 'HashMap';
  }

  /**
   * Clear all values in the HashMap
   */
  override clear(): void {
    this._keyMap.clear();
    this._valueMap.clear();
  }

  /**
   * Delete a key-value pair from the HashMap
   *
   * @param key the key to delete
   * @returns a boolean indicating whether the operation was successful
   */
  override delete(key: K): boolean {
    const hashedKey = this._hasherFn(key);
    if (!hashedKey) {
      return false;
    }
    return this._keyMap.delete(hashedKey) && this._valueMap.delete(hashedKey);
  }

  /**
   * Apply a callback function to each key-value pair in the HashMap
   *
   * @param callbackfn the callback function to apply
   * @param thisArg the value to use as "this"
   */
  override forEach(
    callbackfn: (value: V, key: K, map: this) => void,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thisArg?: any
  ): void {
    for (const [key, value] of this.entries()) {
      callbackfn.bind(thisArg, value, key, this);
    }
  }

  /**
   * Get the value for a key in the HashMap
   *
   * @param key the key to get the value for
   * @returns the value corresponding to the key (or undefined)
   */
  override get(key: K): V | undefined {
    const hashedKey = this._hasherFn(key) ?? '';
    return this._valueMap.get(hashedKey);
  }

  /**
   * Check that the HashMap has a key
   *
   * @param key the key to check for
   * @returns a boolean indicating whether the HashMap has the key
   */
  override has(key: K): boolean {
    const hashedKey = this._hasherFn(key);
    if (!hashedKey) {
      return false;
    }
    return this._keyMap.has(hashedKey) && this._valueMap.has(hashedKey);
  }

  /**
   * Set a key-value pair in the HashMap
   *
   * @param key the key to set
   * @param value the value to set
   * @returns the HashMap instance
   */
  override set(key: K, value: V): this {
    const hashedKey = this._hasherFn(key);
    if (!hashedKey) {
      return this;
    }
    this._keyMap.set(hashedKey, key);
    this._valueMap.set(hashedKey, value);
    return this;
  }

  /**
   * An iterable of [key, value] pairs of the key-value pairs in the HashMap
   */
  override *entries(): IterableIterator<[K, V]> {
    for (const [hashedKey, key] of this._keyMap.entries()) {
      yield [key, this._valueMap.get(hashedKey) as V];
    }
  }

  /**
   * An iterable of the keys in the HashMap
   */
  override keys(): IterableIterator<K> {
    return this._keyMap.values();
  }

  /**
   * An iterable of the values in the HashMap
   */
  override values(): IterableIterator<V> {
    return this._valueMap.values();
  }

  /**
   * The default iterator for the HashMap
   */
  override [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }
}

export class HashSet<T> extends Set<T> {
  private _map = new Map<string, T>();
  private _hasherFn = stringify;

  constructor(values?: readonly T[]) {
    super();
    if (values) {
      for (const value of values) {
        const key = this._hasherFn(value);
        if (!key) {
          continue;
        }
        this._map.set(key, value);
      }
    }
  }

  /**
   * Returns the number of elements in the HashSet
   */
  override get size(): number {
    return this._map.size;
  }

  /**
   * Returns the toStringTag of the class
   */
  override get [Symbol.toStringTag](): string {
    return 'HashSet';
  }

  /**
   * Add a value to the HashSet
   *
   * @param value the value to add
   * @returns the HashSet instance
   */
  override add(value: T): this {
    const key = this._hasherFn(value);
    if (!key) {
      return this;
    }
    this._map.set(key, value);
    return this;
  }

  /**
   * Clear all values from the HashSet
   */
  override clear(): void {
    this._map.clear();
  }

  /**
   * Delete a value from the HashSet
   *
   * @param value the value to delete
   * @returns a boolean indicating whether or not the value was removed
   */
  override delete(value: T): boolean {
    const key = this._hasherFn(value);
    if (!key) {
      return false;
    }
    return this._map.delete(key);
  }

  /**
   * Apply a callback function to each value in the HashSet
   *
   * @param callbackfn the callback function to apply
   * @param thisArg the value to use as "this"
   */
  override forEach(
    callbackfn: (value: T, value2: T, set: Set<T>) => void,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thisArg?: any
  ): void {
    for (const value of this._map.values()) {
      callbackfn.bind(thisArg, value, value, this);
    }
  }

  /**
   * Check if the HashSet has a value
   *
   * @param value the value to check fo
   * @returns a boolean indicating whether the HashSet has the value
   */
  override has(value: T): boolean {
    const key = this._hasherFn(value);
    if (!key) {
      return false;
    }
    return this._map.has(key);
  }

  /**
   * An iterable of [value, value] pairs of the values in the HashSet
   */
  override *entries(): IterableIterator<[T, T]> {
    for (const value of this._map.values()) {
      yield [value, value];
    }
  }

  /**
   * An iterable of the keys in the HashSet
   */
  override keys(): IterableIterator<T> {
    return this._map.values();
  }

  /**
   * An iterable of the values in the HashSet
   */
  override values(): IterableIterator<T> {
    return this._map.values();
  }

  /**
   * The default iterator for the HashSet
   */
  override [Symbol.iterator](): IterableIterator<T> {
    return this._map.values();
  }
}
