import { create, type Message, type MessageShape, ScalarType } from "@bufbuild/protobuf";
import { AnySchema, anyPack, StructSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { anyValueType } from "./any-value.js";
import { Bool, False, True } from "./bool.js";
import { err, valOrErr } from "./err.js";
import { formatVal } from "./format.js";
import { Int } from "./int.js";
import { BaseIterator } from "./iterator.js";
import { JSONStructType, JSONValueType } from "./json-value.js";
import type { FieldDescription } from "./pb/type.js";
import type { Type as RefType, TypeAdapter, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import type { Folder, Mapper, MutableMapper, Iterator as TraitIterator } from "./traits/index.js";
import { MapType, TypeType } from "./types.js";
import { Uint } from "./uint.js";
import { equal } from "./util.js";

/**
 * dynamicMap returns a traits.Mapper value with dynamic key, value pairs.
 */
export function dynamicMap(adapter: TypeAdapter, value: unknown): Mapper {
  if (isProtoStruct(value)) {
    return new BaseMap(adapter, value, Object.keys(value.fields ?? {}), (key) => {
      const stringKey = key instanceof CelString ? key.value() : String(key.value());
      return value.fields[stringKey];
    });
  }
  if (isRecord(value)) {
    const keys = Object.keys(value);
    return new BaseMap(adapter, value, keys, (key) => {
      const stringKey = normalizeRecordKey(key);
      return value[stringKey];
    });
  }
  if (value instanceof Map) {
    const keys = [...value.keys()];
    return new BaseMap(adapter, value, keys, (key) => {
      const normalized = key.value();
      for (const mapKey of keys) {
        if (normalized === mapKey) {
          return value.get(mapKey);
        }
      }
      return undefined;
    });
  }
  return new BaseMap(adapter, value, [], () => undefined);
}

/**
 * jsonStructMap creates a mapper backed by a protobuf Struct.
 */
export function jsonStructMap(
  adapter: TypeAdapter,
  value: MessageShape<typeof StructSchema>,
): Mapper {
  return new BaseMap(
    adapter,
    value,
    Object.keys(value.fields),
    (key) => value.fields[normalizeRecordKey(key)],
  );
}

/**
 * refValMap returns a specialized mapper with CEL keys and values.
 */
export function refValMap(
  adapter: TypeAdapter,
  value: Map<Val, Val> | Record<string, Val>,
): Mapper {
  if (value instanceof Map) {
    const keys = [...value.keys()];
    return new BaseMap(adapter, value, keys, (key) => {
      for (const candidate of keys) {
        if ((equal(candidate, key) as Bool).value()) {
          return value.get(candidate);
        }
      }
      return undefined;
    });
  }
  return new BaseMap(
    adapter,
    value,
    Object.keys(value),
    (key) => value[normalizeRecordKey(key)] as Val,
  );
}

/**
 * stringInterfaceMap returns a specialized mapper with string keys and interface values.
 */
export function stringInterfaceMap(adapter: TypeAdapter, value: Record<string, unknown>): Mapper {
  return new BaseMap(adapter, value, Object.keys(value), (key) => value[normalizeRecordKey(key)]);
}

/**
 * stringStringMap returns a specialized mapper with string keys and values.
 */
export function stringStringMap(adapter: TypeAdapter, value: Record<string, string>): Mapper {
  return new BaseMap(adapter, value, Object.keys(value), (key) => value[normalizeRecordKey(key)]);
}

/**
 * protoMap returns a mapper for protobuf map values described by FieldDescription metadata.
 */
export function protoMap(
  adapter: TypeAdapter,
  value: Record<string, unknown>,
  keyType?: FieldDescription,
  valueType?: FieldDescription,
): Mapper {
  return new ProtoMap(adapter, value, keyType, valueType);
}

/**
 * mutableMap constructs a mutable map from an adapter and a set of values.
 */
export function mutableMap(
  adapter: TypeAdapter,
  mutableValues: Map<Val, Val> = new Map(),
): MutableMapper {
  return new MutableMap(adapter, new Map(mutableValues));
}

/**
 * InsertMapKeyValueOptions describes a map insertion operation.
 */
export interface InsertMapKeyValueOptions {
  /** map contains the mutable or immutable map receiving the entry. */
  map: Mapper;

  /** key contains the CEL map key to insert. */
  key: Val;

  /** value contains the CEL map value to insert. */
  value: Val;
}

/**
 * insertMapKeyValue inserts a key-value pair, preserving mutable inputs and copying immutable maps.
 */
export function insertMapKeyValue(options: InsertMapKeyValueOptions): Val {
  if (typeof (options.map as { insert?: unknown }).insert === "function") {
    return (options.map as MutableMapper).insert(options.key, options.value);
  }
  if (options.map.find(options.key)[1]) {
    return err("insert failed: key %s already exists", formatVal(options.key));
  }

  const entries = new Map<Val, Val>();
  const iterator = options.map.iterator();
  while (iterator.hasNext() === True) {
    const key = iterator.next();
    entries.set(key, options.map.get(key));
  }
  entries.set(options.key, options.value);
  return refValMap(DefaultMapAdapter, entries);
}

/**
 * BaseMap is a generic immutable map implementation.
 */
export class BaseMap implements Mapper {
  constructor(
    protected readonly adapter: TypeAdapter,
    protected readonly mapValue: unknown,
    protected readonly keys: unknown[],
    protected readonly valueFor: (key: Val) => unknown,
  ) {}

  public contains(index: Val): Val {
    const [, found] = this.find(index);
    return found ? True : False;
  }

  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === undefined) {
      return this.mapValue;
    }
    if (typeDesc === anyValueType || typeDesc === AnySchema) {
      const json = this.convertToNative(JSONStructType);
      return anyPack(StructSchema, json as MessageShape<typeof StructSchema>);
    }
    if (typeDesc === JSONValueType || typeDesc === ValueSchema) {
      const json = this.convertToNative(JSONStructType);
      return create(ValueSchema, {
        kind: { case: "structValue", value: json as MessageShape<typeof StructSchema> },
      });
    }
    if (typeDesc === JSONStructType || typeDesc === StructSchema) {
      // A protobuf Struct already has the requested native representation.
      if (isProtoStruct(this.mapValue)) {
        return this.mapValue;
      }
      const fields: Record<string, MessageShape<typeof ValueSchema>> = {};
      for (const rawKey of this.keys) {
        const key = this.adapter
          .nativeToValue(rawKey)
          .convertToType(new CelString("").type()) as CelString;
        fields[key.value()] = this.get(key).convertToNative(ValueSchema) as MessageShape<
          typeof ValueSchema
        >;
      }
      return create(StructSchema, { fields });
    }
    if (Array.isArray(typeDesc)) {
      throw new Error(`unsupported native conversion from '${MapType}' to an array`);
    }
    return Object.fromEntries(
      this.keys.map((rawKey) => {
        const key = this.adapter
          .nativeToValue(rawKey)
          .convertToType(new CelString("").type()) as CelString;
        return [key.value(), this.get(key).value()];
      }),
    );
  }

  public convertToType(typeVal: RefType): Val {
    switch (typeVal) {
      case MapType:
        return this;
      case TypeType:
        return MapType;
      default:
        return err("type conversion error from '%s' to '%s'", MapType, typeVal);
    }
  }

  public equal(other: Val): Val {
    if (!isMapper(other)) {
      return False;
    }
    if ((this.size() as Int).value() !== (other.size() as Int).value()) {
      return False;
    }
    for (const rawKey of this.keys) {
      const key = this.adapter.nativeToValue(rawKey);
      const [otherVal, found] = other.find(key);
      if (!found) {
        return False;
      }
      const [thisVal] = this.find(key);
      const valuesEqual =
        thisVal !== undefined &&
        otherVal !== undefined &&
        (() => {
          const result = equal(thisVal, otherVal);
          return result instanceof Bool && result.value();
        })();
      if (!valuesEqual) {
        return False;
      }
    }
    return True;
  }

  public find(key: Val): [Val | undefined, boolean] {
    const raw = this.valueFor(key);
    return raw === undefined ? [undefined, false] : [this.adapter.nativeToValue(raw), true];
  }

  public get(key: Val): Val {
    const [value, found] = this.find(key);
    if (!found || !value) {
      return valOrErr(value, "no such key: %v", key);
    }
    return value;
  }

  public isZeroValue(): boolean {
    return this.keys.length === 0;
  }

  public iterator(): TraitIterator {
    return new MapIterator(this.adapter, this.keys);
  }

  public size(): Val {
    return new Int(BigInt(this.keys.length));
  }

  public type(): RefType {
    return MapType;
  }

  public value(): unknown {
    return this.mapValue;
  }

  public fold(folder: Folder): void {
    for (const rawKey of this.keys) {
      const key = this.adapter.nativeToValue(rawKey);
      const [value] = this.find(key);
      if (!folder.foldEntry(rawKey, value?.value())) {
        break;
      }
    }
  }

  public toString(): string {
    const sb: string[] = [];
    this.format(sb);
    return sb.join("");
  }

  public format(sb: string[]): void {
    sb.push("{");
    this.keys.forEach((rawKey, index) => {
      if (index > 0) {
        sb.push(", ");
      }
      const key = this.adapter.nativeToValue(rawKey);
      sb.push(formatVal(key), ": ", formatVal(this.get(key)));
    });
    sb.push("}");
  }
}

/** DefaultMapAdapter preserves CEL values while copying an immutable mapper. */
const DefaultMapAdapter: TypeAdapter = {
  nativeToValue(value: unknown): Val {
    return value as Val;
  },
};

/**
 * ProtoMap adapts protobuf map fields and unwraps message-backed entries when needed.
 */
class ProtoMap extends BaseMap implements Mapper {
  constructor(
    adapter: TypeAdapter,
    value: Record<string, unknown>,
    keyType?: FieldDescription,
    private readonly valType?: FieldDescription,
  ) {
    super(
      adapter,
      value,
      Object.keys(value).map((key) => protoMapKey(key, keyType)),
      (key) => value[normalizeRecordKey(key)],
    );
  }

  public override find(key: Val): [Val | undefined, boolean] {
    const raw = this.valueFor(key);
    if (raw === undefined) {
      return [undefined, false];
    }
    if (this.valType?.isMessage() && isRecord(raw)) {
      const [unwrapped, , err] = this.valType.maybeUnwrapDynamic(raw as Message);
      if (!err) {
        return [this.adapter.nativeToValue(unwrapped), true];
      }
    }
    return [this.adapter.nativeToValue(raw), true];
  }
}

/** protoMapKey restores the protobuf scalar type erased by JavaScript record keys. */
function protoMapKey(key: string, keyType?: FieldDescription): unknown {
  const descriptor = keyType?.descriptor();
  if (!descriptor || descriptor.kind !== "field" || descriptor.fieldKind !== "scalar") {
    return key;
  }
  switch (descriptor.scalar) {
    case ScalarType.BOOL:
      return key === "true";
    case ScalarType.INT32:
    case ScalarType.INT64:
    case ScalarType.SINT32:
    case ScalarType.SINT64:
    case ScalarType.SFIXED32:
    case ScalarType.SFIXED64:
      return BigInt(key);
    case ScalarType.UINT32:
    case ScalarType.UINT64:
    case ScalarType.FIXED32:
    case ScalarType.FIXED64:
      return new Uint(BigInt(key));
    default:
      return key;
  }
}

/**
 * MutableMap is an intermediate mutable map used while constructing immutable CEL maps.
 */
class MutableMap extends BaseMap implements MutableMapper {
  constructor(
    adapter: TypeAdapter,
    private readonly mutableValues: Map<Val, Val>,
  ) {
    super(adapter, mutableValues, [...mutableValues.keys()], (key) => {
      for (const [mapKey, mapVal] of mutableValues) {
        if ((equal(mapKey, key) as Bool).value()) {
          return mapVal;
        }
      }
      return undefined;
    });
  }

  public insert(k: Val, v: Val): Val {
    const [, found] = this.find(k);
    if (found) {
      return err("insert failed: key %v already exists", k);
    }
    this.mutableValues.set(k, v);
    this.keys.push(k);
    return this;
  }

  public toImmutableMap(): Mapper {
    return refValMap(this.adapter, this.mutableValues);
  }
}

/**
 * MapIterator traverses the keys of a map in the map's stable iteration order.
 */
class MapIterator extends BaseIterator implements TraitIterator {
  private index = 0;

  constructor(
    private readonly adapter: TypeAdapter,
    private readonly keys: unknown[],
  ) {
    super();
  }

  public hasNext(): Val {
    return this.index < this.keys.length ? True : False;
  }

  public next(): Val {
    return this.adapter.nativeToValue(this.keys[this.index++]!);
  }
}

function normalizeRecordKey(key: Val): string {
  if (key instanceof CelString) {
    return key.value();
  }
  return String(key.value());
}

function isProtoStruct(value: unknown): value is MessageShape<typeof StructSchema> {
  return isMessage(value) && value.$typeName === StructSchema.typeName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isMessage(value);
}

function isMapper(value: Val): value is Mapper {
  return (
    typeof (value as { find?: unknown }).find === "function" &&
    typeof (value as { size?: unknown }).size === "function" &&
    typeof (value as { iterator?: unknown }).iterator === "function"
  );
}

function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null && "$typeName" in value;
}
