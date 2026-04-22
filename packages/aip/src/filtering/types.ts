/** biome-ignore-all lint/correctness/noSwitchDeclarations: TODO */
/** biome-ignore-all lint/style/noNonNullAssertion: TODO */
import {
  create,
  type DescField,
  type DescMessage,
  type MessageInitShape,
  ScalarType,
} from "@bufbuild/protobuf";
import { NullValue } from "@bufbuild/protobuf/wkt";
import type {
  Decl,
  Decl_FunctionDecl_OverloadSchema,
} from "./../gen/google/api/expr/v1alpha1/checked_pb";
import {
  DeclSchema,
  type Type,
  Type_PrimitiveType,
  Type_WellKnownType,
  TypeSchema,
} from "../gen/google/api/expr/v1alpha1/checked_pb.js";
import type { Constant } from "../gen/google/api/expr/v1alpha1/syntax_pb.js";

/**
 * Message-init shape for CEL `Type` values.
 */
export type TypeInit = MessageInitShape<typeof TypeSchema>;

/** CEL dynamic type. */
export const DYN: TypeInit = create(TypeSchema, {
  typeKind: {
    case: "dyn",
    value: {},
  },
});
/** CEL null type. */
export const NULL: TypeInit = create(TypeSchema, {
  typeKind: {
    case: "null",
    value: NullValue.NULL_VALUE,
  },
});
/** CEL error type. */
export const ERROR: TypeInit = create(TypeSchema, {
  typeKind: {
    case: "error",
    value: {},
  },
});

function primitiveType(type: Type_PrimitiveType): TypeInit {
  return create(TypeSchema, {
    typeKind: {
      case: "primitive",
      value: type,
    },
  });
}
/** CEL bool type. */
export const BOOL = primitiveType(Type_PrimitiveType.BOOL);
/** CEL bytes type. */
export const BYTES = primitiveType(Type_PrimitiveType.BYTES);
/** CEL double type. */
export const DOUBLE = primitiveType(Type_PrimitiveType.DOUBLE);
/** CEL int64 type. */
export const INT64 = primitiveType(Type_PrimitiveType.INT64);
/** CEL string type. */
export const STRING = primitiveType(Type_PrimitiveType.STRING);
/** CEL uint64 type. */
export const UINT64 = primitiveType(Type_PrimitiveType.UINT64);

function wellKnownType(type: Type_WellKnownType): TypeInit {
  return create(TypeSchema, {
    typeKind: {
      case: "wellKnown",
      value: type,
    },
  });
}
/** CEL `google.protobuf.Any` type. */
export const ANY = wellKnownType(Type_WellKnownType.ANY);
/** CEL `google.protobuf.Duration` type. */
export const DURATION = wellKnownType(Type_WellKnownType.DURATION);
/** CEL `google.protobuf.Timestamp` type. */
export const TIMESTAMP = wellKnownType(Type_WellKnownType.TIMESTAMP);

/**
 * Creates a CEL list type.
 */
export function listType(elemType: TypeInit): TypeInit {
  return {
    typeKind: {
      case: "listType",
      value: { elemType },
    },
  };
}

/**
 * Creates a CEL map type.
 */
export function mapType(keyType: TypeInit, valueType: TypeInit): TypeInit {
  return {
    typeKind: {
      case: "mapType",
      value: { keyType, valueType },
    },
  };
}

/**
 * Creates a CEL message type from a protobuf descriptor.
 */
export function messageType(desc: DescMessage): TypeInit {
  return {
    typeKind: {
      case: "messageType",
      value: desc.typeName,
    },
  };
}

/**
 * Creates a CEL meta-type (`type(T)`).
 */
export function typeType(type: Type): TypeInit {
  return {
    typeKind: {
      case: "type",
      value: type,
    },
  };
}

/**
 * Creates a named CEL type parameter.
 */
export function typeParamType(name: string): TypeInit {
  return {
    typeKind: {
      case: "typeParam",
      value: name,
    },
  };
}
/** Default generic type parameter `A`. */
export const PARAM_A = typeParamType("A");
/** Default generic type parameter `B`. */
export const PARAM_B = typeParamType("B");
/** Convenience alias for `list(A)`. */
export const LIST_OF_A = listType(PARAM_A);
/** Convenience alias for `map(A, B)`. */
export const MAP_OF_A_B = mapType(PARAM_A, PARAM_B);

/**
 * Creates an abstract CEL type with optional parameter types.
 */
export function abstractType(name: string, parameterTypes?: TypeInit[]): TypeInit {
  return {
    typeKind: {
      case: "abstractType",
      value: {
        name,
        parameterTypes,
      },
    },
  };
}

/**
 * Creates a CEL wrapper type for a primitive.
 */
export function wrapperType(type: Type_PrimitiveType): TypeInit {
  return {
    typeKind: {
      case: "wrapper",
      value: type,
    },
  };
}

/**
 * Creates a CEL function type.
 */
export function functionType(argTypes: Type[], resultType: Type): TypeInit {
  return {
    typeKind: {
      case: "function",
      value: {
        argTypes,
        resultType,
      },
    },
  };
}

function primitiveToString(type: Type_PrimitiveType): string {
  switch (type) {
    case Type_PrimitiveType.BOOL:
      return "bool";
    case Type_PrimitiveType.BYTES:
      return "bytes";
    case Type_PrimitiveType.DOUBLE:
      return "double";
    case Type_PrimitiveType.INT64:
      return "int64";
    case Type_PrimitiveType.STRING:
      return "string";
    case Type_PrimitiveType.UINT64:
      return "uint64";
    default:
      throw new Error(`Unknown primitive type: ${type}`);
  }
}

function wellKnownTypeToString(type: Type_WellKnownType): string {
  switch (type) {
    case Type_WellKnownType.ANY:
      return "google.protobuf.Any";
    case Type_WellKnownType.DURATION:
      return "google.protobuf.Duration";
    case Type_WellKnownType.TIMESTAMP:
      return "google.protobuf.Timestamp";
    default:
      throw new Error(`Unknown well-known type: ${type}`);
  }
}

/**
 * Formats a CEL type as a human-readable string.
 */
export function typeToString(type: TypeInit): string {
  switch (type.typeKind?.case) {
    case "dyn":
      return "dyn";
    case "null":
      return "null";
    case "error":
      return "error";
    case "primitive":
      return primitiveToString(type.typeKind.value);
    case "wellKnown":
      return wellKnownTypeToString(type.typeKind.value);
    case "wrapper":
      return `wrapper(${primitiveToString(type.typeKind.value)})`;
    case "listType":
      return `list(${typeToString(type.typeKind.value.elemType!)})`;
    case "mapType":
      return `map(${typeToString(type.typeKind.value.keyType!)}, ${typeToString(type.typeKind.value.valueType!)})`;
    case "messageType":
      return type.typeKind.value;
    case "type":
      return `type(${typeToString(type.typeKind.value)})`;
    case "typeParam":
      return type.typeKind.value;
    case "abstractType":
      const params = type.typeKind.value.parameterTypes?.map(typeToString).join(", ") || "";
      return `${type.typeKind.value.name}${params ? `(${params})` : ""}`;
    case "function":
      const args = type.typeKind.value.argTypes?.map(typeToString).join(", ") || "";
      const result = typeToString(type.typeKind.value.resultType!);
      return `(${args}) => ${result}`;
    default:
      throw new Error(`Unknown type kind: ${type.typeKind?.case}`);
  }
}

/**
 * Creates an identifier declaration for the filter checker.
 */
export function ident(name: string, type: TypeInit, value?: Constant, doc = ""): Decl {
  return create(DeclSchema, {
    name,
    declKind: {
      case: "ident",
      value: {
        type,
        value,
        doc,
      },
    },
  });
}

/**
 * Message-init shape for CEL function overload declarations.
 */
export type OverloadInit = MessageInitShape<typeof Decl_FunctionDecl_OverloadSchema>;

/**
 * Creates a non-instance function overload declaration.
 */
export function overload(
  overloadId: string,
  params: TypeInit[],
  resultType: TypeInit,
  doc = "",
  typeParams: string[] = [],
): OverloadInit {
  return {
    overloadId,
    params,
    resultType,
    isInstanceFunction: false,
    doc,
    typeParams,
  };
}

/**
 * Creates an instance-function overload declaration.
 */
export function memberOverload(
  overloadId: string,
  params: TypeInit[],
  resultType: TypeInit,
  doc = "",
  typeParams: string[] = [],
): OverloadInit {
  return {
    overloadId,
    params,
    resultType,
    isInstanceFunction: true,
    doc,
    typeParams,
  };
}

/**
 * Creates a function declaration for the filter checker.
 */
export function func(name: string, ...overloads: OverloadInit[]): Decl {
  return create(DeclSchema, {
    name,
    declKind: {
      case: "function",
      value: {
        overloads,
      },
    },
  });
}

// ── Proto descriptor → filter type mapping ────────────────────────────────────

const WELL_KNOWN_MESSAGE_TYPES: Record<string, TypeInit> = {
  "google.protobuf.Timestamp": TIMESTAMP,
  "google.protobuf.Duration": DURATION,
  "google.protobuf.Any": ANY,
  "google.protobuf.Struct": mapType(STRING, DYN),
  "google.protobuf.Value": DYN,
  "google.protobuf.ListValue": listType(DYN),
  "google.protobuf.BoolValue": BOOL,
  "google.protobuf.BytesValue": BYTES,
  "google.protobuf.DoubleValue": DOUBLE,
  "google.protobuf.FloatValue": DOUBLE,
  "google.protobuf.Int32Value": INT64,
  "google.protobuf.Int64Value": INT64,
  "google.protobuf.UInt32Value": UINT64,
  "google.protobuf.UInt64Value": UINT64,
  "google.protobuf.StringValue": STRING,
};

function scalarToType(scalar: ScalarType): TypeInit {
  switch (scalar) {
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
      return DOUBLE;
    case ScalarType.INT32:
    case ScalarType.INT64:
    case ScalarType.SINT32:
    case ScalarType.SINT64:
    case ScalarType.SFIXED32:
    case ScalarType.SFIXED64:
      return INT64;
    case ScalarType.UINT32:
    case ScalarType.UINT64:
    case ScalarType.FIXED32:
    case ScalarType.FIXED64:
      return UINT64;
    case ScalarType.BOOL:
      return BOOL;
    case ScalarType.STRING:
      return STRING;
    case ScalarType.BYTES:
      return BYTES;
  }
}

/**
 * Convert a protobuf field descriptor to a filter type. Handles scalar,
 * message (including well-known types), enum, list, and map fields.
 */
export function descFieldToType(field: DescField): TypeInit {
  switch (field.fieldKind) {
    case "scalar":
      return scalarToType(field.scalar);

    case "enum":
      return INT64;

    case "message": {
      const wkt = WELL_KNOWN_MESSAGE_TYPES[field.message.typeName];
      if (wkt) return wkt;
      return messageType(field.message);
    }

    case "list":
      switch (field.listKind) {
        case "scalar":
          return listType(scalarToType(field.scalar));
        case "enum":
          return listType(INT64);
        case "message": {
          const wkt = WELL_KNOWN_MESSAGE_TYPES[field.message.typeName];
          return listType(wkt ?? messageType(field.message));
        }
      }

    case "map": {
      const keyType = scalarToType(field.mapKey);
      let valueType: TypeInit;
      switch (field.mapKind) {
        case "scalar":
          valueType = scalarToType(field.scalar);
          break;
        case "enum":
          valueType = INT64;
          break;
        case "message": {
          const wkt = WELL_KNOWN_MESSAGE_TYPES[field.message.typeName];
          valueType = wkt ?? messageType(field.message);
          break;
        }
      }
      return mapType(keyType, valueType);
    }
  }
}
