import { AnyType, DynType, ErrorType, NullType } from "../common/types/index.js";
import { Kind, Type } from "../common/types/types.js";
import type { mapping } from "./mapping.js";

/**
 * isDyn reports whether the type behaves as dynamic during checking.
 */
export function isDyn(type: Type): boolean {
  switch (type.kind()) {
    case Kind.Dyn:
    case Kind.Any:
      return true;
    default:
      return false;
  }
}

/**
 * isDynOrError reports whether the type is dynamic or erroneous.
 */
export function isDynOrError(type: Type): boolean {
  return isError(type) || isDyn(type);
}

/**
 * isError reports whether the type is the checker error type.
 */
export function isError(type: Type): boolean {
  return type.kind() === Kind.Error;
}

/**
 * isOptional reports whether the type is CEL's abstract optional type.
 */
export function isOptional(type: Type): boolean {
  return type.kind() === Kind.Opaque && type.typeName() === "optional_type";
}

/**
 * maybeUnwrapOptional unwraps optional types for field and index resolution.
 */
export function maybeUnwrapOptional(type: Type): [Type, boolean] {
  if (isOptional(type)) {
    return [type.parameters()[0]!, true];
  }
  return [type, false];
}

/**
 * isEqualOrLessSpecific checks whether one type is equal or less specific than another.
 */
export function isEqualOrLessSpecific(left: Type, right: Type): boolean {
  const leftKind = left.kind();
  const rightKind = right.kind();
  if (isDyn(left) || leftKind === Kind.TypeParam) {
    return true;
  }
  if (isDyn(right) || rightKind === Kind.TypeParam) {
    return false;
  }
  if (leftKind !== rightKind) {
    return false;
  }
  switch (leftKind) {
    case Kind.Opaque:
      if (
        left.typeName() !== right.typeName() ||
        left.parameters().length !== right.parameters().length
      ) {
        return false;
      }
      for (const [index, parameter] of left.parameters().entries()) {
        if (!isEqualOrLessSpecific(parameter, right.parameters()[index]!)) {
          return false;
        }
      }
      return true;
    case Kind.List:
      return isEqualOrLessSpecific(left.parameters()[0]!, right.parameters()[0]!);
    case Kind.Map:
      return (
        isEqualOrLessSpecific(left.parameters()[0]!, right.parameters()[0]!) &&
        isEqualOrLessSpecific(left.parameters()[1]!, right.parameters()[1]!)
      );
    case Kind.Type:
      return true;
    default:
      return left.isExactType(right);
  }
}

/**
 * substitute replaces all direct and indirect occurrences of bound type parameters.
 */
export function substitute(mappings: mapping, type: Type, typeParamToDyn: boolean): Type {
  const [substitution, found] = mappings.find(type);
  if (found && substitution) {
    return substitute(mappings, substitution, typeParamToDyn);
  }
  const kind = type.kind();
  if (typeParamToDyn && kind === Kind.TypeParam) {
    return DynType;
  }
  switch (kind) {
    case Kind.Opaque:
      return new Type(
        Kind.Opaque,
        substituteParams(mappings, type.parameters(), typeParamToDyn),
        type.typeName(),
        undefined,
        undefined,
        type.traitMask(),
      );
    case Kind.List:
      return new Type(
        Kind.List,
        [substitute(mappings, type.parameters()[0]!, typeParamToDyn)],
        type.typeName(),
        undefined,
        undefined,
        type.traitMask(),
      );
    case Kind.Map:
      return new Type(
        Kind.Map,
        [
          substitute(mappings, type.parameters()[0]!, typeParamToDyn),
          substitute(mappings, type.parameters()[1]!, typeParamToDyn),
        ],
        type.typeName(),
        undefined,
        undefined,
        type.traitMask(),
      );
    case Kind.Type:
      if (type.parameters().length !== 0) {
        return new Type(
          Kind.Type,
          [substitute(mappings, type.parameters()[0]!, typeParamToDyn)],
          type.typeName(),
          undefined,
          undefined,
          type.traitMask(),
        );
      }
      return type;
    default:
      return type;
  }
}

function substituteParams(mappings: mapping, parameters: Type[], typeParamToDyn: boolean): Type[] {
  return parameters.map((parameter) => substitute(mappings, parameter, typeParamToDyn));
}

/**
 * internalIsAssignable computes assignability while mutating a candidate substitution map.
 */
function internalIsAssignable(substitutions: mapping, left: Type, right: Type): boolean {
  const leftKind = left.kind();
  const rightKind = right.kind();
  if (rightKind === Kind.TypeParam) {
    const [valid, hasSub] = isValidTypeSubstitution(substitutions, left, right);
    if (valid) {
      return true;
    }
    if (!valid && hasSub) {
      return false;
    }
  }
  if (leftKind === Kind.TypeParam) {
    const [valid] = isValidTypeSubstitution(substitutions, right, left);
    return valid;
  }
  if (isDynOrError(left) || isDynOrError(right)) {
    return true;
  }
  if (leftKind === Kind.NullType) {
    return internalIsAssignableNull(right);
  }
  if (rightKind === Kind.NullType) {
    return internalIsAssignableNull(left);
  }
  switch (leftKind) {
    case Kind.Bool:
    case Kind.Bytes:
    case Kind.Double:
    case Kind.Int:
    case Kind.String:
    case Kind.Uint:
    case Kind.Any:
    case Kind.Duration:
    case Kind.Timestamp:
    case Kind.Struct:
      return right.isAssignableType(left);
    case Kind.Type:
      return rightKind === Kind.Type;
    case Kind.Opaque:
    case Kind.List:
    case Kind.Map:
      return (
        left.kind() === right.kind() &&
        left.typeName() === right.typeName() &&
        internalIsAssignableList(substitutions, left.parameters(), right.parameters())
      );
    default:
      return false;
  }
}

/**
 * internalIsAssignableNull preserves cel-go's legacy nullable checks.
 */
export function internalIsAssignableNull(type: Type): boolean {
  return isLegacyNullable(type) || type.isAssignableType(NullType);
}

/**
 * isLegacyNullable preserves the upstream nullable compatibility behavior.
 */
export function isLegacyNullable(type: Type): boolean {
  switch (type.kind()) {
    case Kind.Opaque:
    case Kind.Struct:
    case Kind.Any:
    case Kind.Duration:
    case Kind.Timestamp:
      return true;
    default:
      return false;
  }
}

/**
 * mostGeneral returns the more general of two already-compatible types.
 */
export function mostGeneral(left: Type, right: Type): Type {
  // Null contributes no additional specificity when the other candidate is one of CEL's
  // legacy-nullable types. Preserve the concrete candidate selected during unification.
  if (left.kind() === Kind.NullType && internalIsAssignableNull(right)) {
    return right;
  }
  if (right.kind() === Kind.NullType && internalIsAssignableNull(left)) {
    return left;
  }
  if (isEqualOrLessSpecific(left, right)) {
    return left;
  }
  return right;
}

/**
 * isAssignable computes a substitution-aware type assignment for two CEL types.
 */
export function isAssignable(
  substitutions: mapping,
  target: Type,
  source: Type,
): mapping | undefined {
  const candidate = substitutions.copy();
  return internalIsAssignable(candidate, target, source) ? candidate : undefined;
}

/**
 * isAssignableList computes substitution-aware assignability for lists of types.
 */
export function isAssignableList(
  substitutions: mapping,
  left: Type[],
  right: Type[],
): mapping | undefined {
  const candidate = substitutions.copy();
  return internalIsAssignableList(candidate, left, right) ? candidate : undefined;
}

function internalIsAssignableList(substitutions: mapping, left: Type[], right: Type[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (const [index, type] of left.entries()) {
    if (!internalIsAssignable(substitutions, type, right[index]!)) {
      return false;
    }
  }
  return true;
}

function isValidTypeSubstitution(
  substitutions: mapping,
  left: Type,
  right: Type,
): [boolean, boolean] {
  if (left.kind() === right.kind() && left.isExactType(right)) {
    return [true, true];
  }
  const [rightSubstitution, found] = substitutions.find(right);
  if (found && rightSubstitution) {
    if (left.kind() === rightSubstitution.kind() && left.isExactType(rightSubstitution)) {
      return [true, true];
    }
    if (internalIsAssignable(substitutions, left, rightSubstitution)) {
      const next = mostGeneral(left, rightSubstitution);
      if (notReferencedIn(substitutions, right, next)) {
        substitutions.add(right, next);
      }
      return [true, true];
    }
    return [false, true];
  }
  if (notReferencedIn(substitutions, right, left)) {
    substitutions.add(right, left);
    return [true, false];
  }
  return [false, false];
}

function notReferencedIn(substitutions: mapping, target: Type, withinType: Type): boolean {
  if (target.isExactType(withinType)) {
    return false;
  }
  switch (withinType.kind()) {
    case Kind.TypeParam: {
      const [substitution, found] = substitutions.find(withinType);
      if (!found || !substitution) {
        return true;
      }
      return notReferencedIn(substitutions, target, substitution);
    }
    case Kind.Opaque:
    case Kind.List:
    case Kind.Map:
    case Kind.Type:
      for (const parameter of withinType.parameters()) {
        if (!notReferencedIn(substitutions, target, parameter)) {
          return false;
        }
      }
      return true;
    default:
      return true;
  }
}

export { AnyType, DynType, ErrorType };
