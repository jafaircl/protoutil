import { ValueSchema } from "@bufbuild/protobuf/wkt";
import { False, True } from "./bool.js";
import { compareDouble, compareDoubleInt, compareDoubleUint } from "./compare.js";
import { err, maybeNoSuchOverloadErr, wrapErr } from "./err.js";
import { Int } from "./int.js";
import { doubleToInt64Checked, doubleToUint64Checked } from "./overflow.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import type { Adder, Comparer, Divider, Multiplier, Negater, Subtractor } from "./traits/index.js";
import { DoubleType, IntType, StringType, TypeType, UintType } from "./types.js";
import { Uint } from "./uint.js";

/**
 * Double implements comparison and mathematical operations.
 */
export class Double implements Val, Adder, Comparer, Divider, Multiplier, Negater, Subtractor {
  constructor(private readonly inner: number) {}
  public add(other: Val): Val {
    if (!(other instanceof Double)) {
      return maybeNoSuchOverloadErr(other);
    }
    return new Double(this.inner + other.inner);
  }
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
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === ValueSchema) {
      return {
        $typeName: "google.protobuf.Value",
        kind: { case: "numberValue", value: this.inner },
      };
    }
    return this.inner;
  }
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
  public divide(other: Val): Val {
    if (!(other instanceof Double)) {
      return maybeNoSuchOverloadErr(other);
    }
    return new Double(this.inner / other.inner);
  }
  public equal(other: Val): Val {
    if (Number.isNaN(this.inner)) {
      return False;
    }
    if (other instanceof Double) {
      return !Number.isNaN(other.inner) && this.inner === other.inner ? True : False;
    }
    if (other instanceof Int) {
      return (compareDoubleInt(this, other) as Int).value() === 0n ? True : False;
    }
    if (other instanceof Uint) {
      return (compareDoubleUint(this, other) as Int).value() === 0n ? True : False;
    }
    return False;
  }

  /** IsZeroValue returns true if double value is 0.0. */
  public isZeroValue(): boolean {
    return this.inner === 0;
  }
  public multiply(other: Val): Val {
    if (!(other instanceof Double)) {
      return maybeNoSuchOverloadErr(other);
    }
    return new Double(this.inner * other.inner);
  }
  public negate(): Val {
    return new Double(-this.inner);
  }
  public subtract(other: Val): Val {
    if (!(other instanceof Double)) {
      return maybeNoSuchOverloadErr(other);
    }
    return new Double(this.inner - other.inner);
  }
  public type(): RefType {
    return DoubleType;
  }
  public value(): number {
    return this.inner;
  }
}
