import { Expr, Expr_CreateList } from '@buf/google_cel-spec.bufbuild_es/cel/expr/syntax_pb.js';
import { Unparser } from './unparser.js';

/**
 * Dialect interface defines the methods that a dialect must implement to
 * support unparsing expressions into SQL or other query languages.
 */
export interface Dialect {
  /**
   * Write a query parameter to the unparser and push it to the stack
   */
  writeQueryParam(unparser: Unparser, param: unknown): void;

  /**
   * If the identifier needs to be quoted, return the identifier with quotes
   */
  maybeQuoteIdentifier(identifier: string): string;

  /**
   * Create a list expression in the dialect.
   */
  createList(unparser: Unparser, listExpr: Expr_CreateList): void;

  /**
   * The name of the dialect, used for debugging.
   */
  name(): string;

  /**
   * The boolean data type for the dialect.
   */
  booleanDataType(): string;

  /**
   * Cast an expression to a boolean value in the dialect. Returns a boolean indicating
   * whether the cast was successful or not.
   */
  castToBoolean(unparser: Unparser, expr: Expr): boolean;

  /**
   * The bytes data type for the dialect.
   */
  bytesDataType(): string;

  /**
   * Cast an expression to a bytes value in the dialect. Returns a boolean indicating
   * whether the cast was successful or not.
   */
  castToBytes(unparser: Unparser, expr: Expr): boolean;

  /**
   * The data type for a date value in the dialect.
   */
  dateDataType(): string;

  /**
   * Cast an expression to a date value in the dialect. Returns a boolean indicating
   * whether the cast was successful or not.
   */
  castToDate(unparser: Unparser, expr: Expr): boolean;

  /**
   * The data type for a double value in the dialect.
   */
  doubleDataType(): string;

  /**
   * Cast an expression to a double value in the dialect. Returns a boolean indicating
   * whether the cast was successful or not.
   */
  castToDouble(unparser: Unparser, expr: Expr): boolean;

  /**
   * The data type for a duration value in the dialect.
   */
  durationDataType(): string;

  /**
   * Cast an expression to a duration value in the dialect. Returns a boolean indicating
   * whether the cast was successful or not.
   */
  castToDuration(unparser: Unparser, expr: Expr): boolean;

  /**
   * The data type for an integer value in the dialect.
   */
  intDataType(): string;

  /**
   * Cast an expression to an integer value in the dialect. Returns a boolean indicating
   * whether the cast was successful or not.
   */
  castToInt(unparser: Unparser, expr: Expr): boolean;

  /**
   * The data type for a list value in the dialect. The optional `elemType` parameter
   * specifies the type of the elements in the list, if known.
   */
  listDataType(elemType?: string): string;

  /**
   * The data type for a map value in the dialect. The optional `keyType` and `valueType`
   * parameters specify the types of the keys and values in the map, if known.
   */
  mapDataType(keyType?: string, valueType?: string): string;

  /**
   * The data type for a string value in the dialect.
   */
  stringDataType(): string;

  /**
   * Cast an expression to a string value in the dialect. Returns a boolean indicating
   * whether the cast was successful or not.
   */
  castToString(unparser: Unparser, expr: Expr): boolean;

  /**
   * The data type for a time value in the dialect.
   */
  timeDataType(): string;

  /**
   * Cast an expression to a time value in the dialect. Returns a boolean indicating
   * whether the cast was successful or not.
   */
  castToTime(unparser: Unparser, expr: Expr): boolean;

  /**
   * The data type for a timestamp value in the dialect.
   */
  timestampDataType(): string;

  /**
   * The data type for a timestamp with time zone value in the dialect.
   */
  timestampTzDataType(): string;

  /**
   * Cast an expression to a timestamp value in the dialect. Returns a boolean indicating
   * whether the cast was successful or not.
   */
  castToTimestamp(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean;

  /**
   * The data type for an unsigned integer value in the dialect.
   */
  uintDataType(): string;

  /**
   * Cast an expression to an unsigned integer value in the dialect. Returns a boolean indicating
   * whether the cast was successful or not.
   */
  castToUint(unparser: Unparser, expr: Expr): boolean;

  /**
   * Handle the addition operator for the dialect. In some dialects, addition can be used to concatenate
   * strings, bytes, or lists. This method returns a boolean indicating whether the addition operation
   * was handled by the dialect.
   */
  add(unparser: Unparser, lhs: Expr, rhs: Expr): boolean;

  /**
   * Handle how the dialect unparses an array index operation. Some dialects do not support array indexing
   * or may have specific syntax for it. This method returns a boolean indicating whether the index operation
   * was handled by the dialect.
   */
  index(unparser: Unparser, expr: Expr, index: Expr): boolean;

  /**
   * Handle size function unparsing for the dialect. Different dialects may vary in how they determine the size
   * of data or in what data types are eligible to have their size checked. It returns a boolean indicating
   * whether the size function was handled by the dialect.
   */
  size(unparser: Unparser, expr: Expr): boolean;

  /**
   * Handle string contains function unparsing for the dialect. This function checks if a string contains a
   * substring, optionally with case insensitivity. It returns a boolean indicating whether the function was
   * handled by the dialect.
   */
  stringContains(unparser: Unparser, expr: Expr, substr: Expr, caseInsensitive?: Expr): boolean;

  /**
   * Handle string starts with function unparsing for the dialect. This function checks if a string starts with
   * a given prefix, optionally with case insensitivity. It returns a boolean indicating whether the function was
   * handled by the dialect.
   */
  stringStartsWith(unparser: Unparser, expr: Expr, prefix: Expr, caseInsensitive?: Expr): boolean;

  /**
   * Handle string ends with function unparsing for the dialect. This function checks if a string ends with
   * a given suffix, optionally with case insensitivity. It returns a boolean indicating whether the function was
   * handled by the dialect.
   */
  stringEndsWith(unparser: Unparser, expr: Expr, suffix: Expr, caseInsensitive?: Expr): boolean;

  /**
   * Handle string lower function unparsing for the dialect. This function converts a string to lowercase. It
   * returns a boolean indicating whether the function was handled by the dialect.
   */
  stringLower(unparser: Unparser, expr: Expr): boolean;

  /**
   * Handle string upper function unparsing for the dialect. This function converts a string to uppercase. It
   * returns a boolean indicating whether the function was handled by the dialect.
   */
  stringUpper(unparser: Unparser, expr: Expr): boolean;

  /**
   * Handle string trim function unparsing for the dialect. This function removes leading and trailing whitespace
   * from a string. It returns a boolean indicating whether the function was handled by the dialect.
   */
  stringTrim(unparser: Unparser, expr: Expr): boolean;

  /**
   * Handle string like function unparsing for the dialect. This function checks if a string matches a pattern,
   * optionally with case insensitivity. It returns a boolean indicating whether the function was handled by the
   * dialect.
   */
  stringLike(unparser: Unparser, expr: Expr, pattern: Expr, caseInsensitive?: Expr): boolean;

  /**
   * Handle converting an expression to a specific time zone. It returns a boolean indicating whether the
   * operation was handled by the dialect.
   */
  atTimeZone(unparser: Unparser, expr: Expr, tzExpr: Expr): boolean;

  /**
   * Handle getting the current timestamp in the dialect. It returns a boolean indicating whether the operation
   * was handled by the dialect. If a time zone expression is provided, it will be used to adjust the output.
   */
  now(unparser: Unparser, tzExpr?: Expr): boolean;

  /**
   * Handle getting the full year from a temporal expression. It returns a boolean indicating whether the
   * operation was handled by the dialect. If a time zone expression is provided, it will be used to adjust the output.
   */
  getFullYear(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean;

  /**
   * Handle getting the month from a temporal expression. It returns a boolean indicating whether the operation
   * was handled by the dialect. If a time zone expression is provided, it will be used to adjust the output.
   */
  getMonth(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean;

  /**
   * Handle getting the day of the year from a temporal expression. It returns a boolean indicating whether the
   * operation was handled by the dialect. If a time zone expression is provided, it will be used to adjust the output.
   */
  getDayOfYear(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean;

  /**
   * Handle getting the date from a temporal expression. It returns a boolean indicating whether the operation
   * was handled by the dialect. If a time zone expression is provided, it will be used to adjust the output.
   */
  getDate(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean;

  /**
   * Handle getting the day of the week from a temporal expression. It returns a boolean indicating whether the
   * operation was handled by the dialect. If a time zone expression is provided, it will be used to adjust the output.
   */
  getDayOfWeek(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean;

  /**
   * Handle getting the hours from a temporal expression. It returns a boolean indicating whether the operation
   * was handled by the dialect. If a time zone expression is provided, it will be used to adjust the output.
   */
  getHours(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean;

  /**
   * Handle getting the minutes from a temporal expression. It returns a boolean indicating whether the operation
   * was handled by the dialect. If a time zone expression is provided, it will be used to adjust the output.
   */
  getMinutes(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean;

  /**
   * Handle getting the seconds from a temporal expression. It returns a boolean indicating whether the operation
   * was handled by the dialect. If a time zone expression is provided, it will be used to adjust the output.
   */
  getSeconds(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean;

  /**
   * Handle getting the milliseconds from a temporal expression. It returns a boolean indicating whether the operation
   * was handled by the dialect. If a time zone expression is provided, it will be used to adjust the output.
   */
  getMilliseconds(unparser: Unparser, expr: Expr, tzExpr?: Expr): boolean;

  /**
   * Allows the dialect to override function unparsing if the dialect has specific rules. Returns
   * a boolean indicating if the function was handled by the dialect.
   */
  functionToSqlOverrides(unparser: Unparser, functionName: string, args: Expr[]): boolean;

  /**
   * Allows the dialect to override operator unparsing if the dialect has specific rules.
   */
  findSqlOperator(operator: string): string;
}
