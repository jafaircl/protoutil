import { create, type Message, type MessageShape } from "@bufbuild/protobuf";
import { AnySchema, anyPack, ListValueSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { anyValueType } from "./any-value.js";
import { Bool, False, True } from "./bool.js";
import { Double } from "./double.js";
import { err, maybeNoSuchOverloadErr, valOrErr } from "./err.js";
import { formatVal } from "./format.js";
import { Int } from "./int.js";
import { BaseIterator } from "./iterator.js";
import { JSONListType, JSONValueType } from "./json-value.js";
import type { Type as RefType, TypeAdapter, Val } from "./ref/index.js";
import type { Folder, Lister, MutableLister, Iterator as TraitIterator } from "./traits/index.js";
import { ListType, TypeType } from "./types.js";
import { Uint } from "./uint.js";
import { equal } from "./util.js";

/**
 * dynamicList returns a list with heterogenous elements.
 */
export function dynamicList(adapter: TypeAdapter, value: unknown): Lister {
  if (Array.isArray(value)) {
    return new BaseList(adapter, value, value.length, (index) => value[index]);
  }
  if (isMessage(value) && value.$typeName === ListValueSchema.typeName) {
    const listValue = value as MessageShape<typeof ListValueSchema>;
    return new BaseList(
      adapter,
      value,
      listValue.values.length,
      (index) => listValue.values[index],
    );
  }
  return new BaseList(adapter, value, 0, () => undefined);
}

/**
 * stringList returns a list containing only strings.
 */
export function stringList(adapter: TypeAdapter, elems: string[]): Lister {
  return new BaseList(adapter, elems, elems.length, (index) => elems[index]);
}

/**
 * refValList returns a list with CEL ref.Val elements.
 */
export function refValList(adapter: TypeAdapter, elems: Val[]): Lister {
  return new BaseList(adapter, elems, elems.length, (index) => elems[index]);
}

/**
 * jsonListValue returns a list backed by protobuf ListValue.
 */
export function jsonListValue(
  adapter: TypeAdapter,
  list: MessageShape<typeof ListValueSchema>,
): Lister {
  return new BaseList(adapter, list, list.values.length, (index) => list.values[index]);
}

/**
 * mutableList creates a mutable list whose internal state can be modified.
 */
export function mutableList(adapter: TypeAdapter): MutableLister {
  return new MutableList(adapter);
}

/**
 * BaseList is an immutable list implementation used across CEL runtime values.
 */
export class BaseList implements Lister {
  constructor(
    protected readonly adapter: TypeAdapter,
    protected readonly listValue: unknown,
    protected sizeValue: number,
    protected readonly getter: (index: number) => unknown,
  ) {}

  public add(other: Val): Val {
    if (!(other instanceof BaseList) && !isLister(other)) {
      return maybeNoSuchOverloadErr(other);
    }
    const otherList = other as Lister;
    if ((otherList.size() as Int).value() === 0n) {
      return this;
    }
    if (this.sizeValue === 0) {
      return otherList;
    }
    return new ConcatList(this.adapter, this, otherList);
  }

  public contains(elem: Val): Val {
    for (let index = 0; index < this.sizeValue; index += 1) {
      // Route through get() so lazily concatenated lists resolve the element from their segments.
      const cmp = equal(elem, this.get(new Int(BigInt(index))));
      if (cmp instanceof Bool && cmp.value()) {
        return True;
      }
    }
    return False;
  }

  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === undefined) {
      return this.listValue;
    }
    if (typeDesc === anyValueType || typeDesc === AnySchema) {
      const json = this.convertToNative(JSONListType);
      return anyPack(ListValueSchema, json as MessageShape<typeof ListValueSchema>);
    }
    if (typeDesc === JSONValueType || typeDesc === ValueSchema) {
      const json = this.convertToNative(JSONListType);
      return create(ValueSchema, {
        kind: { case: "listValue", value: json as MessageShape<typeof ListValueSchema> },
      });
    }
    if (typeDesc === JSONListType || typeDesc === ListValueSchema) {
      if (isMessage(this.listValue) && this.listValue.$typeName === ListValueSchema.typeName) {
        return this.listValue;
      }
      const values = [];
      for (let index = 0; index < this.sizeValue; index += 1) {
        values.push(this.adapter.nativeToValue(this.getter(index)).convertToNative(ValueSchema));
      }
      return create(ListValueSchema, { values: values as MessageShape<typeof ValueSchema>[] });
    }
    if (Array.isArray(typeDesc)) {
      return this.toNativeArray();
    }
    throw new Error(`unsupported native conversion from '${ListType}' to '${String(typeDesc)}'`);
  }

  public convertToType(typeVal: RefType): Val {
    switch (typeVal) {
      case ListType:
        return this;
      case TypeType:
        return ListType;
      default:
        return err("type conversion error from '%s' to '%s'", ListType, typeVal);
    }
  }

  public equal(other: Val): Val {
    if (!(other instanceof BaseList) && !isLister(other)) {
      return False;
    }
    const otherList = other as Lister;
    if ((this.size() as Int).value() !== (otherList.size() as Int).value()) {
      return False;
    }
    for (let index = 0; index < this.sizeValue; index += 1) {
      const thisElem = this.get(new Int(BigInt(index)));
      const otherElem = otherList.get(new Int(BigInt(index)));
      const elemEq = equal(thisElem, otherElem);
      if (!(elemEq instanceof Bool) || !elemEq.value()) {
        return False;
      }
    }
    return True;
  }

  public get(index: Val): Val {
    const ind = indexOrError(index);
    if (ind instanceof Error) {
      return valOrErr(index, "%v", ind.message);
    }
    if (ind < 0 || ind >= this.sizeValue) {
      return err("index '%d' out of range in list size '%d'", ind, this.size());
    }
    return this.adapter.nativeToValue(this.getter(ind));
  }

  public isZeroValue(): boolean {
    return this.sizeValue === 0;
  }

  public fold(folder: Folder): void {
    for (let index = 0; index < this.sizeValue; index += 1) {
      if (!folder.foldEntry(index, this.getter(index))) {
        break;
      }
    }
  }

  public iterator(): TraitIterator {
    return new ListIterator(this.adapter, this);
  }

  public size(): Val {
    return new Int(BigInt(this.sizeValue));
  }

  public type(): RefType {
    return ListType;
  }

  public value(): unknown {
    return this.listValue;
  }

  public toString(): string {
    const parts: string[] = [];
    this.format(parts);
    return parts.join("");
  }

  public format(sb: string[]): void {
    sb.push("[");
    for (let index = 0; index < this.sizeValue; index += 1) {
      if (index > 0) {
        sb.push(", ");
      }
      sb.push(formatVal(this.adapter.nativeToValue(this.getter(index))));
    }
    sb.push("]");
  }

  protected toNativeArray(): unknown[] {
    const out: unknown[] = [];
    for (let index = 0; index < this.sizeValue; index += 1) {
      out.push(this.adapter.nativeToValue(this.getter(index)).value());
    }
    return out;
  }
}

/**
 * MutableList is an intermediate mutable list used while constructing immutable CEL lists.
 */
class MutableList extends BaseList implements MutableLister {
  private mutableValues: Val[] = [];

  constructor(adapter: TypeAdapter) {
    super(adapter, [], 0, (index) => this.mutableValues[index]);
  }

  public override add(other: Val): Val {
    if (other instanceof MutableList) {
      this.mutableValues.push(...other.mutableValues);
      this.sizeValue = this.mutableValues.length;
      return this;
    }
    if (!isLister(other)) {
      return maybeNoSuchOverloadErr(other);
    }
    const otherList = other as Lister;
    for (let index = 0n; index < (otherList.size() as Int).value(); index += 1n) {
      this.mutableValues.push(otherList.get(new Int(index)));
    }
    this.sizeValue = this.mutableValues.length;
    return this;
  }

  public toImmutableList(): Lister {
    return refValList(this.adapter, this.mutableValues);
  }
}

/**
 * ConcatList lazily concatenates two immutable lists without copying their contents.
 */
class ConcatList extends BaseList implements Lister {
  private cachedSize?: Val;
  private cachedValue?: unknown[];

  constructor(
    adapter: TypeAdapter,
    private readonly prevList: Lister,
    private readonly nextList: Lister,
  ) {
    super(
      adapter,
      undefined,
      Number((prevList.size() as Int).value() + (nextList.size() as Int).value()),
      () => undefined,
    );
  }

  public override get(index: Val): Val {
    const ind = indexOrError(index);
    if (ind instanceof Error) {
      return valOrErr(index, "%v", ind.message);
    }
    const prevSize = Number((this.prevList.size() as Int).value());
    if (ind < prevSize) {
      return this.prevList.get(new Int(BigInt(ind)));
    }
    return this.nextList.get(new Int(BigInt(ind - prevSize)));
  }

  public override size(): Val {
    if (!this.cachedSize) {
      this.cachedSize = new Int(
        (this.prevList.size() as Int).value() + (this.nextList.size() as Int).value(),
      );
    }
    return this.cachedSize;
  }

  public override iterator(): TraitIterator {
    return new ListIterator(this.adapter, this);
  }

  public override convertToNative(typeDesc?: unknown): unknown {
    return dynamicList(this.adapter, this.value()).convertToNative(typeDesc);
  }

  public override fold(folder: Folder): void {
    const total = Number((this.size() as Int).value());
    for (let index = 0; index < total; index += 1) {
      if (!folder.foldEntry(index, this.get(new Int(BigInt(index))))) {
        break;
      }
    }
  }

  public override format(sb: string[]): void {
    sb.push("[");
    const total = Number((this.size() as Int).value());
    for (let index = 0; index < total; index += 1) {
      if (index > 0) {
        sb.push(", ");
      }
      sb.push(formatVal(this.get(new Int(BigInt(index)))));
    }
    sb.push("]");
  }

  public override value(): unknown {
    if (!this.cachedValue) {
      const merged: unknown[] = [];
      const prevSize = Number((this.prevList.size() as Int).value());
      for (let index = 0; index < prevSize; index += 1) {
        merged.push(this.prevList.get(new Int(BigInt(index))).value());
      }
      const nextSize = Number((this.nextList.size() as Int).value());
      for (let index = 0; index < nextSize; index += 1) {
        merged.push(this.nextList.get(new Int(BigInt(index))).value());
      }
      this.cachedValue = merged;
    }
    return this.cachedValue;
  }
}

/**
 * ListIterator traverses the contents of a list in index order.
 */
class ListIterator extends BaseIterator implements TraitIterator {
  private cursor = 0;
  private readonly total: number;

  constructor(
    _adapter: TypeAdapter,
    private readonly list: Lister,
  ) {
    super();
    this.total = Number((list.size() as Int).value());
  }

  public hasNext(): Val {
    return this.cursor < this.total ? True : False;
  }

  public next(): Val {
    const current = this.list.get(new Int(BigInt(this.cursor)));
    this.cursor += 1;
    return current;
  }
}

function indexOrError(index: Val): number | Error {
  if (index instanceof Int) {
    return Number(index.value());
  }
  if (index instanceof Double) {
    const doubleValue = index.value();
    if (Number.isInteger(doubleValue) && Number.isSafeInteger(doubleValue)) {
      return doubleValue;
    }
    return new Error(`unsupported index value ${doubleValue} in list`);
  }
  if (index instanceof Uint) {
    const uintValue = index.value();
    if (uintValue <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(uintValue);
    }
    return new Error(`unsupported index value ${uintValue} in list`);
  }
  return new Error(`unsupported index type '${index.type()}' in list`);
}

function isLister(value: Val): value is Lister {
  return (
    typeof (value as { size?: unknown }).size === "function" &&
    typeof (value as { get?: unknown }).get === "function" &&
    typeof (value as { iterator?: unknown }).iterator === "function"
  );
}

function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null && "$typeName" in value;
}
