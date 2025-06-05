import { CostEstimate, declareContextProto } from '@protoutil/cel';
import { TestAllTypesSchema } from '@protoutil/cel/conformance-proto3';
import { protoTable } from '../options.js';
import { DefaultEnv } from './env.js';
import { translateDefault } from './index.js';

describe('Default Cost', () => {
  const env = new DefaultEnv(
    declareContextProto(TestAllTypesSchema),
    protoTable('table_2', TestAllTypesSchema)
  );

  const testCases: { in: string; estimate: CostEstimate; hints?: Map<string, bigint> }[] = [
    // Constant expressions
    {
      in: `true == true`,
      estimate: new CostEstimate(3n, 3n),
    },
    {
      in: `b"hello" == b"hello"`,
      estimate: new CostEstimate(11n, 11n),
    },
    {
      in: `1.234 == 1.234`,
      estimate: new CostEstimate(3n, 3n),
    },
    {
      in: `duration("1s") == duration("1s")`,
      estimate: new CostEstimate(7n, 7n),
    },
    {
      in: `1 == 1`,
      estimate: new CostEstimate(3n, 3n),
    },
    {
      in: `[1, 2, 3] == [1, 2, 3]`,
      estimate: new CostEstimate(27n, 27n),
    },
    {
      in: `"hello" == "hello"`,
      estimate: new CostEstimate(11n, 11n),
    },
    {
      in: `timestamp("2023-10-01T00:00:00Z") == timestamp("2023-10-01T00:00:00Z")`,
      estimate: new CostEstimate(43n, 43n),
    },
    {
      in: `42u == 42u`,
      estimate: new CostEstimate(3n, 3n),
    },

    // Idents
    {
      in: `single_bool == true`,
      estimate: new CostEstimate(13n, 13n),
    },
    {
      in: `single_bytes == b"hello"`,
      estimate: new CostEstimate(17n, 17n),
    },
    {
      in: `single_double == 1.234`,
      estimate: new CostEstimate(13n, 13n),
    },
    {
      in: `single_duration == duration("1s")`,
      estimate: new CostEstimate(15n, 15n),
    },
    {
      in: `single_int64 == 1`,
      estimate: new CostEstimate(13n, 13n),
    },
    {
      in: `repeated_int64 == [1, 2, 3]`,
      estimate: new CostEstimate(25n, 25n),
    },
    {
      in: `single_string == "hello"`,
      estimate: new CostEstimate(17n, 17n),
    },
    {
      in: `single_timestamp == timestamp("2023-10-01T00:00:00Z")`,
      estimate: new CostEstimate(33n, 33n),
    },
    {
      in: `single_uint64 == 42u`,
      estimate: new CostEstimate(13n, 13n),
    },

    // Math operations
    {
      in: `single_int64 + 1 == 2`,
      estimate: new CostEstimate(16n, 16n),
    },
    {
      in: `single_int64 - 1 == 0`,
      estimate: new CostEstimate(16n, 16n),
    },
    {
      in: `single_int64 * 2 == 2`,
      estimate: new CostEstimate(16n, 16n),
    },
    {
      in: `single_int64 / 2 == 0`,
      estimate: new CostEstimate(16n, 16n),
    },
    {
      in: `single_int64 % 2 == 1`,
      estimate: new CostEstimate(16n, 16n),
    },

    // Logical operations
    {
      in: `single_bool ? true : false`,
      estimate: new CostEstimate(14n, 14n),
    },
    {
      in: `single_bool && true`,
      estimate: new CostEstimate(13n, 13n),
    },
    {
      in: `single_bool || false`,
      estimate: new CostEstimate(13n, 13n),
    },
    {
      in: `!single_bool`,
      estimate: new CostEstimate(12n, 12n),
    },

    // Equality operations
    {
      in: `single_int64 == 10`,
      estimate: new CostEstimate(13n, 13n),
    },
    {
      in: `single_int64 != 10`,
      estimate: new CostEstimate(18n, 18n),
    },
    {
      in: `single_string == "hello"`,
      estimate: new CostEstimate(17n, 17n),
    },
    {
      in: `single_string != "world"`,
      estimate: new CostEstimate(22n, 22n),
    },

    // Comparison operations
    {
      in: `single_int64 < 10`,
      estimate: new CostEstimate(13n, 13n),
    },
    {
      in: `single_int64 <= 10`,
      estimate: new CostEstimate(13n, 13n),
    },
    {
      in: `single_int64 > 10`,
      estimate: new CostEstimate(13n, 13n),
    },
    {
      in: `single_int64 >= 10`,
      estimate: new CostEstimate(13n, 13n),
    },

    // Array operations
    {
      in: `2 in repeated_int64`,
      estimate: new CostEstimate(33n, 268_435_469n),
    },
    {
      in: `repeated_int64.size() == 3`,
      estimate: new CostEstimate(44n, 44n),
    },
    {
      in: `repeated_int64[0] == 1`,
      estimate: new CostEstimate(15n, 15n),
    },

    // String operations
    {
      in: `single_string.startsWith("he")`,
      estimate: new CostEstimate(41n, 41n),
    },
    {
      in: `single_string.endsWith("lo")`,
      estimate: new CostEstimate(61n, 61n),
    },
    {
      in: `single_string.contains("ll")`,
      estimate: new CostEstimate(61n, 61n),
    },
    {
      in: `single_string.size() == 5`,
      estimate: new CostEstimate(24n, 24n),
    },
    {
      in: `single_string.lower() == "hello"`,
      estimate: new CostEstimate(37n, 37n),
    },
    {
      in: `single_string.upper() == "HELLO"`,
      estimate: new CostEstimate(37n, 37n),
    },
    {
      in: `single_string.like("he%lo")`,
      estimate: new CostEstimate(41n, 41n),
    },

    // Type casting (casting column values is much more expensive than casting constants)
    {
      in: `bool(single_string) == true`,
      estimate: new CostEstimate(84n, 84n),
    },
    {
      in: `bool('true') == true`,
      estimate: new CostEstimate(7n, 7n),
    },
    {
      in: `bytes(single_string) == b"hello"`,
      estimate: new CostEstimate(88n, 88n),
    },
    {
      in: `date('2023-10-01') == date('2023-10-01')`,
      estimate: new CostEstimate(23n, 23n),
    },
    {
      in: `double(single_string) == 0.0`,
      estimate: new CostEstimate(84n, 84n),
    },
    {
      in: `duration(single_string) == duration("0s")`,
      estimate: new CostEstimate(106n, 106n),
    },
    {
      in: `int(single_string) == 0`,
      estimate: new CostEstimate(84n, 84n),
    },
    // TODO: list type casting
    // {
    //   in: `list(single_string) == ["h", "e", "l", "l", "o"]`,
    //   estimate: new CostEstimate(3n, 6556n),
    // },
    {
      in: `string(single_string) == "hello"`,
      estimate: new CostEstimate(88n, 88n),
    },
    {
      in: `timestamp(single_string) == timestamp("1970-01-01T00:00:00Z")`,
      estimate: new CostEstimate(124n, 124n),
    },
    {
      in: `uint(single_string) == 0u`,
      estimate: new CostEstimate(84n, 84n),
    },

    // Macros
    {
      in: `table_2.exists(x, x.single_string == 'abc')`,
      estimate: new CostEstimate(343n, 8_321_499_448n),
    },
    {
      in: `table_2.existsOne(x, x.single_string == 'abc')`,
      estimate: new CostEstimate(366n, 8_589_934_926n),
    },
    {
      in: `table_2.all(x, x.single_string == 'abc')`,
      estimate: new CostEstimate(222n, 5_368_709_322n),
    },

    // Time functions
    {
      in: `timestamp("2023-10-01T00:00:00Z").getFullYear() == 2023`,
      estimate: new CostEstimate(43n, 43n),
    },
    {
      in: `timestamp(single_string).getFullYear() == timestamp("2023-11-01T00:00:00Z").getFullYear()`,
      estimate: new CostEstimate(164n, 164n),
    },
    {
      in: `timestamp("2023-10-01T00:00:00Z").getMonth() == 9`,
      estimate: new CostEstimate(43n, 43n),
    },
    {
      in: `timestamp("2023-10-01T00:00:00Z").getDate() == 1`,
      estimate: new CostEstimate(43n, 43n),
    },
    {
      in: `timestamp("2023-10-01T00:00:00Z").getDayOfWeek() == 0`,
      estimate: new CostEstimate(43n, 43n),
    },
    {
      in: `timestamp("2023-10-01T00:00:00Z").getDayOfYear() == 274`,
      estimate: new CostEstimate(43n, 43n),
    },
    {
      in: `timestamp("2023-10-01T00:00:00Z").getHours() == 0`,
      estimate: new CostEstimate(43n, 43n),
    },
    {
      in: `timestamp("2023-10-01T00:00:00Z").getMinutes() == 0`,
      estimate: new CostEstimate(43n, 43n),
    },
    {
      in: `timestamp("2023-10-01T00:00:00Z").getSeconds() == 0`,
      estimate: new CostEstimate(43n, 43n),
    },
    {
      in: `timestamp("2023-10-01T00:00:00Z").getMilliseconds() == 0`,
      estimate: new CostEstimate(43n, 43n),
    },
  ];
  for (const tc of testCases) {
    it(`should estimate cost for "${tc.in}"`, () => {
      const result = translateDefault(tc.in, env, tc.hints);
      expect(result.cost).toEqual(tc.estimate);
    });
  }

  // for (const tc of testCases) {
  //   it(`should adjust for the number of rows when an ident is used for "${tc.in}"`, () => {
  //     const result = translateDefault(
  //       tc.in,
  //       env.extend(costEstimatorOptions(tableRowCount('single_string', 1000)))
  //     );
  //     expect(result.cost).toEqual(tc.estimate);
  //   });
  // }
});
