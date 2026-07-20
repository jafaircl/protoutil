import { ValueSchema } from "@bufbuild/protobuf/wkt";
import { Bool, False } from "./bool.js";
import { compareUint, compareUintDouble, compareUintInt } from "./compare.js";
import { Double } from "./double.js";
import { err, maybeNoSuchOverloadErr, wrapErr } from "./err.js";
import { Int } from "./int.js";
import {
  addUint64Checked,
  divideUint64Checked,
  moduloUint64Checked,
  multiplyUint64Checked,
  subtractUint64Checked,
  uint64ToInt64Checked,
} from "./overflow.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import type { Adder, Comparer, Divider, Modder, Multiplier, Subtractor } from "./traits/index.js";
import { DoubleType, IntType, StringType, TypeType, UintType } from "./types.js";

/**
 * Uint implements comparison and math operators.
 */
export class Uint implements Val, Adder, Comparer, Divider, Modder, Multiplier, Subtractor {
  constructor(private readonly inner: bigint) {}
  public add(other: Val): Val {
    if (!(other instanceof Uint)) {
      return maybeNoSuchOverloadErr(other);
    }
    try {
      return new Uint(addUint64Checked(this.inner, other.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public compare(other: Val): Val {
    if (other instanceof Double) {
      if (Number.isNaN(other.value())) {
        return wrapErr(new globalThis.Error("NaN values cannot be ordered"));
      }
      return compareUintDouble(this, other);
    }
    if (other instanceof Int) {
      return compareUintInt(this, other);
    }
    if (other instanceof Uint) {
      return compareUint(this, other);
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
        try {
          return new Int(uint64ToInt64Checked(this.inner));
        } catch (error) {
          return wrapErr(error);
        }
      case UintType:
        return this;
      case DoubleType:
        return new Double(Number(this.inner));
      case StringType:
        return new CelString(this.inner.toString());
      case TypeType:
        return UintType;
      default:
        return err(`type conversion error from '${UintType}' to '${typeValue.typeName()}'`);
    }
  }
  public divide(other: Val): Val {
    if (!(other instanceof Uint)) {
      return maybeNoSuchOverloadErr(other);
    }
    try {
      return new Uint(divideUint64Checked(this.inner, other.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public equal(other: Val): Val {
    if (other instanceof Double) {
      if (Number.isNaN(other.value())) {
        return False;
      }
      return new Bool((compareUintDouble(this, other) as Int).value() === 0n);
    }
    if (other instanceof Int) {
      return new Bool((compareUintInt(this, other) as Int).value() === 0n);
    }
    if (other instanceof Uint) {
      return new Bool(this.inner === other.inner);
    }
    return False;
  }

  /** IsZeroValue returns true if the uint is zero. */
  public isZeroValue(): boolean {
    return this.inner === 0n;
  }
  public modulo(other: Val): Val {
    if (!(other instanceof Uint)) {
      return maybeNoSuchOverloadErr(other);
    }
    try {
      return new Uint(moduloUint64Checked(this.inner, other.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public multiply(other: Val): Val {
    if (!(other instanceof Uint)) {
      return maybeNoSuchOverloadErr(other);
    }
    try {
      return new Uint(multiplyUint64Checked(this.inner, other.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public subtract(other: Val): Val {
    if (!(other instanceof Uint)) {
      return maybeNoSuchOverloadErr(other);
    }
    try {
      return new Uint(subtractUint64Checked(this.inner, other.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public type(): RefType {
    return UintType;
  }
  public value(): bigint {
    return this.inner;
  }
}
