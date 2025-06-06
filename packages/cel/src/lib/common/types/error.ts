/* eslint-disable @typescript-eslint/no-explicit-any */
import { isRefVal, RefType, RefVal } from '../ref/reference.js';
import { isNil } from '../utils.js';
import { NativeType } from './native.js';
import { ErrorType } from './types.js';
import { isUnknownOrError } from './utils.js';

export class ErrorRefVal implements RefVal {
  // This has to be a TS private field instead of a # private field because
  // otherwise the tests will not be able to access it to check for equality.
  // TODO: do we want to alter the tests to use the getter instead?
  private readonly _value: Error;
  private readonly _id: bigint;

  constructor(message: string, id?: bigint) {
    this._value = new Error(message);
    this._id = id || BigInt(0);
  }

  static errDivideByZero = new ErrorRefVal('division by zero');

  static errModulusByZero = new ErrorRefVal('modulus by zero');

  static errIntOverflow = new ErrorRefVal('integer overflow');

  static errUintOverflow = new ErrorRefVal('unsigned integer overflow');

  static errDurationOverflow = new ErrorRefVal('duration overflow');

  static errDurationOutOfRange = new ErrorRefVal('duration out of range');

  static errTimestampOverflow = new ErrorRefVal('timestamp overflow');

  static errTimestampOutOfRange = new ErrorRefVal('timestamp out of range');

  static errNoMoreElements = new ErrorRefVal('no more elements');

  static errNoSuchOverload = new ErrorRefVal('no such overload');

  static nativeTypeConversionError(from: RefVal, to: NativeType) {
    return new ErrorRefVal(
      `native type conversion error from '${from.type().typeName()}' to '${to?.name}'`
    );
  }

  static typeConversionError(from: RefVal, to: RefType) {
    return new ErrorRefVal(
      `type conversion error from '${from.type().typeName()}' to '${to.typeName()}'`
    );
  }

  static noSuchMethodOverload(val: RefVal | null, fn: string, args: RefVal[]) {
    let formattedArgs = args.map((arg) => arg.type().typeName()).join(', ');
    if (formattedArgs.indexOf(',') > -1) {
      formattedArgs = `${formattedArgs},...`;
    }
    if (isNil(val)) {
      return new ErrorRefVal(`no such overload: *.${fn}(${formattedArgs})`);
    }
    return new ErrorRefVal(`no such overload: ${val.type().typeName()}.${fn}(${formattedArgs})`);
  }

  static noSuchIndexMethodOverload(val: RefVal, fn: string, overload: string, args: RefType[]) {
    const formattedArgs = args.map((arg) => arg.typeName()).join(', ');
    return new ErrorRefVal(
      `no such overload: ${val.type().typeName()}.${fn}[${overload}](${formattedArgs})`
    );
  }

  static maybeNoSuchOverload(val: RefVal) {
    return ErrorRefVal.valOrErr(val, 'no such overload');
  }

  /**
   * ValOrErr either returns the existing error or create a new one.
   */
  static valOrErr(val: RefVal, err: string) {
    if (isNil(val) || !isUnknownOrError(val)) {
      return new ErrorRefVal(err);
    }
    return val;
  }

  /**
   * UnsupportedRefValConversionErr returns a types.NewErr instance with a no
   * such conversion message that indicates that the native value could not be
   * converted to a CEL ref.Val.
   */
  static unsupportedRefValConversionErr(val: any) {
    return new ErrorRefVal(`unsupported conversion to ref.Val: (${val.name})${val}`);
  }

  static noSuchField(field: any) {
    return new ErrorRefVal(`no such field '${field}'`);
  }

  static unknownType(field: any) {
    return new ErrorRefVal(`unknown type: '${field}'`);
  }

  static rangeError(from: any, to: any) {
    return new ErrorRefVal(`range error converting ${from} to ${to}`);
  }

  static noSuchAttribute(attr: string) {
    return new ErrorRefVal(`no such attribute '${attr}' (in container '')`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  convertToNative(typeDesc: NativeType) {
    throw new Error('Unsupported operation');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  convertToType(typeValue: RefType): RefVal {
    // Errors are not convertible to other representations.
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  equal(other: RefVal): RefVal {
    // An error cannot be equal to any other value, so it returns itself.
    return this;
  }

  type(): RefType {
    return ErrorType;
  }

  value(): Error {
    return this._value;
  }

  id(): bigint {
    return this._id;
  }
}

export function isErrorRefVal(value: any): value is ErrorRefVal {
  if (!isRefVal(value)) {
    return false;
  }
  switch (value.type()) {
    case ErrorType:
      return true;
    default:
      return false;
  }
}

/**
 * LabelErrNode returns val unaltered it is not an Err or if the error has a
 * non-zero AST node ID already present. Otherwise the id is added to the error
 * for recovery with the Err.NodeID method.
 */
export function labelErrorNode(id: bigint, val: RefVal): RefVal {
  if (!isErrorRefVal(val)) {
    return val;
  }
  return new ErrorRefVal(val.value().message, id);
}

/**
 * WrapErr wraps an existing Go error value into a CEL Err value.
 */
export function wrapError(err: Error, id?: bigint): RefVal {
  return new ErrorRefVal(err.message, id);
}
