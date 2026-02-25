/** biome-ignore-all lint/correctness/noSwitchDeclarations: TODO */
/** biome-ignore-all lint/style/noNonNullAssertion: TODO */
import { create, type MessageInitShape } from "@bufbuild/protobuf";
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

export type TypeInit = MessageInitShape<typeof TypeSchema>;

export const DYN: TypeInit = create(TypeSchema, {
  typeKind: {
    case: "dyn",
    value: {},
  },
});
export const NULL: TypeInit = create(TypeSchema, {
  typeKind: {
    case: "null",
    value: NullValue.NULL_VALUE,
  },
});
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
export const BOOL = primitiveType(Type_PrimitiveType.BOOL);
export const BYTES = primitiveType(Type_PrimitiveType.BYTES);
export const DOUBLE = primitiveType(Type_PrimitiveType.DOUBLE);
export const INT64 = primitiveType(Type_PrimitiveType.INT64);
export const STRING = primitiveType(Type_PrimitiveType.STRING);
export const UINT64 = primitiveType(Type_PrimitiveType.UINT64);

function wellKnownType(type: Type_WellKnownType): TypeInit {
  return create(TypeSchema, {
    typeKind: {
      case: "wellKnown",
      value: type,
    },
  });
}
export const ANY = wellKnownType(Type_WellKnownType.ANY);
export const DURATION = wellKnownType(Type_WellKnownType.DURATION);
export const TIMESTAMP = wellKnownType(Type_WellKnownType.TIMESTAMP);

export function listType(elemType: TypeInit): TypeInit {
  return {
    typeKind: {
      case: "listType",
      value: { elemType },
    },
  };
}

export function mapType(keyType: TypeInit, valueType: TypeInit): TypeInit {
  return {
    typeKind: {
      case: "mapType",
      value: { keyType, valueType },
    },
  };
}

export function messageType(typeName: string): TypeInit {
  return {
    typeKind: {
      case: "messageType",
      value: typeName,
    },
  };
}

export function typeType(type: Type): TypeInit {
  return {
    typeKind: {
      case: "type",
      value: type,
    },
  };
}

export function typeParamType(name: string): TypeInit {
  return {
    typeKind: {
      case: "typeParam",
      value: name,
    },
  };
}
export const PARAM_A = typeParamType("A");
export const PARAM_B = typeParamType("B");
export const LIST_OF_A = listType(PARAM_A);
export const MAP_OF_A_B = mapType(PARAM_A, PARAM_B);

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

export function wrapperType(type: Type_PrimitiveType): TypeInit {
  return {
    typeKind: {
      case: "wrapper",
      value: type,
    },
  };
}

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

export type OverloadInit = MessageInitShape<typeof Decl_FunctionDecl_OverloadSchema>;

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
