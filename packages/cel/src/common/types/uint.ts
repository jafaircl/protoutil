import {
  AnySchema,
  UInt32ValueSchema,
  UInt64ValueSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import { anyValueType } from "./any-value.js";
import { Bool, False } from "./bool.js";
import { compareUintDouble, compareUintInt } from "./compare.js";
import { Double } from "./double.js";
import { err, maybeNoSuchOverloadErr, wrapErr } from "./err.js";
import { Int, IntNegOne, IntOne, IntZero } from "./int.js";
import {
  isNativeDescriptor,
  jsonIntegerValue,
  nativeTypeName,
  packAnyUint,
  toUint8Checked,
  toUint16Checked,
  toUint32Checked,
  Uint8NativeType,
  Uint16NativeType,
  Uint32NativeType,
} from "./native.js";
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

const MAX_SAFE_UINT = 9_007_199_254_740_991n;

/**
 * Uint implements comparison and math operators.
 */
export class Uint implements Val, Adder, Comparer, Divider, Modder, Multiplier, Subtractor {
  private readonly inner: number | bigint;

  constructor(value: number | bigint) {
    if (typeof value === "number") {
      this.inner = Number.isSafeInteger(value) && value >= 0 ? (value === 0 ? 0 : value) : BigInt(value);
      return;
    }
    this.inner = value >= 0n && value <= MAX_SAFE_UINT ? Number(value) : value;
  }

  public add(other: Val): Val {
    if (!(other instanceof Uint)) {
      return maybeNoSuchOverloadErr(other);
    }
    if (typeof this.inner === "number" && typeof other.inner === "number") {
      const sum = this.inner + other.inner;
      if (Number.isSafeInteger(sum)) {
        return new Uint(sum);
      }
    }
    try {
      return new Uint(addUint64Checked(this.value(), other.value()));
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
      if (typeof this.inner === "number" && typeof other.inner === "number") {
        return this.inner < other.inner ? IntNegOne : this.inner > other.inner ? IntOne : IntZero;
      }
      const lhs = this.value();
      const rhs = other.value();
      return lhs < rhs ? IntNegOne : lhs > rhs ? IntOne : IntZero;
    }
    return maybeNoSuchOverloadErr(other);
  }
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === BigInt || typeDesc === undefined) {
      return this.value();
    }
    if (typeDesc === anyValueType || typeDesc === AnySchema) {
      return packAnyUint(UInt64ValueSchema, this.value());
    }
    if (typeDesc === UInt32ValueSchema) {
      return { $typeName: UInt32ValueSchema.typeName, value: toUint32Checked(this.value()) };
    }
    if (typeDesc === UInt64ValueSchema) {
      return { $typeName: UInt64ValueSchema.typeName, value: this.value() };
    }
    if (typeDesc === ValueSchema) {
      return jsonIntegerValue(this.value());
    }
    if (isNativeDescriptor(typeDesc)) {
      switch (typeDesc) {
        case Uint8NativeType:
          return toUint8Checked(this.value());
        case Uint16NativeType:
          return toUint16Checked(this.value());
        case Uint32NativeType:
          return toUint32Checked(this.value());
      }
    }
    throw new globalThis.Error(
      `unsupported type conversion from 'uint' to ${nativeTypeName(typeDesc)}`,
    );
  }
  public convertToType(typeValue: RefType): Val {
    switch (typeValue) {
      case IntType:
        try {
          return new Int(uint64ToInt64Checked(this.value()));
        } catch (error) {
          return wrapErr(error);
        }
      case UintType:
        return this;
      case DoubleType:
        return new Double(Number(this.value()));
      case StringType:
        return new CelString(this.value().toString());
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
      return new Uint(divideUint64Checked(this.value(), other.value()));
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
    return this.inner === 0 || this.inner === 0n;
  }
  public modulo(other: Val): Val {
    if (!(other instanceof Uint)) {
      return maybeNoSuchOverloadErr(other);
    }
    try {
      return new Uint(moduloUint64Checked(this.value(), other.value()));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public multiply(other: Val): Val {
    if (!(other instanceof Uint)) {
      return maybeNoSuchOverloadErr(other);
    }
    if (typeof this.inner === "number" && typeof other.inner === "number") {
      const product = this.inner * other.inner;
      if (Number.isSafeInteger(product)) {
        return new Uint(product);
      }
    }
    try {
      return new Uint(multiplyUint64Checked(this.value(), other.value()));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public subtract(other: Val): Val {
    if (!(other instanceof Uint)) {
      return maybeNoSuchOverloadErr(other);
    }
    if (typeof this.inner === "number" && typeof other.inner === "number") {
      const difference = this.inner - other.inner;
      if (difference >= 0 && Number.isSafeInteger(difference)) {
        return new Uint(difference);
      }
    }
    try {
      return new Uint(subtractUint64Checked(this.value(), other.value()));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public type(): RefType {
    return UintType;
  }
  public value(): bigint {
    return typeof this.inner === "number" ? BigInt(this.inner) : this.inner;
  }
}
