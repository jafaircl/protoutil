import {
  create,
  type DescExtension,
  type DescField,
  type DescMessage,
  ScalarType,
} from "@bufbuild/protobuf";
import { EmptySchema, NullValue as WktNullValue } from "@bufbuild/protobuf/wkt";
import {
  type Type as ExprType,
  Type_PrimitiveType,
  Type_WellKnownType,
} from "../../../gen/cel/expr/checked_pb.js";

/**
 * CheckedPrimitives maps from proto field descriptor type to expr.Type.
 */
/**
 * checkedDyn is the protobuf CEL dyn type.
 */
export const checkedDyn: ExprType = {
  $typeName: "cel.expr.Type",
  typeKind: { case: "dyn", value: create(EmptySchema) },
};

/**
 * checkedBool is the protobuf CEL bool type.
 */
export const checkedBool = checkedPrimitive(Type_PrimitiveType.BOOL);

/**
 * checkedBytes is the protobuf CEL bytes type.
 */
export const checkedBytes = checkedPrimitive(Type_PrimitiveType.BYTES);

/**
 * checkedDouble is the protobuf CEL double type.
 */
export const checkedDouble = checkedPrimitive(Type_PrimitiveType.DOUBLE);

/**
 * checkedInt is the protobuf CEL int type.
 */
export const checkedInt = checkedPrimitive(Type_PrimitiveType.INT64);

/**
 * checkedString is the protobuf CEL string type.
 */
export const checkedString = checkedPrimitive(Type_PrimitiveType.STRING);

/**
 * checkedUint is the protobuf CEL uint type.
 */
export const checkedUint = checkedPrimitive(Type_PrimitiveType.UINT64);

/**
 * checkedAny is the protobuf CEL Any type.
 */
export const checkedAny = checkedWellKnown(Type_WellKnownType.ANY);

/**
 * checkedDuration is the protobuf CEL duration type.
 */
export const checkedDuration = checkedWellKnown(Type_WellKnownType.DURATION);

/**
 * checkedTimestamp is the protobuf CEL timestamp type.
 */
export const checkedTimestamp = checkedWellKnown(Type_WellKnownType.TIMESTAMP);

/**
 * checkedNull is the protobuf CEL null type.
 */
export const checkedNull: ExprType = {
  $typeName: "cel.expr.Type",
  typeKind: { case: "null", value: WktNullValue.NULL_VALUE },
};

/**
 * checkedListDyn is the protobuf CEL list(dyn) type.
 */
export const checkedListDyn: ExprType = {
  $typeName: "cel.expr.Type",
  typeKind: {
    case: "listType",
    value: { $typeName: "cel.expr.Type.ListType", elemType: checkedDyn },
  },
};

/**
 * checkedMapStringDyn is the protobuf CEL map(string, dyn) type.
 */
export const checkedMapStringDyn: ExprType = {
  $typeName: "cel.expr.Type",
  typeKind: {
    case: "mapType",
    value: {
      $typeName: "cel.expr.Type.MapType",
      keyType: checkedString,
      valueType: checkedDyn,
    },
  },
};

/**
 * CheckedPrimitives maps from proto field descriptor type to expr.Type.
 */
export const CheckedPrimitives = new Map<ScalarType, ExprType>([
  [ScalarType.DOUBLE, checkedDouble],
  [ScalarType.FLOAT, checkedDouble],
  [ScalarType.INT64, checkedInt],
  [ScalarType.UINT64, checkedUint],
  [ScalarType.INT32, checkedInt],
  [ScalarType.FIXED64, checkedUint],
  [ScalarType.FIXED32, checkedUint],
  [ScalarType.BOOL, checkedBool],
  [ScalarType.STRING, checkedString],
  [ScalarType.BYTES, checkedBytes],
  [ScalarType.UINT32, checkedUint],
  [ScalarType.SFIXED32, checkedInt],
  [ScalarType.SFIXED64, checkedInt],
  [ScalarType.SINT32, checkedInt],
  [ScalarType.SINT64, checkedInt],
]);

/**
 * CheckedWellKnowns maps from qualified proto type name to expr.Type for well-known proto types.
 */
export const CheckedWellKnowns = new Map<string, ExprType>([
  ["google.protobuf.BoolValue", checkedWrap(checkedBool)],
  ["google.protobuf.BytesValue", checkedWrap(checkedBytes)],
  ["google.protobuf.DoubleValue", checkedWrap(checkedDouble)],
  ["google.protobuf.FloatValue", checkedWrap(checkedDouble)],
  ["google.protobuf.Int64Value", checkedWrap(checkedInt)],
  ["google.protobuf.Int32Value", checkedWrap(checkedInt)],
  ["google.protobuf.UInt64Value", checkedWrap(checkedUint)],
  ["google.protobuf.UInt32Value", checkedWrap(checkedUint)],
  ["google.protobuf.StringValue", checkedWrap(checkedString)],
  ["google.protobuf.Any", checkedAny],
  ["google.protobuf.Duration", checkedDuration],
  ["google.protobuf.Timestamp", checkedTimestamp],
  ["google.protobuf.ListValue", checkedListDyn],
  ["google.protobuf.NullValue", checkedNull],
  ["google.protobuf.Struct", checkedMapStringDyn],
  ["google.protobuf.Value", checkedDyn],
]);

/**
 * checkedMessageType returns a checked protobuf message type.
 */
export function checkedMessageType(name: string): ExprType {
  return {
    $typeName: "cel.expr.Type",
    typeKind: { case: "messageType", value: name },
  };
}

/**
 * checkedPrimitive returns a checked protobuf primitive type.
 */
export function checkedPrimitive(primitive: Type_PrimitiveType): ExprType {
  return {
    $typeName: "cel.expr.Type",
    typeKind: { case: "primitive", value: primitive },
  };
}

/**
 * checkedWellKnown returns a checked protobuf well-known type.
 */
export function checkedWellKnown(wellKnown: Type_WellKnownType): ExprType {
  return {
    $typeName: "cel.expr.Type",
    typeKind: { case: "wellKnown", value: wellKnown },
  };
}

/**
 * checkedWrap returns a checked protobuf wrapper type.
 */
export function checkedWrap(t: ExprType): ExprType {
  return {
    $typeName: "cel.expr.Type",
    typeKind: { case: "wrapper", value: t.typeKind.value as Type_PrimitiveType },
  };
}

/**
 * checkedTypeForField returns the checked CEL type for a field descriptor.
 */
export function checkedTypeForField(field: DescField | DescExtension): ExprType {
  if (field.fieldKind === "map") {
    return {
      $typeName: "cel.expr.Type",
      typeKind: {
        case: "mapType",
        value: {
          $typeName: "cel.expr.Type.MapType",
          keyType: checkedTypeForMapKey(field),
          valueType: checkedTypeForMapValue(field),
        },
      },
    };
  }
  if (field.fieldKind === "list") {
    return {
      $typeName: "cel.expr.Type",
      typeKind: {
        case: "listType",
        value: {
          $typeName: "cel.expr.Type.ListType",
          elemType: checkedTypeForListElement(field),
        },
      },
    };
  }
  return checkedTypeForSingularField(field);
}

/**
 * checkedTypeForMessage returns the checked CEL type for a message descriptor.
 */
export function checkedTypeForMessage(message: DescMessage): ExprType {
  return CheckedWellKnowns.get(message.typeName) ?? checkedMessageType(message.typeName);
}

function checkedTypeForSingularField(
  field: Exclude<DescField | DescExtension, { fieldKind: "list" | "map" }>,
): ExprType {
  switch (field.fieldKind) {
    case "enum":
      return checkedInt;
    case "message":
      return checkedTypeForMessage(field.message);
    case "scalar":
      return CheckedPrimitives.get(field.scalar)!;
  }
}

function checkedTypeForListElement(
  field: Extract<DescField | DescExtension, { fieldKind: "list" }>,
): ExprType {
  switch (field.listKind) {
    case "enum":
      return checkedInt;
    case "message":
      return checkedTypeForMessage(field.message);
    case "scalar":
      return CheckedPrimitives.get(field.scalar)!;
  }
}

function checkedTypeForMapKey(field: Extract<DescField, { fieldKind: "map" }>): ExprType {
  return CheckedPrimitives.get(field.mapKey)!;
}

function checkedTypeForMapValue(field: Extract<DescField, { fieldKind: "map" }>): ExprType {
  switch (field.mapKind) {
    case "enum":
      return checkedInt;
    case "message":
      return checkedTypeForMessage(field.message);
    case "scalar":
      return CheckedPrimitives.get(field.scalar)!;
  }
}
