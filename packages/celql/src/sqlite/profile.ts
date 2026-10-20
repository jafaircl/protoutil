import { clone, create, type MessageShape } from "@bufbuild/protobuf";
import {
  AnsiSqlParameterSchema,
  AnsiSqlPredicateSchema,
  AnsiSqlProfile,
} from "../ansisql/index.js";
import { arrayEqualityExists } from "../array-comprehensions.js";
import { fullTextQueryTerms, isFullTextQuery } from "../full-text-search.js";
import type { Expr } from "../gen/cel/expr/syntax_pb.js";
import { ValueSchema } from "../gen/cel/expr/value_pb.js";
import {
  DialectCapabilityProfileSchema,
  OperandShape,
  OperationCapabilitySchema,
  ProfileReferenceSchema,
} from "../gen/protoutil/celql/v1/celql_pb.js";
import {
  type SqlLibraryContext,
  type SqlTranslation,
  SqlTranslationContext,
} from "../sql-dialect.js";
import type { Profile } from "../types.js";

const fullTextIndexTypeName = "protoutil.celql.FullTextIndex";

const capability = clone(DialectCapabilityProfileSchema, AnsiSqlProfile.capability);
capability.profile = create(ProfileReferenceSchema, {
  name: "protoutil.celql.sqlite",
  majorVersion: 1,
});
capability.baseProfile = clone(ProfileReferenceSchema, AnsiSqlProfile.capability.profile!);
capability.supportedCelTypes.push("list(string)");
capability.operations = capability.operations.map((operation) => {
  if (operation.overloadId !== "in_list") return operation;
  return create(OperationCapabilitySchema, {
    overloadId: operation.overloadId,
    operands: [
      {
        celType: "dyn",
        allowedShapes: [OperandShape.QUERY_FIELD_PATH, OperandShape.CONSTANT_VALUE],
      },
      {
        celType: "list(dyn)",
        allowedShapes: [OperandShape.CONSTANT_VALUE, OperandShape.QUERY_FIELD_PATH],
      },
    ],
    resultType: "bool",
    additionalRestrictions: [
      "A list query field is a non-null SQLite JSON1 array whose elements are strings.",
    ],
  });
});
capability.outputGrowthDocumentation =
  "Output growth counts Unicode code points after positional placeholders are emitted.";

/** Safe SQLite operations available to one translation-library function. */
export interface SqliteLibraryContext extends SqlLibraryContext {
  /** Translates a bounded FTS5 match for a field path that names an FTS5 table. */
  fullTextSearch(expression: Expr): string;
}

/** One SQLite translation-library function. */
export type SqliteTranslation = SqlTranslation<SqliteLibraryContext>;

/** Per-request SQLite SQL generator that subclasses can customize for local syntax. */
class SqliteTranslationContext
  extends SqlTranslationContext<typeof AnsiSqlPredicateSchema, SqliteLibraryContext>
  implements SqliteLibraryContext
{
  protected libraryContext(): this {
    return this;
  }

  /** Translates a full-text match that requires every query term. */
  public fullTextSearch(expression: Expr): string {
    const operands = this.operands(expression);
    if (operands.length !== 2) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    const index = this.visitOperand(operands[0]!);
    const query = this.visitOperand(operands[1]!);
    if (
      index.kind !== "path" ||
      this.typeName(index.type) !== fullTextIndexTypeName ||
      query.kind !== "constant" ||
      query.constant.constantKind.case !== "stringValue"
    ) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    if (!isFullTextQuery(query.constant.constantKind.value) || !this.inConjunction()) {
      throw this.unsupportedExpression(query.expression);
    }
    // Each term becomes an FTS5 phrase so that a term equal to an FTS5 keyword
    // stays data. The accepted query domain contains no quotation mark.
    const match = fullTextQueryTerms(query.constant.constantKind.value)
      .map((term) => `"${term}"`)
      .join(" AND ");
    const marker = this.bindValue(
      query.expression,
      this.typeOf(query.expression),
      create(ValueSchema, { kind: { case: "stringValue", value: match } }),
    );
    return this.checkedSql(`${index.sql} MATCH ${marker}`);
  }

  protected createPredicate(sql: string): MessageShape<typeof AnsiSqlPredicateSchema> {
    return create(AnsiSqlPredicateSchema, {
      sql,
      parameters: this.parameters.map((parameter) => create(AnsiSqlParameterSchema, parameter)),
    });
  }

  protected override visitEquality(
    expression: Expr,
    expressions: readonly Expr[],
    overloadId: string,
  ): string {
    if (expressions.length !== 2) throw this.unsupportedOverload(expression, overloadId);
    const left = this.nonExpressionOperand(expressions[0]!, overloadId);
    const right = this.nonExpressionOperand(expressions[1]!, overloadId);
    this.requireComparisonShapes(expression, left, right, overloadId);
    // A CEL null becomes SQLite's NULL literal only after its constant kind is known.
    // Keeping it out of the parameter list preserves positional binding for the remaining values.
    if (
      left.kind === "path" &&
      right.kind === "constant" &&
      right.constant.constantKind.case === "nullValue"
    ) {
      return this.checkedSql(`${left.sql} ${overloadId === "equals" ? "IS" : "IS NOT"} NULL`);
    }
    if (
      right.kind === "path" &&
      left.kind === "constant" &&
      left.constant.constantKind.case === "nullValue"
    ) {
      return this.checkedSql(`${right.sql} ${overloadId === "equals" ? "IS" : "IS NOT"} NULL`);
    }
    const operator = overloadId === "equals" ? "IS" : "IS NOT";
    return this.checkedSql(
      `${this.visitComparable(left)} ${operator} ${this.visitComparable(right)}`,
    );
  }

  protected override visitCall(expression: Expr, overloadId: string): string {
    if (overloadId === "in_list") {
      const arrayMembership = this.visitJsonArrayMembership(expression, this.operands(expression));
      if (arrayMembership !== undefined) return arrayMembership;
    }
    return super.visitCall(expression, overloadId);
  }

  protected override visitComprehension(expression: Expr): string {
    const exists = arrayEqualityExists(expression, (current) => this.overloadId(current));
    if (exists === undefined) return super.visitComprehension(expression);
    return this.visitJsonArrayExists(expression, exists.array, exists.constant);
  }

  /** Uses JSON1 only for a checked string-array field, never for arbitrary text storage. */
  private visitJsonArrayMembership(
    expression: Expr,
    expressions: readonly Expr[],
  ): string | undefined {
    if (expressions.length !== 2) throw this.unsupportedOverload(expression, "in_list");
    const [constant, array] = expressions;
    if (
      constant?.exprKind.case !== "constExpr" ||
      (array?.exprKind.case !== "identExpr" && array?.exprKind.case !== "selectExpr") ||
      this.typeName(this.typeOf(array)) !== "list(string)" ||
      this.typeName(this.typeOf(constant)) !== "string"
    ) {
      return undefined;
    }
    const path = this.visitFieldPath(array);
    const marker = this.bindConstant(constant);
    return this.checkedSql(
      `EXISTS (SELECT 1 FROM json_each(${path}) AS "__celql_element" WHERE "__celql_element".value IS ${marker})`,
    );
  }

  private visitJsonArrayExists(expression: Expr, array: Expr, constant: Expr): string {
    if (
      (array.exprKind.case !== "identExpr" && array.exprKind.case !== "selectExpr") ||
      this.typeName(this.typeOf(array)) !== "list(string)" ||
      this.typeName(this.typeOf(constant)) !== "string"
    ) {
      throw this.unsupportedExpression(expression);
    }
    const path = this.visitFieldPath(array);
    const marker = this.bindConstant(constant);
    return this.checkedSql(
      `EXISTS (SELECT 1 FROM json_each(${path}) AS "__celql_element" WHERE "__celql_element".value IS ${marker})`,
    );
  }
}

/**
 * Translates the ANSI SQL version 1 fragment to SQLite.
 *
 * The profile emits `AnsiSqlPredicate` with positional parameters and
 * double-quote-delimited field paths. SQLite `IS` and `IS NOT` preserve CEL
 * total equality without relying on SQLite's non-total `=` and `!=` forms.
 */
export class SqliteProfile implements Profile<typeof AnsiSqlPredicateSchema, SqliteTranslation> {
  /** Capability declaration for the SQLite translation fragment. */
  public static readonly capability = capability;

  /** Machine-readable declaration for this profile instance. */
  public readonly capability = SqliteProfile.capability;

  /** Protobuf schema produced by this profile. */
  public readonly outputSchema = AnsiSqlPredicateSchema;

  /** Validates one expression through the constructed profile. */
  public validate(
    context: Parameters<Profile["validate"]>[0],
    functions: ReadonlyMap<string, SqliteTranslation>,
  ): void {
    new SqliteTranslationContext(context, functions).validate();
  }

  /** Translates one expression through the constructed profile. */
  public translate(
    context: Parameters<Profile["translate"]>[0],
    functions: ReadonlyMap<string, SqliteTranslation>,
  ): MessageShape<typeof AnsiSqlPredicateSchema> {
    return new SqliteTranslationContext(context, functions).translate();
  }
}
