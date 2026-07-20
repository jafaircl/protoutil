import { create } from "@bufbuild/protobuf";
import { EmptySchema, NullValue } from "@bufbuild/protobuf/wkt";
import type { Type as ExprType } from "../../gen/cel/expr/checked_pb.js";
import { Type_PrimitiveType, Type_WellKnownType } from "../../gen/cel/expr/checked_pb.js";
import { Bool } from "./bool.js";
import { err, setErrType } from "./err.js";
import { Int } from "./int.js";
import { setIteratorType } from "./iterator.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import {
  AdderType,
  ComparerType,
  ContainerType,
  DividerType,
  FieldTesterType,
  IndexerType,
  IterableType,
  IteratorType,
  type Lister,
  type Mapper,
  MatcherType,
  ModderType,
  MultiplierType,
  NegatorType,
  ReceiverType,
  SizerType,
  SubtractorType,
} from "./traits/index.js";
import { setUtilTypeMetadata } from "./util.js";

/**
 * Kind indicates a CEL type's kind which is used to differentiate quickly between simple and complex types.
 */
export enum Kind {
  Unspecified = 0,
  Dyn = 1,
  Any = 2,
  Bool = 3,
  Bytes = 4,
  Double = 5,
  Duration = 6,
  Error = 7,
  Int = 8,
  List = 9,
  Map = 10,
  NullType = 11,
  Opaque = 12,
  String = 13,
  Struct = 14,
  Timestamp = 15,
  Type = 16,
  TypeParam = 17,
  Uint = 18,
  Unknown = 19,
}

const emptyParams: Type[] = [];
const structTypeTraitMask = FieldTesterType | IndexerType;
const checkedWellKnowns = new Map<string, Type>();

/**
 * Type holds a reference to a runtime type with an optional type-checked set of type parameters.
 */
export class Type implements RefType, Val {
  constructor(
    private readonly kindValue: Kind,
    private readonly parametersValue: Type[] = emptyParams,
    private readonly runtimeTypeName: string,
    private readonly isAssignableTypeFn?: (other: Type) => boolean,
    private readonly isAssignableRuntimeTypeFn?: (other: Val) => boolean,
    private readonly traitMaskValue = 0,
  ) {}
  public convertToNative(): never {
    throw new globalThis.Error("type conversion not supported for 'type'");
  }
  public convertToType(typeValue: RefType): Val {
    if (typeValue === TypeType) {
      return TypeType;
    }
    if (typeValue === StringType) {
      return new CelString(this.typeName());
    }
    return err(`type conversion error from '${TypeType}' to '${typeValue.typeName()}'`);
  }

  /** Equal indicates whether two types have the same runtime type name. */
  public equal(other: Val): Val {
    const isType = "typeName" in (other as object);
    return new Bool(isType && this.typeName() === (other as unknown as RefType).typeName());
  }
  public hasTrait(trait: number): boolean {
    return (trait & this.traitMaskValue) === trait;
  }

  /** IsExactType indicates whether the two types are exactly the same. */
  public isExactType(other: Type): boolean {
    return this.isTypeInternal(other, true);
  }

  /** IsEquivalentType indicates whether two types are equivalent. */
  public isEquivalentType(other: Type): boolean {
    return this.isTypeInternal(other, false);
  }

  /** Kind indicates general category of the type. */
  public kind(): Kind {
    return this.kindValue;
  }

  /** IsAssignableType determines whether the current type is type-check assignable from the input fromType. */
  public isAssignableType(fromType: Type): boolean {
    if (this.isAssignableTypeFn) {
      return this.isAssignableTypeFn(fromType);
    }
    return this.defaultIsAssignableType(fromType);
  }

  /** IsAssignableRuntimeType determines whether the current type is runtime assignable from the input runtimeType. */
  public isAssignableRuntimeType(val: Val): boolean {
    if (this.isAssignableRuntimeTypeFn) {
      return this.isAssignableRuntimeTypeFn(val);
    }
    return this.defaultIsAssignableRuntimeType(val);
  }

  /** Parameters returns the list of type parameters if set. */
  public parameters(): Type[] {
    return this.parametersValue;
  }

  /** DeclaredTypeName indicates the fully qualified and parameterized type-check type name. */
  public declaredTypeName(): string {
    if (this.kind() !== Kind.NullType && !this.isDyn() && this.isAssignableType(NullType)) {
      return `wrapper(${this.typeName()})`;
    }
    return this.typeName();
  }
  public type(): RefType {
    return TypeType;
  }
  public value(): unknown {
    return this.typeName();
  }

  /** TypeName returns the type-erased fully qualified runtime type name. */
  public typeName(): string {
    return this.runtimeTypeName;
  }

  /** WithTraits creates a copy of the current Type and sets the trait mask to the traits parameter. */
  public withTraits(traits: number): Type {
    return new Type(
      this.kindValue,
      this.parametersValue,
      this.runtimeTypeName,
      this.isAssignableTypeFn,
      this.isAssignableRuntimeTypeFn,
      traits,
    );
  }

  /** String returns a human-readable definition of the type name. */
  public toString(): string {
    if (this.kind() === Kind.TypeParam) {
      return `<${this.declaredTypeName()}>`;
    }
    if (this.parameters().length === 0) {
      return this.declaredTypeName();
    }
    return `${this.declaredTypeName()}(${this.parameters()
      .map((parameter) => parameter.toString())
      .join(", ")})`;
  }

  /** traitMask returns the internal trait mask for local helpers. */
  public traitMask(): number {
    return this.traitMaskValue;
  }

  private isTypeInternal(other: Type, checkTypeParamName: boolean): boolean {
    if (this === other) {
      return true;
    }
    if (
      this.kind() !== other.kind() ||
      this.parameters().length !== other.parameters().length ||
      ((checkTypeParamName || this.kind() !== Kind.TypeParam) &&
        this.typeName() !== other.typeName())
    ) {
      return false;
    }
    return this.parameters().every((parameter, index) =>
      parameter.isTypeInternal(other.parameters()[index]!, checkTypeParamName),
    );
  }

  private isDyn(): boolean {
    return this.kind() === Kind.Dyn || this.kind() === Kind.Any || this.kind() === Kind.TypeParam;
  }

  private defaultIsAssignableType(fromType: Type): boolean {
    if (this === fromType || this.isDyn()) {
      return true;
    }
    if (
      this.kind() !== fromType.kind() ||
      this.typeName() !== fromType.typeName() ||
      this.parameters().length !== fromType.parameters().length
    ) {
      return false;
    }
    return this.parameters().every((parameter, index) =>
      parameter.isAssignableType(fromType.parameters()[index]!),
    );
  }

  private defaultIsAssignableRuntimeType(val: Val): boolean {
    const valType = maybeForeignType(val.type());
    if (this.isDyn() || this.typeName() === valType.typeName()) {
      if (this.kind() === Kind.List) {
        return this.isAssignableRuntimeList(val);
      }
      if (this.kind() === Kind.Map) {
        return this.isAssignableRuntimeMap(val);
      }
      return true;
    }
    return false;
  }

  private isAssignableRuntimeList(val: Val): boolean {
    if (this.parameters().length !== 1 || !isListerValue(val)) {
      return false;
    }
    const elemType = this.parameters()[0]!;
    const size = val.size() as Int;
    for (let index = 0n; index < size.value(); index += 1n) {
      if (!elemType.isAssignableRuntimeType(val.get(new Int(index)))) {
        return false;
      }
    }
    return true;
  }

  private isAssignableRuntimeMap(val: Val): boolean {
    if (this.parameters().length !== 2 || !isMapperValue(val)) {
      return false;
    }
    const [keyType, valueType] = this.parameters();
    const iterator = val.iterator();
    while ((iterator.hasNext() as Bool).value()) {
      const key = iterator.next();
      if (!keyType!.isAssignableRuntimeType(key)) {
        return false;
      }
      if (!valueType!.isAssignableRuntimeType(val.get(key))) {
        return false;
      }
    }
    return true;
  }
}

/**
 * ListType creates an instance of a list type value with the provided element type.
 */
export function listType(elemType: Type): Type {
  return new Type(
    Kind.List,
    [elemType],
    "list",
    undefined,
    undefined,
    AdderType | ContainerType | IndexerType | IterableType | SizerType,
  );
}

/**
 * MapType creates an instance of a map type value with the provided key and value types.
 */
export function mapType(keyType: Type, valueType: Type): Type {
  return new Type(
    Kind.Map,
    [keyType, valueType],
    "map",
    undefined,
    undefined,
    ContainerType | IndexerType | IterableType | SizerType,
  );
}

/**
 * NullableType creates an instance of a nullable type with the provided wrapped type.
 */
export function nullableType(wrapped: Type): Type {
  return new Type(
    wrapped.kind(),
    wrapped.parameters(),
    wrapped.typeName(),
    (other) => NullType.isAssignableType(other) || wrapped.isAssignableType(other),
    (other) => NullType.isAssignableRuntimeType(other) || wrapped.isAssignableRuntimeType(other),
    wrapped.traitMask(),
  );
}

/**
 * OptionalType creates an abstract parameterized type instance corresponding to CEL's notion of optional.
 */
export function optionalType(param: Type): Type {
  return opaqueType("optional_type", param);
}

/**
 * OpaqueType creates an abstract parameterized type with a given name.
 */
export function opaqueType(name: string, ...params: Type[]): Type {
  return new Type(Kind.Opaque, params, name);
}

/**
 * ObjectType creates a type reference to an externally defined type.
 */
export function objectType(typeName: string, ...traits: number[]): Type {
  const wellKnown = checkedWellKnowns.get(typeName);
  if (wellKnown) {
    return wellKnown;
  }
  const traitMask = traits.reduce((mask, trait) => mask | trait, 0);
  return new Type(
    Kind.Struct,
    emptyParams,
    typeName,
    undefined,
    undefined,
    structTypeTraitMask | traitMask,
  );
}

/**
 * TypeParamType creates a parameterized type instance.
 */
export function typeParamType(paramName: string): Type {
  return new Type(Kind.TypeParam, emptyParams, paramName);
}

/**
 * TypeTypeWithParam creates a type with a type parameter.
 */
export function typeTypeWithParam(param: Type): Type {
  return new Type(Kind.Type, [param], "type");
}

/**
 * TypeToExprType converts a CEL-native type representation to a protobuf CEL Type representation.
 */
export function typeToExprType(t: Type): ExprType {
  switch (t.kind()) {
    case Kind.Any:
      return {
        $typeName: "cel.expr.Type",
        typeKind: { case: "wellKnown", value: Type_WellKnownType.ANY },
      };
    case Kind.Bool:
      return maybeWrapper(t, primitive(Type_PrimitiveType.BOOL));
    case Kind.Bytes:
      return maybeWrapper(t, primitive(Type_PrimitiveType.BYTES));
    case Kind.Double:
      return maybeWrapper(t, primitive(Type_PrimitiveType.DOUBLE));
    case Kind.Duration:
      return {
        $typeName: "cel.expr.Type",
        typeKind: { case: "wellKnown", value: Type_WellKnownType.DURATION },
      };
    case Kind.Dyn:
      return { $typeName: "cel.expr.Type", typeKind: { case: "dyn", value: create(EmptySchema) } };
    case Kind.Error:
      return {
        $typeName: "cel.expr.Type",
        typeKind: { case: "error", value: create(EmptySchema) },
      };
    case Kind.Int:
      return maybeWrapper(t, primitive(Type_PrimitiveType.INT64));
    case Kind.List:
      if (t.parameters().length !== 1) {
        throw new globalThis.Error(
          `invalid list, got ${t.parameters().length} parameters, wanted one`,
        );
      }
      return {
        $typeName: "cel.expr.Type",
        typeKind: {
          case: "listType",
          value: {
            $typeName: "cel.expr.Type.ListType",
            elemType: typeToExprType(t.parameters()[0]!),
          },
        },
      };
    case Kind.Map:
      if (t.parameters().length !== 2) {
        throw new globalThis.Error(
          `invalid map, got ${t.parameters().length} parameters, wanted two`,
        );
      }
      return {
        $typeName: "cel.expr.Type",
        typeKind: {
          case: "mapType",
          value: {
            $typeName: "cel.expr.Type.MapType",
            keyType: typeToExprType(t.parameters()[0]!),
            valueType: typeToExprType(t.parameters()[1]!),
          },
        },
      };
    case Kind.NullType:
      return {
        $typeName: "cel.expr.Type",
        typeKind: { case: "null", value: NullValue.NULL_VALUE },
      };
    case Kind.Opaque:
      return {
        $typeName: "cel.expr.Type",
        typeKind: {
          case: "abstractType",
          value: {
            $typeName: "cel.expr.Type.AbstractType",
            name: t.typeName(),
            parameterTypes: t.parameters().map((parameter) => typeToExprType(parameter)),
          },
        },
      };
    case Kind.String:
      return maybeWrapper(t, primitive(Type_PrimitiveType.STRING));
    case Kind.Struct:
      return { $typeName: "cel.expr.Type", typeKind: { case: "messageType", value: t.typeName() } };
    case Kind.Timestamp:
      return {
        $typeName: "cel.expr.Type",
        typeKind: { case: "wellKnown", value: Type_WellKnownType.TIMESTAMP },
      };
    case Kind.TypeParam:
      return { $typeName: "cel.expr.Type", typeKind: { case: "typeParam", value: t.typeName() } };
    case Kind.Type:
      return {
        $typeName: "cel.expr.Type",
        typeKind: {
          case: "type",
          value:
            t.parameters().length === 1
              ? typeToExprType(t.parameters()[0]!)
              : { $typeName: "cel.expr.Type", typeKind: { case: undefined } },
        },
      };
    case Kind.Uint:
      return maybeWrapper(t, primitive(Type_PrimitiveType.UINT64));
    default:
      throw new globalThis.Error(`missing type conversion to proto: ${t}`);
  }
}

/**
 * ExprTypeToType converts a protobuf CEL type representation to a CEL-native type representation.
 */
export function exprTypeToType(t: ExprType): Type {
  switch (t.typeKind.case) {
    case "dyn":
      return DynType;
    case "abstractType":
      return opaqueType(
        t.typeKind.value.name,
        ...(t.typeKind.value.parameterTypes ?? []).map((parameter) => exprTypeToType(parameter)),
      );
    case "listType":
      if (!t.typeKind.value.elemType) {
        throw new globalThis.Error(`unsupported type: ${JSON.stringify(t)}`);
      }
      return listType(exprTypeToType(t.typeKind.value.elemType));
    case "mapType":
      if (!t.typeKind.value.keyType || !t.typeKind.value.valueType) {
        throw new globalThis.Error(`unsupported type: ${JSON.stringify(t)}`);
      }
      return mapType(
        exprTypeToType(t.typeKind.value.keyType),
        exprTypeToType(t.typeKind.value.valueType),
      );
    case "messageType":
      return objectType(t.typeKind.value);
    case "null":
      return NullType;
    case "primitive":
      switch (t.typeKind.value) {
        case Type_PrimitiveType.BOOL:
          return BoolType;
        case Type_PrimitiveType.BYTES:
          return BytesType;
        case Type_PrimitiveType.DOUBLE:
          return DoubleType;
        case Type_PrimitiveType.INT64:
          return IntType;
        case Type_PrimitiveType.STRING:
          return StringType;
        case Type_PrimitiveType.UINT64:
          return UintType;
        default:
          throw new globalThis.Error(`unsupported primitive type: ${JSON.stringify(t)}`);
      }
    case "typeParam":
      return typeParamType(t.typeKind.value);
    case "type":
      return t.typeKind.value.typeKind.case
        ? typeTypeWithParam(exprTypeToType(t.typeKind.value))
        : TypeType;
    case "wellKnown":
      switch (t.typeKind.value) {
        case Type_WellKnownType.ANY:
          return AnyType;
        case Type_WellKnownType.DURATION:
          return DurationType;
        case Type_WellKnownType.TIMESTAMP:
          return TimestampType;
        default:
          throw new globalThis.Error(`unsupported well-known type: ${JSON.stringify(t)}`);
      }
    case "wrapper": {
      const wrapped = exprTypeToType({
        $typeName: "cel.expr.Type",
        typeKind: { case: "primitive", value: t.typeKind.value },
      });
      return nullableType(wrapped);
    }
    case "error":
      return ErrorType;
    default:
      throw new globalThis.Error(`unsupported type: ${JSON.stringify(t)}`);
  }
}

/**
 * maybeForeignType converts a foreign ref.Type into a local Type view.
 */
export function maybeForeignType(t: RefType): Type {
  if (t instanceof Type) {
    return t;
  }
  let traitMask = 0;
  for (const trait of allTraits) {
    if (t.hasTrait(trait)) {
      traitMask |= trait;
    }
  }
  return objectType(t.typeName(), traitMask);
}

/**
 * AnyType represents the google.protobuf.Any type.
 */
export const AnyType = new Type(
  Kind.Any,
  emptyParams,
  "google.protobuf.Any",
  undefined,
  undefined,
  FieldTesterType | IndexerType,
);
/**
 * BoolType represents the bool type.
 */
export const BoolType = new Type(
  Kind.Bool,
  emptyParams,
  "bool",
  undefined,
  undefined,
  ComparerType | NegatorType,
);
/**
 * BytesType represents the bytes type.
 */
export const BytesType = new Type(
  Kind.Bytes,
  emptyParams,
  "bytes",
  undefined,
  undefined,
  AdderType | ComparerType | SizerType,
);
/**
 * DoubleType represents the double type.
 */
export const DoubleType = new Type(
  Kind.Double,
  emptyParams,
  "double",
  undefined,
  undefined,
  AdderType | ComparerType | DividerType | MultiplierType | NegatorType | SubtractorType,
);
/**
 * DurationType represents the CEL duration type.
 */
export const DurationType = new Type(
  Kind.Duration,
  emptyParams,
  "google.protobuf.Duration",
  undefined,
  undefined,
  AdderType | ComparerType | NegatorType | ReceiverType | SubtractorType,
);
/**
 * DynType represents a dynamic CEL type whose type will be determined at runtime from context.
 */
export const DynType = new Type(Kind.Dyn, emptyParams, "dyn");
/**
 * ErrorType represents a CEL error value.
 */
export const ErrorType = new Type(Kind.Error, emptyParams, "error");
/**
 * IntType represents the int type.
 */
export const IntType = new Type(
  Kind.Int,
  emptyParams,
  "int",
  undefined,
  undefined,
  AdderType |
    ComparerType |
    DividerType |
    ModderType |
    MultiplierType |
    NegatorType |
    SubtractorType,
);
/**
 * ListType represents the runtime list type.
 */
export const ListType = listType(DynType);
/**
 * MapType represents the runtime map type.
 */
export const MapType = mapType(DynType, DynType);
/**
 * NullType represents the type of a null value.
 */
export const NullType = new Type(Kind.NullType, emptyParams, "null_type");
/**
 * StringType represents the string type.
 */
export const StringType = new Type(
  Kind.String,
  emptyParams,
  "string",
  undefined,
  undefined,
  AdderType | ComparerType | MatcherType | ReceiverType | SizerType,
);
/**
 * TimestampType represents the time type.
 */
export const TimestampType = new Type(
  Kind.Timestamp,
  emptyParams,
  "google.protobuf.Timestamp",
  undefined,
  undefined,
  AdderType | ComparerType | ReceiverType | SubtractorType,
);
/**
 * TypeType represents a CEL type.
 */
export const TypeType = new Type(Kind.Type, emptyParams, "type");
/**
 * UintType represents a uint type.
 */
export const UintType = new Type(
  Kind.Uint,
  emptyParams,
  "uint",
  undefined,
  undefined,
  AdderType | ComparerType | DividerType | ModderType | MultiplierType | SubtractorType,
);
/**
 * UnknownType represents an unknown value type.
 */
export const UnknownType = new Type(Kind.Unknown, emptyParams, "unknown");
/**
 * OptionalType represents the runtime type of an optional value.
 */
export const OptionalType = opaqueType("optional_type", DynType);
/**
 * ErrType represents CEL's error type.
 */
export const ErrType = opaqueType("error");
/**
 * IteratorTypeValue represents CEL's iterator type.
 */
export const IteratorTypeValue = objectType("iterator", IteratorType);

const allTraits = [
  AdderType,
  ComparerType,
  ContainerType,
  DividerType,
  FieldTesterType,
  IndexerType,
  IterableType,
  IteratorType,
  MatcherType,
  ModderType,
  MultiplierType,
  NegatorType,
  ReceiverType,
  SizerType,
  SubtractorType,
];

setErrType(ErrType);
setIteratorType(IteratorTypeValue);
setUtilTypeMetadata(
  [
    BoolType.typeName(),
    BytesType.typeName(),
    DoubleType.typeName(),
    IntType.typeName(),
    StringType.typeName(),
    UintType.typeName(),
  ],
  NullType.typeName(),
);
checkedWellKnowns.set("google.protobuf.BoolValue", nullableType(BoolType));
checkedWellKnowns.set("google.protobuf.BytesValue", nullableType(BytesType));
checkedWellKnowns.set("google.protobuf.DoubleValue", nullableType(DoubleType));
checkedWellKnowns.set("google.protobuf.FloatValue", nullableType(DoubleType));
checkedWellKnowns.set("google.protobuf.Int64Value", nullableType(IntType));
checkedWellKnowns.set("google.protobuf.Int32Value", nullableType(IntType));
checkedWellKnowns.set("google.protobuf.UInt64Value", nullableType(UintType));
checkedWellKnowns.set("google.protobuf.UInt32Value", nullableType(UintType));
checkedWellKnowns.set("google.protobuf.StringValue", nullableType(StringType));
checkedWellKnowns.set("google.protobuf.Any", AnyType);
checkedWellKnowns.set("google.protobuf.Duration", DurationType);
checkedWellKnowns.set("google.protobuf.Timestamp", TimestampType);
checkedWellKnowns.set("google.protobuf.ListValue", listType(DynType));
checkedWellKnowns.set("google.protobuf.NullValue", NullType);
checkedWellKnowns.set("google.protobuf.Struct", mapType(StringType, DynType));
checkedWellKnowns.set("google.protobuf.Value", DynType);

function primitive(value: Type_PrimitiveType): ExprType {
  return { $typeName: "cel.expr.Type", typeKind: { case: "primitive", value } };
}

function maybeWrapper(t: Type, pbType: ExprType): ExprType {
  return t.isAssignableType(NullType)
    ? {
        $typeName: "cel.expr.Type",
        typeKind: { case: "wrapper", value: pbType.typeKind.value as Type_PrimitiveType },
      }
    : pbType;
}

function isListerValue(value: Val): value is Lister {
  return (
    typeof (value as { size?: unknown }).size === "function" &&
    typeof (value as { get?: unknown }).get === "function" &&
    typeof (value as { iterator?: unknown }).iterator === "function"
  );
}

function isMapperValue(value: Val): value is Mapper {
  return (
    typeof (value as { get?: unknown }).get === "function" &&
    typeof (value as { iterator?: unknown }).iterator === "function"
  );
}
