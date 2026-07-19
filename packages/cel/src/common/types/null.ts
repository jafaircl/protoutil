import { NullValue as WktNullValue } from "@bufbuild/protobuf/wkt";
import { Bool } from "./bool.js";
import { err } from "./err.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import { NullType, StringType, TypeType } from "./types.js";

/**
 * Null implements CEL null.
 */
export class Null {
  /** ConvertToNative implements ref.Val.ConvertToNative. */
  public convertToNative(): WktNullValue {
    return WktNullValue.NULL_VALUE;
  }

  /** ConvertToType implements ref.Val.ConvertToType. */
  public convertToType(typeValue: RefType): Val {
    switch (typeValue) {
      case StringType:
        return new CelString("null");
      case NullType:
        return this;
      case TypeType:
        return NullType;
      default:
        return err(`type conversion error from '${NullType}' to '${typeValue.typeName()}'`);
    }
  }

  /** Equal implements ref.Val.Equal. */
  public equal(other: Val): Val {
    return new Bool(other.type() === NullType);
  }

  /** IsZeroValue returns true as null always represents an absent value. */
  public isZeroValue(): boolean {
    return true;
  }

  /** Type implements ref.Val.Type. */
  public type(): RefType {
    return NullType;
  }

  /** Value implements ref.Val.Value. */
  public value(): WktNullValue {
    return WktNullValue.NULL_VALUE;
  }
}

/**
 * NullValue is the null singleton.
 */
export const NullValue = new Null();
