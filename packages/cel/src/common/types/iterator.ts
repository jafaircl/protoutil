import { err } from "./err.js";
import type { Type as RefType, Val } from "./ref/index.js";

let IteratorTypeValue: RefType | undefined;

/**
 * setIteratorType installs the shared iterator type singleton after types.ts initializes it.
 */
export function setIteratorType(type: RefType): void {
  IteratorTypeValue = type;
}

/**
 * BaseIterator provides the shared ref.Val implementation used by concrete CEL iterators.
 */
export class BaseIterator implements Val {
  /** ConvertToNative reports that iterator conversion is unsupported. */
  public convertToNative(): never {
    throw new globalThis.Error("type conversion on iterators not supported");
  }

  /** ConvertToType reports there is no such overload. */
  public convertToType(): Val {
    return err("no such overload");
  }

  /** Equal reports there is no such overload. */
  public equal(): Val {
    return err("no such overload");
  }

  /** Type returns the iterator type singleton. */
  public type(): RefType {
    return IteratorTypeValue!;
  }

  /** Value returns nil. */
  public value(): unknown {
    return undefined;
  }
}
