import { Bool, False } from "./bool.js";
import { compareDouble, compareDoubleInt, compareDoubleUint } from "./compare.js";
import { err, maybeNoSuchOverloadErr, wrapErr } from "./err.js";
import { Int } from "./int.js";
import { doubleToInt64Checked, doubleToUint64Checked } from "./overflow.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import { DoubleType, IntType, StringType, TypeType, UintType } from "./types.js";
import { Uint } from "./uint.js";

/**
 * Double implements comparison and mathematical operations.
 */
export class Double {
  constructor(private readonly inner: number) {}

  /** Add implements traits.Adder.Add. */
  public add(other: Val): Val {
    if (!(other instanceof Double)) {
      return maybeNoSuchOverloadErr(other);
    }
    return new Double(this.inner + other.inner);
  }

  /** Compare implements traits.Comparer.Compare. */
  public compare(other: Val): Val {
    if (Number.isNaN(this.inner)) {
      return wrapErr(new globalThis.Error("NaN values cannot be ordered"));
    }
    if (other instanceof Double) {
      if (Number.isNaN(other.inner)) {
        return wrapErr(new globalThis.Error("NaN values cannot be ordered"));
      }
      return compareDouble(this, other);
    }
    if (other instanceof Int) {
      return compareDoubleInt(this, other);
    }
    if (other instanceof Uint) {
      return compareDoubleUint(this, other);
    }
    return maybeNoSuchOverloadErr(other);
  }

  /** ConvertToNative implements ref.Val.ConvertToNative. */
  public convertToNative(): number {
    return this.inner;
  }

  /** ConvertToType implements ref.Val.ConvertToType. */
  public convertToType(typeValue: RefType): Val {
    switch (typeValue) {
      case IntType:
        try {
          return new Int(doubleToInt64Checked(this.inner));
        } catch (error) {
          return wrapErr(error);
        }
      case UintType:
        try {
          return new Uint(doubleToUint64Checked(this.inner));
        } catch (error) {
          return wrapErr(error);
        }
      case DoubleType:
        return this;
      case StringType:
        return new CelString(`${this.inner}`);
      case TypeType:
        return DoubleType;
      default:
        return err(`type conversion error from '${DoubleType}' to '${typeValue.typeName()}'`);
    }
  }

  /** Divide implements traits.Divider.Divide. */
  public divide(other: Val): Val {
    if (!(other instanceof Double)) {
      return maybeNoSuchOverloadErr(other);
    }
    return new Double(this.inner / other.inner);
  }

  /** Equal implements ref.Val.Equal. */
  public equal(other: Val): Val {
    if (Number.isNaN(this.inner)) {
      return False;
    }
    if (other instanceof Double) {
      return new Bool(!Number.isNaN(other.inner) && this.inner === other.inner);
    }
    if (other instanceof Int) {
      return new Bool((compareDoubleInt(this, other) as Int).value() === 0n);
    }
    if (other instanceof Uint) {
      return new Bool((compareDoubleUint(this, other) as Int).value() === 0n);
    }
    return False;
  }

  /** IsZeroValue returns true if double value is 0.0. */
  public isZeroValue(): boolean {
    return this.inner === 0;
  }

  /** Multiply implements traits.Multiplier.Multiply. */
  public multiply(other: Val): Val {
    if (!(other instanceof Double)) {
      return maybeNoSuchOverloadErr(other);
    }
    return new Double(this.inner * other.inner);
  }

  /** Negate implements traits.Negater.Negate. */
  public negate(): Val {
    return new Double(-this.inner);
  }

  /** Subtract implements traits.Subtractor.Subtract. */
  public subtract(other: Val): Val {
    if (!(other instanceof Double)) {
      return maybeNoSuchOverloadErr(other);
    }
    return new Double(this.inner - other.inner);
  }

  /** Type implements ref.Val.Type. */
  public type(): RefType {
    return DoubleType;
  }

  /** Value implements ref.Val.Value. */
  public value(): number {
    return this.inner;
  }
}
