import type { Type as ExprType } from "../../../gen/cel/expr/checked_pb.js";
import type { Type, Val } from "./reference.js";

/**
 * FieldTester is used to test field presence on an input object.
 */
export type FieldTester = (target: unknown) => boolean;

/**
 * FieldGetter is used to get the field value from an input object, if set.
 */
export type FieldGetter = (target: unknown) => unknown;

/**
 * FieldType represents a field's type value and whether that field supports presence detection.
 */
export class FieldType {
  constructor(
    /** Type of the field as a protobuf type value. */
    public readonly type: ExprType,
    /** IsSet indicates whether the field is set on an input object. */
    public readonly isSet: FieldTester,
    /** GetFrom retrieves the field value on the input object, if set. */
    public readonly getFrom: FieldGetter,
    /** IsJSONField indicates that the field was accessed via its JSON name. */
    public readonly isJSONField = false,
  ) {}
}

/**
 * TypeProvider specifies functions for creating new object instances and for resolving enum values by name.
 *
 * Deprecated: use types.Provider
 */
export interface TypeProvider {
  /** EnumValue returns the numeric value of the given enum value name. */
  enumValue(enumName: string): Val;
  /** FindIdent takes a qualified identifier name and returns a Value if one exists. */
  findIdent(identName: string): Val | undefined;
  /** FindType looks up the Type given a qualified typeName. Returns false if not found. */
  findType(typeName: string): ExprType | undefined;
  /** FindFieldType returns the field type for a checked type value. */
  findFieldType(messageType: string, fieldName: string): FieldType | undefined;
  /** Value creates a new type value from a qualified name and map of field name to value. */
  value(typeName: string, fields: Record<string, Val>): Val;
}

/**
 * TypeAdapter converts native TypeScript values of varying type and complexity to equivalent CEL values.
 *
 * Deprecated: use types.Adapter
 */
export interface TypeAdapter {
  /** NativeToValue converts the input `value` to a CEL `ref.Val`. */
  nativeToValue(value: unknown): Val;
}

/**
 * TypeRegistry allows third-parties to add custom types to CEL.
 *
 * Deprecated: use types.Registry
 */
export interface TypeRegistry extends TypeAdapter, TypeProvider {
  /** RegisterDescriptor registers a protocol buffer file descriptor. */
  registerDescriptor(fileDesc: unknown): void;
  /** RegisterMessage registers a protocol buffer message and its dependencies. */
  registerMessage(message: unknown): void;
  /** RegisterType registers a type value with the provider. */
  registerType(...types: Type[]): void;
}
