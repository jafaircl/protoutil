import { ListValueSchema, NullValue, StructSchema, ValueSchema } from "@bufbuild/protobuf/wkt";

/**
 * JSONValueType describes the protobuf native type for a JSON value.
 */
export const JSONValueType = ValueSchema;

/**
 * JSONListType describes the protobuf native type for a JSON list value.
 */
export const JSONListType = ListValueSchema;

/**
 * JSONStructType describes the protobuf native type for a JSON struct value.
 */
export const JSONStructType = StructSchema;

/**
 * JSONNullType describes the protobuf native type for a JSON null value.
 */
export const JSONNullType = NullValue.NULL_VALUE;
