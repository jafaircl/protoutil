import { declareContextProto } from '@bearclaw/cel';
import { TestAllTypesSchema } from '@buf/google_cel-spec.bufbuild_es/cel/expr/conformance/proto3/test_all_types_pb.js';
import { protoTable } from '../options.js';
import { formatError } from '../test-helpers.js';
import { PostgresEnv } from './env.js';
import { translatePostgres } from './index.js';

describe('postgres', () => {
  const env = new PostgresEnv(
    declareContextProto(TestAllTypesSchema),
    protoTable('table_2', TestAllTypesSchema)
  );
  const testCases: { in: string; out?: string; err?: string; vars?: unknown[] }[] = [
    // Type casting
    {
      // Unnecessary type casting should be ignored
      in: `list([1, 2, 3]) == [1, 2, 3]`,
      out: `ARRAY[$1, $2, $3] = ARRAY[$4, $5, $6]`,
      vars: [1n, 2n, 3n, 1n, 2n, 3n],
    },
    {
      in: `list('1,2,3') == ['1', '2', '3']`,
      out: `string_to_array($1, ',') = ARRAY[$2, $3, $4]`,
      vars: ['1,2,3', '1', '2', '3'],
    },
    {
      in: `list(single_string) == ['abc']`,
      out: `string_to_array(single_string, ',') = ARRAY[$1]`,
      vars: ['abc'],
    },
    {
      in: `string(1) == '1'`,
      out: `CAST($1 AS TEXT) = $2`,
      vars: [1n, '1'],
    },

    // Array creation differences
    {
      in: `[1, 2, 3][0] == 1`,
      out: `ARRAY[$1, $2, $3][$4] = $5`,
      vars: [1n, 2n, 3n, 0n, 1n],
    },
    {
      in: `single_bool in [true, false]`,
      out: `single_bool IN ARRAY[$1, $2]`,
      vars: [true, false],
    },
    {
      in: `[1, 2] + [3, 4] == true`,
      out: `ARRAY[$1, $2] || ARRAY[$3, $4] = $5`,
      vars: [1n, 2n, 3n, 4n, true],
    },
    {
      in: `size([1, 2, 3]) == 3`,
      out: `CARDINALITY(ARRAY[$1, $2, $3]) = $4`,
      vars: [1n, 2n, 3n, 3n],
    },
    {
      in: `[1, 2, 3].size() == 3`,
      out: `CARDINALITY(ARRAY[$1, $2, $3]) = $4`,
      vars: [1n, 2n, 3n, 3n],
    },

    // ILIKE
    {
      in: `single_string.like('abc')`,
      out: `single_string LIKE $1`,
      vars: ['abc'],
    },
    {
      in: `single_string.like('abc', true)`,
      out: `single_string ILIKE $1`,
      vars: ['abc'],
    },

    // List functions
    {
      in: `unnest([1, 2, 3]) == 1`,
      out: `UNNEST(ARRAY[$1, $2, $3]) = $4`,
      vars: [1n, 2n, 3n, 1n],
    },
    {
      in: `unnest(repeated_int64) == 1`,
      out: `UNNEST(repeated_int64) = $1`,
      vars: [1n],
    },
    {
      in: `unnest(single_int64) == 1`,
      err: `ERROR: <input>:1:7: found no matching overload for 'unnest' applied to '(int)'
     | unnest(single_int64) == 1
     | ......^`,
    },
    {
      in: `unnest(repeated_string).exists(x, x == 'abc')`,
      out: `EXISTS (SELECT 1 FROM UNNEST(repeated_string) AS x WHERE x = $1)`,
      vars: ['abc'],
    },
    {
      in: `unnest(repeated_string).existsOne(x, x == 'abc')`,
      out: `(SELECT COUNT(*) FROM UNNEST(repeated_string) AS x WHERE x = $1) = 1`,
      vars: ['abc'],
    },
    {
      in: `unnest(repeated_string).all(x, x == 'abc')`,
      out: `NOT EXISTS (SELECT 1 FROM UNNEST(repeated_string) AS x WHERE NOT (x = $1))`,
      vars: ['abc'],
    },
  ];

  for (const tc of testCases) {
    it(`should convert "${tc.in}"`, () => {
      if (tc.out) {
        const out = translatePostgres(tc.in, env);
        expect(out.sql).toEqual(tc.out);
        if (tc.vars) {
          expect(out.vars).toEqual(tc.vars);
        }
      } else if (tc.err) {
        expect(() => translatePostgres(tc.in, env)).toThrow(formatError(tc.err));
      } else {
        throw new Error('Test case must have either "out" or "err" property');
      }
    });
  }
});
