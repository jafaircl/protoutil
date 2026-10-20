import { False, True } from "./bool.js";
import { Err } from "./err.js";
import type { Val } from "./ref/index.js";
import { Unknown } from "./unknown.js";

let primitiveTypes = new Set<string>();
let nullTypeName = "null_type";

/**
 * setUtilTypeMetadata installs shared type metadata after types.ts initializes its singletons.
 */
export function setUtilTypeMetadata(typeNames: string[], nullName: string): void {
  primitiveTypes = new Set(typeNames);
  nullTypeName = nullName;
}

/**
 * IsUnknownOrError returns whether the input element ref.Val is an ErrType or UnknownType.
 */
export function isUnknownOrError(val: Val): boolean {
  return val instanceof Unknown || val instanceof Err;
}

/**
 * IsPrimitiveType returns whether the input element ref.Val is a primitive type.
 */
export function isPrimitiveType(val: Val): boolean {
  return primitiveTypes.has(val.type().typeName());
}

/**
 * Equal returns whether the two ref.Value are heterogeneously equivalent.
 */
export function equal(lhs: Val, rhs: Val): Val {
  const lNull = lhs.type().typeName() === nullTypeName;
  const rNull = rhs.type().typeName() === nullTypeName;
  if (lNull || rNull) {
    return lNull === rNull ? True : False;
  }
  return lhs.equal(rhs);
}
