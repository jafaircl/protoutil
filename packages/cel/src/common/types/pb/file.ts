import type {
  DescEnum,
  DescEnumValue,
  DescExtension,
  DescFile,
  DescMessage,
} from "@bufbuild/protobuf";
import { EnumValueDescription } from "./enum.js";
import {
  type extensionMap,
  type FieldDescription,
  fieldDescription,
  type TypeDescription,
  typeDescription,
} from "./type.js";

/**
 * FileDescription holds a map of all types and enum values declared within a proto file.
 */
export class FileDescription {
  constructor(
    private readonly nameValue: string,
    private readonly descValue: DescFile,
    private readonly typesValue: Map<string, TypeDescription>,
    private readonly enumsValue: Map<string, EnumValueDescription>,
  ) {}

  /** Copy creates a copy of the FileDescription with updated Db references within its types. */
  public copy(extensions: extensionMap): FileDescription {
    const typesCopy = new Map<string, TypeDescription>();
    for (const [name, td] of this.typesValue) {
      typesCopy.set(name, td.copy(extensions));
    }
    return new FileDescription(this.nameValue, this.descValue, typesCopy, this.enumsValue);
  }

  /** GetName returns the fully qualified file path for the file. */
  public getName(): string {
    return this.nameValue;
  }

  /** FileDescriptor returns the proto file descriptor associated with the file representation. */
  public fileDescriptor(): DescFile {
    return this.descValue;
  }

  /** GetEnumDescription returns an EnumDescription for a qualified enum value name declared within the file. */
  public getEnumDescription(enumName: string): [EnumValueDescription | undefined, boolean] {
    const ed = this.enumsValue.get(sanitizeProtoName(enumName));
    return [ed, ed !== undefined];
  }

  /** GetEnumNames returns the string names of all enum values in the file. */
  public getEnumNames(): string[] {
    return Array.from(this.enumsValue.values(), (e) => e.name());
  }

  /** GetTypeDescription returns a TypeDescription for a qualified protobuf message type name declared within the file. */
  public getTypeDescription(typeName: string): [TypeDescription | undefined, boolean] {
    const td = this.typesValue.get(sanitizeProtoName(typeName));
    return [td, td !== undefined];
  }

  /** GetTypeNames returns the list of all type names contained within the file. */
  public getTypeNames(): string[] {
    return Array.from(this.typesValue.values(), (t) => t.name());
  }
}

type fileMetadata = {
  /** msgTypes maps from fully-qualified message name to descriptor. */
  msgTypes: Map<string, DescMessage>;
  /** enumValues maps from fully-qualified enum value to enum value descriptor. */
  enumValues: Map<string, DescEnumValue>;
  /** msgExtensionMap maps from the protobuf message name being extended to a set of extensions for the type. */
  msgExtensionMap: Map<string, DescExtension[]>;
};

/**
 * fileDescription produces a FileDescription instance with a complete listing of all the message
 * types and enum values, as well as a map of extensions declared within any scope in the file.
 */
export function fileDescription(
  fileDesc: DescFile,
  extensions: extensionMap,
  jsonFieldNames: boolean,
): [FileDescription, extensionMap] {
  const metadata = collectFileMetadata(fileDesc);
  const enums = new Map<string, EnumValueDescription>();
  for (const [name, enumVal] of metadata.enumValues) {
    enums.set(name, new EnumValueDescription(name, enumVal));
  }
  const types = new Map<string, TypeDescription>();
  for (const [name, msgType] of metadata.msgTypes) {
    types.set(name, typeDescription(name, msgType, jsonFieldNames, extensions));
  }
  const fileExtMap: extensionMap = new Map();
  for (const [typeName, fileExtensions] of metadata.msgExtensionMap) {
    let messageExtMap = fileExtMap.get(typeName);
    if (!messageExtMap) {
      messageExtMap = new Map<string, FieldDescription>();
      fileExtMap.set(typeName, messageExtMap);
    }
    for (const ext of fileExtensions) {
      messageExtMap.set(ext.typeName, fieldDescription(ext, jsonFieldNames));
    }
  }
  return [new FileDescription(fileDesc.proto.name, fileDesc, types, enums), fileExtMap];
}

/**
 * sanitizeProtoName strips the leading '.' from the proto message name.
 */
export function sanitizeProtoName(name: string): string {
  return name.startsWith(".") ? name.slice(1) : name;
}

/**
 * collectFileMetadata traverses the proto file object graph to collect message types and enum
 * values and index them by their fully qualified names.
 */
export function collectFileMetadata(fileDesc: DescFile): fileMetadata {
  const msgTypes = new Map<string, DescMessage>();
  const enumValues = new Map<string, DescEnumValue>();
  const msgExtensionMap = new Map<string, DescExtension[]>();
  collectMessageTypes(fileDesc.messages, msgTypes, enumValues, msgExtensionMap);
  collectEnumValues(fileDesc.enums, enumValues);
  collectExtensions(fileDesc.extensions, msgExtensionMap);
  return {
    msgTypes,
    enumValues,
    msgExtensionMap,
  };
}

function collectMessageTypes(
  msgTypes: readonly DescMessage[],
  msgTypeMap: Map<string, DescMessage>,
  enumValueMap: Map<string, DescEnumValue>,
  msgExtensionMap: Map<string, DescExtension[]>,
): void {
  for (const msgType of msgTypes) {
    msgTypeMap.set(msgType.typeName, msgType);
    if (msgType.nestedMessages.length > 0) {
      collectMessageTypes(msgType.nestedMessages, msgTypeMap, enumValueMap, msgExtensionMap);
    }
    if (msgType.nestedEnums.length > 0) {
      collectEnumValues(msgType.nestedEnums, enumValueMap);
    }
    if (msgType.nestedExtensions.length > 0) {
      collectExtensions(msgType.nestedExtensions, msgExtensionMap);
    }
  }
}

function collectEnumValues(
  enumTypes: readonly DescEnum[],
  enumValueMap: Map<string, DescEnumValue>,
): void {
  for (const enumType of enumTypes) {
    for (const enumValue of enumType.values) {
      enumValueMap.set(`${enumType.typeName}.${enumValue.name}`, enumValue);
    }
  }
}

function collectExtensions(
  extensions: readonly DescExtension[],
  msgExtensionMap: Map<string, DescExtension[]>,
): void {
  for (const ext of extensions) {
    const extendsMsg = ext.extendee.typeName;
    const msgExts = msgExtensionMap.get(extendsMsg) ?? [];
    msgExts.push(ext);
    msgExtensionMap.set(extendsMsg, msgExts);
  }
}
