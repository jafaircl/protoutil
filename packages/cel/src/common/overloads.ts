// Package overloads defines the internal overload identifiers for function and
// operator overloads.

// Boolean logic overloads
export const Conditional = "conditional";
export const LogicalAnd = "logical_and";
export const LogicalOr = "logical_or";
export const LogicalNot = "logical_not";
export const NotStrictlyFalse = "not_strictly_false";
export const Equals = "equals";
export const NotEquals = "not_equals";
export const LessBool = "less_bool";
export const LessInt64 = "less_int64";
export const LessInt64Double = "less_int64_double";
export const LessInt64Uint64 = "less_int64_uint64";
export const LessUint64 = "less_uint64";
export const LessUint64Double = "less_uint64_double";
export const LessUint64Int64 = "less_uint64_int64";
export const LessDouble = "less_double";
export const LessDoubleInt64 = "less_double_int64";
export const LessDoubleUint64 = "less_double_uint64";
export const LessString = "less_string";
export const LessBytes = "less_bytes";
export const LessTimestamp = "less_timestamp";
export const LessDuration = "less_duration";
export const LessEqualsBool = "less_equals_bool";
export const LessEqualsInt64 = "less_equals_int64";
export const LessEqualsInt64Double = "less_equals_int64_double";
export const LessEqualsInt64Uint64 = "less_equals_int64_uint64";
export const LessEqualsUint64 = "less_equals_uint64";
export const LessEqualsUint64Double = "less_equals_uint64_double";
export const LessEqualsUint64Int64 = "less_equals_uint64_int64";
export const LessEqualsDouble = "less_equals_double";
export const LessEqualsDoubleInt64 = "less_equals_double_int64";
export const LessEqualsDoubleUint64 = "less_equals_double_uint64";
export const LessEqualsString = "less_equals_string";
export const LessEqualsBytes = "less_equals_bytes";
export const LessEqualsTimestamp = "less_equals_timestamp";
export const LessEqualsDuration = "less_equals_duration";
export const GreaterBool = "greater_bool";
export const GreaterInt64 = "greater_int64";
export const GreaterInt64Double = "greater_int64_double";
export const GreaterInt64Uint64 = "greater_int64_uint64";
export const GreaterUint64 = "greater_uint64";
export const GreaterUint64Double = "greater_uint64_double";
export const GreaterUint64Int64 = "greater_uint64_int64";
export const GreaterDouble = "greater_double";
export const GreaterDoubleInt64 = "greater_double_int64";
export const GreaterDoubleUint64 = "greater_double_uint64";
export const GreaterString = "greater_string";
export const GreaterBytes = "greater_bytes";
export const GreaterTimestamp = "greater_timestamp";
export const GreaterDuration = "greater_duration";
export const GreaterEqualsBool = "greater_equals_bool";
export const GreaterEqualsInt64 = "greater_equals_int64";
export const GreaterEqualsInt64Double = "greater_equals_int64_double";
export const GreaterEqualsInt64Uint64 = "greater_equals_int64_uint64";
export const GreaterEqualsUint64 = "greater_equals_uint64";
export const GreaterEqualsUint64Double = "greater_equals_uint64_double";
export const GreaterEqualsUint64Int64 = "greater_equals_uint64_int64";
export const GreaterEqualsDouble = "greater_equals_double";
export const GreaterEqualsDoubleInt64 = "greater_equals_double_int64";
export const GreaterEqualsDoubleUint64 = "greater_equals_double_uint64";
export const GreaterEqualsString = "greater_equals_string";
export const GreaterEqualsBytes = "greater_equals_bytes";
export const GreaterEqualsTimestamp = "greater_equals_timestamp";
export const GreaterEqualsDuration = "greater_equals_duration";

// Math overloads
export const AddInt64 = "add_int64";
export const AddUint64 = "add_uint64";
export const AddDouble = "add_double";
export const AddString = "add_string";
export const AddBytes = "add_bytes";
export const AddList = "add_list";
export const AddTimestampDuration = "add_timestamp_duration";
export const AddDurationTimestamp = "add_duration_timestamp";
export const AddDurationDuration = "add_duration_duration";
export const SubtractInt64 = "subtract_int64";
export const SubtractUint64 = "subtract_uint64";
export const SubtractDouble = "subtract_double";
export const SubtractTimestampTimestamp = "subtract_timestamp_timestamp";
export const SubtractTimestampDuration = "subtract_timestamp_duration";
export const SubtractDurationDuration = "subtract_duration_duration";
export const MultiplyInt64 = "multiply_int64";
export const MultiplyUint64 = "multiply_uint64";
export const MultiplyDouble = "multiply_double";
export const DivideInt64 = "divide_int64";
export const DivideUint64 = "divide_uint64";
export const DivideDouble = "divide_double";
export const ModuloInt64 = "modulo_int64";
export const ModuloUint64 = "modulo_uint64";
export const NegateInt64 = "negate_int64";
export const NegateDouble = "negate_double";

// Index overloads
export const IndexList = "index_list";
export const IndexMap = "index_map";
export const IndexMessage = "index_message";

// In operators
export const DeprecatedIn = "in";
export const InList = "in_list";
export const InMap = "in_map";
export const InMessage = "in_message";

// Size overloads
export const Size = "size";
export const SizeString = "size_string";
export const SizeBytes = "size_bytes";
export const SizeList = "size_list";
export const SizeMap = "size_map";
export const SizeStringInst = "string_size";
export const SizeBytesInst = "bytes_size";
export const SizeListInst = "list_size";
export const SizeMapInst = "map_size";

// String function names.
export const Contains = "contains";
export const EndsWith = "endsWith";
export const Matches = "matches";
export const StartsWith = "startsWith";

// Extension function overloads with complex behaviors that need to be referenced in runtime and static analysis cost computations.
export const ExtQuoteString = "strings_quote";
export const ContainsString = "contains_string";
export const EndsWithString = "ends_with_string";
export const MatchesString = "matches_string";
export const StartsWithString = "starts_with_string";
export const ExtFormatString = "string_format";

// Time-based functions.
export const TimeGetFullYear = "getFullYear";
export const TimeGetMonth = "getMonth";
export const TimeGetDayOfYear = "getDayOfYear";
export const TimeGetDate = "getDate";
export const TimeGetDayOfMonth = "getDayOfMonth";
export const TimeGetDayOfWeek = "getDayOfWeek";
export const TimeGetHours = "getHours";
export const TimeGetMinutes = "getMinutes";
export const TimeGetSeconds = "getSeconds";
export const TimeGetMilliseconds = "getMilliseconds";

// Timestamp overloads for time functions without timezones.
export const TimestampToYear = "timestamp_to_year";
export const TimestampToMonth = "timestamp_to_month";
export const TimestampToDayOfYear = "timestamp_to_day_of_year";
export const TimestampToDayOfMonthZeroBased = "timestamp_to_day_of_month";
export const TimestampToDayOfMonthOneBased = "timestamp_to_day_of_month_1_based";
export const TimestampToDayOfWeek = "timestamp_to_day_of_week";
export const TimestampToHours = "timestamp_to_hours";
export const TimestampToMinutes = "timestamp_to_minutes";
export const TimestampToSeconds = "timestamp_to_seconds";
export const TimestampToMilliseconds = "timestamp_to_milliseconds";

// Timestamp overloads for time functions with timezones.
export const TimestampToYearWithTz = "timestamp_to_year_with_tz";
export const TimestampToMonthWithTz = "timestamp_to_month_with_tz";
export const TimestampToDayOfYearWithTz = "timestamp_to_day_of_year_with_tz";
export const TimestampToDayOfMonthZeroBasedWithTz = "timestamp_to_day_of_month_with_tz";
export const TimestampToDayOfMonthOneBasedWithTz = "timestamp_to_day_of_month_1_based_with_tz";
export const TimestampToDayOfWeekWithTz = "timestamp_to_day_of_week_with_tz";
export const TimestampToHoursWithTz = "timestamp_to_hours_with_tz";
export const TimestampToMinutesWithTz = "timestamp_to_minutes_with_tz";
export const TimestampToSecondsWithTz = "timestamp_to_seconds_tz";
export const TimestampToMillisecondsWithTz = "timestamp_to_milliseconds_with_tz";

// Duration overloads for time functions.
export const DurationToHours = "duration_to_hours";
export const DurationToMinutes = "duration_to_minutes";
export const DurationToSeconds = "duration_to_seconds";
export const DurationToMilliseconds = "duration_to_milliseconds";

// Type conversion methods and overloads
export const TypeConvertInt = "int";
export const TypeConvertUint = "uint";
export const TypeConvertDouble = "double";
export const TypeConvertBool = "bool";
export const TypeConvertString = "string";
export const TypeConvertBytes = "bytes";
export const TypeConvertTimestamp = "timestamp";
export const TypeConvertDuration = "duration";
export const TypeConvertType = "type";
export const TypeConvertDyn = "dyn";
export const IntToInt = "int64_to_int64";
export const UintToInt = "uint64_to_int64";
export const DoubleToInt = "double_to_int64";
export const StringToInt = "string_to_int64";
export const TimestampToInt = "timestamp_to_int64";
export const DurationToInt = "duration_to_int64";
export const UintToUint = "uint64_to_uint64";
export const IntToUint = "int64_to_uint64";
export const DoubleToUint = "double_to_uint64";
export const StringToUint = "string_to_uint64";
export const DoubleToDouble = "double_to_double";
export const IntToDouble = "int64_to_double";
export const UintToDouble = "uint64_to_double";
export const StringToDouble = "string_to_double";
export const BoolToBool = "bool_to_bool";
export const StringToBool = "string_to_bool";
export const BytesToBytes = "bytes_to_bytes";
export const StringToBytes = "string_to_bytes";
export const StringToString = "string_to_string";
export const BoolToString = "bool_to_string";
export const IntToString = "int64_to_string";
export const UintToString = "uint64_to_string";
export const DoubleToString = "double_to_string";
export const BytesToString = "bytes_to_string";
export const TimestampToString = "timestamp_to_string";
export const DurationToString = "duration_to_string";
export const TimestampToTimestamp = "timestamp_to_timestamp";
export const StringToTimestamp = "string_to_timestamp";
export const IntToTimestamp = "int64_to_timestamp";
export const DurationToDuration = "duration_to_duration";
export const StringToDuration = "string_to_duration";
export const ToDyn = "to_dyn";
export const Iterator = "@iterator";
export const HasNext = "@hasNext";
export const Next = "@next";

/**
 * IsTypeConversionFunction returns whether the input function is a standard library type
 * conversion function.
 */
export function isTypeConversionFunction(fn: string): boolean {
  switch (fn) {
    case TypeConvertBool:
    case TypeConvertBytes:
    case TypeConvertDouble:
    case TypeConvertDuration:
    case TypeConvertDyn:
    case TypeConvertInt:
    case TypeConvertString:
    case TypeConvertTimestamp:
    case TypeConvertType:
    case TypeConvertUint:
      return true;
    default:
      return false;
  }
}
