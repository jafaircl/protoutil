import { BoolType, declareContextProto, func, overload, StringType } from '@bearclaw/cel';
import { TestAllTypesSchema } from '@buf/google_cel-spec.bufbuild_es/cel/expr/conformance/proto3/test_all_types_pb.js';
import { Expr } from '@buf/google_cel-spec.bufbuild_es/cel/expr/syntax_pb.js';
import { mysql, sql } from './celql.js';
import { Dialect } from './dialect.js';
import { CelqlEnv } from './env.js';
import { Unparser } from './unparser.js';

describe('dialects', () => {
  describe('MySQL', () => {
    const env = new CelqlEnv(declareContextProto(TestAllTypesSchema));
    const testCases: { in: string; out?: string; vars?: unknown[]; err?: string }[] = [
      // TODO: more mysql tests
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
        out: `$1 LIKE $2`,
        vars: ['FoObAr', 'foo'],
      },
      {
        in: `"FoObAr".like("foo", false)`,
        out: `$1 LIKE $2`,
        vars: ['FoObAr', 'foo'],
      },
      {
        in: `!single_string.like("foo")`,
        out: `NOT single_string LIKE $1`,
        vars: ['foo'],
      },
      {
        in: `!single_string.like("foo", true)`,
        out: `NOT (single_string LIKE $1)`,
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
          const out = mysql(tc.in, env);
          expect(out.sql).toEqual(tc.out);
          if (tc.vars) {
            expect(out.vars).toEqual(tc.vars);
          }
        } else if (tc.err) {
          expect(() => mysql(tc.in, env)).toThrow(
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

  describe('custom', () => {
    it('should allow defining a custom function', () => {
      const myFuncOverload = 'myFunc';

      class MyDialect extends Dialect {
        override functionToSqlOverrides(
          unparser: Unparser,
          functionName: string,
          args: Expr[]
        ): boolean {
          switch (functionName) {
            case myFuncOverload:
              unparser.visit(args[0]);
              unparser.writeString(' MY_CUSTOM_OPERATOR ');
              unparser.visit(args[1]);
              return true;
            default:
              return super.functionToSqlOverrides(unparser, functionName, args);
          }
        }
      }

      const env = new CelqlEnv(
        func(myFuncOverload, overload(myFuncOverload, [StringType, StringType], BoolType))
      );

      expect(sql(`myFunc('a', 'b')`, env, new MyDialect())).toEqual({
        sql: '$1 MY_CUSTOM_OPERATOR $2',
        vars: ['a', 'b'],
      });
    });
  });
});
