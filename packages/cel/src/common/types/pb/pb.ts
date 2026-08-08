import {
  clone,
  createRegistry,
  type DescFile,
  type DescMessage,
  type Message,
  type MessageShape,
  merge as mergeMessages,
  type Registry as ProtobufRegistry,
} from "@bufbuild/protobuf";
import {
  AnySchema,
  BoolValueSchema,
  DurationSchema,
  EmptySchema,
  FieldMaskSchema,
  TimestampSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import type { EnumValueDescription } from "./enum.js";
import { type FileDescription, fileDescription, sanitizeProtoName } from "./file.js";
import type { extensionMap, TypeDescription } from "./type.js";
import { registerTypeFile } from "./type.js";

/**
 * DbOption modifies feature flags enabled on the proto database.
 */
export type DbOption = (db: Db) => Db;

/**
 * Db maps from file / message / enum name to file description.
 */
export class Db {
  private protobufRegistryValue: ProtobufRegistry | undefined;

  constructor(
    private readonly revFileDescriptorMapValue = new Map<string, FileDescription>(),
    private readonly filesValue: FileDescription[] = [],
    private readonly extensionsValue: extensionMap = new Map(),
    private jsonFieldNamesValue = false,
  ) {}

  /** JSONFieldNames indicates whether the database is configured for proto field accesses by JSON names. */
  public jsonFieldNames(): boolean {
    return this.jsonFieldNamesValue;
  }

  /** protobufRegistry returns the public Protobuf-ES registry for the registered files. */
  public protobufRegistry(): ProtobufRegistry {
    this.protobufRegistryValue ??= createRegistry(
      ...this.filesValue.map((file) => file.fileDescriptor()),
    );
    return this.protobufRegistryValue;
  }

  /** revFileDescriptorMap returns the reverse descriptor index for the Db. */
  public revFileDescriptorMap(): Map<string, FileDescription> {
    return this.revFileDescriptorMapValue;
  }

  /** setJSONFieldNames updates the Db JSON field-name mode. */
  public setJSONFieldNames(enabled: boolean): void {
    this.jsonFieldNamesValue = enabled;
  }

  /** Copy creates a copy of the current database with its own internal descriptor mapping. */
  public copy(): Db {
    const next = db();
    next.jsonFieldNamesValue = this.jsonFieldNamesValue;
    for (const fd of this.filesValue) {
      let nextFile = fd;
      if (!next.filesValue.includes(fd)) {
        nextFile = fd.copy(next.extensionsValue);
        next.filesValue.push(nextFile);
      }
      for (const enumValName of nextFile.getEnumNames()) {
        next.revFileDescriptorMapValue.set(enumValName, nextFile);
      }
      for (const msgTypeName of nextFile.getTypeNames()) {
        next.revFileDescriptorMapValue.set(msgTypeName, nextFile);
      }
      next.revFileDescriptorMapValue.set(nextFile.getName(), nextFile);
    }
    for (const [typeName, extFieldMap] of this.extensionsValue) {
      const nextExtFieldMap = next.extensionsValue.get(typeName) ?? new Map();
      for (const [extFieldName, fd] of extFieldMap) {
        nextExtFieldMap.set(extFieldName, fd);
      }
      next.extensionsValue.set(typeName, nextExtFieldMap);
    }
    return next;
  }

  /** FileDescriptions returns the set of file descriptions associated with this db. */
  public fileDescriptions(): FileDescription[] {
    return this.filesValue;
  }

  /** RegisterDescriptor produces a FileDescription from a file descriptor and registers it into the Db. */
  public registerDescriptor(fileDesc: DescFile): FileDescription {
    const existing = this.revFileDescriptorMapValue.get(fileDesc.proto.name);
    if (existing) {
      return existing;
    }
    registerTypeFile(fileDesc);
    const [fd, fileExtMap] = fileDescription(
      fileDesc,
      this.extensionsValue,
      this.jsonFieldNamesValue,
    );
    for (const enumValName of fd.getEnumNames()) {
      this.revFileDescriptorMapValue.set(enumValName, fd);
    }
    for (const msgTypeName of fd.getTypeNames()) {
      this.revFileDescriptorMapValue.set(msgTypeName, fd);
    }
    this.revFileDescriptorMapValue.set(fd.getName(), fd);
    this.filesValue.push(fd);
    this.protobufRegistryValue = undefined;
    for (const [typeName, extMap] of fileExtMap) {
      const typeExtMap = this.extensionsValue.get(typeName);
      if (!typeExtMap) {
        this.extensionsValue.set(typeName, extMap);
        continue;
      }
      for (const [extName, field] of extMap) {
        typeExtMap.set(extName, field);
      }
    }
    return fd;
  }

  /**
   * RegisterMessage registers the message and all other definitions within the message file into the Db.
   *
   * The schema argument is required when the type is not already present in the Db because Buf message
   * instances do not carry a public descriptor handle that can be recovered from the value alone.
   */
  public registerMessage(message: Message, schema?: DescMessage): FileDescription {
    const typeName = sanitizeProtoName(message.$typeName);
    const existing = this.revFileDescriptorMapValue.get(typeName);
    if (existing) {
      return existing;
    }
    if (!schema) {
      throw new Error(
        `message descriptor not found for ${message.$typeName}; pass the schema explicitly`,
      );
    }
    if (schema.typeName !== message.$typeName) {
      throw new Error(
        `message descriptor mismatch for ${message.$typeName}; got ${schema.typeName}`,
      );
    }
    return this.registerDescriptor(schema.file);
  }

  /** DescribeEnum takes a qualified enum name and returns an EnumDescription if it exists in the Db. */
  public describeEnum(enumName: string): [EnumValueDescription | undefined, boolean] {
    enumName = sanitizeProtoName(enumName);
    const fd = this.revFileDescriptorMapValue.get(enumName);
    if (fd) {
      return fd.getEnumDescription(enumName);
    }
    return [undefined, false];
  }

  /** DescribeType returns a TypeDescription for the typeName if it exists in the Db. */
  public describeType(typeName: string): [TypeDescription | undefined, boolean] {
    typeName = sanitizeProtoName(typeName);
    const fd = this.revFileDescriptorMapValue.get(typeName);
    if (fd) {
      return fd.getTypeDescription(typeName);
    }
    return [undefined, false];
  }
}

/**
 * jsonFieldNamesOption configures the Db to support proto field accesses by their JSON names.
 */
export function jsonFieldNamesOption(enabled: boolean): DbOption {
  return (pbdb) => {
    pbdb.setJSONFieldNames(enabled);
    return pbdb;
  };
}

/**
 * db creates a new pb Db with an empty type name to file description map.
 */
export function db(...opts: DbOption[]): Db {
  const pbdb = new Db();
  for (const option of opts) {
    option(pbdb);
  }
  for (const [name, fileDesc] of DefaultDb.revFileDescriptorMap()) {
    pbdb.revFileDescriptorMap().set(name, fileDesc);
  }
  pbdb.fileDescriptions().push(...DefaultDb.fileDescriptions());
  return pbdb;
}

/**
 * mergeMessagesInto will copy the source proto message into the destination, or error if the merge cannot be completed.
 */
export function mergeMessagesInto<Desc extends DescMessage>(
  schema: Desc,
  dstPB: MessageShape<Desc>,
  srcPB: Message,
): void {
  if (srcPB.$typeName !== schema.typeName || dstPB.$typeName !== schema.typeName) {
    throw new Error(
      `pb.Merge() arguments must be the same type. got: ${dstPB.$typeName}, ${srcPB.$typeName}`,
    );
  }
  mergeMessages(schema, dstPB, clone(schema, srcPB as MessageShape<Desc>));
}

/**
 * CollectFileDescriptorSet builds a file descriptor set associated with the file where the input message is declared.
 */
export function collectFileDescriptorSet<Desc extends DescMessage>(
  _message: MessageShape<Desc>,
  schema: Desc,
): Map<string, DescFile> {
  const fdMap = new Map<string, DescFile>();
  const parentFile = schema.file;
  fdMap.set(parentFile.proto.name, parentFile);
  const deps = [...parentFile.dependencies];
  for (let i = 0; i < deps.length; i++) {
    const dep = deps[i]!;
    if (fdMap.has(dep.proto.name)) {
      continue;
    }
    fdMap.set(dep.proto.name, dep);
    deps.push(...dep.dependencies);
  }
  return fdMap;
}

/**
 * DefaultDb is used at evaluation time or unless overridden at check time.
 */
export const DefaultDb = (() => {
  const defaultDb = new Db();
  defaultDb.registerDescriptor(AnySchema.file);
  defaultDb.registerDescriptor(DurationSchema.file);
  defaultDb.registerDescriptor(EmptySchema.file);
  defaultDb.registerDescriptor(FieldMaskSchema.file);
  defaultDb.registerDescriptor(TimestampSchema.file);
  defaultDb.registerDescriptor(ValueSchema.file);
  defaultDb.registerDescriptor(BoolValueSchema.file);
  return defaultDb;
})();
