import { declareContextProto } from '@bearclaw/cel';
import { TestAllTypesSchema } from '@buf/google_cel-spec.bufbuild_es/cel/expr/conformance/proto3/test_all_types_pb.js';
import { formatError } from '../test-helpers.js';
import { DefaultEnv } from './env.js';
import { defaultSql } from './index.js';

describe('Default Dialect', () => {
  const env = new DefaultEnv(declareContextProto(TestAllTypesSchema));
  const testCases: { in: string; out?: string; err?: string; vars?: unknown[] }[] = [
    // Addition of non-numbers
    {
      in: `'abc' + 'def' == true`,
      out: `$1 || $2 = $3`,
      vars: ['abc', 'def', true],
    },
    {
      in: `single_string + single_string == true`,
      out: `single_string || single_string = $1`,
      vars: [true],
    },
    {
      in: `b'abc' + b'def' == true`,
      out: `$1 || $2 = $3`,
      vars: [new TextEncoder().encode('abc'), new TextEncoder().encode('def'), true],
    },
    {
      in: `single_bytes + single_bytes == true`,
      out: `single_bytes || single_bytes = $1`,
      vars: [true],
    },
    {
      in: `[1, 2] + [3, 4] == true`,
      out: `ARRAY[$1, $2] || ARRAY[$3, $4] = $5`,
      vars: [1n, 2n, 3n, 4n, true],
    },
    {
      in: `repeated_int64 + repeated_int64 == true`,
      out: `repeated_int64 || repeated_int64 = $1`,
      vars: [true],
    },

    // Type Casting
    {
      // Unnecessary type casting should be ignored
      in: `bool(true)`,
      out: `$1`,
      vars: [true],
    },
    {
      // Unnecessary type casting should be ignored
      in: `bool(single_bool)`,
      out: `single_bool`,
      vars: [],
    },
    {
      in: `bool('true')`,
      out: `CAST($1 AS BOOLEAN)`,
      vars: ['true'],
    },
    {
      in: `bool(single_string)`,
      out: `CAST(single_string AS BOOLEAN)`,
      vars: [],
    },
    {
      in: `bool(1)`,
      err: `ERROR: <input>:1:5: found no matching overload for 'bool' applied to '(int)'
     | bool(1)
     | ....^`,
    },
    {
      // Unnecessary type casting should be ignored
      in: `bytes(b'abc') == true`,
      out: `$1 = $2`,
      vars: [new TextEncoder().encode('abc'), true],
    },
    {
      in: `bytes(single_bytes) == true`,
      out: `single_bytes = $1`,
      vars: [true],
    },
    {
      in: `bytes('abc') == false`,
      out: `CAST($1 AS VARBINARY) = $2`,
      vars: ['abc', false],
    },
    {
      in: `bytes(single_string) == true`,
      out: `CAST(single_string AS VARBINARY) = $1`,
      vars: [true],
    },
    {
      in: `bytes(1) == true`,
      err: `ERROR: <input>:1:6: found no matching overload for 'bytes' applied to '(int)'
     | bytes(1) == true
     | .....^`,
    },
    {
      // Unnecessary type casting should be ignored
      in: `date(date(date('2023-01-01'))) == true`,
      out: `CAST($1 AS DATE) = $2`,
      vars: ['2023-01-01', true],
    },
    {
      in: `date('2023-01-01') == true`,
      out: `CAST($1 AS DATE) = $2`,
      vars: ['2023-01-01', true],
    },
    {
      in: `date(single_string) == true`,
      out: `CAST(single_string AS DATE) = $1`,
      vars: [true],
    },
    {
      in: `date(timestamp('2023-01-01T12:34:56Z')) == true`,
      out: `CAST(TIMESTAMP '2023-01-01T12:34:56.000Z' AS DATE) = $1`,
      vars: [true],
    },
    {
      in: `date(single_timestamp) == true`,
      out: `CAST(single_timestamp AS DATE) = $1`,
      vars: [true],
    },
    {
      in: `date(timestamp('2023-01-01T12:34:56Z', 'America/New_York')) == true`,
      out: `CAST(TIMESTAMP '2023-01-01T12:34:56.000Z' AT TIME ZONE $1 AS DATE) = $2`,
      vars: ['America/New_York', true],
    },
    {
      in: `date(timestamp(single_timestamp, 'America/New_York')) == true`,
      out: `CAST(single_timestamp AT TIME ZONE $1 AS DATE) = $2`,
      vars: ['America/New_York', true],
    },
    {
      in: `date(1) == true`,
      err: `ERROR: <input>:1:5: found no matching overload for 'date' applied to '(int)'
     | date(1) == true
     | ....^`,
    },
    {
      // Unnecessary type casting should be ignored
      in: `double(1.23) == true`,
      out: `$1 = $2`,
      vars: [1.23, true],
    },
    {
      // Unnecessary type casting should be ignored
      in: `double(single_double) == true`,
      out: `single_double = $1`,
      vars: [true],
    },
    {
      in: `double(1) == false`,
      out: `CAST($1 AS DOUBLE PRECISION) = $2`,
      vars: [1n, false],
    },
    {
      in: `double(single_int64) == true`,
      out: `CAST(single_int64 AS DOUBLE PRECISION) = $1`,
      vars: [true],
    },
    {
      in: `double('1.23') == true`,
      out: `CAST($1 AS DOUBLE PRECISION) = $2`,
      vars: ['1.23', true],
    },
    {
      in: `double(single_string) == false`,
      out: `CAST(single_string AS DOUBLE PRECISION) = $1`,
      vars: [false],
    },
    {
      in: `double(2u) == false`,
      out: `CAST($1 AS DOUBLE PRECISION) = $2`,
      vars: [2n, false],
    },
    {
      in: `double(single_uint64) == true`,
      out: `CAST(single_uint64 AS DOUBLE PRECISION) = $1`,
      vars: [true],
    },
    {
      in: `double(b"abc") == true`,
      err: `ERROR: <input>:1:7: found no matching overload for 'double' applied to '(bytes)'
     | double(b"abc") == true
     | ......^`,
    },
    {
      // Unnecessary type casting should be ignored
      in: `duration(duration(duration('42s'))) == true`,
      out: `INTERVAL '1 SECOND' * $1 = $2`,
      vars: [42, true],
    },

    {
      // Unnecessary type casting should be ignored
      in: `duration(single_duration) == true`,
      out: `single_duration = $1`,
      vars: [true],
    },
    {
      in: `duration('42s') == true`,
      out: `INTERVAL '1 SECOND' * $1 = $2`,
      vars: [42, true],
    },
    {
      in: `duration(single_string) == true`,
      out: `INTERVAL '1 SECOND' * CAST(single_string AS DOUBLE PRECISION) = $1`,
      vars: [true],
    },
    {
      in: `duration('42.123456789s') == false`,
      out: `INTERVAL '1 SECOND' * $1 = $2`,
      vars: [42.123456789, false],
    },
    {
      in: `duration(42) == true`,
      out: `INTERVAL '1 SECOND' * $1 = $2`,
      vars: [42n, true],
    },
    {
      in: `duration(single_int64) == true`,
      out: `INTERVAL '1 SECOND' * single_int64 = $1`,
      vars: [true],
    },
    {
      in: `duration(42.123456789) == false`,
      out: `INTERVAL '1 SECOND' * $1 = $2`,
      vars: [42.123456789, false],
    },
    {
      in: `duration(single_double) == true`,
      out: `INTERVAL '1 SECOND' * single_double = $1`,
      vars: [true],
    },
    {
      in: `duration(42u) == true`,
      out: `INTERVAL '1 SECOND' * $1 = $2`,
      vars: [42n, true],
    },
    {
      in: `duration(single_uint64) == true`,
      out: `INTERVAL '1 SECOND' * single_uint64 = $1`,
      vars: [true],
    },
    {
      in: `duration(true) == false`,
      err: `ERROR: <input>:1:9: found no matching overload for 'duration' applied to '(bool)'
     | duration(true) == false
     | ........^`,
    },
    {
      // Unnecessary type casting should be ignored
      in: `int(42) == true`,
      out: `$1 = $2`,
      vars: [42n, true],
    },
    {
      // Unnecessary type casting should be ignored
      in: `int(single_int64) == true`,
      out: `single_int64 = $1`,
      vars: [true],
    },
    {
      in: `int(42.123456789) == false`,
      out: `CAST($1 AS BIGINT) = $2`,
      vars: [42.123456789, false],
    },
    {
      in: `int(single_double) == true`,
      out: `CAST(single_double AS BIGINT) = $1`,
      vars: [true],
    },
    {
      in: `int('42') == true`,
      out: `CAST($1 AS BIGINT) = $2`,
      vars: ['42', true],
    },
    {
      in: `int(single_string) == false`,
      out: `CAST(single_string AS BIGINT) = $1`,
      vars: [false],
    },
    {
      in: `int(42u) == false`,
      out: `CAST($1 AS BIGINT) = $2`,
      vars: [42n, false],
    },
    {
      in: `int(single_uint64) == true`,
      out: `CAST(single_uint64 AS BIGINT) = $1`,
      vars: [true],
    },
    {
      in: `int(b"abc") == true`,
      err: `ERROR: <input>:1:4: found no matching overload for 'int' applied to '(bytes)'
     | int(b"abc") == true
     | ...^`,
    },
    {
      // Unnecessary type casting should be ignored
      in: `string('abc') == true`,
      out: `$1 = $2`,
      vars: ['abc', true],
    },
    {
      // Unnecessary type casting should be ignored
      in: `string(single_string) == true`,
      out: `single_string = $1`,
      vars: [true],
    },
    {
      in: `string(true) == false`,
      out: `CAST($1 AS VARCHAR) = $2`,
      vars: [true, false],
    },
    {
      in: `string(single_bool) == true`,
      out: `CAST(single_bool AS VARCHAR) = $1`,
      vars: [true],
    },
    {
      in: `string(b"abc") == true`,
      out: `CAST($1 AS VARCHAR) = $2`,
      vars: [new TextEncoder().encode('abc'), true],
    },
    {
      in: `string(single_bytes) == true`,
      out: `CAST(single_bytes AS VARCHAR) = $1`,
      vars: [true],
    },
    {
      in: `string(1.23) == false`,
      out: `CAST($1 AS VARCHAR) = $2`,
      vars: [1.23, false],
    },
    {
      in: `string(single_double) == true`,
      out: `CAST(single_double AS VARCHAR) = $1`,
      vars: [true],
    },
    {
      in: `string(42) == false`,
      out: `CAST($1 AS VARCHAR) = $2`,
      vars: [42n, false],
    },
    {
      in: `string(single_int64) == true`,
      out: `CAST(single_int64 AS VARCHAR) = $1`,
      vars: [true],
    },
    {
      in: `string(42u) == true`,
      out: `CAST($1 AS VARCHAR) = $2`,
      vars: [42n, true],
    },
    {
      in: `string(single_uint64) == true`,
      out: `CAST(single_uint64 AS VARCHAR) = $1`,
      vars: [true],
    },
    {
      // TODO: should we allow converting duration, timestamps, etc to string, double, int, or uint?
      in: `string(duration('42s')) == false`,
      err: `ERROR: <input>:1:7: found no matching overload for 'string' applied to '(duration)'
     | string(duration('42s')) == false
     | ......^`,
    },
    {
      // Unnecessary type casting should be ignored
      in: `time(time(time('12:34:56'))) == true`,
      out: `CAST($1 AS TIME) = $2`,
      vars: ['12:34:56', true],
    },
    {
      in: `time('12:34:56') == true`,
      out: `CAST($1 AS TIME) = $2`,
      vars: ['12:34:56', true],
    },
    {
      in: `time(single_string) == true`,
      out: `CAST(single_string AS TIME) = $1`,
      vars: [true],
    },
    {
      in: `time(timestamp('2023-01-01T12:34:56Z')) == true`,
      out: `CAST(TIMESTAMP '2023-01-01T12:34:56.000Z' AS TIME) = $1`,
      vars: [true],
    },
    {
      in: `time(single_timestamp) == true`,
      out: `CAST(single_timestamp AS TIME) = $1`,
      vars: [true],
    },
    {
      in: `time(timestamp('2023-01-01T12:34:56Z', 'America/New_York')) == true`,
      out: `CAST(TIMESTAMP '2023-01-01T12:34:56.000Z' AT TIME ZONE $1 AS TIME) = $2`,
      vars: ['America/New_York', true],
    },
    {
      in: `time(timestamp(single_timestamp, 'America/New_York')) == true`,
      out: `CAST(single_timestamp AT TIME ZONE $1 AS TIME) = $2`,
      vars: ['America/New_York', true],
    },
    {
      in: `time(42) == true`,
      err: `ERROR: <input>:1:5: found no matching overload for 'time' applied to '(int)'
     | time(42) == true
     | ....^`,
    },
    {
      // Unnecessary type casting should be ignored
      in: `timestamp(timestamp(timestamp('2023-01-01T12:34:56Z'))) == true`,
      out: `TIMESTAMP '2023-01-01T12:34:56.000Z' = $1`,
      vars: [true],
    },
    {
      // Unnecessary type casting should be ignored
      in: `timestamp(timestamp(timestamp(single_timestamp))) == true`,
      out: `single_timestamp = $1`,
      vars: [true],
    },
    {
      in: `timestamp(timestamp('2023-01-01T12:34:56Z'), 'America/New_York') == true`,
      out: `TIMESTAMP '2023-01-01T12:34:56.000Z' AT TIME ZONE $1 = $2`,
      vars: ['America/New_York', true],
    },
    {
      in: `timestamp(single_timestamp, 'America/New_York') == true`,
      out: `single_timestamp AT TIME ZONE $1 = $2`,
      vars: ['America/New_York', true],
    },
    {
      in: `timestamp('2023-01-01T12:34:56Z') == true`,
      out: `TIMESTAMP '2023-01-01T12:34:56.000Z' = $1`,
      vars: [true],
    },
    {
      in: `timestamp(single_string) == true`,
      out: `CAST(single_string AS TIMESTAMP) = $1`,
      vars: [true],
    },
    {
      in: `timestamp('2023-01-01T12:34:56Z', 'America/New_York') == true`,
      out: `TIMESTAMP '2023-01-01T12:34:56.000Z' AT TIME ZONE $1 = $2`,
      vars: ['America/New_York', true],
    },
    {
      in: `timestamp(single_string, 'America/New_York') == true`,
      out: `CAST(single_string AS TIMESTAMP WITH TIME ZONE) AT TIME ZONE $1 = $2`,
      vars: ['America/New_York', true],
    },
    {
      // TODO: should we allow converting double, int, and uint to timestamp?
      in: `timestamp(42) == true`,
      err: `ERROR: <input>:1:10: found no matching overload for 'timestamp' applied to '(int)'
     | timestamp(42) == true
     | .........^`,
    },
    {
      // Unnecessary type casting should be ignored
      in: `uint(42u) == true`,
      out: `$1 = $2`,
      vars: [42n, true],
    },
    {
      // Unnecessary type casting should be ignored
      in: `uint(single_uint64) == true`,
      out: `single_uint64 = $1`,
      vars: [true],
    },
    {
      in: `uint(42) == false`,
      out: `CAST($1 AS UNSIGNED BIGINT) = $2`,
      vars: [42n, false],
    },
    {
      in: `uint(single_int64) == true`,
      out: `CAST(single_int64 AS UNSIGNED BIGINT) = $1`,
      vars: [true],
    },
    {
      in: `uint(42.123456789) == true`,
      out: `CAST($1 AS UNSIGNED BIGINT) = $2`,
      vars: [42.123456789, true],
    },
    {
      in: `uint(single_double) == false`,
      out: `CAST(single_double AS UNSIGNED BIGINT) = $1`,
      vars: [false],
    },
    {
      in: `uint('42') == false`,
      out: `CAST($1 AS UNSIGNED BIGINT) = $2`,
      vars: ['42', false],
    },
    {
      in: `uint(single_string) == true`,
      out: `CAST(single_string AS UNSIGNED BIGINT) = $1`,
      vars: [true],
    },
    {
      in: `uint(false) == true`,
      err: `ERROR: <input>:1:5: found no matching overload for 'uint' applied to '(bool)'
     | uint(false) == true
     | ....^`,
    },

    // Find SQL Operator
    {
      in: `single_bool || single_bool`,
      out: `single_bool OR single_bool`,
    },
    {
      // Sanity to check to make sure variable ordering is correct
      in: `true || true || false || true || true || true`,
      out: `$1 OR $2 OR $3 OR $4 OR $5 OR $6`,
      vars: [true, true, false, true, true, true],
    },
    {
      in: `single_bool && single_bool`,
      out: `single_bool AND single_bool`,
    },
    {
      in: `single_bool == true`,
      out: `single_bool = $1`,
      vars: [true],
    },
    {
      in: `1 != single_int64`,
      out: `$1 <> single_int64`,
      vars: [1n],
    },
    {
      in: `single_bool in [true, false]`,
      out: `single_bool IN ARRAY[$1, $2]`,
      vars: [true, false],
    },
    {
      in: `!(single_bool || true)`,
      out: `NOT (single_bool OR $1)`,
      vars: [true],
    },

    // Indexing
    {
      in: `[1, 2, 3][0] == 1`,
      out: `ARRAY[$1, $2, $3][$4] = $5`,
      vars: [1n, 2n, 3n, 0n, 1n],
    },
    {
      in: `repeated_int64[0] == 1`,
      out: `repeated_int64[$1] = $2`,
      vars: [0n, 1n],
    },
    {
      in: `'a'[0] == 'a'`,
      err: `ERROR: <input>:1:4: found no matching overload for '_[_]' applied to '(string, int)'
     | 'a'[0] == 'a'
     | ...^`,
    },

    // Size
    {
      in: `size('abc') == 3`,
      out: `LENGTH($1) = $2`,
      vars: ['abc', 3n],
    },
    {
      in: `size(single_string) == 3`,
      out: `LENGTH(single_string) = $1`,
      vars: [3n],
    },
    {
      in: `'abc'.size() == 3`,
      out: `LENGTH($1) = $2`,
      vars: ['abc', 3n],
    },
    {
      in: `single_string.size() == 3`,
      out: `LENGTH(single_string) = $1`,
      vars: [3n],
    },
    {
      in: `size(b'abc') == 3`,
      out: `LENGTH($1) = $2`,
      vars: [new TextEncoder().encode('abc'), 3n],
    },
    {
      in: `size(single_bytes) == 3`,
      out: `LENGTH(single_bytes) = $1`,
      vars: [3n],
    },
    {
      in: `b'abc'.size() == 3`,
      out: `LENGTH($1) = $2`,
      vars: [new TextEncoder().encode('abc'), 3n],
    },
    {
      in: `single_bytes.size() == 3`,
      out: `LENGTH(single_bytes) = $1`,
      vars: [3n],
    },
    {
      in: `size([1, 2, 3]) == 3`,
      out: `CARDINALITY(ARRAY[$1, $2, $3]) = $4`,
      vars: [1n, 2n, 3n, 3n],
    },
    {
      in: `size(repeated_int64) == 3`,
      out: `CARDINALITY(repeated_int64) = $1`,
      vars: [3n],
    },
    {
      in: `[1, 2, 3].size() == 3`,
      out: `CARDINALITY(ARRAY[$1, $2, $3]) = $4`,
      vars: [1n, 2n, 3n, 3n],
    },
    {
      in: `repeated_int64.size() == 3`,
      out: `CARDINALITY(repeated_int64) = $1`,
      vars: [3n],
    },
    {
      in: `size(1) == 3`,
      err: `ERROR: <input>:1:5: found no matching overload for 'size' applied to '(int)'
     | size(1) == 3
     | ....^`,
    },
    {
      in: `1.size() == 3`,
      err: `ERROR: <input>:1:7: found no matching overload for 'size' applied to 'int.()'
     | 1.size() == 3
     | ......^`,
    },

    // String functions
    {
      in: `'abc'.contains('b')`,
      out: `$1 LIKE '%' || $2 || '%'`,
      vars: ['abc', 'b'],
    },
    {
      in: `single_string.contains('b')`,
      out: `single_string LIKE '%' || $1 || '%'`,
      vars: ['b'],
    },
    {
      in: `'aBc'.contains('b', true)`,
      out: `LOWER($1) LIKE LOWER('%' || $2 || '%')`,
      vars: ['aBc', 'b'],
    },
    {
      in: `single_string.contains('b', true)`,
      out: `LOWER(single_string) LIKE LOWER('%' || $1 || '%')`,
      vars: ['b'],
    },
    {
      in: `1.contains(2)`,
      err: `ERROR: <input>:1:11: found no matching overload for 'contains' applied to 'int.(int)'
     | 1.contains(2)
     | ..........^`,
    },
    {
      in: `1.contains(2, true)`,
      err: `ERROR: <input>:1:11: found no matching overload for 'contains' applied to 'int.(int, bool)'
     | 1.contains(2, true)
     | ..........^`,
    },
    {
      in: `'abc'.endsWith('c')`,
      out: `$1 LIKE '%' || $2`,
      vars: ['abc', 'c'],
    },
    {
      in: `single_string.endsWith('c')`,
      out: `single_string LIKE '%' || $1`,
      vars: ['c'],
    },
    {
      in: `'aBc'.endsWith('c', true)`,
      out: `LOWER($1) LIKE LOWER('%' || $2)`,
      vars: ['aBc', 'c'],
    },
    {
      in: `single_string.endsWith('c', true)`,
      out: `LOWER(single_string) LIKE LOWER('%' || $1)`,
      vars: ['c'],
    },
    {
      in: `1.endsWith(2)`,
      err: `ERROR: <input>:1:11: found no matching overload for 'endsWith' applied to 'int.(int)'
     | 1.endsWith(2)
     | ..........^`,
    },
    {
      in: `1.endsWith(2, true)`,
      err: `ERROR: <input>:1:11: found no matching overload for 'endsWith' applied to 'int.(int, bool)'
     | 1.endsWith(2, true)
     | ..........^`,
    },
    {
      in: `'abc'.startsWith('a')`,
      out: `$1 LIKE $2 || '%'`,
      vars: ['abc', 'a'],
    },
    {
      in: `single_string.startsWith('a')`,
      out: `single_string LIKE $1 || '%'`,
      vars: ['a'],
    },
    {
      in: `'aBc'.startsWith('a', true)`,
      out: `LOWER($1) LIKE LOWER($2 || '%')`,
      vars: ['aBc', 'a'],
    },
    {
      in: `single_string.startsWith('a', true)`,
      out: `LOWER(single_string) LIKE LOWER($1 || '%')`,
      vars: ['a'],
    },
    {
      in: `1.startsWith(2)`,
      err: `ERROR: <input>:1:13: found no matching overload for 'startsWith' applied to 'int.(int)'
     | 1.startsWith(2)
     | ............^`,
    },
    {
      in: `1.startsWith(2, true)`,
      err: `ERROR: <input>:1:13: found no matching overload for 'startsWith' applied to 'int.(int, bool)'
     | 1.startsWith(2, true)
     | ............^`,
    },
    {
      in: `'abc'.lower() == 'def'`,
      out: `LOWER($1) = $2`,
      vars: ['abc', 'def'],
    },
    {
      in: `single_string.lower() == 'def'`,
      out: `LOWER(single_string) = $1`,
      vars: ['def'],
    },
    {
      in: `1.lower() == 'def'`,
      err: `ERROR: <input>:1:8: found no matching overload for 'lower' applied to 'int.()'
     | 1.lower() == 'def'
     | .......^`,
    },
    {
      in: `single_int64.lower() == 'def'`,
      err: `ERROR: <input>:1:19: found no matching overload for 'lower' applied to 'int.()'
     | single_int64.lower() == 'def'
     | ..................^`,
    },
    {
      in: `'abc'.upper() == 'DEF'`,
      out: `UPPER($1) = $2`,
      vars: ['abc', 'DEF'],
    },
    {
      in: `single_string.upper() == 'DEF'`,
      out: `UPPER(single_string) = $1`,
      vars: ['DEF'],
    },
    {
      in: `1.upper() == 'DEF'`,
      err: `ERROR: <input>:1:8: found no matching overload for 'upper' applied to 'int.()'
     | 1.upper() == 'DEF'
     | .......^`,
    },
    {
      in: `single_int64.upper() == 'DEF'`,
      err: `ERROR: <input>:1:19: found no matching overload for 'upper' applied to 'int.()'
     | single_int64.upper() == 'DEF'
     | ..................^`,
    },
    {
      in: `'  abc  '.trim() == 'abc'`,
      out: `TRIM($1) = $2`,
      vars: ['  abc  ', 'abc'],
    },
    {
      in: `single_string.trim() == 'abc'`,
      out: `TRIM(single_string) = $1`,
      vars: ['abc'],
    },
    {
      in: `1.trim() == 'abc'`,
      err: `ERROR: <input>:1:7: found no matching overload for 'trim' applied to 'int.()'
     | 1.trim() == 'abc'
     | ......^`,
    },
    {
      in: `single_int64.trim() == 'abc'`,
      err: `ERROR: <input>:1:18: found no matching overload for 'trim' applied to 'int.()'
     | single_int64.trim() == 'abc'
     | .................^`,
    },
    {
      in: `'abc'.like('a%')`,
      out: `$1 LIKE $2`,
      vars: ['abc', 'a%'],
    },
    {
      in: `single_string.like('a%')`,
      out: `single_string LIKE $1`,
      vars: ['a%'],
    },
    {
      in: `'aBc'.like('a%', true)`,
      out: `LOWER($1) LIKE LOWER($2)`,
      vars: ['aBc', 'a%'],
    },
    {
      in: `'aBc'.lower().like('a%'.lower())`,
      out: `LOWER($1) LIKE LOWER($2)`,
      vars: ['aBc', 'a%'],
    },
    {
      in: `single_string.like('a%', true)`,
      out: `LOWER(single_string) LIKE LOWER($1)`,
      vars: ['a%'],
    },
    {
      in: `1.like('a%')`,
      err: `ERROR: <input>:1:7: found no matching overload for 'like' applied to 'int.(string)'
     | 1.like('a%')
     | ......^`,
    },
    {
      in: `single_int64.like('a%')`,
      err: `ERROR: <input>:1:18: found no matching overload for 'like' applied to 'int.(string)'
     | single_int64.like('a%')
     | .................^`,
    },
    // TODO: indexOf?

    // Timezone conversions
    {
      in: `time('12:34:56').atTimeZone('America/New_York') == time('12:34:56')`,
      out: `CAST($1 AS TIME) AT TIME ZONE $2 = CAST($3 AS TIME)`,
      vars: ['12:34:56', 'America/New_York', '12:34:56'],
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').atTimeZone('America/New_York') == timestamp('2023-10-01T00:00:00Z')`,
      out: `TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1 = TIMESTAMP '2023-10-01T00:00:00.000Z'`,
      vars: ['America/New_York'],
    },
    {
      in: `single_timestamp.atTimeZone('America/New_York') == single_timestamp`,
      out: `single_timestamp AT TIME ZONE $1 = single_timestamp`,
      vars: ['America/New_York'],
    },
    {
      in: `1.atTimeZone('America/New_York') == 1`,
      err: `ERROR: <input>:1:13: found no matching overload for 'atTimeZone' applied to 'int.(string)'
     | 1.atTimeZone('America/New_York') == 1
     | ............^`,
    },

    // Temporal functions
    {
      in: `now() == timestamp('2023-10-01T00:00:00Z')`,
      out: `CURRENT_TIMESTAMP = TIMESTAMP '2023-10-01T00:00:00.000Z'`,
      vars: [],
    },
    {
      in: `now('America/New_York') == timestamp('2023-10-01T00:00:00Z')`,
      out: `CURRENT_TIMESTAMP AT TIME ZONE $1 = TIMESTAMP '2023-10-01T00:00:00.000Z'`,
      vars: ['America/New_York'],
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getFullYear() == single_timestamp.getFullYear()`,
      out: `EXTRACT(YEAR FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = EXTRACT(YEAR FROM single_timestamp)`,
      vars: [],
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getFullYear('America/New_York') == single_timestamp.getFullYear('America/Los_Angeles')`,
      out: `EXTRACT(YEAR FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = EXTRACT(YEAR FROM single_timestamp AT TIME ZONE $2)`,
      vars: ['America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `date('2023-10-01').getFullYear() == single_timestamp.getFullYear()`,
      out: `EXTRACT(YEAR FROM CAST($1 AS DATE)) = EXTRACT(YEAR FROM single_timestamp)`,
      vars: ['2023-10-01'],
    },
    {
      in: `date('2023-10-01').getFullYear('America/New_York') == single_timestamp.getFullYear('America/Los_Angeles')`,
      out: `EXTRACT(YEAR FROM CAST($1 AS DATE) AT TIME ZONE $2) = EXTRACT(YEAR FROM single_timestamp AT TIME ZONE $3)`,
      vars: ['2023-10-01', 'America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `1.getFullYear() == 2023`,
      err: `ERROR: <input>:1:14: found no matching overload for 'getFullYear' applied to 'int.()'
     | 1.getFullYear() == 2023
     | .............^`,
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getMonth() == single_timestamp.getMonth()`,
      out: `EXTRACT(MONTH FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = EXTRACT(MONTH FROM single_timestamp)`,
      vars: [],
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getMonth('America/New_York') == single_timestamp.getMonth('America/Los_Angeles')`,
      out: `EXTRACT(MONTH FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = EXTRACT(MONTH FROM single_timestamp AT TIME ZONE $2)`,
      vars: ['America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `date('2023-10-01').getMonth() == single_timestamp.getMonth()`,
      out: `EXTRACT(MONTH FROM CAST($1 AS DATE)) = EXTRACT(MONTH FROM single_timestamp)`,
      vars: ['2023-10-01'],
    },
    {
      in: `date('2023-10-01').getMonth('America/New_York') == single_timestamp.getMonth('America/Los_Angeles')`,
      out: `EXTRACT(MONTH FROM CAST($1 AS DATE) AT TIME ZONE $2) = EXTRACT(MONTH FROM single_timestamp AT TIME ZONE $3)`,
      vars: ['2023-10-01', 'America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `1.getMonth() == 2023`,
      err: `ERROR: <input>:1:11: found no matching overload for 'getMonth' applied to 'int.()'
     | 1.getMonth() == 2023
     | ..........^`,
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getDayOfYear() == single_timestamp.getDayOfYear()`,
      out: `EXTRACT(DOY FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = EXTRACT(DOY FROM single_timestamp)`,
      vars: [],
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getDayOfYear('America/New_York') == single_timestamp.getDayOfYear('America/Los_Angeles')`,
      out: `EXTRACT(DOY FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = EXTRACT(DOY FROM single_timestamp AT TIME ZONE $2)`,
      vars: ['America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `date('2023-10-01').getDayOfYear() == single_timestamp.getDayOfYear()`,
      out: `EXTRACT(DOY FROM CAST($1 AS DATE)) = EXTRACT(DOY FROM single_timestamp)`,
      vars: ['2023-10-01'],
    },
    {
      in: `date('2023-10-01').getDayOfYear('America/New_York') == single_timestamp.getDayOfYear('America/Los_Angeles')`,
      out: `EXTRACT(DOY FROM CAST($1 AS DATE) AT TIME ZONE $2) = EXTRACT(DOY FROM single_timestamp AT TIME ZONE $3)`,
      vars: ['2023-10-01', 'America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `1.getDayOfYear() == 2023`,
      err: `ERROR: <input>:1:15: found no matching overload for 'getDayOfYear' applied to 'int.()'
     | 1.getDayOfYear() == 2023
     | ..............^`,
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getDate() == single_timestamp.getDate()`,
      out: `EXTRACT(DAY FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = EXTRACT(DAY FROM single_timestamp)`,
      vars: [],
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getDate('America/New_York') == single_timestamp.getDate('America/Los_Angeles')`,
      out: `EXTRACT(DAY FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = EXTRACT(DAY FROM single_timestamp AT TIME ZONE $2)`,
      vars: ['America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `date('2023-10-01').getDate() == single_timestamp.getDate()`,
      out: `EXTRACT(DAY FROM CAST($1 AS DATE)) = EXTRACT(DAY FROM single_timestamp)`,
      vars: ['2023-10-01'],
    },
    {
      in: `date('2023-10-01').getDate('America/New_York') == single_timestamp.getDate('America/Los_Angeles')`,
      out: `EXTRACT(DAY FROM CAST($1 AS DATE) AT TIME ZONE $2) = EXTRACT(DAY FROM single_timestamp AT TIME ZONE $3)`,
      vars: ['2023-10-01', 'America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `1.getDate() == 2023`,
      err: `ERROR: <input>:1:10: found no matching overload for 'getDate' applied to 'int.()'
     | 1.getDate() == 2023
     | .........^`,
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getDayOfWeek() == single_timestamp.getDayOfWeek()`,
      out: `EXTRACT(DOW FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = EXTRACT(DOW FROM single_timestamp)`,
      vars: [],
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getDayOfWeek('America/New_York') == single_timestamp.getDayOfWeek('America/Los_Angeles')`,
      out: `EXTRACT(DOW FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = EXTRACT(DOW FROM single_timestamp AT TIME ZONE $2)`,
      vars: ['America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `date('2023-10-01').getDayOfWeek() == single_timestamp.getDayOfWeek()`,
      out: `EXTRACT(DOW FROM CAST($1 AS DATE)) = EXTRACT(DOW FROM single_timestamp)`,
      vars: ['2023-10-01'],
    },
    {
      in: `date('2023-10-01').getDayOfWeek('America/New_York') == single_timestamp.getDayOfWeek('America/Los_Angeles')`,
      out: `EXTRACT(DOW FROM CAST($1 AS DATE) AT TIME ZONE $2) = EXTRACT(DOW FROM single_timestamp AT TIME ZONE $3)`,
      vars: ['2023-10-01', 'America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `1.getDayOfWeek() == 2023`,
      err: `ERROR: <input>:1:15: found no matching overload for 'getDayOfWeek' applied to 'int.()'
     | 1.getDayOfWeek() == 2023
     | ..............^`,
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getHours() == single_timestamp.getHours()`,
      out: `EXTRACT(HOUR FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = EXTRACT(HOUR FROM single_timestamp)`,
      vars: [],
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getHours('America/New_York') == single_timestamp.getHours('America/Los_Angeles')`,
      out: `EXTRACT(HOUR FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = EXTRACT(HOUR FROM single_timestamp AT TIME ZONE $2)`,
      vars: ['America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `time('11:22:33').getHours() == single_timestamp.getHours()`,
      out: `EXTRACT(HOUR FROM CAST($1 AS TIME)) = EXTRACT(HOUR FROM single_timestamp)`,
      vars: ['11:22:33'],
    },
    {
      in: `time('11:22:33').getHours('America/New_York') == single_timestamp.getHours('America/Los_Angeles')`,
      out: `EXTRACT(HOUR FROM CAST($1 AS TIME) AT TIME ZONE $2) = EXTRACT(HOUR FROM single_timestamp AT TIME ZONE $3)`,
      vars: ['11:22:33', 'America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `1.getHours() == 2023`,
      err: `ERROR: <input>:1:11: found no matching overload for 'getHours' applied to 'int.()'
     | 1.getHours() == 2023
     | ..........^`,
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getMinutes() == single_timestamp.getMinutes()`,
      out: `EXTRACT(MINUTE FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = EXTRACT(MINUTE FROM single_timestamp)`,
      vars: [],
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getMinutes('America/New_York') == single_timestamp.getMinutes('America/Los_Angeles')`,
      out: `EXTRACT(MINUTE FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = EXTRACT(MINUTE FROM single_timestamp AT TIME ZONE $2)`,
      vars: ['America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `time('11:22:33').getMinutes() == single_timestamp.getMinutes()`,
      out: `EXTRACT(MINUTE FROM CAST($1 AS TIME)) = EXTRACT(MINUTE FROM single_timestamp)`,
      vars: ['11:22:33'],
    },
    {
      in: `time('11:22:33').getMinutes('America/New_York') == single_timestamp.getMinutes('America/Los_Angeles')`,
      out: `EXTRACT(MINUTE FROM CAST($1 AS TIME) AT TIME ZONE $2) = EXTRACT(MINUTE FROM single_timestamp AT TIME ZONE $3)`,
      vars: ['11:22:33', 'America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `1.getMinutes() == 2023`,
      err: `ERROR: <input>:1:13: found no matching overload for 'getMinutes' applied to 'int.()'
     | 1.getMinutes() == 2023
     | ............^`,
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getSeconds() == single_timestamp.getSeconds()`,
      out: `EXTRACT(SECOND FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = EXTRACT(SECOND FROM single_timestamp)`,
      vars: [],
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getSeconds('America/New_York') == single_timestamp.getSeconds('America/Los_Angeles')`,
      out: `EXTRACT(SECOND FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = EXTRACT(SECOND FROM single_timestamp AT TIME ZONE $2)`,
      vars: ['America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `time('11:22:33').getSeconds() == single_timestamp.getSeconds()`,
      out: `EXTRACT(SECOND FROM CAST($1 AS TIME)) = EXTRACT(SECOND FROM single_timestamp)`,
      vars: ['11:22:33'],
    },
    {
      in: `time('11:22:33').getSeconds('America/New_York') == single_timestamp.getSeconds('America/Los_Angeles')`,
      out: `EXTRACT(SECOND FROM CAST($1 AS TIME) AT TIME ZONE $2) = EXTRACT(SECOND FROM single_timestamp AT TIME ZONE $3)`,
      vars: ['11:22:33', 'America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `1.getSeconds() == 2023`,
      err: `ERROR: <input>:1:13: found no matching overload for 'getSeconds' applied to 'int.()'
     | 1.getSeconds() == 2023
     | ............^`,
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getMilliseconds() == single_timestamp.getMilliseconds()`,
      out: `EXTRACT(MILLISECOND FROM TIMESTAMP '2023-10-01T00:00:00.000Z') = EXTRACT(MILLISECOND FROM single_timestamp)`,
      vars: [],
    },
    {
      in: `timestamp('2023-10-01T00:00:00Z').getMilliseconds('America/New_York') == single_timestamp.getMilliseconds('America/Los_Angeles')`,
      out: `EXTRACT(MILLISECOND FROM TIMESTAMP '2023-10-01T00:00:00.000Z' AT TIME ZONE $1) = EXTRACT(MILLISECOND FROM single_timestamp AT TIME ZONE $2)`,
      vars: ['America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `time('11:22:33').getMilliseconds() == single_timestamp.getMilliseconds()`,
      out: `EXTRACT(MILLISECOND FROM CAST($1 AS TIME)) = EXTRACT(MILLISECOND FROM single_timestamp)`,
      vars: ['11:22:33'],
    },
    {
      in: `time('11:22:33').getMilliseconds('America/New_York') == single_timestamp.getMilliseconds('America/Los_Angeles')`,
      out: `EXTRACT(MILLISECOND FROM CAST($1 AS TIME) AT TIME ZONE $2) = EXTRACT(MILLISECOND FROM single_timestamp AT TIME ZONE $3)`,
      vars: ['11:22:33', 'America/New_York', 'America/Los_Angeles'],
    },
    {
      in: `1.getMilliseconds() == 2023`,
      err: `ERROR: <input>:1:18: found no matching overload for 'getMilliseconds' applied to 'int.()'
     | 1.getMilliseconds() == 2023
     | .................^`,
    },
  ];

  for (const tc of testCases) {
    it(`should convert "${tc.in}"`, () => {
      if (tc.out) {
        const out = defaultSql(tc.in, env);
        expect(out.sql).toEqual(tc.out);
        if (tc.vars) {
          expect(out.vars).toEqual(tc.vars);
        }
      } else if (tc.err) {
        expect(() => defaultSql(tc.in, env)).toThrow(formatError(tc.err));
      } else {
        throw new Error('Test case must have either "out" or "err" property');
      }
    });
  }
});
