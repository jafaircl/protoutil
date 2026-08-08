import {
  type DescEnum,
  type DescField,
  type DescFile,
  type DescMessage,
  type Message,
  type MessageShape,
  ScalarType,
  toJson,
} from "@bufbuild/protobuf";
import {
  AnySchema,
  anyUnpack,
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
import { Bool, False, True } from "./bool.js";
import { Bytes } from "./bytes.js";
import { Double } from "./double.js";
import { Duration, durationOf } from "./duration.js";
import { Err, err, unsupportedRefValConversionErr, wrapErr } from "./err.js";
import { Int } from "./int.js";
import { dynamicList, jsonListValue } from "./list.js";
import { dynamicMap, jsonStructMap, refValMap, stringInterfaceMap } from "./map.js";
import { Float32NativeType, Int32NativeType, Uint32NativeType } from "./native.js";
import { NullValue } from "./null.js";
import { object } from "./object.js";
import { ProtoEnum } from "./pb/enum.js";
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
import type { FieldTester, Indexer } from "./traits/index.js";
import {
  AnyType,
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  ErrorType,
  IntType,
  Kind,
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
  findIdent(identName: string): Val | undefined;
  findStructType(structType: string): Type | undefined;
  findStructFieldNames(structType: string): string[] | undefined;
  findStructFieldType(structType: string, fieldName: string): ProviderFieldType | undefined;
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
 * NativeFieldDescriptor describes a TypeScript object property exposed as a CEL field.
 */
export interface NativeFieldDescriptor {
  /** celName is the field name visible in CEL expressions. */
  readonly celName: string;
  /** property is the corresponding TypeScript object property. */
  readonly property: string;
  /** type is the CEL type used by the checker. */
  readonly type: Type;
}

/**
 * NativeObjectDescriptor describes a TypeScript object type exposed through the CEL registry.
 *
 * TypeScript does not retain Go-style reflection metadata at runtime, so callers provide the
 * equivalent information explicitly. Native values carry `$celTypeName` to select their descriptor.
 */
export interface NativeObjectDescriptor {
  /** fields contains the supported exported fields. */
  readonly fields: readonly NativeFieldDescriptor[];
  /** typeName is the fully qualified CEL object type name. */
  readonly typeName: string;
}

/**
 * Registry provides type information for a set of registered types.
 */
export class Registry implements Adapter, Provider, LegacyTypeRegistry {
  private readonly revTypeMap = new Map<string, Type>();
  private readonly nativeTypes = new Map<string, NativeObjectDescriptor>();
  private readonly objectValueCache = new WeakMap<object, Val>();
  private readonly arrayValueCache = new WeakMap<unknown[], { length: number; value: Val }>();
  private strongEnumsValue = false;

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
    next.strongEnumsValue = this.strongEnumsValue;
    for (const [name, type] of this.revTypeMap) {
      next.revTypeMap.set(name, type);
    }
    for (const [name, descriptor] of this.nativeTypes) {
      next.nativeTypes.set(name, descriptor);
    }
    return next;
  }

  /**
   * extend returns an independent registry containing this registry's registrations plus those of
   * `incoming`. Neither input registry is modified, so an extended registry never observes a later
   * registration made against the registry it grew from.
   *
   * extend adds the incoming registrations through the same registration methods a caller uses, so
   * a duplicate registration is accepted or rejected exactly as it would be on a single registry. A
   * native type is the one exception: registering one twice is always a conflict on a single
   * registry, but two registries which describe it identically are combined rather than rejected.
   *
   * A protobuf file already registered under the same file name keeps the registration it already
   * has, so two different definitions of one file name are combined as the first of the two.
   */
  public extend(incoming: Registry): Registry {
    if (this.strongEnumsValue !== incoming.strongEnumsValue) {
      throw new Error("registries disagree on strong enum values");
    }
    const next = this.copy();
    for (const file of incoming.pbdbValue.fileDescriptions()) {
      next.registerDescriptor(file.fileDescriptor());
    }
    for (const [name, descriptor] of incoming.nativeTypes) {
      const existing = next.nativeTypes.get(name);
      if (existing !== undefined && nativeDescriptorsEqual(existing, descriptor)) {
        continue;
      }
      next.registerNativeTypes(descriptor);
    }
    next.registerType(...incoming.revTypeMap.values());
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
      ? this.strongEnumsValue
        ? new ProtoEnum(enumVal.descriptor().parent, BigInt(enumVal.value()))
        : new Int(BigInt(enumVal.value()))
      : err("unknown enum name '%s'", enumName);
  }

  public findIdent(identName: string): Val | undefined {
    const type = this.revTypeMap.get(stripLeadingDot(identName));
    if (type) {
      return type;
    }
    const [enumVal, found] = this.pbdbValue.describeEnum(identName);
    return found && enumVal
      ? this.strongEnumsValue
        ? new ProtoEnum(enumVal.descriptor().parent, BigInt(enumVal.value()))
        : new Int(BigInt(enumVal.value()))
      : undefined;
  }

  /** enumValueOf creates an enum value from its signed number or declared symbolic name. */
  public enumValueOf(typeName: string, value: bigint | string): Val {
    const enumType = this.findEnumType(typeName);
    if (!enumType) {
      return err("unknown enum type '%s'", typeName);
    }
    if (typeof value === "string") {
      const named = enumType.values.find((candidate) => candidate.name === value);
      return named
        ? this.strongEnumsValue
          ? new ProtoEnum(enumType, BigInt(named.number))
          : new Int(BigInt(named.number))
        : err("invalid enum name '%s' for type '%s'", value, enumType.typeName);
    }
    if (value < -2_147_483_648n || value > 2_147_483_647n) {
      return err("enum value out of range: %s", value);
    }
    return this.strongEnumsValue ? new ProtoEnum(enumType, value) : new Int(value);
  }

  public findType(typeName: string): ExprType | undefined {
    const type = this.findStructType(typeName);
    return type ? typeToExprType(type) : undefined;
  }

  public findStructType(structType: string): Type | undefined {
    const nativeType = this.nativeTypes.get(stripLeadingDot(structType));
    if (nativeType) {
      return typeTypeWithParam(objectType(nativeType.typeName));
    }
    const [td, found] = this.pbdbValue.describeType(structType);
    if (!found || !td) {
      return undefined;
    }
    return typeTypeWithParam(objectType(stripLeadingDot(td.name())));
  }

  public findStructFieldNames(structType: string): string[] | undefined {
    const nativeType = this.nativeTypes.get(stripLeadingDot(structType));
    if (nativeType) {
      return nativeType.fields.map((field) => field.celName);
    }
    const [td, found] = this.pbdbValue.describeType(structType);
    if (!found || !td) {
      return undefined;
    }
    return [...td.fieldMap().keys()];
  }

  public findFieldType(messageType: string, fieldName: string): DeprecatedFieldType | undefined {
    const field = this.findStructFieldType(messageType, fieldName);
    return field
      ? {
          type: { $typeName: "cel.expr.Type", typeKind: { case: undefined } } as never,
          isSet: field.isSet,
          getFrom: field.getFrom,
          isJSONField: field.isJSONField,
        }
      : undefined;
  }

  public findStructFieldType(structType: string, fieldName: string): ProviderFieldType | undefined {
    const nativeType = this.nativeTypes.get(stripLeadingDot(structType));
    if (nativeType) {
      const field = nativeType.fields.find((candidate) => candidate.celName === fieldName);
      if (!field) {
        return undefined;
      }
      return new ProviderFieldType(
        field.type,
        (target) => !isNativeZeroValue(nativeTarget(target)[field.property]),
        (target) => nativeTarget(target)[field.property],
      );
    }
    const [td, found] = this.pbdbValue.describeType(structType);
    if (!found || !td) {
      return undefined;
    }
    const [field, fieldFound] = td.fieldByName(fieldName);
    if (!fieldFound || !field) {
      return undefined;
    }
    const descriptor = field.descriptor();
    const strongEnumType =
      this.strongEnumsValue && descriptor.kind === "field" && descriptor.fieldKind === "enum"
        ? objectType(descriptor.enum.typeName)
        : undefined;
    return new ProviderFieldType(
      strongEnumType ?? fieldDescToCelType(field),
      (target) => field.isSet(target),
      (target) => {
        const value = field.getFrom(target)[0];
        return strongEnumType && typeof value === "bigint"
          ? new ProtoEnum(descriptor.enum as DescEnum, value)
          : value;
      },
      this.pbdbValue.jsonFieldNames() && fieldName === field.jsonName(),
    );
  }

  /** withStrongEnums selects whether protobuf enums retain their declared runtime types. */
  public withStrongEnums(enabled: boolean): void {
    this.strongEnumsValue = enabled;
  }

  /** strongEnumsEnabled reports whether protobuf enums retain their declared runtime types. */
  public strongEnumsEnabled(): boolean {
    return this.strongEnumsValue;
  }

  /** enumTypes returns every registered protobuf enum descriptor. */
  public enumTypes(): DescEnum[] {
    const enums = new Map<string, DescEnum>();
    for (const file of this.pbdbValue.fileDescriptions()) {
      collectEnumTypes(file.fileDescriptor().enums, file.fileDescriptor().messages, enums);
    }
    return [...enums.values()];
  }

  public value(typeName: string, fields: Record<string, Val>): Val {
    return this.newValue(typeName, fields);
  }

  public newValue(structType: string, fields: Record<string, Val>): Val {
    const nativeType = this.nativeTypes.get(stripLeadingDot(structType));
    if (nativeType) {
      const value: Record<string, unknown> = { $celTypeName: nativeType.typeName };
      for (const [name, fieldValue] of Object.entries(fields)) {
        const field = nativeType.fields.find((candidate) => candidate.celName === name);
        if (!field) {
          return err("no such field: %s", name);
        }
        value[field.property] = nativeFieldValue(fieldValue, field.type);
      }
      return new NativeObjectValue(this, nativeType, value);
    }
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

  /**
   * registerNativeTypes registers explicit TypeScript object descriptions with the provider.
   */
  public registerNativeTypes(...descriptors: NativeObjectDescriptor[]): void {
    for (const descriptor of descriptors) {
      const name = stripLeadingDot(descriptor.typeName);
      if (this.nativeTypes.has(name)) {
        throw new Error(`native type registration conflict: ${name}`);
      }
      const fieldNames = new Set<string>();
      for (const field of descriptor.fields) {
        if (fieldNames.has(field.celName)) {
          throw new Error(
            `invalid field name \`${field.celName}\` in type \`${name}\`: field name already exists`,
          );
        }
        fieldNames.add(field.celName);
      }
      this.nativeTypes.set(name, { ...descriptor, typeName: name });
      this.registerType(objectType(name));
    }
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

  /** findEnumType resolves a registered protobuf enum descriptor by fully qualified type name. */
  public findEnumType(typeName: string): DescEnum | undefined {
    const canonicalName = stripLeadingDot(typeName);
    for (const file of this.pbdbValue.fileDescriptions()) {
      const found = findEnumInFile(file.fileDescriptor(), canonicalName);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  public nativeToValue(value: unknown): Val {
    if (value == null || typeof value !== "object") {
      const direct = nativeToValue(this, value);
      if (direct !== undefined) {
        return direct;
      }
    }
    if (Array.isArray(value)) {
      const cached = this.arrayValueCache.get(value);
      if (cached?.length === value.length) {
        return cached.value;
      }
      const adapted = dynamicList(this, value);
      this.arrayValueCache.set(value, { length: value.length, value: adapted });
      return adapted;
    }
    if (isNativeObject(value)) {
      const descriptor = this.nativeTypes.get(value.$celTypeName);
      if (descriptor) {
        const cached = this.objectValueCache.get(value);
        if (cached) {
          return cached;
        }
        const adapted = new NativeObjectValue(this, descriptor, value);
        this.objectValueCache.set(value, adapted);
        return adapted;
      }
    }
    if (isMessage(value) && value.$typeName === AnySchema.typeName) {
      const anyValue = value as MessageShape<typeof AnySchema>;
      const typeName = anyValue.typeUrl.slice(anyValue.typeUrl.lastIndexOf("/") + 1);
      const [description, found] = this.pbdbValue.describeType(typeName);
      if (found && description) {
        const unpacked = anyUnpack(anyValue, description.descriptor());
        if (unpacked) {
          // Unpack before generic protobuf unwrapping so wrapper and JSON message descriptors
          // preserve their signedness, floating-point, and null semantics.
          return this.nativeToValue(unpacked);
        }
      }
    }
    const direct =
      isMessage(value) && value.$typeName === AnySchema.typeName
        ? undefined
        : nativeToValue(this, value);
    if (direct !== undefined) {
      return direct;
    }
    if (isMessage(value)) {
      if (value.$typeName !== AnySchema.typeName) {
        const cached = this.objectValueCache.get(value);
        if (cached) {
          return cached;
        }
      }
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
      const typeVal = this.findIdent(value.$typeName);
      if (!typeVal) {
        return err("unknown type: '%s'", value.$typeName);
      }
      const adapted = object(this, td.descriptor(), typeVal, value);
      this.objectValueCache.set(value, adapted);
      return adapted;
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
    if (isJSONStructField(field)) {
      if (val === NullValue) {
        return unsupportedFieldTypeError(field, val);
      }
      setField(target, field.descriptor() as DescField, jsonStructForField(field, val));
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
      let native: unknown;
      if (field.isEnum() && val instanceof ProtoEnum) {
        const descriptor = field.descriptor();
        if (
          descriptor.kind !== "field" ||
          descriptor.fieldKind !== "enum" ||
          descriptor.enum.typeName !== val.enumDescriptor().typeName
        ) {
          return fieldTypeConversionError(
            field,
            new Error(
              `enum type mismatch: got ${val.enumDescriptor().typeName}, wanted ${
                descriptor.kind === "field" && descriptor.fieldKind === "enum"
                  ? descriptor.enum.typeName
                  : field.name()
              }`,
            ),
          );
        }
        native = val.convertToNative(Number);
      } else {
        native =
          field.isEnum() && val instanceof Int
            ? val.convertToNative(Int32NativeType)
            : val.convertToNative(nativeFieldType(field));
      }
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
 * NativeObjectValue adapts a registered TypeScript object as a CEL object value.
 */
class NativeObjectValue implements Val, FieldTester, Indexer {
  private readonly celType: Type;

  /** constructor binds a native value to its registered CEL descriptor. */
  constructor(
    private readonly adapter: Adapter,
    private readonly descriptor: NativeObjectDescriptor,
    private readonly nativeValue: Record<string, unknown>,
  ) {
    this.celType = objectType(descriptor.typeName);
  }

  /** convertToNative returns the underlying TypeScript object. */
  public convertToNative(typeDesc: unknown): unknown {
    if (typeDesc === Object || typeDesc === this.nativeValue || typeDesc === undefined) {
      return this.nativeValue;
    }
    throw new Error(
      `type conversion error from '${this.descriptor.typeName}' to '${String(typeDesc)}'`,
    );
  }

  /** convertToType converts to the native object type or to CEL's type value. */
  public convertToType(typeValue: RefType): Val {
    if (typeValue === TypeType) {
      return this.celType;
    }
    if (typeValue.typeName() === this.descriptor.typeName) {
      return this;
    }
    return err(
      "type conversion error from '%s' to '%s'",
      this.descriptor.typeName,
      typeValue.typeName(),
    );
  }

  /** equal compares registered native values using CEL's pointer-insensitive value semantics. */
  public equal(other: Val): Val {
    if (!(other instanceof NativeObjectValue)) {
      return False;
    }
    return this.adapter.nativeToValue(
      this.descriptor.typeName === other.descriptor.typeName &&
        nativeValuesEqual(this.nativeValue, other.nativeValue),
    );
  }

  /** get returns a registered field value or a no-such-field error. */
  public get(index: Val): Val {
    if (!(index instanceof CelString)) {
      return err("no such overload");
    }
    const field = this.descriptor.fields.find((candidate) => candidate.celName === index.value());
    if (!field) {
      return err("no such field: %s", index.value());
    }
    return this.adapter.nativeToValue(this.nativeValue[field.property]);
  }

  /** isSet reports whether a registered field contains a non-zero native value. */
  public isSet(fieldName: Val): Val {
    if (!(fieldName instanceof CelString)) {
      return err("no such overload");
    }
    const field = this.descriptor.fields.find(
      (candidate) => candidate.celName === fieldName.value(),
    );
    if (!field) {
      return err("no such field: %s", fieldName.value());
    }
    return this.adapter.nativeToValue(!isNativeZeroValue(this.nativeValue[field.property]));
  }

  /** type returns the registered native CEL object type. */
  public type(): RefType {
    return this.celType;
  }

  /** value returns the underlying TypeScript object. */
  public value(): unknown {
    return this.nativeValue;
  }
}

/**
 * nativeDescriptorsEqual reports whether two descriptions of one native type expose the same CEL
 * fields, reading from the same object properties, with the same CEL types. Field order is not part
 * of the comparison: it does not change how a value of the type behaves.
 */
function nativeDescriptorsEqual(
  base: NativeObjectDescriptor,
  other: NativeObjectDescriptor,
): boolean {
  if (base === other) {
    return true;
  }
  if (base.fields.length !== other.fields.length) {
    return false;
  }
  const otherFields = new Map(other.fields.map((field) => [field.celName, field]));
  return base.fields.every((field) => {
    const candidate = otherFields.get(field.celName);
    return (
      candidate !== undefined &&
      field.property === candidate.property &&
      field.type.isEquivalentType(candidate.type)
    );
  });
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
        // Protobuf-ES represents an embedded google.protobuf.Struct as its native JSON object,
        // while standalone Struct values retain their protobuf message representation.
        if (descriptor.message.typeName === StructSchema.typeName) {
          return {};
        }
        return canonicalMessageDescriptor(descriptor.message);
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
 * canonicalMessageDescriptor returns the canonical WKT descriptor for generated dependency copies.
 */
function canonicalMessageDescriptor(message: DescMessage): DescMessage {
  switch (message.typeName) {
    case AnySchema.typeName:
      return AnySchema;
    case BoolValueSchema.typeName:
      return BoolValueSchema;
    case BytesValueSchema.typeName:
      return BytesValueSchema;
    case DoubleValueSchema.typeName:
      return DoubleValueSchema;
    case DurationSchema.typeName:
      return DurationSchema;
    case FloatValueSchema.typeName:
      return FloatValueSchema;
    case Int32ValueSchema.typeName:
      return Int32ValueSchema;
    case Int64ValueSchema.typeName:
      return Int64ValueSchema;
    case ListValueSchema.typeName:
      return ListValueSchema;
    case StringValueSchema.typeName:
      return StringValueSchema;
    case TimestampSchema.typeName:
      return TimestampSchema;
    case UInt32ValueSchema.typeName:
      return UInt32ValueSchema;
    case UInt64ValueSchema.typeName:
      return UInt64ValueSchema;
    case ValueSchema.typeName:
      return ValueSchema;
    default:
      return message;
  }
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

/** isJSONStructField reports whether Protobuf-ES stores the field as a native JSON object. */
function isJSONStructField(field: FieldDescription): boolean {
  const descriptor = field.descriptor();
  return (
    descriptor.kind === "field" &&
    descriptor.fieldKind === "message" &&
    descriptor.message.typeName === StructSchema.typeName
  );
}

/** jsonValueForField converts a CEL value to its protobuf Value message representation. */
function jsonValueForField(val: Val): unknown {
  return val.convertToNative(ValueSchema);
}

/** jsonStructForField converts a CEL map to the Struct representation expected by its parent. */
function jsonStructForField(field: FieldDescription, val: Val): unknown {
  if (field.descriptor().parent?.typeName === ValueSchema.typeName) {
    return val.convertToNative(StructSchema);
  }
  return toJson(ValueSchema, val.convertToNative(ValueSchema) as MessageShape<typeof ValueSchema>);
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
    case typeof value === "boolean":
      return value ? True : False;
    case typeof value === "bigint":
      return new Int(value);
    case typeof value === "number":
      return Number.isInteger(value) ? new Int(value) : new Double(value);
    case typeof value === "string":
      return new CelString(value);
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
    case isRefVal(value):
      // CEL-Go's default adapter preserves values which already implement ref.Val.
      return value;
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
      return (value as MessageShape<typeof BoolValueSchema>).value ? True : False;
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
      return new Uint((value as MessageShape<typeof UInt32ValueSchema>).value);
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
      return [...value.keys()].every(isRefVal) && [...value.values()].every(isRefVal)
        ? refValMap(adapter, value as Map<Val, Val>)
        : dynamicMap(adapter, value);
    case typeof value === "object":
      if (value && "type" in (value as object) && typeof (value as Val).type === "function") {
        return value as Val;
      }
      if (isRecord(value)) {
        return stringInterfaceMap(adapter, value);
      }
  }
  return undefined;
}

/**
 * nativeTarget unwraps a CEL native object when provider field access receives the wrapper.
 */
function nativeTarget(target: unknown): Record<string, unknown> {
  if (target instanceof NativeObjectValue) {
    return target.value() as Record<string, unknown>;
  }
  return target as Record<string, unknown>;
}

/**
 * nativeFieldValue converts a CEL field value to the corresponding TypeScript representation.
 */
function nativeFieldValue(value: Val, type: Type): unknown {
  if (type.kind() === Kind.List) {
    return value.convertToNative([]);
  }
  if (type.kind() === Kind.Map) {
    return value.convertToNative(new Map());
  }
  // Native fields explicitly described with CEL opaque types store the ref.Val itself. Unwrapping
  // optionals here would erase their has-value semantics before the object is read again.
  if (type.kind() === Kind.Opaque && isRefVal(value)) {
    return value;
  }
  return value.value();
}

/**
 * isNativeObject reports whether a value identifies a registered native CEL type.
 */
function isNativeObject(value: unknown): value is Record<string, unknown> & {
  $celTypeName: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "$celTypeName" in value &&
    typeof (value as { $celTypeName?: unknown }).$celTypeName === "string"
  );
}

/**
 * isNativeZeroValue applies Go-like zero-value presence semantics to TypeScript values.
 */
function isNativeZeroValue(value: unknown): boolean {
  if (value === undefined || value === null || value === false || value === 0 || value === 0n) {
    return true;
  }
  if (value === "") {
    return true;
  }
  if (value instanceof Uint8Array || Array.isArray(value)) {
    return value.length === 0;
  }
  if (value instanceof Map) {
    return value.size === 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).filter((key) => key !== "$celTypeName").length === 0;
  }
  return false;
}

/**
 * nativeValuesEqual compares native values structurally while ignoring descriptor marker fields.
 */
function nativeValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => nativeValuesEqual(value, right[index]))
    );
  }
  if (left instanceof Map && right instanceof Map) {
    if (left.size !== right.size) {
      return false;
    }
    for (const [key, value] of left) {
      if (!right.has(key) || !nativeValuesEqual(value, right.get(key))) {
        return false;
      }
    }
    return true;
  }
  if (typeof left === "object" && left !== null && typeof right === "object" && right !== null) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = Object.keys(leftRecord).filter((key) => key !== "$celTypeName");
    const rightKeys = Object.keys(rightRecord).filter((key) => key !== "$celTypeName");
    return (
      keys.length === rightKeys.length &&
      keys.every(
        (key) =>
          Object.hasOwn(rightRecord, key) && nativeValuesEqual(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return false;
}

function stripLeadingDot(name: string): string {
  return name.startsWith(".") ? name.slice(1) : name;
}

function canonicalTypeName(name: string): string {
  return stripLeadingDot(name).replace(/^google\.api\.expr\.v1alpha1\./, "cel.expr.");
}

/** findEnumInFile resolves an enum descriptor declared anywhere within a protobuf file. */
function findEnumInFile(file: DescFile, typeName: string): DescEnum | undefined {
  const topLevel = file.enums.find((candidate) => candidate.typeName === typeName);
  return topLevel ?? findEnumInMessages(file.messages, typeName);
}

/** findEnumInMessages recursively resolves an enum descriptor nested within protobuf messages. */
function findEnumInMessages(
  messages: readonly DescMessage[],
  typeName: string,
): DescEnum | undefined {
  for (const message of messages) {
    const nested = message.nestedEnums.find((candidate) => candidate.typeName === typeName);
    if (nested) {
      return nested;
    }
    const descendant = findEnumInMessages(message.nestedMessages, typeName);
    if (descendant) {
      return descendant;
    }
  }
  return undefined;
}

/**
 * collectEnumTypes recursively indexes top-level and message-scoped protobuf enum descriptors.
 */
function collectEnumTypes(
  topLevel: readonly DescEnum[],
  messages: readonly DescMessage[],
  enums: Map<string, DescEnum>,
): void {
  for (const enumType of topLevel) {
    enums.set(enumType.typeName, enumType);
  }
  for (const message of messages) {
    for (const enumType of message.nestedEnums) {
      enums.set(enumType.typeName, enumType);
    }
    collectEnumTypes([], message.nestedMessages, enums);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isMessage(value);
}

function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null && "$typeName" in value;
}

/** wrapWrapperField converts a CEL scalar to Protobuf-ES's wrapper-field representation. */
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
      if (!(val instanceof Double)) {
        return [undefined, true, new Error("type conversion error")];
      }
      try {
        return [val.convertToNative(Float32NativeType), true, undefined];
      } catch (cause) {
        return [undefined, true, cause as Error];
      }
    case Int32ValueSchema.typeName:
      if (!(val instanceof Int)) {
        return [undefined, true, new Error("type conversion error")];
      }
      try {
        return [val.convertToNative(Int32NativeType), true, undefined];
      } catch (cause) {
        return [undefined, true, cause as Error];
      }
    case Int64ValueSchema.typeName:
      return val instanceof Int
        ? [val.value(), true, undefined]
        : [undefined, true, new Error("type conversion error")];
    case StringValueSchema.typeName:
      return val instanceof CelString
        ? [val.value(), true, undefined]
        : [undefined, true, new Error("type conversion error")];
    case UInt32ValueSchema.typeName:
      if (!(val instanceof Uint)) {
        return [undefined, true, new Error("type conversion error")];
      }
      try {
        return [val.convertToNative(Uint32NativeType), true, undefined];
      } catch (cause) {
        return [undefined, true, cause as Error];
      }
    case UInt64ValueSchema.typeName:
      return val instanceof Uint
        ? [val.value(), true, undefined]
        : [undefined, true, new Error("type conversion error")];
    default:
      return [undefined, false, undefined];
  }
}

/** isRefVal reports whether a value already implements the CEL reference value contract. */
function isRefVal(value: unknown): value is Val {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<Val>;
  return (
    typeof candidate.convertToNative === "function" &&
    typeof candidate.convertToType === "function" &&
    typeof candidate.equal === "function" &&
    typeof candidate.type === "function" &&
    typeof candidate.value === "function"
  );
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
