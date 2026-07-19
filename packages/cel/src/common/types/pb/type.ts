import {
  create,
  createRegistry,
  type DescExtension,
  type DescField,
  type DescFile,
  type DescMessage,
  fromBinary,
  getExtension,
  hasExtension,
  isFieldSet,
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
import { getField as getProtoField } from "@protoutil/core";
import type { Type as ExprType } from "../../../gen/cel/expr/checked_pb.js";
import { checkedTypeForField } from "./checked.js";

type description = {
  /** Zero returns an empty immutable protobuf message when the description is a protobuf message type. */
  zero(): Message | undefined;
};

let dynamicTypeRegistry = createRegistry(
  AnySchema.file,
  BoolValueSchema.file,
  BytesValueSchema.file,
  DoubleValueSchema.file,
  DurationSchema.file,
  FloatValueSchema.file,
  Int32ValueSchema.file,
  Int64ValueSchema.file,
  ListValueSchema.file,
  StringValueSchema.file,
  StructSchema.file,
  TimestampSchema.file,
  UInt32ValueSchema.file,
  UInt64ValueSchema.file,
  ValueSchema.file,
);

/**
 * registerTypeFile adds the file descriptors in scope for dynamic protobuf unwrapping.
 */
export function registerTypeFile(file: DescFile): void {
  dynamicTypeRegistry = createRegistry(dynamicTypeRegistry, file);
}

/**
 * typeDescription produces a TypeDescription value for the fully-qualified proto type name with a given descriptor.
 */
export function typeDescription(
  typeName: string,
  desc: DescMessage,
  jsonFieldNames: boolean,
  extensions: extensionMap,
): TypeDescription {
  const fieldMap = new Map<string, FieldDescription>();
  const jsonFieldMap = new Map<string, FieldDescription>();
  for (const field of desc.fields) {
    const fd = fieldDescription(field, jsonFieldNames);
    fieldMap.set(fd.name(), fd);
    if (jsonFieldNames) {
      jsonFieldMap.set(fd.jsonName(), fd);
    }
  }
  return new TypeDescription(
    typeName,
    desc,
    fieldMap,
    jsonFieldMap,
    extensions,
    reflectTypeOf(create(desc)),
    zeroValueOf(create(desc)),
    jsonFieldNames,
  );
}

/**
 * TypeDescription is a collection of type metadata relevant to expression checking and evaluation.
 */
export class TypeDescription implements description {
  constructor(
    private readonly typeNameValue: string,
    private readonly descValue: DescMessage,
    private readonly fieldMapValue: Map<string, FieldDescription>,
    private readonly jsonFieldMapValue: Map<string, FieldDescription>,
    private readonly extensionsValue: extensionMap,
    private readonly reflectTypeValue: unknown,
    private readonly zeroMsgValue: Message | undefined,
    private readonly jsonFieldNamesValue: boolean,
  ) {}

  /** Copy copies the type description with updated references to the Db. */
  public copy(extensions: extensionMap): TypeDescription {
    return new TypeDescription(
      this.typeNameValue,
      this.descValue,
      this.fieldMapValue,
      this.jsonFieldMapValue,
      extensions,
      this.reflectTypeValue,
      this.zeroMsgValue,
      this.jsonFieldNamesValue,
    );
  }

  /** FieldMap returns a string field name to FieldDescription map. */
  public fieldMap(): Map<string, FieldDescription> {
    return this.jsonFieldNamesValue ? this.jsonFieldMapValue : this.fieldMapValue;
  }

  /** FieldByName returns the FieldDescription if declared within the type. */
  public fieldByName(name: string): [FieldDescription | undefined, boolean] {
    if (this.jsonFieldNamesValue) {
      const jsonField = this.jsonFieldMapValue.get(name);
      if (jsonField) {
        return [jsonField, true];
      }
    }
    const field = this.fieldMapValue.get(name);
    if (field) {
      return [field, true];
    }
    const extFieldMap = this.extensionsValue.get(this.typeNameValue);
    if (extFieldMap) {
      const extField = extFieldMap.get(name);
      return [extField, extField !== undefined];
    }
    return [undefined, false];
  }

  /** MaybeUnwrap accepts a proto message as input and unwraps it to a primitive CEL type if possible. */
  public maybeUnwrap(msg: Message): [unknown, boolean, Error | undefined] {
    return unwrap(this, msg);
  }

  /** Name returns the fully-qualified name of the type. */
  public name(): string {
    return this.descValue.typeName;
  }

  /** Message returns a mutable proto message. */
  public message(): Message {
    return create(this.descValue);
  }

  /** Descriptor returns the Buf message descriptor. */
  public descriptor(): DescMessage {
    return this.descValue;
  }

  /** ReflectType returns the reflected runtime type token for this type. */
  public reflectType(): unknown {
    return this.reflectTypeValue;
  }

  /** Zero returns the zero message value for this type. */
  public zero(): Message | undefined {
    return this.zeroMsgValue;
  }
}

/**
 * fieldDescription creates a field description from a descriptor.
 */
export function fieldDescription(
  fieldDesc: DescField | DescExtension,
  jsonFieldNames: boolean,
): FieldDescription {
  let keyType: FieldDescription | undefined;
  let valueType: FieldDescription | undefined;
  if (fieldDesc.fieldKind === "map") {
    keyType = mapKeyFieldDescription(fieldDesc);
    valueType = mapValueFieldDescription(fieldDesc, jsonFieldNames);
  }
  return new FieldDescription(
    fieldDesc,
    keyType,
    valueType,
    reflectTypeOf(reflectFieldValue(fieldDesc)),
    zeroMessageForField(fieldDesc),
    jsonFieldNames,
  );
}

/**
 * FieldDescription holds metadata related to fields declared within a type.
 */
export class FieldDescription implements description {
  constructor(
    private readonly descValue: DescField | DescExtension,
    /** KeyType holds the key FieldDescription for map fields. */
    public readonly keyType?: FieldDescription,
    /** ValueType holds the value FieldDescription for map fields. */
    public readonly valueType?: FieldDescription,
    private readonly reflectTypeValue?: unknown,
    private readonly zeroMsgValue?: Message,
    public readonly jsonFieldName = false,
  ) {}

  /** CheckedType returns the type-definition used at type-check time. */
  public checkedType(): ExprType {
    return checkedTypeForField(this.descValue);
  }

  /** Descriptor returns the field descriptor. */
  public descriptor(): DescField | DescExtension {
    return this.descValue;
  }

  /** Documentation returns the documentation for the field. */
  public documentation(): string {
    return "";
  }

  /** IsSet returns whether the field is set on the target value. */
  public isSet(target: unknown): boolean {
    if (!isMessage(target)) {
      return false;
    }
    if (this.descValue.kind === "extension") {
      if (this.descValue.extendee.typeName !== target.$typeName) {
        return false;
      }
      return hasExtension(target as Message, this.descValue);
    }
    if (this.descValue.parent.typeName !== target.$typeName) {
      return false;
    }
    return isFieldSet(target as MessageShape<DescMessage>, this.descValue);
  }

  /** GetFrom returns the accessor method associated with the field on the proto generated struct. */
  public getFrom(target: unknown): [unknown, Error | undefined] {
    if (!isMessage(target)) {
      return [
        undefined,
        new Error(`unsupported field selection target: (${typeof target})${String(target)}`),
      ];
    }
    if (
      this.descValue.kind === "extension"
        ? this.descValue.extendee.typeName !== target.$typeName
        : this.descValue.parent.typeName !== target.$typeName
    ) {
      return [
        undefined,
        new Error(`unsupported field selection target: (${target.$typeName})${target.$typeName}`),
      ];
    }
    const fieldVal =
      this.descValue.kind === "extension"
        ? getExtension(target as Message, this.descValue)
        : getProtoField(target as MessageShape<DescMessage>, this.descValue);
    const value = fieldVal ?? defaultFieldValue(this.descValue);
    if (isMessage(value)) {
      const [unwrapped, didUnwrap, err] = this.maybeUnwrapDynamic(value);
      if (didUnwrap || err) {
        return [unwrapped, err];
      }
    }
    switch (this.descValue.fieldKind) {
      case "enum":
        return [typeof value === "number" ? BigInt(value) : value, undefined];
      case "map":
        return [
          new MapValue(value as Record<string, unknown>, this.keyType!, this.valueType!),
          undefined,
        ];
      case "message": {
        const [unwrapped, , err] = this.maybeUnwrapDynamic(value as Message);
        return [unwrapped, err];
      }
      default:
        return [value, undefined];
    }
  }

  /** IsEnum returns true if the field type refers to an enum value. */
  public isEnum(): boolean {
    return this.descValue.fieldKind === "enum";
  }

  /** IsMap returns true if the field is of map type. */
  public isMap(): boolean {
    return this.descValue.fieldKind === "map";
  }

  /** IsMessage returns true if the field is a message type. */
  public isMessage(): boolean {
    return this.descValue.fieldKind === "message";
  }

  /** IsOneof returns true if the field is declared within a oneof block. */
  public isOneof(): boolean {
    return this.descValue.oneof !== undefined;
  }

  /** IsList returns true if the field is a repeated value. */
  public isList(): boolean {
    return this.descValue.fieldKind === "list" || this.descValue.fieldKind === "map";
  }

  /** MaybeUnwrapDynamic takes the reflected message and determines whether the value can be unwrapped. */
  public maybeUnwrapDynamic(msg: Message): [unknown, boolean, Error | undefined] {
    return unwrapDynamic(this, msg);
  }

  /** Name returns the snake_case name of the field within the proto-based struct. */
  public name(): string {
    return this.descValue.name;
  }

  /** JSONName returns the JSON name of the field, if present. */
  public jsonName(): string {
    return this.descValue.jsonName || this.descValue.name;
  }

  /** ProtoKind returns the protobuf kind of the field. */
  public protoKind(): string {
    if (this.descValue.fieldKind === "scalar") {
      return String(this.descValue.scalar);
    }
    return this.descValue.fieldKind;
  }

  /** ReflectType returns the reflected runtime type token for this field. */
  public reflectType(): unknown {
    return this.reflectTypeValue;
  }

  /** String returns the fully qualified name of the field within its type. */
  public toString(): string {
    return `${this.descValue.parent?.typeName}.${this.name()} \`oneof=${this.isOneof()}\``;
  }

  /** Zero returns the zero value for the protobuf message represented by this field. */
  public zero(): Message | undefined {
    return this.zeroMsgValue;
  }
}

/**
 * Map wraps a protobuf map with key and value metadata.
 */
export class MapValue {
  constructor(
    public readonly map: Record<string, unknown>,
    public readonly keyType: FieldDescription,
    public readonly valueType: FieldDescription,
  ) {}
}

/**
 * extensionMap is a map[typeName]map[extensionName]FieldDescription.
 */
export type extensionMap = Map<string, Map<string, FieldDescription>>;

/**
 * unwrap unwraps the provided proto message value.
 */
export function unwrap(desc: description, msg: Message): [unknown, boolean, Error | undefined] {
  return unwrapDynamic(desc, msg);
}

/**
 * unwrapDynamic unwraps a reflected protobuf Message value.
 */
export function unwrapDynamic(
  desc: description,
  msg: Message | undefined,
): [unknown, boolean, Error | undefined] {
  if (!msg) {
    return [desc.zero(), false, undefined];
  }
  switch (msg.$typeName) {
    case AnySchema.typeName: {
      const unpacked = unpackAnyValue(msg as MessageShape<typeof AnySchema>);
      if (unpacked instanceof Error) {
        return [undefined, false, unpacked];
      }
      if (!unpacked) {
        return [msg, false, undefined];
      }
      const [nested, didUnwrap, err] = unwrapDynamic(desc, unpacked);
      if (!err && didUnwrap) {
        return [nested, true, undefined];
      }
      return [unpacked, true, err];
    }
    case BoolValueSchema.typeName:
    case BytesValueSchema.typeName:
    case DoubleValueSchema.typeName:
    case FloatValueSchema.typeName:
    case StringValueSchema.typeName:
      return [
        getProtoField(msg as MessageShape<DescMessage>, wrapperValueField(msg.$typeName)),
        true,
        undefined,
      ];
    case Int32ValueSchema.typeName: {
      const value = getProtoField(
        msg as MessageShape<DescMessage>,
        wrapperValueField(msg.$typeName),
      ) as number;
      return [BigInt(value), true, undefined];
    }
    case Int64ValueSchema.typeName:
      return [
        getProtoField(msg as MessageShape<DescMessage>, wrapperValueField(msg.$typeName)),
        true,
        undefined,
      ];
    case UInt32ValueSchema.typeName: {
      const value = getProtoField(
        msg as MessageShape<DescMessage>,
        wrapperValueField(msg.$typeName),
      ) as number;
      return [BigInt(value), true, undefined];
    }
    case UInt64ValueSchema.typeName:
      return [
        getProtoField(msg as MessageShape<DescMessage>, wrapperValueField(msg.$typeName)),
        true,
        undefined,
      ];
    case DurationSchema.typeName:
      return [msg, true, undefined];
    case ListValueSchema.typeName:
      return [msg, true, undefined];
    case StructSchema.typeName:
      return [msg, true, undefined];
    case TimestampSchema.typeName:
      return [msg, true, undefined];
    case ValueSchema.typeName: {
      const kind = (msg as MessageShape<typeof ValueSchema>).kind;
      switch (kind.case) {
        case "boolValue":
        case "numberValue":
        case "stringValue":
          return [kind.value, true, undefined];
        case "listValue":
        case "structValue":
          return [kind.value, true, undefined];
        case "nullValue":
          return [kind.value, true, undefined];
        default:
          return [0, true, undefined];
      }
    }
    default:
      return [msg, false, undefined];
  }
}

function unpackAnyValue(message: MessageShape<typeof AnySchema>): Message | undefined | Error {
  const typeUrl = message.typeUrl;
  const typeName = typeUrl.includes("/") ? typeUrl.slice(typeUrl.lastIndexOf("/") + 1) : typeUrl;
  const schema = dynamicTypeRegistry.getMessage(typeName);
  if (!schema) {
    return undefined;
  }
  try {
    return fromBinary(schema, message.value);
  } catch (error) {
    return error as Error;
  }
}

function defaultFieldValue(field: DescField | DescExtension): unknown {
  switch (field.fieldKind) {
    case "scalar":
      return field.getDefaultValue();
    case "enum":
      return field.enum.values[0]?.number ?? 0;
    case "message":
      return create(field.message);
    case "list":
      return [];
    case "map":
      return {};
  }
}

function reflectFieldValue(field: DescField | DescExtension): unknown {
  switch (field.fieldKind) {
    case "scalar":
      return scalarReflectValue(field.scalar);
    case "enum":
      return 0;
    case "message":
      return create(field.message);
    case "list":
      return [];
    case "map":
      return {};
  }
}

function scalarReflectValue(
  scalar: Extract<DescField, { fieldKind: "scalar" }>["scalar"],
): unknown {
  switch (scalar) {
    case ScalarType.BOOL:
      return false;
    case ScalarType.STRING:
      return "";
    case ScalarType.BYTES:
      return new Uint8Array();
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
    case ScalarType.INT32:
    case ScalarType.UINT32:
    case ScalarType.FIXED32:
    case ScalarType.SFIXED32:
    case ScalarType.SINT32:
      return 0;
    case ScalarType.INT64:
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      return 0n;
  }
}

function zeroMessageForField(field: DescField | DescExtension): Message | undefined {
  if (field.fieldKind !== "message") {
    return undefined;
  }
  return zeroValueOf(create(field.message));
}

function mapKeyFieldDescription(field: Extract<DescField, { fieldKind: "map" }>): FieldDescription {
  return new FieldDescription(scalarMapEntryField(field, "key", field.mapKey));
}

function mapValueFieldDescription(
  field: Extract<DescField, { fieldKind: "map" }>,
  jsonFieldNames: boolean,
): FieldDescription {
  switch (field.mapKind) {
    case "enum":
      return new FieldDescription(enumMapEntryField(field, "value"));
    case "message":
      return new FieldDescription(messageMapEntryField(field, "value"));
    case "scalar":
      return fieldDescription(scalarMapEntryField(field, "value", field.scalar), jsonFieldNames);
  }
}

function scalarMapEntryField(
  field: Extract<DescField, { fieldKind: "map" }>,
  name: string,
  scalar: Extract<DescField, { fieldKind: "scalar" }>["scalar"],
): DescField {
  return {
    ...field,
    kind: "field",
    fieldKind: "scalar",
    scalar,
    enum: undefined,
    message: undefined,
    localName: name,
    name,
    jsonName: name,
    oneof: undefined,
    longAsString: false,
    getDefaultValue: () => undefined,
  } as unknown as DescField;
}

function enumMapEntryField(
  field: Extract<DescField, { fieldKind: "map"; mapKind: "enum" }>,
  name: string,
): DescField {
  return {
    ...field,
    kind: "field",
    fieldKind: "enum",
    scalar: undefined,
    message: undefined,
    enum: field.enum,
    localName: name,
    name,
    jsonName: name,
    oneof: undefined,
    getDefaultValue: () => undefined,
  } as unknown as DescField;
}

function messageMapEntryField(
  field: Extract<DescField, { fieldKind: "map"; mapKind: "message" }>,
  name: string,
): DescField {
  return {
    ...field,
    kind: "field",
    fieldKind: "message",
    scalar: undefined,
    message: field.message,
    enum: undefined,
    localName: name,
    name,
    jsonName: name,
    oneof: undefined,
    delimitedEncoding: false,
    getDefaultValue: () => undefined,
  } as unknown as DescField;
}

function wrapperValueField(typeName: string): DescField {
  const schema = [
    BoolValueSchema,
    BytesValueSchema,
    DoubleValueSchema,
    FloatValueSchema,
    Int32ValueSchema,
    Int64ValueSchema,
    StringValueSchema,
    UInt32ValueSchema,
    UInt64ValueSchema,
  ].find((candidate) => candidate.typeName === typeName);
  if (!schema) {
    throw new Error(`unknown wrapper type: ${typeName}`);
  }
  return schema.fields[0]!;
}

function reflectTypeOf(val: unknown): unknown {
  return val;
}

function zeroValueOf(msg: Message | undefined): Message | undefined {
  if (!msg) {
    return undefined;
  }
  const zeroVal = zeroValueMap.get(msg.$typeName);
  return zeroVal ?? msg;
}

const zeroValueMap = new Map<string, Message>([
  [
    AnySchema.typeName,
    create(AnySchema, { typeUrl: "types.googleapis.com/google.protobuf.Value" }) as Message,
  ],
  [DurationSchema.typeName, create(DurationSchema)],
  [ListValueSchema.typeName, create(ListValueSchema)],
  [StructSchema.typeName, create(StructSchema)],
  [TimestampSchema.typeName, create(TimestampSchema)],
  [ValueSchema.typeName, create(ValueSchema)],
  [BoolValueSchema.typeName, create(BoolValueSchema)],
  [BytesValueSchema.typeName, create(BytesValueSchema)],
  [DoubleValueSchema.typeName, create(DoubleValueSchema)],
  [FloatValueSchema.typeName, create(FloatValueSchema)],
  [Int32ValueSchema.typeName, create(Int32ValueSchema)],
  [Int64ValueSchema.typeName, create(Int64ValueSchema)],
  [StringValueSchema.typeName, create(StringValueSchema)],
  [UInt32ValueSchema.typeName, create(UInt32ValueSchema)],
  [UInt64ValueSchema.typeName, create(UInt64ValueSchema)],
]);

function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" &&
    value !== null &&
    "$typeName" in value &&
    typeof (value as { $typeName: unknown }).$typeName === "string"
  );
}
