import { create } from "@bufbuild/protobuf";
import {
  asciiLower,
  caseInsensitivePatterns,
  caseInsensitiveStringsLibrary,
  caseInsensitiveStringsLibraryName,
  isAscii,
} from "../case-insensitive-strings.js";
import type { Expr } from "../gen/cel/expr/syntax_pb.js";
import {
  LibraryReferenceSchema,
  OperandShape,
  OperationCapabilitySchema,
  ProfileReferenceSchema,
} from "../gen/protoutil/celql/v1/celql_pb.js";
import type { SqlPatternKind, SqlTranslation } from "../sql-dialect.js";
import type { TranslationLibrary } from "../types.js";

const profileName = "protoutil.celql.postgresql";

const patterns = caseInsensitivePatterns as readonly (readonly [string, SqlPatternKind])[];

const library: TranslationLibrary<SqlTranslation> = {
  ...caseInsensitiveStringsLibrary(),
  reference: create(LibraryReferenceSchema, {
    name: caseInsensitiveStringsLibraryName,
    majorVersion: 1,
  }),
  profile: create(ProfileReferenceSchema, { name: profileName, majorVersion: 1 }),
  functions: patterns.map(([overloadId, kind]) => ({
    capability: create(OperationCapabilitySchema, {
      overloadId,
      operands: [
        { celType: "string", allowedShapes: [OperandShape.QUERY_FIELD_PATH] },
        { celType: "string", allowedShapes: [OperandShape.CONSTANT_VALUE] },
      ],
      resultType: "bool",
      additionalRestrictions: [
        "Both operands are restricted to ASCII strings.",
        "Case folding uses PostgreSQL lower(), which an expression index can answer.",
      ],
    }),
    translate: (context, expression: Expr) =>
      context.stringPattern(expression, kind, "LIKE", {
        path: (sql) => `lower(${sql})`,
        constant: asciiLower,
        supports: isAscii,
      }),
  })),
};

/**
 * Returns the PostgreSQL library for ASCII case-insensitive string operations.
 *
 * The library adds `startsWithIgnoreCase`, `endsWithIgnoreCase`, and
 * `containsIgnoreCase`. It accepts ASCII query fields and constants only, so
 * CEL evaluation and PostgreSQL `ILIKE` use the same case-folding domain.
 */
export function caseInsensitiveStrings(): TranslationLibrary<SqlTranslation> {
  return library;
}
