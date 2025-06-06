/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from '@bufbuild/protobuf';
import { anyPack, AnySchema, BoolValueSchema, ValueSchema } from '@bufbuild/protobuf/wkt';
import { isRefVal, RefType, RefVal } from '../ref/reference.js';
import { ErrorRefVal } from './error.js';
import { IntRefVal } from './int.js';
import { NativeType } from './native.js';
import { StringRefVal } from './string.js';
import { Comparer } from './traits/comparer.js';
import { Negater } from './traits/math.js';
import { Zeroer } from './traits/zeroer.js';
import { BoolType, StringType, TypeType } from './types.js';

export class BoolRefVal implements RefVal, Comparer, Zeroer, Negater {
  // This has to be a TS private field instead of a # private field because
  // otherwise the tests will not be able to access it to check for equality.
  // TODO: do we want to alter the tests to use the getter instead?
  private readonly _value: boolean;

  constructor(value: boolean) {
    this._value = value;
  }

  static True = new BoolRefVal(true);
  static False = new BoolRefVal(false);

  convertToNative(type: NativeType) {
    switch (type) {
      case Boolean:
        return this._value;
      case AnySchema:
        return anyPack(BoolValueSchema, create(BoolValueSchema, { value: this._value }));
      case BoolValueSchema:
        return create(BoolValueSchema, { value: this._value });
      case ValueSchema:
        return create(ValueSchema, {
          kind: { case: 'boolValue', value: this._value },
        });
      default:
        return ErrorRefVal.nativeTypeConversionError(this, type);
    }
  }

  convertToType(type: RefType): RefVal {
    switch (type) {
      case BoolType:
        return new BoolRefVal(this._value);
      case StringType:
        return new StringRefVal(this._value ? 'true' : 'false');
      case TypeType:
        return BoolType;
      default:
        return ErrorRefVal.typeConversionError(this, type);
    }
  }

  equal(other: RefVal): RefVal {
    switch (other.type().typeName()) {
      case this.type().typeName():
        return new BoolRefVal(this._value === (other as BoolRefVal).value());
      default:
        return BoolRefVal.False;
    }
  }

  type(): RefType {
    return BoolType;
  }

  value(): boolean {
    return this._value;
  }

  compare(other: RefVal) {
    switch (other.type()) {
      case BoolType:
        if (other.value() === this.value()) {
          return IntRefVal.IntZero;
        }
        if (!this.value() && other.value()) {
          return IntRefVal.IntNegOne;
        }
        return IntRefVal.IntOne;
      default:
        return ErrorRefVal.maybeNoSuchOverload(other);
    }
  }

  isZeroValue(): boolean {
    return this._value === false;
  }

  negate(): RefVal {
    return new BoolRefVal(!this._value);
  }
}

export function isBoolRefVal(val: any): val is BoolRefVal {
  if (!isRefVal(val)) {
    return false;
  }
  switch (val.type()) {
    case BoolType:
      return true;
    default:
      return false;
  }
}
