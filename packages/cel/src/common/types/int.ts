import { ValueSchema } from "@bufbuild/protobuf/wkt";
import { False, True } from "./bool.js";
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
import type {
  Adder,
  Comparer,
  Divider,
  Modder,
  Multiplier,
  Negater,
  Subtractor,
} from "./traits/index.js";
import { DoubleType, IntType, StringType, TypeType, UintType } from "./types.js";
import { Uint } from "./uint.js";

/**
 * Int implements ref.Val as well as comparison and math operators.
 */
export class Int implements Val, Adder, Comparer, Divider, Modder, Multiplier, Negater, Subtractor {
  constructor(private readonly inner: bigint) {}
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
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === ValueSchema) {
      return {
        $typeName: "google.protobuf.Value",
        kind: { case: "numberValue", value: Number(this.inner) },
      };
    }
    return this.inner;
  }
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
  public equal(other: Val): Val {
    if (other instanceof Double) {
      if (Number.isNaN(other.value())) {
        return False;
      }
      return (compareIntDouble(this, other) as Int).value() === 0n ? True : False;
    }
    if (other instanceof Int) {
      return this.inner === other.inner ? True : False;
    }
    if (other instanceof Uint) {
      return (compareIntUint(this, other) as Int).value() === 0n ? True : False;
    }
    return False;
  }

  /** IsZeroValue returns true if integer is equal to 0. */
  public isZeroValue(): boolean {
    return this.inner === 0n;
  }
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
  public negate(): Val {
    try {
      return new Int(negateInt64Checked(this.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }
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
  public type(): RefType {
    return IntType;
  }
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
