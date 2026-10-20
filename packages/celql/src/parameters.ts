import type { Duration, Timestamp } from "@bufbuild/protobuf/wkt";
import { anyUnpack, DurationSchema, TimestampSchema } from "@bufbuild/protobuf/wkt";
import type { Value } from "./gen/cel/expr/value_pb.js";

/**
 * One predicate parameter in JavaScript form.
 *
 * An integer arrives as `bigint` so that a 64-bit value keeps its exact
 * magnitude. A timestamp and a duration arrive as their protobuf well-known
 * types, because a target column can store either one in several ways and this
 * package does not choose one for the caller.
 */
export type ParameterValue =
  | null
  | boolean
  | bigint
  | number
  | string
  | Uint8Array
  | Timestamp
  | Duration
  | ParameterValue[];

/** One parameter of a textual predicate, as every SQL profile emits it. */
export interface BoundParameterValue {
  /** Value that the caller binds at this parameter's position. */
  value?: Value;
}

/**
 * Converts one predicate parameter to its JavaScript value.
 *
 * Throws when the parameter carries a value that no profile emits.
 *
 * @param parameter Parameter from a translated predicate.
 */
export function parameterValue(parameter: BoundParameterValue): ParameterValue {
  const value = parameter.value?.kind;
  switch (value?.case) {
    case "boolValue":
    case "doubleValue":
    case "stringValue":
    case "bytesValue":
    case "int64Value":
    case "uint64Value":
      return value.value;
    case "nullValue":
      return null;
    case "listValue":
      return value.value.values.map((element) => parameterValue({ value: element }));
    case "objectValue": {
      const timestamp = anyUnpack(value.value, TimestampSchema);
      if (timestamp !== undefined) return timestamp as Timestamp;
      const duration = anyUnpack(value.value, DurationSchema);
      if (duration !== undefined) return duration as Duration;
      throw new Error(`A predicate parameter carries the unsupported type ${value.value.typeUrl}.`);
    }
    default:
      throw new Error("A predicate parameter carries no value.");
  }
}

/**
 * Converts every parameter of a textual predicate, in binding order.
 *
 * The returned array is positional: element `n` binds the profile's `n + 1`
 * placeholder. A profile that starts numbering above one still emits its
 * parameters in binding order.
 *
 * @param parameters Parameters from a translated predicate.
 */
export function parameterValues(parameters: readonly BoundParameterValue[]): ParameterValue[] {
  return parameters.map(parameterValue);
}
