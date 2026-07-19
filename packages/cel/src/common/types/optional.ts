import { Bool, False } from "./bool.js";
import { err } from "./err.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { OptionalType, TypeType } from "./types.js";

/**
 * OptionalOf returns an optional value which wraps a concrete CEL value.
 */
export function optionalOf(value: Val): Optional {
  return new Optional(value);
}

/**
 * Optional points to a value if non-empty.
 */
export class Optional {
  constructor(private readonly inner?: Val) {}

  /** HasValue returns true if the optional has a value. */
  public hasValue(): boolean {
    return this.inner !== undefined;
  }

  /** GetValue returns the wrapped value contained in the optional. */
  public getValue(): Val {
    if (!this.hasValue()) {
      return err("optional.none() dereference");
    }
    return this.inner!;
  }

  /** ConvertToNative implements the ref.Val interface method. */
  public convertToNative(): unknown {
    if (!this.hasValue()) {
      throw new globalThis.Error("optional.none() dereference");
    }
    return this.inner!.value();
  }

  /** ConvertToType implements the ref.Val interface method. */
  public convertToType(typeValue: RefType): Val {
    switch (typeValue) {
      case OptionalType:
        return this;
      case TypeType:
        return OptionalType;
      default:
        return err(`type conversion error from '${OptionalType}' to '${typeValue.typeName()}'`);
    }
  }

  /** Equal determines whether the values contained by two optional values are equal. */
  public equal(other: Val): Val {
    if (!(other instanceof Optional)) {
      return False;
    }
    if (!this.hasValue()) {
      return new Bool(!other.hasValue());
    }
    if (!other.hasValue()) {
      return False;
    }
    return this.inner!.equal(other.inner!);
  }

  /** String returns the string representation of the optional. */
  public toString(): string {
    return this.hasValue() ? `optional(${this.getValue().value()})` : "optional.none()";
  }

  /** Type implements the ref.Val interface method. */
  public type(): RefType {
    return OptionalType;
  }

  /** Value returns the underlying Value() of the wrapped value, if present. */
  public value(): unknown {
    return this.inner?.value();
  }
}

/**
 * OptionalNone is a sentinel value which is used to indicate an empty optional value.
 */
export const OptionalNone = new Optional();
