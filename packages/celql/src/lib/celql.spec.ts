import { declareContextProto } from '@bearclaw/cel';
import { TestAllTypesSchema } from '@buf/google_cel-spec.bufbuild_es/cel/expr/conformance/proto3/test_all_types_pb.js';
import { sql } from './celql.js';
import { SqlEnv } from './env.js';

describe('celql', () => {
  describe('sql()', () => {
    const env = new SqlEnv(declareContextProto(TestAllTypesSchema));
    const testCases = [
      // Logical operators
      {
        in: `single_string.startsWith("foo") ? true : false`,
        out: `CASE WHEN single_string LIKE CONCAT($1, '%') THEN $2 ELSE $3 END`,
        vars: ['foo', true, false],
      },
      {
        in: `single_string.startsWith("foo") || single_string.endsWith("bar")`,
        out: `single_string LIKE CONCAT($1, '%') OR single_string LIKE CONCAT('%', $2)`,
        vars: ['foo', 'bar'],
      },
      {
        in: `single_string.startsWith("foo") ||| single_string.endsWith("bar")`,
        err: `ERROR: <input>:1:35: Syntax error: token recognition error at: '| '
     | single_string.startsWith("foo") ||| single_string.endsWith("bar")
     | ..................................^`,
      },
      {
        in: `single_string.startsWith("foo") && single_string.endsWith("bar")`,
        out: `single_string LIKE CONCAT($1, '%') AND single_string LIKE CONCAT('%', $2)`,
        vars: ['foo', 'bar'],
      },
      {
        in: `single_string.startsWith("foo") && single_string.endsWith("bar") || single_string.contains("baz")`,
        out: `single_string LIKE CONCAT($1, '%') AND single_string LIKE CONCAT('%', $2) OR single_string LIKE CONCAT('%', $3, '%')`,
        vars: ['foo', 'bar', 'baz'],
      },
      {
        in: `single_string.startsWith("foo") && single_string.endsWith("bar") || single_string.contains("baz") && single_string.startsWith("qux")`,
        out: `single_string LIKE CONCAT($1, '%') AND single_string LIKE CONCAT('%', $2) OR single_string LIKE CONCAT('%', $3, '%') AND single_string LIKE CONCAT($4, '%')`,
        vars: ['foo', 'bar', 'baz', 'qux'],
      },
      {
        in: `!single_string.startsWith("foo")`,
        out: `NOT single_string LIKE CONCAT($1, '%')`,
        vars: ['foo'],
      },
      {
        in: `!(single_string.startsWith("foo") || single_string.endsWith("bar"))`,
        out: `NOT (single_string LIKE CONCAT($1, '%') OR single_string LIKE CONCAT('%', $2))`,
        vars: ['foo', 'bar'],
      },
      {
        in: `!(single_string.startsWith("foo") && single_string.endsWith("bar"))`,
        out: `NOT (single_string LIKE CONCAT($1, '%') AND single_string LIKE CONCAT('%', $2))`,
        vars: ['foo', 'bar'],
      },
      {
        in: `!(single_string.startsWith("foo") && single_string.endsWith("bar") || single_string.contains("baz"))`,
        out: `NOT (single_string LIKE CONCAT($1, '%') AND single_string LIKE CONCAT('%', $2) OR single_string LIKE CONCAT('%', $3, '%'))`,
        vars: ['foo', 'bar', 'baz'],
      },

      // Equality / inequality operators
      {
        in: `single_string == "foo"`,
        out: `single_string = $1`,
        vars: ['foo'],
      },
      {
        in: `single_string != "foo"`,
        out: `single_string != $1`,
        vars: ['foo'],
      },
      {
        in: `single_string == single_string`,
        out: `single_string = single_string`,
      },
      {
        in: `single_bool == true`,
        out: `single_bool = $1`,
        vars: [true],
      },
      {
        in: `single_bool != false`,
        out: `single_bool != $1`,
        vars: [false],
      },
      {
        in: `single_int64 == 1`,
        out: `single_int64 = $1`,
        vars: [1n],
      },
      {
        in: `single_double == 1.0`,
        out: `single_double = $1`,
        vars: [1],
      },
      {
        in: `single_double == 1.234`,
        out: `single_double = $1`,
        vars: [1.234],
      },

      // Mathematical operators
      {
        in: `single_bytes + b"foo" == b"bar"`,
        out: `single_bytes || $1 = $2`,
        vars: [new TextEncoder().encode('foo'), new TextEncoder().encode('bar')],
      },
      {
        in: `single_double + 2.0 == 3.0`,
        out: `single_double + $1 = $2`,
        vars: [2, 3],
      },
      {
        in: `duration('1s') + duration('61s') == duration('62s')`,
        out: `INTERVAL '1 SECOND' * $1 + INTERVAL '1 SECOND' * $2 = INTERVAL '1 SECOND' * $3`,
        vars: [1, 61, 62],
      },
      {
        in: `single_duration + duration('61s') == duration('62s')`,
        out: `single_duration + INTERVAL '1 SECOND' * $1 = INTERVAL '1 SECOND' * $2`,
        vars: [61, 62],
      },
      {
        in: `duration('5s') + timestamp('2023-10-01T00:00:00Z') == timestamp('2023-10-01T00:00:05Z')`,
        out: `INTERVAL '1 SECOND' * $1 + TIMESTAMP '2023-10-01T00:00:00.000Z' = TIMESTAMP '2023-10-01T00:00:05.000Z'`,
        vars: [5],
      },
      {
        in: `single_timestamp + duration('1s') == timestamp('2023-10-01T00:00:01Z')`,
        out: `single_timestamp + INTERVAL '1 SECOND' * $1 = TIMESTAMP '2023-10-01T00:00:01.000Z'`,
        vars: [1],
      },
      {
        in: `single_timestamp + single_duration == timestamp('2023-10-01T00:00:01Z')`,
        out: `single_timestamp + single_duration = TIMESTAMP '2023-10-01T00:00:01.000Z'`,
        vars: [],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z') + duration('1s') == timestamp('2023-10-01T00:00:01Z')`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' + INTERVAL '1 SECOND' * $1 = TIMESTAMP '2023-10-01T00:00:01.000Z'`,
        vars: [1],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z') + single_duration == timestamp('2023-10-01T00:00:01Z')`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' + single_duration = TIMESTAMP '2023-10-01T00:00:01.000Z'`,
        vars: [],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z') + timestamp('2023-10-01T00:00:01Z')`,
        err: `ERROR: <input>:1:35: found no matching overload for '_+_' applied to '(timestamp, timestamp)'
     | timestamp('2023-10-01T00:00:00Z') + timestamp('2023-10-01T00:00:01Z')
     | ..................................^`,
      },
      {
        in: `1 + 2 == 3`,
        out: `$1 + $2 = $3`,
        vars: [1n, 2n, 3n],
      },
      {
        in: `1 + single_int64 == 3`,
        out: `$1 + single_int64 = $2`,
        vars: [1n, 3n],
      },
      {
        in: `[1] + [2] == [3]`,
        out: `($1) || ($2) = ($3)`,
        vars: [1n, 2n, 3n],
      },
      {
        in: `[1] + repeated_int64 == [1, 2, 3]`,
        out: `($1) || repeated_int64 = ($2, $3, $4)`,
        vars: [1n, 1n, 2n, 3n],
      },
      {
        in: `'foo' + 'bar' == 'foobar'`,
        out: `$1 || $2 = $3`,
        vars: ['foo', 'bar', 'foobar'],
      },
      {
        in: `'foo' + single_string == 'foobar'`,
        out: `$1 || single_string = $2`,
        vars: ['foo', 'foobar'],
      },
      {
        in: `1u + 2u == 3u`,
        out: `$1 + $2 = $3`,
        vars: [1n, 2n, 3n],
      },
      {
        in: `single_uint64 + 2u == 3u`,
        out: `single_uint64 + $1 = $2`,
        vars: [2n, 3n],
      },
      {
        in: `1.0 + 2 == 3u`,
        err: `ERROR: <input>:1:5: found no matching overload for '_+_' applied to '(double, int)'
     | 1.0 + 2 == 3u
     | ....^`,
      },
      {
        in: `6.0 / 2.0 == 3.0`,
        out: `$1 / $2 = $3`,
        vars: [6, 2, 3],
      },
      {
        in: `single_double / 2.0 == 3.0`,
        out: `single_double / $1 = $2`,
        vars: [2, 3],
      },
      {
        in: `6 / 2 == 3`,
        out: `$1 / $2 = $3`,
        vars: [6n, 2n, 3n],
      },
      {
        in: `6 / single_int64 == 3`,
        out: `$1 / single_int64 = $2`,
        vars: [6n, 3n],
      },
      {
        in: `6u / 2u == 3u`,
        out: `$1 / $2 = $3`,
        vars: [6n, 2n, 3n],
      },
      {
        in: `single_uint64 / 2u == 3u`,
        out: `single_uint64 / $1 = $2`,
        vars: [2n, 3n],
      },
      {
        in: `6 / 2.0 == 3u`,
        err: `ERROR: <input>:1:3: found no matching overload for '_/_' applied to '(int, double)'
     | 6 / 2.0 == 3u
     | ..^`,
      },
      {
        in: `5 % 2 == 1`,
        out: `$1 % $2 = $3`,
        vars: [5n, 2n, 1n],
      },
      {
        in: `single_int64 % 2 == 1`,
        out: `single_int64 % $1 = $2`,
        vars: [2n, 1n],
      },
      {
        in: `5u % 2u == 1u`,
        out: `$1 % $2 = $3`,
        vars: [5n, 2n, 1n],
      },
      {
        in: `single_uint64 % 2u == 1u`,
        out: `single_uint64 % $1 = $2`,
        vars: [2n, 1n],
      },
      {
        in: `5 % 2.0 == 1u`,
        err: `ERROR: <input>:1:3: found no matching overload for '_%_' applied to '(int, double)'
     | 5 % 2.0 == 1u
     | ..^`,
      },
      {
        in: `4.0 * 2.0 == 8.0`,
        out: `$1 * $2 = $3`,
        vars: [4, 2, 8],
      },
      {
        in: `single_double * 2.0 == 8.0`,
        out: `single_double * $1 = $2`,
        vars: [2, 8],
      },
      {
        in: `4 * 2 == 8`,
        out: `$1 * $2 = $3`,
        vars: [4n, 2n, 8n],
      },
      {
        in: `single_int64 * 2 == 8`,
        out: `single_int64 * $1 = $2`,
        vars: [2n, 8n],
      },
      {
        in: `4u * 2u == 8u`,
        out: `$1 * $2 = $3`,
        vars: [4n, 2n, 8n],
      },
      {
        in: `single_uint64 * 2u == 8u`,
        out: `single_uint64 * $1 = $2`,
        vars: [2n, 8n],
      },
      {
        in: `4 * 2.0 == 8u`,
        err: `ERROR: <input>:1:3: found no matching overload for '_*_' applied to '(int, double)'
     | 4 * 2.0 == 8u
     | ..^`,
      },
      {
        in: `7.0 - 2.0 == 5.0`,
        out: `$1 - $2 = $3`,
        vars: [7, 2, 5],
      },
      {
        in: `single_double - 2.0 == 5.0`,
        out: `single_double - $1 = $2`,
        vars: [2, 5],
      },
      {
        in: `duration('7s') - duration('2s') == duration('5s')`,
        out: `INTERVAL '1 SECOND' * $1 - INTERVAL '1 SECOND' * $2 = INTERVAL '1 SECOND' * $3`,
        vars: [7, 2, 5],
      },
      {
        in: `single_duration - duration('2s') == duration('5s')`,
        out: `single_duration - INTERVAL '1 SECOND' * $1 = INTERVAL '1 SECOND' * $2`,
        vars: [2, 5],
      },
      {
        in: `7 - 2 == 5`,
        out: `$1 - $2 = $3`,
        vars: [7n, 2n, 5n],
      },
      {
        in: `timestamp('2023-10-01T00:00:07Z') - duration('2s') == timestamp('2023-10-01T00:00:05Z')`,
        out: `TIMESTAMP '2023-10-01T00:00:07.000Z' - INTERVAL '1 SECOND' * $1 = TIMESTAMP '2023-10-01T00:00:05.000Z'`,
        vars: [2],
      },
      {
        in: `single_timestamp - duration('2s') == timestamp('2023-10-01T00:00:05Z')`,
        out: `single_timestamp - INTERVAL '1 SECOND' * $1 = TIMESTAMP '2023-10-01T00:00:05.000Z'`,
        vars: [2],
      },
      {
        in: `timestamp('2023-10-01T00:00:07Z') - single_duration == timestamp('2023-10-01T00:00:05Z')`,
        out: `TIMESTAMP '2023-10-01T00:00:07.000Z' - single_duration = TIMESTAMP '2023-10-01T00:00:05.000Z'`,
      },
      {
        in: `timestamp('2023-10-01T00:00:07Z') - timestamp('2023-10-01T00:00:02Z') == duration('5s')`,
        out: `TIMESTAMP '2023-10-01T00:00:07.000Z' - TIMESTAMP '2023-10-01T00:00:02.000Z' = INTERVAL '1 SECOND' * $1`,
      },
      {
        in: `single_timestamp - single_timestamp == duration('5s')`,
        out: `single_timestamp - single_timestamp = INTERVAL '1 SECOND' * $1`,
        vars: [5],
      },
      {
        in: `single_timestamp - 1.0 == duration('5s')`,
        err: `ERROR: <input>:1:18: found no matching overload for '_-_' applied to '(timestamp, double)'
     | single_timestamp - 1.0 == duration('5s')
     | .................^`,
      },
      {
        in: `7u - 2u == 5u`,
        out: `$1 - $2 = $3`,
        vars: [7n, 2n, 5n],
      },
      {
        in: `single_uint64 - 2u == 5u`,
        out: `single_uint64 - $1 = $2`,
        vars: [2n, 5n],
      },
      {
        in: `7 - 2.0 == 5u`,
        err: `ERROR: <input>:1:3: found no matching overload for '_-_' applied to '(int, double)'
     | 7 - 2.0 == 5u
     | ..^`,
      },

      // Relational operators (Less, LessEquals, Greater, GreaterEquals)
      {
        in: `true < false`,
        out: `$1 < $2`,
        vars: [true, false],
      },
      {
        in: `single_bool < false`,
        out: `single_bool < $1`,
        vars: [false],
      },
      {
        in: `2 < 3`,
        out: `$1 < $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_int64 < 3`,
        out: `single_int64 < $1`,
        vars: [3n],
      },
      {
        in: `2 < single_int64`,
        out: `$1 < single_int64`,
        vars: [2n],
      },
      {
        in: `2 < 3.0`,
        out: `$1 < $2`,
        vars: [2n, 3],
      },
      {
        in: `single_int64 < 3.0`,
        out: `single_int64 < $1`,
      },
      {
        in: `2 < single_double`,
        out: `$1 < single_double`,
        vars: [2n],
      },
      {
        in: `2 < 3u`,
        out: `$1 < $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_int64 < 3u`,
        out: `single_int64 < $1`,
        vars: [3n],
      },
      {
        in: `2 < single_uint64`,
        out: `$1 < single_uint64`,
        vars: [2n],
      },
      {
        in: `2u < 3u`,
        out: `$1 < $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_uint64 < 3u`,
        out: `single_uint64 < $1`,
        vars: [3n],
      },
      {
        in: `2u < single_uint64`,
        out: `$1 < single_uint64`,
        vars: [2n],
      },
      {
        in: `2u < 3.0`,
        out: `$1 < $2`,
        vars: [2n, 3],
      },
      {
        in: `single_uint64 < 3.0`,
        out: `single_uint64 < $1`,
        vars: [3],
      },
      {
        in: `2u < single_double`,
        out: `$1 < single_double`,
        vars: [2n],
      },
      {
        in: `2u < 3`,
        out: `$1 < $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_uint64 < 3`,
        out: `single_uint64 < $1`,
        vars: [3n],
      },
      {
        in: `2u < single_int64`,
        out: `$1 < single_int64`,
        vars: [2n],
      },
      {
        in: `2.0 < 3.0`,
        out: `$1 < $2`,
        vars: [2, 3],
      },
      {
        in: `single_double < 3.0`,
        out: `single_double < $1`,
        vars: [3],
      },
      {
        in: `2.0 < single_double`,
        out: `$1 < single_double`,
        vars: [2],
      },
      {
        in: `2.0 < 3`,
        out: `$1 < $2`,
        vars: [2, 3n],
      },
      {
        in: `single_double < 3`,
        out: `single_double < $1`,
        vars: [3n],
      },
      {
        in: `2.0 < single_int64`,
        out: `$1 < single_int64`,
        vars: [2],
      },
      {
        in: `2.0 < 3u`,
        out: `$1 < $2`,
        vars: [2, 3n],
      },
      {
        in: `single_double < 3u`,
        out: `single_double < $1`,
        vars: [3n],
      },
      {
        in: `2.0 < single_uint64`,
        out: `$1 < single_uint64`,
        vars: [2],
      },
      {
        in: `'foo' < 'bar'`,
        out: `$1 < $2`,
        vars: ['foo', 'bar'],
      },
      {
        in: `single_string < 'bar'`,
        out: `single_string < $1`,
        vars: ['bar'],
      },
      {
        in: `'foo' < single_string`,
        out: `$1 < single_string`,
        vars: ['foo'],
      },
      {
        in: `b"foo" < b"bar"`,
        out: `$1 < $2`,
        vars: [new TextEncoder().encode('foo'), new TextEncoder().encode('bar')],
      },
      {
        in: `single_bytes < b"bar"`,
        out: `single_bytes < $1`,
        vars: [new TextEncoder().encode('bar')],
      },
      {
        in: `b"foo" < single_bytes`,
        out: `$1 < single_bytes`,
        vars: [new TextEncoder().encode('foo')],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z') < timestamp('2023-10-01T00:00:01Z')`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' < TIMESTAMP '2023-10-01T00:00:01.000Z'`,
      },
      {
        in: `single_timestamp < timestamp('2023-10-01T00:00:01Z')`,
        out: `single_timestamp < TIMESTAMP '2023-10-01T00:00:01.000Z'`,
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z') < single_timestamp`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' < single_timestamp`,
      },
      {
        in: `duration('1s') < duration('2s')`,
        out: `INTERVAL '1 SECOND' * $1 < INTERVAL '1 SECOND' * $2`,
        vars: [1, 2],
      },
      {
        in: `single_duration < duration('2s')`,
        out: `single_duration < INTERVAL '1 SECOND' * $1`,
        vars: [2],
      },
      {
        in: `duration('1s') < single_duration`,
        out: `INTERVAL '1 SECOND' * $1 < single_duration`,
        vars: [1],
      },
      {
        in: `'foo' < 3.0`,
        err: `ERROR: <input>:1:7: found no matching overload for '_<_' applied to '(string, double)'
     | 'foo' < `,
      },
      {
        in: `true <= false`,
        out: `$1 <= $2`,
        vars: [true, false],
      },
      {
        in: `single_bool <= false`,
        out: `single_bool <= $1`,
        vars: [false],
      },
      {
        in: `2 <= 3`,
        out: `$1 <= $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_int64 <= 3`,
        out: `single_int64 <= $1`,
        vars: [3n],
      },
      {
        in: `2 <= single_int64`,
        out: `$1 <= single_int64`,
        vars: [2n],
      },
      {
        in: `2 <= 3.0`,
        out: `$1 <= $2`,
        vars: [2n, 3],
      },
      {
        in: `single_int64 <= 3.0`,
        out: `single_int64 <= $1`,
      },
      {
        in: `2 <= single_double`,
        out: `$1 <= single_double`,
        vars: [2n],
      },
      {
        in: `2 <= 3u`,
        out: `$1 <= $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_int64 <= 3u`,
        out: `single_int64 <= $1`,
        vars: [3n],
      },
      {
        in: `2 <= single_uint64`,
        out: `$1 <= single_uint64`,
        vars: [2n],
      },
      {
        in: `2u <= 3u`,
        out: `$1 <= $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_uint64 <= 3u`,
        out: `single_uint64 <= $1`,
        vars: [3n],
      },
      {
        in: `2u <= single_uint64`,
        out: `$1 <= single_uint64`,
        vars: [2n],
      },
      {
        in: `2u <= 3.0`,
        out: `$1 <= $2`,
        vars: [2n, 3],
      },
      {
        in: `single_uint64 <= 3.0`,
        out: `single_uint64 <= $1`,
        vars: [3],
      },
      {
        in: `2u <= single_double`,
        out: `$1 <= single_double`,
        vars: [2n],
      },
      {
        in: `2u <= 3`,
        out: `$1 <= $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_uint64 <= 3`,
        out: `single_uint64 <= $1`,
        vars: [3n],
      },
      {
        in: `2u <= single_int64`,
        out: `$1 <= single_int64`,
        vars: [2n],
      },
      {
        in: `2.0 <= 3.0`,
        out: `$1 <= $2`,
        vars: [2, 3],
      },
      {
        in: `single_double <= 3.0`,
        out: `single_double <= $1`,
        vars: [3],
      },
      {
        in: `2.0 <= single_double`,
        out: `$1 <= single_double`,
        vars: [2],
      },
      {
        in: `2.0 <= 3`,
        out: `$1 <= $2`,
        vars: [2, 3n],
      },
      {
        in: `single_double <= 3`,
        out: `single_double <= $1`,
        vars: [3n],
      },
      {
        in: `2.0 <= single_int64`,
        out: `$1 <= single_int64`,
        vars: [2],
      },
      {
        in: `2.0 <= 3u`,
        out: `$1 <= $2`,
        vars: [2, 3n],
      },
      {
        in: `single_double <= 3u`,
        out: `single_double <= $1`,
        vars: [3n],
      },
      {
        in: `2.0 <= single_uint64`,
        out: `$1 <= single_uint64`,
        vars: [2],
      },
      {
        in: `'foo' <= 'bar'`,
        out: `$1 <= $2`,
        vars: ['foo', 'bar'],
      },
      {
        in: `single_string <= 'bar'`,
        out: `single_string <= $1`,
        vars: ['bar'],
      },
      {
        in: `'foo' <= single_string`,
        out: `$1 <= single_string`,
        vars: ['foo'],
      },
      {
        in: `b"foo" <= b"bar"`,
        out: `$1 <= $2`,
        vars: [new TextEncoder().encode('foo'), new TextEncoder().encode('bar')],
      },
      {
        in: `single_bytes <= b"bar"`,
        out: `single_bytes <= $1`,
        vars: [new TextEncoder().encode('bar')],
      },
      {
        in: `b"foo" <= single_bytes`,
        out: `$1 <= single_bytes`,
        vars: [new TextEncoder().encode('foo')],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z') <= timestamp('2023-10-01T00:00:01Z')`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' <= TIMESTAMP '2023-10-01T00:00:01.000Z'`,
      },
      {
        in: `single_timestamp <= timestamp('2023-10-01T00:00:01Z')`,
        out: `single_timestamp <= TIMESTAMP '2023-10-01T00:00:01.000Z'`,
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z') <= single_timestamp`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' <= single_timestamp`,
      },
      {
        in: `duration('1s') <= duration('2s')`,
        out: `INTERVAL '1 SECOND' * $1 <= INTERVAL '1 SECOND' * $2`,
        vars: [1, 2],
      },
      {
        in: `single_duration <= duration('2s')`,
        out: `single_duration <= INTERVAL '1 SECOND' * $1`,
        vars: [2],
      },
      {
        in: `duration('1s') <= single_duration`,
        out: `INTERVAL '1 SECOND' * $1 <= single_duration`,
        vars: [1],
      },
      {
        in: `'foo' <= 3.0`,
        err: `ERROR: <input>:1:7: found no matching overload for '_<=_' applied to '(string, double)'
     | 'foo' <= 3.0
     | ......^`,
      },
      {
        in: `true > false`,
        out: `$1 > $2`,
        vars: [true, false],
      },
      {
        in: `single_bool > false`,
        out: `single_bool > $1`,
        vars: [false],
      },
      {
        in: `2 > 3`,
        out: `$1 > $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_int64 > 3`,
        out: `single_int64 > $1`,
        vars: [3n],
      },
      {
        in: `2 > single_int64`,
        out: `$1 > single_int64`,
        vars: [2n],
      },
      {
        in: `2 > 3.0`,
        out: `$1 > $2`,
        vars: [2n, 3],
      },
      {
        in: `single_int64 > 3.0`,
        out: `single_int64 > $1`,
      },
      {
        in: `2 > single_double`,
        out: `$1 > single_double`,
        vars: [2n],
      },
      {
        in: `2 > 3u`,
        out: `$1 > $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_int64 > 3u`,
        out: `single_int64 > $1`,
        vars: [3n],
      },
      {
        in: `2 > single_uint64`,
        out: `$1 > single_uint64`,
        vars: [2n],
      },
      {
        in: `2u > 3u`,
        out: `$1 > $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_uint64 > 3u`,
        out: `single_uint64 > $1`,
        vars: [3n],
      },
      {
        in: `2u > single_uint64`,
        out: `$1 > single_uint64`,
        vars: [2n],
      },
      {
        in: `2u > 3.0`,
        out: `$1 > $2`,
        vars: [2n, 3],
      },
      {
        in: `single_uint64 > 3.0`,
        out: `single_uint64 > $1`,
        vars: [3],
      },
      {
        in: `2u > single_double`,
        out: `$1 > single_double`,
        vars: [2n],
      },
      {
        in: `2u > 3`,
        out: `$1 > $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_uint64 > 3`,
        out: `single_uint64 > $1`,
        vars: [3n],
      },
      {
        in: `2u > single_int64`,
        out: `$1 > single_int64`,
        vars: [2n],
      },
      {
        in: `2.0 > 3.0`,
        out: `$1 > $2`,
        vars: [2, 3],
      },
      {
        in: `single_double > 3.0`,
        out: `single_double > $1`,
        vars: [3],
      },
      {
        in: `2.0 > single_double`,
        out: `$1 > single_double`,
        vars: [2],
      },
      {
        in: `2.0 > 3`,
        out: `$1 > $2`,
        vars: [2, 3n],
      },
      {
        in: `single_double > 3`,
        out: `single_double > $1`,
        vars: [3n],
      },
      {
        in: `2.0 > single_int64`,
        out: `$1 > single_int64`,
        vars: [2],
      },
      {
        in: `2.0 > 3u`,
        out: `$1 > $2`,
        vars: [2, 3n],
      },
      {
        in: `single_double > 3u`,
        out: `single_double > $1`,
        vars: [3n],
      },
      {
        in: `2.0 > single_uint64`,
        out: `$1 > single_uint64`,
        vars: [2],
      },
      {
        in: `'foo' > 'bar'`,
        out: `$1 > $2`,
        vars: ['foo', 'bar'],
      },
      {
        in: `single_string > 'bar'`,
        out: `single_string > $1`,
        vars: ['bar'],
      },
      {
        in: `'foo' > single_string`,
        out: `$1 > single_string`,
        vars: ['foo'],
      },
      {
        in: `b"foo" > b"bar"`,
        out: `$1 > $2`,
        vars: [new TextEncoder().encode('foo'), new TextEncoder().encode('bar')],
      },
      {
        in: `single_bytes > b"bar"`,
        out: `single_bytes > $1`,
        vars: [new TextEncoder().encode('bar')],
      },
      {
        in: `b"foo" > single_bytes`,
        out: `$1 > single_bytes`,
        vars: [new TextEncoder().encode('foo')],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z') > timestamp('2023-10-01T00:00:01Z')`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' > TIMESTAMP '2023-10-01T00:00:01.000Z'`,
      },
      {
        in: `single_timestamp > timestamp('2023-10-01T00:00:01Z')`,
        out: `single_timestamp > TIMESTAMP '2023-10-01T00:00:01.000Z'`,
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z') > single_timestamp`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' > single_timestamp`,
      },
      {
        in: `duration('1s') > duration('2s')`,
        out: `INTERVAL '1 SECOND' * $1 > INTERVAL '1 SECOND' * $2`,
        vars: [1, 2],
      },
      {
        in: `single_duration > duration('2s')`,
        out: `single_duration > INTERVAL '1 SECOND' * $1`,
        vars: [2],
      },
      {
        in: `duration('1s') > single_duration`,
        out: `INTERVAL '1 SECOND' * $1 > single_duration`,
        vars: [1],
      },
      {
        in: `'foo' > 3.0`,
        err: `ERROR: <input>:1:7: found no matching overload for '_>_' applied to '(string, double)'
     | 'foo' > 3.0
     | ......^`,
      },
      {
        in: `true >= false`,
        out: `$1 >= $2`,
        vars: [true, false],
      },
      {
        in: `single_bool >= false`,
        out: `single_bool >= $1`,
        vars: [false],
      },
      {
        in: `2 >= 3`,
        out: `$1 >= $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_int64 >= 3`,
        out: `single_int64 >= $1`,
        vars: [3n],
      },
      {
        in: `2 >= single_int64`,
        out: `$1 >= single_int64`,
        vars: [2n],
      },
      {
        in: `2 >= 3.0`,
        out: `$1 >= $2`,
        vars: [2n, 3],
      },
      {
        in: `single_int64 >= 3.0`,
        out: `single_int64 >= $1`,
      },
      {
        in: `2 >= single_double`,
        out: `$1 >= single_double`,
        vars: [2n],
      },
      {
        in: `2 >= 3u`,
        out: `$1 >= $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_int64 >= 3u`,
        out: `single_int64 >= $1`,
        vars: [3n],
      },
      {
        in: `2 >= single_uint64`,
        out: `$1 >= single_uint64`,
        vars: [2n],
      },
      {
        in: `2u >= 3u`,
        out: `$1 >= $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_uint64 >= 3u`,
        out: `single_uint64 >= $1`,
        vars: [3n],
      },
      {
        in: `2u >= single_uint64`,
        out: `$1 >= single_uint64`,
        vars: [2n],
      },
      {
        in: `2u >= 3.0`,
        out: `$1 >= $2`,
        vars: [2n, 3],
      },
      {
        in: `single_uint64 >= 3.0`,
        out: `single_uint64 >= $1`,
        vars: [3],
      },
      {
        in: `2u >= single_double`,
        out: `$1 >= single_double`,
        vars: [2n],
      },
      {
        in: `2u >= 3`,
        out: `$1 >= $2`,
        vars: [2n, 3n],
      },
      {
        in: `single_uint64 >= 3`,
        out: `single_uint64 >= $1`,
        vars: [3n],
      },
      {
        in: `2u >= single_int64`,
        out: `$1 >= single_int64`,
        vars: [2n],
      },
      {
        in: `2.0 >= 3.0`,
        out: `$1 >= $2`,
        vars: [2, 3],
      },
      {
        in: `single_double >= 3.0`,
        out: `single_double >= $1`,
        vars: [3],
      },
      {
        in: `2.0 >= single_double`,
        out: `$1 >= single_double`,
        vars: [2],
      },
      {
        in: `2.0 >= 3`,
        out: `$1 >= $2`,
        vars: [2, 3n],
      },
      {
        in: `single_double >= 3`,
        out: `single_double >= $1`,
        vars: [3n],
      },
      {
        in: `2.0 >= single_int64`,
        out: `$1 >= single_int64`,
        vars: [2],
      },
      {
        in: `2.0 >= 3u`,
        out: `$1 >= $2`,
        vars: [2, 3n],
      },
      {
        in: `single_double >= 3u`,
        out: `single_double >= $1`,
        vars: [3n],
      },
      {
        in: `2.0 >= single_uint64`,
        out: `$1 >= single_uint64`,
        vars: [2],
      },
      {
        in: `'foo' >= 'bar'`,
        out: `$1 >= $2`,
        vars: ['foo', 'bar'],
      },
      {
        in: `single_string >= 'bar'`,
        out: `single_string >= $1`,
        vars: ['bar'],
      },
      {
        in: `'foo' >= single_string`,
        out: `$1 >= single_string`,
        vars: ['foo'],
      },
      {
        in: `b"foo" >= b"bar"`,
        out: `$1 >= $2`,
        vars: [new TextEncoder().encode('foo'), new TextEncoder().encode('bar')],
      },
      {
        in: `single_bytes >= b"bar"`,
        out: `single_bytes >= $1`,
        vars: [new TextEncoder().encode('bar')],
      },
      {
        in: `b"foo" >= single_bytes`,
        out: `$1 >= single_bytes`,
        vars: [new TextEncoder().encode('foo')],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z') >= timestamp('2023-10-01T00:00:01Z')`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' >= TIMESTAMP '2023-10-01T00:00:01.000Z'`,
      },
      {
        in: `single_timestamp >= timestamp('2023-10-01T00:00:01Z')`,
        out: `single_timestamp >= TIMESTAMP '2023-10-01T00:00:01.000Z'`,
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z') >= single_timestamp`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' >= single_timestamp`,
      },
      {
        in: `duration('1s') >= duration('2s')`,
        out: `INTERVAL '1 SECOND' * $1 >= INTERVAL '1 SECOND' * $2`,
        vars: [1, 2],
      },
      {
        in: `single_duration >= duration('2s')`,
        out: `single_duration >= INTERVAL '1 SECOND' * $1`,
        vars: [2],
      },
      {
        in: `duration('1s') >= single_duration`,
        out: `INTERVAL '1 SECOND' * $1 >= single_duration`,
        vars: [1],
      },
      {
        in: `'foo' >= 3.0`,
        err: `ERROR: <input>:1:7: found no matching overload for '_>=_' applied to '(string, double)'
     | 'foo' >= 3.0
     | ......^`,
      },

      // String functions
      {
        in: `single_string.contains("foo")`,
        out: `single_string LIKE CONCAT('%', $1, '%')`,
        vars: ['foo'],
      },
      {
        in: `single_bool.contains("foo")`,
        err: `ERROR: <input>:1:21: found no matching overload for 'contains' applied to 'bool.(string)'
     | single_bool.contains("foo")
     | ....................^`,
      },
      {
        in: `single_string.endsWith("foo")`,
        out: `single_string LIKE CONCAT('%', $1)`,
        vars: ['foo'],
      },
      {
        in: `single_double.endsWith("foo")`,
        err: `ERROR: <input>:1:23: found no matching overload for 'endsWith' applied to 'double.(string)'
     | single_double.endsWith("foo")
     | ......................^`,
      },
      {
        in: `single_string.startsWith("foo")`,
        out: `single_string LIKE CONCAT($1, '%')`,
        vars: ['foo'],
      },
      {
        in: `single_int64.startsWith("foo")`,
        err: `ERROR: <input>:1:24: found no matching overload for 'startsWith' applied to 'int.(string)'
     | single_int64.startsWith("foo")
     | .......................^`,
      },

      // Collections operators
      {
        in: `1 in [1, 2, 3]`,
        out: `$1 IN ($2, $3, $4)`,
        vars: [1n, 1n, 2n, 3n],
      },
      {
        in: `1 in repeated_int64`,
        out: `$1 IN repeated_int64`,
        vars: [1n],
      },
      {
        in: `1 in single_int64`,
        err: `ERROR: <input>:1:3: found no matching overload for '@in' applied to '(int, int)'
     | 1 in single_int64
     | ..^`,
      },
      {
        in: `single_int64 in [7, 8, 9]`,
        out: `single_int64 IN ($1, $2, $3)`,
        vars: [7n, 8n, 9n],
      },

      // Duration conversions
      {
        in: `duration('0.000000001s') == duration('62s')`,
        out: `INTERVAL '1 SECOND' * $1 = INTERVAL '1 SECOND' * $2`,
        vars: [0.000000001, 62],
      },

      // Timestamp conversions
      {
        in: `timestamp('2023-10-01T00:00:00Z') == timestamp('2023-10-01T00:00:01Z')`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' = TIMESTAMP '2023-10-01T00:00:01.000Z'`,
      },
    ];
    for (const tc of testCases) {
      it(`should convert "${tc.in}"`, () => {
        if (tc.out) {
          const out = sql(tc.in, env);
          expect(out.sql).toEqual(tc.out);
          if (tc.vars) {
            expect(out.vars).toEqual(tc.vars);
          }
        } else if (tc.err) {
          expect(() => sql(tc.in, env)).toThrow(
            tc.err
              .split('\n')
              .map((line) => line.trim())
              .join('\n ')
          );
        } else {
          throw new Error('Test case must have either "out" or "err" property');
        }
      });
    }
  });
});
