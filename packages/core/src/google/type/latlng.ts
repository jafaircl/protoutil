import { create } from "@bufbuild/protobuf";
import { InvalidValueError, OutOfRangeError } from "../../errors.js";
import { type LatLng, LatLngSchema } from "../../gen/google/type/latlng_pb.js";

/**
 * Creates a validated `google.type.LatLng` value.
 *
 * Unless specified otherwise, coordinates must conform to the
 * [WGS84 standard](http://www.unoosa.org/pdf/icg/2012/template/WGS_84.pdf).
 * Values must already be normalized: latitude must be in `[-90, 90]` and
 * longitude must be in `[-180, 180]`.
 */
export function latLng(latitude = 0, longitude = 0) {
  const value = create(LatLngSchema, { latitude, longitude });
  assertValidLatLng(value);
  return value;
}

/**
 * Asserts that a `google.type.LatLng` is structurally valid.
 *
 * Unless specified otherwise, coordinates must conform to the
 * [WGS84 standard](http://www.unoosa.org/pdf/icg/2012/template/WGS_84.pdf).
 * Values must already be normalized: latitude must be in `[-90, 90]` and
 * longitude must be in `[-180, 180]`.
 */
export function assertValidLatLng(value: LatLng): asserts value is LatLng {
  assertValidCoordinate("latitude", value.latitude, -90, 90);
  assertValidCoordinate("longitude", value.longitude, -180, 180);
}

/**
 * Returns `true` when the value is a valid `google.type.LatLng`.
 */
export function isValidLatLng(value: LatLng): value is LatLng {
  try {
    assertValidLatLng(value);
    return true;
  } catch {
    return false;
  }
}

function assertValidCoordinate(name: string, value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    throw new InvalidValueError(`${name} must be finite`, value);
  }
  if (value < min || value > max) {
    throw new OutOfRangeError(`${name} out of range`, value, min, max);
  }
}
