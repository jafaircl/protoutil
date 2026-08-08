import {
  clone,
  create,
  createRegistry,
  type DescField,
  type DescMessage,
  fromJson,
  isMessage,
  type Message,
  type MessageShape,
  equals as protobufEquals,
  type Registry,
  ScalarType,
  toJson,
} from "@bufbuild/protobuf";
import {
  isReflectList,
  isReflectMap,
  isReflectMessage,
  type ReflectMessage,
  reflect,
} from "@bufbuild/protobuf/reflect";
import { AnySchema, anyPack } from "@bufbuild/protobuf/wkt";
import { anyValueType } from "./any-value.js";
import { err, errFromString, maybeNoSuchOverloadErr } from "./err.js";
import { formatVal } from "./format.js";
import { JSONValueType } from "./json-value.js";
import { reflectedList } from "./list.js";
import { reflectedMap } from "./map.js";
import { NullValue } from "./null.js";
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
    private readonly reflectedValue: ReflectMessage,
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
          return clone(typeDesc, srcPB as MessageShape<typeof typeDesc>);
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
    return this.adapter.nativeToValue(this.reflectedValue.isSet(fd));
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
      return protoFieldToValue(this.adapter, this.reflectedValue, fd);
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
      .filter((field) => this.reflectedValue.isSet(field))
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
  pbValue: Message | ReflectMessage,
): Val {
  const reflected = isReflectMessage(pbValue)
    ? pbValue
    : reflect(typeDesc, pbValue as MessageShape<typeof typeDesc>);
  return new protoObj(adapter, typeDesc, typeValue, reflected.message, reflected);
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
  return adapter.findStructFieldType(messageType, fieldName) as ProviderResolvedField | undefined;
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

/**
 * protoFieldToValue converts a protobuf field into its CEL value while preserving protobuf scalar semantics.
 */
function protoFieldToValue(adapter: TypeAdapter, message: ReflectMessage, field: DescField): Val {
  const value = message.get(field);
  switch (field.fieldKind) {
    case "enum":
      return adapter.nativeToValue(BigInt((value as number | bigint) ?? 0));
    case "message":
      if (isWrapperField(field) && !message.isSet(field)) {
        return NullValue;
      }
      return adapter.nativeToValue(isReflectMessage(value) ? value.message : value);
    case "map":
      return isReflectMap(value) ? reflectedMap(adapter, value) : adapter.nativeToValue(value);
    case "list":
      return isReflectList(value) ? reflectedList(adapter, value) : adapter.nativeToValue(value);
    case "scalar":
      return scalarFieldToValue(value, field.scalar);
    default:
      return adapter.nativeToValue(value);
  }
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
