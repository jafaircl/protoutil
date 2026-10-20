import { create } from "@bufbuild/protobuf";
import {
  FullTextIndexType,
  fullTextIndexMatchesText,
  fullTextSearchLibrary,
  fullTextSearchLibraryName,
} from "../full-text-search.js";
import {
  LibraryReferenceSchema,
  OperandShape,
  OperationCapabilitySchema,
  ProfileReferenceSchema,
} from "../gen/protoutil/celql/v1/celql_pb.js";
import type { TranslationLibrary } from "../types.js";
import type { PostgreSqlTranslation } from "./profile.js";

const profileName = "protoutil.celql.postgresql";

const library: TranslationLibrary<PostgreSqlTranslation> = {
  ...fullTextSearchLibrary(),
  reference: create(LibraryReferenceSchema, { name: fullTextSearchLibraryName, majorVersion: 1 }),
  profile: create(ProfileReferenceSchema, { name: profileName, majorVersion: 1 }),
  functions: [
    {
      capability: create(OperationCapabilitySchema, {
        overloadId: fullTextIndexMatchesText,
        operands: [
          {
            celType: FullTextIndexType.typeName(),
            allowedShapes: [OperandShape.QUERY_FIELD_PATH],
          },
          { celType: "string", allowedShapes: [OperandShape.CONSTANT_VALUE] },
        ],
        resultType: "bool",
        additionalRestrictions: [
          "The field is a tsvector column that uses the simple text-search configuration.",
          "The query contains lowercase ASCII alphanumeric terms separated by one space.",
        ],
      }),
      translate: (context, expression) => context.fullTextSearch(expression),
    },
  ],
};

/**
 * Returns the PostgreSQL binding of the full-text search library.
 *
 * The library adds `index.matchesText(query)`, which selects a record whose
 * indexed terms contain every query term. PostgreSQL evaluates the emitted
 * match in any Boolean position, and a SQL `NULL` vector selects no record.
 */
export function fullTextSearch(): TranslationLibrary<PostgreSqlTranslation> {
  return library;
}
