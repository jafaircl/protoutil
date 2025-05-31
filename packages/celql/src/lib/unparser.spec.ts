import { declareContextProto, Env, Issues } from '@bearclaw/cel';
import { TestAllTypesSchema } from '@buf/google_cel-spec.bufbuild_es/cel/expr/conformance/proto3/test_all_types_pb.js';
import { DefaultDialect } from './default/dialect.js';
import { DefaultEnv } from './default/env.js';
import { Dialect } from './dialect.js';
import { Unparser } from './unparser.js';

describe('Unparser', () => {
  const dialects: { dialect: Dialect; env: Env }[] = [
    { dialect: new DefaultDialect(), env: new DefaultEnv(declareContextProto(TestAllTypesSchema)) },
  ];
  const testCases: { in: string; out?: string; err?: string; vars?: unknown[] }[] = [
    // Logical expressions
    {
      in: `true ? true : false`,
      out: `CASE WHEN $1 THEN $2 ELSE $3 END`,
      vars: [true, true, false],
    },
    {
      in: `true || false`,
      out: `$1 OR $2`,
      vars: [true, false],
    },
    {
      in: `true || true || false || true || true || false`,
      out: `$1 OR $2 OR $3 OR $4 OR $5 OR $6`,
      vars: [true, true, false, true, true, false],
    },
    {
      in: `true && false`,
      out: `$1 AND $2`,
      vars: [true, false],
    },
    {
      in: `true && true && false && true && true && false`,
      out: `$1 AND $2 AND $3 AND $4 AND $5 AND $6`,
      vars: [true, true, false, true, true, false],
    },
    {
      in: `!true`,
      out: `NOT $1`,
      vars: [true],
    },
    {
      in: `!!true`,
      out: `$1`,
      vars: [true],
    },
    {
      in: `!!!true`,
      out: `NOT $1`,
      vars: [true],
    },

    // Mathematical expressions
    {
      in: `3 + 4`,
      out: `$1 + $2`,
      vars: [3n, 4n],
    },
    {
      in: `3 / 4`,
      out: `$1 / $2`,
      vars: [3n, 4n],
    },
    {
      in: `3 % 4`,
      out: `$1 % $2`,
      vars: [3n, 4n],
    },
    {
      in: `3 * 4`,
      out: `$1 * $2`,
      vars: [3n, 4n],
    },

    // Comparison expressions
    {
      in: `3 < 4`,
      out: `$1 < $2`,
      vars: [3n, 4n],
    },
    {
      in: `3 <= 4`,
      out: `$1 <= $2`,
      vars: [3n, 4n],
    },
    {
      in: `3 > 4`,
      out: `$1 > $2`,
      vars: [3n, 4n],
    },
    {
      in: `3 >= 4`,
      out: `$1 >= $2`,
      vars: [3n, 4n],
    },
  ];

  for (const dialect of dialects) {
    for (const tc of testCases) {
      it(`should unparse "${tc.in}" with dialect ${dialect.dialect.name()}`, () => {
        const compiled = dialect.env.compile(tc.in);
        if (compiled instanceof Issues) {
          expect(compiled.err()?.message).toEqual(tc.err);
          return;
        }
        const unparser = new Unparser(compiled, dialect.dialect);
        const out = unparser.unparse();
        expect(out.sql).toEqual(tc.out);
        expect(out.vars).toEqual(tc.vars || []);
      });
    }
  }
});
