import { declareContextProto } from '@bearclaw/cel';
import { TestAllTypesSchema } from '@buf/google_cel-spec.bufbuild_es/cel/expr/conformance/proto3/test_all_types_pb.js';
import { sql } from './celql.js';
import { Dialect } from './dialect.js';
import { CelqlEnv } from './env.js';

const DEFAULT_DIALECT = new Dialect();

describe('celql', () => {
  describe('sql()', () => {
    const env = new CelqlEnv(declareContextProto(TestAllTypesSchema));
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

      // Indexing
      {
        in: `repeated_int64[0] == 1`,
        out: `repeated_int64[$1] = $2`,
        vars: [0n, 1n],
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
      {
        in: `size(b"foo") == 3`,
        out: `LENGTH($1) = $2`,
        vars: [new TextEncoder().encode('foo'), 3n],
      },
      {
        in: `size(single_bytes) == 3`,
        out: `LENGTH(single_bytes) = $1`,
        vars: [3n],
      },
      {
        in: `b"foo".size() == 3`,
        out: `LENGTH($1) = $2`,
        vars: [new TextEncoder().encode('foo'), 3n],
      },
      {
        in: `single_bytes.size() == 3`,
        out: `LENGTH(single_bytes) = $1`,
        vars: [3n],
      },
      {
        in: `size([1, 2, 3]) == 3`,
        out: `ARRAY_LENGTH(($1, $2, $3), 1) = $4`,
        vars: [1n, 2n, 3n, 3n],
      },
      {
        in: `size(repeated_int64) == 3`,
        out: `ARRAY_LENGTH(repeated_int64, 1) = $1`,
        vars: [3n],
      },
      {
        in: `[1, 2, 3].size() == 3`,
        out: `ARRAY_LENGTH(($1, $2, $3), 1) = $4`,
        vars: [1n, 2n, 3n, 3n],
      },
      {
        in: `repeated_int64.size() == 3`,
        out: `ARRAY_LENGTH(repeated_int64, 1) = $1`,
        vars: [3n],
      },
      {
        in: `size("foo") == 3`,
        out: `CHAR_LENGTH($1) = $2`,
        vars: ['foo', 3n],
      },
      {
        in: `single_string.size() == 3`,
        out: `CHAR_LENGTH(single_string) = $1`,
        vars: [3n],
      },
      {
        in: `"foo".size() == 3`,
        out: `CHAR_LENGTH($1) = $2`,
        vars: ['foo', 3n],
      },
      {
        in: `single_string.size() == 3`,
        out: `CHAR_LENGTH(single_string) = $1`,
        vars: [3n],
      },

      // Bool conversions
      {
        in: `bool(true) == true`,
        out: `CAST($1 AS BOOL) = $2`,
        vars: [true, true],
      },
      {
        in: `bool(single_bool) == true`,
        out: `CAST(single_bool AS BOOL) = $1`,
        vars: [true],
      },
      {
        in: `bool('true') == true`,
        out: `CAST($1 AS BOOL) = $2`,
        vars: ['true', true],
      },
      {
        in: `bool(single_string) == true`,
        out: `CAST(single_string AS BOOL) = $1`,
      },
      {
        in: `bool(123) == true`,
        err: `ERROR: <input>:1:5: found no matching overload for 'bool' applied to '(int)'
     | bool(123) == true
     | ....^`,
      },

      // Bytes conversions
      {
        in: `bytes(b'foo') == b'bar'`,
        out: `CAST($1 AS BYTEA) = $2`,
        vars: [new TextEncoder().encode('foo'), new TextEncoder().encode('bar')],
      },
      {
        in: `bytes(single_bytes) == b'bar'`,
        out: `CAST(single_bytes AS BYTEA) = $1`,
        vars: [new TextEncoder().encode('bar')],
      },
      {
        in: `bytes('foo') == b'bar'`,
        out: `CAST($1 AS BYTEA) = $2`,
        vars: ['foo', new TextEncoder().encode('bar')],
      },
      {
        in: `bytes(single_string) == b'bar'`,
        out: `CAST(single_string AS BYTEA) = $1`,
        vars: [new TextEncoder().encode('bar')],
      },
      {
        in: `bytes(123) == b'bar'`,
        err: `ERROR: <input>:1:6: found no matching overload for 'bytes' applied to '(int)'
     | bytes(123) == b'bar'
     | .....^`,
      },

      // Double conversions
      {
        in: `double(1.0) == 2.0`,
        out: `CAST($1 AS NUMERIC) = $2`,
        vars: [1, 2],
      },
      {
        in: `double(single_double) == 2.0`,
        out: `CAST(single_double AS NUMERIC) = $1`,
        vars: [2],
      },
      {
        in: `double(1) == 2.0`,
        out: `CAST($1 AS NUMERIC) = $2`,
        vars: [1n, 2],
      },
      {
        in: `double(single_int64) == 2.0`,
        out: `CAST(single_int64 AS NUMERIC) = $1`,
        vars: [2],
      },
      {
        in: `double('1.0') == 2.0`,
        out: `CAST($1 AS NUMERIC) = $2`,
        vars: ['1.0', 2],
      },
      {
        in: `double(single_string) == 2.0`,
        out: `CAST(single_string AS NUMERIC) = $1`,
        vars: [2],
      },
      {
        in: `double(1u) == 2.0`,
        out: `CAST($1 AS NUMERIC) = $2`,
        vars: [1n, 2],
      },
      {
        in: `double(single_uint64) == 2.0`,
        out: `CAST(single_uint64 AS NUMERIC) = $1`,
        vars: [2],
      },
      {
        in: `double(true) == 2.0`,
        err: `ERROR: <input>:1:7: found no matching overload for 'double' applied to '(bool)'
     | double(true) == 2.0
     | ......^`,
      },

      // Duration conversions
      {
        in: `duration('0.000000001s') == duration('62s')`,
        out: `INTERVAL '1 SECOND' * $1 = INTERVAL '1 SECOND' * $2`,
        vars: [0.000000001, 62],
      },
      {
        in: `duration(single_duration) == duration(duration('62s'))`,
        out: `single_duration = INTERVAL '1 SECOND' * $1`,
        vars: [62],
      },
      {
        in: `duration(true) == duration('62s')`,
        err: `ERROR: <input>:1:9: found no matching overload for 'duration' applied to '(bool)'
     | duration(true) == duration('62s')
     | ........^`,
      },

      // Int conversions
      {
        in: `int(1) == 2`,
        out: `CAST($1 AS BIGINT) = $2`,
        vars: [1n, 2n],
      },
      {
        in: `int(single_int64) == 2`,
        out: `CAST(single_int64 AS BIGINT) = $1`,
        vars: [2n],
      },
      {
        in: `int(1.0) == 2`,
        out: `CAST($1 AS BIGINT) = $2`,
        vars: [1, 2n],
      },
      {
        in: `int(single_double) == 2`,
        out: `CAST(single_double AS BIGINT) = $1`,
        vars: [2n],
      },
      {
        in: `int('1') == 2`,
        out: `CAST($1 AS BIGINT) = $2`,
        vars: ['1', 2n],
      },
      {
        in: `int(single_string) == 2`,
        out: `CAST(single_string AS BIGINT) = $1`,
        vars: [2n],
      },
      {
        in: `int(2u) == 2`,
        out: `CAST($1 AS BIGINT) = $2`,
        vars: [2n, 2n],
      },
      {
        in: `int(single_uint64) == 2`,
        out: `CAST(single_uint64 AS BIGINT) = $1`,
        vars: [2n],
      },
      {
        in: `int(true) == 2`,
        err: `ERROR: <input>:1:4: found no matching overload for 'int' applied to '(bool)'
     | int(true) == 2
     | ...^`,
      },

      // String conversions
      {
        in: `string('foo') == 'bar'`,
        out: `CAST($1 AS TEXT) = $2`,
        vars: ['foo', 'bar'],
      },
      {
        in: `string(single_string) == 'bar'`,
        out: `CAST(single_string AS TEXT) = $1`,
        vars: ['bar'],
      },
      {
        in: `string(true) == 'bar'`,
        out: `CAST($1 AS TEXT) = $2`,
        vars: [true, 'bar'],
      },
      {
        in: `string(single_bool) == 'bar'`,
        out: `CAST(single_bool AS TEXT) = $1`,
        vars: ['bar'],
      },
      {
        in: `string(b"foo") == 'bar'`,
        out: `CAST($1 AS TEXT) = $2`,
        vars: [new TextEncoder().encode('foo'), 'bar'],
      },
      {
        in: `string(single_bytes) == 'bar'`,
        out: `CAST(single_bytes AS TEXT) = $1`,
        vars: ['bar'],
      },
      {
        in: `string(1.0) == 'bar'`,
        out: `CAST($1 AS TEXT) = $2`,
        vars: [1, 'bar'],
      },
      {
        in: `string(single_double) == 'bar'`,
        out: `CAST(single_double AS TEXT) = $1`,
        vars: ['bar'],
      },
      {
        in: `string(1) == 'bar'`,
        out: `CAST($1 AS TEXT) = $2`,
        vars: [1n, 'bar'],
      },
      {
        in: `string(single_int64) == 'bar'`,
        out: `CAST(single_int64 AS TEXT) = $1`,
        vars: ['bar'],
      },
      {
        in: `string(1u) == 'bar'`,
        out: `CAST($1 AS TEXT) = $2`,
        vars: [1n, 'bar'],
      },
      {
        in: `string(single_uint64) == 'bar'`,
        out: `CAST(single_uint64 AS TEXT) = $1`,
        vars: ['bar'],
      },
      {
        in: `string([]) == 'bar'`,
        err: `ERROR: <input>:1:7: found no matching overload for 'string' applied to '(list(dyn))'
     | string([]) == 'bar'
     | ......^`,
      },

      // Timestamp conversions
      {
        in: `timestamp('2023-10-01T00:00:00Z') == timestamp('2023-10-01T00:00:01Z')`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' = TIMESTAMP '2023-10-01T00:00:01.000Z'`,
      },
      {
        in: `timestamp(single_timestamp) == timestamp('2023-10-01T00:00:01Z')`,
        out: `single_timestamp = TIMESTAMP '2023-10-01T00:00:01.000Z'`,
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z', 'America/Los_Angeles') == timestamp(single_timestamp, 'America/New_York')`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1 = single_timestamp AT TIME ZONE $2`,
        vars: ['America/Los_Angeles', 'America/New_York'],
      },
      {
        in: `timestamp(true) == timestamp('2023-10-01T00:00:01Z')`,
        err: `ERROR: <input>:1:10: found no matching overload for 'timestamp' applied to '(bool)'
     | timestamp(true) == timestamp('2023-10-01T00:00:01Z')
     | .........^`,
      },

      // Uint conversions
      {
        in: `uint(1u) == 2u`,
        out: `CAST($1 AS BIGINT) = $2`,
        vars: [1n, 2n],
      },
      {
        in: `uint(single_uint64) == 2u`,
        out: `CAST(single_uint64 AS BIGINT) = $1`,
        vars: [2n],
      },
      {
        in: `uint(1) == 2u`,
        out: `CAST($1 AS BIGINT) = $2`,
        vars: [1n, 2n],
      },
      {
        in: `uint(single_int64) == 2u`,
        out: `CAST(single_int64 AS BIGINT) = $1`,
        vars: [2n],
      },
      {
        in: `uint(1.0) == 2u`,
        out: `CAST($1 AS BIGINT) = $2`,
        vars: [1, 2n],
      },
      {
        in: `uint(single_double) == 2u`,
        out: `CAST(single_double AS BIGINT) = $1`,
        vars: [2n],
      },
      {
        in: `uint('1') == 2u`,
        out: `CAST($1 AS BIGINT) = $2`,
        vars: ['1', 2n],
      },
      {
        in: `uint(single_string) == 2u`,
        out: `CAST(single_string AS BIGINT) = $1`,
        vars: [2n],
      },
      {
        in: `uint(true) == 2u`,
        err: `ERROR: <input>:1:5: found no matching overload for 'uint' applied to '(bool)'
     | uint(true) == 2u
     | ....^`,
      },

      // String functions
      {
        in: `"foobar".contains("foo")`,
        out: `$1 LIKE CONCAT('%', $2, '%')`,
        vars: ['foobar', 'foo'],
      },
      {
        in: `"FoObAr".contains("foo", true)`,
        out: `$1 ILIKE CONCAT('%', $2, '%')`,
        vars: ['FoObAr', 'foo'],
      },
      {
        in: `"FoObAr".contains("foo", false)`,
        out: `$1 LIKE CONCAT('%', $2, '%')`,
        vars: ['FoObAr', 'foo'],
      },
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
        in: `"foobar".endsWith("foo")`,
        out: `$1 LIKE CONCAT('%', $2)`,
        vars: ['foobar', 'foo'],
      },
      {
        in: `"FoObAr".endsWith("foo", true)`,
        out: `$1 ILIKE CONCAT('%', $2)`,
        vars: ['FoObAr', 'foo'],
      },
      {
        in: `"FoObAr".endsWith("foo", false)`,
        out: `$1 LIKE CONCAT('%', $2)`,
        vars: ['FoObAr', 'foo'],
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
        in: `"foobar".startsWith("foo")`,
        out: `$1 LIKE CONCAT($2, '%')`,
        vars: ['foobar', 'foo'],
      },
      {
        in: `"FoObAr".startsWith("foo", true)`,
        out: `$1 ILIKE CONCAT($2, '%')`,
        vars: ['FoObAr', 'foo'],
      },
      {
        in: `"FoObAr".startsWith("foo", false)`,
        out: `$1 LIKE CONCAT($2, '%')`,
        vars: ['FoObAr', 'foo'],
      },
      {
        in: `single_int64.startsWith("foo")`,
        err: `ERROR: <input>:1:24: found no matching overload for 'startsWith' applied to 'int.(string)'
     | single_int64.startsWith("foo")
     | .......................^`,
      },

      // Timestamp / duration functions
      {
        in: `now() == timestamp('2023-10-01T00:00:00Z')`,
        out: `NOW() = TIMESTAMP '2023-10-01T00:00:00.000Z'`,
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getFullYear() == 2023`,
        out: `EXTRACT(YEAR FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = $1`,
        vars: [2023n],
      },
      {
        in: `single_timestamp.getFullYear() == 2023`,
        out: `EXTRACT(YEAR FROM single_timestamp) = $1`,
        vars: [2023n],
      },
      {
        in: `now().getFullYear() == 2023`,
        out: `EXTRACT(YEAR FROM NOW()) = $1`,
        vars: [2023n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getFullYear('America/New_York') == 2023`,
        out: `EXTRACT(YEAR FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 2023n],
      },
      {
        in: `single_timestamp.getFullYear('America/New_York') == 2023`,
        out: `EXTRACT(YEAR FROM single_timestamp AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 2023n],
      },
      {
        in: `now().getFullYear('America/New_York') == 2023`,
        out: `EXTRACT(YEAR FROM NOW() AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 2023n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getMonth() == 10`,
        out: `EXTRACT(MONTH FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = $1`,
        vars: [10n],
      },
      {
        in: `single_timestamp.getMonth() == 10`,
        out: `EXTRACT(MONTH FROM single_timestamp) = $1`,
        vars: [10n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getMonth('America/New_York') == 10`,
        out: `EXTRACT(MONTH FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 10n],
      },
      {
        in: `single_timestamp.getMonth('America/New_York') == 10`,
        out: `EXTRACT(MONTH FROM single_timestamp AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 10n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getDayOfYear() == 1`,
        out: `EXTRACT(DOY FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = $1`,
        vars: [1n],
      },
      {
        in: `single_timestamp.getDayOfYear() == 1`,
        out: `EXTRACT(DOY FROM single_timestamp) = $1`,
        vars: [1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getDayOfYear('America/New_York') == 1`,
        out: `EXTRACT(DOY FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `single_timestamp.getDayOfYear('America/New_York') == 1`,
        out: `EXTRACT(DOY FROM single_timestamp AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getDate() == 1`,
        out: `EXTRACT(DAY FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = $1`,
        vars: [1n],
      },
      {
        in: `single_timestamp.getDate() == 1`,
        out: `EXTRACT(DAY FROM single_timestamp) = $1`,
        vars: [1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getDate('America/New_York') == 1`,
        out: `EXTRACT(DAY FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `single_timestamp.getDate('America/New_York') == 1`,
        out: `EXTRACT(DAY FROM single_timestamp AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getDayOfWeek() == 1`,
        out: `EXTRACT(DOW FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = $1`,
        vars: [1n],
      },
      {
        in: `single_timestamp.getDayOfWeek() == 1`,
        out: `EXTRACT(DOW FROM single_timestamp) = $1`,
        vars: [1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getDayOfWeek('America/New_York') == 1`,
        out: `EXTRACT(DOW FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `single_timestamp.getDayOfWeek('America/New_York') == 1`,
        out: `EXTRACT(DOW FROM single_timestamp AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getHours() == 1`,
        out: `EXTRACT(HOUR FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = $1`,
        vars: [1n],
      },
      {
        in: `single_timestamp.getHours() == 1`,
        out: `EXTRACT(HOUR FROM single_timestamp) = $1`,
        vars: [1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getHours('America/New_York') == 1`,
        out: `EXTRACT(HOUR FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `single_timestamp.getHours('America/New_York') == 1`,
        out: `EXTRACT(HOUR FROM single_timestamp AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getMinutes() == 1`,
        out: `EXTRACT(MINUTE FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = $1`,
        vars: [1n],
      },
      {
        in: `single_timestamp.getMinutes() == 1`,
        out: `EXTRACT(MINUTE FROM single_timestamp) = $1`,
        vars: [1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getMinutes('America/New_York') == 1`,
        out: `EXTRACT(MINUTE FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `single_timestamp.getMinutes('America/New_York') == 1`,
        out: `EXTRACT(MINUTE FROM single_timestamp AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getSeconds() == 1`,
        out: `EXTRACT(SECOND FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = $1`,
        vars: [1n],
      },
      {
        in: `single_timestamp.getSeconds() == 1`,
        out: `EXTRACT(SECOND FROM single_timestamp) = $1`,
        vars: [1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getSeconds('America/New_York') == 1`,
        out: `EXTRACT(SECOND FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `single_timestamp.getSeconds('America/New_York') == 1`,
        out: `EXTRACT(SECOND FROM single_timestamp AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getMilliseconds() == 1`,
        out: `EXTRACT(MILLISECONDS FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = $1`,
        vars: [1n],
      },
      {
        in: `single_timestamp.getMilliseconds() == 1`,
        out: `EXTRACT(MILLISECONDS FROM single_timestamp) = $1`,
        vars: [1n],
      },
      {
        in: `timestamp('2023-10-01T00:00:00Z').getMilliseconds('America/New_York') == 1`,
        out: `EXTRACT(MILLISECONDS FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        in: `single_timestamp.getMilliseconds('America/New_York') == 1`,
        out: `EXTRACT(MILLISECONDS FROM single_timestamp AT TIME ZONE $1) = $2`,
        vars: ['America/New_York', 1n],
      },
      {
        // Timestamp columsn without timezone need to be converted to UTC first
        in: `timestamp(timestamp(single_timestamp, 'UTC'), 'America/New_York') == timestamp('2023-10-01T00:00:00Z')`,
        out: `single_timestamp AT TIME ZONE $1 AT TIME ZONE $2 = TIMESTAMP '2023-10-01T00:00:00.000Z'`,
        vars: ['UTC', 'America/New_York'],
      },

      // Date conversions
      {
        in: `date('2023-10-01') == date('2023-10-01')`,
        out: `DATE($1) = DATE($2)`,
        vars: ['2023-10-01', '2023-10-01'],
      },
      {
        in: `date(date('2023-10-01')) == date('2023-10-01')`,
        out: `DATE($1) = DATE($2)`,
        vars: ['2023-10-01', '2023-10-01'],
      },
      {
        in: `date(single_timestamp) == date('2023-10-01')`,
        out: `DATE(single_timestamp) = DATE($1)`,
        vars: ['2023-10-01'],
      },
      {
        in: `date(single_timestamp) == date(timestamp('2023-10-01T00:00:00Z', 'America/New_York'))`,
        out: `DATE(single_timestamp) = DATE(TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1)`,
        vars: ['America/New_York'],
      },
      {
        in: `date(timestamp(single_timestamp, 'America/New_York')) == date('2023-10-01')`,
        out: `DATE(single_timestamp AT TIME ZONE $1) = DATE($2)`,
        vars: ['America/New_York', '2023-10-01'],
      },
      {
        in: `date(timestamp(timestamp(single_timestamp, 'UTC'), 'America/New_York')) == date('2023-10-01')`,
        out: `DATE(single_timestamp AT TIME ZONE $1 AT TIME ZONE $2) = DATE($3)`,
        vars: ['UTC', 'America/New_York', '2023-10-01'],
      },
      // Timestamp timezone conversion
      {
        in: `timestamp('2023-10-01T00:00:00Z').atTimeZone('America/New_York') == timestamp('2023-10-01T00:00:00Z')`,
        out: `TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1 = TIMESTAMP '2023-10-01T00:00:00.000Z'`,
        vars: ['America/New_York'],
      },
      {
        in: `single_timestamp.atTimeZone('America/New_York') == timestamp('2023-10-01T00:00:00Z')`,
        out: `single_timestamp AT TIME ZONE $1 = TIMESTAMP '2023-10-01T00:00:00.000Z'`,
        vars: ['America/New_York'],
      },
      {
        in: `single_timestamp.atTimeZone('UTC').atTimeZone('America/New_York') == timestamp('2023-10-01T00:00:00Z')`,
        out: `single_timestamp AT TIME ZONE $1 AT TIME ZONE $2 = TIMESTAMP '2023-10-01T00:00:00.000Z'`,
        vars: ['UTC', 'America/New_York'],
      },
      {
        in: `date(single_timestamp.atTimeZone('America/New_York')) == date('2023-10-01')`,
        out: `DATE(single_timestamp AT TIME ZONE $1) = DATE($2)`,
        vars: ['America/New_York', '2023-10-01'],
      },

      // String formatting
      {
        in: `'foo'.lower() == 'bar'`,
        out: `LOWER($1) = $2`,
        vars: ['foo', 'bar'],
      },
      {
        in: `single_string.lower() == 'bar'`,
        out: `LOWER(single_string) = $1`,
        vars: ['bar'],
      },
      {
        in: `123.lower()`,
        err: `ERROR: <input>:1:10: found no matching overload for 'lower' applied to 'int.()'
     | 123.lower()
     | .........^`,
      },
      {
        in: `'foo'.upper() == 'bar'`,
        out: `UPPER($1) = $2`,
        vars: ['foo', 'bar'],
      },
      {
        in: `single_string.upper() == 'bar'`,
        out: `UPPER(single_string) = $1`,
        vars: ['bar'],
      },
      {
        in: `123.upper()`,
        err: `ERROR: <input>:1:10: found no matching overload for 'upper' applied to 'int.()'
      | 123.upper()
      | .........^`,
      },
      {
        in: `' foo '.trim() == 'bar'`,
        out: `TRIM($1) = $2`,
        vars: [' foo ', 'bar'],
      },
      {
        in: `single_string.trim() == 'bar'`,
        out: `TRIM(single_string) = $1`,
        vars: ['bar'],
      },
      {
        in: `123.trim()`,
        err: `ERROR: <input>:1:9: found no matching overload for 'trim' applied to 'int.()'
     | 123.trim()
     | ........^`,
      },
      {
        in: `' foo '.trim().upper().lower().size() == 3`,
        out: `CHAR_LENGTH(LOWER(UPPER(TRIM($1)))) = $2`,
        vars: [' foo ', 3n],
      },

      // String functions
      {
        in: `single_string.like("foo")`,
        out: `single_string LIKE $1`,
        vars: ['foo'],
      },
      {
        in: `"foobar".like("foo")`,
        out: `$1 LIKE $2`,
        vars: ['foobar', 'foo'],
      },
      {
        in: `"FoObAr".like("foo", true)`,
        out: `$1 ILIKE $2`,
        vars: ['FoObAr', 'foo'],
      },
      {
        in: `"FoObAr".like("foo", false)`,
        out: `$1 LIKE $2`,
        vars: ['FoObAr', 'foo'],
      },
      {
        in: `single_int64.like("foo")`,
        err: `ERROR: <input>:1:18: found no matching overload for 'like' applied to 'int.(string)'
   | single_int64.like("foo")
   | .................^`,
      },
      {
        in: `!single_string.like("foo")`,
        out: `NOT single_string LIKE $1`,
        vars: ['foo'],
      },
      {
        in: `!single_string.like("foo", true)`,
        out: `NOT (single_string ILIKE $1)`,
        vars: ['foo'],
      },
      {
        in: `!single_string.like("foo", false)`,
        out: `NOT (single_string LIKE $1)`,
        vars: ['foo'],
      },
    ];
    for (const tc of testCases) {
      it(`should convert "${tc.in}"`, () => {
        if (tc.out) {
          const out = sql(tc.in, env, DEFAULT_DIALECT);
          expect(out.sql).toEqual(tc.out);
          if (tc.vars) {
            expect(out.vars).toEqual(tc.vars);
          }
        } else if (tc.err) {
          expect(() => sql(tc.in, env, DEFAULT_DIALECT)).toThrow(
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

    it('should be fast', () => {
      const iterations = 10000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        sql('single_string.startsWith("foo") && single_int64 > 2', env, DEFAULT_DIALECT);
      }
      const end = performance.now();
      const elapsed = end - start;
      const iterTime = elapsed / iterations;
      const opsPerSecond = Math.floor(1000 / iterTime);
      console.log(`Average time: ${iterTime.toFixed(3)} ms`);
      console.log(`Ops/sec: ${opsPerSecond}`);
      expect(iterTime).toBeLessThan(1);
      expect(opsPerSecond).toBeGreaterThan(1000);
    });
  });
});
