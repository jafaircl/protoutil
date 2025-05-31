/* eslint-disable no-case-declarations */
import {
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  IntType,
  ListType,
  StringType,
  TimestampType,
  UintType,
} from '@bearclaw/cel';
import { Expr, Expr_CreateList } from '@buf/google_cel-spec.bufbuild_es/cel/expr/syntax_pb.js';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { durationFromString, durationNanos, timestampFromDateString } from '@protoutil/core';
import {
  isBinaryOrTernaryOperator,
  unwrapBoolConstant,
  unwrapDoubleConstant,
  unwrapIntConstant,
  unwrapStringConstant,
  unwrapUintConstant,
} from '../common.js';
import { Dialect } from '../dialect.js';
import { ALL_KEYWORDS } from '../keywords.js';
import {
  ADD_OPERATOR,
  EQUALS_OPERATOR,
  findReverse,
  IN_OPERATOR,
  INDEX_OPERATOR,
  LOGICAL_AND_OPERATOR,
  LOGICAL_NOT_OPERATOR,
  LOGICAL_OR_OPERATOR,
  NOT_EQUALS_OPERATOR,
} from '../operators.js';
import {
  AT_TIMEZONE_OVERLOAD,
  CONTAINS_OVERLOAD,
  ENDS_WITH_OVERLOAD,
  LIKE_OVERLOAD,
  SIZE_OVERLOAD,
  STARTS_WITH_OVERLOAD,
  STRING_LOWER_OVERLOAD,
  STRING_TRIM_OVERLOAD,
  STRING_UPPER_OVERLOAD,
  TIME_GET_DATE_OVERLOAD,
  TIME_GET_DAY_OF_WEEK_OVERLOAD,
  TIME_GET_DAY_OF_YEAR_OVERLOAD,
  TIME_GET_FULL_YEAR_OVERLOAD,
  TIME_GET_HOURS_OVERLOAD,
  TIME_GET_MILLISECONDS_OVERLOAD,
  TIME_GET_MINUTES_OVERLOAD,
  TIME_GET_MONTH_OVERLOAD,
  TIME_GET_SECONDS_OVERLOAD,
  TIMESTAMP_NOW,
  TYPE_CONVERT_BOOL_OVERLOAD,
  TYPE_CONVERT_BYTES_OVERLOAD,
  TYPE_CONVERT_DATE_OVERLOAD,
  TYPE_CONVERT_DOUBLE_OVERLOAD,
  TYPE_CONVERT_DURATION_OVERLOAD,
  TYPE_CONVERT_INT_OVERLOAD,
  TYPE_CONVERT_STRING_OVERLOAD,
  TYPE_CONVERT_TIME_OVERLOAD,
  TYPE_CONVERT_TIMESTAMP_OVERLOAD,
  TYPE_CONVERT_UINT_OVERLOAD,
} from '../overloads.js';
import { DateType, TimeType } from '../types.js';
import { Unparser } from '../unparser.js';

// TODO: make DefaultDialect ANSI SQL compliant, or at least more compliant.

/**
 * DefaultDialect is the default SQL dialect used by CelQL. It aims to be as compatible
 * as possible with ANSI SQL, while also supporting some common extensions.
 */
export class DefaultDialect implements Dialect {
  writeQueryParam(unparser: Unparser, param: unknown): void {
    unparser.pushVar(param);
    unparser.writeString(`$${unparser.vars.length}`);
  }

  maybeQuoteIdentifier(identifier: string): string {
    const identifierRegex = /^[A-Za-z_][0-9A-Za-z_]*$/;
    if (ALL_KEYWORDS.has(identifier.toUpperCase()) || !identifierRegex.test(identifier)) {
      return `"${identifier}"`;
    }
    return identifier;
  }

  createList(unparser: Unparser, listExpr: Expr_CreateList): void {
    const elems = listExpr.elements;
    unparser.writeString('ARRAY[');
    for (let i = 0; i < elems.length; i++) {
      if (i > 0) {
        unparser.writeString(', ');
      }
      unparser.visit(elems[i]);
    }
    unparser.writeString(']');
  }

  name() {
    return 'default';
  }

  booleanDataType() {
    return 'BOOLEAN';
  }

  castToBoolean(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.kind()) {
      case BoolType.kind():
        unparser.visit(expr);
        return true;
      case StringType.kind():
        unparser.writeString(`CAST(`);
        unparser.visit(expr);
        unparser.writeString(` AS `);
        unparser.writeString(this.booleanDataType());
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot cast expression of type ${type?.typeName()} to boolean`
        );
    }
  }

  bytesDataType() {
    return 'VARBINARY';
  }

  castToBytes(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.kind()) {
      case BytesType.kind():
        unparser.visit(expr);
        return true;
      case StringType.kind():
        unparser.writeString(`CAST(`);
        unparser.visit(expr);
        unparser.writeString(` AS `);
        unparser.writeString(this.bytesDataType());
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot cast expression of type ${type?.typeName()} to bytes`
        );
    }
  }

  dateDataType() {
    return 'DATE';
  }

  castToDate(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.typeName()) {
      case DateType.typeName():
        unparser.visit(expr);
        return true;
      case StringType.typeName():
      case TimestampType.typeName():
        unparser.writeString(`CAST(`);
        unparser.visit(expr);
        unparser.writeString(` AS `);
        unparser.writeString(this.dateDataType());
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot cast expression of type ${type?.typeName()} to date`
        );
    }
  }

  doubleDataType() {
    return 'DOUBLE PRECISION';
  }

  castToDouble(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.kind()) {
      case DoubleType.kind():
        unparser.visit(expr);
        return true;
      case IntType.kind():
      case StringType.kind():
      case UintType.kind():
        unparser.writeString(`CAST(`);
        unparser.visit(expr);
        unparser.writeString(` AS `);
        unparser.writeString(this.doubleDataType());
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot cast expression of type ${type?.typeName()} to double`
        );
    }
  }

  durationDataType() {
    return 'INTERVAL';
  }

  castToDuration(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.kind()) {
      case DurationType.kind():
        unparser.visit(expr);
        return true;
      case DoubleType.kind():
        const durationDouble = unwrapDoubleConstant(expr);
        unparser.writeString(`INTERVAL '1 SECOND' * `);
        if (durationDouble) {
          unparser.writeQueryParam(durationDouble);
        } else {
          unparser.visit(expr);
        }
        return true;
      case IntType.kind():
        const durationInt = unwrapIntConstant(expr);
        unparser.writeString(`INTERVAL '1 SECOND' * `);
        if (durationInt) {
          unparser.writeQueryParam(durationInt);
        } else {
          unparser.visit(expr);
        }
        return true;
      case StringType.kind():
        const durationStr = unwrapStringConstant(expr);
        unparser.writeString(`INTERVAL '1 SECOND' * `);
        if (durationStr) {
          unparser.writeQueryParam(
            Number(durationNanos(durationFromString(durationStr))) / 1_000_000_000
          );
        } else {
          this.castToDouble(unparser, expr);
        }
        return true;
      case UintType.kind():
        const durationUint = unwrapUintConstant(expr);
        unparser.writeString(`INTERVAL '1 SECOND' * `);
        if (durationUint) {
          unparser.writeQueryParam(durationUint);
        } else {
          unparser.visit(expr);
        }
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot cast expression of type ${type?.typeName()} to duration`
        );
    }
  }

  intDataType() {
    return 'BIGINT';
  }

  castToInt(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.kind()) {
      case IntType.kind():
        unparser.visit(expr);
        return true;
      case DoubleType.kind():
      case StringType.kind():
      case UintType.kind():
        unparser.writeString(`CAST(`);
        unparser.visit(expr);
        unparser.writeString(` AS `);
        unparser.writeString(this.intDataType());
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot cast expression of type ${type?.typeName()} to integer`
        );
    }
  }

  listDataType(elemType?: string): string {
    if (!elemType) {
      return 'JSON';
    }
    return `${elemType} ARRAY`;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  mapDataType(keyType?: string, valueType?: string): string {
    return `JSON`;
  }

  stringDataType() {
    return 'VARCHAR';
  }

  castToString(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.kind()) {
      case StringType.kind():
        unparser.visit(expr);
        return true;
      case BoolType.kind():
      case BytesType.kind():
      case DoubleType.kind():
      case IntType.kind():
      case UintType.kind():
        unparser.writeString(`CAST(`);
        unparser.visit(expr);
        unparser.writeString(` AS `);
        unparser.writeString(this.stringDataType());
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot cast expression of type ${type?.typeName()} to string`
        );
    }
  }

  timeDataType() {
    return 'TIME';
  }

  castToTime(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.typeName()) {
      case TimeType.typeName():
        unparser.visit(expr);
        return true;
      case StringType.typeName():
      case TimestampType.typeName():
        unparser.writeString(`CAST(`);
        unparser.visit(expr);
        unparser.writeString(` AS `);
        unparser.writeString(this.timeDataType());
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot cast expression of type ${type?.typeName()} to time`
        );
    }
  }

  timestampDataType() {
    return 'TIMESTAMP';
  }

  timestampTzDataType() {
    return 'TIMESTAMP WITH TIME ZONE';
  }

  castToTimestamp(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.kind()) {
      case TimestampType.kind():
        unparser.visit(expr);
        if (tzExpr) {
          unparser.writeString(' AT TIME ZONE ');
          unparser.visit(tzExpr);
        }
        return true;
      case StringType.kind():
        const tsStr = unwrapStringConstant(expr);
        if (tsStr) {
          const tsFromStr = timestampFromDateString(tsStr);
          const tsDate = timestampDate(tsFromStr);
          unparser.writeString(`TIMESTAMP '${tsDate.toISOString()}'`);
          if (tzExpr) {
            unparser.writeString(' AT TIME ZONE ');
            unparser.visit(tzExpr);
          }
        } else {
          unparser.writeString(`CAST(`);
          unparser.visit(expr);
          unparser.writeString(` AS `);
          if (tzExpr) {
            unparser.writeString(this.timestampTzDataType());
            unparser.writeString(`) AT TIME ZONE `);
            unparser.visit(tzExpr);
          } else {
            unparser.writeString(this.timestampDataType());
            unparser.writeString(`)`);
          }
        }
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot cast expression of type ${type?.typeName()} to timestamp`
        );
    }
  }

  uintDataType() {
    return 'UNSIGNED BIGINT';
  }

  castToUint(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.kind()) {
      case UintType.kind():
        unparser.visit(expr);
        return true;
      case IntType.kind():
      case DoubleType.kind():
      case StringType.kind():
        unparser.writeString(`CAST(`);
        unparser.visit(expr);
        unparser.writeString(` AS `);
        unparser.writeString(this.uintDataType());
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot cast expression of type ${type?.typeName()} to unsigned integer`
        );
    }
  }

  add(unparser: Unparser, lhs: Expr, rhs: Expr): boolean {
    const lhsType = unparser.getType(lhs);
    const rhsType = unparser.getType(rhs);
    if (
      (lhsType?.kind() === StringType.kind() && rhsType?.kind() === StringType.kind()) ||
      (lhsType?.kind() === BytesType.kind() && rhsType?.kind() === BytesType.kind()) ||
      (lhsType?.kind() === ListType.kind() && rhsType?.kind() === ListType.kind())
    ) {
      unparser.visit(lhs);
      unparser.writeString(' || ');
      unparser.visit(rhs);
      return true;
    }
    return false;
  }

  index(unparser: Unparser, expr: Expr, index: Expr): boolean {
    const nested = isBinaryOrTernaryOperator(expr);
    unparser.visitMaybeNested(expr, nested);
    unparser.writeString('[');
    unparser.visit(index);
    unparser.writeString(']');
    return true;
  }

  size(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.kind()) {
      case StringType.kind():
      case BytesType.kind():
        unparser.writeString(`LENGTH(`);
        unparser.visit(expr);
        unparser.writeString(`)`);
        return true;
      case ListType.kind():
        unparser.writeString(`CARDINALITY(`);
        unparser.visit(expr);
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot apply size function to expression of type ${type?.typeName()}`
        );
    }
  }

  stringContains(unparser: Unparser, expr: Expr, substr: Expr, caseInsensitive?: Expr): boolean {
    const type = unparser.getType(expr);
    if (type?.kind() !== StringType.kind()) {
      throw unparser.formatError(
        expr,
        `Cannot apply string contains function to expression of type ${type?.typeName()}`
      );
    }
    const isCaseInsensitive = caseInsensitive && unwrapBoolConstant(caseInsensitive) === true;
    if (isCaseInsensitive) {
      unparser.writeString(`LOWER(`);
    }
    unparser.visit(expr);
    if (isCaseInsensitive) {
      unparser.writeString(`)`);
    }
    unparser.writeString(` LIKE `);
    if (isCaseInsensitive) {
      unparser.writeString(`LOWER(`);
    }
    unparser.writeString(`'%' || `);
    unparser.visit(substr);
    unparser.writeString(` || '%'`);
    if (isCaseInsensitive) {
      unparser.writeString(`)`);
    }
    return true;
  }

  stringStartsWith(unparser: Unparser, expr: Expr, prefix: Expr, caseInsensitive?: Expr): boolean {
    const type = unparser.getType(expr);
    if (type?.kind() !== StringType.kind()) {
      throw unparser.formatError(
        expr,
        `Cannot apply string starts with function to expression of type ${type?.typeName()}`
      );
    }
    const isCaseInsensitive = caseInsensitive && unwrapBoolConstant(caseInsensitive) === true;
    if (isCaseInsensitive) {
      unparser.writeString(`LOWER(`);
    }
    unparser.visit(expr);
    if (isCaseInsensitive) {
      unparser.writeString(`)`);
    }
    unparser.writeString(` LIKE `);
    if (isCaseInsensitive) {
      unparser.writeString(`LOWER(`);
    }
    unparser.visit(prefix);
    unparser.writeString(` || '%'`);
    if (isCaseInsensitive) {
      unparser.writeString(`)`);
    }
    return true;
  }

  stringEndsWith(unparser: Unparser, expr: Expr, suffix: Expr, caseInsensitive?: Expr): boolean {
    const type = unparser.getType(expr);
    if (type?.kind() !== StringType.kind()) {
      throw unparser.formatError(
        expr,
        `Cannot apply string ends with function to expression of type ${type?.typeName()}`
      );
    }
    const isCaseInsensitive = caseInsensitive && unwrapBoolConstant(caseInsensitive) === true;
    if (isCaseInsensitive) {
      unparser.writeString(`LOWER(`);
    }
    unparser.visit(expr);
    if (isCaseInsensitive) {
      unparser.writeString(`)`);
    }
    unparser.writeString(` LIKE `);
    if (isCaseInsensitive) {
      unparser.writeString(`LOWER(`);
    }
    unparser.writeString(`'%' || `);
    unparser.visit(suffix);
    if (isCaseInsensitive) {
      unparser.writeString(`)`);
    }
    return true;
  }

  stringLower(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    if (type?.kind() !== StringType.kind()) {
      throw unparser.formatError(
        expr,
        `cannot apply 'lower' function to expression of type ${type?.typeName()}`
      );
    }
    unparser.writeString(`LOWER(`);
    unparser.visit(expr);
    unparser.writeString(`)`);
    return true;
  }

  stringUpper(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    if (type?.kind() !== StringType.kind()) {
      throw unparser.formatError(
        expr,
        `cannot apply 'upper' function to expression of type ${type?.typeName()}`
      );
    }
    unparser.writeString(`UPPER(`);
    unparser.visit(expr);
    unparser.writeString(`)`);
    return true;
  }

  stringTrim(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    if (type?.kind() !== StringType.kind()) {
      throw unparser.formatError(
        expr,
        `cannot apply 'trim' function to expression of type ${type?.typeName()}`
      );
    }
    unparser.writeString(`TRIM(`);
    unparser.visit(expr);
    unparser.writeString(`)`);
    return true;
  }

  stringLike(unparser: Unparser, expr: Expr, pattern: Expr, caseInsensitive?: Expr): boolean {
    const type = unparser.getType(expr);
    if (type?.kind() !== StringType.kind()) {
      throw unparser.formatError(
        expr,
        `cannot apply 'like' function to expression of type ${type?.typeName()}`
      );
    }
    const isCaseInsensitive = caseInsensitive && unwrapBoolConstant(caseInsensitive) === true;
    if (isCaseInsensitive) {
      unparser.writeString(`LOWER(`);
    }
    unparser.visit(expr);
    if (isCaseInsensitive) {
      unparser.writeString(`)`);
    }
    unparser.writeString(` LIKE `);
    if (isCaseInsensitive) {
      unparser.writeString(`LOWER(`);
    }
    unparser.visit(pattern);
    if (isCaseInsensitive) {
      unparser.writeString(`)`);
    }
    return true;
  }

  atTimeZone(unparser: Unparser, expr: Expr, tzExpr: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.typeName()) {
      case TimeType.typeName():
      case TimestampType.typeName():
        unparser.visit(expr);
        unparser.writeString(' AT TIME ZONE ');
        unparser.visit(tzExpr);
        break;
      default:
        throw unparser.formatError(
          expr,
          `cannot apply 'atTimeZone' to expression of type ${type?.typeName()}`
        );
    }
    return true;
  }

  now(unparser: Unparser, tzExpr?: Expr): boolean {
    unparser.writeString('CURRENT_TIMESTAMP');
    if (tzExpr) {
      unparser.writeString(' AT TIME ZONE ');
      unparser.visit(tzExpr);
    }
    return true;
  }

  getFullYear(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.typeName()) {
      case DateType.typeName():
      case TimestampType.typeName():
        unparser.writeString(`EXTRACT(YEAR FROM `);
        unparser.visit(expr);
        if (tzExpr) {
          unparser.writeString(` AT TIME ZONE `);
          unparser.visit(tzExpr);
        }
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot extract full year from expression of type ${type?.typeName()}`
        );
    }
  }

  getMonth(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.typeName()) {
      case DateType.typeName():
      case TimestampType.typeName():
        unparser.writeString(`EXTRACT(MONTH FROM `);
        unparser.visit(expr);
        if (tzExpr) {
          unparser.writeString(` AT TIME ZONE `);
          unparser.visit(tzExpr);
        }
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot extract month from expression of type ${type?.typeName()}`
        );
    }
  }

  getDayOfYear(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.typeName()) {
      case DateType.typeName():
      case TimestampType.typeName():
        unparser.writeString(`EXTRACT(DOY FROM `);
        unparser.visit(expr);
        if (tzExpr) {
          unparser.writeString(` AT TIME ZONE `);
          unparser.visit(tzExpr);
        }
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot extract day of year from expression of type ${type?.typeName()}`
        );
    }
  }

  getDate(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.typeName()) {
      case DateType.typeName():
      case TimestampType.typeName():
        unparser.writeString(`EXTRACT(DAY FROM `);
        unparser.visit(expr);
        if (tzExpr) {
          unparser.writeString(` AT TIME ZONE `);
          unparser.visit(tzExpr);
        }
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot extract date from expression of type ${type?.typeName()}`
        );
    }
  }

  getDayOfWeek(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.typeName()) {
      case DateType.typeName():
      case TimestampType.typeName():
        unparser.writeString(`EXTRACT(DOW FROM `);
        unparser.visit(expr);
        if (tzExpr) {
          unparser.writeString(` AT TIME ZONE `);
          unparser.visit(tzExpr);
        }
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot extract day of week from expression of type ${type?.typeName()}`
        );
    }
  }

  getHours(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.typeName()) {
      case TimeType.typeName():
      case TimestampType.typeName():
        unparser.writeString(`EXTRACT(HOUR FROM `);
        unparser.visit(expr);
        if (tzExpr) {
          unparser.writeString(` AT TIME ZONE `);
          unparser.visit(tzExpr);
        }
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot extract hours from expression of type ${type?.typeName()}`
        );
    }
  }

  getMinutes(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.typeName()) {
      case TimeType.typeName():
      case TimestampType.typeName():
        unparser.writeString(`EXTRACT(MINUTE FROM `);
        unparser.visit(expr);
        if (tzExpr) {
          unparser.writeString(` AT TIME ZONE `);
          unparser.visit(tzExpr);
        }
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot extract minutes from expression of type ${type?.typeName()}`
        );
    }
  }

  getSeconds(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.typeName()) {
      case TimeType.typeName():
      case TimestampType.typeName():
        unparser.writeString(`EXTRACT(SECOND FROM `);
        unparser.visit(expr);
        if (tzExpr) {
          unparser.writeString(` AT TIME ZONE `);
          unparser.visit(tzExpr);
        }
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot extract seconds from expression of type ${type?.typeName()}`
        );
    }
  }

  getMilliseconds(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.typeName()) {
      case TimeType.typeName():
      case TimestampType.typeName():
        unparser.writeString(`EXTRACT(MILLISECOND FROM `);
        unparser.visit(expr);
        if (tzExpr) {
          unparser.writeString(` AT TIME ZONE `);
          unparser.visit(tzExpr);
        }
        unparser.writeString(`)`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `Cannot extract milliseconds from expression of type ${type?.typeName()}`
        );
    }
  }

  functionToSqlOverrides(unparser: Unparser, functionName: string, args: Expr[]): boolean {
    switch (functionName) {
      case ADD_OPERATOR:
        return this.add(unparser, args[0], args[1]);
      case INDEX_OPERATOR:
        return this.index(unparser, args[0], args[1]);
      case SIZE_OVERLOAD:
        return this.size(unparser, args[0]);
      case STRING_LOWER_OVERLOAD:
        return this.stringLower(unparser, args[0]);
      case STRING_UPPER_OVERLOAD:
        return this.stringUpper(unparser, args[0]);
      case STRING_TRIM_OVERLOAD:
        return this.stringTrim(unparser, args[0]);
      case LIKE_OVERLOAD:
        return this.stringLike(unparser, args[0], args[1], args[2]);
      case CONTAINS_OVERLOAD:
        return this.stringContains(unparser, args[0], args[1], args[2]);
      case STARTS_WITH_OVERLOAD:
        return this.stringStartsWith(unparser, args[0], args[1], args[2]);
      case ENDS_WITH_OVERLOAD:
        return this.stringEndsWith(unparser, args[0], args[1], args[2]);
      case AT_TIMEZONE_OVERLOAD:
        return this.atTimeZone(unparser, args[0], args[1]);
      case TIMESTAMP_NOW:
        return this.now(unparser, args[0]);
      case TIME_GET_FULL_YEAR_OVERLOAD:
        return this.getFullYear(unparser, args[0], args[1]);
      case TIME_GET_MONTH_OVERLOAD:
        return this.getMonth(unparser, args[0], args[1]);
      case TIME_GET_DAY_OF_YEAR_OVERLOAD:
        return this.getDayOfYear(unparser, args[0], args[1]);
      case TIME_GET_DATE_OVERLOAD:
        return this.getDate(unparser, args[0], args[1]);
      case TIME_GET_DAY_OF_WEEK_OVERLOAD:
        return this.getDayOfWeek(unparser, args[0], args[1]);
      case TIME_GET_HOURS_OVERLOAD:
        return this.getHours(unparser, args[0], args[1]);
      case TIME_GET_MINUTES_OVERLOAD:
        return this.getMinutes(unparser, args[0], args[1]);
      case TIME_GET_SECONDS_OVERLOAD:
        return this.getSeconds(unparser, args[0], args[1]);
      case TIME_GET_MILLISECONDS_OVERLOAD:
        return this.getMilliseconds(unparser, args[0], args[1]);
      case TYPE_CONVERT_BOOL_OVERLOAD:
        return this.castToBoolean(unparser, args[0]);
      case TYPE_CONVERT_BYTES_OVERLOAD:
        return this.castToBytes(unparser, args[0]);
      case TYPE_CONVERT_DOUBLE_OVERLOAD:
        return this.castToDouble(unparser, args[0]);
      case TYPE_CONVERT_DATE_OVERLOAD:
        return this.castToDate(unparser, args[0]);
      case TYPE_CONVERT_DURATION_OVERLOAD:
        return this.castToDuration(unparser, args[0]);
      case TYPE_CONVERT_INT_OVERLOAD:
        return this.castToInt(unparser, args[0]);
      case TYPE_CONVERT_STRING_OVERLOAD:
        return this.castToString(unparser, args[0]);
      case TYPE_CONVERT_TIME_OVERLOAD:
        return this.castToTime(unparser, args[0]);
      case TYPE_CONVERT_TIMESTAMP_OVERLOAD:
        return this.castToTimestamp(unparser, args[0], args[1]);
      case TYPE_CONVERT_UINT_OVERLOAD:
        return this.castToUint(unparser, args[0]);
      default:
        break;
    }
    return false;
  }

  findSqlOperator(operator: string): string {
    switch (operator) {
      case LOGICAL_OR_OPERATOR:
        return 'OR';
      case LOGICAL_AND_OPERATOR:
        return 'AND';
      case EQUALS_OPERATOR:
        return '=';
      case NOT_EQUALS_OPERATOR:
        return '<>';
      case IN_OPERATOR:
        return 'IN';
      case LOGICAL_NOT_OPERATOR:
        return 'NOT ';
      default:
        return findReverse(operator);
    }
  }
}
