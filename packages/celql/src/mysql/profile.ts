import { clone, create, type MessageShape } from "@bufbuild/protobuf";
import {
  AnsiSqlParameterSchema,
  AnsiSqlPredicateSchema,
  AnsiSqlProfile,
} from "../ansisql/index.js";
import { arrayEqualityExists } from "../array-comprehensions.js";
import { fullTextQueryTerms, isFullTextQuery } from "../full-text-search.js";
import { Type_PrimitiveType, TypeSchema } from "../gen/cel/expr/checked_pb.js";
import type { Expr } from "../gen/cel/expr/syntax_pb.js";
import { ValueSchema } from "../gen/cel/expr/value_pb.js";
import {
  DialectCapabilityProfileSchema,
  OperandShape,
  OperationCapabilitySchema,
  ProfileReferenceSchema,
} from "../gen/protoutil/celql/v1/celql_pb.js";
import {
  earthRadiusMeters,
  geoDistanceEnvelopeText,
  geoPointArgument,
  geoPointText,
  geoPolygonArgument,
  geoPolygonText,
  isDistanceBound,
} from "../geospatial.js";
import {
  type SqlLibraryContext,
  type SqlTranslation,
  SqlTranslationContext,
} from "../sql-dialect.js";
import type { Profile } from "../types.js";

const fullTextIndexTypeName = "protoutil.celql.FullTextIndex";
const geoPointTypeName = "protoutil.celql.GeoPoint";

/** Reads a bound well-known text geometry in the coordinate order the library declares. */
function geometryFromText(marker: string): string {
  return `ST_GeomFromText(${marker}, 4326, 'axis-order=long-lat')`;
}

const capability = clone(DialectCapabilityProfileSchema, AnsiSqlProfile.capability);
capability.profile = create(ProfileReferenceSchema, {
  name: "protoutil.celql.mysql",
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
      "A list query field is a non-null MySQL JSON array whose elements are strings.",
    ],
  });
});
capability.outputGrowthDocumentation =
  "Output growth counts Unicode code points after positional placeholders are emitted.";

/** Safe MySQL operations available to one translation-library function. */
export interface MySqlLibraryContext extends SqlLibraryContext {
  /** Translates a bounded boolean-mode full-text index match. */
  fullTextSearch(expression: Expr): string;

  /** Translates closed containment of a stored position in a constant polygon. */
  geoPolygonRelation(expression: Expr): string;

  /** Translates a great-circle distance bound between a stored position and a constant. */
  geoWithinDistance(expression: Expr): string;
}

/** One MySQL translation-library function. */
export type MySqlTranslation = SqlTranslation<MySqlLibraryContext>;

/** Per-request MySQL SQL generator that subclasses can customize for local syntax. */
class MySqlTranslationContext
  extends SqlTranslationContext<typeof AnsiSqlPredicateSchema, MySqlLibraryContext>
  implements MySqlLibraryContext
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
    if (!isFullTextQuery(query.constant.constantKind.value)) {
      throw this.unsupportedExpression(query.expression);
    }
    // Boolean mode requires every term individually. The bound value stays data:
    // the accepted query domain contains no boolean-mode operator character.
    const required = fullTextQueryTerms(query.constant.constantKind.value)
      .map((term) => `+${term}`)
      .join(" ");
    const marker = this.bindValue(
      query.expression,
      this.typeOf(query.expression),
      create(ValueSchema, { kind: { case: "stringValue", value: required } }),
    );
    return this.checkedSql(`MATCH (${index.sql}) AGAINST (${marker} IN BOOLEAN MODE)`);
  }

  /**
   * Translates closed containment of a stored position in a constant polygon.
   *
   * The emitted relation is `ST_Intersects` for both the containment and the
   * intersection operation, because `ST_Within` excludes a position on the ring
   * and would therefore not preserve the library's closed containment.
   */
  public geoPolygonRelation(expression: Expr): string {
    const operands = this.operands(expression);
    if (operands.length !== 2) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    const point = this.geoPointField(expression, operands[0]!);
    const polygon = geoPolygonArgument(operands[1]!, (current) => this.overloadId(current));
    if (polygon === undefined) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    if (polygon === "invalid") throw this.unsupportedExpression(operands[1]!);
    const marker = this.bindGeometryText(operands[1]!, geoPolygonText(polygon));
    return this.checkedSql(`ST_Intersects(${point}, ${geometryFromText(marker)})`);
  }

  /** Translates a great-circle distance bound between a stored position and a constant. */
  public geoWithinDistance(expression: Expr): string {
    const operands = this.operands(expression);
    if (operands.length !== 3) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    const point = this.geoPointField(expression, operands[0]!);
    const center = geoPointArgument(operands[1]!, (current) => this.overloadId(current));
    if (center === undefined) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    if (center === "invalid") throw this.unsupportedExpression(operands[1]!);
    const meters = this.visitOperand(operands[2]!);
    if (meters.kind !== "constant" || meters.constant.constantKind.case !== "doubleValue") {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    if (!isDistanceBound(meters.constant.constantKind.value)) {
      throw this.unsupportedExpression(operands[2]!);
    }
    // MySQL has no index-usable spherical distance operator, so the emitted
    // condition leads with the bounding rectangle of the distance bound where
    // one exists. The rectangle holds every position that the exact test
    // accepts, and a SPATIAL index answers it, so the pair selects the same
    // records as the exact test alone while the server examines far fewer rows.
    const envelope = geoDistanceEnvelopeText(center, meters.constant.constantKind.value);
    const prefix =
      envelope === undefined
        ? ""
        : `MBRIntersects(${point}, ${geometryFromText(this.bindGeometryText(operands[1]!, envelope))}) AND `;
    const centerMarker = this.bindGeometryText(operands[1]!, geoPointText(center));
    const boundMarker = this.bindConstant(meters.expression, meters.constant);
    const distance = `ST_Distance_Sphere(${point}, ${geometryFromText(centerMarker)}, ${earthRadiusMeters}) <= ${boundMarker}`;
    return this.checkedSql(prefix === "" ? distance : `(${prefix}${distance})`);
  }

  /** Requires the receiver of a spatial operation to be a stored position. */
  private geoPointField(expression: Expr, operand: Expr): string {
    const point = this.visitOperand(operand);
    if (point.kind !== "path" || this.typeName(point.type) !== geoPointTypeName) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    return point.sql;
  }

  /** Binds one well-known text geometry as a string parameter rather than SQL syntax. */
  private bindGeometryText(expression: Expr, text: string): string {
    return this.bindValue(
      expression,
      create(TypeSchema, { typeKind: { case: "primitive", value: Type_PrimitiveType.STRING } }),
      create(ValueSchema, { kind: { case: "stringValue", value: text } }),
    );
  }

  protected createPredicate(sql: string): MessageShape<typeof AnsiSqlPredicateSchema> {
    return create(AnsiSqlPredicateSchema, {
      sql,
      parameters: this.parameters.map((parameter) => create(AnsiSqlParameterSchema, parameter)),
    });
  }

  protected override quoteIdentifier(component: string): string {
    return `\`${component.replaceAll("`", "``")}\``;
  }

  /** Doubles the backslash inside MySQL's string literal while retaining one LIKE escape character. */
  protected override likeEscapeClause(): string {
    return "ESCAPE '\\\\'";
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
    // A CEL null is query syntax only after the profile has established that it is the null literal.
    // It must not consume a parameter position.
    if (
      left.kind === "path" &&
      right.kind === "constant" &&
      right.constant.constantKind.case === "nullValue"
    ) {
      const comparison = `${left.sql} <=> NULL`;
      return this.checkedSql(overloadId === "equals" ? comparison : `NOT (${comparison})`);
    }
    if (
      right.kind === "path" &&
      left.kind === "constant" &&
      left.constant.constantKind.case === "nullValue"
    ) {
      const comparison = `${right.sql} <=> NULL`;
      return this.checkedSql(overloadId === "equals" ? comparison : `NOT (${comparison})`);
    }
    const comparison = `${this.visitComparable(left)} <=> ${this.visitComparable(right)}`;
    return this.checkedSql(overloadId === "equals" ? comparison : `NOT (${comparison})`);
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

  /** Uses MySQL JSON only when the checked operand is the declared string-array storage type. */
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
    return this.checkedSql(
      `JSON_CONTAINS(${this.visitFieldPath(array)}, JSON_ARRAY(${this.bindConstant(constant)}))`,
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
    return this.checkedSql(
      `JSON_CONTAINS(${this.visitFieldPath(array)}, JSON_ARRAY(${this.bindConstant(constant)}))`,
    );
  }
}

/**
 * Translates the ANSI SQL version 1 fragment to MySQL 8.0 or later.
 *
 * The profile emits `AnsiSqlPredicate` with positional parameters. It uses
 * backtick-delimited field-path components, MySQL string-literal escaping,
 * and MySQL null-safe equality, so CEL equality remains total when a mapped
 * column contains SQL `NULL`.
 */
export class MySqlProfile implements Profile<typeof AnsiSqlPredicateSchema, MySqlTranslation> {
  /** Capability declaration for the MySQL 8.0 translation fragment. */
  public static readonly capability = capability;

  /** Machine-readable declaration for this profile instance. */
  public readonly capability = MySqlProfile.capability;

  /** Protobuf schema produced by this profile. */
  public readonly outputSchema = AnsiSqlPredicateSchema;

  /** Validates one expression through the constructed profile. */
  public validate(
    context: Parameters<Profile["validate"]>[0],
    functions: ReadonlyMap<string, MySqlTranslation>,
  ): void {
    new MySqlTranslationContext(context, functions).validate();
  }

  /** Translates one expression through the constructed profile. */
  public translate(
    context: Parameters<Profile["translate"]>[0],
    functions: ReadonlyMap<string, MySqlTranslation>,
  ): MessageShape<typeof AnsiSqlPredicateSchema> {
    return new MySqlTranslationContext(context, functions).translate();
  }
}
