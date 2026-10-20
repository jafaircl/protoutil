import type { Registry } from "../common/types/provider.js";
import {
  type NativeFieldDescriptor,
  type NativeObjectDescriptor,
  registry,
} from "../common/types/provider.js";

/**
 * NativeTypesOptions configures native TypeScript object support.
 */
export interface NativeTypesOptions {
  /**
   * registry is the protobuf and CEL type registry to extend.
   *
   * When omitted, a fresh registry is created.
   */
  readonly registry?: Registry;

  /**
   * types contains explicit TypeScript object descriptions.
   *
   * Go reflection discovers this metadata in cel-go. TypeScript erases it, so the equivalent
   * field descriptions are supplied directly.
   */
  readonly types: readonly NativeObjectDescriptor[];

  /**
   * version sets the native types extension version.
   *
   * Version zero and the current version expose the same API, matching cel-go.
   */
  readonly version?: number;
}

/**
 * NativeTypeOptions describes one TypeScript object type exposed to CEL.
 */
export interface NativeTypeOptions {
  /** fields contains the supported public fields. */
  readonly fields: readonly NativeFieldDescriptor[];
  /** typeName is the fully qualified CEL object type name. */
  readonly typeName: string;
}

/**
 * NativeFieldOptions describes one TypeScript property exposed to CEL.
 */
export interface NativeFieldOptions extends NativeFieldDescriptor {}

/**
 * nativeType creates an explicit TypeScript object descriptor.
 */
export function nativeType(options: NativeTypeOptions): NativeObjectDescriptor {
  return {
    fields: [...options.fields],
    typeName: options.typeName,
  };
}

/**
 * nativeField creates a TypeScript property descriptor for a CEL object field.
 */
export function nativeField(options: NativeFieldOptions): NativeFieldDescriptor {
  return { ...options };
}

/**
 * nativeTypes creates a registry which adapts explicitly described TypeScript object types.
 *
 * Only exported fields represented in the descriptors are visible to CEL. Native values supplied
 * as activation inputs identify their registered type with a `$celTypeName` string property.
 */
export function nativeTypes(options: NativeTypesOptions): Registry {
  const typeRegistry = options.registry ?? registry();
  if (
    options.version !== undefined &&
    (!Number.isInteger(options.version) || options.version < 0)
  ) {
    throw new Error(`invalid native types version: ${String(options.version)}`);
  }
  typeRegistry.registerNativeTypes(...options.types);
  return typeRegistry;
}
