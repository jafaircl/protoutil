import {
  anyPack,
  type BoolValueSchema,
  type BytesValueSchema,
  type DoubleValueSchema,
  type FloatValueSchema,
  type Int32ValueSchema,
  type Int64ValueSchema,
  type StringValueSchema,
  type UInt32ValueSchema,
  type UInt64ValueSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import { errIntOverflow, errUintOverflow } from "./err.js";

type NativeKind = "int8" | "int16" | "int32" | "uint8" | "uint16" | "uint32" | "float32";

type NativeDescriptor = {
  readonly kind: NativeKind;
};

function nativeDescriptor(kind: NativeKind): NativeDescriptor {
  return { kind };
}

/**
 * Int8NativeType identifies an 8-bit signed integer conversion target.
 */
export const Int8NativeType = nativeDescriptor("int8");

/**
 * Int16NativeType identifies a 16-bit signed integer conversion target.
 */
export const Int16NativeType = nativeDescriptor("int16");

/**
 * Int32NativeType identifies a 32-bit signed integer conversion target.
 */
export const Int32NativeType = nativeDescriptor("int32");

/**
 * Uint8NativeType identifies an 8-bit unsigned integer conversion target.
 */
export const Uint8NativeType = nativeDescriptor("uint8");

/**
 * Uint16NativeType identifies a 16-bit unsigned integer conversion target.
 */
export const Uint16NativeType = nativeDescriptor("uint16");

/**
 * Uint32NativeType identifies a 32-bit unsigned integer conversion target.
 */
export const Uint32NativeType = nativeDescriptor("uint32");

/**
 * Float32NativeType identifies a 32-bit floating point conversion target.
 */
export const Float32NativeType = nativeDescriptor("float32");

/**
 * NativeStringCtor identifies a custom string constructor target.
 */
export interface NativeStringCtor<T = unknown> {
  new (value: string): T;
}

/**
 * MaxJSONInteger indicates the largest integer which can round-trip through JSON numbers safely.
 */
export const MaxJSONInteger = 9_007_199_254_740_991n;

/**
 * isNativeDescriptor returns whether the input is one of the local native conversion descriptors.
 */
export function isNativeDescriptor(value: unknown): value is NativeDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof (value as { kind: unknown }).kind === "string"
  );
}

/**
 * nativeTypeName returns a human-readable name for local native conversion descriptors.
 */
export function nativeTypeName(value: unknown): string {
  if (value === Boolean) {
    return "bool";
  }
  if (value === String) {
    return "string";
  }
  if (value === Number) {
    return "number";
  }
  if (value === BigInt) {
    return "bigint";
  }
  if (value === Date) {
    return "Date";
  }
  if (value === Uint8Array) {
    return "Uint8Array";
  }
  if (value instanceof Function && value.name) {
    return value.name;
  }
  if (isNativeDescriptor(value)) {
    return value.kind;
  }
  if (typeof value === "object" && value !== null && "$typeName" in value) {
    return String((value as { $typeName: unknown }).$typeName);
  }
  return String(value);
}

/**
 * packAnyPrimitive wraps a primitive protobuf wrapper in an Any message.
 */
export function packAnyPrimitive(schema: typeof BoolValueSchema, value: boolean) {
  return anyPack(schema, { $typeName: schema.typeName, value } as never);
}

export function packAnyBytes(schema: typeof BytesValueSchema, value: Uint8Array) {
  return anyPack(schema, { $typeName: schema.typeName, value } as never);
}

export function packAnyDouble(
  schema: typeof DoubleValueSchema | typeof FloatValueSchema,
  value: number,
) {
  return anyPack(schema, { $typeName: schema.typeName, value } as never);
}

export function packAnyInt(
  schema: typeof Int32ValueSchema | typeof Int64ValueSchema,
  value: bigint | number,
) {
  return anyPack(schema, { $typeName: schema.typeName, value } as never);
}

export function packAnyString(schema: typeof StringValueSchema, value: string) {
  return anyPack(schema, { $typeName: schema.typeName, value } as never);
}

export function packAnyUint(
  schema: typeof UInt32ValueSchema | typeof UInt64ValueSchema,
  value: bigint | number,
) {
  return anyPack(schema, { $typeName: schema.typeName, value } as never);
}

/**
 * jsonIntegerValue converts an int/uint to the protobuf JSON representation expected by CEL.
 */
export function jsonIntegerValue(value: bigint) {
  if (value >= -MaxJSONInteger && value <= MaxJSONInteger) {
    return { $typeName: ValueSchema.typeName, kind: { case: "numberValue", value: Number(value) } };
  }
  return {
    $typeName: ValueSchema.typeName,
    kind: { case: "stringValue", value: value.toString() },
  };
}

/**
 * toInt8Checked converts a bigint to a signed 8-bit integer or throws on overflow.
 */
export function toInt8Checked(value: bigint): number {
  if (value < -128n || value > 127n) {
    throw errIntOverflow;
  }
  return Number(value);
}

/**
 * toInt16Checked converts a bigint to a signed 16-bit integer or throws on overflow.
 */
export function toInt16Checked(value: bigint): number {
  if (value < -32_768n || value > 32_767n) {
    throw errIntOverflow;
  }
  return Number(value);
}

/**
 * toInt32Checked converts a bigint to a signed 32-bit integer or throws on overflow.
 */
export function toInt32Checked(value: bigint): number {
  if (value < -2_147_483_648n || value > 2_147_483_647n) {
    throw errIntOverflow;
  }
  return Number(value);
}

/**
 * toUint8Checked converts a bigint to an unsigned 8-bit integer or throws on overflow.
 */
export function toUint8Checked(value: bigint): number {
  if (value < 0n || value > 255n) {
    throw errUintOverflow;
  }
  return Number(value);
}

/**
 * toUint16Checked converts a bigint to an unsigned 16-bit integer or throws on overflow.
 */
export function toUint16Checked(value: bigint): number {
  if (value < 0n || value > 65_535n) {
    throw errUintOverflow;
  }
  return Number(value);
}

/**
 * toUint32Checked converts a bigint to an unsigned 32-bit integer or throws on overflow.
 */
export function toUint32Checked(value: bigint): number {
  if (value < 0n || value > 4_294_967_295n) {
    throw errUintOverflow;
  }
  return Number(value);
}
