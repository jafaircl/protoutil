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
import type { SqliteTranslation } from "./profile.js";

const profileName = "protoutil.celql.sqlite";

const library: TranslationLibrary<SqliteTranslation> = {
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
          "The field is a one-component path that names an FTS5 table the query joins.",
          "The FTS5 tokenizer maps every term of the query domain to one token.",
          "The query contains lowercase ASCII alphanumeric terms separated by one space.",
          "SQLite accepts the emitted MATCH only as a conjunctive constraint.",
        ],
      }),
      translate: (context, expression) => context.fullTextSearch(expression),
    },
  ],
};

/**
 * Returns the SQLite binding of the full-text search library.
 *
 * The library adds `index.matchesText(query)`, which selects a record whose
 * indexed terms contain every query term. SQLite evaluates an FTS5 `MATCH`
 * only where a conjunction reaches it, so the binding rejects a negated or
 * disjunctive position instead of emitting a query that SQLite refuses.
 */
export function fullTextSearch(): TranslationLibrary<SqliteTranslation> {
  return library;
}
