import type { DescEnum, DescEnumValue } from "@bufbuild/protobuf";
import { Bool } from "../bool.js";
import { err } from "../err.js";
import { Int } from "../int.js";
import type { Type as RefType, Val } from "../ref/index.js";
import { String as CelString } from "../string.js";
import { IntType, objectType, StringType, TypeType } from "../types.js";

/**
 * EnumValueDescription maps a fully-qualified enum value name to its numeric value.
 */
export class EnumValueDescription {
  constructor(
    private readonly enumValueName: string,
    private readonly desc: DescEnumValue,
  ) {}

  /** Name returns the fully-qualified identifier name for the enum value. */
  public name(): string {
    return this.enumValueName;
  }

  /** Value returns the (numeric) value of the enum. */
  public value(): number {
    return this.desc.number;
  }

  /** Descriptor returns the protobuf enum value descriptor. */
  public descriptor(): DescEnumValue {
    return this.desc;
  }
}

/**
 * ProtoEnum represents a strongly typed protobuf enum value.
 */
export class ProtoEnum implements Val {
  private readonly enumTypeValue: RefType;

  constructor(
    private readonly enumDescValue: DescEnum,
    private readonly numberValue: bigint,
  ) {
    this.enumTypeValue = objectType(enumDescValue.typeName);
  }

  /** convertToNative converts the enum number to a protobuf-compatible numeric value. */
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === Number) {
      const number = Number(this.numberValue);
      if (
        !Number.isSafeInteger(number) ||
        this.numberValue < -2_147_483_648n ||
        this.numberValue > 2_147_483_647n
      ) {
        throw new Error(`enum value out of range: ${this.numberValue}`);
      }
      return number;
    }
    if (typeDesc === BigInt || typeDesc === undefined) {
      return this.numberValue;
    }
    throw new Error(`unsupported enum conversion to ${String(typeDesc)}`);
  }

  /** convertToType converts an enum to int, string, its declared type, or type metadata. */
  public convertToType(typeValue: RefType): Val {
    if (typeValue === IntType) {
      return new Int(this.numberValue);
    }
    if (typeValue === StringType) {
      const named = this.enumDescValue.values.find(
        (candidate) => BigInt(candidate.number) === this.numberValue,
      );
      return new CelString(named?.name ?? this.numberValue.toString());
    }
    if (typeValue === TypeType) {
      return this.enumTypeValue as unknown as Val;
    }
    if (typeValue.typeName() === this.enumTypeValue.typeName()) {
      return this;
    }
    return err(
      "type conversion error from '%s' to '%s'",
      this.enumTypeValue.typeName(),
      typeValue.typeName(),
    );
  }

  /** equal reports equality only for values of the same declared enum type and number. */
  public equal(other: Val): Val {
    return new Bool(
      other instanceof ProtoEnum &&
        other.enumDescValue.typeName === this.enumDescValue.typeName &&
        other.numberValue === this.numberValue,
    );
  }

  /** enumDescriptor returns the protobuf descriptor for the declared enum type. */
  public enumDescriptor(): DescEnum {
    return this.enumDescValue;
  }

  /** type returns the strongly typed protobuf enum type. */
  public type(): RefType {
    return this.enumTypeValue;
  }

  /** value returns the signed enum number. */
  public value(): bigint {
    return this.numberValue;
  }
}
