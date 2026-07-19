import { create } from "@bufbuild/protobuf";
import { EmptySchema, NullValue } from "@bufbuild/protobuf/wkt";
import {
  type Decl,
  type Decl_FunctionDecl_Overload,
  type Type,
  Type_PrimitiveType,
  Type_WellKnownType,
} from "../gen/cel/expr/checked_pb.js";
import type { Constant } from "../gen/cel/expr/syntax_pb.js";

/**
 * Error type used to communicate issues during type-checking.
 */
const ErrorTypeValue: Type = {
  $typeName: "cel.expr.Type",
  typeKind: { case: "error", value: create(EmptySchema) },
};
export { ErrorTypeValue as Error };

/**
 * Dyn is a top-type used to represent any value.
 */
export const Dyn: Type = {
  $typeName: "cel.expr.Type",
  typeKind: { case: "dyn", value: create(EmptySchema) },
};

// Commonly used types.
export const Bool = primitiveType(Type_PrimitiveType.BOOL);
export const Bytes = primitiveType(Type_PrimitiveType.BYTES);
export const Double = primitiveType(Type_PrimitiveType.DOUBLE);
export const Int = primitiveType(Type_PrimitiveType.INT64);
export const Null: Type = {
  $typeName: "cel.expr.Type",
  typeKind: { case: "null", value: NullValue.NULL_VALUE },
};
const StringTypeValue = primitiveType(Type_PrimitiveType.STRING);
export { StringTypeValue as String };
export const Uint = primitiveType(Type_PrimitiveType.UINT64);

// Well-known types.
// TODO: Replace with an abstract type registry.
export const Any = wellKnownType(Type_WellKnownType.ANY);
export const Duration = wellKnownType(Type_WellKnownType.DURATION);
export const Timestamp = wellKnownType(Type_WellKnownType.TIMESTAMP);

/**
 * AbstractType creates an abstract type declaration which references a proto
 * may also include type parameters.
 *
 * This mirrors cel-go's `NewAbstractType`, but omits the `new` prefix per
 * local porting rules.
 */
export function abstractType(name: string, ...paramTypes: Type[]): Type {
  return {
    $typeName: "cel.expr.Type",
    typeKind: {
      case: "abstractType",
      value: {
        $typeName: "cel.expr.Type.AbstractType",
        name,
        parameterTypes: paramTypes,
      },
    },
  };
}

/**
 * OptionalType constructs an abstract type indicating that the parameterized type
 * contained within the object.
 *
 * This mirrors cel-go's `NewOptionalType`, but omits the `new` prefix per
 * local porting rules.
 */
export function optionalType(paramType: Type): Type {
  return abstractType("optional_type", paramType);
}

/**
 * FunctionType creates a function invocation contract, typically only used
 * steps after overload resolution.
 *
 * This mirrors cel-go's `NewFunctionType`, but omits the `new` prefix per
 * local porting rules.
 */
export function functionType(resultType: Type, ...argTypes: Type[]): Type {
  return {
    $typeName: "cel.expr.Type",
    typeKind: {
      case: "function",
      value: {
        $typeName: "cel.expr.Type.FunctionType",
        resultType,
        argTypes,
      },
    },
  };
}

/**
 * FunctionDecl creates a named function declaration with one or more overloads.
 *
 * This mirrors cel-go's `NewFunction`, but omits the `new` prefix per local
 * porting rules.
 */
export function functionDecl(name: string, ...overloads: Decl_FunctionDecl_Overload[]): Decl {
  return {
    $typeName: "cel.expr.Decl",
    name,
    declKind: {
      case: "function",
      value: {
        $typeName: "cel.expr.Decl.FunctionDecl",
        overloads,
        doc: "",
      },
    },
  };
}

/**
 * FunctionDeclWithDoc creates a named function declaration with a description and one or more
 * overloads.
 *
 * This mirrors cel-go's `NewFunctionWithDoc`, but omits the `new` prefix per
 * local porting rules.
 */
export function functionDeclWithDoc(
  name: string,
  _doc: string,
  ...overloads: Decl_FunctionDecl_Overload[]
): Decl {
  return {
    $typeName: "cel.expr.Decl",
    name,
    declKind: {
      case: "function",
      value: {
        $typeName: "cel.expr.Decl.FunctionDecl",
        // Doc: desc,
        overloads,
        doc: "",
      },
    },
  };
}

/**
 * IdentDecl creates a named identifier declaration with an optional literal
 * value.
 *
 * Literal values are typically only associated with enum identifiers.
 *
 * Deprecated: Use VarDecl or ConstDecl instead.
 *
 * This mirrors cel-go's `NewIdent`, but omits the `new` prefix per local
 * porting rules.
 */
export function identDecl(name: string, t: Type, v?: Constant): Decl {
  return ident(name, t, v, "");
}

/**
 * ConstDecl creates a constant identifier with a CEL constant literal value.
 *
 * This mirrors cel-go's `NewConst`, but omits the `new` prefix per local
 * porting rules.
 */
export function constDecl(name: string, t: Type, v: Constant): Decl {
  return ident(name, t, v, "");
}

/**
 * VarDecl creates a variable identifier.
 *
 * This mirrors cel-go's `NewVar`, but omits the `new` prefix per local
 * porting rules.
 */
export function varDecl(name: string, t: Type): Decl {
  return ident(name, t, undefined, "");
}

/**
 * VarDeclWithDoc creates a variable identifier with a type and a description string.
 *
 * This mirrors cel-go's `NewVarWithDoc`, but omits the `new` prefix per local
 * porting rules.
 */
export function varDeclWithDoc(name: string, t: Type, desc: string): Decl {
  return ident(name, t, undefined, desc);
}

/**
 * InstanceOverload creates an instance function overload contract.
 * First element of argTypes is instance.
 *
 * This mirrors cel-go's `NewInstanceOverload`, but omits the `new` prefix per
 * local porting rules.
 */
export function instanceOverload(
  id: string,
  argTypes: Type[],
  resultType: Type,
): Decl_FunctionDecl_Overload {
  return {
    $typeName: "cel.expr.Decl.FunctionDecl.Overload",
    overloadId: id,
    resultType,
    params: argTypes,
    typeParams: [],
    isInstanceFunction: true,
    doc: "",
  };
}

/**
 * ListType generates a new list with elements of a certain type.
 *
 * This mirrors cel-go's `NewListType`, but omits the `new` prefix per local
 * porting rules.
 */
export function listType(elem: Type): Type {
  return {
    $typeName: "cel.expr.Type",
    typeKind: {
      case: "listType",
      value: {
        $typeName: "cel.expr.Type.ListType",
        elemType: elem,
      },
    },
  };
}

/**
 * MapType generates a new map with typed keys and values.
 *
 * This mirrors cel-go's `NewMapType`, but omits the `new` prefix per local
 * porting rules.
 */
export function mapType(key: Type, value: Type): Type {
  return {
    $typeName: "cel.expr.Type",
    typeKind: {
      case: "mapType",
      value: {
        $typeName: "cel.expr.Type.MapType",
        keyType: key,
        valueType: value,
      },
    },
  };
}

/**
 * ObjectType creates an object type for a qualified type name.
 *
 * This mirrors cel-go's `NewObjectType`, but omits the `new` prefix per local
 * porting rules.
 */
export function objectType(typeName: string): Type {
  return {
    $typeName: "cel.expr.Type",
    typeKind: { case: "messageType", value: typeName },
  };
}

/**
 * OverloadDecl creates a function overload declaration which contains a unique
 * overload id as well as the expected argument and result types. Overloads
 * must be aggregated within a Function declaration.
 *
 * This mirrors cel-go's `NewOverload`, but omits the `new` prefix per local
 * porting rules.
 */
export function overloadDecl(
  id: string,
  argTypes: Type[],
  resultType: Type,
): Decl_FunctionDecl_Overload {
  return {
    $typeName: "cel.expr.Decl.FunctionDecl.Overload",
    overloadId: id,
    resultType,
    params: argTypes,
    typeParams: [],
    isInstanceFunction: false,
    doc: "",
  };
}

/**
 * ParameterizedInstanceOverload creates a parametric function instance overload type.
 *
 * This mirrors cel-go's `NewParameterizedInstanceOverload`, but omits the
 * `new` prefix per local porting rules.
 */
export function parameterizedInstanceOverload(
  id: string,
  argTypes: Type[],
  resultType: Type,
  typeParams: string[],
): Decl_FunctionDecl_Overload {
  return {
    $typeName: "cel.expr.Decl.FunctionDecl.Overload",
    overloadId: id,
    resultType,
    params: argTypes,
    typeParams,
    isInstanceFunction: true,
    doc: "",
  };
}

/**
 * ParameterizedOverload creates a parametric function overload type.
 *
 * This mirrors cel-go's `NewParameterizedOverload`, but omits the `new`
 * prefix per local porting rules.
 */
export function parameterizedOverload(
  id: string,
  argTypes: Type[],
  resultType: Type,
  typeParams: string[],
): Decl_FunctionDecl_Overload {
  return {
    $typeName: "cel.expr.Decl.FunctionDecl.Overload",
    overloadId: id,
    resultType,
    params: argTypes,
    typeParams,
    isInstanceFunction: false,
    doc: "",
  };
}

/**
 * PrimitiveType creates a type for a primitive value. See the var declarations
 * for Int, Uint, etc.
 *
 * This mirrors cel-go's `NewPrimitiveType`, but omits the `new` prefix per
 * local porting rules.
 */
export function primitiveType(primitive: Type_PrimitiveType): Type {
  return {
    $typeName: "cel.expr.Type",
    typeKind: { case: "primitive", value: primitive },
  };
}

/**
 * TypeType creates a new type designating a type.
 *
 * This mirrors cel-go's `NewTypeType`, but omits the `new` prefix per local
 * porting rules.
 */
export function typeType(nested?: Type): Type {
  if (nested === undefined) {
    // must set the nested field for a valid oneof option
    nested = {
      $typeName: "cel.expr.Type",
      typeKind: { case: undefined, value: undefined },
    } as Type;
  }
  return {
    $typeName: "cel.expr.Type",
    typeKind: {
      case: "type",
      value: nested,
    },
  };
}

/**
 * TypeParamType creates a type corresponding to a named, contextual parameter.
 *
 * This mirrors cel-go's `NewTypeParamType`, but omits the `new` prefix per
 * local porting rules.
 */
export function typeParamType(name: string): Type {
  return {
    $typeName: "cel.expr.Type",
    typeKind: { case: "typeParam", value: name },
  };
}

/**
 * WellKnownType creates a type corresponding to a protobuf well-known type
 * value.
 *
 * This mirrors cel-go's `NewWellKnownType`, but omits the `new` prefix per
 * local porting rules.
 */
export function wellKnownType(wellKnown: Type_WellKnownType): Type {
  return {
    $typeName: "cel.expr.Type",
    typeKind: { case: "wellKnown", value: wellKnown },
  };
}

/**
 * WrapperType creates a wrapped primitive type instance. Wrapped types
 * are roughly equivalent to a nullable, or optionally valued type.
 *
 * This mirrors cel-go's `NewWrapperType`, but omits the `new` prefix per
 * local porting rules.
 */
export function wrapperType(wrapped: Type): Type {
  const primitive =
    wrapped.typeKind.case === "primitive"
      ? wrapped.typeKind.value
      : Type_PrimitiveType.PRIMITIVE_TYPE_UNSPECIFIED;
  if (primitive === Type_PrimitiveType.PRIMITIVE_TYPE_UNSPECIFIED) {
    throw new globalThis.Error("Wrapped type must be a primitive");
  }
  return {
    $typeName: "cel.expr.Type",
    typeKind: { case: "wrapper", value: primitive },
  };
}

function ident(name: string, t: Type, v: Constant | undefined, desc: string): Decl {
  return {
    $typeName: "cel.expr.Decl",
    name,
    declKind: {
      case: "ident",
      value: {
        $typeName: "cel.expr.Decl.IdentDecl",
        type: t,
        value: v,
        doc: desc,
      },
    },
  };
}
