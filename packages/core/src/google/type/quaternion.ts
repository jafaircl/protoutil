import { create } from "@bufbuild/protobuf";
import { InvalidValueError } from "../../errors.js";
import { type Quaternion, QuaternionSchema } from "../../gen/google/type/quaternion_pb.js";

/**
 * Creates a validated `google.type.Quaternion` value.
 *
 * This helper validates only the protobuf wire shape: `x`, `y`, `z`, and `w`
 * must all be finite numbers. The protobuf docs describe Hamilton-convention
 * quaternion semantics, but do not require normalization or positive `w`.
 */
export function quaternion(x: number, y: number, z: number, w: number) {
  const value = create(QuaternionSchema, { x, y, z, w });
  assertValidQuaternion(value);
  return value;
}

/**
 * Asserts that a `google.type.Quaternion` is structurally valid.
 *
 * The protobuf docs require Hamilton-convention interpretation, but the wire
 * format itself only constrains the components to real-number values.
 */
export function assertValidQuaternion(value: Quaternion): asserts value is Quaternion {
  assertFiniteComponent("x", value.x);
  assertFiniteComponent("y", value.y);
  assertFiniteComponent("z", value.z);
  assertFiniteComponent("w", value.w);
}

/**
 * Returns `true` when the value is a valid `google.type.Quaternion`.
 */
export function isValidQuaternion(value: Quaternion): value is Quaternion {
  try {
    assertValidQuaternion(value);
    return true;
  } catch {
    return false;
  }
}

function assertFiniteComponent(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new InvalidValueError(`${name} must be finite`, value);
  }
}
