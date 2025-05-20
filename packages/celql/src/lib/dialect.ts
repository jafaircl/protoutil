/* eslint-disable no-case-declarations */
import { AnyType, listType, StringType } from '@bearclaw/cel';
import { Expr } from '@buf/google_cel-spec.bufbuild_es/cel/expr/syntax_pb.js';
import { Duration, Timestamp, timestampDate } from '@bufbuild/protobuf/wkt';
import { durationNanos } from '@protoutil/core';
import { ALL_KEYWORDS } from './keywords.js';
import { ADD_OPERATOR, findReverse, LOGICAL_NOT_OPERATOR } from './operators.js';
import { CONTAINS_OVERLOAD, ENDS_WITH_OVERLOAD, STARTS_WITH_OVERLOAD } from './overloads.js';
import { Unparser } from './unparser.js';

// TODO: when @bearclaw/cel is updated to export ListType, use that instead of listType(AnyType)
const ListType = listType(AnyType);

// /**
//  * `IntervalStyle` to use for unparsing.
//  *
//  * Different DBMS follows different standards, popular ones are:
//  *  - postgres_verbose: '2 years 15 months 100 weeks 99 hours 123456789 milliseconds' which is
//  * compatible with arrow display format, as well as duckdb
//  *  - sql standard format is '1-2' for year-month, or '1 10:10:10.123456' for day-time
//  *
//  * @see https://www.postgresql.org/docs/current/datatype-datetime.html#DATATYPE-INTERVAL-INPUT
//  * @see https://www.contrib.andrew.cmu.edu/~shadow/sql/sql1992.txt
//  */
// export enum IntervalStyle {
//   POSTGRES_VERBOSE,
//   SQL_STANDARD,
//   MYSQL,
// }

// /**
//  * Datetime subfield extraction style for unparsing.
//  *
//  * Different DBMSs follow different standards; popular ones are:
//  *  - date_part('YEAR', date '2001-02-16')
//  *  - EXTRACT(YEAR from date '2001-02-16')
//  *
//  * Some DBMSs, like Postgres, support both, whereas others like MySQL require EXTRACT.
//  *
//  * @see https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-EXTRACT
//  */
// export enum DateFieldExtractStyle {
//   DATE_PART,
//   EXTRACT,
//   STRFTIME,
// }

// /**
//  * `CharacterLengthStyle` to use for unparsing
//  *
//  * Different DBMSs uses different names for function calculating the number of characters in the string
//  *  - `LENGTH` style uses length(x)
//  *  - `SQL_STANDARD` style uses character_length(x)
//  */
// export enum CharacterLengthStyle {
//   LENGTH,
//   CHARACTER_LENGTH,
// }

// /**
//  * `TimeUnit` to use for unparsing
//  */
// export enum TimeUnit {
//   SECOND,
//   MILLISECOND,
//   MICROSECOND,
//   NANOSECOND,
// }

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
   * Unparse a duration to a string
   * Most dialects use INTERVAL, but some require a different format
   */
  writeDuration(unparser: Unparser, duration: Duration): void {
    unparser.writeString(`INTERVAL '1 SECOND' * `);
    unparser.writeQueryParam(Number(durationNanos(duration)) / 1_000_000_000);
  }

  /**
   * Unparse a timestamp to a string
   * Most dialects use TIMESTAMP, but some require a different format
   */
  writeTimestamp(unparser: Unparser, timestamp: Timestamp): void {
    const date = timestampDate(timestamp);
    unparser.writeString(`TIMESTAMP '${date.toISOString()}'`);
  }

  /**
   * Allows the dialect to override function unparsing if the dialect has specific rules. Returns
   * a boolean indicating if the function was handled by the dialect.
   */
  functionToSqlOverrides(unparser: Unparser, functionName: string, args: Expr[]): boolean {
    switch (functionName) {
      case ADD_OPERATOR:
        const lhs = args[0];
        const lhsType = unparser.getType(lhs);
        const rhs = args[1];
        const rhsType = unparser.getType(rhs);
        if (
          (lhsType?.kind() === StringType.kind() && rhsType?.kind() === StringType.kind()) ||
          (lhsType?.kind() === ListType.kind() && rhsType?.kind() === ListType.kind())
        ) {
          unparser.visit(lhs);
          unparser.writeString(' || ');
          unparser.visit(rhs);
          return true;
        }
        return false;
      case CONTAINS_OVERLOAD:
        unparser.visit(args[0]);
        unparser.writeString(" LIKE CONCAT('%', ");
        unparser.visit(args[1]);
        unparser.writeString(`, '%')`);
        return true;
      case ENDS_WITH_OVERLOAD:
        unparser.visit(args[0]);
        unparser.writeString(" LIKE CONCAT('%', ");
        unparser.visit(args[1]);
        unparser.writeString(`)`);
        return true;
      case STARTS_WITH_OVERLOAD:
        unparser.visit(args[0]);
        unparser.writeString(' LIKE CONCAT(');
        unparser.visit(args[1]);
        unparser.writeString(`, '%')`);
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
      case LOGICAL_NOT_OPERATOR:
        return 'NOT ';
      default:
        return findReverse(operator);
    }
  }

  //   /**
  //    * Does the dialect use DOUBLE PRECISION to represent Float64 rather than DOUBLE?
  //    * E.g. Postgres uses DOUBLE PRECISION instead of DOUBLE
  //    */
  //   readonly floatDtype = 'DOUBLE';

  //   /**
  //    * The SQL type to use for string unparsing
  //    * Most dialects use VARCHAR, but some, like MySQL, require CHAR
  //    */
  //   readonly stringDtype = 'VARCHAR';

  //   /**
  //    * The SQL type to use for Arrow large string unparsing
  //    * Most dialects use TEXT, but some, like MySQL, require CHAR
  //    */
  //   readonly largeStringDtype = 'TEXT';

  //   /**
  //    * The date field extract style to use: `DateFieldExtractStyle`
  //    */
  //   readonly dateFieldExtractStyle = DateFieldExtractStyle.DATE_PART;

  //   /**
  //    * The character length extraction style to use: `CharacterLengthStyle`
  //    */
  //   readonly characterLengthStyle = CharacterLengthStyle.CHARACTER_LENGTH;

  //   /**
  //    * The SQL type to use for Int64 unparsing
  //    * Most dialects use BigInt, but some, like MySQL, require SIGNED
  //    */
  //   readonly int64Dtype = 'BIGINT';

  //   /**
  //    * The SQL type to use for Int32 unparsing
  //    * Most dialects use Integer, but some, like MySQL, require SIGNED
  //    */
  //   readonly int32Dtype = 'INTEGER';

  //   /**
  //    * The SQL type to use for Date unparsing
  //    * Most dialects use Date, but some, like SQLite require TEXT
  //    */
  //   readonly date32Dtype = 'DATE';

  //   /**
  //    * The division operator for the dialect
  //    * Most dialect uses `/`
  //    * But DuckDB dialect uses `//`
  //    */
  //   readonly divisionOperator = '/';
}

export const DEFAULT_DIALECT = new Dialect();
