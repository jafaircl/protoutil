import { AnySchema, BytesValueSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { anyValueType } from "./any-value.js";
import { Bool } from "./bool.js";
import { err, maybeNoSuchOverloadErr } from "./err.js";
import { Int, IntNegOne, IntOne, IntZero } from "./int.js";
import { nativeTypeName, packAnyBytes } from "./native.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import type { Adder, Comparer, Sizer } from "./traits/index.js";
import { BytesType, StringType, TypeType } from "./types.js";

/**
 * Bytes supports add, compare, and size operations.
 */
export class Bytes implements Val, Adder, Comparer, Sizer {
  constructor(private readonly inner: Uint8Array) {}

  /** Add concatenates byte sequences. */
  public add(other: Val): Val {
    if (!(other instanceof Bytes)) {
      return maybeNoSuchOverloadErr(other);
    }
    const out = new Uint8Array(this.inner.length + other.inner.length);
    out.set(this.inner);
    out.set(other.inner, this.inner.length);
    return new Bytes(out);
  }

  /** Compare provides lexicographic ordering. */
  public compare(other: Val): Val {
    if (!(other instanceof Bytes)) {
      return maybeNoSuchOverloadErr(other);
    }
    const min = Math.min(this.inner.length, other.inner.length);
    for (let i = 0; i < min; i++) {
      if (this.inner[i] !== other.inner[i]) {
        return this.inner[i]! < other.inner[i]! ? IntNegOne : IntOne;
      }
    }
    if (this.inner.length === other.inner.length) {
      return IntZero;
    }
    return this.inner.length < other.inner.length ? IntNegOne : IntOne;
  }
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === Uint8Array || typeDesc === undefined) {
      return new Uint8Array(this.inner);
    }
    if (typeDesc === anyValueType || typeDesc === AnySchema) {
      return packAnyBytes(BytesValueSchema, this.value());
    }
    if (typeDesc === BytesValueSchema) {
      return { $typeName: BytesValueSchema.typeName, value: this.value() };
    }
    if (typeDesc === ValueSchema) {
      return {
        $typeName: ValueSchema.typeName,
        kind: { case: "stringValue", value: globalThis.btoa(String.fromCharCode(...this.inner)) },
      };
    }
    throw new globalThis.Error(
      `type conversion error from ${BytesType} to '${nativeTypeName(typeDesc)}'`,
    );
  }
  public convertToType(typeValue: RefType): Val {
    switch (typeValue) {
      case StringType:
        try {
          return new CelString(new TextDecoder("utf-8", { fatal: true }).decode(this.inner));
        } catch {
          return err("invalid UTF-8 in bytes, cannot convert to string");
        }
      case BytesType:
        return this;
      case TypeType:
        return BytesType;
      default:
        return err(`type conversion error from '${BytesType}' to '${typeValue.typeName()}'`);
    }
  }
  public equal(other: Val): Val {
    if (!(other instanceof Bytes) || this.inner.length !== other.inner.length) {
      return new Bool(false);
    }
    return new Bool(this.inner.every((value, index) => value === other.inner[index]));
  }

  /** IsZeroValue returns true if the byte array is empty. */
  public isZeroValue(): boolean {
    return this.inner.length === 0;
  }
  public size(): Val {
    return new Int(BigInt(this.inner.length));
  }
  public type(): RefType {
    return BytesType;
  }
  public value(): Uint8Array {
    return new Uint8Array(this.inner);
  }
}
