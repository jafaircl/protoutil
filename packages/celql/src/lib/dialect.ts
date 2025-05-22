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
import { Expr } from '@buf/google_cel-spec.bufbuild_es/cel/expr/syntax_pb.js';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { durationFromString, durationNanos, timestampFromDateString } from '@protoutil/core';
import { unwrapBoolConstant, unwrapStringConstant } from './common.js';
import { ALL_KEYWORDS } from './keywords.js';
import { DateType } from './library.js';
import {
  ADD_OPERATOR,
  EQUALS_OPERATOR,
  findReverse,
  IN_OPERATOR,
  LOGICAL_AND_OPERATOR,
  LOGICAL_NOT_OPERATOR,
  LOGICAL_OR_OPERATOR,
} from './operators.js';
import {
  CONTAINS_OVERLOAD,
  ENDS_WITH_OVERLOAD,
  LIKE_OVERLOAD,
  SIZE_OVERLOAD,
  STARTS_WITH_OVERLOAD,
  STRING_LOWER_OVERLOAD,
  STRING_TRIM_OVERLOAD,
  STRING_UPPER_OVERLOAD,
  TIME_AT_TIMEZONE_OVERLOAD,
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
  TYPE_CONVERT_TIMESTAMP_OVERLOAD,
  TYPE_CONVERT_UINT_OVERLOAD,
} from './overloads.js';
import { Unparser } from './unparser.js';

/**
 * `Dialect` to use for Unparsing
 */
export class Dialect {
  /**
   * Write a query parameter to the unparser and push it to the stack
   */
  writeQueryParam(unparser: Unparser, param: unknown): void {
    unparser.pushVar(param);
    unparser.writeString(`$${unparser.vars.length}`);
  }

  /**
   * If the identifier needs to be quoted, return the identifier with quotes
   */
  maybeQuoteIdentifier(identifier: string): string {
    const identifierRegex = /^[A-Za-z_][0-9A-Za-z_]*$/;
    if (ALL_KEYWORDS.has(identifier.toUpperCase()) || !identifierRegex.test(identifier)) {
      return `"${identifier}"`;
    }
    return identifier;
  }

  /**
   * Allows the dialect to override function unparsing if the dialect has specific rules. Returns
   * a boolean indicating if the function was handled by the dialect.
   */
  functionToSqlOverrides(unparser: Unparser, functionName: string, args: Expr[]): boolean {
    switch (functionName) {
      case ADD_OPERATOR:
        const addLhs = args[0];
        const addLhsType = unparser.getType(addLhs);
        const addRhs = args[1];
        const addRhsType = unparser.getType(addRhs);
        if (
          (addLhsType?.kind() === StringType.kind() && addRhsType?.kind() === StringType.kind()) ||
          (addLhsType?.kind() === BytesType.kind() && addRhsType?.kind() === BytesType.kind()) ||
          (addLhsType?.kind() === ListType.kind() && addRhsType?.kind() === ListType.kind())
        ) {
          unparser.visit(addLhs);
          unparser.writeString(' || ');
          unparser.visit(addRhs);
          return true;
        }
        return false;
      case SIZE_OVERLOAD:
        const sizeArg = args[0];
        const sizeArgType = unparser.getType(sizeArg);
        if (sizeArgType?.kind() === BytesType.kind()) {
          unparser.writeString('LENGTH(');
          unparser.visit(sizeArg);
          unparser.writeString(')');
          return true;
        }
        if (sizeArgType?.kind() === ListType.kind()) {
          unparser.writeString('ARRAY_LENGTH(');
          unparser.visit(sizeArg);
          unparser.writeString(', 1)');
          return true;
        }
        if (sizeArgType?.kind() === StringType.kind()) {
          unparser.writeString('CHAR_LENGTH(');
          unparser.visit(sizeArg);
          unparser.writeString(')');
          return true;
        }
        throw new Error(
          `Unsupported type for "${TYPE_CONVERT_BOOL_OVERLOAD}": ${sizeArgType?.typeName()}`
        );
      case TYPE_CONVERT_BOOL_OVERLOAD:
        const boolTypeConvertArg = args[0];
        const boolTypeConvertArgType = unparser.getType(boolTypeConvertArg);
        switch (boolTypeConvertArgType?.kind()) {
          case BoolType.kind():
          case StringType.kind():
            unparser.writeString('CAST(');
            unparser.visit(boolTypeConvertArg);
            unparser.writeString(' AS BOOL)');
            return true;
          default:
            throw new Error(
              `Unsupported type for "${TYPE_CONVERT_BOOL_OVERLOAD}": ${boolTypeConvertArgType?.typeName()}`
            );
        }
      case TYPE_CONVERT_BYTES_OVERLOAD:
        const bytesTypeConvertArg = args[0];
        const bytesTypeConvertArgType = unparser.getType(bytesTypeConvertArg);
        switch (bytesTypeConvertArgType?.kind()) {
          case BytesType.kind():
          case StringType.kind():
            unparser.writeString('CAST(');
            unparser.visit(bytesTypeConvertArg);
            unparser.writeString(' AS BYTEA)');
            return true;
          default:
            throw new Error(
              `Unsupported type for "${TYPE_CONVERT_BYTES_OVERLOAD}": ${bytesTypeConvertArgType?.typeName()}`
            );
        }
      case TYPE_CONVERT_DOUBLE_OVERLOAD:
        const doubleTypeConvertArg = args[0];
        const doubleTypeConvertArgType = unparser.getType(doubleTypeConvertArg);
        switch (doubleTypeConvertArgType?.kind()) {
          case DoubleType.kind():
          case IntType.kind():
          case StringType.kind():
          case UintType.kind():
            unparser.writeString('CAST(');
            unparser.visit(doubleTypeConvertArg);
            unparser.writeString(' AS NUMERIC)');
            return true;
          default:
            throw new Error(
              `Unsupported type for "${TYPE_CONVERT_DOUBLE_OVERLOAD}": ${doubleTypeConvertArgType?.typeName()}`
            );
        }
      case TYPE_CONVERT_DURATION_OVERLOAD:
        const durationTypeConvertArg = args[0];
        const durationTypeConvertArgType = unparser.getType(durationTypeConvertArg);
        switch (durationTypeConvertArgType?.kind()) {
          case DurationType.kind():
            unparser.visit(durationTypeConvertArg);
            return true;
          case StringType.kind():
            const durationStr = unwrapStringConstant(durationTypeConvertArg);
            if (!durationStr) {
              throw new Error(
                `Unsupported type for "${TYPE_CONVERT_DURATION_OVERLOAD}": ${durationTypeConvertArgType?.typeName()}`
              );
            }
            const duration = durationFromString(durationStr);
            unparser.writeString(`INTERVAL '1 SECOND' * `);
            unparser.writeQueryParam(Number(durationNanos(duration)) / 1_000_000_000);
            return true;
          default:
            throw new Error(
              `Unsupported type for "${TYPE_CONVERT_DURATION_OVERLOAD}": ${durationTypeConvertArgType?.typeName()}`
            );
        }
      case TYPE_CONVERT_INT_OVERLOAD:
      case TYPE_CONVERT_UINT_OVERLOAD:
        const intTypeConvertArg = args[0];
        const intTypeConvertArgType = unparser.getType(intTypeConvertArg);
        switch (intTypeConvertArgType?.kind()) {
          case IntType.kind():
          case UintType.kind():
          case DoubleType.kind():
          case StringType.kind():
            unparser.writeString('CAST(');
            unparser.visit(intTypeConvertArg);
            unparser.writeString(' AS BIGINT)');
            return true;
          default:
            throw new Error(
              `Unsupported type for "${TYPE_CONVERT_INT_OVERLOAD}": ${intTypeConvertArgType?.typeName()}`
            );
        }
      case TYPE_CONVERT_STRING_OVERLOAD:
        const stringTypeConvertArg = args[0];
        const stringTypeConvertArgType = unparser.getType(stringTypeConvertArg);
        switch (stringTypeConvertArgType?.kind()) {
          case StringType.kind():
          case BoolType.kind():
          case BytesType.kind():
          case DoubleType.kind():
          case IntType.kind():
          case UintType.kind():
            unparser.writeString('CAST(');
            unparser.visit(stringTypeConvertArg);
            unparser.writeString(' AS TEXT)');
            return true;
          default:
            throw new Error(
              `Unsupported type for "${TYPE_CONVERT_STRING_OVERLOAD}": ${stringTypeConvertArgType?.typeName()}`
            );
        }
      case TYPE_CONVERT_TIMESTAMP_OVERLOAD:
        const timestampTypeConvertArg = args[0];
        const timestampTypeConvertArgType = unparser.getType(timestampTypeConvertArg);
        switch (timestampTypeConvertArgType?.kind()) {
          case TimestampType.kind():
            unparser.visit(timestampTypeConvertArg);
            if (args[1]) {
              unparser.writeString(' AT TIME ZONE ');
              unparser.visit(args[1]);
            }
            return true;
          case StringType.kind():
            const tsStr = unwrapStringConstant(timestampTypeConvertArg);
            if (!tsStr) {
              throw new Error(
                `Unsupported type for "${TYPE_CONVERT_TIMESTAMP_OVERLOAD}": ${timestampTypeConvertArgType?.typeName()}`
              );
            }
            const tsFromStr = timestampFromDateString(tsStr);
            const tsDate = timestampDate(tsFromStr);
            unparser.writeString(`TIMESTAMP '${tsDate.toISOString()}'`);
            if (args[1]) {
              unparser.writeString(' AT TIME ZONE ');
              unparser.visit(args[1]);
            }
            return true;
          default:
            throw new Error(
              `Unsupported type for "${TYPE_CONVERT_TIMESTAMP_OVERLOAD}": ${timestampTypeConvertArgType?.typeName()}`
            );
        }
      case CONTAINS_OVERLOAD:
        unparser.visit(args[0]);
        if (unwrapBoolConstant(args[2]) === true) {
          unparser.writeString(" ILIKE CONCAT('%', ");
        } else {
          unparser.writeString(" LIKE CONCAT('%', ");
        }
        unparser.visit(args[1]);
        unparser.writeString(`, '%')`);
        return true;
      case ENDS_WITH_OVERLOAD:
        unparser.visit(args[0]);
        if (unwrapBoolConstant(args[2]) === true) {
          unparser.writeString(" ILIKE CONCAT('%', ");
        } else {
          unparser.writeString(" LIKE CONCAT('%', ");
        }
        unparser.visit(args[1]);
        unparser.writeString(`)`);
        return true;
      case STARTS_WITH_OVERLOAD:
        unparser.visit(args[0]);
        if (unwrapBoolConstant(args[2]) === true) {
          unparser.writeString(' ILIKE CONCAT(');
        } else {
          unparser.writeString(' LIKE CONCAT(');
        }
        unparser.visit(args[1]);
        unparser.writeString(`, '%')`);
        return true;
      case TIMESTAMP_NOW:
        unparser.writeString('NOW()');
        return true;
      case TIME_GET_FULL_YEAR_OVERLOAD:
        unparser.writeString('EXTRACT(YEAR FROM ');
        unparser.visit(args[0]);
        if (args[1]) {
          unparser.writeString(' AT TIME ZONE ');
          unparser.visit(args[1]);
        }
        unparser.writeString(')');
        return true;
      case TIME_GET_MONTH_OVERLOAD:
        unparser.writeString('EXTRACT(MONTH FROM ');
        unparser.visit(args[0]);
        if (args[1]) {
          unparser.writeString(' AT TIME ZONE ');
          unparser.visit(args[1]);
        }
        unparser.writeString(')');
        return true;
      case TIME_GET_DAY_OF_YEAR_OVERLOAD:
        unparser.writeString('EXTRACT(DOY FROM ');
        unparser.visit(args[0]);
        if (args[1]) {
          unparser.writeString(' AT TIME ZONE ');
          unparser.visit(args[1]);
        }
        unparser.writeString(')');
        return true;
      case TIME_GET_DATE_OVERLOAD:
        unparser.writeString('EXTRACT(DAY FROM ');
        unparser.visit(args[0]);
        if (args[1]) {
          unparser.writeString(' AT TIME ZONE ');
          unparser.visit(args[1]);
        }
        unparser.writeString(')');
        return true;
      case TIME_GET_DAY_OF_WEEK_OVERLOAD:
        unparser.writeString('EXTRACT(DOW FROM ');
        unparser.visit(args[0]);
        if (args[1]) {
          unparser.writeString(' AT TIME ZONE ');
          unparser.visit(args[1]);
        }
        unparser.writeString(')');
        return true;
      case TIME_GET_HOURS_OVERLOAD:
        unparser.writeString('EXTRACT(HOUR FROM ');
        unparser.visit(args[0]);
        if (args[1]) {
          unparser.writeString(' AT TIME ZONE ');
          unparser.visit(args[1]);
        }
        unparser.writeString(')');
        return true;
      case TIME_GET_MINUTES_OVERLOAD:
        unparser.writeString('EXTRACT(MINUTE FROM ');
        unparser.visit(args[0]);
        if (args[1]) {
          unparser.writeString(' AT TIME ZONE ');
          unparser.visit(args[1]);
        }
        unparser.writeString(')');
        return true;
      case TIME_GET_SECONDS_OVERLOAD:
        unparser.writeString('EXTRACT(SECOND FROM ');
        unparser.visit(args[0]);
        if (args[1]) {
          unparser.writeString(' AT TIME ZONE ');
          unparser.visit(args[1]);
        }
        unparser.writeString(')');
        return true;
      case TIME_GET_MILLISECONDS_OVERLOAD:
        unparser.writeString('EXTRACT(MILLISECONDS FROM ');
        unparser.visit(args[0]);
        if (args[1]) {
          unparser.writeString(' AT TIME ZONE ');
          unparser.visit(args[1]);
        }
        unparser.writeString(')');
        return true;
      case TYPE_CONVERT_DATE_OVERLOAD:
        const dateTypeConvertArg = args[0];
        const dateTypeConvertArgType = unparser.getType(dateTypeConvertArg);
        switch (dateTypeConvertArgType?.typeName()) {
          case DateType.typeName():
            unparser.visit(dateTypeConvertArg);
            return true;
          case StringType.typeName():
          case TimestampType.typeName():
            unparser.writeString('DATE(');
            unparser.visit(dateTypeConvertArg);
            unparser.writeString(')');
            return true;
          default:
            throw new Error(
              `Unsupported type for "${TYPE_CONVERT_DATE_OVERLOAD}": ${dateTypeConvertArgType?.typeName()}`
            );
        }
      case TIME_AT_TIMEZONE_OVERLOAD:
        const timeAtTimezoneArg = args[0];
        const timeAtTimezoneArgType = unparser.getType(timeAtTimezoneArg);
        switch (timeAtTimezoneArgType?.kind()) {
          case TimestampType.kind():
            unparser.visit(timeAtTimezoneArg);
            unparser.writeString(' AT TIME ZONE ');
            unparser.visit(args[1]);
            return true;
          default:
            throw new Error(
              `Unsupported type for "${TIME_AT_TIMEZONE_OVERLOAD}": ${timeAtTimezoneArgType?.typeName()}`
            );
        }
      case STRING_LOWER_OVERLOAD:
        const stringLowerArg = args[0];
        const stringLowerArgType = unparser.getType(stringLowerArg);
        switch (stringLowerArgType?.kind()) {
          case StringType.kind():
            unparser.writeString('LOWER(');
            unparser.visit(stringLowerArg);
            unparser.writeString(')');
            return true;
          default:
            throw new Error(
              `Unsupported type for "${STRING_LOWER_OVERLOAD}": ${stringLowerArgType?.typeName()}`
            );
        }
      case STRING_UPPER_OVERLOAD:
        const stringUpperArg = args[0];
        const stringUpperArgType = unparser.getType(stringUpperArg);
        switch (stringUpperArgType?.kind()) {
          case StringType.kind():
            unparser.writeString('UPPER(');
            unparser.visit(stringUpperArg);
            unparser.writeString(')');
            return true;
          default:
            throw new Error(
              `Unsupported type for "${STRING_UPPER_OVERLOAD}": ${stringUpperArgType?.typeName()}`
            );
        }
      case STRING_TRIM_OVERLOAD:
        const stringTrimArg = args[0];
        const stringTrimArgType = unparser.getType(stringTrimArg);
        switch (stringTrimArgType?.kind()) {
          case StringType.kind():
            unparser.writeString('TRIM(');
            unparser.visit(stringTrimArg);
            unparser.writeString(')');
            return true;
          default:
            throw new Error(
              `Unsupported type for "${STRING_TRIM_OVERLOAD}": ${stringTrimArgType?.typeName()}`
            );
        }
      case LIKE_OVERLOAD:
        unparser.visit(args[0]);
        if (unwrapBoolConstant(args[2]) === true) {
          unparser.writeString(' ILIKE ');
        } else {
          unparser.writeString(' LIKE ');
        }
        unparser.visit(args[1]);
        return true;
      default:
        return false;
    }
  }

  /**
   * Allows the dialect to override operator unparsing if the dialect has specific rules.
   */
  findSqlOperator(operator: string): string {
    switch (operator) {
      case LOGICAL_OR_OPERATOR:
        return 'OR';
      case LOGICAL_AND_OPERATOR:
        return 'AND';
      case EQUALS_OPERATOR:
        return '=';
      case IN_OPERATOR:
        return 'IN';
      case LOGICAL_NOT_OPERATOR:
        return 'NOT ';
      default:
        return findReverse(operator);
    }
  }
}

export class PostgresqlDialect extends Dialect {}

export class MySqlDialect extends Dialect {
  override functionToSqlOverrides(unparser: Unparser, functionName: string, args: Expr[]): boolean {
    switch (functionName) {
      // MySQL LIKE is case insensitive by default
      case LIKE_OVERLOAD:
        unparser.visit(args[0]);
        unparser.writeString(' LIKE ');
        unparser.visit(args[1]);
        return true;
      default:
        return super.functionToSqlOverrides(unparser, functionName, args);
    }
  }
}

// TODO: DEFAULT should be ANSI SQL
