import {
  AllMacro,
  BoolType,
  BytesType,
  crossTypeNumericComparisons,
  DoubleType,
  DurationType,
  enableMacroCallTracking,
  EnvOption,
  ExistsMacro,
  ExistsOneMacro,
  func,
  IntType,
  lib,
  macros,
  memberOverload,
  overload,
  SingletonLibrary,
  StringType,
  TimestampType,
  UintType,
} from '@protoutil/cel';
import {
  ADD_OPERATOR,
  CONDITIONAL_OPERATOR,
  DIVIDE_OPERATOR,
  EQUALS_OPERATOR,
  GREATER_EQUALS_OPERATOR,
  GREATER_OPERATOR,
  IN_OPERATOR,
  INDEX_OPERATOR,
  LESS_EQUALS_OPERATOR,
  LESS_OPERATOR,
  LOGICAL_AND_OPERATOR,
  LOGICAL_NOT_OPERATOR,
  LOGICAL_OR_OPERATOR,
  MODULO_OPERATOR,
  MULTIPLY_OPERATOR,
  NOT_EQUALS_OPERATOR,
  NOT_STRICTLY_FALSE_OPERATOR,
  SUBTRACT_OPERATOR,
} from '../operators.js';
import {
  ADD_BYTES_OVERLOAD,
  ADD_DOUBLE_OVERLOAD,
  ADD_DURATION_DURATION_OVERLOAD,
  ADD_DURATION_TIMESTAMP_OVERLOAD,
  ADD_INT64_OVERLOAD,
  ADD_LIST_OVERLOAD,
  ADD_STRING_OVERLOAD,
  ADD_TIMESTAMP_DURATION_OVERLOAD,
  ADD_UINT64_OVERLOAD,
  AT_TIMEZONE_OVERLOAD,
  BOOL_TO_BOOL_OVERLOAD,
  BOOL_TO_STRING_OVERLOAD,
  BYTES_TO_BYTES_OVERLOAD,
  BYTES_TO_STRING_OVERLOAD,
  CONDITIONAL_OVERLOAD,
  CONTAINS_OVERLOAD,
  CONTAINS_STRING_FLAG_OVERLOAD,
  CONTAINS_STRING_OVERLOAD,
  DATE_TO_DATE_OVERLOAD,
  DATE_TO_DAY_OF_MONTH_ONE_BASED_OVERLOAD,
  DATE_TO_DAY_OF_MONTH_ONE_BASED_WITH_TZ_OVERLOAD,
  DATE_TO_DAY_OF_WEEK_OVERLOAD,
  DATE_TO_DAY_OF_WEEK_WITH_TZ_OVERLOAD,
  DATE_TO_DAY_OF_YEAR_OVERLOAD,
  DATE_TO_DAY_OF_YEAR_WITH_TZ_OVERLOAD,
  DATE_TO_MONTH_OVERLOAD,
  DATE_TO_MONTH_WITH_TZ_OVERLOAD,
  DATE_TO_YEAR_OVERLOAD,
  DATE_TO_YEAR_WITH_TZ_OVERLOAD,
  DIVIDE_DOUBLE_OVERLOAD,
  DIVIDE_INT64_OVERLOAD,
  DIVIDE_UINT64_OVERLOAD,
  DOUBLE_TO_DOUBLE_OVERLOAD,
  DOUBLE_TO_DURATION_OVERLOAD,
  DOUBLE_TO_INT_OVERLOAD,
  DOUBLE_TO_STRING_OVERLOAD,
  DOUBLE_TO_UINT_OVERLOAD,
  DURATION_TO_DURATION_OVERLOAD,
  ENDS_WITH_OVERLOAD,
  ENDS_WITH_STRING_FLAG_OVERLOAD,
  ENDS_WITH_STRING_OVERLOAD,
  EQUALS_OVERLOAD,
  GREATER_BOOL_OVERLOAD,
  GREATER_BYTES_OVERLOAD,
  GREATER_DOUBLE_INT64_OVERLOAD,
  GREATER_DOUBLE_OVERLOAD,
  GREATER_DOUBLE_UINT64_OVERLOAD,
  GREATER_DURATION_OVERLOAD,
  GREATER_EQUALS_BOOL_OVERLOAD,
  GREATER_EQUALS_BYTES_OVERLOAD,
  GREATER_EQUALS_DOUBLE_INT64_OVERLOAD,
  GREATER_EQUALS_DOUBLE_OVERLOAD,
  GREATER_EQUALS_DOUBLE_UINT64_OVERLOAD,
  GREATER_EQUALS_DURATION_OVERLOAD,
  GREATER_EQUALS_INT64_DOUBLE_OVERLOAD,
  GREATER_EQUALS_INT64_OVERLOAD,
  GREATER_EQUALS_INT64_UINT64_OVERLOAD,
  GREATER_EQUALS_STRING_OVERLOAD,
  GREATER_EQUALS_TIMESTAMP_OVERLOAD,
  GREATER_EQUALS_UINT64_DOUBLE_OVERLOAD,
  GREATER_EQUALS_UINT64_INT64_OVERLOAD,
  GREATER_EQUALS_UINT64_OVERLOAD,
  GREATER_INT64_DOUBLE_OVERLOAD,
  GREATER_INT64_OVERLOAD,
  GREATER_INT64_UINT64_OVERLOAD,
  GREATER_STRING_OVERLOAD,
  GREATER_TIMESTAMP_OVERLOAD,
  GREATER_UINT64_DOUBLE_OVERLOAD,
  GREATER_UINT64_INT64_OVERLOAD,
  GREATER_UINT64_OVERLOAD,
  IN_LIST_OVERLOAD,
  INDEX_LIST_OVERLOAD,
  INT_TO_DOUBLE_OVERLOAD,
  INT_TO_DURATION_OVERLOAD,
  INT_TO_INT_OVERLOAD,
  INT_TO_STRING_OVERLOAD,
  INT_TO_UINT_OVERLOAD,
  LESS_BOOL_OVERLOAD,
  LESS_BYTES_OVERLOAD,
  LESS_DOUBLE_INT64_OVERLOAD,
  LESS_DOUBLE_OVERLOAD,
  LESS_DOUBLE_UINT64_OVERLOAD,
  LESS_DURATION_OVERLOAD,
  LESS_EQUALS_BOOL_OVERLOAD,
  LESS_EQUALS_BYTES_OVERLOAD,
  LESS_EQUALS_DOUBLE_INT64_OVERLOAD,
  LESS_EQUALS_DOUBLE_OVERLOAD,
  LESS_EQUALS_DOUBLE_UINT64_OVERLOAD,
  LESS_EQUALS_DURATION_OVERLOAD,
  LESS_EQUALS_INT64_DOUBLE_OVERLOAD,
  LESS_EQUALS_INT64_OVERLOAD,
  LESS_EQUALS_INT64_UINT64_OVERLOAD,
  LESS_EQUALS_STRING_OVERLOAD,
  LESS_EQUALS_TIMESTAMP_OVERLOAD,
  LESS_EQUALS_UINT64_DOUBLE_OVERLOAD,
  LESS_EQUALS_UINT64_INT64_OVERLOAD,
  LESS_EQUALS_UINT64_OVERLOAD,
  LESS_INT64_DOUBLE_OVERLOAD,
  LESS_INT64_OVERLOAD,
  LESS_INT64_UINT64_OVERLOAD,
  LESS_STRING_OVERLOAD,
  LESS_TIMESTAMP_OVERLOAD,
  LESS_UINT64_DOUBLE_OVERLOAD,
  LESS_UINT64_INT64_OVERLOAD,
  LESS_UINT64_OVERLOAD,
  LIKE_OVERLOAD,
  LIKE_STRING_FLAG_OVERLOAD,
  LIKE_STRING_OVERLOAD,
  LOGICAL_AND_OVERLOAD,
  LOGICAL_NOT_OVERLOAD,
  LOGICAL_OR_OVERLOAD,
  MODULO_INT64_OVERLOAD,
  MODULO_UINT64_OVERLOAD,
  MULTIPLY_DOUBLE_OVERLOAD,
  MULTIPLY_INT64_OVERLOAD,
  MULTIPLY_UINT64_OVERLOAD,
  NOT_EQUALS_OVERLOAD,
  SIZE_BYTES_INST_OVERLOAD,
  SIZE_BYTES_OVERLOAD,
  SIZE_LIST_INST_OVERLOAD,
  SIZE_LIST_OVERLOAD,
  SIZE_OVERLOAD,
  SIZE_STRING_INST_OVERLOAD,
  SIZE_STRING_OVERLOAD,
  STARTS_WITH_OVERLOAD,
  STARTS_WITH_STRING_FLAG_OVERLOAD,
  STARTS_WITH_STRING_OVERLOAD,
  STRING_LOWER_OVERLOAD,
  STRING_TO_BOOL_OVERLOAD,
  STRING_TO_BYTES_OVERLOAD,
  STRING_TO_DATE_OVERLOAD,
  STRING_TO_DOUBLE_OVERLOAD,
  STRING_TO_DURATION_OVERLOAD,
  STRING_TO_INT_OVERLOAD,
  STRING_TO_STRING_OVERLOAD,
  STRING_TO_TIME_OVERLOAD,
  STRING_TO_TIMESTAMP_OVERLOAD,
  STRING_TO_TIMESTAMP_WITH_TZ_OVERLOAD,
  STRING_TO_UINT_OVERLOAD,
  STRING_TRIM_OVERLOAD,
  STRING_UPPER_OVERLOAD,
  SUBTRACT_DOUBLE_OVERLOAD,
  SUBTRACT_DURATION_DURATION_OVERLOAD,
  SUBTRACT_INT64_OVERLOAD,
  SUBTRACT_TIMESTAMP_DURATION_OVERLOAD,
  SUBTRACT_TIMESTAMP_TIMESTAMP_OVERLOAD,
  SUBTRACT_UINT64_OVERLOAD,
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
  TIME_TO_HOURS_OVERLOAD,
  TIME_TO_HOURS_WITH_TZ_OVERLOAD,
  TIME_TO_MILLISECONDS_OVERLOAD,
  TIME_TO_MILLISECONDS_WITH_TZ_OVERLOAD,
  TIME_TO_MINUTES_OVERLOAD,
  TIME_TO_MINUTES_WITH_TZ_OVERLOAD,
  TIME_TO_SECONDS_OVERLOAD,
  TIME_TO_SECONDS_WITH_TZ_OVERLOAD,
  TIME_TO_TIME_OVERLOAD,
  TIMESTAMP_AT_TIMEZONE_OVERLOAD,
  TIMESTAMP_NOW,
  TIMESTAMP_NOW_WITH_TZ,
  TIMESTAMP_TO_DATE_OVERLOAD,
  TIMESTAMP_TO_DAY_OF_MONTH_ONE_BASED_OVERLOAD,
  TIMESTAMP_TO_DAY_OF_MONTH_ONE_BASED_WITH_TZ_OVERLOAD,
  TIMESTAMP_TO_DAY_OF_WEEK_OVERLOAD,
  TIMESTAMP_TO_DAY_OF_WEEK_WITH_TZ_OVERLOAD,
  TIMESTAMP_TO_DAY_OF_YEAR_OVERLOAD,
  TIMESTAMP_TO_DAY_OF_YEAR_WITH_TZ_OVERLOAD,
  TIMESTAMP_TO_HOURS_OVERLOAD,
  TIMESTAMP_TO_HOURS_WITH_TZ_OVERLOAD,
  TIMESTAMP_TO_MILLISECONDS_OVERLOAD,
  TIMESTAMP_TO_MILLISECONDS_WITH_TZ_OVERLOAD,
  TIMESTAMP_TO_MINUTES_OVERLOAD,
  TIMESTAMP_TO_MINUTES_WITH_TZ_OVERLOAD,
  TIMESTAMP_TO_MONTH_OVERLOAD,
  TIMESTAMP_TO_MONTH_WITH_TZ_OVERLOAD,
  TIMESTAMP_TO_SECONDS_OVERLOAD,
  TIMESTAMP_TO_SECONDS_WITH_TZ_OVERLOAD,
  TIMESTAMP_TO_TIME_OVERLOAD,
  TIMESTAMP_TO_TIMESTAMP_OVERLOAD,
  TIMESTAMP_TO_TIMESTAMP_WITH_TZ_OVERLOAD,
  TIMESTAMP_TO_YEAR_OVERLOAD,
  TIMESTAMP_TO_YEAR_WITH_TZ_OVERLOAD,
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
  UINT_TO_DOUBLE_OVERLOAD,
  UINT_TO_DURATION_OVERLOAD,
  UINT_TO_INT_OVERLOAD,
  UINT_TO_STRING_OVERLOAD,
  UINT_TO_UINT_OVERLOAD,
} from '../overloads.js';
import { DateType, listOfA, paramA, paramB, TimeType } from '../types.js';

export const defaultLibraryFunctions = new Map([
  // Functions from CEL standard library
  // Logical operators
  [
    CONDITIONAL_OPERATOR,
    func(CONDITIONAL_OPERATOR, overload(CONDITIONAL_OVERLOAD, [BoolType, paramA, paramA], paramA)),
  ],
  [
    LOGICAL_OR_OPERATOR,
    func(LOGICAL_OR_OPERATOR, overload(LOGICAL_OR_OVERLOAD, [BoolType, BoolType], BoolType)),
  ],
  [
    LOGICAL_AND_OPERATOR,
    func(LOGICAL_AND_OPERATOR, overload(LOGICAL_AND_OVERLOAD, [BoolType, BoolType], BoolType)),
  ],
  [
    LOGICAL_NOT_OPERATOR,
    func(LOGICAL_NOT_OPERATOR, overload(LOGICAL_NOT_OVERLOAD, [BoolType], BoolType)),
  ],

  // Comprehension short-circuiting related function
  [
    NOT_STRICTLY_FALSE_OPERATOR,
    func(NOT_STRICTLY_FALSE_OPERATOR, overload(NOT_STRICTLY_FALSE_OPERATOR, [BoolType], BoolType)),
  ],

  // Equality operators
  [EQUALS_OPERATOR, func(EQUALS_OPERATOR, overload(EQUALS_OVERLOAD, [paramA, paramB], BoolType))],
  [
    NOT_EQUALS_OPERATOR,
    func(NOT_EQUALS_OPERATOR, overload(NOT_EQUALS_OVERLOAD, [paramA, paramB], BoolType)),
  ],

  // Mathematical operators
  [
    ADD_OPERATOR,
    func(
      ADD_OPERATOR,
      overload(ADD_BYTES_OVERLOAD, [BytesType, BytesType], BytesType),
      overload(ADD_DOUBLE_OVERLOAD, [DoubleType, DoubleType], DoubleType),
      overload(ADD_DURATION_DURATION_OVERLOAD, [DurationType, DurationType], DurationType),
      overload(ADD_DURATION_TIMESTAMP_OVERLOAD, [DurationType, TimestampType], TimestampType),
      overload(ADD_TIMESTAMP_DURATION_OVERLOAD, [TimestampType, DurationType], TimestampType),
      overload(ADD_INT64_OVERLOAD, [IntType, IntType], IntType),
      overload(ADD_LIST_OVERLOAD, [listOfA, listOfA], listOfA),
      overload(ADD_STRING_OVERLOAD, [StringType, StringType], StringType),
      overload(ADD_UINT64_OVERLOAD, [UintType, UintType], UintType)
    ),
  ],
  [
    DIVIDE_OPERATOR,
    func(
      DIVIDE_OPERATOR,
      overload(DIVIDE_DOUBLE_OVERLOAD, [DoubleType, DoubleType], DoubleType),
      overload(DIVIDE_INT64_OVERLOAD, [IntType, IntType], DoubleType),
      overload(DIVIDE_UINT64_OVERLOAD, [UintType, UintType], DoubleType)
    ),
  ],
  [
    MODULO_OPERATOR,
    func(
      MODULO_OPERATOR,
      overload(MODULO_INT64_OVERLOAD, [IntType, IntType], IntType),
      overload(MODULO_UINT64_OVERLOAD, [UintType, UintType], UintType)
    ),
  ],
  [
    MULTIPLY_OPERATOR,
    func(
      MULTIPLY_OPERATOR,
      overload(MULTIPLY_DOUBLE_OVERLOAD, [DoubleType, DoubleType], DoubleType),
      overload(MULTIPLY_INT64_OVERLOAD, [IntType, IntType], IntType),
      overload(MULTIPLY_UINT64_OVERLOAD, [UintType, UintType], UintType)
    ),
  ],
  [
    SUBTRACT_OPERATOR,
    func(
      SUBTRACT_OPERATOR,
      overload(SUBTRACT_DOUBLE_OVERLOAD, [DoubleType, DoubleType], DoubleType),
      overload(SUBTRACT_DURATION_DURATION_OVERLOAD, [DurationType, DurationType], DurationType),
      overload(SUBTRACT_INT64_OVERLOAD, [IntType, IntType], IntType),
      overload(SUBTRACT_TIMESTAMP_DURATION_OVERLOAD, [TimestampType, DurationType], TimestampType),
      overload(SUBTRACT_TIMESTAMP_TIMESTAMP_OVERLOAD, [TimestampType, TimestampType], DurationType),
      overload(SUBTRACT_UINT64_OVERLOAD, [UintType, UintType], UintType)
    ),
  ],

  // Comparison operators
  [
    LESS_OPERATOR,
    func(
      LESS_OPERATOR,
      overload(LESS_BOOL_OVERLOAD, [BoolType, BoolType], BoolType),
      overload(LESS_INT64_OVERLOAD, [IntType, IntType], BoolType),
      overload(LESS_INT64_DOUBLE_OVERLOAD, [IntType, DoubleType], BoolType),
      overload(LESS_INT64_UINT64_OVERLOAD, [IntType, UintType], BoolType),
      overload(LESS_UINT64_OVERLOAD, [UintType, UintType], BoolType),
      overload(LESS_UINT64_DOUBLE_OVERLOAD, [UintType, DoubleType], BoolType),
      overload(LESS_UINT64_INT64_OVERLOAD, [UintType, IntType], BoolType),
      overload(LESS_DOUBLE_OVERLOAD, [DoubleType, DoubleType], BoolType),
      overload(LESS_DOUBLE_INT64_OVERLOAD, [DoubleType, IntType], BoolType),
      overload(LESS_DOUBLE_UINT64_OVERLOAD, [DoubleType, UintType], BoolType),
      overload(LESS_STRING_OVERLOAD, [StringType, StringType], BoolType),
      overload(LESS_BYTES_OVERLOAD, [BytesType, BytesType], BoolType),
      overload(LESS_TIMESTAMP_OVERLOAD, [TimestampType, TimestampType], BoolType),
      overload(LESS_DURATION_OVERLOAD, [DurationType, DurationType], BoolType)
    ),
  ],
  [
    LESS_EQUALS_OPERATOR,
    func(
      LESS_EQUALS_OPERATOR,
      overload(LESS_EQUALS_BOOL_OVERLOAD, [BoolType, BoolType], BoolType),
      overload(LESS_EQUALS_INT64_OVERLOAD, [IntType, IntType], BoolType),
      overload(LESS_EQUALS_INT64_DOUBLE_OVERLOAD, [IntType, DoubleType], BoolType),
      overload(LESS_EQUALS_INT64_UINT64_OVERLOAD, [IntType, UintType], BoolType),
      overload(LESS_EQUALS_UINT64_OVERLOAD, [UintType, UintType], BoolType),
      overload(LESS_EQUALS_UINT64_DOUBLE_OVERLOAD, [UintType, DoubleType], BoolType),
      overload(LESS_EQUALS_UINT64_INT64_OVERLOAD, [UintType, IntType], BoolType),
      overload(LESS_EQUALS_DOUBLE_OVERLOAD, [DoubleType, DoubleType], BoolType),
      overload(LESS_EQUALS_DOUBLE_INT64_OVERLOAD, [DoubleType, IntType], BoolType),
      overload(LESS_EQUALS_DOUBLE_UINT64_OVERLOAD, [DoubleType, UintType], BoolType),
      overload(LESS_EQUALS_STRING_OVERLOAD, [StringType, StringType], BoolType),
      overload(LESS_EQUALS_BYTES_OVERLOAD, [BytesType, BytesType], BoolType),
      overload(LESS_EQUALS_TIMESTAMP_OVERLOAD, [TimestampType, TimestampType], BoolType),
      overload(LESS_EQUALS_DURATION_OVERLOAD, [DurationType, DurationType], BoolType)
    ),
  ],
  [
    GREATER_OPERATOR,
    func(
      GREATER_OPERATOR,
      overload(GREATER_BOOL_OVERLOAD, [BoolType, BoolType], BoolType),
      overload(GREATER_INT64_OVERLOAD, [IntType, IntType], BoolType),
      overload(GREATER_INT64_DOUBLE_OVERLOAD, [IntType, DoubleType], BoolType),
      overload(GREATER_INT64_UINT64_OVERLOAD, [IntType, UintType], BoolType),
      overload(GREATER_UINT64_OVERLOAD, [UintType, UintType], BoolType),
      overload(GREATER_UINT64_DOUBLE_OVERLOAD, [UintType, DoubleType], BoolType),
      overload(GREATER_UINT64_INT64_OVERLOAD, [UintType, IntType], BoolType),
      overload(GREATER_DOUBLE_OVERLOAD, [DoubleType, DoubleType], BoolType),
      overload(GREATER_DOUBLE_INT64_OVERLOAD, [DoubleType, IntType], BoolType),
      overload(GREATER_DOUBLE_UINT64_OVERLOAD, [DoubleType, UintType], BoolType),
      overload(GREATER_STRING_OVERLOAD, [StringType, StringType], BoolType),
      overload(GREATER_BYTES_OVERLOAD, [BytesType, BytesType], BoolType),
      overload(GREATER_TIMESTAMP_OVERLOAD, [TimestampType, TimestampType], BoolType),
      overload(GREATER_DURATION_OVERLOAD, [DurationType, DurationType], BoolType)
    ),
  ],
  [
    GREATER_EQUALS_OPERATOR,
    func(
      GREATER_EQUALS_OPERATOR,
      overload(GREATER_EQUALS_BOOL_OVERLOAD, [BoolType, BoolType], BoolType),
      overload(GREATER_EQUALS_INT64_OVERLOAD, [IntType, IntType], BoolType),
      overload(GREATER_EQUALS_INT64_DOUBLE_OVERLOAD, [IntType, DoubleType], BoolType),
      overload(GREATER_EQUALS_INT64_UINT64_OVERLOAD, [IntType, UintType], BoolType),
      overload(GREATER_EQUALS_UINT64_OVERLOAD, [UintType, UintType], BoolType),
      overload(GREATER_EQUALS_UINT64_DOUBLE_OVERLOAD, [UintType, DoubleType], BoolType),
      overload(GREATER_EQUALS_UINT64_INT64_OVERLOAD, [UintType, IntType], BoolType),
      overload(GREATER_EQUALS_DOUBLE_OVERLOAD, [DoubleType, DoubleType], BoolType),
      overload(GREATER_EQUALS_DOUBLE_INT64_OVERLOAD, [DoubleType, IntType], BoolType),
      overload(GREATER_EQUALS_DOUBLE_UINT64_OVERLOAD, [DoubleType, UintType], BoolType),
      overload(GREATER_EQUALS_STRING_OVERLOAD, [StringType, StringType], BoolType),
      overload(GREATER_EQUALS_BYTES_OVERLOAD, [BytesType, BytesType], BoolType),
      overload(GREATER_EQUALS_TIMESTAMP_OVERLOAD, [TimestampType, TimestampType], BoolType),
      overload(GREATER_EQUALS_DURATION_OVERLOAD, [DurationType, DurationType], BoolType)
    ),
  ],

  // Generic operators
  [INDEX_OPERATOR, func(INDEX_OPERATOR, overload(INDEX_LIST_OVERLOAD, [listOfA, IntType], paramA))],
  [IN_OPERATOR, func(IN_OPERATOR, overload(IN_LIST_OVERLOAD, [paramA, listOfA], BoolType))],
  [
    SIZE_OVERLOAD,
    func(
      SIZE_OVERLOAD,
      overload(SIZE_BYTES_OVERLOAD, [BytesType], IntType),
      memberOverload(SIZE_BYTES_INST_OVERLOAD, [BytesType], IntType),
      overload(SIZE_LIST_OVERLOAD, [listOfA], IntType),
      memberOverload(SIZE_LIST_INST_OVERLOAD, [listOfA], IntType),
      overload(SIZE_STRING_OVERLOAD, [StringType], IntType),
      memberOverload(SIZE_STRING_INST_OVERLOAD, [StringType], IntType)
    ),
  ],

  // Bool conversions
  [
    TYPE_CONVERT_BOOL_OVERLOAD,
    func(
      TYPE_CONVERT_BOOL_OVERLOAD,
      overload(BOOL_TO_BOOL_OVERLOAD, [BoolType], BoolType),
      overload(STRING_TO_BOOL_OVERLOAD, [StringType], BoolType)
    ),
  ],

  // Bytes conversions
  [
    TYPE_CONVERT_BYTES_OVERLOAD,
    func(
      TYPE_CONVERT_BYTES_OVERLOAD,
      overload(BYTES_TO_BYTES_OVERLOAD, [BytesType], BytesType),
      overload(STRING_TO_BYTES_OVERLOAD, [StringType], BytesType)
    ),
  ],

  // Double conversions
  [
    TYPE_CONVERT_DOUBLE_OVERLOAD,
    func(
      TYPE_CONVERT_DOUBLE_OVERLOAD,
      overload(DOUBLE_TO_DOUBLE_OVERLOAD, [DoubleType], DoubleType),
      overload(INT_TO_DOUBLE_OVERLOAD, [IntType], DoubleType),
      overload(STRING_TO_DOUBLE_OVERLOAD, [StringType], DoubleType),
      overload(UINT_TO_DOUBLE_OVERLOAD, [UintType], DoubleType)
    ),
  ],

  // Duration conversions
  [
    TYPE_CONVERT_DURATION_OVERLOAD,
    func(
      TYPE_CONVERT_DURATION_OVERLOAD,
      overload(DURATION_TO_DURATION_OVERLOAD, [DurationType], DurationType),
      overload(STRING_TO_DURATION_OVERLOAD, [StringType], DurationType),
      overload(INT_TO_DURATION_OVERLOAD, [IntType], DurationType),
      overload(DOUBLE_TO_DURATION_OVERLOAD, [DoubleType], DurationType),
      overload(UINT_TO_DURATION_OVERLOAD, [UintType], DurationType)
    ),
  ],

  // Int conversions
  [
    TYPE_CONVERT_INT_OVERLOAD,
    func(
      TYPE_CONVERT_INT_OVERLOAD,
      overload(INT_TO_INT_OVERLOAD, [IntType], IntType),
      overload(DOUBLE_TO_INT_OVERLOAD, [DoubleType], IntType),
      overload(STRING_TO_INT_OVERLOAD, [StringType], IntType),
      overload(UINT_TO_INT_OVERLOAD, [UintType], IntType)
    ),
  ],

  // String conversions
  [
    TYPE_CONVERT_STRING_OVERLOAD,
    func(
      TYPE_CONVERT_STRING_OVERLOAD,
      overload(STRING_TO_STRING_OVERLOAD, [StringType], StringType),
      overload(BOOL_TO_STRING_OVERLOAD, [BoolType], StringType),
      overload(BYTES_TO_STRING_OVERLOAD, [BytesType], StringType),
      overload(DOUBLE_TO_STRING_OVERLOAD, [DoubleType], StringType),
      overload(INT_TO_STRING_OVERLOAD, [IntType], StringType),
      overload(UINT_TO_STRING_OVERLOAD, [UintType], StringType)
    ),
  ],

  // Timestamp conversions
  [
    TYPE_CONVERT_TIMESTAMP_OVERLOAD,
    func(
      TYPE_CONVERT_TIMESTAMP_OVERLOAD,
      overload(TIMESTAMP_TO_TIMESTAMP_OVERLOAD, [TimestampType], TimestampType),
      overload(STRING_TO_TIMESTAMP_OVERLOAD, [StringType], TimestampType),
      overload(TIMESTAMP_TO_TIMESTAMP_WITH_TZ_OVERLOAD, [TimestampType, StringType], TimestampType),
      overload(STRING_TO_TIMESTAMP_WITH_TZ_OVERLOAD, [StringType, StringType], TimestampType)
    ),
  ],

  // Uint conversions
  [
    TYPE_CONVERT_UINT_OVERLOAD,
    func(
      TYPE_CONVERT_UINT_OVERLOAD,
      overload(UINT_TO_UINT_OVERLOAD, [UintType], UintType),
      overload(DOUBLE_TO_UINT_OVERLOAD, [DoubleType], UintType),
      overload(INT_TO_UINT_OVERLOAD, [IntType], UintType),
      overload(STRING_TO_UINT_OVERLOAD, [StringType], UintType)
    ),
  ],

  // String functions
  [
    CONTAINS_OVERLOAD,
    func(
      CONTAINS_OVERLOAD,
      memberOverload(CONTAINS_STRING_OVERLOAD, [StringType, StringType], BoolType),
      memberOverload(CONTAINS_STRING_FLAG_OVERLOAD, [StringType, StringType, BoolType], BoolType)
    ),
  ],
  [
    ENDS_WITH_OVERLOAD,
    func(
      ENDS_WITH_OVERLOAD,
      memberOverload(ENDS_WITH_STRING_OVERLOAD, [StringType, StringType], BoolType),
      memberOverload(ENDS_WITH_STRING_FLAG_OVERLOAD, [StringType, StringType, BoolType], BoolType)
    ),
  ],
  [
    STARTS_WITH_OVERLOAD,
    func(
      STARTS_WITH_OVERLOAD,
      memberOverload(STARTS_WITH_STRING_OVERLOAD, [StringType, StringType], BoolType),
      memberOverload(STARTS_WITH_STRING_FLAG_OVERLOAD, [StringType, StringType, BoolType], BoolType)
    ),
  ],

  // Timestamp / duration functions
  [
    TIMESTAMP_NOW,
    func(
      TIMESTAMP_NOW,
      overload(TIMESTAMP_NOW, [], TimestampType),
      overload(TIMESTAMP_NOW_WITH_TZ, [StringType], TimestampType)
    ),
  ],
  [
    TIME_GET_FULL_YEAR_OVERLOAD,
    func(
      TIME_GET_FULL_YEAR_OVERLOAD,
      memberOverload(DATE_TO_YEAR_OVERLOAD, [DateType], IntType),
      memberOverload(DATE_TO_YEAR_WITH_TZ_OVERLOAD, [DateType, StringType], IntType),
      memberOverload(TIMESTAMP_TO_YEAR_OVERLOAD, [TimestampType], IntType),
      memberOverload(TIMESTAMP_TO_YEAR_WITH_TZ_OVERLOAD, [TimestampType, StringType], IntType)
    ),
  ],
  [
    TIME_GET_MONTH_OVERLOAD,
    func(
      TIME_GET_MONTH_OVERLOAD,
      memberOverload(DATE_TO_MONTH_OVERLOAD, [DateType], IntType),
      memberOverload(DATE_TO_MONTH_WITH_TZ_OVERLOAD, [DateType, StringType], IntType),
      memberOverload(TIMESTAMP_TO_MONTH_OVERLOAD, [TimestampType], IntType),
      memberOverload(TIMESTAMP_TO_MONTH_WITH_TZ_OVERLOAD, [TimestampType, StringType], IntType)
    ),
  ],
  [
    TIME_GET_DAY_OF_YEAR_OVERLOAD,
    func(
      TIME_GET_DAY_OF_YEAR_OVERLOAD,
      memberOverload(DATE_TO_DAY_OF_YEAR_OVERLOAD, [DateType], IntType),
      memberOverload(DATE_TO_DAY_OF_YEAR_WITH_TZ_OVERLOAD, [DateType, StringType], IntType),
      memberOverload(TIMESTAMP_TO_DAY_OF_YEAR_OVERLOAD, [TimestampType], IntType),
      memberOverload(
        TIMESTAMP_TO_DAY_OF_YEAR_WITH_TZ_OVERLOAD,
        [TimestampType, StringType],
        IntType
      )
    ),
  ],
  [
    TIME_GET_DATE_OVERLOAD,
    func(
      TIME_GET_DATE_OVERLOAD,
      memberOverload(DATE_TO_DAY_OF_MONTH_ONE_BASED_OVERLOAD, [DateType], IntType),
      memberOverload(
        DATE_TO_DAY_OF_MONTH_ONE_BASED_WITH_TZ_OVERLOAD,
        [DateType, StringType],
        IntType
      ),
      memberOverload(TIMESTAMP_TO_DAY_OF_MONTH_ONE_BASED_OVERLOAD, [TimestampType], IntType),
      memberOverload(
        TIMESTAMP_TO_DAY_OF_MONTH_ONE_BASED_WITH_TZ_OVERLOAD,
        [TimestampType, StringType],
        IntType
      )
    ),
  ],
  [
    TIME_GET_DAY_OF_WEEK_OVERLOAD,
    func(
      TIME_GET_DAY_OF_WEEK_OVERLOAD,
      memberOverload(DATE_TO_DAY_OF_WEEK_OVERLOAD, [DateType], IntType),
      memberOverload(DATE_TO_DAY_OF_WEEK_WITH_TZ_OVERLOAD, [DateType, StringType], IntType),
      memberOverload(TIMESTAMP_TO_DAY_OF_WEEK_OVERLOAD, [TimestampType], IntType),
      memberOverload(
        TIMESTAMP_TO_DAY_OF_WEEK_WITH_TZ_OVERLOAD,
        [TimestampType, StringType],
        IntType
      )
    ),
  ],
  [
    TIME_GET_HOURS_OVERLOAD,
    func(
      TIME_GET_HOURS_OVERLOAD,
      memberOverload(TIME_TO_HOURS_OVERLOAD, [TimeType], IntType),
      memberOverload(TIME_TO_HOURS_WITH_TZ_OVERLOAD, [TimeType, StringType], IntType),
      memberOverload(TIMESTAMP_TO_HOURS_OVERLOAD, [TimestampType], IntType),
      memberOverload(TIMESTAMP_TO_HOURS_WITH_TZ_OVERLOAD, [TimestampType, StringType], IntType)
    ),
  ],
  [
    TIME_GET_MINUTES_OVERLOAD,
    func(
      TIME_GET_MINUTES_OVERLOAD,
      memberOverload(TIME_TO_MINUTES_OVERLOAD, [TimeType], IntType),
      memberOverload(TIME_TO_MINUTES_WITH_TZ_OVERLOAD, [TimeType, StringType], IntType),
      memberOverload(TIMESTAMP_TO_MINUTES_OVERLOAD, [TimestampType], IntType),
      memberOverload(TIMESTAMP_TO_MINUTES_WITH_TZ_OVERLOAD, [TimestampType, StringType], IntType)
    ),
  ],
  [
    TIME_GET_SECONDS_OVERLOAD,
    func(
      TIME_GET_SECONDS_OVERLOAD,
      memberOverload(TIME_TO_SECONDS_OVERLOAD, [TimeType], IntType),
      memberOverload(TIME_TO_SECONDS_WITH_TZ_OVERLOAD, [TimeType, StringType], IntType),
      memberOverload(TIMESTAMP_TO_SECONDS_OVERLOAD, [TimestampType], IntType),
      memberOverload(TIMESTAMP_TO_SECONDS_WITH_TZ_OVERLOAD, [TimestampType, StringType], IntType)
    ),
  ],
  [
    TIME_GET_MILLISECONDS_OVERLOAD,
    func(
      TIME_GET_MILLISECONDS_OVERLOAD,
      memberOverload(TIME_TO_MILLISECONDS_OVERLOAD, [TimeType], IntType),
      memberOverload(TIME_TO_MILLISECONDS_WITH_TZ_OVERLOAD, [TimeType, StringType], IntType),
      memberOverload(TIMESTAMP_TO_MILLISECONDS_OVERLOAD, [TimestampType], IntType),
      memberOverload(
        TIMESTAMP_TO_MILLISECONDS_WITH_TZ_OVERLOAD,
        [TimestampType, StringType],
        IntType
      )
    ),
  ],

  // Custom CELQL functions

  // Timezone conversions
  [
    AT_TIMEZONE_OVERLOAD,
    func(
      AT_TIMEZONE_OVERLOAD,
      memberOverload(TIME_AT_TIMEZONE_OVERLOAD, [TimeType, StringType], TimeType),
      memberOverload(TIMESTAMP_AT_TIMEZONE_OVERLOAD, [TimestampType, StringType], TimestampType)
    ),
  ],

  // Date conversions
  [
    TYPE_CONVERT_DATE_OVERLOAD,
    func(
      TYPE_CONVERT_DATE_OVERLOAD,
      overload(DATE_TO_DATE_OVERLOAD, [DateType], DateType),
      overload(STRING_TO_DATE_OVERLOAD, [StringType], DateType),
      overload(TIMESTAMP_TO_DATE_OVERLOAD, [TimestampType], DateType)
    ),
  ],

  // Time conversions
  [
    TYPE_CONVERT_TIME_OVERLOAD,
    func(
      TYPE_CONVERT_TIME_OVERLOAD,
      overload(TIME_TO_TIME_OVERLOAD, [TimeType], TimeType),
      overload(STRING_TO_TIME_OVERLOAD, [StringType], TimeType),
      overload(TIMESTAMP_TO_TIME_OVERLOAD, [TimestampType], TimeType)
    ),
  ],

  // String formatting
  [
    STRING_LOWER_OVERLOAD,
    func(STRING_LOWER_OVERLOAD, memberOverload(STRING_LOWER_OVERLOAD, [StringType], StringType)),
  ],
  [
    STRING_UPPER_OVERLOAD,
    func(STRING_UPPER_OVERLOAD, memberOverload(STRING_UPPER_OVERLOAD, [StringType], StringType)),
  ],
  [
    STRING_TRIM_OVERLOAD,
    func(STRING_TRIM_OVERLOAD, memberOverload(STRING_TRIM_OVERLOAD, [StringType], StringType)),
  ],

  // String functions
  [
    LIKE_OVERLOAD,
    func(
      LIKE_OVERLOAD,
      memberOverload(LIKE_STRING_OVERLOAD, [StringType, StringType], BoolType),
      memberOverload(LIKE_STRING_FLAG_OVERLOAD, [StringType, StringType, BoolType], BoolType)
    ),
  ],
]);

export const defaultLibraryTypes = new Map<string, EnvOption>();

class defaultLib implements SingletonLibrary {
  libraryName() {
    return 'celql.lib.default';
  }

  compileOptions(): EnvOption[] {
    return [
      crossTypeNumericComparisons(true),
      enableMacroCallTracking(),
      // Set default functions
      ...defaultLibraryFunctions.values(),
      // Set default types
      ...defaultLibraryTypes.values(),
      // Set macros
      macros(ExistsMacro, ExistsOneMacro, AllMacro),
    ];
  }

  programOptions() {
    return [];
  }
}

let defaultLibInstance: defaultLib | null = null;

function getDefaultLib(): defaultLib {
  if (!defaultLibInstance) {
    defaultLibInstance = new defaultLib();
  }
  return defaultLibInstance;
}

/**
 * DefaultLib implements the Library interface and provides functional options
 * for the documented SQL features.
 */
export function DefaultLib() {
  return lib(getDefaultLib());
}
