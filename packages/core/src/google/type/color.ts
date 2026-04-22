import { create } from "@bufbuild/protobuf";
import { InvalidValueError, OutOfRangeError } from "../../errors.js";
import { type Color, ColorSchema } from "../../gen/google/type/color_pb.js";

/**
 * Creates a validated `google.type.Color` value.
 *
 * Channel values are fractions in the interval `[0, 1]`. If `alpha` is
 * omitted, the color is treated as solid for rendering purposes.
 */
export function color(red = 0, green = 0, blue = 0, alpha?: number) {
  const value = create(ColorSchema, {
    red,
    green,
    blue,
    alpha,
  });
  assertValidColor(value);
  return value;
}

/**
 * Asserts that a `google.type.Color` is structurally valid.
 */
export function assertValidColor(value: Color): asserts value is Color {
  assertValidChannel("red", value.red);
  assertValidChannel("green", value.green);
  assertValidChannel("blue", value.blue);
  if (value.alpha !== undefined) {
    assertValidChannel("alpha", value.alpha);
  }
}

/**
 * Returns `true` when the value is a valid `google.type.Color`.
 */
export function isValidColor(value: Color): value is Color {
  try {
    assertValidColor(value);
    return true;
  } catch {
    return false;
  }
}

function assertValidChannel(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new InvalidValueError(`${name} must be finite`, value);
  }
  if (value < 0 || value > 1) {
    throw new OutOfRangeError(`${name} out of range`, value, 0, 1);
  }
}
