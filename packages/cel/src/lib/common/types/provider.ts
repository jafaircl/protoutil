/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  create,
  createMutableRegistry,
  DescEnum,
  DescField,
  DescMessage,
  isMessage,
  Message,
  MutableRegistry,
  Registry as PbRegistry,
  ScalarType,
} from '@bufbuild/protobuf';
import { isReflectList, isReflectMap, isReflectMessage, reflect } from '@bufbuild/protobuf/reflect';
import {
  Any,
  anyUnpack,
  BoolValueSchema,
  BytesValueSchema,
  DoubleValueSchema,
  DurationSchema,
  FloatValueSchema,
  Int32ValueSchema,
  Int64ValueSchema,
  NullValueSchema,
  StringValueSchema,
  StructSchema,
  timestampFromDate,
  TimestampSchema,
  UInt32ValueSchema,
  UInt64ValueSchema,
  ValueSchema,
} from '@bufbuild/protobuf/wkt';
import { dequal } from 'dequal';
import { HashMap } from '../../common/utils.js';
import { Adapter, FieldType, Registry as IRegistry } from '../ref/provider.js';
import { isRefType, isRefVal, RefType, RefVal } from '../ref/reference.js';
import { StandardProtoDescriptors } from '../stdlib.js';
import { isNil, isPlainObject, isString, mapToObject, objectToMap } from '../utils.js';
import { BoolRefVal } from './bool.js';
import { BytesRefVal } from './bytes.js';
import { DoubleRefVal } from './double.js';
import { DurationRefVal } from './duration.js';
import { ErrorRefVal, isErrorRefVal } from './error.js';
import { IntRefVal } from './int.js';
import { DynamicList, RefValList, StringList } from './list.js';
import { DynamicMap, RefValMap } from './map.js';
import {
  reflectNativeType,
  reflectProtoFieldNativeType,
  reflectProtoListElemFieldNativeType,
  reflectProtoMapEntryFieldNativeType,
} from './native.js';
import { NullRefVal } from './null.js';
import { ObjectRefVal } from './object.js';
import { StringRefVal } from './string.js';
import { TimestampRefVal } from './timestamp.js';
import { isLister, Lister } from './traits/lister.js';
import { isMapper, Mapper } from './traits/mapper.js';
import {
  BoolType,
  BytesType,
  checkedWellKnowns,
  DoubleType,
  DurationType,
  DynType,
  getCheckedWellKnown,
  IntType,
  ListType,
  MapType,
  maybeForeignType,
  newListType,
  newMapType,
  newObjectType,
  newTypeTypeWithParam,
  NullType,
  StringType,
  TimestampType,
  Type,
  TypeType,
  UintType,
} from './types.js';
import { UintRefVal } from './uint.js';
import { sanitizeProtoName, typeUrlToName } from './utils.js';

/**
 * ProtoCELPrimitives provides a map from the protoreflect Kind to the
 * equivalent CEL type.
 */
export const protoCELPrimitives = new Map<ScalarType, Type>([
  [ScalarType.BOOL, BoolType],
  [ScalarType.BYTES, BytesType],
  [ScalarType.DOUBLE, DoubleType],
  [ScalarType.FIXED32, UintType],
  [ScalarType.FIXED64, UintType],
  [ScalarType.FLOAT, DoubleType],
  [ScalarType.INT32, IntType],
  [ScalarType.INT64, IntType],
  [ScalarType.SFIXED32, IntType],
  [ScalarType.SFIXED64, IntType],
  [ScalarType.SINT32, IntType],
  [ScalarType.SINT64, IntType],
  [ScalarType.STRING, StringType],
  [ScalarType.UINT32, UintType],
  [ScalarType.UINT64, UintType],
]);

export function fieldDescToCELType(field: DescField): Type | null {
  switch (field.fieldKind) {
    case 'message':
      return newObjectType(field.message.typeName);
    case 'enum':
      return IntType;
    case 'scalar':
      return protoCELPrimitives.get(field.scalar) ?? null;
    case 'list':
      switch (field.listKind) {
        case 'message':
          return newListType(newObjectType(field.message.typeName));
        case 'enum':
          return newListType(IntType);
        default:
          return newListType(protoCELPrimitives.get(field.scalar) ?? DynType);
      }
    case 'map':
      const keyType = protoCELPrimitives.get(field.mapKey) ?? DynType;
      switch (field.mapKind) {
        case 'message':
          return newMapType(keyType, newObjectType(field.message.typeName));
        case 'enum':
          return newMapType(keyType, IntType);
        default:
          return newMapType(keyType, protoCELPrimitives.get(field.scalar) ?? DynType);
      }
    default:
      return null;
  }
}

export class Registry implements IRegistry {
  readonly #refTypeMap = new Map<string, Type>();
  readonly #pbdb: MutableRegistry;

  constructor(typeMap: Map<string, Type> = new Map(), registry?: PbRegistry) {
    this.#pbdb = createMutableRegistry(...StandardProtoDescriptors);
    if (!isNil(registry)) {
      for (const r of registry) {
        this.registerDescriptor(r as DescMessage | DescEnum);
      }
    }
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
      UintType
    );
    // This block ensures that the well-known protobuf types are registered by
    // default.
    for (const descriptor of StandardProtoDescriptors) {
      // skip well-known type names since they're automatically sanitized
      // during NewObjectType() calls.
      if (!isNil(getCheckedWellKnown(descriptor.typeName))) {
        continue;
      }
      this.registerDescriptor(descriptor);
      this.registerType(newObjectType(descriptor.typeName));
    }
    for (const [k, v] of typeMap) {
      this.#refTypeMap.set(k, v);
    }
  }

  copy(): Registry {
    return new Registry(this.#refTypeMap, this.#pbdb);
  }

  register(t: RefType | DescEnum | DescMessage): ErrorRefVal | null {
    if (isRefType(t)) {
      return this.registerType(t);
    } else {
      try {
        this.#pbdb.add(t);
      } catch (e) {
        if (e instanceof Error) {
          return new ErrorRefVal(e.message);
        }
        return new ErrorRefVal(`unknown error while registering type: ${t}`);
      }
    }
    return null;
  }

  /**
   * RegisterDescriptor registers a protocol buffer descriptor and its
   * dependencies.
   */
  registerDescriptor(desc: DescMessage | DescEnum): ErrorRefVal | null {
    // skip well-known type names since they're automatically sanitized during
    // NewObjectType() calls.
    if (checkedWellKnowns.has(desc.typeName)) {
      return null;
    }
    // Check if the descriptor is already registered.
    const existing = this.#pbdb.get(desc.typeName);
    if (!isNil(existing)) {
      return null;
    }
    // Register the descriptor in the protocol buffer registry.
    this.#pbdb.add(desc);

    // Handle nested fields
    if (desc.kind === 'message') {
      for (const field of desc.fields) {
        if (field.fieldKind === 'message' || field.fieldKind === 'enum') {
          const err = this.registerDescriptor(
            field.fieldKind === 'message' ? field.message : field.enum
          );
          if (!isNil(err)) {
            return err;
          }
        }
        if (
          field.fieldKind === 'list' &&
          (field.listKind === 'message' || field.listKind === 'enum')
        ) {
          const err = this.registerDescriptor(
            field.listKind === 'message' ? field.message : field.enum
          );
          if (!isNil(err)) {
            return err;
          }
        }
        if (
          field.fieldKind === 'map' &&
          (field.mapKind === 'message' || field.mapKind === 'enum')
        ) {
          const err = this.registerDescriptor(
            field.mapKind === 'message' ? field.message : field.enum
          );
          if (!isNil(err)) {
            return err;
          }
        }
      }
    }
    return this.registerType(newObjectType(desc.typeName));
  }

  registerType(...types: RefType[]): ErrorRefVal | null {
    for (const t of types) {
      const celType = maybeForeignType(t);
      const existing = this.#refTypeMap.get(celType.typeName());
      if (isNil(existing)) {
        this.#refTypeMap.set(celType.typeName(), celType);
        continue;
      }
      if (!existing.isEquivalentType(celType)) {
        return new ErrorRefVal(
          `type registration conflict. found: ${existing.toString()}, input: ${celType.toString()}`
        );
      }
      if (!dequal(existing.traitMask, celType.traitMask)) {
        return new ErrorRefVal(
          `type registered with conflicting traits: ${existing.typeName()} with traits ${
            existing.traitMask
          }, input: ${celType.traitMask}`
        );
      }
    }
    return null;
  }

  enumValue(enumName: string): RefVal {
    // Sanitize the enumName.
    enumName = sanitizeProtoName(enumName);
    // The enum name will be something like 'FooEnum.Bar' or, if it has a container prefix, something like 'foo.bar.FooEnum.Bar'. So, we need to split it into the message name and the enum name.
    const enumNameParts = enumName.split('.');
    if (enumNameParts.length < 2) {
      return new ErrorRefVal(`invalid enum name '${enumName}'`);
    }
    const enumValue = enumNameParts.pop();
    if (isNil(enumValue)) {
      return new ErrorRefVal(`invalid enum name '${enumName}'`);
    }
    const enumContainerName = enumNameParts.join('.');

    // Get the enum descriptor from the proto registry.
    const enumDescriptor = this.#pbdb.getEnum(enumContainerName);
    if (isNil(enumDescriptor)) {
      return new ErrorRefVal(`unknown enum name '${enumName}'`);
    }

    // Find the value that matches the enum value.
    const enumNumber = enumDescriptor.values.find((v) => v.name === enumValue)?.number;
    if (isNil(enumNumber)) {
      return new ErrorRefVal(`unknown enum value '${enumName}'`);
    }
    return new IntRefVal(BigInt(enumNumber));
  }

  findIdent(ident: string): RefVal | null {
    if (this.#refTypeMap.has(ident)) {
      return this.#refTypeMap.get(ident)!;
    }
    const enumValue = this.enumValue(ident);
    if (!isErrorRefVal(enumValue)) {
      return enumValue;
    }
    return null;
  }

  findStructProtoType(typeName: string): DescMessage | null {
    // Sanitize the type name.
    typeName = sanitizeProtoName(typeName);
    return this.#pbdb.getMessage(typeName) ?? null;
  }

  findStructType(typeName: string): Type | null {
    // Sanitize the type name.
    typeName = sanitizeProtoName(typeName);
    const msgType = this.findStructProtoType(typeName);
    if (isNil(msgType)) {
      return null;
    }
    return newTypeTypeWithParam(newObjectType(msgType.typeName));
  }

  findStructFieldNames(typeName: string): string[] {
    // Sanitize the type name.
    typeName = sanitizeProtoName(typeName);
    const msgType = this.#pbdb.getMessage(typeName);
    if (isNil(msgType)) {
      return [];
    }
    return msgType.fields.map((f) => f.name);
  }

  findStructFieldType(typeName: string, fieldName: string): FieldType | null {
    // Sanitize the type name.
    typeName = sanitizeProtoName(typeName);
    const msgType = this.#pbdb.getMessage(typeName);
    if (isNil(msgType)) {
      return null;
    }
    const field = msgType.fields.find((f) => f.name === fieldName);
    if (isNil(field)) {
      return null;
    }
    const fieldType = fieldDescToCELType(field);
    if (isNil(fieldType)) {
      return null;
    }
    return new FieldType(
      fieldType,
      (v) => reflect(msgType, isRefVal(v) ? v.value() : v, false).isSet(field),
      (v) => {
        // TODO: this is slow but returns the correct value. A simple object index would be much faster but does not always return the correct value. A faster solution is needed.
        const reflectMessage = isReflectMessage(v)
          ? v
          : reflect(msgType, isRefVal(v) ? v.value() : v, false);
        // If the field is not set, we can stop here.
        if (!reflectMessage.isSet(field)) {
          // See https://protobuf.dev/programming-guides/proto3/#default
          switch (field.fieldKind) {
            case 'enum':
              return field.enum.proto.value[0].number;
            case 'list':
              return [];
            case 'map':
              return {};
            case 'scalar':
              return field.proto.defaultValue;
            default:
              return null;
          }
        }
        let value: any = reflectMessage.get(field);
        if (isReflectMessage(value)) {
          value = value.message;
        }
        if (isReflectMap(value)) {
          value = new Map(value.entries());
        }
        if (isReflectList(value)) {
          value = [...value.values()];
        }
        return value;
      }
    );
  }

  newValue(structType: string, fields: Map<string, RefVal>): RefVal {
    const td = this.#pbdb.getMessage(structType);
    if (isNil(td)) {
      return ErrorRefVal.unknownType(structType);
    }
    const msg = create(td);
    for (const [name, value] of fields) {
      const field = td.fields.find((f) => f.name === name);
      if (isNil(field)) {
        return ErrorRefVal.noSuchField(name);
      }
      const err = msgSetField(td, msg, field, value);
      if (isErrorRefVal(err)) {
        return err;
      }
    }
    return this.nativeToValue(msg);
  }

  nativeToValue(value: any): RefVal {
    const val = nativeToValue(this, value);
    if (!isNil(val)) {
      return val;
    }
    if (isMessage(value)) {
      let typeName = value.$typeName;
      // Try to unwrap Any messages.
      if (value.$typeName === 'google.protobuf.Any') {
        const any = value as Any;
        typeName = typeUrlToName(any.typeUrl);
        value = anyUnpack(any, this.#pbdb);
      }
      const desc = this.#pbdb.getMessage(typeName);
      if (isNil(desc)) {
        return ErrorRefVal.unknownType(typeName);
      }
      return new ObjectRefVal(this, value, desc, newObjectType(typeName));
    }
    return ErrorRefVal.unsupportedRefValConversionErr(value);
  }
}

export function nativeToValue(a: Adapter, value: any): RefVal | null {
  if (isNil(value)) {
    return new NullRefVal();
  }
  if (isRefVal(value)) {
    return value;
  }
  // Convert plain objects to maps.
  if (!isRefVal(value) && !isMessage(value) && isPlainObject(value)) {
    value = objectToMap(value);
  }
  switch (reflectNativeType(value)) {
    case Array:
      if (value.every((v: any) => isRefVal(v))) {
        return new RefValList(a, value);
      }
      if (value.every((v: any) => isString(v))) {
        return new StringList(a, value);
      }
      return new DynamicList(a, value);
    case Boolean:
      return new BoolRefVal(value);
    case BigInt:
      // TODO: since js doesn't implement uint, we would never get a uintrefval
      return new IntRefVal(value);
    case Date:
      return new TimestampRefVal(timestampFromDate(value));
    case Function:
      return null;
    case Map:
    case HashMap:
      // if (!isMap(value) && value?.constructor?.name !== HashMap.name) {
      //   throw new Error('value is not a map');
      // }
      if (value.size === 0) {
        return new DynamicMap(a, value);
      }
      const m = new Map();
      for (const [key, v] of value) {
        m.set(a.nativeToValue(key), a.nativeToValue(v));
      }
      return new RefValMap(a, m);
    case Number:
      return new DoubleRefVal(value);
    case Object:
      return null;
    case Set:
      return new DynamicList(a, [...value]);
    case String:
      return new StringRefVal(value);
    case Symbol:
      return new StringRefVal((value as symbol).toString());
    case Uint8Array:
      return new BytesRefVal(value);
    case BoolValueSchema:
      return new BoolRefVal(value.value);
    case BytesValueSchema:
      return new BytesRefVal(value.value);
    case DoubleValueSchema:
      return new DoubleRefVal(value.value);
    case DurationSchema:
      return new DurationRefVal(value);
    case FloatValueSchema:
      return new DoubleRefVal(value.value);
    case Int32ValueSchema:
      return new IntRefVal(BigInt(value.value));
    case Int64ValueSchema:
      return new IntRefVal(value.value);
    case NullValueSchema:
      return new NullRefVal();
    case StringValueSchema:
      return new StringRefVal(value.value);
    case StructSchema:
      // TODO: implement map conversion
      return null;
    case TimestampSchema:
      return new TimestampRefVal(value);
    case UInt32ValueSchema:
      return new UintRefVal(BigInt(value.value));
    case UInt64ValueSchema:
      return new UintRefVal(value.value);
    case ValueSchema:
      // TODO: implement value conversion
      return null;
    default:
      return null;
  }
}

/**
 * defaultTypeAdapter converts go native types to CEL values.
 */
class DefaultTypeAdapter implements Adapter {
  nativeToValue(value: any): RefVal {
    return nativeToValue(this, value) ?? ErrorRefVal.unsupportedRefValConversionErr(value);
  }
}

/**
 * DefaultTypeAdapter adapts canonical CEL types from their equivalent Go
 * values.
 */
export const defaultTypeAdapter = new DefaultTypeAdapter();

function msgSetField(
  desc: DescMessage,
  target: Message,
  field: DescField,
  value: RefVal
): void | ErrorRefVal {
  // No need to set nil values
  if (isNil(value?.value())) {
    return;
  }
  if (field.fieldKind === 'list') {
    if (!isLister(value)) {
      return unsupportedTypeConversionError(field, value);
    }
    return msgSetListField(desc, target, field, value);
  }
  if (field.fieldKind === 'map') {
    if (!isMapper(value)) {
      return unsupportedTypeConversionError(field, value);
    }
    return msgSetMapField(desc, target, field, value);
  }
  const v = value.convertToNative(reflectProtoFieldNativeType(field));
  // If the converted value is an error, then there was an error converting the
  // value.
  if (isErrorRefVal(v)) {
    return fieldTypeConversionError(field, value);
  }
  // Use the proto reflect method to set the field.
  reflect(desc, target, false).set(field, v);
}

function msgSetListField(
  targetDesc: DescMessage,
  target: Message,
  listField: DescField,
  listVal: Lister
): void | ErrorRefVal {
  if (listField.fieldKind !== 'list') {
    return unsupportedTypeConversionError(listField, listVal);
  }
  const elemReflectType = reflectProtoListElemFieldNativeType(listField);
  const toSet: any[] = [];
  for (let i = 0; i < listVal.size().value(); i++) {
    const elemVal = listVal.get(new IntRefVal(BigInt(i)));
    if (isErrorRefVal(elemVal)) {
      return elemVal;
    }
    if (isNil(elemVal.value())) {
      return fieldTypeConversionError(listField, elemVal);
    }
    const v = elemVal.convertToNative(elemReflectType);
    if (isErrorRefVal(v)) {
      return fieldTypeConversionError(listField, elemVal);
    }
    toSet.push(v);
  }
  reflect(targetDesc, target, false).set(listField, toSet);
}

function msgSetMapField(
  desc: DescMessage,
  target: Message,
  listField: DescField,
  mapVal: Mapper
): void | ErrorRefVal {
  if (listField.fieldKind !== 'map') {
    return unsupportedTypeConversionError(listField, mapVal);
  }
  const [targetKeyType, targetValueType] = reflectProtoMapEntryFieldNativeType(listField);
  const toSet = new Map();
  const it = mapVal.iterator();
  while (it.hasNext().value()) {
    const key = it.next();
    if (isNil(key?.value())) {
      return new ErrorRefVal('map key cannot be nil');
    }
    const val = mapVal.get(key);
    if (isNil(val?.value())) {
      return fieldTypeConversionError(listField, key);
    }
    const k = key.convertToNative(targetKeyType);
    if (isErrorRefVal(k)) {
      return fieldTypeConversionError(listField, key);
    }
    const v = val.convertToNative(targetValueType);
    if (isErrorRefVal(v)) {
      return fieldTypeConversionError(listField, key);
    }
    // No need to set nil values
    if (isNil(v)) {
      continue;
    }
    toSet.set(k, v);
  }
  reflect(desc, target, false).set(listField, mapToObject(toSet));
}

function unsupportedTypeConversionError(field: DescField, val: RefVal): ErrorRefVal {
  return new ErrorRefVal(
    `unsupported field type for ${field.message?.typeName}.${field.name}: ${val.type().typeName()}`
  );
}

function fieldTypeConversionError(field: DescField, val: RefVal): ErrorRefVal {
  return new ErrorRefVal(
    `field type conversion error for ${field.message?.typeName}.${field.name} value type ${val
      .type()
      .typeName()}`
  );
}
