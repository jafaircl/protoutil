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
import type { MySqlTranslation } from "./profile.js";

const profileName = "protoutil.celql.mysql";

const library: TranslationLibrary<MySqlTranslation> = {
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
          "The field is a NOT NULL column covered by a single-column FULLTEXT index.",
          "The index tokenizes every term of the query domain and applies no stop-word list.",
          "The query contains lowercase ASCII alphanumeric terms separated by one space.",
        ],
      }),
      translate: (context, expression) => context.fullTextSearch(expression),
    },
  ],
};

/**
 * Returns the MySQL binding of the full-text search library.
 *
 * The library adds `index.matchesText(query)`, which selects a record whose
 * indexed terms contain every query term. MySQL evaluates the emitted
 * boolean-mode match in any Boolean position, including negation.
 */
export function fullTextSearch(): TranslationLibrary<MySqlTranslation> {
  return library;
}
