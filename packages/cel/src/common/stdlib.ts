import {
  type FunctionDecl,
  func,
  memberOverload,
  type OverloadDecl,
  overload,
  typeVariable,
  type VariableDecl,
} from "./decls.js";
import * as operators from "./operators.js";
import * as overloads from "./overloads.js";
import type {
  Adder,
  Comparer,
  Container,
  Divider,
  Indexer,
  Matcher,
  Modder,
  Multiplier,
  Negater,
  Receiver,
  Sizer,
  Subtractor,
} from "./types/index.js";
import {
  AdderType,
  Bool,
  String as CelString,
  ComparerType,
  ContainerType,
  DividerType,
  Double,
  durationGetHours,
  durationGetMilliseconds,
  durationGetMinutes,
  durationGetSeconds,
  False,
  IndexerType,
  IntNegOne,
  IntOne,
  IntZero,
  isBool,
  MatcherType,
  ModderType,
  MultiplierType,
  maybeNoSuchOverloadErr,
  NegatorType,
  noSuchOverloadErr,
  type RefType,
  SizerType,
  SubtractorType,
  stringContains,
  stringEndsWith,
  stringStartsWith,
  True,
  type Val,
} from "./types/index.js";
import {
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  IntType,
  listType,
  mapType,
  NullType,
  StringType,
  TimestampType,
  type Type,
  TypeType,
  typeParamType,
  typeTypeWithParam,
  UintType,
} from "./types/types.js";

const paramA = typeParamType("A");
const paramB = typeParamType("B");
const listOfA = listType(paramA);
const mapOfAB = mapType(paramA, paramB);
/**
 * StandardMacros declares the macro names that participate in standard-library subsetting.
 */
export const StandardMacros = [
  operators.Has,
  operators.All,
  operators.Exists,
  operators.ExistsOne,
  operators.Map,
  operators.Filter,
] as const;

/**
 * StandardTypes returns the set of standard library types for CEL.
 */
export function standardTypes(): VariableDecl[] {
  return [
    typeVariable(BoolType),
    typeVariable(BytesType),
    typeVariable(DoubleType),
    typeVariable(DurationType),
    typeVariable(IntType),
    typeVariable(listOfA),
    typeVariable(mapOfAB),
    typeVariable(NullType),
    typeVariable(StringType),
    typeVariable(TimestampType),
    typeVariable(TypeType),
    typeVariable(UintType),
  ];
}

/**
 * StandardFunctions returns the set of standard-library function declarations for CEL.
 */
export function standardFunctions(): FunctionDecl[] {
  return [
    func(operators.Conditional, {
      doc: [
        "The ternary operator tests a boolean predicate and returns the left-hand side (truthy) expression if true, or the right-hand side (falsy) expression if false",
      ],
      overloads: [
        overload(overloads.Conditional, [BoolType, paramA, paramA], paramA, {
          nonStrict: true,
          doc: [
            "'hello'.contains('lo') ? 'hi' : 'bye' // 'hi'",
            "32 % 3 == 0 ? 'divisible' : 'not divisible' // 'not divisible'",
          ],
        }),
      ],
      singletonBinding: { func: noFunctionOverrides },
    }),
    func(operators.LogicalAnd, {
      doc: [
        "logically AND two boolean values. Errors and unknown values",
        "are valid inputs and will not halt evaluation.",
      ],
      overloads: [
        overload(overloads.LogicalAnd, [BoolType, BoolType], BoolType, {
          nonStrict: true,
          doc: [
            "true && true   // true",
            "true && false  // false",
            "error && true  // error",
            "error && false // false",
          ],
        }),
      ],
      singletonBinding: { binary: noBinaryOverrides },
    }),
    func(operators.LogicalOr, {
      doc: [
        "logically OR two boolean values. Errors and unknown values",
        "are valid inputs and will not halt evaluation.",
      ],
      overloads: [
        overload(overloads.LogicalOr, [BoolType, BoolType], BoolType, {
          nonStrict: true,
          doc: [
            "true || false // true",
            "false || false // false",
            "error || true // true",
            "error || error // true",
          ],
        }),
      ],
      singletonBinding: { binary: noBinaryOverrides },
    }),
    func(operators.LogicalNot, {
      doc: ["logically negate a boolean value."],
      overloads: [
        overload(overloads.LogicalNot, [BoolType], BoolType, {
          doc: ["!true // false", "!false // true", "!error // error"],
        }),
      ],
      singletonBinding: { unary: logicalNot },
    }),
    func(operators.NotStrictlyFalse, {
      overloads: [
        overload(overloads.NotStrictlyFalse, [BoolType], BoolType, {
          nonStrict: true,
          unaryBinding: notStrictlyFalse,
        }),
      ],
    }),
    func(operators.OldNotStrictlyFalse, {
      disableDeclaration: true,
      overloads: [
        overload(operators.OldNotStrictlyFalse, [BoolType], BoolType, {
          nonStrict: true,
          unaryBinding: notStrictlyFalse,
        }),
      ],
    }),
    func(operators.Equals, {
      doc: ["compare two values of the same type for equality"],
      overloads: [
        overload(overloads.Equals, [paramA, paramA], BoolType, {
          doc: [
            "1 == 1 // true",
            "'hello' == 'world' // false",
            "bytes('hello') == b'hello' // true",
            "duration('1h') == duration('60m') // true",
            "dyn(3.0) == 3 // true",
          ],
        }),
      ],
      singletonBinding: { binary: noBinaryOverrides },
    }),
    func(operators.NotEquals, {
      doc: ["compare two values of the same type for inequality"],
      overloads: [
        overload(overloads.NotEquals, [paramA, paramA], BoolType, {
          doc: ["1 != 2     // true", `"a" != "a" // false`, "3.0 != 3.1 // true"],
        }),
      ],
      singletonBinding: { binary: noBinaryOverrides },
    }),
    func(operators.Add, {
      doc: ["adds two numeric values or concatenates two strings, bytes,", "or lists."],
      overloads: [
        overload(overloads.AddBytes, [BytesType, BytesType], BytesType, {
          doc: ["b'hi' + bytes('ya') // b'hiya'"],
        }),
        overload(overloads.AddDouble, [DoubleType, DoubleType], DoubleType, {
          doc: ["3.14 + 1.59 // 4.73"],
        }),
        overload(overloads.AddDurationDuration, [DurationType, DurationType], DurationType, {
          doc: ["duration('1m') + duration('1s') // duration('1m1s')"],
        }),
        overload(overloads.AddDurationTimestamp, [DurationType, TimestampType], TimestampType, {
          doc: [
            "duration('24h') + timestamp('2023-01-01T00:00:00Z') // timestamp('2023-01-02T00:00:00Z')",
          ],
        }),
        overload(overloads.AddTimestampDuration, [TimestampType, DurationType], TimestampType, {
          doc: [
            "timestamp('2023-01-01T00:00:00Z') + duration('24h1m2s') // timestamp('2023-01-02T00:01:02Z')",
          ],
        }),
        overload(overloads.AddInt64, [IntType, IntType], IntType, {
          doc: ["1 + 2 // 3"],
        }),
        overload(overloads.AddList, [listOfA, listOfA], listOfA, {
          doc: ["[1] + [2, 3] // [1, 2, 3]"],
        }),
        overload(overloads.AddString, [StringType, StringType], StringType, {
          doc: ['"Hello, " + "world!" // "Hello, world!"'],
        }),
        overload(overloads.AddUint64, [UintType, UintType], UintType, {
          doc: ["22u + 33u // 55u"],
        }),
      ],
      singletonBinding: { binary: addBinding, trait: AdderType },
    }),
    func(operators.Divide, {
      doc: ["divide two numbers"],
      overloads: [
        overload(overloads.DivideDouble, [DoubleType, DoubleType], DoubleType, {
          doc: ["7.0 / 2.0 // 3.5"],
        }),
        overload(overloads.DivideInt64, [IntType, IntType], IntType, {
          doc: ["10 / 2 // 5"],
        }),
        overload(overloads.DivideUint64, [UintType, UintType], UintType, {
          doc: ["42u / 2u // 21u"],
        }),
      ],
      singletonBinding: { binary: divideBinding, trait: DividerType },
    }),
    func(operators.Modulo, {
      doc: ["compute the modulus of one integer into another"],
      overloads: [
        overload(overloads.ModuloInt64, [IntType, IntType], IntType, {
          doc: ["3 % 2 // 1"],
        }),
        overload(overloads.ModuloUint64, [UintType, UintType], UintType, {
          doc: ["6u % 3u // 0u"],
        }),
      ],
      singletonBinding: { binary: moduloBinding, trait: ModderType },
    }),
    func(operators.Multiply, {
      doc: ["multiply two numbers"],
      overloads: [
        overload(overloads.MultiplyDouble, [DoubleType, DoubleType], DoubleType, {
          doc: ["3.5 * 40.0 // 140.0"],
        }),
        overload(overloads.MultiplyInt64, [IntType, IntType], IntType, {
          doc: ["-2 * 6 // -12"],
        }),
        overload(overloads.MultiplyUint64, [UintType, UintType], UintType, {
          doc: ["13u * 3u // 39u"],
        }),
      ],
      singletonBinding: { binary: multiplyBinding, trait: MultiplierType },
    }),
    func(operators.Negate, {
      doc: ["negate a numeric value"],
      overloads: [
        overload(overloads.NegateDouble, [DoubleType], DoubleType, {
          doc: ["-(3.14) // -3.14"],
        }),
        overload(overloads.NegateInt64, [IntType], IntType, {
          doc: ["-(5) // -5"],
        }),
      ],
      singletonBinding: { unary: negateBinding, trait: NegatorType },
    }),
    func(operators.Subtract, {
      doc: ["subtract two numbers, or two time-related values"],
      overloads: [
        overload(overloads.SubtractDouble, [DoubleType, DoubleType], DoubleType, {
          doc: ["10.5 - 2.0 // 8.5"],
        }),
        overload(overloads.SubtractDurationDuration, [DurationType, DurationType], DurationType, {
          doc: ["duration('1m') - duration('1s') // duration('59s')"],
        }),
        overload(overloads.SubtractInt64, [IntType, IntType], IntType, {
          doc: ["5 - 3 // 2"],
        }),
        overload(
          overloads.SubtractTimestampDuration,
          [TimestampType, DurationType],
          TimestampType,
          {
            doc: [
              "timestamp('2023-01-10T12:00:00Z')",
              "  - duration('12h') // timestamp('2023-01-10T00:00:00Z')",
            ],
          },
        ),
        overload(
          overloads.SubtractTimestampTimestamp,
          [TimestampType, TimestampType],
          DurationType,
          {
            doc: [
              "timestamp('2023-01-10T12:00:00Z')",
              "  - timestamp('2023-01-10T00:00:00Z') // duration('12h')",
            ],
          },
        ),
        overload(overloads.SubtractUint64, [UintType, UintType], UintType, {
          doc: [
            "// the subtraction result must be positive, otherwise an overflow",
            "// error is generated.",
            "42u - 3u // 39u",
          ],
        }),
      ],
      singletonBinding: { binary: subtractBinding, trait: SubtractorType },
    }),
    func(operators.Less, {
      doc: ["compare two values and return true if the first value is", "less than the second"],
      overloads: relationOverloads("less"),
      singletonBinding: { binary: relationBinding("less"), trait: ComparerType },
    }),
    func(operators.LessEquals, {
      doc: [
        "compare two values and return true if the first value is",
        "less than or equal to the second",
      ],
      overloads: relationOverloads("less_equals"),
      singletonBinding: { binary: relationBinding("less_equals"), trait: ComparerType },
    }),
    func(operators.Greater, {
      doc: ["compare two values and return true if the first value is", "greater than the second"],
      overloads: relationOverloads("greater"),
      singletonBinding: { binary: relationBinding("greater"), trait: ComparerType },
    }),
    func(operators.GreaterEquals, {
      doc: [
        "compare two values and return true if the first value is",
        "greater than or equal to the second",
      ],
      overloads: relationOverloads("greater_equals"),
      singletonBinding: { binary: relationBinding("greater_equals"), trait: ComparerType },
    }),
    func(operators.Index, {
      doc: ["select a value from a list by index, or value from a map by key"],
      overloads: [
        overload(overloads.IndexList, [listOfA, IntType], paramA, {
          doc: ["[1, 2, 3][1] // 2"],
        }),
        overload(overloads.IndexMap, [mapOfAB, paramA], paramB, {
          doc: ["{'key': 'value'}['key'] // 'value'", "{'key': 'value'}['missing'] // error"],
        }),
      ],
      singletonBinding: { binary: indexBinding, trait: IndexerType },
    }),
    func(operators.In, {
      doc: ["test whether a value exists in a list, or a key exists in a map"],
      overloads: [
        overload(overloads.InList, [paramA, listOfA], BoolType, {
          doc: ["2 in [1, 2, 3] // true", `"a" in ["b", "c"] // false`],
        }),
        overload(overloads.InMap, [paramA, mapOfAB], BoolType, {
          doc: [
            "'key1' in {'key1': 'value1', 'key2': 'value2'} // true",
            '3 in {1: "one", 2: "two"} // false',
          ],
        }),
      ],
      singletonBinding: { binary: inAggregate },
    }),
    func(operators.OldIn, {
      disableDeclaration: true,
      overloads: [
        overload(overloads.InList, [paramA, listOfA], BoolType),
        overload(overloads.InMap, [paramA, mapOfAB], BoolType),
      ],
      singletonBinding: { binary: inAggregate },
    }),
    func(overloads.DeprecatedIn, {
      disableDeclaration: true,
      overloads: [
        overload(overloads.InList, [paramA, listOfA], BoolType),
        overload(overloads.InMap, [paramA, mapOfAB], BoolType),
      ],
      singletonBinding: { binary: inAggregate },
    }),
    func(overloads.Size, {
      doc: [
        "compute the size of a list or map, the number of characters in a string,",
        "or the number of bytes in a sequence",
      ],
      overloads: [
        overload(overloads.SizeBytes, [BytesType], IntType, {
          doc: ["size(b'123') // 3"],
        }),
        memberOverload(overloads.SizeBytesInst, [BytesType], IntType, {
          doc: ["b'123'.size() // 3"],
        }),
        overload(overloads.SizeList, [listOfA], IntType, {
          doc: ["size([1, 2, 3]) // 3"],
        }),
        memberOverload(overloads.SizeListInst, [listOfA], IntType, {
          doc: ["[1, 2, 3].size() // 3"],
        }),
        overload(overloads.SizeMap, [mapOfAB], IntType, {
          doc: ["size({'a': 1, 'b': 2}) // 2"],
        }),
        memberOverload(overloads.SizeMapInst, [mapOfAB], IntType, {
          doc: ["{'a': 1, 'b': 2}.size() // 2"],
        }),
        overload(overloads.SizeString, [StringType], IntType, {
          doc: ["size('hello') // 5"],
        }),
        memberOverload(overloads.SizeStringInst, [StringType], IntType, {
          doc: ["'hello'.size() // 5"],
        }),
      ],
      singletonBinding: { unary: sizeBinding, trait: SizerType },
    }),
    func(overloads.TypeConvertType, {
      doc: ["convert a value to its type identifier"],
      overloads: [
        overload(overloads.TypeConvertType, [paramA], typeTypeWithParam(paramA), {
          doc: [
            "type(1) // int",
            "type('hello') // string",
            "type(int) // type",
            "type(type) // type",
          ],
        }),
      ],
      singletonBinding: { unary: convertToType(TypeType) },
    }),
    func(overloads.TypeConvertBool, {
      doc: ["convert a value to a boolean"],
      overloads: [
        overload(overloads.BoolToBool, [BoolType], BoolType, {
          unaryBinding: identity,
          doc: ["bool(true) // true"],
        }),
        overload(overloads.StringToBool, [StringType], BoolType, {
          unaryBinding: convertToType(BoolType),
          doc: ["bool('true') // true", "bool('false') // false"],
        }),
      ],
    }),
    func(overloads.TypeConvertBytes, {
      doc: ["convert a value to bytes"],
      overloads: [
        overload(overloads.BytesToBytes, [BytesType], BytesType, {
          unaryBinding: identity,
          doc: ["bytes(b'abc') // b'abc'"],
        }),
        overload(overloads.StringToBytes, [StringType], BytesType, {
          unaryBinding: convertToType(BytesType),
          doc: ["bytes('hello') // b'hello'"],
        }),
      ],
    }),
    func(overloads.TypeConvertDouble, {
      doc: ["convert a value to a double"],
      overloads: [
        overload(overloads.DoubleToDouble, [DoubleType], DoubleType, {
          unaryBinding: identity,
          doc: ["double(1.23) // 1.23"],
        }),
        overload(overloads.IntToDouble, [IntType], DoubleType, {
          unaryBinding: convertToType(DoubleType),
          doc: ["double(123) // 123.0"],
        }),
        overload(overloads.StringToDouble, [StringType], DoubleType, {
          unaryBinding: convertToType(DoubleType),
          doc: ["double('1.23') // 1.23"],
        }),
        overload(overloads.UintToDouble, [UintType], DoubleType, {
          unaryBinding: convertToType(DoubleType),
          doc: ["double(123u) // 123.0"],
        }),
      ],
    }),
    func(overloads.TypeConvertDuration, {
      doc: ["convert a value to a google.protobuf.Duration"],
      overloads: [
        overload(overloads.DurationToDuration, [DurationType], DurationType, {
          unaryBinding: identity,
          doc: ["duration(duration('1s')) // duration('1s')"],
        }),
        overload(overloads.StringToDuration, [StringType], DurationType, {
          unaryBinding: convertToType(DurationType),
          doc: ["duration('1h2m3s') // duration('3723s')"],
        }),
      ],
    }),
    func(overloads.TypeConvertDyn, {
      doc: ["indicate that the type is dynamic for type-checking purposes"],
      overloads: [
        overload(overloads.ToDyn, [paramA], DynType, {
          doc: ["dyn(1) // 1"],
        }),
      ],
      singletonBinding: { unary: identity },
    }),
    func(overloads.TypeConvertInt, {
      doc: ["convert a value to an int"],
      overloads: [
        overload(overloads.IntToInt, [IntType], IntType, {
          unaryBinding: identity,
          doc: ["int(123) // 123"],
        }),
        overload(overloads.DoubleToInt, [DoubleType], IntType, {
          unaryBinding: convertToType(IntType),
          doc: ["int(123.45) // 123"],
        }),
        overload(overloads.DurationToInt, [DurationType], IntType, {
          unaryBinding: convertToType(IntType),
          doc: ["int(duration('1s')) // 1000000000"],
        }),
        overload(overloads.StringToInt, [StringType], IntType, {
          unaryBinding: convertToType(IntType),
          doc: ["int('123') // 123", "int('-456') // -456"],
        }),
        overload(overloads.TimestampToInt, [TimestampType], IntType, {
          unaryBinding: convertToType(IntType),
          doc: ["int(timestamp('1970-01-01T00:00:01Z')) // 1"],
        }),
        overload(overloads.UintToInt, [UintType], IntType, {
          unaryBinding: convertToType(IntType),
          doc: ["int(123u) // 123"],
        }),
      ],
    }),
    func(overloads.TypeConvertString, {
      doc: ["convert a value to a string"],
      overloads: [
        overload(overloads.StringToString, [StringType], StringType, {
          unaryBinding: identity,
          doc: ["string('hello') // 'hello'"],
        }),
        overload(overloads.BoolToString, [BoolType], StringType, {
          unaryBinding: convertToType(StringType),
          doc: ["string(true) // 'true'"],
        }),
        overload(overloads.BytesToString, [BytesType], StringType, {
          unaryBinding: convertToType(StringType),
          doc: ["string(b'hello') // 'hello'"],
        }),
        overload(overloads.DoubleToString, [DoubleType], StringType, {
          unaryBinding: convertToType(StringType),
          doc: ["string(-1.23e4) // '-12300'"],
        }),
        overload(overloads.DurationToString, [DurationType], StringType, {
          unaryBinding: convertToType(StringType),
          doc: ["string(duration('1h30m')) // '5400s'"],
        }),
        overload(overloads.IntToString, [IntType], StringType, {
          unaryBinding: convertToType(StringType),
          doc: ["string(-123) // '-123'"],
        }),
        overload(overloads.TimestampToString, [TimestampType], StringType, {
          unaryBinding: convertToType(StringType),
          doc: ["string(timestamp('1970-01-01T00:00:00Z')) // '1970-01-01T00:00:00Z'"],
        }),
        overload(overloads.UintToString, [UintType], StringType, {
          unaryBinding: convertToType(StringType),
          doc: ["string(123u) // '123'"],
        }),
      ],
    }),
    func(overloads.TypeConvertTimestamp, {
      doc: ["convert a value to a google.protobuf.Timestamp"],
      overloads: [
        overload(overloads.TimestampToTimestamp, [TimestampType], TimestampType, {
          unaryBinding: identity,
          doc: [
            "timestamp(timestamp('2023-01-01T00:00:00Z')) // timestamp('2023-01-01T00:00:00Z')",
          ],
        }),
        overload(overloads.IntToTimestamp, [IntType], TimestampType, {
          unaryBinding: convertToType(TimestampType),
          doc: ["timestamp(1) // timestamp('1970-01-01T00:00:01Z')"],
        }),
        overload(overloads.StringToTimestamp, [StringType], TimestampType, {
          unaryBinding: convertToType(TimestampType),
          doc: ["timestamp('2025-01-01T12:34:56Z') // timestamp('2025-01-01T12:34:56Z')"],
        }),
      ],
    }),
    func(overloads.TypeConvertUint, {
      doc: ["convert a value to a uint"],
      overloads: [
        overload(overloads.UintToUint, [UintType], UintType, {
          unaryBinding: identity,
          doc: ["uint(123u) // 123u"],
        }),
        overload(overloads.DoubleToUint, [DoubleType], UintType, {
          unaryBinding: convertToType(UintType),
          doc: ["uint(123.45) // 123u"],
        }),
        overload(overloads.IntToUint, [IntType], UintType, {
          unaryBinding: convertToType(UintType),
          doc: ["uint(123) // 123u"],
        }),
        overload(overloads.StringToUint, [StringType], UintType, {
          unaryBinding: convertToType(UintType),
          doc: ["uint('123') // 123u"],
        }),
      ],
    }),
    func(overloads.Contains, {
      doc: ["test whether a string contains a substring"],
      disableTypeGuards: true,
      overloads: [
        memberOverload(overloads.ContainsString, [StringType, StringType], BoolType, {
          binaryBinding: stringContains,
          doc: [
            "'hello world'.contains('o w') // true",
            "'hello world'.contains('goodbye') // false",
          ],
        }),
      ],
    }),
    func(overloads.EndsWith, {
      doc: ["test whether a string ends with a substring suffix"],
      disableTypeGuards: true,
      overloads: [
        memberOverload(overloads.EndsWithString, [StringType, StringType], BoolType, {
          binaryBinding: stringEndsWith,
          doc: [
            "'hello world'.endsWith('world') // true",
            "'hello world'.endsWith('hello') // false",
          ],
        }),
      ],
    }),
    func(overloads.StartsWith, {
      doc: ["test whether a string starts with a substring prefix"],
      disableTypeGuards: true,
      overloads: [
        memberOverload(overloads.StartsWithString, [StringType, StringType], BoolType, {
          binaryBinding: stringStartsWith,
          doc: [
            "'hello world'.startsWith('hello') // true",
            "'hello world'.startsWith('world') // false",
          ],
        }),
      ],
    }),
    func(overloads.Matches, {
      doc: ["test whether a string matches an RE2 regular expression"],
      overloads: [
        overload(overloads.Matches, [StringType, StringType], BoolType, {
          doc: [
            "matches('123-456', '^[0-9]+(-[0-9]+)?$') // true",
            "matches('hello', '^h.*o$') // true",
          ],
        }),
        memberOverload(overloads.MatchesString, [StringType, StringType], BoolType, {
          doc: [
            "'123-456'.matches('^[0-9]+(-[0-9]+)?$') // true",
            "'hello'.matches('^h.*o$') // true",
          ],
        }),
      ],
      singletonBinding: { binary: matchBinding, trait: MatcherType },
    }),
    ...timeFunctions(),
  ];
}

function relationOverloads(
  kind: "less" | "less_equals" | "greater" | "greater_equals",
): OverloadDecl[] {
  const table: Record<typeof kind, Array<[string, Type[], string[]]>> = {
    less: [
      [overloads.LessBool, [BoolType, BoolType], ["false < true // true"]],
      [overloads.LessInt64, [IntType, IntType], ["-2 < 3 // true", "1 < 0 // false"]],
      [overloads.LessInt64Double, [IntType, DoubleType], ["1 < 1.1 // true"]],
      [overloads.LessInt64Uint64, [IntType, UintType], ["1 < 2u // true"]],
      [overloads.LessUint64, [UintType, UintType], ["1u < 2u // true"]],
      [overloads.LessUint64Double, [UintType, DoubleType], ["1u < 0.9 // false"]],
      [overloads.LessUint64Int64, [UintType, IntType], ["1u < 23 // true", "1u < -1 // false"]],
      [overloads.LessDouble, [DoubleType, DoubleType], ["2.0 < 2.4 // true"]],
      [overloads.LessDoubleInt64, [DoubleType, IntType], ["2.1 < 3 // true"]],
      [
        overloads.LessDoubleUint64,
        [DoubleType, UintType],
        ["2.3 < 2u // false", "-1.0 < 1u // true"],
      ],
      [
        overloads.LessString,
        [StringType, StringType],
        ["'a' < 'b' // true", "'cat' < 'cab' // false"],
      ],
      [overloads.LessBytes, [BytesType, BytesType], ["b'hello' < b'world' // true"]],
      [
        overloads.LessTimestamp,
        [TimestampType, TimestampType],
        ["timestamp('2001-01-01T02:03:04Z') < timestamp('2002-02-02T02:03:04Z') // true"],
      ],
      [
        overloads.LessDuration,
        [DurationType, DurationType],
        ["duration('1ms') < duration('1s') // true"],
      ],
    ],
    less_equals: [
      [overloads.LessEqualsBool, [BoolType, BoolType], ["false <= true // true"]],
      [overloads.LessEqualsInt64, [IntType, IntType], ["-2 <= 3 // true"]],
      [overloads.LessEqualsInt64Double, [IntType, DoubleType], ["1 <= 1.1 // true"]],
      [
        overloads.LessEqualsInt64Uint64,
        [IntType, UintType],
        ["1 <= 2u // true", "-1 <= 0u // true"],
      ],
      [overloads.LessEqualsUint64, [UintType, UintType], ["1u <= 2u // true"]],
      [
        overloads.LessEqualsUint64Double,
        [UintType, DoubleType],
        ["1u <= 1.0 // true", "1u <= 1.1 // true"],
      ],
      [overloads.LessEqualsUint64Int64, [UintType, IntType], ["1u <= 23 // true"]],
      [overloads.LessEqualsDouble, [DoubleType, DoubleType], ["2.0 <= 2.4 // true"]],
      [overloads.LessEqualsDoubleInt64, [DoubleType, IntType], ["2.1 <= 3 // true"]],
      [
        overloads.LessEqualsDoubleUint64,
        [DoubleType, UintType],
        ["2.0 <= 2u // true", "-1.0 <= 1u // true"],
      ],
      [
        overloads.LessEqualsString,
        [StringType, StringType],
        ["'a' <= 'b' // true", "'a' <= 'a' // true", "'cat' <= 'cab' // false"],
      ],
      [overloads.LessEqualsBytes, [BytesType, BytesType], ["b'hello' <= b'world' // true"]],
      [
        overloads.LessEqualsTimestamp,
        [TimestampType, TimestampType],
        ["timestamp('2001-01-01T02:03:04Z') <= timestamp('2002-02-02T02:03:04Z') // true"],
      ],
      [
        overloads.LessEqualsDuration,
        [DurationType, DurationType],
        ["duration('1ms') <= duration('1s') // true"],
      ],
    ],
    greater: [
      [overloads.GreaterBool, [BoolType, BoolType], ["true > false // true"]],
      [overloads.GreaterInt64, [IntType, IntType], ["3 > -2 // true"]],
      [overloads.GreaterInt64Double, [IntType, DoubleType], ["2 > 1.1 // true"]],
      [overloads.GreaterInt64Uint64, [IntType, UintType], ["3 > 2u // true"]],
      [overloads.GreaterUint64, [UintType, UintType], ["2u > 1u // true"]],
      [overloads.GreaterUint64Double, [UintType, DoubleType], ["2u > 1.9 // true"]],
      [overloads.GreaterUint64Int64, [UintType, IntType], ["23u > 1 // true", "0u > -1 // true"]],
      [overloads.GreaterDouble, [DoubleType, DoubleType], ["2.4 > 2.0 // true"]],
      [
        overloads.GreaterDoubleInt64,
        [DoubleType, IntType],
        ["3.1 > 3 // true", "3.0 > 3 // false"],
      ],
      [overloads.GreaterDoubleUint64, [DoubleType, UintType], ["2.3 > 2u // true"]],
      [overloads.GreaterString, [StringType, StringType], ["'b' > 'a' // true"]],
      [overloads.GreaterBytes, [BytesType, BytesType], ["b'world' > b'hello' // true"]],
      [
        overloads.GreaterTimestamp,
        [TimestampType, TimestampType],
        ["timestamp('2002-02-02T02:03:04Z') > timestamp('2001-01-01T02:03:04Z') // true"],
      ],
      [
        overloads.GreaterDuration,
        [DurationType, DurationType],
        ["duration('1ms') > duration('1us') // true"],
      ],
    ],
    greater_equals: [
      [overloads.GreaterEqualsBool, [BoolType, BoolType], ["true >= false // true"]],
      [overloads.GreaterEqualsInt64, [IntType, IntType], ["3 >= -2 // true"]],
      [
        overloads.GreaterEqualsInt64Double,
        [IntType, DoubleType],
        ["2 >= 1.1 // true", "1 >= 1.0 // true"],
      ],
      [overloads.GreaterEqualsInt64Uint64, [IntType, UintType], ["3 >= 2u // true"]],
      [overloads.GreaterEqualsUint64, [UintType, UintType], ["2u >= 1u // true"]],
      [overloads.GreaterEqualsUint64Double, [UintType, DoubleType], ["2u >= 1.9 // true"]],
      [
        overloads.GreaterEqualsUint64Int64,
        [UintType, IntType],
        ["23u >= 1 // true", "1u >= 1 // true"],
      ],
      [overloads.GreaterEqualsDouble, [DoubleType, DoubleType], ["2.4 >= 2.0 // true"]],
      [overloads.GreaterEqualsDoubleInt64, [DoubleType, IntType], ["3.1 >= 3 // true"]],
      [overloads.GreaterEqualsDoubleUint64, [DoubleType, UintType], ["2.3 >= 2u // true"]],
      [overloads.GreaterEqualsString, [StringType, StringType], ["'b' >= 'a' // true"]],
      [overloads.GreaterEqualsBytes, [BytesType, BytesType], ["b'world' >= b'hello' // true"]],
      [
        overloads.GreaterEqualsTimestamp,
        [TimestampType, TimestampType],
        ["timestamp('2001-01-01T02:03:04Z') >= timestamp('2001-01-01T02:03:04Z') // true"],
      ],
      [
        overloads.GreaterEqualsDuration,
        [DurationType, DurationType],
        ["duration('60s') >= duration('1m') // true"],
      ],
    ],
  };
  return table[kind].map(([id, args, doc]) => overload(id, args, BoolType, { doc }));
}

function timeFunctions(): FunctionDecl[] {
  return [
    timeFunction(
      overloads.TimeGetFullYear,
      "get the 0-based full year from a timestamp, UTC unless an IANA timezone is specified.",
      overloads.TimestampToYear,
      overloads.TimestampToYearWithTz,
      "2023",
      "2022",
    ),
    timeFunction(
      overloads.TimeGetMonth,
      "get the 0-based month from a timestamp, UTC unless an IANA timezone is specified.",
      overloads.TimestampToMonth,
      overloads.TimestampToMonthWithTz,
      "6",
      "11",
    ),
    timeFunction(
      overloads.TimeGetDayOfYear,
      "get the 0-based day of the year from a timestamp, UTC unless an IANA timezone is specified.",
      overloads.TimestampToDayOfYear,
      overloads.TimestampToDayOfYearWithTz,
      "1",
      "364",
    ),
    timeFunction(
      overloads.TimeGetDayOfMonth,
      "get the 0-based day of the month from a timestamp, UTC unless an IANA timezone is specified.",
      overloads.TimestampToDayOfMonthZeroBased,
      overloads.TimestampToDayOfMonthZeroBasedWithTz,
      "13",
      "29",
    ),
    timeFunction(
      overloads.TimeGetDate,
      "get the 1-based day of the month from a timestamp, UTC unless an IANA timezone is specified.",
      overloads.TimestampToDayOfMonthOneBased,
      overloads.TimestampToDayOfMonthOneBasedWithTz,
      "14",
      "30",
    ),
    timeFunction(
      overloads.TimeGetDayOfWeek,
      "get the 0-based day of the week from a timestamp, UTC unless an IANA timezone is specified.",
      overloads.TimestampToDayOfWeek,
      overloads.TimestampToDayOfWeekWithTz,
      "5",
      "6",
    ),
    func(overloads.TimeGetHours, {
      doc: ["get the hours portion from a timestamp, or convert a duration to hours"],
      overloads: [
        memberOverload(overloads.TimestampToHours, [TimestampType], IntType, {
          unaryBinding: (ts) => timestampMethod(overloads.TimeGetHours, ts),
          doc: ["timestamp('2023-07-14T10:30:45.123Z').getHours() // 10"],
        }),
        memberOverload(overloads.TimestampToHoursWithTz, [TimestampType, StringType], IntType, {
          binaryBinding: (ts, tz) => timestampMethod(overloads.TimeGetHours, ts, tz),
          doc: ["timestamp('2023-07-14T10:30:45.123Z').getHours('America/Los_Angeles') // 2"],
        }),
        memberOverload(overloads.DurationToHours, [DurationType], IntType, {
          unaryBinding: durationGetHours,
          doc: ["duration('3723s').getHours() // 1"],
        }),
      ],
    }),
    func(overloads.TimeGetMinutes, {
      doc: ["get the minutes portion from a timestamp, or convert a duration to minutes"],
      overloads: [
        memberOverload(overloads.TimestampToMinutes, [TimestampType], IntType, {
          unaryBinding: (ts) => timestampMethod(overloads.TimeGetMinutes, ts),
          doc: ["timestamp('2023-07-14T10:30:45.123Z').getMinutes() // 30"],
        }),
        memberOverload(overloads.TimestampToMinutesWithTz, [TimestampType, StringType], IntType, {
          binaryBinding: (ts, tz) => timestampMethod(overloads.TimeGetMinutes, ts, tz),
          doc: ["timestamp('2023-07-14T10:30:45.123Z').getMinutes('America/Los_Angeles') // 30"],
        }),
        memberOverload(overloads.DurationToMinutes, [DurationType], IntType, {
          unaryBinding: durationGetMinutes,
          doc: ["duration('3723s').getMinutes() // 62"],
        }),
      ],
    }),
    func(overloads.TimeGetSeconds, {
      doc: ["get the seconds portion from a timestamp, or convert a duration to seconds"],
      overloads: [
        memberOverload(overloads.TimestampToSeconds, [TimestampType], IntType, {
          unaryBinding: (ts) => timestampMethod(overloads.TimeGetSeconds, ts),
          doc: ["timestamp('2023-07-14T10:30:45.123Z').getSeconds() // 45"],
        }),
        memberOverload(overloads.TimestampToSecondsWithTz, [TimestampType, StringType], IntType, {
          binaryBinding: (ts, tz) => timestampMethod(overloads.TimeGetSeconds, ts, tz),
          doc: ["timestamp('2023-07-14T10:30:45.123Z').getSeconds('America/Los_Angeles') // 45"],
        }),
        memberOverload(overloads.DurationToSeconds, [DurationType], IntType, {
          unaryBinding: durationGetSeconds,
          doc: ["duration('3723.456s').getSeconds() // 3723"],
        }),
      ],
    }),
    func(overloads.TimeGetMilliseconds, {
      doc: ["get the milliseconds portion from a timestamp"],
      overloads: [
        memberOverload(overloads.TimestampToMilliseconds, [TimestampType], IntType, {
          unaryBinding: (ts) => timestampMethod(overloads.TimeGetMilliseconds, ts),
          doc: ["timestamp('2023-07-14T10:30:45.123Z').getMilliseconds() // 123"],
        }),
        memberOverload(
          overloads.TimestampToMillisecondsWithTz,
          [TimestampType, StringType],
          IntType,
          {
            binaryBinding: (ts, tz) => timestampMethod(overloads.TimeGetMilliseconds, ts, tz),
            doc: [
              "timestamp('2023-07-14T10:30:45.123Z').getMilliseconds('America/Los_Angeles') // 123",
            ],
          },
        ),
        memberOverload(overloads.DurationToMilliseconds, [DurationType], IntType, {
          unaryBinding: durationGetMilliseconds,
        }),
      ],
    }),
  ];
}

function timeFunction(
  name: string,
  doc: string,
  withoutTz: string,
  withTz: string,
  withoutTzResult: string,
  withTzResult: string,
): FunctionDecl {
  return func(name, {
    doc: [doc],
    overloads: [
      memberOverload(withoutTz, [TimestampType], IntType, {
        unaryBinding: (ts) => timestampMethod(name, ts),
        doc: [`timestamp('2023-07-14T10:30:45.123Z').${name}() // ${withoutTzResult}`],
      }),
      memberOverload(withTz, [TimestampType, StringType], IntType, {
        binaryBinding: (ts, tz) => timestampMethod(name, ts, tz),
        doc: [timeWithTzExample(name, withTzResult)],
      }),
    ],
  });
}

function noBinaryOverrides(_lhs: Val, _rhs: Val): Val {
  return noSuchOverloadErr();
}

function noFunctionOverrides(..._args: Val[]): Val {
  return noSuchOverloadErr();
}

function identity(val: Val): Val {
  return val;
}

function convertToType(type: RefType): (val: Val) => Val {
  return (val) => val.convertToType(type);
}

function logicalNot(val: Val): Val {
  if (!(val instanceof Bool)) {
    return maybeNoSuchOverloadErr(val);
  }
  return val.negate();
}

function notStrictlyFalse(value: Val): Val {
  return value instanceof Bool ? value : True;
}

function addBinding(lhs: Val, rhs: Val): Val {
  return (lhs as unknown as Adder).add(rhs);
}

function divideBinding(lhs: Val, rhs: Val): Val {
  return (lhs as unknown as Divider).divide(rhs);
}

function moduloBinding(lhs: Val, rhs: Val): Val {
  return (lhs as unknown as Modder).modulo(rhs);
}

function multiplyBinding(lhs: Val, rhs: Val): Val {
  return (lhs as unknown as Multiplier).multiply(rhs);
}

function negateBinding(val: Val): Val {
  if (isBool(val)) {
    return maybeNoSuchOverloadErr(val);
  }
  return (val as unknown as Negater).negate();
}

function subtractBinding(lhs: Val, rhs: Val): Val {
  return (lhs as unknown as Subtractor).subtract(rhs);
}

function relationBinding(
  kind: "less" | "less_equals" | "greater" | "greater_equals",
): (lhs: Val, rhs: Val) => Val {
  return (lhs, rhs) => {
    // IEEE 754 ordering comparisons involving NaN are always false.
    if (isDoubleNaN(lhs) || isDoubleNaN(rhs)) {
      return False;
    }
    const cmp = (lhs as unknown as Comparer).compare(rhs);
    const cmpKind = compareResultKind(cmp);
    switch (kind) {
      case "less":
        if (cmpKind === "less") return True;
        if (cmpKind === "equal" || cmpKind === "greater") return False;
        return cmp;
      case "less_equals":
        if (cmpKind === "less" || cmpKind === "equal") return True;
        if (cmpKind === "greater") return False;
        return cmp;
      case "greater":
        if (cmpKind === "greater") return True;
        if (cmpKind === "less" || cmpKind === "equal") return False;
        return cmp;
      case "greater_equals":
        if (cmpKind === "greater" || cmpKind === "equal") return True;
        if (cmpKind === "less") return False;
        return cmp;
    }
  };
}

/**
 * isDoubleNaN reports whether a CEL value is a double containing IEEE 754 NaN.
 */
function isDoubleNaN(value: Val): boolean {
  return value instanceof Double && Number.isNaN(value.value());
}

/**
 * compareResultKind normalizes CEL comparison outputs so TypeScript object identity does not leak
 * into relational operator semantics.
 *
 * Every ordering result is one of the shared comparison values, so classifying one is an identity
 * test. A comparison that could not be ordered returns an error instead and falls through.
 */
function compareResultKind(value: Val): "less" | "equal" | "greater" | undefined {
  if (value === IntNegOne) {
    return "less";
  }
  if (value === IntZero) {
    return "equal";
  }
  if (value === IntOne) {
    return "greater";
  }
  return undefined;
}

function indexBinding(lhs: Val, rhs: Val): Val {
  return (lhs as unknown as Indexer).get(rhs);
}

function inAggregate(lhs: Val, rhs: Val): Val {
  if (rhs.type().hasTrait(ContainerType)) {
    return (rhs as unknown as Container).contains(lhs);
  }
  return maybeNoSuchOverloadErr(rhs);
}

function sizeBinding(val: Val): Val {
  return (val as unknown as Sizer).size();
}

function matchBinding(str: Val, pat: Val): Val {
  return (str as unknown as Matcher).match(pat);
}

function timestampMethod(functionName: string, ts: Val, tz?: Val): Val {
  const receiver = ts as unknown as Receiver;
  // Standard timestamp overloads use UTC when the expression omits an explicit timezone.
  return receiver.receive(functionName, "", [tz ?? new CelString("UTC")]);
}

function timeWithTzExample(name: string, result: string): string {
  switch (name) {
    case overloads.TimeGetFullYear:
      return "timestamp('2023-01-01T05:30:00Z').getFullYear('-08:00') // 2022";
    case overloads.TimeGetMonth:
      return "timestamp('2023-01-01T05:30:00Z').getMonth('America/Los_Angeles') // 11";
    case overloads.TimeGetDayOfYear:
      return "timestamp('2023-01-01T05:00:00Z').getDayOfYear('America/Los_Angeles') // 364";
    case overloads.TimeGetDayOfMonth:
      return "timestamp('2023-07-01T05:00:00Z').getDayOfMonth('America/Los_Angeles') // 29";
    case overloads.TimeGetDate:
      return "timestamp('2023-07-01T05:00:00Z').getDate('America/Los_Angeles') // 30";
    case overloads.TimeGetDayOfWeek:
      return "timestamp('2023-07-16T05:00:00Z').getDayOfWeek('America/Los_Angeles') // 6";
    default:
      return `timestamp('2023-07-14T10:30:45.123Z').${name}('America/Los_Angeles') // ${result}`;
  }
}
