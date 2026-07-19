import { err, maybeNoSuchOverloadErr } from "./err.js";
import { IntNegOne, IntOne, IntZero } from "./int.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import { BoolType, StringType, TypeType } from "./types.js";

/**
 * Bool implements ref.Val and supports comparison and negation.
 */
export class Bool {
  constructor(private readonly inner: boolean) {}

  /** Compare implements the traits.Comparer interface method. */
  public compare(other: Val): Val {
    if (!(other instanceof Bool)) {
      return maybeNoSuchOverloadErr(other);
    }
    if (this.inner === other.inner) {
      return IntZero;
    }
    return this.inner ? IntOne : IntNegOne;
  }

  /** ConvertToNative implements the ref.Val interface method. */
  public convertToNative(): boolean {
    return this.inner;
  }

  /** ConvertToType implements the ref.Val interface method. */
  public convertToType(typeValue: RefType): Val {
    switch (typeValue) {
      case StringType:
        return new CelString(globalThis.String(this.inner));
      case BoolType:
        return this;
      case TypeType:
        return BoolType;
      default:
        return err(`type conversion error from '${BoolType}' to '${typeValue.typeName()}'`);
    }
  }

  /** Equal implements the ref.Val interface method. */
  public equal(other: Val): Val {
    return new Bool(other instanceof Bool && this.inner === other.inner);
  }

  /** IsZeroValue returns true if the boolean value is false. */
  public isZeroValue(): boolean {
    return !this.inner;
  }

  /** Negate implements the traits.Negater interface method. */
  public negate(): Val {
    return this.inner ? False : True;
  }

  /** Type implements the ref.Val interface method. */
  public type(): RefType {
    return BoolType;
  }

  /** Value implements the ref.Val interface method. */
  public value(): boolean {
    return this.inner;
  }
}

/**
 * False is the false Bool constant.
 */
export const False = new Bool(false);
/**
 * True is the true Bool constant.
 */
export const True = new Bool(true);

/**
 * IsBool returns whether the input ref.Val or ref.Type is equal to BoolType.
 */
export function isBool(elem: unknown): boolean {
  return (
    elem instanceof Bool ||
    (typeof elem === "object" &&
      elem !== null &&
      "type" in elem &&
      (elem as Val).type() === BoolType)
  );
}
