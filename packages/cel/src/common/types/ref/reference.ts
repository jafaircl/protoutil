/**
 * NativeTypeDescriptor represents a caller-defined native type description for CEL conversions.
 *
 * TypeScript has no runtime equivalent to Go's `reflect.Type`, so the descriptor is intentionally
 * opaque until the broader native-conversion seam is ported.
 */
export type NativeTypeDescriptor = unknown;

/**
 * Type indicates the name of a given type.
 */
export interface Type {
  /**
   * HasTrait returns whether the type has a given trait associated with it.
   *
   * See common/types/traits/traits.go for a list of supported traits.
   */
  hasTrait(trait: number): boolean;

  /**
   * TypeName returns the qualified type name of the type.
   *
   * The type name is also used as the type's identifier name at type-check and interpretation time.
   */
  typeName(): string;
}

/**
 * Val defines the functions supported by all expression values.
 *
 * Val implementations may specialize the behavior of the value through the addition of traits.
 */
export interface Val {
  /**
   * ConvertToNative converts the Value to a native TypeScript value according to the provided type
   * description, or throws if the conversion is not feasible.
   */
  convertToNative(typeDesc: NativeTypeDescriptor): unknown;

  /**
   * ConvertToType supports type conversions between CEL value types supported by the expression language.
   */
  convertToType(typeValue: Type): Val;

  /**
   * Equal returns true if the `other` value has the same type and content as the implementing value.
   */
  equal(other: Val): Val;

  /**
   * Type returns the TypeValue of the value.
   */
  type(): Type;

  /**
   * Value returns the raw value of the instance which may not be directly compatible with the expression
   * language types.
   */
  value(): unknown;
}
