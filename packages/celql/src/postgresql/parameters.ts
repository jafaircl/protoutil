import type { Duration, Timestamp } from "@bufbuild/protobuf/wkt";
import type { Type } from "../gen/cel/expr/checked_pb.js";
import { Type_PrimitiveType, Type_WellKnownType } from "../gen/cel/expr/checked_pb.js";
import type { PostgreSqlPredicate } from "../gen/protoutil/celql/postgresql/v1/postgresql_pb.js";
import { type ParameterValue, parameterValue } from "../parameters.js";

/** One value that the `pg` client accepts for a bound parameter. */
export type PostgreSqlParameterValue = string | number | boolean | Uint8Array | null | unknown[];

/**
 * Converts a predicate's parameters to values that the `pg` client binds directly.
 *
 * The array is positional, so element `n` binds `$n + 1` of the emitted SQL, or
 * the placeholder that `PostgreSqlConfiguration.start_position` shifts it to.
 *
 * An integer becomes a decimal string, because the client sends a JavaScript
 * number as a double and would lose magnitude above 2^53. A timestamp becomes
 * an ISO 8601 string, and a duration becomes an interval string that
 * PostgreSQL parses in seconds.
 *
 * @param predicate Predicate that the PostgreSQL profile produced.
 */
export function postgreSqlParameters(predicate: PostgreSqlPredicate): PostgreSqlParameterValue[] {
  return predicate.parameters.map(
    (parameter) =>
      postgreSqlParameterValue(
        parameter.celType,
        parameterValue(parameter),
      ) as PostgreSqlParameterValue,
  );
}

function postgreSqlParameterValue(type: Type | undefined, value: ParameterValue): unknown {
  if (value === null) return null;
  if (type?.typeKind.case === "listType") {
    const elementType = type.typeKind.value.elemType;
    return (value as ParameterValue[]).map((element) =>
      postgreSqlParameterValue(elementType, element),
    );
  }
  if (typeof value === "bigint") return value.toString();
  if (type?.typeKind.case === "wellKnown") {
    if (type.typeKind.value === Type_WellKnownType.TIMESTAMP) {
      const timestamp = value as Timestamp;
      return new Date(Number(timestamp.seconds) * 1000 + timestamp.nanos / 1_000_000).toISOString();
    }
    const duration = value as Duration;
    return `${duration.seconds}.${Math.abs(duration.nanos).toString().padStart(9, "0")} seconds`;
  }
  if (
    type?.typeKind.case === "primitive" &&
    (type.typeKind.value === Type_PrimitiveType.INT64 ||
      type.typeKind.value === Type_PrimitiveType.UINT64)
  ) {
    return String(value);
  }
  return value;
}
