import { create } from "@bufbuild/protobuf";
import {
  LibraryReferenceSchema,
  OperandShape,
  OperationCapabilitySchema,
  ProfileReferenceSchema,
} from "../gen/protoutil/celql/v1/celql_pb.js";
import {
  TimestampRangeType,
  timestampRangesLibrary,
  timestampRangesLibraryName,
} from "../timestamp-ranges.js";
import type { TranslationLibrary } from "../types.js";
import type { PostgreSqlTranslation } from "./profile.js";

const profileName = "protoutil.celql.postgresql";

const library: TranslationLibrary<PostgreSqlTranslation> = {
  ...timestampRangesLibrary(),
  reference: create(LibraryReferenceSchema, { name: timestampRangesLibraryName, majorVersion: 1 }),
  profile: create(ProfileReferenceSchema, { name: profileName, majorVersion: 1 }),
  functions: [
    {
      capability: capability(
        "timestamp_range",
        ["google.protobuf.Timestamp", "google.protobuf.Timestamp"],
        TimestampRangeType.typeName(),
        [OperandShape.CONSTANT_VALUE, OperandShape.CONSTANT_VALUE],
      ),
      translate: (context, expression) => context.timestampRange(expression),
    },
    {
      capability: capability(
        "timestamp_range_contains_timestamp",
        [TimestampRangeType.typeName(), "google.protobuf.Timestamp"],
        "bool",
        [OperandShape.QUERY_FIELD_PATH, OperandShape.CONSTANT_VALUE],
      ),
      translate: (context, expression) => context.timestampRangeContains(expression),
    },
    {
      capability: capability(
        "timestamp_range_overlaps_timestamp_range",
        [TimestampRangeType.typeName(), TimestampRangeType.typeName()],
        "bool",
        [OperandShape.QUERY_FIELD_PATH, OperandShape.TRANSLATED_EXPRESSION],
      ),
      translate: (context, expression) => context.timestampRangeOverlaps(expression),
    },
  ],
};

/**
 * Returns the PostgreSQL binding of the timestamp-range library.
 *
 * The library adds `timestampRange(start, end)`, `range.contains(timestamp)`,
 * and `range.overlaps(otherRange)` with half-open range semantics. The caller
 * MUST map a `TimestampRangeType` query field to a `tstzrange` column.
 */
export function timestampRanges(): TranslationLibrary<PostgreSqlTranslation> {
  return library;
}

function capability(
  overloadId: string,
  celTypes: readonly string[],
  resultType: string,
  shapes: readonly OperandShape[],
) {
  return create(OperationCapabilitySchema, {
    overloadId,
    operands: celTypes.map((celType, index) => ({ celType, allowedShapes: [shapes[index]!] })),
    resultType,
  });
}
