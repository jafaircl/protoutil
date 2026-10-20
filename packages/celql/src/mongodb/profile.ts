import { clone, create, type MessageShape, toBinary } from "@bufbuild/protobuf";
import { AnsiSqlProfile } from "../ansisql/index.js";
import { arrayEqualityExists } from "../array-comprehensions.js";
import { fullTextQueryTerms, isFullTextQuery } from "../full-text-search.js";
import type { Type } from "../gen/cel/expr/checked_pb.js";
import { Type_PrimitiveType } from "../gen/cel/expr/checked_pb.js";
import type { Constant, Expr } from "../gen/cel/expr/syntax_pb.js";
import {
  ListValueSchema,
  MapValue_EntrySchema,
  MapValueSchema,
  type Value,
  ValueSchema,
} from "../gen/cel/expr/value_pb.js";
import { MongoDbPredicateSchema } from "../gen/protoutil/celql/mongodb/v1/mongodb_pb.js";
import {
  AbsenceSemantics,
  DialectCapabilityProfileSchema,
  NullSemantics,
  OperandShape,
  OperationCapabilitySchema,
  OutputGrowthUnit,
  ParameterStyle,
  ProfileReferenceSchema,
  RegexSupport,
  TranslationErrorCode,
} from "../gen/protoutil/celql/v1/celql_pb.js";
import {
  earthRadiusMeters,
  type GeoPointValue,
  geoPointArgument,
  geoPolygonArgument,
  isDistanceBound,
} from "../geospatial.js";
import { isMongoDbRegex } from "../regex.js";
import { CelqlError } from "../translator.js";
import type { Profile, ProfileContext } from "../types.js";

const profileName = "protoutil.celql.mongodb";
const outputTypeName = "protoutil.celql.mongodb.v1.MongoDbPredicate";
const fullTextIndexTypeName = "protoutil.celql.FullTextIndex";
const geoPointTypeName = "protoutil.celql.GeoPoint";
const signedMaximum = 9_223_372_036_854_775_807n;
const supportedOverloads = new Set([
  "logical_and",
  "logical_or",
  "logical_not",
  "equals",
  "not_equals",
  "less_int64",
  "less_uint64",
  "less_double",
  "less_string",
  "less_equals_int64",
  "less_equals_uint64",
  "less_equals_double",
  "less_equals_string",
  "greater_int64",
  "greater_uint64",
  "greater_double",
  "greater_string",
  "greater_equals_int64",
  "greater_equals_uint64",
  "greater_equals_double",
  "greater_equals_string",
  "starts_with_string",
  "ends_with_string",
  "contains_string",
  "in_list",
]);

/** Every overload the profile itself translates, including its own regex form. */
const profileOverloads = new Set([...supportedOverloads, "matches_string"]);

const capability = clone(DialectCapabilityProfileSchema, AnsiSqlProfile.capability);
capability.profile = create(ProfileReferenceSchema, { name: profileName, majorVersion: 1 });
capability.baseProfile = undefined;
capability.outputTypeName = outputTypeName;
capability.supportedCelTypes = ["bool", "int", "uint", "double", "string", "bytes"];
capability.supportedCelTypes.push("list(string)");
capability.operations = capability.operations.filter((operation) =>
  supportedOverloads.has(operation.overloadId),
);
capability.operations.push(
  create(OperationCapabilitySchema, {
    overloadId: "matches_string",
    operands: [
      { celType: "string", allowedShapes: [OperandShape.QUERY_FIELD_PATH] },
      { celType: "string", allowedShapes: [OperandShape.CONSTANT_VALUE] },
    ],
    resultType: "bool",
  }),
);
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
      "A list query field is a present BSON array whose elements are present non-null strings.",
    ],
  });
});
capability.supportedComprehensionForms = [];
capability.nullSemantics = NullSemantics.REJECTED;
capability.absenceSemantics = AbsenceSemantics.REJECTED;
capability.regexSupport = RegexSupport.RE2_SUBSET;
capability.parameterStyle = ParameterStyle.NONE;
capability.parameterComposition = undefined;
capability.outputGrowthUnit = OutputGrowthUnit.ENCODED_BYTES;
capability.defaultMaxOutputGrowth = 16_777_216n;
capability.defaultLimits!.maxOutputGrowth = 16_777_216n;
capability.defaultLimits!.maxRegexPatternBytes = 8192n;
capability.nullAndAbsenceDocumentation =
  "The profile accepts no CEL null or has() expression. Query field paths MUST be mapped only to present, non-null BSON values of their declared CEL type.";
capability.regexDocumentation =
  "Accepts an ASCII subset shared by CEL RE2 and MongoDB PCRE2. It permits literals, character classes, dot, a leading ^ anchor, bounded repetition up to 255, and at most one unbounded quantifier. It rejects groups, alternation, end anchors, engine-specific escapes, lookaround, and Unicode-dependent syntax.";
capability.patternLanguageDocumentation =
  "The standard string operations emit only escaped literal text through MongoDB $regex. matches_string preserves a documented portable regex subset.";
capability.outputGrowthDocumentation =
  "Output growth is the encoded byte length of MongoDbPredicate.";
capability.costAndRejectionDocumentation =
  "The profile rejects null, optional values, temporal values, comprehensions, a uint above the signed BSON integer range, and regex forms that can amplify PCRE2 backtracking. Database integrations still require a query timeout or maxTimeMS bound.";

type Operand =
  | { kind: "path"; expression: Expr; path: string; type: Type }
  | { kind: "constant"; expression: Expr; value: Value; type: Type };

/** Safe MongoDB filter operations available to one translation-library function. */
export interface MongoDbLibraryContext {
  /** Resolves an expression that must be a safe MongoDB query field path. */
  queryFieldPath(expression: Expr): string;

  /** Converts an expression that must be a supported CEL constant. */
  constantValue(expression: Expr): Value;

  /** Resolves a member-call receiver and arguments in CEL operand order. */
  callOperands(expression: Expr): readonly Expr[];

  /** Creates one structured field-operator predicate from trusted library syntax. */
  fieldOperator(path: string, operator: string, value: Value): Value;

  /** Creates one structured field predicate from a fixed set of trusted operators. */
  fieldOperators(path: string, entries: readonly (readonly [string, Value])[]): Value;

  /** Translates a bounded `$text` search over the collection's single text index. */
  fullTextSearch(expression: Expr): Value;

  /** Translates closed containment of a stored position in a constant polygon. */
  geoWithin(expression: Expr): Value;

  /** Translates intersection of a stored position with a constant polygon. */
  geoIntersects(expression: Expr): Value;

  /** Translates a great-circle distance bound between a stored position and a constant. */
  geoWithinDistance(expression: Expr): Value;

  /** Rejects a library expression that violates its documented input domain. */
  unsupportedExpression(expression: Expr): CelqlError;
}

/** A translation function that emits one structured MongoDB filter document. */
export type MongoDbTranslation = (context: MongoDbLibraryContext, expression: Expr) => Value;

/** Per-request MongoDB filter generator for implementations that extend this profile. */
class MongoDbTranslationContext implements MongoDbLibraryContext {
  /** Number of enclosing disjunctions and negations at the current visit position. */
  private conjunctiveDepth = 0;

  public constructor(
    private readonly context: ProfileContext,
    private readonly functions: ReadonlyMap<string, MongoDbTranslation>,
  ) {}

  public validate(): void {
    this.translate();
  }

  public translate(): MessageShape<typeof MongoDbPredicateSchema> {
    const root = this.context.checkedExpression.expr!;
    this.rejectUnsupportedTypes(root);
    const predicate = create(MongoDbPredicateSchema, { filter: this.visitBoolean(root) });
    const observed = BigInt(toBinary(MongoDbPredicateSchema, predicate).byteLength);
    if (observed > this.context.limits.maxOutputGrowth) {
      throw new CelqlError(TranslationErrorCode.RESOURCE_LIMIT_EXCEEDED, {
        message: "The output-growth limit was exceeded.",
        details: {
          limit: "max_output_growth",
          configured: this.context.limits.maxOutputGrowth.toString(),
          observed: observed.toString(),
        },
      });
    }
    return predicate;
  }

  private visitBoolean(expression: Expr): Value {
    if (expression.exprKind.case === "comprehensionExpr") {
      return this.arrayExists(expression);
    }
    if (expression.exprKind.case === "identExpr" || expression.exprKind.case === "selectExpr") {
      const operand = this.operand(expression);
      if (operand.kind !== "path" || typeName(operand.type) !== "bool") {
        throw this.unsupportedExpression(expression);
      }
      return predicate(operand.path, "$eq", booleanValue(true));
    }
    if (expression.exprKind.case !== "callExpr") throw this.unsupportedExpression(expression);
    const overloadId = this.overloadId(expression);
    const libraryFunction = this.functions.get(overloadId);
    if (libraryFunction !== undefined) return libraryFunction(this, expression);
    const operands = this.operands(expression);
    switch (overloadId) {
      case "logical_and":
        if (operands.length !== 2) throw this.unsupportedOverload(expression, overloadId);
        return operatorList(
          "$and",
          operands.map((operand) => this.visitBoolean(operand)),
        );
      case "logical_or":
        if (operands.length !== 2) throw this.unsupportedOverload(expression, overloadId);
        return this.outsideConjunction(() =>
          operatorList(
            "$or",
            operands.map((operand) => this.visitBoolean(operand)),
          ),
        );
      case "logical_not":
        if (operands.length !== 1) throw this.unsupportedOverload(expression, overloadId);
        return this.outsideConjunction(() =>
          operatorList("$nor", [this.visitBoolean(operands[0]!)]),
        );
      case "equals":
      case "not_equals":
        return this.comparison(
          expression,
          operands,
          overloadId,
          overloadId === "equals" ? "$eq" : "$ne",
        );
      case "less_int64":
      case "less_uint64":
      case "less_double":
      case "less_string":
        return this.comparison(expression, operands, overloadId, "$lt");
      case "less_equals_int64":
      case "less_equals_uint64":
      case "less_equals_double":
      case "less_equals_string":
        return this.comparison(expression, operands, overloadId, "$lte");
      case "greater_int64":
      case "greater_uint64":
      case "greater_double":
      case "greater_string":
        return this.comparison(expression, operands, overloadId, "$gt");
      case "greater_equals_int64":
      case "greater_equals_uint64":
      case "greater_equals_double":
      case "greater_equals_string":
        return this.comparison(expression, operands, overloadId, "$gte");
      case "starts_with_string":
      case "ends_with_string":
      case "contains_string":
        return this.pattern(expression, operands, overloadId);
      case "matches_string":
        return this.regex(expression, operands);
      case "in_list":
        return this.membership(expression, operands);
      default:
        throw this.unsupportedOverload(expression, overloadId);
    }
  }

  private comparison(
    expression: Expr,
    expressions: readonly Expr[],
    overloadId: string,
    operator: "$eq" | "$ne" | "$lt" | "$lte" | "$gt" | "$gte",
  ): Value {
    if (expressions.length !== 2) throw this.unsupportedOverload(expression, overloadId);
    const left = this.operand(expressions[0]!);
    const right = this.operand(expressions[1]!);
    if (left.kind === "path" && right.kind === "constant") {
      return predicate(left.path, operator, right.value);
    }
    if (left.kind === "constant" && right.kind === "path") {
      return predicate(right.path, reverseComparison(operator), left.value);
    }
    throw this.unsupportedOverload(expression, overloadId);
  }

  private pattern(expression: Expr, expressions: readonly Expr[], overloadId: string): Value {
    if (expressions.length !== 2) throw this.unsupportedOverload(expression, overloadId);
    const path = this.operand(expressions[0]!);
    const value = this.operand(expressions[1]!);
    if (
      path.kind !== "path" ||
      value.kind !== "constant" ||
      value.value.kind.case !== "stringValue"
    ) {
      throw this.unsupportedOverload(expression, overloadId);
    }
    const escaped = escapeRegex(value.value.kind.value);
    const pattern =
      overloadId === "starts_with_string"
        ? `^${escaped}`
        : overloadId === "ends_with_string"
          ? `${escaped}$`
          : escaped;
    return predicate(path.path, "$regex", stringValue(pattern));
  }

  /** Passes a constant pattern only after proving it is in the documented shared regex subset. */
  private regex(expression: Expr, expressions: readonly Expr[]): Value {
    if (expressions.length !== 2) throw this.unsupportedOverload(expression, "matches_string");
    const path = this.operand(expressions[0]!);
    const value = this.operand(expressions[1]!);
    if (
      path.kind !== "path" ||
      value.kind !== "constant" ||
      value.value.kind.case !== "stringValue"
    ) {
      throw this.unsupportedOverload(expression, "matches_string");
    }
    const pattern = value.value.kind.value;
    const bytes = BigInt(new TextEncoder().encode(pattern).byteLength);
    if (bytes > this.context.limits.maxRegexPatternBytes) {
      throw new CelqlError(TranslationErrorCode.RESOURCE_LIMIT_EXCEEDED, {
        expressionNodeId: value.expression.id,
        message: "The regular-expression pattern limit was exceeded.",
        details: {
          limit: "max_regex_pattern_bytes",
          configured: this.context.limits.maxRegexPatternBytes.toString(),
          observed: bytes.toString(),
        },
      });
    }
    if (!isMongoDbRegex(pattern)) throw this.unsupportedExpression(value.expression);
    return predicate(path.path, "$regex", stringValue(pattern));
  }

  private membership(expression: Expr, expressions: readonly Expr[]): Value {
    if (expressions.length !== 2) throw this.unsupportedOverload(expression, "in_list");
    const path = this.operand(expressions[0]!);
    const list = expressions[1]!;
    if (path.kind === "constant") {
      const array = this.operand(list);
      if (array.kind === "path" && typeName(array.type) === "list(string)") {
        return predicate(array.path, "$eq", path.value);
      }
    }
    if (path.kind !== "path" || list.exprKind.case !== "listExpr") {
      throw this.unsupportedOverload(expression, "in_list");
    }
    const values = list.exprKind.value.elements.map((element) => {
      const operand = this.operand(element);
      if (operand.kind !== "constant") throw this.unsupportedOverload(expression, "in_list");
      return operand.value;
    });
    if (values.length === 0) throw this.unsupportedExpression(list);
    return predicate(path.path, "$in", listValue(values));
  }

  private arrayExists(expression: Expr): Value {
    const exists = arrayEqualityExists(expression, (current) => this.overloadId(current));
    if (exists === undefined) throw this.unsupportedExpression(expression);
    const array = this.operand(exists.array);
    const constant = this.operand(exists.constant);
    if (
      array.kind !== "path" ||
      constant.kind !== "constant" ||
      typeName(array.type) !== "list(string)" ||
      typeName(constant.type) !== "string"
    ) {
      throw this.unsupportedExpression(expression);
    }
    return predicate(array.path, "$eq", constant.value);
  }

  private operand(expression: Expr): Operand {
    const type = this.typeOf(expression);
    if (typeName(type) === "null_type" || typeName(type) === "unsupported") {
      throw this.unsupportedExpression(expression);
    }
    switch (expression.exprKind.case) {
      case "identExpr":
      case "selectExpr":
        return { kind: "path", expression, path: this.fieldPath(expression), type };
      case "constExpr":
        return {
          kind: "constant",
          expression,
          value: this.constant(expression.exprKind.value),
          type,
        };
      default:
        throw this.unsupportedExpression(expression);
    }
  }

  /** Resolves a library operand to one safe MongoDB query field path. */
  public queryFieldPath(expression: Expr): string {
    const operand = this.operand(expression);
    if (operand.kind !== "path") throw this.unsupportedExpression(expression);
    return operand.path;
  }

  /** Resolves a library operand to one supported typed CEL constant. */
  public constantValue(expression: Expr): Value {
    const operand = this.operand(expression);
    if (operand.kind !== "constant") throw this.unsupportedExpression(expression);
    return operand.value;
  }

  /** Resolves a library call with its receiver before its explicit arguments. */
  public callOperands(expression: Expr): readonly Expr[] {
    return this.operands(expression);
  }

  /** Creates a structured field-operator predicate for a trusted translation library. */
  public fieldOperator(path: string, operator: string, value: Value): Value {
    return predicate(path, operator, value);
  }

  /** Creates a field predicate without letting a library serialize MongoDB syntax. */
  public fieldOperators(path: string, entries: readonly (readonly [string, Value])[]): Value {
    return mapValue([[path, mapValue(entries)]]);
  }

  /** Translates a full-text match that requires every query term. */
  public fullTextSearch(expression: Expr): Value {
    const operands = this.operands(expression);
    if (operands.length !== 2) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    const index = this.operand(operands[0]!);
    const query = this.operand(operands[1]!);
    if (
      index.kind !== "path" ||
      typeName(index.type) !== fullTextIndexTypeName ||
      query.kind !== "constant" ||
      query.value.kind.case !== "stringValue"
    ) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    if (!isFullTextQuery(query.value.kind.value) || !this.inConjunction()) {
      throw this.unsupportedExpression(operands[1]!);
    }
    // A quoted term is a phrase, and MongoDB requires every phrase of a search
    // to occur. The accepted query domain contains no quotation mark, so the
    // constant cannot introduce another phrase or a negation.
    const search = fullTextQueryTerms(query.value.kind.value)
      .map((term) => `"${term}"`)
      .join(" ");
    return mapValue([["$text", mapValue([["$search", stringValue(search)]])]]);
  }

  /** Translates closed containment of a stored position in a constant polygon. */
  public geoWithin(expression: Expr): Value {
    return this.geoPolygonRelation(expression, "$geoWithin");
  }

  /** Translates intersection of a stored position with a constant polygon. */
  public geoIntersects(expression: Expr): Value {
    return this.geoPolygonRelation(expression, "$geoIntersects");
  }

  /** Translates a great-circle distance bound between a stored position and a constant. */
  public geoWithinDistance(expression: Expr): Value {
    const operands = this.operands(expression);
    if (operands.length !== 3) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    const path = this.geoPointField(expression, operands[0]!);
    const center = geoPointArgument(operands[1]!, (current) => this.overloadId(current));
    if (center === undefined) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    if (center === "invalid") throw this.unsupportedExpression(operands[1]!);
    const meters = this.operand(operands[2]!);
    if (meters.kind !== "constant" || meters.value.kind.case !== "doubleValue") {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    if (!isDistanceBound(meters.value.kind.value)) {
      throw this.unsupportedExpression(operands[2]!);
    }
    // $centerSphere takes a radius in radians on the same sphere that the
    // library's distance operation defines.
    return mapValue([
      [
        path,
        mapValue([
          [
            "$geoWithin",
            mapValue([
              [
                "$centerSphere",
                listValue([
                  position(center),
                  doubleValue(meters.value.kind.value / earthRadiusMeters),
                ]),
              ],
            ]),
          ],
        ]),
      ],
    ]);
  }

  private geoPolygonRelation(expression: Expr, operator: "$geoWithin" | "$geoIntersects"): Value {
    const operands = this.operands(expression);
    if (operands.length !== 2) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    const path = this.geoPointField(expression, operands[0]!);
    const polygon = geoPolygonArgument(operands[1]!, (current) => this.overloadId(current));
    if (polygon === undefined) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    if (polygon === "invalid") throw this.unsupportedExpression(operands[1]!);
    return mapValue([
      [
        path,
        mapValue([
          [
            operator,
            mapValue([
              [
                "$geometry",
                mapValue([
                  ["type", stringValue("Polygon")],
                  ["coordinates", listValue([listValue(polygon.ring.map(position))])],
                ]),
              ],
            ]),
          ],
        ]),
      ],
    ]);
  }

  /** Requires the receiver of a spatial operation to be a stored position. */
  private geoPointField(expression: Expr, operand: Expr): string {
    const point = this.operand(operand);
    if (point.kind !== "path" || typeName(point.type) !== geoPointTypeName) {
      throw this.unsupportedOverload(expression, this.overloadId(expression));
    }
    return point.path;
  }

  /** Reports whether a conjunction alone reaches the predicate being emitted. */
  private inConjunction(): boolean {
    return this.conjunctiveDepth === 0;
  }

  /** Visits a subtree that the emitted filter no longer reaches through conjunction alone. */
  private outsideConjunction(visit: () => Value): Value {
    this.conjunctiveDepth += 1;
    try {
      return visit();
    } finally {
      this.conjunctiveDepth -= 1;
    }
  }

  private constant(constant: Constant): Value {
    if (constant.constantKind.case === "nullValue") {
      throw new CelqlError(TranslationErrorCode.UNSUPPORTED_EXPRESSION, {
        message: "The MongoDB profile does not support CEL null.",
      });
    }
    if (
      constant.constantKind.case === "uint64Value" &&
      constant.constantKind.value > signedMaximum
    ) {
      throw new CelqlError(TranslationErrorCode.UNSAFE_TRANSLATION, {
        message: "The unsigned integer does not fit MongoDB's signed integer domain.",
      });
    }
    switch (constant.constantKind.case) {
      case "boolValue":
      case "int64Value":
      case "uint64Value":
      case "doubleValue":
      case "stringValue":
      case "bytesValue":
        return create(ValueSchema, { kind: constant.constantKind });
      default:
        throw new CelqlError(TranslationErrorCode.UNSUPPORTED_EXPRESSION, {
          message: "The MongoDB profile does not support this CEL constant type.",
        });
    }
  }

  private operands(expression: Expr): readonly Expr[] {
    const call = expression.exprKind.case === "callExpr" ? expression.exprKind.value : undefined;
    if (call === undefined) throw this.unsupportedExpression(expression);
    return call.target === undefined ? call.args : [call.target, ...call.args];
  }

  private overloadId(expression: Expr): string {
    const reference = this.context.checkedExpression.referenceMap[expression.id.toString()];
    if (reference === undefined || reference.overloadId.length !== 1) {
      throw this.unsupportedOverload(expression, reference?.overloadId.join(",") ?? "");
    }
    return reference.overloadId[0]!;
  }

  private fieldPath(expression: Expr): string {
    const components: string[] = [];
    let current: Expr | undefined = expression;
    while (current?.exprKind.case === "selectExpr") {
      const selection: { field: string; testOnly: boolean; operand?: Expr } =
        current.exprKind.value;
      if (selection.testOnly) throw this.unsupportedExpression(current);
      components.unshift(selection.field);
      current = selection.operand;
    }
    if (current?.exprKind.case !== "identExpr") throw this.unresolvedPath(expression);
    components.unshift(...current.exprKind.value.name.split("."));
    if (
      components.some(
        (component) =>
          component.length === 0 ||
          component.includes("\0") ||
          component.includes(".") ||
          component.startsWith("$"),
      )
    ) {
      throw this.unresolvedPath(expression);
    }
    return components.join(".");
  }

  private rejectUnsupportedTypes(root: Expr): void {
    const stack = [root];
    while (stack.length > 0) {
      const expression = stack.pop()!;
      // A call the profile does not own carries the operand domain of a
      // translation library, which validates its own operands, or is rejected
      // as an unsupported overload during the visit.
      if (
        expression.exprKind.case === "callExpr" &&
        !profileOverloads.has(this.overloadId(expression))
      ) {
        continue;
      }
      const type = this.typeOf(expression);
      if (typeName(type) === "null_type" || type.typeKind.case === "abstractType") {
        throw this.unsupportedExpression(expression);
      }
      stack.push(...children(expression));
    }
  }

  private typeOf(expression: Expr): Type {
    const type = this.context.checkedExpression.typeMap[expression.id.toString()];
    if (type === undefined) {
      throw new CelqlError(TranslationErrorCode.INVALID_CHECKED_EXPRESSION, {
        expressionNodeId: expression.id,
        message: "A reachable expression node has no resolved type.",
      });
    }
    return type;
  }

  public unsupportedExpression(expression: Expr): CelqlError {
    return new CelqlError(TranslationErrorCode.UNSUPPORTED_EXPRESSION, {
      expressionNodeId: expression.id,
      message: "The expression form is not supported by the MongoDB profile.",
    });
  }

  private unsupportedOverload(expression: Expr, overloadId: string): CelqlError {
    return new CelqlError(TranslationErrorCode.UNSUPPORTED_OVERLOAD, {
      expressionNodeId: expression.id,
      message: "The resolved overload is not supported by the MongoDB profile.",
      details: overloadId.length === 0 ? {} : { overload_id: overloadId },
    });
  }

  private unresolvedPath(expression: Expr): CelqlError {
    return new CelqlError(TranslationErrorCode.UNRESOLVED_QUERY_FIELD_PATH, {
      expressionNodeId: expression.id,
      message: "The expression cannot be represented as a MongoDB query field path.",
    });
  }
}

/**
 * Translates the MongoDB version 1 non-null scalar fragment.
 *
 * The profile emits `MongoDbPredicate.filter` as a typed `cel.expr.Value`
 * document. It never creates a JavaScript driver object or treats a CEL
 * constant as a MongoDB operator. CEL null, optional values, temporal values,
 * and field-absence tests are rejected. `matches_string` accepts only the
 * documented resource-bounded RE2 and PCRE2 subset.
 */
export class MongoDbProfile implements Profile<typeof MongoDbPredicateSchema, MongoDbTranslation> {
  /** Capability declaration for the MongoDB filter translation fragment. */
  public static readonly capability = capability;

  /** Machine-readable declaration for this profile instance. */
  public readonly capability = MongoDbProfile.capability;

  /** Protobuf schema produced by this profile. */
  public readonly outputSchema = MongoDbPredicateSchema;

  /** Rejects configuration because this MongoDB fragment has no configuration surface. */
  public readonly validateConfiguration = (
    configuration: Parameters<NonNullable<Profile["validateConfiguration"]>>[0],
  ) => {
    if (configuration !== undefined) {
      throw new CelqlError(TranslationErrorCode.INVALID_PROFILE_CONFIGURATION, {
        message: "The MongoDB profile accepts no configuration.",
      });
    }
  };

  /** Validates one expression through the constructed profile. */
  public validate(
    context: Parameters<Profile["validate"]>[0],
    functions: ReadonlyMap<string, MongoDbTranslation>,
  ): void {
    new MongoDbTranslationContext(context, functions).validate();
  }

  /** Translates one expression through the constructed profile. */
  public translate(
    context: Parameters<Profile["translate"]>[0],
    functions: ReadonlyMap<string, MongoDbTranslation>,
  ): MessageShape<typeof MongoDbPredicateSchema> {
    return new MongoDbTranslationContext(context, functions).translate();
  }
}

function predicate(path: string, operator: string, value: Value): Value {
  return mapValue([[path, mapValue([[operator, value]])]]);
}

function operatorList(operator: "$and" | "$or" | "$nor", values: readonly Value[]): Value {
  return mapValue([[operator, listValue(values)]]);
}

function mapValue(entries: readonly (readonly [string, Value])[]): Value {
  return create(ValueSchema, {
    kind: {
      case: "mapValue",
      value: create(MapValueSchema, {
        entries: entries.map(([key, value]) =>
          create(MapValue_EntrySchema, { key: stringValue(key), value }),
        ),
      }),
    },
  });
}

function listValue(values: readonly Value[]): Value {
  return create(ValueSchema, {
    kind: { case: "listValue", value: create(ListValueSchema, { values: [...values] }) },
  });
}

function stringValue(value: string): Value {
  return create(ValueSchema, { kind: { case: "stringValue", value } });
}

/** Encodes one position as a GeoJSON coordinate pair. */
function position(point: GeoPointValue): Value {
  return listValue([doubleValue(point.longitude), doubleValue(point.latitude)]);
}

function doubleValue(value: number): Value {
  return create(ValueSchema, { kind: { case: "doubleValue", value } });
}

function booleanValue(value: boolean): Value {
  return create(ValueSchema, { kind: { case: "boolValue", value } });
}

function reverseComparison(
  operator: "$eq" | "$ne" | "$lt" | "$lte" | "$gt" | "$gte",
): "$eq" | "$ne" | "$lt" | "$lte" | "$gt" | "$gte" {
  switch (operator) {
    case "$lt":
      return "$gt";
    case "$lte":
      return "$gte";
    case "$gt":
      return "$lt";
    case "$gte":
      return "$lte";
    default:
      return operator;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function typeName(type: Type): string {
  if (type.typeKind.case === "null") return "null_type";
  if (type.typeKind.case === "listType") {
    return `list(${type.typeKind.value.elemType === undefined ? "dyn" : typeName(type.typeKind.value.elemType)})`;
  }
  // An opaque type belongs to a translation library, which decides whether it
  // supports the type that its own operation declares.
  if (type.typeKind.case === "abstractType") return type.typeKind.value.name;
  if (type.typeKind.case !== "primitive") return "unsupported";
  return (
    (
      {
        [Type_PrimitiveType.BOOL]: "bool",
        [Type_PrimitiveType.INT64]: "int",
        [Type_PrimitiveType.UINT64]: "uint",
        [Type_PrimitiveType.DOUBLE]: "double",
        [Type_PrimitiveType.STRING]: "string",
        [Type_PrimitiveType.BYTES]: "bytes",
      } as Record<number, string>
    )[type.typeKind.value] ?? "unsupported"
  );
}

function children(expression: Expr): Expr[] {
  switch (expression.exprKind.case) {
    case "selectExpr":
      return expression.exprKind.value.operand === undefined
        ? []
        : [expression.exprKind.value.operand];
    case "callExpr":
      return expression.exprKind.value.target === undefined
        ? expression.exprKind.value.args
        : [expression.exprKind.value.target, ...expression.exprKind.value.args];
    case "listExpr":
      return expression.exprKind.value.elements;
    case "structExpr":
      return expression.exprKind.value.entries.flatMap((entry) => [
        ...(entry.keyKind.case === "mapKey" ? [entry.keyKind.value] : []),
        ...(entry.value === undefined ? [] : [entry.value]),
      ]);
    case "comprehensionExpr":
      return [
        expression.exprKind.value.iterRange,
        expression.exprKind.value.accuInit,
        expression.exprKind.value.loopCondition,
        expression.exprKind.value.loopStep,
        expression.exprKind.value.result,
      ].filter((value): value is Expr => value !== undefined);
    default:
      return [];
  }
}
