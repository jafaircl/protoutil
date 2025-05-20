import {
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  EnvOption,
  IntType,
  SingletonLibrary,
  StringType,
  TimestampType,
  UintType,
  crossTypeNumericComparisons,
  func,
  lib,
  listType,
  mapType,
  memberOverload,
  overload,
  typeParamType,
} from '@bearclaw/cel';
import {
  ADD_OPERATOR,
  CONDITIONAL_OPERATOR,
  DIVIDE_OPERATOR,
  EQUALS_OPERATOR,
  GREATER_EQUALS_OPERATOR,
  GREATER_OPERATOR,
  IN_OPERATOR,
  LESS_EQUALS_OPERATOR,
  LESS_OPERATOR,
  LOGICAL_AND_OPERATOR,
  LOGICAL_NOT_OPERATOR,
  LOGICAL_OR_OPERATOR,
  MODULO_OPERATOR,
  MULTIPLY_OPERATOR,
  NOT_EQUALS_OPERATOR,
  SUBTRACT_OPERATOR,
} from './operators.js';
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
  CONDITIONAL_OVERLOAD,
  CONTAINS_OVERLOAD,
  CONTAINS_STRING_OVERLOAD,
  DIVIDE_DOUBLE_OVERLOAD,
  DIVIDE_INT64_OVERLOAD,
  DIVIDE_UINT64_OVERLOAD,
  ENDS_WITH_OVERLOAD,
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
  LOGICAL_AND_OVERLOAD,
  LOGICAL_NOT_OVERLOAD,
  LOGICAL_OR_OVERLOAD,
  MODULO_INT64_OVERLOAD,
  MODULO_UINT64_OVERLOAD,
  MULTIPLY_DOUBLE_OVERLOAD,
  MULTIPLY_INT64_OVERLOAD,
  MULTIPLY_UINT64_OVERLOAD,
  NOT_EQUALS_OVERLOAD,
  STARTS_WITH_OVERLOAD,
  STARTS_WITH_STRING_OVERLOAD,
  STRING_TO_DURATION_OVERLOAD,
  STRING_TO_TIMESTAMP_OVERLOAD,
  SUBTRACT_DOUBLE_OVERLOAD,
  SUBTRACT_DURATION_DURATION_OVERLOAD,
  SUBTRACT_INT64_OVERLOAD,
  SUBTRACT_TIMESTAMP_DURATION_OVERLOAD,
  SUBTRACT_TIMESTAMP_TIMESTAMP_OVERLOAD,
  SUBTRACT_UINT64_OVERLOAD,
  TYPE_CONVERT_DURATION_OVERLOAD,
  TYPE_CONVERT_TIMESTAMP_OVERLOAD,
} from './overloads.js';

const paramA = typeParamType('A');
const paramB = typeParamType('B');
const listOfA = listType(paramA);
const mapOfAB = mapType(paramA, paramB);

const sqlFunctions: EnvOption[] = [
  // Logical operators
  func(CONDITIONAL_OPERATOR, overload(CONDITIONAL_OVERLOAD, [BoolType, paramA, paramA], paramA)),
  func(LOGICAL_OR_OPERATOR, overload(LOGICAL_OR_OVERLOAD, [BoolType, BoolType], BoolType)),
  func(LOGICAL_AND_OPERATOR, overload(LOGICAL_AND_OVERLOAD, [BoolType, BoolType], BoolType)),
  func(LOGICAL_NOT_OPERATOR, overload(LOGICAL_NOT_OVERLOAD, [BoolType], BoolType)),

  // Equality operators
  func(EQUALS_OPERATOR, overload(EQUALS_OVERLOAD, [paramA, paramB], BoolType)),
  func(NOT_EQUALS_OPERATOR, overload(NOT_EQUALS_OVERLOAD, [paramA, paramB], BoolType)),

  // Mathematical operators
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
  func(
    DIVIDE_OPERATOR,
    overload(DIVIDE_DOUBLE_OVERLOAD, [DoubleType, DoubleType], DoubleType),
    overload(DIVIDE_INT64_OVERLOAD, [IntType, IntType], DoubleType),
    overload(DIVIDE_UINT64_OVERLOAD, [UintType, UintType], DoubleType)
  ),
  func(
    MODULO_OPERATOR,
    overload(MODULO_INT64_OVERLOAD, [IntType, IntType], IntType),
    overload(MODULO_UINT64_OVERLOAD, [UintType, UintType], UintType)
  ),
  func(
    MULTIPLY_OPERATOR,
    overload(MULTIPLY_DOUBLE_OVERLOAD, [DoubleType, DoubleType], DoubleType),
    overload(MULTIPLY_INT64_OVERLOAD, [IntType, IntType], IntType),
    overload(MULTIPLY_UINT64_OVERLOAD, [UintType, UintType], UintType)
  ),
  // TODO: negate doesn't really make sense? Why would you do it?
  //   func(
  //     NEGATE_OPERATOR,
  //     overload(NEGATE_DOUBLE_OVERLOAD, [DoubleType], DoubleType),
  //     overload(NEGATE_INT64_OVERLOAD, [IntType], IntType)
  //   ),
  func(
    SUBTRACT_OPERATOR,
    overload(SUBTRACT_DOUBLE_OVERLOAD, [DoubleType, DoubleType], DoubleType),
    overload(SUBTRACT_DURATION_DURATION_OVERLOAD, [DurationType, DurationType], DurationType),
    overload(SUBTRACT_INT64_OVERLOAD, [IntType, IntType], IntType),
    overload(SUBTRACT_TIMESTAMP_DURATION_OVERLOAD, [TimestampType, DurationType], TimestampType),
    overload(SUBTRACT_TIMESTAMP_TIMESTAMP_OVERLOAD, [TimestampType, TimestampType], DurationType),
    overload(SUBTRACT_UINT64_OVERLOAD, [UintType, UintType], UintType)
  ),

  // Relational operators (Less, LessEquals, Greater, GreaterEquals)
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

  // Collections operators
  func(
    IN_OPERATOR,
    overload(IN_LIST_OVERLOAD, [paramA, listOfA], BoolType)
    // overload(IN_MAP_OVERLOAD, [paramA, mapOfAB], BoolType)
  ),
  // func(SIZE_OVERLOAD, overload(SIZE_OVERLOAD, [listOfA], IntType)),

  // Duration conversions
  func(
    TYPE_CONVERT_DURATION_OVERLOAD,
    overload(STRING_TO_DURATION_OVERLOAD, [StringType], DurationType)
  ),

  // Timestamp conversions
  func(
    TYPE_CONVERT_TIMESTAMP_OVERLOAD,
    overload(STRING_TO_TIMESTAMP_OVERLOAD, [StringType], TimestampType)
  ),

  // String functions
  func(
    CONTAINS_OVERLOAD,
    memberOverload(CONTAINS_STRING_OVERLOAD, [StringType, StringType], BoolType)
  ),
  func(
    ENDS_WITH_OVERLOAD,
    memberOverload(ENDS_WITH_STRING_OVERLOAD, [StringType, StringType], BoolType)
  ),
  // TODO: sql equivalent?
  // func(MATCHES_OVERLOAD, memberOverload(MATCHES_OVERLOAD, [StringType, StringType], BoolType)),
  func(
    STARTS_WITH_OVERLOAD,
    memberOverload(STARTS_WITH_STRING_OVERLOAD, [StringType, StringType], BoolType)
  ),
];

export const sqlTypes: EnvOption[] = [];

class sqlLib implements SingletonLibrary {
  libraryName() {
    return 'celql.lib.std';
  }

  compileOptions(): EnvOption[] {
    return [
      crossTypeNumericComparisons(true),
      // Set standard functions
      ...sqlFunctions,
      // Set standard types
      ...sqlTypes,
    ];
  }

  programOptions() {
    return [];
  }
}

/**
 * SqlLib implements the Library interface and provides functional options
 * for the documented SQL features.
 */
export function SqlLib() {
  return lib(new sqlLib());
}
