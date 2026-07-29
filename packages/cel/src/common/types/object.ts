import {
  create,
  createRegistry,
  type DescField,
  type DescMessage,
  fromBinary,
  fromJson,
  isFieldSet,
  type JsonValue,
  type Message,
  type MessageShape,
  equals as protobufEquals,
  type Registry,
  ScalarType,
  toBinary,
  toJson,
} from "@bufbuild/protobuf";
import {
  AnySchema,
  anyPack,
  BoolValueSchema,
  BytesValueSchema,
  DoubleValueSchema,
  FloatValueSchema,
  Int32ValueSchema,
  Int64ValueSchema,
  StringValueSchema,
  StructSchema,
  UInt32ValueSchema,
  UInt64ValueSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import { getField as getProtoField } from "@protoutil/core";
import { anyValueType } from "./any-value.js";
import { Double } from "./double.js";
import { err, errFromString, maybeNoSuchOverloadErr } from "./err.js";
import { formatVal } from "./format.js";
import { Int } from "./int.js";
import { JSONValueType } from "./json-value.js";
import { protoMap } from "./map.js";
import { NullValue } from "./null.js";
import { fieldDescription } from "./pb/type.js";
import { DefaultTypeAdapter } from "./provider.js";
import type { Type as RefType, TypeAdapter, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import type { FieldTester, Indexer } from "./traits/index.js";
import { TypeType } from "./types.js";
import { Uint } from "./uint.js";

const registryMap = new WeakMap<DescMessage, Registry>();
const fieldMap = new WeakMap<
  DescMessage,
  {
    json: Map<string, DescField>;
    proto: Map<string, DescField>;
  }
>();

/**
 * ProviderResolvedField is the subset of provider field metadata needed for extension access.
 */
interface ProviderResolvedField {
  /** getFrom reads the native field value from a message. */
  readonly getFrom: (target: unknown) => unknown;
  /** isSet tests whether the native field is present on a message. */
  readonly isSet: (target: unknown) => boolean;
}

/**
 * protoObj returns an object based on a proto.Message value which handles
 * conversion between protobuf type values and expression type values.
 * Objects support indexing and iteration.
 *
 * Note: the type value is pulled from the list of registered types within the
 * type provider. If the proto type is not registered within the type provider,
 * then this will result in an error within the type adapter / provider.
 */
export class protoObj implements Val, FieldTester, Indexer {
  constructor(
    private readonly adapter: TypeAdapter,
    private readonly typeDesc: DescMessage,
    private readonly typeValue: Val,
    private readonly pbValue: Message,
  ) {}
  public convertToNative(typeDesc: unknown): unknown {
    const srcPB = this.pbValue;
    if (typeDesc === this.typeDesc) {
      return srcPB;
    }
    if (typeDesc === this) {
      return this;
    }
    switch (typeDesc) {
      case anyValueType:
      case AnySchema:
        if (srcPB.$typeName === AnySchema.typeName) {
          return srcPB;
        }
        return anyPack(this.typeDesc, srcPB as MessageShape<typeof this.typeDesc>);
      case JSONValueType: {
        // Marshal the proto to JSON first, and then rehydrate as protobuf.Value as there is no
        // support for direct conversion from proto.Message to protobuf.Value.
        const registry = registryForMessage(this.typeDesc);
        return fromJson(
          JSONValueType,
          toJson(this.typeDesc, srcPB as MessageShape<typeof this.typeDesc>, { registry }),
          { registry },
        );
      }
      default:
        if (isDescMessage(typeDesc) && typeDesc.typeName === this.typeDesc.typeName) {
          return fromBinary(
            typeDesc,
            toBinary(this.typeDesc, srcPB as MessageShape<typeof this.typeDesc>),
          );
        }
    }
    throw new globalThis.Error(
      `type conversion error from '${this.pbValue.$typeName}' to '${String(typeDesc)}'`,
    );
  }
  public convertToType(typeVal: RefType): Val {
    switch (typeVal) {
      case TypeType:
        return this.typeValue;
      default:
        if (this.type().typeName() === typeVal.typeName()) {
          return this;
        }
    }
    return err(
      "type conversion error from '%s' to '%s'",
      this.typeDesc.typeName,
      typeVal.typeName(),
    );
  }
  public equal(other: Val): Val {
    const otherPB = other.value();
    const ok = isMessage(otherPB);
    return this.adapter.nativeToValue(
      ok &&
        protobufEquals(
          this.typeDesc,
          this.pbValue as MessageShape<typeof this.typeDesc>,
          otherPB as MessageShape<typeof this.typeDesc>,
          {
            extensions: true,
            registry: registryForMessage(this.typeDesc),
            unpackAny: true,
            unknown: true,
          },
        ),
    );
  }

  /** IsSet tests whether a field which is defined is set to a non-default value. */
  public isSet(field: Val): Val {
    if (!(field instanceof CelString)) {
      return maybeNoSuchOverloadErr(field);
    }
    const fd = fieldByName(this.typeDesc, field.value(), jsonFieldNamesEnabled(this.adapter));
    if (!fd) {
      const providerField = fieldByProvider(this.adapter, this.typeDesc.typeName, field.value());
      return providerField
        ? this.adapter.nativeToValue(providerField.isSet(this.pbValue))
        : err("no such field '%s'", field.value());
    }
    return this.adapter.nativeToValue(
      isFieldSet(this.pbValue as MessageShape<typeof this.typeDesc>, fd),
    );
  }

  /** IsZeroValue returns true if the protobuf object is empty. */
  public isZeroValue(): boolean {
    return protobufEquals(
      this.typeDesc,
      this.pbValue as MessageShape<typeof this.typeDesc>,
      create(this.typeDesc),
      {
        extensions: true,
        registry: registryForMessage(this.typeDesc),
        unpackAny: true,
        unknown: true,
      },
    );
  }

  /** Get returns the field value by name. */
  public get(index: Val): Val {
    if (!(index instanceof CelString)) {
      return maybeNoSuchOverloadErr(index);
    }
    const fd = fieldByName(this.typeDesc, index.value(), jsonFieldNamesEnabled(this.adapter));
    if (!fd) {
      const providerField = fieldByProvider(this.adapter, this.typeDesc.typeName, index.value());
      return providerField
        ? this.adapter.nativeToValue(providerField.getFrom(this.pbValue))
        : err("no such field '%s'", index.value());
    }
    try {
      return protoFieldToValue(this.adapter, this.pbValue, fd);
    } catch (cause) {
      return errFromString((cause as Error).message);
    }
  }
  public type(): RefType {
    return this.typeValue as unknown as RefType;
  }
  public value(): unknown {
    return this.pbValue;
  }

  /** format implements formattable. */
  public format(sb: string[]): void {
    const fields = this.typeDesc.fields
      .filter((field) => isFieldSet(this.pbValue as MessageShape<typeof this.typeDesc>, field))
      .slice()
      .sort((a, b) => a.number - b.number);
    sb.push(this.type().typeName(), "{");
    for (const [index, field] of fields.entries()) {
      if (index > 0) {
        sb.push(", ");
      }
      sb.push(field.name, ": ", formatVal(this.get(new CelString(field.name))));
    }
    sb.push("}");
  }

  /** String returns the human-readable formatted value. */
  public toString(): string {
    return formatVal(this);
  }
}

/**
 * object returns an object based on a proto.Message value which handles
 * conversion between protobuf type values and expression type values.
 * Objects support indexing and iteration.
 *
 * Note: the type value is pulled from the list of registered types within the
 * type provider. If the proto type is not registered within the type provider,
 * then this will result in an error within the type adapter / provider.
 */
export function object(
  adapter: TypeAdapter,
  typeDesc: DescMessage,
  typeValue: Val,
  pbValue: Message,
): Val {
  return new protoObj(adapter, typeDesc, typeValue, pbValue);
}

function registryForMessage(message: DescMessage): Registry {
  let registry = registryMap.get(message);
  if (!registry) {
    registry = createRegistry(message.file);
    registryMap.set(message, registry);
  }
  return registry;
}

/**
 * fieldByName resolves protobuf fields with cel-go's JSON-name precedence and proto fallback.
 */
function fieldByName(
  message: DescMessage,
  name: string,
  jsonFieldNames: boolean,
): DescField | undefined {
  let fields = fieldMap.get(message);
  if (!fields) {
    fields = {
      json: new Map<string, DescField>(),
      proto: new Map<string, DescField>(),
    };
    for (const field of message.fields) {
      fields.proto.set(field.name, field);
      fields.json.set(field.jsonName, field);
    }
    fieldMap.set(message, fields);
  }
  return (jsonFieldNames ? fields.json.get(name) : undefined) ?? fields.proto.get(name);
}

/**
 * fieldByProvider resolves fields which are registered outside the message's declaring file,
 * including protobuf extensions.
 */
function fieldByProvider(
  adapter: TypeAdapter,
  messageType: string,
  fieldName: string,
): ProviderResolvedField | undefined {
  if (!("findStructFieldType" in adapter) || typeof adapter.findStructFieldType !== "function") {
    return undefined;
  }
  const [field, found] = adapter.findStructFieldType(messageType, fieldName) as [
    ProviderResolvedField | undefined,
    boolean,
  ];
  return found ? field : undefined;
}

/**
 * jsonFieldNamesEnabled reports whether the active type adapter enables protobuf JSON names.
 */
function jsonFieldNamesEnabled(adapter: TypeAdapter): boolean {
  return (
    "jsonFieldNames" in adapter &&
    typeof adapter.jsonFieldNames === "function" &&
    adapter.jsonFieldNames() === true
  );
}

function getDefaultFieldValue(pbValue: Message, field: DescField): unknown {
  const value = getProtoField(pbValue as MessageShape<DescMessage>, field);
  switch (field.fieldKind) {
    case "scalar":
    case "enum":
      return value ?? field.getDefaultValue();
    case "message":
      if (value === undefined && isWrapperField(field)) {
        return null;
      }
      return value ?? create(field.message);
    case "list":
      return value ?? [];
    case "map":
      return value ?? {};
  }
}

/**
 * protoFieldToValue converts a protobuf field into its CEL value while preserving protobuf scalar semantics.
 */
function protoFieldToValue(adapter: TypeAdapter, pbValue: Message, field: DescField): Val {
  const value = getDefaultFieldValue(pbValue, field);
  switch (field.fieldKind) {
    case "enum":
      return adapter.nativeToValue(BigInt((value as number | bigint) ?? 0));
    case "message":
      if (field.message === ValueSchema) {
        return jsonFieldValueToValue(adapter, value);
      }
      if (field.message?.typeName === StructSchema.typeName && !isMessage(value)) {
        return adapter.nativeToValue(fromJson(StructSchema, value as JsonValue));
      }
      if (isWrapperField(field)) {
        return wrapperFieldToValue(adapter, field, value);
      }
      return adapter.nativeToValue(value);
    case "map": {
      const description = fieldDescription(field, jsonFieldNamesEnabled(adapter));
      return protoMap(
        adapter,
        value as Record<string, unknown>,
        description.keyType,
        description.valueType,
      );
    }
    case "scalar":
      return scalarFieldToValue(value, field.scalar);
    default:
      return adapter.nativeToValue(value);
  }
}

/**
 * wrapperFieldToValue preserves the CEL scalar family carried by a protobuf wrapper descriptor.
 */
function wrapperFieldToValue(adapter: TypeAdapter, field: DescField, value: unknown): Val {
  if (value === null || value === undefined) {
    return NullValue;
  }
  switch (field.message?.typeName) {
    case BoolValueSchema.typeName:
    case BytesValueSchema.typeName:
    case StringValueSchema.typeName:
      return adapter.nativeToValue(value);
    case DoubleValueSchema.typeName:
    case FloatValueSchema.typeName:
      return new Double(Number(value));
    case Int32ValueSchema.typeName:
    case Int64ValueSchema.typeName:
      return new Int(BigInt(value as number | bigint));
    case UInt32ValueSchema.typeName:
    case UInt64ValueSchema.typeName:
      return new Uint(BigInt(value as number | bigint));
    default:
      return adapter.nativeToValue(value);
  }
}

/**
 * jsonFieldValueToValue preserves protobuf Value number semantics when Buf exposes native JSON.
 */
function jsonFieldValueToValue(adapter: TypeAdapter, value: unknown): Val {
  if (isMessage(value)) {
    return adapter.nativeToValue(value);
  }
  return adapter.nativeToValue(fromJson(ValueSchema, value as JsonValue));
}

/**
 * scalarFieldToValue converts a protobuf scalar field into the CEL numeric family expected by cel-go.
 */
function scalarFieldToValue(
  value: unknown,
  scalar: Extract<DescField, { fieldKind: "scalar" }>["scalar"],
): Val {
  switch (scalar) {
    case ScalarType.BOOL:
    case ScalarType.STRING:
    case ScalarType.BYTES:
      return DefaultTypeAdapter.nativeToValue(value);
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
      return DefaultTypeAdapter.nativeToValue(Number(value ?? 0));
    case ScalarType.UINT32:
    case ScalarType.UINT64:
    case ScalarType.FIXED32:
    case ScalarType.FIXED64:
      return new Uint(BigInt((value as number) ?? 0));
    default:
      return DefaultTypeAdapter.nativeToValue(BigInt((value as number) ?? 0));
  }
}

/**
 * isWrapperField returns whether the field references a protobuf wrapper message.
 */
function isWrapperField(field: DescField): boolean {
  if (!field.message) {
    return false;
  }
  return wrapperTypeNames.has(field.message.typeName);
}

function isDescMessage(value: unknown): value is DescMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as { kind: unknown }).kind === "message"
  );
}

function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" &&
    value !== null &&
    "$typeName" in value &&
    typeof (value as { $typeName: unknown }).$typeName === "string"
  );
}

/** wrapperTypeNames identifies protobuf messages with CEL null-or-scalar field semantics. */
const wrapperTypeNames = new Set<string>([
  "google.protobuf.BoolValue",
  "google.protobuf.BytesValue",
  "google.protobuf.DoubleValue",
  "google.protobuf.FloatValue",
  "google.protobuf.Int32Value",
  "google.protobuf.Int64Value",
  "google.protobuf.StringValue",
  "google.protobuf.UInt32Value",
  "google.protobuf.UInt64Value",
]);
