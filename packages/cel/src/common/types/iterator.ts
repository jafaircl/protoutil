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
 * baseIterator is the basis for list, map, and object iterators.
 */
export class BaseIterator {
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
