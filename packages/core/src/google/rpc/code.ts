import { InvalidValueError } from "../../errors.js";
import { Code } from "../../gen/google/rpc/code_pb.js";
import { assertValidInt32 } from "../../int32.js";

const CODE_NAME_BY_VALUE: Record<number, string> = {
  [Code.OK]: "OK",
  [Code.CANCELLED]: "CANCELLED",
  [Code.UNKNOWN]: "UNKNOWN",
  [Code.INVALID_ARGUMENT]: "INVALID_ARGUMENT",
  [Code.DEADLINE_EXCEEDED]: "DEADLINE_EXCEEDED",
  [Code.NOT_FOUND]: "NOT_FOUND",
  [Code.ALREADY_EXISTS]: "ALREADY_EXISTS",
  [Code.PERMISSION_DENIED]: "PERMISSION_DENIED",
  [Code.UNAUTHENTICATED]: "UNAUTHENTICATED",
  [Code.RESOURCE_EXHAUSTED]: "RESOURCE_EXHAUSTED",
  [Code.FAILED_PRECONDITION]: "FAILED_PRECONDITION",
  [Code.ABORTED]: "ABORTED",
  [Code.OUT_OF_RANGE]: "OUT_OF_RANGE",
  [Code.UNIMPLEMENTED]: "UNIMPLEMENTED",
  [Code.INTERNAL]: "INTERNAL",
  [Code.UNAVAILABLE]: "UNAVAILABLE",
  [Code.DATA_LOSS]: "DATA_LOSS",
};

const CODE_VALUE_BY_NAME = Object.fromEntries(
  Object.entries(CODE_NAME_BY_VALUE).map(([value, name]) => [name, Number(value)]),
) as Record<string, Code>;

/**
 * Asserts that a `google.rpc.Code` enum value is structurally valid.
 */
export function assertValidCode(value: Code | number): asserts value is Code {
  assertValidInt32(value);
  if (!(value in CODE_NAME_BY_VALUE)) {
    throw new InvalidValueError("invalid google.rpc.Code value", value);
  }
}

/**
 * Returns `true` when the value is a valid `google.rpc.Code`.
 */
export function isValidCode(value: Code | number): value is Code {
  try {
    assertValidCode(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a `google.rpc.Code` from its canonical enum name.
 */
export function codeFromString(value: string) {
  const normalized = value.trim().toUpperCase();
  const codeValue = CODE_VALUE_BY_NAME[normalized];
  if (codeValue === undefined) {
    throw new InvalidValueError("invalid google.rpc.Code string", value);
  }
  assertValidCode(codeValue);
  return codeValue;
}

/**
 * Formats a `google.rpc.Code` using its canonical enum name.
 */
export function codeToString(value: Code | number) {
  assertValidCode(value);
  return CODE_NAME_BY_VALUE[value];
}
