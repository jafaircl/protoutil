import { create } from "@bufbuild/protobuf";
import {
  type CaseInsensitivePatternKind,
  caseInsensitivePatterns,
  caseInsensitiveStringsLibrary,
  caseInsensitiveStringsLibraryName,
  isAscii,
} from "../case-insensitive-strings.js";
import type { Expr } from "../gen/cel/expr/syntax_pb.js";
import { ValueSchema } from "../gen/cel/expr/value_pb.js";
import {
  LibraryReferenceSchema,
  OperandShape,
  OperationCapabilitySchema,
  ProfileReferenceSchema,
} from "../gen/protoutil/celql/v1/celql_pb.js";
import type { TranslationLibrary } from "../types.js";
import type { MongoDbLibraryContext, MongoDbTranslation } from "./profile.js";

const profileName = "protoutil.celql.mongodb";
const patterns = caseInsensitivePatterns;

const library: TranslationLibrary<MongoDbTranslation> = {
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
        "MongoDB $regex uses the i option only for the declared ASCII storage domain.",
      ],
    }),
    translate: (context, expression) => translatePattern(context, expression, kind),
  })),
};

/** Returns the MongoDB library for ASCII case-insensitive string operations. */
export function caseInsensitiveStrings(): TranslationLibrary<MongoDbTranslation> {
  return library;
}

function translatePattern(
  context: MongoDbLibraryContext,
  expression: Expr,
  kind: CaseInsensitivePatternKind,
) {
  const [pathExpression, constantExpression] = context.callOperands(expression);
  if (pathExpression === undefined || constantExpression === undefined) {
    throw context.unsupportedExpression(expression);
  }
  const path = context.queryFieldPath(pathExpression!);
  const constant = context.constantValue(constantExpression!);
  if (constant.kind.case !== "stringValue" || !isAscii(constant.kind.value)) {
    throw context.unsupportedExpression(constantExpression);
  }
  const escaped = escapeRegex(constant.kind.value);
  const pattern =
    kind === "startsWith" ? `^${escaped}` : kind === "endsWith" ? `${escaped}$` : escaped;
  return context.fieldOperators(path, [
    ["$regex", stringValue(pattern)],
    ["$options", stringValue("i")],
  ]);
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function stringValue(value: string) {
  return create(ValueSchema, { kind: { case: "stringValue", value } });
}
