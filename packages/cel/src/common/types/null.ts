import type { DescMessage } from "@bufbuild/protobuf";
import {
  AnySchema,
  anyPack,
  ListValueSchema,
  StructSchema,
  ValueSchema,
  NullValue as WktNullValue,
} from "@bufbuild/protobuf/wkt";
import { Bool } from "./bool.js";
import { err } from "./err.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import { NullType, StringType, TypeType } from "./types.js";

/**
 * Null implements CEL null.
 */
export class Null implements Val {
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === undefined || typeDesc === WktNullValue) {
      return WktNullValue.NULL_VALUE;
    }
    if (typeDesc === NullValue) {
      return this;
    }
    if (typeDesc === ValueSchema) {
      return {
        $typeName: "google.protobuf.Value",
        kind: { case: "nullValue", value: WktNullValue.NULL_VALUE },
      };
    }
    if (typeDesc === AnySchema) {
      return anyPack(ValueSchema, {
        $typeName: "google.protobuf.Value",
        kind: { case: "nullValue", value: WktNullValue.NULL_VALUE },
      });
    }
    if (isMessageDescriptor(typeDesc)) {
      if (
        typeDesc.typeName !== ListValueSchema.typeName &&
        typeDesc.typeName !== StructSchema.typeName
      ) {
        // Protobuf message, wrapper, duration, and timestamp fields prune CEL null assignments.
        return undefined;
      }
    }
    const typeName =
      typeDesc === Number
        ? "int"
        : typeDesc === ListValueSchema
          ? "*structpb.ListValue"
          : typeDesc === StructSchema
            ? "*structpb.Struct"
            : String(typeDesc);
    throw new Error(`type conversion error from '${NullType}' to '${typeName}'`);
  }
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
  public equal(other: Val): Val {
    return new Bool(
      typeof other === "object" &&
        other !== null &&
        "type" in other &&
        typeof other.type === "function" &&
        other.type() === NullType,
    );
  }

  /** IsZeroValue returns true as null always represents an absent value. */
  public isZeroValue(): boolean {
    return true;
  }
  public type(): RefType {
    return NullType;
  }
  public value(): WktNullValue {
    return WktNullValue.NULL_VALUE;
  }
}

/**
 * NullValue is the null singleton.
 */
export const NullValue = new Null();

/** isMessageDescriptor reports whether a native conversion target is a protobuf message schema. */
function isMessageDescriptor(value: unknown): value is DescMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as { kind: unknown }).kind === "message"
  );
}
