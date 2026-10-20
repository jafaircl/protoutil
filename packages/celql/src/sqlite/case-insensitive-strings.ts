import { create } from "@bufbuild/protobuf";
import {
  caseInsensitivePatterns,
  caseInsensitiveStringsLibrary,
  caseInsensitiveStringsLibraryName,
  isAscii,
} from "../case-insensitive-strings.js";
import {
  LibraryReferenceSchema,
  OperandShape,
  OperationCapabilitySchema,
  ProfileReferenceSchema,
} from "../gen/protoutil/celql/v1/celql_pb.js";
import type { SqlPatternKind, SqlTranslation } from "../sql-dialect.js";
import type { TranslationLibrary } from "../types.js";

const profileName = "protoutil.celql.sqlite";
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
        "SQLite's built-in LIKE folding is used only in its documented ASCII domain.",
      ],
    }),
    translate: (context, expression) =>
      context.stringPattern(expression, kind, "LIKE", { supports: isAscii }),
  })),
};

/** Returns the SQLite library for ASCII case-insensitive string operations. */
export function caseInsensitiveStrings(): TranslationLibrary<SqlTranslation> {
  return library;
}
