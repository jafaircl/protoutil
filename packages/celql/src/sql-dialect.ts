import { create, type DescMessage, type MessageShape } from "@bufbuild/protobuf";
import { anyPack, DurationSchema, TimestampSchema } from "@bufbuild/protobuf/wkt";
import type { Type } from "./gen/cel/expr/checked_pb.js";
import { Type_PrimitiveType, Type_WellKnownType } from "./gen/cel/expr/checked_pb.js";
import type { Constant, Expr } from "./gen/cel/expr/syntax_pb.js";
import { ConstantSchema } from "./gen/cel/expr/syntax_pb.js";
import type { Value } from "./gen/cel/expr/value_pb.js";
import { ValueSchema } from "./gen/cel/expr/value_pb.js";
import { TranslationErrorCode } from "./gen/protoutil/celql/v1/celql_pb.js";
import { CelqlError } from "./translator.js";
import { Dialect } from "./types.js";

const signedMaximum = 9_223_372_036_854_775_807n;

const orderingOperators = new Map<string, string>([
  ["less_int64", "<"],
  ["less_uint64", "<"],
  ["less_double", "<"],
  ["less_string", "<"],
  ["less_timestamp", "<"],
  ["less_duration", "<"],
  ["less_equals_int64", "<="],
  ["less_equals_uint64", "<="],
  ["less_equals_double", "<="],
  ["less_equals_string", "<="],
  ["less_equals_timestamp", "<="],
  ["less_equals_duration", "<="],
  ["greater_int64", ">"],
  ["greater_uint64", ">"],
  ["greater_double", ">"],
  ["greater_string", ">"],
  ["greater_timestamp", ">"],
  ["greater_duration", ">"],
  ["greater_equals_int64", ">="],
  ["greater_equals_uint64", ">="],
  ["greater_equals_double", ">="],
  ["greater_equals_string", ">="],
  ["greater_equals_timestamp", ">="],
  ["greater_equals_duration", ">="],
]);

const patternOperations = new Set(["starts_with_string", "ends_with_string", "contains_string"]);

type Operand =
  | { kind: "path"; expression: Expr; sql: string; type: Type }
  | { kind: "constant"; expression: Expr; constant: Constant; type: Type }
  | { kind: "folded"; expression: Expr; value: Value; type: Type }
  | { kind: "expression"; expression: Expr; sql: string };

type BoundParameter = {
  celType: Type;
  value: Value;
};

/**
 * Reusable ANSI-compatible visitor for textual SQL dialects.
 *
 * Recursive traversal uses protected methods so a dialect subclass can replace
 * one operation while inherited parents continue to dispatch through it.
 */
export abstract class SqlDialect<Desc extends DescMessage> extends Dialect<Desc> {
  /** Parameters in the same order as their markers appear during traversal. */
  protected readonly parameters: BoundParameter[] = [];

  /** Translates the checked expression into one dialect-specific SQL predicate. */
  public translate(): MessageShape<Desc> {
    this.validateConfiguration();
    const root = this.context.checkedExpression.expr!;
    this.rejectOptionalTypes(root);
    const sql = this.visitBoolean(root);
    this.enforceOutputGrowth(sql);
    return this.createPredicate(sql);
  }

  /** Creates the dialect-specific output after the shared SQL visit completes. */
  protected abstract createPredicate(sql: string): MessageShape<Desc>;

  /** Rejects configuration because a base SQL dialect has no options. */
  protected validateConfiguration(): void {
    if (this.context.profileConfiguration !== undefined) {
      throw new CelqlError(TranslationErrorCode.INVALID_PROFILE_CONFIGURATION, {
        message: "The SQL dialect accepts no configuration.",
      });
    }
  }

  /** Returns the marker for a parameter's one-based binding position. */
  protected parameterMarker(_position: bigint): string {
    return "?";
  }

  /** Visits an expression that must produce a Boolean SQL condition. */
  protected visitBoolean(expression: Expr): string {
    const operand = this.visitOperand(expression);
    switch (operand.kind) {
      case "path":
        if (typeName(operand.type) !== "bool") {
          throw unsupportedExpression(expression);
        }
        return this.checkedSql(`${operand.sql} = TRUE`);
      case "expression":
        return operand.sql;
      case "constant":
      case "folded":
        throw unsupportedExpression(expression);
    }
  }

  /** Visits one scalar, field-path, or translated-expression operand. */
  protected visitOperand(expression: Expr): Operand {
    const type = this.typeOf(expression);
    switch (expression.exprKind.case) {
      case "identExpr":
      case "selectExpr":
        return { kind: "path", expression, sql: this.visitFieldPath(expression), type };
      case "constExpr":
        return { kind: "constant", expression, constant: expression.exprKind.value, type };
      case "callExpr": {
        const overloadId = this.overloadId(expression);
        if (overloadId === "string_to_timestamp" || overloadId === "string_to_duration") {
          return this.visitConversion(expression, overloadId);
        }
        return { kind: "expression", expression, sql: this.visitCall(expression, overloadId) };
      }
      case "comprehensionExpr":
        return { kind: "expression", expression, sql: this.visitComprehension(expression) };
      default:
        throw unsupportedExpression(expression);
    }
  }

  /** Visits one resolved call and provides the primary custom-dialect hook. */
  protected visitCall(expression: Expr, overloadId: string): string {
    if (overloadId.startsWith("celql.reserved.unsupported.")) {
      throw unsupportedOverload(expression, overloadId);
    }
    const operands = this.operands(expression);
    if (overloadId === "logical_and" || overloadId === "logical_or") {
      if (operands.length !== 2) throw unsupportedOverload(expression, overloadId);
      const operator = overloadId === "logical_and" ? "AND" : "OR";
      return this.checkedSql(
        `(${this.visitBoolean(operands[0]!)} ${operator} ${this.visitBoolean(operands[1]!)})`,
      );
    }
    if (overloadId === "logical_not") {
      if (operands.length !== 1) throw unsupportedOverload(expression, overloadId);
      return this.checkedSql(`(NOT ${this.visitBoolean(operands[0]!)})`);
    }
    if (overloadId === "equals" || overloadId === "not_equals") {
      return this.visitEquality(expression, operands, overloadId);
    }
    const ordering = orderingOperators.get(overloadId);
    if (ordering !== undefined) {
      return this.visitOrdering(expression, operands, overloadId, ordering);
    }
    if (patternOperations.has(overloadId)) {
      return this.visitPattern(expression, operands, overloadId);
    }
    if (overloadId === "in_list") {
      return this.visitMembership(expression, operands);
    }
    throw unsupportedOverload(expression, overloadId);
  }

  /** Returns a call target followed by its arguments, or only its arguments. */
  protected operands(expression: Expr): readonly Expr[] {
    const call = expression.exprKind.case === "callExpr" ? expression.exprKind.value : undefined;
    if (call === undefined) throw this.unsupportedExpression(expression);
    return call.target === undefined ? call.args : [call.target, ...call.args];
  }

  /** Emits total SQL equality so SQL NULL follows CEL equality semantics. */
  protected visitEquality(
    expression: Expr,
    expressions: readonly Expr[],
    overloadId: string,
  ): string {
    if (expressions.length !== 2) throw unsupportedOverload(expression, overloadId);
    const left = this.nonExpressionOperand(expressions[0]!, overloadId);
    const right = this.nonExpressionOperand(expressions[1]!, overloadId);
    this.requireComparisonShapes(expression, left, right, overloadId);
    if (left.kind === "path" && isNull(right)) {
      return this.checkedSql(`${left.sql} IS ${overloadId === "equals" ? "" : "NOT "}NULL`);
    }
    if (right.kind === "path" && isNull(left)) {
      return this.checkedSql(`${right.sql} IS ${overloadId === "equals" ? "" : "NOT "}NULL`);
    }
    const operator = overloadId === "equals" ? "IS NOT DISTINCT FROM" : "IS DISTINCT FROM";
    return this.checkedSql(
      `${this.visitComparable(left)} ${operator} ${this.visitComparable(right)}`,
    );
  }

  /** Emits ordering without a null guard because CEL errors and SQL unknown both reject a row. */
  protected visitOrdering(
    expression: Expr,
    expressions: readonly Expr[],
    overloadId: string,
    operator: string,
  ): string {
    if (expressions.length !== 2) throw unsupportedOverload(expression, overloadId);
    const left = this.nonExpressionOperand(expressions[0]!, overloadId);
    const right = this.nonExpressionOperand(expressions[1]!, overloadId);
    this.requireComparisonShapes(expression, left, right, overloadId);
    return this.checkedSql(
      `${this.visitComparable(left)} ${operator} ${this.visitComparable(right)}`,
    );
  }

  /** Converts a literal string predicate into an escaped bound LIKE pattern. */
  protected visitPattern(
    expression: Expr,
    expressions: readonly Expr[],
    overloadId: string,
  ): string {
    if (expressions.length !== 2) throw unsupportedOverload(expression, overloadId);
    const path = this.visitOperand(expressions[0]!);
    const value = this.visitOperand(expressions[1]!);
    if (
      path.kind !== "path" ||
      typeName(path.type) !== "string" ||
      value.kind !== "constant" ||
      value.constant.constantKind.case !== "stringValue"
    ) {
      throw unsupportedOverload(expression, overloadId);
    }
    const escaped = escapeLike(value.constant.constantKind.value);
    const pattern =
      overloadId === "starts_with_string"
        ? `${escaped}%`
        : overloadId === "ends_with_string"
          ? `%${escaped}`
          : `%${escaped}%`;
    const marker = this.bindConstant(
      value.expression,
      create(ConstantSchema, {
        constantKind: { case: "stringValue", value: pattern },
      }),
    );
    return this.checkedSql(`${path.sql} LIKE ${marker} ESCAPE '\\'`);
  }

  /** Emits literal-list membership with an explicit null guard. */
  protected visitMembership(expression: Expr, expressions: readonly Expr[]): string {
    if (expressions.length !== 2) throw unsupportedOverload(expression, "in_list");
    const path = this.visitOperand(expressions[0]!);
    const list = expressions[1]!;
    if (path.kind !== "path" || list.exprKind.case !== "listExpr") {
      throw unsupportedOverload(expression, "in_list");
    }
    if (list.exprKind.value.elements.length === 0) {
      throw unsupportedExpression(list);
    }
    const markers: string[] = [];
    for (const element of list.exprKind.value.elements) {
      if (
        element.exprKind.case !== "constExpr" ||
        typeName(this.typeOf(element)) !== typeName(path.type)
      ) {
        throw unsupportedOverload(expression, "in_list");
      }
      markers.push(this.bindConstant(element));
    }
    return this.checkedSql(`(${path.sql} IS NOT NULL AND ${path.sql} IN (${markers.join(", ")}))`);
  }

  /** Visits one lowered comprehension and provides the comprehension extension hook. */
  protected visitComprehension(expression: Expr): string {
    // CEL lowers `exists` to a Boolean accumulator. Accepting only that exact
    // lowering prevents a near-miss comprehension from changing query meaning.
    const comprehension =
      expression.exprKind.case === "comprehensionExpr" ? expression.exprKind.value : undefined;
    if (comprehension === undefined) throw unsupportedExpression(expression);
    if (comprehension.iterVar2.length > 0 || comprehension.iterVar === comprehension.accuVar) {
      throw unsupportedExpression(expression);
    }
    if (comprehension.loopStep?.exprKind.case === "callExpr") {
      const stepArgs = comprehension.loopStep.exprKind.value.args;
      const nested = stepArgs[1];
      if (
        nested?.exprKind.case === "comprehensionExpr" &&
        nested.exprKind.value.iterVar === comprehension.iterVar
      ) {
        throw unsupportedExpression(nested);
      }
    }
    if (
      comprehension.iterRange?.exprKind.case !== "listExpr" ||
      comprehension.iterRange.exprKind.value.elements.length === 0 ||
      !isBooleanConstant(comprehension.accuInit, false) ||
      !this.isExistsCondition(comprehension.loopCondition, comprehension.accuVar) ||
      !isIdent(comprehension.result, comprehension.accuVar) ||
      comprehension.loopStep?.exprKind.case !== "callExpr" ||
      this.overloadId(comprehension.loopStep) !== "logical_or"
    ) {
      throw unsupportedExpression(expression);
    }
    const step = comprehension.loopStep.exprKind.value.args;
    if (
      step.length !== 2 ||
      !isIdent(step[0], comprehension.accuVar) ||
      step[1]?.exprKind.case !== "callExpr" ||
      this.overloadId(step[1]) !== "equals"
    ) {
      throw unsupportedExpression(expression);
    }
    const equality = step[1].exprKind.value.args;
    if (equality.length !== 2 || !isIdent(equality[0], comprehension.iterVar)) {
      throw unsupportedExpression(expression);
    }
    const path = equality[1] === undefined ? undefined : this.visitOperand(equality[1]);
    if (path?.kind !== "path") throw unsupportedExpression(expression);
    const elementType = typeName(path.type);
    const markers: string[] = [];
    for (const element of comprehension.iterRange.exprKind.value.elements) {
      if (element.exprKind.case !== "constExpr" || typeName(this.typeOf(element)) !== elementType) {
        throw unsupportedExpression(expression);
      }
      markers.push(this.bindConstant(element));
    }
    return this.checkedSql(`(${path.sql} IS NOT NULL AND ${path.sql} IN (${markers.join(", ")}))`);
  }

  /** Recognizes the short-circuit condition in CEL's canonical `exists` lowering. */
  protected isExistsCondition(expression: Expr | undefined, accumulator: string): boolean {
    if (
      expression?.exprKind.case !== "callExpr" ||
      this.overloadId(expression) !== "not_strictly_false"
    ) {
      return false;
    }
    const negation = expression.exprKind.value.args[0];
    return (
      expression.exprKind.value.args.length === 1 &&
      negation?.exprKind.case === "callExpr" &&
      this.overloadId(negation) === "logical_not" &&
      negation.exprKind.value.args.length === 1 &&
      isIdent(negation.exprKind.value.args[0], accumulator)
    );
  }

  /** Folds constant timestamp and duration conversions without emitting SQL casts. */
  protected visitConversion(expression: Expr, overloadId: string): Operand {
    const call = expression.exprKind.case === "callExpr" ? expression.exprKind.value : undefined;
    const operands =
      call === undefined ? [] : call.target === undefined ? call.args : [call.target, ...call.args];
    if (operands.length !== 1 || operands[0]?.exprKind.case !== "constExpr") {
      throw unsupportedOverload(expression, overloadId);
    }
    const source = operands[0].exprKind.value;
    if (source.constantKind.case !== "stringValue") {
      throw unsupportedOverload(expression, overloadId);
    }
    const converted =
      overloadId === "string_to_timestamp"
        ? parseTimestamp(source.constantKind.value)
        : parseDuration(source.constantKind.value);
    if (converted === undefined) throw unsupportedExpression(operands[0]);
    const objectValue =
      converted.$typeName === "google.protobuf.Timestamp"
        ? anyPack(TimestampSchema, converted)
        : anyPack(DurationSchema, converted);
    return {
      kind: "folded",
      expression,
      type: this.typeOf(expression),
      value: create(ValueSchema, {
        kind: {
          case: "objectValue",
          value: objectValue,
        },
      }),
    };
  }

  /** Restricts a call operand to the field and constant shapes declared by the profile. */
  protected nonExpressionOperand(
    expression: Expr,
    overloadId: string,
  ): Exclude<Operand, { kind: "expression" }> {
    const operand = this.visitOperand(expression);
    if (operand.kind === "expression") throw unsupportedOverload(expression, overloadId);
    return operand;
  }

  /** Requires at least one field path and compatible types for field-to-field comparison. */
  protected requireComparisonShapes(
    expression: Expr,
    left: Exclude<Operand, { kind: "expression" }>,
    right: Exclude<Operand, { kind: "expression" }>,
    overloadId: string,
  ): void {
    if (left.kind !== "path" && right.kind !== "path") {
      throw unsupportedOverload(expression, overloadId);
    }
    if (
      left.kind === "path" &&
      right.kind === "path" &&
      typeName(left.type) !== typeName(right.type)
    ) {
      throw unsupportedOverload(expression, overloadId);
    }
  }

  /** Emits a path directly and binds every constant or folded value. */
  protected visitComparable(operand: Exclude<Operand, { kind: "expression" }>): string {
    if (operand.kind === "path") return operand.sql;
    if (operand.kind === "constant") {
      return this.bindConstant(operand.expression, operand.constant);
    }
    return this.bindValue(operand.expression, operand.type, operand.value);
  }

  /** Binds a CEL constant and returns its dialect-specific parameter marker. */
  protected bindConstant(expression: Expr, constant?: Constant): string {
    if (constant === undefined) {
      if (expression.exprKind.case !== "constExpr") throw this.unsupportedExpression(expression);
      constant = expression.exprKind.value;
    }
    if (
      constant.constantKind.case === "uint64Value" &&
      constant.constantKind.value > signedMaximum
    ) {
      throw new CelqlError(TranslationErrorCode.UNSAFE_TRANSLATION, {
        expressionNodeId: expression.id,
        message: "The unsigned value is outside the SQL dialect's portable range.",
      });
    }
    const value = constantValue(constant);
    if (value === undefined) throw this.unsupportedExpression(expression);
    return this.bindValue(expression, this.typeOf(expression), value);
  }

  /** Binds an already converted CEL value and returns its parameter marker. */
  protected bindValue(expression: Expr, type: Type, value: Value): string {
    const observed = BigInt(this.parameters.length + 1);
    if (observed > this.context.limits.maxParameters) {
      throw new CelqlError(TranslationErrorCode.RESOURCE_LIMIT_EXCEEDED, {
        expressionNodeId: expression.id,
        message: "The parameter-count limit was exceeded.",
        details: {
          limit: "max_parameters",
          configured: this.context.limits.maxParameters.toString(),
          observed: observed.toString(),
        },
      });
    }
    this.parameters.push({ celType: type, value });
    return this.parameterMarker(observed);
  }

  /** Encodes a checked query field path as delimited SQL identifiers. */
  protected visitFieldPath(expression: Expr): string {
    const components: string[] = [];
    let current: Expr | undefined = expression;
    while (current?.exprKind.case === "selectExpr") {
      if (current.exprKind.value.testOnly) throw unsupportedExpression(current);
      components.unshift(current.exprKind.value.field);
      current = current.exprKind.value.operand;
    }
    if (current?.exprKind.case !== "identExpr") {
      throw unresolvedPath(expression);
    }
    components.unshift(...current.exprKind.value.name.split("."));
    if (components.some((component) => component.length === 0 || component.includes("\0"))) {
      throw unresolvedPath(expression);
    }
    return components.map((component) => `"${component.replaceAll('"', '""')}"`).join(".");
  }

  /** Returns the checked type associated with a reachable expression node. */
  protected typeOf(expression: Expr): Type {
    const type = this.context.checkedExpression.typeMap[expression.id.toString()];
    if (type === undefined) {
      throw new CelqlError(TranslationErrorCode.INVALID_CHECKED_EXPRESSION, {
        expressionNodeId: expression.id,
        message: "A reachable expression node has no resolved type.",
      });
    }
    return type;
  }

  /** Returns the capability-profile name for a checked CEL type. */
  protected typeName(type: Type): string {
    return typeName(type);
  }

  /** Returns the sole overload selected by the CEL checker. */
  protected overloadId(expression: Expr): string {
    const reference = this.context.checkedExpression.referenceMap[expression.id.toString()];
    if (reference === undefined || reference.overloadId.length !== 1) {
      throw unsupportedOverload(expression, reference?.overloadId.join(",") ?? "");
    }
    return reference.overloadId[0]!;
  }

  /** Rejects optional values because absence has no portable SQL representation. */
  protected rejectOptionalTypes(root: Expr): void {
    const stack = [root];
    while (stack.length > 0) {
      const expression = stack.pop()!;
      const type = this.typeOf(expression);
      if (type.typeKind.case === "abstractType" && type.typeKind.value.name === "optional_type") {
        throw unsupportedExpression(expression);
      }
      stack.push(...children(expression));
    }
  }

  /** Applies the output-growth limit to each completed fragment during traversal. */
  protected checkedSql(sql: string): string {
    this.enforceOutputGrowth(sql);
    return sql;
  }

  /** Counts Unicode code points because that is the profile's declared growth unit. */
  protected enforceOutputGrowth(sql: string): void {
    const observed = BigInt([...sql].length);
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
  }

  /** Creates the standard rejection for an unsupported expression shape. */
  protected unsupportedExpression(expression: Expr): CelqlError {
    return unsupportedExpression(expression);
  }

  /** Creates the standard rejection for an unsupported resolved overload. */
  protected unsupportedOverload(expression: Expr, overloadId: string): CelqlError {
    return unsupportedOverload(expression, overloadId);
  }
}

function constantValue(constant: Constant) {
  switch (constant.constantKind.case) {
    case "boolValue":
    case "int64Value":
    case "uint64Value":
    case "doubleValue":
    case "stringValue":
    case "bytesValue":
    case "nullValue":
      return create(ValueSchema, { kind: constant.constantKind });
    case "durationValue":
      return create(ValueSchema, {
        kind: { case: "objectValue", value: anyPack(DurationSchema, constant.constantKind.value) },
      });
    case "timestampValue":
      return create(ValueSchema, {
        kind: { case: "objectValue", value: anyPack(TimestampSchema, constant.constantKind.value) },
      });
    case undefined:
      return undefined;
  }
}

function typeName(type: Type): string {
  switch (type.typeKind.case) {
    case "primitive":
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
    case "null":
      return "null_type";
    case "wellKnown":
      return type.typeKind.value === Type_WellKnownType.TIMESTAMP
        ? "google.protobuf.Timestamp"
        : type.typeKind.value === Type_WellKnownType.DURATION
          ? "google.protobuf.Duration"
          : "unsupported";
    case "listType":
      return `list(${type.typeKind.value.elemType === undefined ? "dyn" : typeName(type.typeKind.value.elemType)})`;
    default:
      return "unsupported";
  }
}

function isNull(operand: Operand): boolean {
  return operand.kind === "constant" && operand.constant.constantKind.case === "nullValue";
}

function isBooleanConstant(expression: Expr | undefined, value: boolean): boolean {
  return (
    expression?.exprKind.case === "constExpr" &&
    expression.exprKind.value.constantKind.case === "boolValue" &&
    expression.exprKind.value.constantKind.value === value
  );
}

function isIdent(expression: Expr | undefined, name: string): boolean {
  return expression?.exprKind.case === "identExpr" && expression.exprKind.value.name === name;
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function parseTimestamp(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(
    value,
  );
  if (match === null) return undefined;
  const milliseconds = Date.parse(`${match[1]}${match[3]}`);
  if (!Number.isFinite(milliseconds)) return undefined;
  const seconds = BigInt(Math.floor(milliseconds / 1000));
  const nanos = Number((match[2] ?? "").padEnd(9, "0"));
  return create(TimestampSchema, { seconds, nanos });
}

function parseDuration(value: string) {
  const match = /^(-)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)(?:\.(\d{1,9}))?s)?$/.exec(value);
  if (match === null || match[0] === "" || match.slice(2).every((part) => part === undefined)) {
    return undefined;
  }
  const sign = match[1] === undefined ? 1n : -1n;
  const seconds =
    sign * (BigInt(match[2] ?? 0) * 3600n + BigInt(match[3] ?? 0) * 60n + BigInt(match[4] ?? 0));
  const nanos = Number(sign) * Number((match[5] ?? "").padEnd(9, "0"));
  return create(DurationSchema, { seconds, nanos });
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

function unsupportedExpression(expression: Expr): CelqlError {
  return new CelqlError(TranslationErrorCode.UNSUPPORTED_EXPRESSION, {
    expressionNodeId: expression.id,
    message: "The expression form is not supported by the SQL dialect.",
  });
}

function unsupportedOverload(expression: Expr, overloadId: string): CelqlError {
  return new CelqlError(TranslationErrorCode.UNSUPPORTED_OVERLOAD, {
    expressionNodeId: expression.id,
    message: "The resolved overload is not supported by the SQL dialect.",
    details: overloadId.length === 0 ? {} : { overload_id: overloadId },
  });
}

function unresolvedPath(expression: Expr): CelqlError {
  return new CelqlError(TranslationErrorCode.UNRESOLVED_QUERY_FIELD_PATH, {
    expressionNodeId: expression.id,
    message: "The query field path cannot be encoded safely.",
  });
}
