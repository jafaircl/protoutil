import {
  create,
  createRegistry,
  type DescField,
  type DescMessage,
  fromBinary,
  fromJson,
  isFieldSet,
  type Message,
  type MessageShape,
  equals as protobufEquals,
  type Registry,
  toBinary,
  toJson,
} from "@bufbuild/protobuf";
import { AnySchema, anyPack } from "@bufbuild/protobuf/wkt";
import { getField as getProtoField } from "@protoutil/core";
import { anyValueType } from "./any-value.js";
import { err, errFromString, maybeNoSuchOverloadErr } from "./err.js";
import { formatVal } from "./format.js";
import { JSONValueType } from "./json-value.js";
import type { Type as RefType, TypeAdapter, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import type { FieldTester, Indexer } from "./traits/index.js";
import { TypeType } from "./types.js";

const registryMap = new WeakMap<DescMessage, Registry>();
const fieldMap = new WeakMap<DescMessage, Map<string, DescField>>();

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
    const fd = fieldByName(this.typeDesc, field.value());
    if (!fd) {
      return err("no such field '%s'", field);
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
      { registry: registryForMessage(this.typeDesc), unpackAny: true, unknown: true },
    );
  }

  /** Get returns the field value by name. */
  public get(index: Val): Val {
    if (!(index instanceof CelString)) {
      return maybeNoSuchOverloadErr(index);
    }
    const fd = fieldByName(this.typeDesc, index.value());
    if (!fd) {
      return err("no such field '%s'", index);
    }
    try {
      return this.adapter.nativeToValue(getDefaultFieldValue(this.pbValue, fd));
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

function fieldByName(message: DescMessage, name: string): DescField | undefined {
  let fields = fieldMap.get(message);
  if (!fields) {
    fields = new Map<string, DescField>();
    for (const field of message.fields) {
      fields.set(field.name, field);
      fields.set(field.jsonName, field);
    }
    fieldMap.set(message, fields);
  }
  return fields.get(name);
}

function getDefaultFieldValue(pbValue: Message, field: DescField): unknown {
  const value = getProtoField(pbValue as MessageShape<DescMessage>, field);
  switch (field.fieldKind) {
    case "scalar":
    case "enum":
      return value ?? field.getDefaultValue();
    case "message":
      return value ?? create(field.message);
    case "list":
      return value ?? [];
    case "map":
      return value ?? {};
  }
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
