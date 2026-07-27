import {
  type DescField,
  type DescFile,
  type DescMessage,
  type Message,
  type MessageShape,
  ScalarType,
} from "@bufbuild/protobuf";
import {
  AnySchema,
  BoolValueSchema,
  BytesValueSchema,
  DoubleValueSchema,
  DurationSchema,
  FloatValueSchema,
  Int32ValueSchema,
  Int64ValueSchema,
  ListValueSchema,
  StringValueSchema,
  StructSchema,
  TimestampSchema,
  UInt32ValueSchema,
  UInt64ValueSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import { setField } from "@protoutil/core";
import {
  type Type as CheckedType,
  type Type as ExprType,
  Type_PrimitiveType,
  Type_WellKnownType,
} from "../../gen/cel/expr/checked_pb.js";
import { Bool } from "./bool.js";
import { Bytes } from "./bytes.js";
import { Double } from "./double.js";
import { Duration, durationOf } from "./duration.js";
import { Err, err, unsupportedRefValConversionErr, wrapErr } from "./err.js";
import { Int } from "./int.js";
import { dynamicList, jsonListValue } from "./list.js";
import { jsonStructMap, refValMap, stringInterfaceMap, stringStringMap } from "./map.js";
import { Float32NativeType, Int32NativeType, Uint32NativeType } from "./native.js";
import { NullValue } from "./null.js";
import { object } from "./object.js";
import { type Db, DefaultDb, db as pbdb } from "./pb/pb.js";
import type { FieldDescription } from "./pb/type.js";
import type {
  FieldType as DeprecatedFieldType,
  TypeAdapter as LegacyTypeAdapter,
  TypeRegistry as LegacyTypeRegistry,
} from "./ref/provider.js";
import type { Type as RefType, Val } from "./ref/reference.js";
import { String as CelString } from "./string.js";
import { Timestamp, timestampOf } from "./timestamp.js";
import {
  AnyType,
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  ErrorType,
  IntType,
  ListType,
  listType,
  MapType,
  mapType,
  maybeForeignType,
  NullType,
  nullableType,
  objectType,
  opaqueType,
  StringType,
  TimestampType,
  type Type,
  TypeType,
  typeParamType,
  typeToExprType,
  typeTypeWithParam,
  UintType,
} from "./types.js";
import { Uint } from "./uint.js";

/**
 * Provider specifies functions for creating new object instances and for resolving enum values by name.
 */
export interface Provider {
  enumValue(enumName: string): Val;
  findIdent(identName: string): [Val | undefined, boolean];
  findStructType(structType: string): [Type | undefined, boolean];
  findStructFieldNames(structType: string): [string[], boolean];
  findStructFieldType(
    structType: string,
    fieldName: string,
  ): [ProviderFieldType | undefined, boolean];
  newValue(structType: string, fields: Record<string, Val>): Val;
}

/**
 * Adapter converts native values to equivalent CEL values.
 */
export type Adapter = LegacyTypeAdapter;

/**
 * ProviderFieldType represents a field's CEL type and access helpers.
 */
export class ProviderFieldType {
  constructor(
    public readonly type: Type,
    public readonly isSet: (target: unknown) => boolean,
    public readonly getFrom: (target: unknown) => unknown,
    public readonly isJSONField = false,
  ) {}
}

/**
 * Registry provides type information for a set of registered types.
 */
export class Registry implements Adapter, Provider, LegacyTypeRegistry {
  private readonly revTypeMap = new Map<string, Type>();

  constructor(private pbdbValue: Db = pbdb()) {
    this.registerType(
      BoolType,
      BytesType,
      DoubleType,
      DurationType,
      IntType,
      ListType,
      MapType,
      NullType,
      StringType,
      TimestampType,
      TypeType,
      UintType,
    );
    for (const fileDesc of this.pbdbValue.fileDescriptions()) {
      this.registerAllTypes(fileDesc.getTypeNames());
    }
  }

  public copy(): Registry {
    const next = new Registry(this.pbdbValue.copy());
    for (const [name, type] of this.revTypeMap) {
      next.revTypeMap.set(name, type);
    }
    return next;
  }

  public jsonFieldNames(): boolean {
    return this.pbdbValue.jsonFieldNames();
  }

  public withJSONFieldNames(enabled: boolean): void {
    const next = pbdb();
    next.setJSONFieldNames(enabled);
    for (const fileDesc of this.pbdbValue.fileDescriptions()) {
      next.registerDescriptor(fileDesc.fileDescriptor());
    }
    this.pbdbValue = next;
  }

  public enumValue(enumName: string): Val {
    const [enumVal, found] = this.pbdbValue.describeEnum(enumName);
    return found && enumVal
      ? new Int(BigInt(enumVal.value()))
      : err("unknown enum name '%s'", enumName);
  }

  public findIdent(identName: string): [Val | undefined, boolean] {
    const type = this.revTypeMap.get(stripLeadingDot(identName));
    if (type) {
      return [type, true];
    }
    const [enumVal, found] = this.pbdbValue.describeEnum(identName);
    return found && enumVal ? [new Int(BigInt(enumVal.value())), true] : [undefined, false];
  }

  public findType(typeName: string): [ExprType | undefined, boolean] {
    const [type, found] = this.findStructType(typeName);
    return found && type ? [typeToExprType(type), true] : [undefined, false];
  }

  public findStructType(structType: string): [Type | undefined, boolean] {
    const [td, found] = this.pbdbValue.describeType(structType);
    if (!found || !td) {
      return [undefined, false];
    }
    return [typeTypeWithParam(objectType(stripLeadingDot(td.name()))), true];
  }

  public findStructFieldNames(structType: string): [string[], boolean] {
    const [td, found] = this.pbdbValue.describeType(structType);
    if (!found || !td) {
      return [[], false];
    }
    return [[...td.fieldMap().keys()], true];
  }

  public findFieldType(
    messageType: string,
    fieldName: string,
  ): [DeprecatedFieldType | undefined, boolean] {
    const [field, found] = this.findStructFieldType(messageType, fieldName);
    return found && field
      ? [
          {
            type: { $typeName: "cel.expr.Type", typeKind: { case: undefined } } as never,
            isSet: field.isSet,
            getFrom: field.getFrom,
            isJSONField: field.isJSONField,
          },
          true,
        ]
      : [undefined, false];
  }

  public findStructFieldType(
    structType: string,
    fieldName: string,
  ): [ProviderFieldType | undefined, boolean] {
    const [td, found] = this.pbdbValue.describeType(structType);
    if (!found || !td) {
      return [undefined, false];
    }
    const [field, fieldFound] = td.fieldByName(fieldName);
    if (!fieldFound || !field) {
      return [undefined, false];
    }
    return [
      new ProviderFieldType(
        fieldDescToCelType(field),
        (target) => field.isSet(target),
        (target) => field.getFrom(target)[0],
        this.pbdbValue.jsonFieldNames() && fieldName === field.jsonName(),
      ),
      true,
    ];
  }

  public value(typeName: string, fields: Record<string, Val>): Val {
    return this.newValue(typeName, fields);
  }

  public newValue(structType: string, fields: Record<string, Val>): Val {
    const [td, found] = this.pbdbValue.describeType(canonicalTypeName(structType));
    if (!found || !td) {
      return err("unknown type '%s'", structType);
    }
    const msg = td.message() as MessageShape<DescMessage>;
    for (const [name, value] of Object.entries(fields)) {
      const [field, fieldFound] = td.fieldByName(name);
      if (!fieldFound || !field) {
        return err("no such field: %s", name);
      }
      const setErr = this.msgSetField(msg, field, value);
      if (setErr) {
        return wrapErr(setErr);
      }
    }
    return this.nativeToValue(msg);
  }

  public registerDescriptor(fileDesc: DescFile): void {
    const fd = this.pbdbValue.registerDescriptor(fileDesc);
    this.registerAllTypes(fd.getTypeNames());
  }

  public registerMessage(message: Message, schema?: DescMessage): void {
    const fd = this.pbdbValue.registerMessage(message, schema);
    this.registerAllTypes(fd.getTypeNames());
  }

  public registerType(...types: RefType[]): void {
    for (const refType of types) {
      const celType = maybeForeignType(refType);
      const existing = this.revTypeMap.get(refType.typeName());
      if (!existing) {
        this.revTypeMap.set(refType.typeName(), celType);
        continue;
      }
      if (!existing.isEquivalentType(celType)) {
        throw new Error(`type registration conflict. found: ${existing}, input: ${celType}`);
      }
      if (existing.traitMask() !== celType.traitMask()) {
        throw new Error(
          `type registered with conflicting traits: ${existing.typeName()} with traits ${existing.traitMask()}, input: ${celType.traitMask()}`,
        );
      }
    }
  }

  public nativeToValue(value: unknown): Val {
    const direct =
      isMessage(value) && value.$typeName === AnySchema.typeName
        ? undefined
        : nativeToValue(this, value);
    if (direct !== undefined) {
      return direct;
    }
    if (isMessage(value)) {
      const [td, found] = this.pbdbValue.describeType(value.$typeName);
      if (!found || !td) {
        return err("unknown type: '%s'", value.$typeName);
      }
      const [unwrapped, didUnwrap, unwrapErr] = td.maybeUnwrap(value);
      if (unwrapErr) {
        return unsupportedRefValConversionErr(value);
      }
      if (didUnwrap) {
        return this.nativeToValue(unwrapped);
      }
      const [typeVal, typeFound] = this.findIdent(value.$typeName);
      if (!typeFound || !typeVal) {
        return err("unknown type: '%s'", value.$typeName);
      }
      return object(this, td.descriptor(), typeVal, value);
    }
    return unsupportedRefValConversionErr(value);
  }

  private registerAllTypes(typeNames: string[]): void {
    for (const typeName of typeNames) {
      const celType = objectType(typeName);
      if (celType.typeName() !== stripLeadingDot(typeName)) {
        continue;
      }
      this.registerType(celType);
    }
  }

  private msgSetField(
    target: MessageShape<DescMessage>,
    field: FieldDescription,
    val: Val,
  ): Error | undefined {
    if (field.isList() && !field.isMap()) {
      return msgSetListField(target, field, val);
    }
    if (field.isMap()) {
      return msgSetMapField(target, field, val);
    }
    if (isJSONValueField(field)) {
      setField(target, field.descriptor() as DescField, jsonValueForField(val));
      return undefined;
    }
    const [wrapped, isWrapper, wrapErr] = wrapWrapperField(field, val);
    if (wrapErr) {
      return fieldTypeConversionError(field, wrapErr);
    }
    if (isWrapper) {
      if (wrapped !== undefined) {
        setField(target, field.descriptor() as DescField, wrapped);
      }
      return undefined;
    }
    try {
      const native =
        field.isEnum() && val instanceof Int
          ? Number(val.value())
          : val.convertToNative(nativeFieldType(field));
      if (native !== undefined && native !== null) {
        setField(target, field.descriptor() as DescField, native);
      }
      return undefined;
    } catch (cause) {
      return fieldTypeConversionError(field, cause as Error);
    }
  }
}

/**
 * defaultTypeAdapter converts native values to CEL values.
 */
class DefaultTypeAdapterImpl implements Adapter {
  public nativeToValue(value: unknown): Val {
    return nativeToValue(this, value) ?? unsupportedRefValConversionErr(value);
  }
}

/**
 * DefaultTypeAdapter adapts canonical CEL types from their equivalent TypeScript values.
 */
export const DefaultTypeAdapter: Adapter = new DefaultTypeAdapterImpl();

/**
 * registry creates a registry with the default protobuf database.
 */
export function registry(...messages: Array<[Message, DescMessage?]>): Registry {
  const registry = new Registry();
  for (const [message, schema] of messages) {
    registry.registerMessage(message, schema);
  }
  return registry;
}

/**
 * emptyRegistry creates an unconfigured registry.
 */
export function emptyRegistry(): Registry {
  return new Registry(DefaultDb.copy());
}

function nativeFieldType(field: FieldDescription): unknown {
  const descriptor = field.descriptor();
  if (descriptor.kind === "field") {
    switch (descriptor.fieldKind) {
      case "message":
        return descriptor.message;
      case "scalar":
        return scalarNativeFieldType(descriptor.scalar);
      default:
        break;
    }
  }
  const reflectType = field.reflectType();
  if (typeof reflectType === "boolean") {
    return Boolean;
  }
  if (typeof reflectType === "string") {
    return String;
  }
  if (typeof reflectType === "number") {
    return Number;
  }
  if (typeof reflectType === "bigint") {
    return BigInt;
  }
  if (reflectType instanceof Uint8Array) {
    return Uint8Array;
  }
  return reflectType;
}

/**
 * scalarNativeFieldType returns the CEL native conversion token for a protobuf scalar field.
 */
function scalarNativeFieldType(scalar: ScalarType): unknown {
  switch (scalar) {
    case ScalarType.BOOL:
      return Boolean;
    case ScalarType.STRING:
      return String;
    case ScalarType.BYTES:
      return Uint8Array;
    case ScalarType.DOUBLE:
      return Number;
    case ScalarType.FLOAT:
      return Float32NativeType;
    case ScalarType.INT32:
    case ScalarType.SINT32:
    case ScalarType.SFIXED32:
      return Int32NativeType;
    case ScalarType.UINT32:
    case ScalarType.FIXED32:
      return Uint32NativeType;
    case ScalarType.INT64:
    case ScalarType.SINT64:
    case ScalarType.SFIXED64:
      return BigInt;
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
      return BigInt;
  }
}

function isJSONValueField(field: FieldDescription): boolean {
  const descriptor = field.descriptor();
  return (
    descriptor.kind === "field" &&
    descriptor.fieldKind === "message" &&
    descriptor.message === ValueSchema
  );
}

function jsonValueForField(val: Val): unknown {
  if (val === NullValue) {
    return null;
  }
  if (isListerValue(val)) {
    return val.convertToNative([]);
  }
  if (isMapperValue(val)) {
    return val.convertToNative({});
  }
  return val.value();
}

function isListerValue(
  value: Val,
): value is Val & { size(): Val; get(index: Val): Val; iterator(): unknown } {
  return (
    typeof (value as { size?: unknown }).size === "function" &&
    typeof (value as { get?: unknown }).get === "function" &&
    typeof (value as { iterator?: unknown }).iterator === "function"
  );
}

function isMapperValue(value: Val): value is Val & { get(index: Val): Val; iterator(): unknown } {
  return (
    typeof (value as { get?: unknown }).get === "function" &&
    typeof (value as { iterator?: unknown }).iterator === "function"
  );
}

export function fieldDescToCelType(field: FieldDescription): Type {
  return checkedTypeToRuntimeType(field.checkedType());
}

function checkedTypeToRuntimeType(type: CheckedType): Type {
  switch (type.typeKind.case) {
    case "abstractType":
      return opaqueType(
        type.typeKind.value.name,
        ...(type.typeKind.value.parameterTypes ?? []).map((parameter) =>
          checkedTypeToRuntimeType(parameter),
        ),
      );
    case "dyn":
      return DynType;
    case "error":
      return ErrorType;
    case "listType":
      return listType(checkedTypeToRuntimeType(type.typeKind.value.elemType ?? dynCheckedType()));
    case "mapType":
      return mapType(
        checkedTypeToRuntimeType(type.typeKind.value.keyType ?? dynCheckedType()),
        checkedTypeToRuntimeType(type.typeKind.value.valueType ?? dynCheckedType()),
      );
    case "messageType":
      return objectType(type.typeKind.value);
    case "null":
      return NullType;
    case "primitive":
      switch (type.typeKind.value) {
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
          return ErrorType;
      }
    case "type":
      return type.typeKind.value.typeKind.case
        ? typeTypeWithParam(checkedTypeToRuntimeType(type.typeKind.value))
        : TypeType;
    case "typeParam":
      return typeParamType(type.typeKind.value);
    case "wellKnown":
      switch (type.typeKind.value) {
        case Type_WellKnownType.ANY:
          return AnyType;
        case Type_WellKnownType.DURATION:
          return DurationType;
        case Type_WellKnownType.TIMESTAMP:
          return TimestampType;
        default:
          return ErrorType;
      }
    case "wrapper":
      switch (type.typeKind.value) {
        case Type_PrimitiveType.BOOL:
          return nullableType(BoolType);
        case Type_PrimitiveType.BYTES:
          return nullableType(BytesType);
        case Type_PrimitiveType.DOUBLE:
          return nullableType(DoubleType);
        case Type_PrimitiveType.INT64:
          return nullableType(IntType);
        case Type_PrimitiveType.STRING:
          return nullableType(StringType);
        case Type_PrimitiveType.UINT64:
          return nullableType(UintType);
        default:
          return ErrorType;
      }
    default:
      return ErrorType;
  }
}

/**
 * dynCheckedType creates a minimal checked dyn type for descriptor fallbacks.
 */
function dynCheckedType(): CheckedType {
  return {
    $typeName: "cel.expr.Type",
    typeKind: { case: "dyn", value: { $typeName: "google.protobuf.Empty" } },
  };
}

function nativeToValue(adapter: Adapter, value: unknown): Val | undefined {
  switch (true) {
    case value === null:
    case value === undefined:
      return NullValue;
    case value instanceof Bool:
    case value instanceof Bytes:
    case value instanceof Double:
    case value instanceof Duration:
    case value instanceof Err:
    case value instanceof Int:
    case value instanceof CelString:
    case value instanceof Timestamp:
    case value instanceof Uint:
      return value as Val;
    case typeof value === "boolean":
      return new Bool(value);
    case typeof value === "bigint":
      return new Int(value);
    case typeof value === "number":
      return Number.isInteger(value) ? new Int(BigInt(value)) : new Double(value);
    case typeof value === "string":
      return new CelString(value);
    case value instanceof Uint8Array:
      return new Bytes(value);
    case value instanceof Date:
      return timestampOf(
        BigInt(Math.trunc(value.getTime() / 1000)),
        (value.getTime() % 1000) * 1_000_000,
      );
    case Array.isArray(value):
      return dynamicList(adapter, value);
    case isMessage(value) && value.$typeName === DurationSchema.typeName: {
      const duration = value as MessageShape<typeof DurationSchema>;
      return durationOf(duration.seconds * 1_000_000_000n + BigInt(duration.nanos));
    }
    case isMessage(value) && value.$typeName === TimestampSchema.typeName: {
      const ts = value as MessageShape<typeof TimestampSchema>;
      return timestampOf(ts.seconds, ts.nanos);
    }
    case isMessage(value) && value.$typeName === BoolValueSchema.typeName:
      return new Bool((value as MessageShape<typeof BoolValueSchema>).value);
    case isMessage(value) && value.$typeName === BytesValueSchema.typeName:
      return new Bytes((value as MessageShape<typeof BytesValueSchema>).value);
    case isMessage(value) && value.$typeName === DoubleValueSchema.typeName:
    case isMessage(value) && value.$typeName === FloatValueSchema.typeName:
      return new Double((value as MessageShape<typeof DoubleValueSchema>).value);
    case isMessage(value) && value.$typeName === Int32ValueSchema.typeName:
      return new Int(BigInt((value as MessageShape<typeof Int32ValueSchema>).value));
    case isMessage(value) && value.$typeName === Int64ValueSchema.typeName:
      return new Int((value as MessageShape<typeof Int64ValueSchema>).value);
    case isMessage(value) && value.$typeName === UInt32ValueSchema.typeName:
      return new Uint(BigInt((value as MessageShape<typeof UInt32ValueSchema>).value));
    case isMessage(value) && value.$typeName === UInt64ValueSchema.typeName:
      return new Uint((value as MessageShape<typeof UInt64ValueSchema>).value);
    case isMessage(value) && value.$typeName === StringValueSchema.typeName:
      return new CelString((value as MessageShape<typeof StringValueSchema>).value);
    case isMessage(value) && value.$typeName === ListValueSchema.typeName:
      return jsonListValue(adapter, value as MessageShape<typeof ListValueSchema>);
    case isMessage(value) && value.$typeName === StructSchema.typeName:
      return jsonStructMap(adapter, value as MessageShape<typeof StructSchema>);
    case isMessage(value) && value.$typeName === ValueSchema.typeName: {
      const json = value as MessageShape<typeof ValueSchema>;
      switch (json.kind.case) {
        case "nullValue":
          return NullValue;
        case "boolValue":
          return new Bool(json.kind.value);
        case "numberValue":
          return new Double(json.kind.value);
        case "stringValue":
          return new CelString(json.kind.value);
        case "listValue":
          return jsonListValue(adapter, json.kind.value);
        case "structValue":
          return jsonStructMap(adapter, json.kind.value);
        default:
          return NullValue;
      }
    }
    case isMessage(value) && value.$typeName === AnySchema.typeName:
      return unsupportedRefValConversionErr(value);
    case value instanceof Map:
      return refValMap(adapter, value as Map<Val, Val>);
    case typeof value === "object":
      if (value && "type" in (value as object) && typeof (value as Val).type === "function") {
        return value as Val;
      }
      if (isStringMap(value)) {
        return stringStringMap(adapter, value);
      }
      if (isRecord(value)) {
        return stringInterfaceMap(adapter, value);
      }
  }
  return undefined;
}

function stripLeadingDot(name: string): string {
  return name.startsWith(".") ? name.slice(1) : name;
}

function canonicalTypeName(name: string): string {
  return stripLeadingDot(name).replace(/^google\.api\.expr\.v1alpha1\./, "cel.expr.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isMessage(value);
}

function isStringMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null && "$typeName" in value;
}

function wrapWrapperField(
  field: FieldDescription,
  val: Val,
): [unknown, boolean, Error | undefined] {
  const wrapperTypeName =
    field.descriptor().kind === "field" && field.descriptor().fieldKind === "message"
      ? field.descriptor().message?.typeName
      : undefined;
  if (!wrapperTypeName) {
    return [undefined, false, undefined];
  }
  if (val === NullValue) {
    return [undefined, isWrapperType(wrapperTypeName), undefined];
  }
  switch (wrapperTypeName) {
    case BoolValueSchema.typeName:
      return val instanceof Bool
        ? [val.value(), true, undefined]
        : [undefined, true, new Error("type conversion error")];
    case BytesValueSchema.typeName:
      return val instanceof Bytes
        ? [val.value(), true, undefined]
        : [undefined, true, new Error("type conversion error")];
    case DoubleValueSchema.typeName:
      return val instanceof Double
        ? [val.value(), true, undefined]
        : [undefined, true, new Error("type conversion error")];
    case FloatValueSchema.typeName:
      return val instanceof Double
        ? [val.value(), true, undefined]
        : [undefined, true, new Error("type conversion error")];
    case Int32ValueSchema.typeName:
      return val instanceof Int
        ? [Number(val.value()), true, undefined]
        : [undefined, true, new Error("type conversion error")];
    case Int64ValueSchema.typeName:
      return val instanceof Int
        ? [val.value(), true, undefined]
        : [undefined, true, new Error("type conversion error")];
    case StringValueSchema.typeName:
      return val instanceof CelString
        ? [val.value(), true, undefined]
        : [undefined, true, new Error("type conversion error")];
    case UInt32ValueSchema.typeName:
      return val instanceof Uint
        ? [Number(val.value()), true, undefined]
        : [undefined, true, new Error("type conversion error")];
    case UInt64ValueSchema.typeName:
      return val instanceof Uint
        ? [val.value(), true, undefined]
        : [undefined, true, new Error("type conversion error")];
    default:
      return [undefined, false, undefined];
  }
}

/**
 * msgSetListField converts and assigns a CEL list into a protobuf repeated field.
 */
function msgSetListField(
  target: MessageShape<DescMessage>,
  field: FieldDescription,
  val: Val,
): Error | undefined {
  if (!isListerValue(val)) {
    return unsupportedFieldTypeError(field, val);
  }
  const values: unknown[] = [];
  const size = (val.size() as Int).value();
  for (let index = 0n; index < size; index += 1n) {
    const entry = val.get(new Int(index));
    try {
      const native = entry.convertToNative(listElementNativeType(field));
      if (native === undefined || native === null) {
        continue;
      }
      values.push(normalizeContainerElement(field, native));
    } catch (cause) {
      return fieldTypeConversionError(field, cause as Error);
    }
  }
  setField(target, field.descriptor() as DescField, values);
  return undefined;
}

/**
 * msgSetMapField converts and assigns a CEL map into a protobuf map field.
 */
function msgSetMapField(
  target: MessageShape<DescMessage>,
  field: FieldDescription,
  val: Val,
): Error | undefined {
  if (!isMapperValue(val) || val === (NullValue as Val)) {
    return unsupportedFieldTypeError(field, val);
  }
  const mapped: Record<string, unknown> = {};
  const iterator = val.iterator() as { hasNext(): Val; next(): Val };
  while ((iterator.hasNext() as Bool).value()) {
    const key = iterator.next();
    const entry = val.get(key);
    try {
      const nativeKey = convertMapKeyToNative(field.keyType!, key);
      const nativeValue = entry.convertToNative(nativeFieldType(field.valueType!));
      if (nativeValue === undefined || nativeValue === null) {
        continue;
      }
      mapped[String(nativeKey)] = normalizeMapValue(field.valueType!, nativeValue);
    } catch (cause) {
      return fieldTypeConversionError(field, cause as Error);
    }
  }
  setField(target, field.descriptor() as DescField, mapped);
  return undefined;
}

/**
 * listElementNativeType returns the native conversion token for a repeated-field element.
 */
function listElementNativeType(field: FieldDescription): unknown {
  const descriptor = field.descriptor();
  if (descriptor.kind !== "field" || descriptor.fieldKind !== "list") {
    return nativeFieldType(field);
  }
  switch (descriptor.listKind) {
    case "enum":
      return Int32NativeType;
    case "message":
      return descriptor.message;
    case "scalar":
      return scalarNativeFieldType(descriptor.scalar);
  }
}

/**
 * convertMapKeyToNative converts CEL map keys into the declared protobuf key type.
 */
function convertMapKeyToNative(field: FieldDescription, key: Val): unknown {
  const targetType = nativeFieldType(field);
  if (key instanceof CelString) {
    return parseStringMapKey(field, key.value(), targetType);
  }
  return key.convertToNative(targetType);
}

/**
 * parseStringMapKey converts string-backed record keys into protobuf scalar key values.
 */
function parseStringMapKey(field: FieldDescription, key: string, targetType: unknown): unknown {
  const descriptor = field.descriptor();
  if (descriptor.kind === "field" && descriptor.fieldKind === "scalar") {
    switch (descriptor.scalar) {
      case ScalarType.BOOL:
        if (key === "true") {
          return true;
        }
        if (key === "false") {
          return false;
        }
        break;
      case ScalarType.INT32:
      case ScalarType.SINT32:
      case ScalarType.SFIXED32:
      case ScalarType.UINT32:
      case ScalarType.FIXED32:
        return Number(key);
      case ScalarType.INT64:
      case ScalarType.SINT64:
      case ScalarType.SFIXED64:
      case ScalarType.UINT64:
      case ScalarType.FIXED64:
        return BigInt(key);
      case ScalarType.STRING:
        return key;
      default:
        break;
    }
  }
  return new CelString(key).convertToNative(targetType);
}

/**
 * unsupportedFieldTypeError reports an invalid CEL aggregate assignment for a protobuf field.
 */
function unsupportedFieldTypeError(field: FieldDescription, val: Val): Error {
  const parentTypeName = field.descriptor().parent?.typeName ?? "<unknown>";
  return new Error(`unsupported field type for ${parentTypeName}.${field.name()}: ${val.type()}`);
}

/**
 * fieldTypeConversionError annotates an element conversion failure with protobuf field context.
 */
function fieldTypeConversionError(field: FieldDescription, cause: Error): Error {
  const parentTypeName = field.descriptor().parent?.typeName ?? "<unknown>";
  return new Error(
    `field type conversion error for ${parentTypeName}.${field.name()} value type: ${cause.message}`,
  );
}

function isWrapperType(typeName: string): boolean {
  return (
    [
      BoolValueSchema.typeName,
      BytesValueSchema.typeName,
      DoubleValueSchema.typeName,
      FloatValueSchema.typeName,
      Int32ValueSchema.typeName,
      Int64ValueSchema.typeName,
      StringValueSchema.typeName,
      UInt32ValueSchema.typeName,
      UInt64ValueSchema.typeName,
    ] as const
  ).includes(typeName as typeof BoolValueSchema.typeName);
}

function normalizeContainerElement(field: FieldDescription, value: unknown): unknown {
  const descriptor = field.descriptor();
  if (descriptor.kind !== "field" || descriptor.fieldKind !== "list") {
    return value;
  }
  switch (descriptor.listKind) {
    case "enum":
      return normalizeIntLike(value, false);
    case "message":
      return value;
    case "scalar":
      return normalizeScalarValue(descriptor.scalar, value);
  }
}

function normalizeMapValue(field: FieldDescription, value: unknown): unknown {
  const descriptor = field.descriptor();
  if (descriptor.kind !== "field") {
    return value;
  }
  switch (descriptor.fieldKind) {
    case "enum":
      return normalizeIntLike(value);
    case "message":
      return value;
    case "scalar":
      return normalizeScalarValue(descriptor.scalar, value);
    default:
      return value;
  }
}

function normalizeScalarValue(scalar: unknown, value: unknown): unknown {
  switch (scalar) {
    case ScalarType.INT32:
    case ScalarType.SINT32:
    case ScalarType.SFIXED32:
    case "INT32":
    case "SINT32":
    case "SFIXED32":
      return normalizeIntLike(value, false);
    case ScalarType.INT64:
    case ScalarType.SINT64:
    case ScalarType.SFIXED64:
    case "INT64":
    case "SINT64":
    case "SFIXED64":
      return normalizeIntLike(value, true);
    case ScalarType.UINT32:
    case ScalarType.FIXED32:
    case "UINT32":
    case "FIXED32":
      return normalizeUintLike(value, false);
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
    case "UINT64":
    case "FIXED64":
      return normalizeUintLike(value, true);
    case ScalarType.FLOAT:
    case ScalarType.DOUBLE:
    case "FLOAT":
    case "DOUBLE":
      return normalizeFloatLike(value);
    case ScalarType.STRING:
    case "STRING":
      if (typeof value !== "string") {
        throw new Error("type conversion error");
      }
      return value;
    case ScalarType.BOOL:
    case "BOOL":
      if (typeof value !== "boolean") {
        throw new Error("type conversion error");
      }
      return value;
    default:
      return value;
  }
}

function normalizeIntLike(value: unknown, useBigInt = true): bigint | number {
  if (typeof value === "bigint") {
    return useBigInt ? value : Number(value);
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return useBigInt ? BigInt(value) : value;
  }
  throw new Error("type conversion error");
}

function normalizeUintLike(value: unknown, useBigInt = true): bigint | number {
  const normalized = normalizeIntLike(value, useBigInt);
  if (typeof normalized === "bigint" ? normalized < 0n : normalized < 0) {
    throw new Error("type conversion error");
  }
  return normalized;
}

function normalizeFloatLike(value: unknown): number {
  if (typeof value !== "number") {
    throw new Error("type conversion error");
  }
  return value;
}
