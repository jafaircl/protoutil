import { create } from "@bufbuild/protobuf";
import type { Any } from "@bufbuild/protobuf/wkt";
import { InvalidValueError } from "../../errors.js";
import type { Code } from "../../gen/google/rpc/code_pb.js";
import { type Status, StatusSchema } from "../../gen/google/rpc/status_pb.js";
import { assertValidCode } from "./code.js";

/**
 * Creates a validated `google.rpc.Status` value.
 *
 * `code` must be one of the canonical `google.rpc.Code` values. `message`
 * should be a developer-facing description, and `details` may contain packed
 * `google.protobuf.Any` messages.
 */
export function status(code: Code, message: string, details: Any[] = []) {
  const value = create(StatusSchema, {
    code,
    message,
    details,
  });
  assertValidStatus(value);
  return value;
}

/**
 * Asserts that a `google.rpc.Status` is structurally valid.
 *
 * `code` must be one of the defined `google.rpc.Code` enum values.
 */
export function assertValidStatus(value: Status): asserts value is Status {
  assertValidCode(value.code);
  if (typeof value.message !== "string") {
    throw new InvalidValueError("message must be a string", value.message);
  }
  if (!Array.isArray(value.details)) {
    throw new InvalidValueError("details must be an array of google.protobuf.Any", value.details);
  }
  for (const detail of value.details) {
    if (detail?.$typeName !== "google.protobuf.Any") {
      throw new InvalidValueError("details must contain only google.protobuf.Any values", detail);
    }
  }
}

/**
 * Returns `true` when the value is a valid `google.rpc.Status`.
 */
export function isValidStatus(value: Status): value is Status {
  try {
    assertValidStatus(value);
    return true;
  } catch {
    return false;
  }
}
