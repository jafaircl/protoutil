import { AnySchema, BoolValueSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { anyValueType } from "./any-value.js";
import { err, maybeNoSuchOverloadErr } from "./err.js";
import { IntNegOne, IntOne, IntZero } from "./int.js";
import { nativeTypeName, packAnyPrimitive } from "./native.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import type { Comparer, Negater } from "./traits/index.js";
import { BoolType, StringType, TypeType } from "./types.js";

/**
 * Bool implements ref.Val and supports comparison and negation.
 */
export class Bool implements Val, Comparer, Negater {
  constructor(private readonly inner: boolean) {}
  public compare(other: Val): Val {
    if (!(other instanceof Bool)) {
      return maybeNoSuchOverloadErr(other);
    }
    if (this.inner === other.inner) {
      return IntZero;
    }
    return this.inner ? IntOne : IntNegOne;
  }
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === Boolean || typeDesc === undefined) {
      return this.inner;
    }
    if (typeDesc === anyValueType || typeDesc === AnySchema) {
      return packAnyPrimitive(BoolValueSchema, this.inner);
    }
    if (typeDesc === BoolValueSchema) {
      return { $typeName: BoolValueSchema.typeName, value: this.inner };
    }
    if (typeDesc === ValueSchema) {
      return { $typeName: ValueSchema.typeName, kind: { case: "boolValue", value: this.inner } };
    }
    throw new globalThis.Error(
      `type conversion error from '${BoolType}' to '${nativeTypeName(typeDesc)}'`,
    );
  }
  public convertToType(typeValue: RefType): Val {
    switch (typeValue) {
      case StringType:
        return new CelString(globalThis.String(this.inner));
      case BoolType:
        return this;
      case TypeType:
        return BoolType;
      default:
        return err(`type conversion error from '${BoolType}' to '${typeValue.typeName()}'`);
    }
  }
  public equal(other: Val): Val {
    return other instanceof Bool && this.inner === other.inner ? True : False;
  }

  /** IsZeroValue returns true if the boolean value is false. */
  public isZeroValue(): boolean {
    return !this.inner;
  }
  public negate(): Val {
    return this.inner ? False : True;
  }
  public type(): RefType {
    return BoolType;
  }
  public value(): boolean {
    return this.inner;
  }
}

/**
 * False is the false Bool constant.
 */
export const False = new Bool(false);
/**
 * True is the true Bool constant.
 */
export const True = new Bool(true);

/**
 * IsBool returns whether the input ref.Val or ref.Type is equal to BoolType.
 */
export function isBool(elem: unknown): boolean {
  return (
    elem instanceof Bool ||
    (typeof elem === "object" &&
      elem !== null &&
      "type" in elem &&
      (elem as Val).type() === BoolType)
  );
}
