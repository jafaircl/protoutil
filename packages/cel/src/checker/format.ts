import type { Type } from "../common/types/types.js";
import type { Type as CheckedType } from "../gen/cel/expr/checked_pb.js";
import { Type_PrimitiveType, Type_WellKnownType } from "../gen/cel/expr/checked_pb.js";

const KIND_UNKNOWN = 1;
const KIND_ERROR = 2;
const KIND_FUNCTION = 3;
const KIND_DYN = 4;
const KIND_PRIMITIVE = 5;
const KIND_WELL_KNOWN = 6;
const KIND_WRAPPER = 7;
const KIND_NULL = 8;
const KIND_ABSTRACT = 9;
const KIND_TYPE = 10;
const KIND_LIST = 11;
const KIND_MAP = 12;
const KIND_OBJECT = 13;
const KIND_TYPE_PARAM = 14;

/**
 * formatCheckedType converts a checked protobuf type into the cel-go string form.
 */
export function formatCheckedType(type: CheckedType | undefined): string {
  switch (kindOf(type)) {
    case KIND_DYN:
      return "dyn";
    case KIND_FUNCTION: {
      const functionType = type?.typeKind.case === "function" ? type.typeKind.value : undefined;
      return formatFunctionExprType(functionType?.resultType, functionType?.argTypes ?? [], false);
    }
    case KIND_LIST: {
      const listType = type?.typeKind.case === "listType" ? type.typeKind.value : undefined;
      return `list(${formatCheckedType(listType?.elemType)})`;
    }
    case KIND_OBJECT:
      return type?.typeKind.case === "messageType" ? type.typeKind.value : "";
    case KIND_MAP: {
      const mapType = type?.typeKind.case === "mapType" ? type.typeKind.value : undefined;
      return `map(${formatCheckedType(mapType?.keyType)}, ${formatCheckedType(mapType?.valueType)})`;
    }
    case KIND_NULL:
      return "null";
    case KIND_PRIMITIVE: {
      const primitive = type?.typeKind.case === "primitive" ? type.typeKind.value : undefined;
      switch (primitive) {
        case Type_PrimitiveType.UINT64:
          return "uint";
        case Type_PrimitiveType.INT64:
          return "int";
        default:
          return primitive !== undefined ? Type_PrimitiveType[primitive].toLowerCase().trim() : "";
      }
    }
    case KIND_TYPE: {
      const nestedType = type?.typeKind.case === "type" ? type.typeKind.value : undefined;
      if (!nestedType || nestedType.typeKind.case === undefined) {
        return "type";
      }
      return `type(${formatCheckedType(nestedType)})`;
    }
    case KIND_WELL_KNOWN: {
      const wellKnown = type?.typeKind.case === "wellKnown" ? type.typeKind.value : undefined;
      switch (wellKnown) {
        case Type_WellKnownType.ANY:
          return "any";
        case Type_WellKnownType.DURATION:
          return "duration";
        case Type_WellKnownType.TIMESTAMP:
          return "timestamp";
      }
      break;
    }
    case KIND_WRAPPER:
      return `wrapper(${formatPrimitive(type?.typeKind.case === "wrapper" ? type.typeKind.value : undefined)})`;
    case KIND_ERROR:
      return "!error!";
    case KIND_TYPE_PARAM:
      return type?.typeKind.case === "typeParam" ? type.typeKind.value : "";
    case KIND_ABSTRACT: {
      const abstractType = type?.typeKind.case === "abstractType" ? type.typeKind.value : undefined;
      if (!abstractType) {
        return "";
      }
      const params = (abstractType.parameterTypes ?? []).map((param) => formatCheckedType(param));
      return `${abstractType.name}(${params.join(", ")})`;
    }
    default:
      return JSON.stringify(type);
  }
  return JSON.stringify(type);
}

/**
 * formatCELType formats a runtime CEL type using the same representation as checked types.
 */
export function formatCELType(type: Type | undefined): string {
  if (!type) {
    return "";
  }
  switch (type.kind()) {
    case 2:
      return "any";
    case 6:
      return "duration";
    case 7:
      return "!error!";
    case 11:
      return "null";
    case 15:
      return "timestamp";
    case 17:
      return type.typeName();
    case 12:
      if (type.typeName() === "function") {
        return formatFunctionDeclType(type.parameters()[0], type.parameters().slice(1), false);
      }
      break;
    case 0:
      return "";
  }
  if (type.parameters().length === 0) {
    return type.declaredTypeName();
  }
  const paramNames = type.parameters().map((param) => formatCELType(param));
  return `${type.typeName()}(${paramNames.join(", ")})`;
}

function formatPrimitive(value: Type_PrimitiveType | undefined): string {
  if (value === undefined) {
    return "";
  }
  switch (value) {
    case Type_PrimitiveType.UINT64:
      return "uint";
    case Type_PrimitiveType.INT64:
      return "int";
    default:
      return Type_PrimitiveType[value].toLowerCase().trim();
  }
}

type formatter<T> = (value: T | undefined) => string;

/**
 * formatFunctionExprType formats a protobuf function type.
 */
export function formatFunctionExprType(
  resultType: CheckedType | undefined,
  argTypes: CheckedType[],
  isInstance: boolean,
): string {
  return formatFunctionInternal(resultType, argTypes, isInstance, formatCheckedType);
}

/**
 * formatFunctionDeclType formats a runtime function type.
 */
export function formatFunctionDeclType(
  resultType: Type | undefined,
  argTypes: Type[],
  isInstance: boolean,
): string {
  return formatFunctionInternal(resultType, argTypes, isInstance, formatCELType);
}

function formatFunctionInternal<T>(
  resultType: T | undefined,
  argTypes: T[],
  isInstance: boolean,
  format: formatter<T>,
): string {
  let result = "";
  let fnArgs = argTypes;
  if (isInstance) {
    const target = fnArgs[0];
    fnArgs = fnArgs.slice(1);
    result += format(target);
    result += ".";
  }
  result += "(";
  fnArgs.forEach((arg, index) => {
    if (index > 0) {
      result += ", ";
    }
    result += format(arg);
  });
  result += ")";
  const formattedResult = format(resultType);
  if (formattedResult !== "") {
    result += ` -> ${formattedResult}`;
  }
  return result;
}

function kindOf(type: CheckedType | undefined): number {
  if (!type || !type.typeKind || type.typeKind.case === undefined) {
    return KIND_UNKNOWN;
  }
  switch (type.typeKind.case) {
    case "error":
      return KIND_ERROR;
    case "function":
      return KIND_FUNCTION;
    case "dyn":
      return KIND_DYN;
    case "primitive":
      return KIND_PRIMITIVE;
    case "wellKnown":
      return KIND_WELL_KNOWN;
    case "wrapper":
      return KIND_WRAPPER;
    case "null":
      return KIND_NULL;
    case "type":
      return KIND_TYPE;
    case "listType":
      return KIND_LIST;
    case "mapType":
      return KIND_MAP;
    case "messageType":
      return KIND_OBJECT;
    case "typeParam":
      return KIND_TYPE_PARAM;
    case "abstractType":
      return KIND_ABSTRACT;
    default:
      return KIND_UNKNOWN;
  }
}
