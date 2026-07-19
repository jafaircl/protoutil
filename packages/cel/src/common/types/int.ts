import { Bool, False } from "./bool.js";
import { compareInt, compareIntDouble, compareIntUint } from "./compare.js";
import { Double } from "./double.js";
import { err, maybeNoSuchOverloadErr, wrapErr } from "./err.js";
import {
  addInt64Checked,
  divideInt64Checked,
  int64ToUint64Checked,
  moduloInt64Checked,
  multiplyInt64Checked,
  negateInt64Checked,
  subtractInt64Checked,
} from "./overflow.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import { DoubleType, IntType, StringType, TypeType, UintType } from "./types.js";
import { Uint } from "./uint.js";

/**
 * Int implements ref.Val as well as comparison and math operators.
 */
export class Int {
  constructor(private readonly inner: bigint) {}

  /** Add implements traits.Adder.Add. */
  public add(other: Val): Val {
    if (!(other instanceof Int)) {
      return maybeNoSuchOverloadErr(other);
    }
    try {
      return new Int(addInt64Checked(this.inner, other.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }

  /** Compare implements traits.Comparer.Compare. */
  public compare(other: Val): Val {
    if (other instanceof Double) {
      if (Number.isNaN(other.value())) {
        return wrapErr(new globalThis.Error("NaN values cannot be ordered"));
      }
      return compareIntDouble(this, other);
    }
    if (other instanceof Int) {
      return compareInt(this, other);
    }
    if (other instanceof Uint) {
      return compareIntUint(this, other);
    }
    return maybeNoSuchOverloadErr(other);
  }

  /** ConvertToNative implements ref.Val.ConvertToNative. */
  public convertToNative(): bigint {
    return this.inner;
  }

  /** ConvertToType implements ref.Val.ConvertToType. */
  public convertToType(typeValue: RefType): Val {
    switch (typeValue) {
      case IntType:
        return this;
      case UintType:
        try {
          return new Uint(int64ToUint64Checked(this.inner));
        } catch (error) {
          return wrapErr(error);
        }
      case DoubleType:
        return new Double(Number(this.inner));
      case StringType:
        return new CelString(this.inner.toString());
      case TypeType:
        return IntType;
      default:
        return err(`type conversion error from '${IntType}' to '${typeValue.typeName()}'`);
    }
  }

  /** Divide implements traits.Divider.Divide. */
  public divide(other: Val): Val {
    if (!(other instanceof Int)) {
      return maybeNoSuchOverloadErr(other);
    }
    try {
      return new Int(divideInt64Checked(this.inner, other.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }

  /** Equal implements ref.Val.Equal. */
  public equal(other: Val): Val {
    if (other instanceof Double) {
      if (Number.isNaN(other.value())) {
        return False;
      }
      return new Bool((compareIntDouble(this, other) as Int).inner === 0n);
    }
    if (other instanceof Int) {
      return new Bool(this.inner === other.inner);
    }
    if (other instanceof Uint) {
      return new Bool((compareIntUint(this, other) as Int).inner === 0n);
    }
    return False;
  }

  /** IsZeroValue returns true if integer is equal to 0. */
  public isZeroValue(): boolean {
    return this.inner === 0n;
  }

  /** Modulo implements traits.Modder.Modulo. */
  public modulo(other: Val): Val {
    if (!(other instanceof Int)) {
      return maybeNoSuchOverloadErr(other);
    }
    try {
      return new Int(moduloInt64Checked(this.inner, other.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }

  /** Multiply implements traits.Multiplier.Multiply. */
  public multiply(other: Val): Val {
    if (!(other instanceof Int)) {
      return maybeNoSuchOverloadErr(other);
    }
    try {
      return new Int(multiplyInt64Checked(this.inner, other.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }

  /** Negate implements traits.Negater.Negate. */
  public negate(): Val {
    try {
      return new Int(negateInt64Checked(this.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }

  /** Subtract implements traits.Subtractor.Subtract. */
  public subtract(other: Val): Val {
    if (!(other instanceof Int)) {
      return maybeNoSuchOverloadErr(other);
    }
    try {
      return new Int(subtractInt64Checked(this.inner, other.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }

  /** Type implements ref.Val.Type. */
  public type(): RefType {
    return IntType;
  }

  /** Value implements ref.Val.Value. */
  public value(): bigint {
    return this.inner;
  }
}

/**
 * IntZero is the zero-value for Int.
 */
export const IntZero = new Int(0n);
/**
 * IntOne is the one-value for Int.
 */
export const IntOne = new Int(1n);
/**
 * IntNegOne is the negative-one value for Int.
 */
export const IntNegOne = new Int(-1n);
