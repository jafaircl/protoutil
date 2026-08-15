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
import type { MongoDbTranslation } from "./profile.js";

const profileName = "protoutil.celql.mongodb";

const library: TranslationLibrary<MongoDbTranslation> = {
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
          "The collection has one text index, which covers exactly the mapped field.",
          "The text index uses default_language none, so it applies no stemmer and no stop-word list.",
          "The query contains lowercase ASCII alphanumeric terms separated by one space.",
          "MongoDB accepts the emitted $text only as a conjunctive constraint.",
        ],
      }),
      translate: (context, expression) => context.fullTextSearch(expression),
    },
  ],
};

/**
 * Returns the MongoDB binding of the full-text search library.
 *
 * The library adds `index.matchesText(query)`, which selects a document whose
 * indexed terms contain every query term. Each term becomes a `$text` phrase,
 * because MongoDB combines unquoted terms with a logical OR. MongoDB evaluates
 * `$text` only where a conjunction reaches it, so the binding rejects a negated
 * or disjunctive position instead of emitting a query that MongoDB refuses.
 */
export function fullTextSearch(): TranslationLibrary<MongoDbTranslation> {
  return library;
}
