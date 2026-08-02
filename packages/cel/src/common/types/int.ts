import { AnySchema, Int32ValueSchema, Int64ValueSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { anyValueType } from "./any-value.js";
import { False, True } from "./bool.js";
import { compareIntDouble, compareIntUint } from "./compare.js";
import { Double } from "./double.js";
import { err, maybeNoSuchOverloadErr, wrapErr } from "./err.js";
import {
  Int8NativeType,
  Int16NativeType,
  Int32NativeType,
  isNativeDescriptor,
  jsonIntegerValue,
  nativeTypeName,
  packAnyInt,
  toInt8Checked,
  toInt16Checked,
  toInt32Checked,
} from "./native.js";
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
import { timestampOf } from "./timestamp.js";
import type {
  Adder,
  Comparer,
  Divider,
  Modder,
  Multiplier,
  Negater,
  Subtractor,
} from "./traits/index.js";
import { DoubleType, IntType, StringType, TimestampType, TypeType, UintType } from "./types.js";
import { Uint } from "./uint.js";

const MAX_SAFE_INT = 9_007_199_254_740_991n;
const MIN_SAFE_INT = -9_007_199_254_740_991n;

/**
 * Int implements ref.Val as well as comparison and math operators.
 */
export class Int implements Val, Adder, Comparer, Divider, Modder, Multiplier, Negater, Subtractor {
  private readonly inner: number | bigint;

  constructor(value: number | bigint) {
    if (typeof value === "number") {
      this.inner = Number.isSafeInteger(value) ? (value === 0 ? 0 : value) : BigInt(value);
      return;
    }
    this.inner = value >= MIN_SAFE_INT && value <= MAX_SAFE_INT ? Number(value) : value;
  }

  public add(other: Val): Val {
    if (!(other instanceof Int)) {
      return maybeNoSuchOverloadErr(other);
    }
    if (typeof this.inner === "number" && typeof other.inner === "number") {
      const sum = this.inner + other.inner;
      if (Number.isSafeInteger(sum)) {
        return new Int(sum);
      }
    }
    try {
      return new Int(addInt64Checked(this.value(), other.value()));
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
      if (typeof this.inner === "number" && typeof other.inner === "number") {
        return this.inner < other.inner ? IntNegOne : this.inner > other.inner ? IntOne : IntZero;
      }
      const lhs = this.value();
      const rhs = other.value();
      return lhs < rhs ? IntNegOne : lhs > rhs ? IntOne : IntZero;
    }
    if (other instanceof Uint) {
      return compareIntUint(this, other);
    }
    return maybeNoSuchOverloadErr(other);
  }
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === BigInt || typeDesc === undefined) {
      return this.value();
    }
    if (typeDesc === anyValueType || typeDesc === AnySchema) {
      return packAnyInt(Int64ValueSchema, this.value());
    }
    if (typeDesc === Int32ValueSchema) {
      return { $typeName: Int32ValueSchema.typeName, value: toInt32Checked(this.value()) };
    }
    if (typeDesc === Int64ValueSchema) {
      return { $typeName: Int64ValueSchema.typeName, value: this.value() };
    }
    if (typeDesc === ValueSchema) {
      return jsonIntegerValue(this.value());
    }
    if (isNativeDescriptor(typeDesc)) {
      switch (typeDesc) {
        case Int8NativeType:
          return toInt8Checked(this.value());
        case Int16NativeType:
          return toInt16Checked(this.value());
        case Int32NativeType:
          return toInt32Checked(this.value());
      }
    }
    throw new globalThis.Error(
      `type conversion error from '${IntType}' to '${nativeTypeName(typeDesc)}'`,
    );
  }
  public convertToType(typeValue: RefType): Val {
    switch (typeValue) {
      case IntType:
        return this;
      case UintType:
        try {
          return new Uint(int64ToUint64Checked(this.value()));
        } catch (error) {
          return wrapErr(error);
        }
      case DoubleType:
        return new Double(Number(this.value()));
      case TimestampType:
        return timestampOf(this.value());
      case StringType:
        return new CelString(this.value().toString());
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
      return new Int(divideInt64Checked(this.value(), other.value()));
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
    return this.inner === 0 || this.inner === 0n;
  }
  public modulo(other: Val): Val {
    if (!(other instanceof Int)) {
      return maybeNoSuchOverloadErr(other);
    }
    try {
      return new Int(moduloInt64Checked(this.value(), other.value()));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public multiply(other: Val): Val {
    if (!(other instanceof Int)) {
      return maybeNoSuchOverloadErr(other);
    }
    if (typeof this.inner === "number" && typeof other.inner === "number") {
      const product = this.inner * other.inner;
      if (Number.isSafeInteger(product)) {
        return new Int(product);
      }
    }
    try {
      return new Int(multiplyInt64Checked(this.value(), other.value()));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public negate(): Val {
    if (typeof this.inner === "number") {
      return new Int(-this.inner);
    }
    try {
      return new Int(negateInt64Checked(this.value()));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public subtract(other: Val): Val {
    if (!(other instanceof Int)) {
      return maybeNoSuchOverloadErr(other);
    }
    if (typeof this.inner === "number" && typeof other.inner === "number") {
      const difference = this.inner - other.inner;
      if (Number.isSafeInteger(difference)) {
        return new Int(difference);
      }
    }
    try {
      return new Int(subtractInt64Checked(this.value(), other.value()));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public type(): RefType {
    return IntType;
  }
  public value(): bigint {
    return typeof this.inner === "number" ? BigInt(this.inner) : this.inner;
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
