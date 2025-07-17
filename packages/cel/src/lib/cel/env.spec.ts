/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from '@bufbuild/protobuf';
import { binaryBinding } from '../common/decls.js';
import {
  Config,
  ContextVariable,
  Feature,
  Function,
  Import,
  LibrarySubset,
  Overload,
  TypeDesc,
  Variable,
} from '../common/env/env.js';
import { Errors } from '../common/errors.js';
import { ErrorType } from '../common/types/types.js';
import { TestAllTypesSchema } from '../protogen/cel/expr/conformance/proto3/test_all_types_pb.js';
import { BoolVal, IntVal, StringVal } from './cel.js';
import { func, IntType, memberOverload, overload, StringType, variable } from './decls.js';
import { CustomEnv, Env, Issues } from './env.js';
import {
  abbrevs,
  container,
  declareContextProto,
  enableMacroCallTracking,
  fromConfig,
  types,
} from './options.js';

describe('env', () => {
  it('TestIssuesEmpty', () => {
    const iss = new Issues(new Errors());
    expect(iss.err()).toBeNull();
    expect(iss.errors().length).toEqual(0);
    expect(iss.toString()).toEqual('');
  });

  it('TestIssuesAppendSelf', () => {
    const e = new Env();
    let iss = e.compile('a') as Issues;
    expect(iss.errors().length).toEqual(1);
    iss = iss.append(iss);
    expect(iss.errors().length).toEqual(1);
  });

  it('TestIssues', () => {
    const e = new Env();
    let iss = e.compile('-') as Issues;
    const iss2 = e.compile('b') as Issues;
    iss = iss.append(iss2);
    expect(iss.errors().length).toEqual(3);
    expect(iss.toString()).toEqual(
      `ERROR: <input>:1:2: Syntax error: no viable alternative at input '-'
 | -
 | .^
 ERROR: <input>:1:2: Syntax error: mismatched input '<EOF>' expecting {'[', '{', '(', '.', '-', '!', 'true', 'false', 'null', NUM_FLOAT, NUM_INT, NUM_UINT, STRING, BYTES, IDENTIFIER}
 | -
 | .^
 ERROR: <input>:1:1: undeclared reference to 'b' (in container '')
 | -
 | ^
`.trim()
    );
  });

  it('TestLibraries', () => {
    // TODO: optional library
    const e = new Env();
    expect(e.hasLibrary('cel.lib.std')).toEqual(true);
    expect(e.libraries.size).toEqual(1);
  });

  it('TestFunctions', () => {
    const e = new Env(func('a', overload('a_b', [StringType], StringType)));
    expect(e.hasFunction('a')).toEqual(true);
  });

  // TODO: add missing tests for formatting, extend race conditions, partial vars, functions and benchmarking

  it('Test_EnvExtend', () => {
    const e = new Env(types(TestAllTypesSchema));
    expect(e.provider.findStructType(TestAllTypesSchema.typeName)).not.toBeNull();
    const extended = e.extend();
    expect(extended.provider.findStructType(TestAllTypesSchema.typeName)).not.toBeNull();
    expect(extended.provider.findStructType(TestAllTypesSchema.typeName)).toEqual(
      e.provider.findStructType(TestAllTypesSchema.typeName)
    );
    const value = create(TestAllTypesSchema, { singleString: 'test' });
    expect(extended.adapter.nativeToValue(value).type().typeName()).not.toEqual(
      ErrorType.typeName()
    );
    expect(extended.adapter.nativeToValue(value)).toEqual(e.adapter.nativeToValue(value));
  });

  describe('TestEnvToConfig', () => {
    const tests = [
      {
        name: 'std env',
        want: new Config('std env'),
      },
      {
        name: 'std env - container',
        opts: [container('example.container')],
        want: new Config('std env - container').setContainer('example.container'),
      },
      {
        name: 'std env - aliases',
        opts: [abbrevs('example.type.name')],
        want: new Config('std env - aliases').addImports(new Import('example.type.name')),
      },
      // TODO: not sure why this is not working
      // {
      //   name: 'std env disabled',
      //   opts: [
      //     () => {
      //       return new CustomEnv();
      //     },
      //   ],
      //   want: new Config('std env disabled').setStdLib(new LibrarySubset().setDisabled(true)),
      // },
      {
        name: 'std env - with variable',
        opts: [variable('var', IntType)],
        want: new Config('std env - with variable').addVariables(new Variable('var', 'int')),
      },
      {
        name: 'std env - with function',
        opts: [func('hello', overload('hello_string', [StringType], StringType))],
        want: new Config('std env - with function').addFunctions(
          new Function('hello', undefined, [
            new Overload(
              'hello_string',
              undefined,
              undefined,
              [new TypeDesc('string')],
              new TypeDesc('string')
            ),
          ])
        ),
      },
      // TODO: optional library
      //   {
      // 	name: "optional lib",
      // 	opts: []EnvOption{
      // 		OptionalTypes(),
      // 	},
      // 	want: env.NewConfig("optional lib").AddExtensions(env.NewExtension("optional", math.MaxUint32)),
      // },
      // {
      // 	name: "optional lib - versioned",
      // 	opts: []EnvOption{
      // 		OptionalTypes(OptionalTypesVersion(1)),
      // 	},
      // 	want: env.NewConfig("optional lib - versioned").AddExtensions(env.NewExtension("optional", 1)),
      // },
      // {
      // 	name: "optional lib - alt last()",
      // 	opts: []EnvOption{
      // 		OptionalTypes(),
      // 		Function("last",
      // 			FunctionDocs(`return the last value in a list, or last character in a string`),
      // 			MemberOverload("string_last", []*Type{StringType}, StringType)),
      // 	},
      // 	want: env.NewConfig("optional lib - alt last()").
      // 		AddExtensions(env.NewExtension("optional", math.MaxUint32)).
      // 		AddFunctions(env.NewFunctionWithDoc("last",
      // 			`return the last value in a list, or last character in a string`,
      // 			env.NewMemberOverload("string_last", env.NewTypeDesc("string"), []*env.TypeDesc{}, env.NewTypeDesc("string")),
      // 		)),
      // },
      {
        name: 'context proto - with extra variable',
        opts: [declareContextProto(TestAllTypesSchema), variable('extra', StringType)],
        want: new Config('context proto - with extra variable')
          .setContextVariable(new ContextVariable('cel.expr.conformance.proto3.TestAllTypes'))
          .addVariables(new Variable('extra', 'string')),
      },
      {
        name: 'context proto',
        opts: [declareContextProto(TestAllTypesSchema)],
        want: new Config('context proto').setContextVariable(
          new ContextVariable('cel.expr.conformance.proto3.TestAllTypes')
        ),
      },
      {
        name: 'feature flags',
        opts: [
          // TODO: defaultUTCTimeZone(false),
          // DefaultUTCTimeZone(false),
          enableMacroCallTracking(),
        ],
        want: new Config('feature flags').addFeatures(
          new Feature('cel.feature.macro_call_tracking', true)
        ),
      },
      // TODO: validators
      // {
      // 	name: "validators",
      // 	opts: []EnvOption{
      // 		ExtendedValidations(),
      // 		ASTValidators(ValidateComprehensionNestingLimit(1)),
      // 	},
      // 	want: env.NewConfig("validators").AddValidators(
      // 		env.NewValidator("cel.validator.duration"),
      // 		env.NewValidator("cel.validator.timestamp"),
      // 		env.NewValidator("cel.validator.matches"),
      // 		env.NewValidator("cel.validator.homogeneous_literals"),
      // 		env.NewValidator("cel.validator.comprehension_nesting_limit").SetConfig(map[string]any{"limit": 1}),
      // 	),
      // },
    ];
    for (const tc of tests) {
      it(tc.name, () => {
        const e = new Env(...(tc.opts || []));
        const conf = e.toConfig(tc.name);
        expect(conf).toEqual(tc.want);
      });
    }
  });

  describe('TestEnvFromConfig', () => {
    const tests = [
      {
        name: 'std env',
        conf: new Config('std env'),
        exprs: [
          {
            name: 'literal',
            expr: "'hello world'",
            in: {},
            out: new StringVal('hello world'),
          },
          {
            name: 'size',
            expr: "'hello world'.size()",
            in: {},
            out: new IntVal(11n),
          },
        ],
      },
      {
        name: 'std env - imports',
        beforeOpts: [types(TestAllTypesSchema)],
        conf: new Config('std env - imports').setContainer(
          'cel.expr.conformance.proto3.TestAllTypes'
        ),
        // TODO: imports?
        // conf: new Config('std env - context proto').addImports(
        //   new Import('google.expr.proto3.test.TestAllTypes')
        // ),
        exprs: [
          {
            name: 'literal',
            expr: 'TestAllTypes{single_int64: 15}.single_int64',
            in: {},
            out: new IntVal(15n),
          },
        ],
      },
      {
        name: 'std env - context proto',
        beforeOpts: [types(TestAllTypesSchema)],
        conf: new Config('std env - context proto')
          .setContainer('cel.expr.conformance.proto3')
          .setContextVariable(new ContextVariable('cel.expr.conformance.proto3.TestAllTypes')),
        exprs: [
          {
            name: 'field select literal',
            in: create(TestAllTypesSchema, { singleInt64: 10n }),
            expr: 'TestAllTypes{single_int64: single_int64}.single_int64',
            out: new IntVal(10n),
          },
        ],
      },
      {
        name: 'custom env - variables',
        beforeOpts: [types(TestAllTypesSchema)],
        conf: new Config('custom env - variables')
          .setStdLib(new LibrarySubset().setDisabled(true))
          .setContainer('cel.expr.conformance.proto3')
          .addVariables(new Variable('single_int64', 'int')),
        exprs: [
          {
            name: 'field select literal',
            in: { single_int64: 42n },
            expr: 'TestAllTypes{single_int64: single_int64}.single_int64',
            out: new IntVal(42n),
          },
          {
            name: 'invalid operator',
            in: { single_int64: 42n },
            expr: 'TestAllTypes{single_int64: single_int64}.single_int64 + 1',
            iss: 'undeclared reference',
          },
        ],
      },
      {
        name: 'custom env - functions',
        afterOpts: [
          func(
            'plus',
            memberOverload(
              'int_plus_int',
              IntType,
              [IntType],
              IntType,
              binaryBinding((lhs, rhs) => {
                const l = lhs as IntVal;
                const r = rhs as IntVal;
                return new IntVal(l.value() + r.value());
              })
            )
          ),
        ],
        conf: new Config('custom env - functions')
          .setStdLib(new LibrarySubset().setDisabled(true))
          .addVariables(new Variable('x', 'int'))
          .addFunctions(
            new Function('plus', undefined, [
              new Overload(
                'int_plus_int',
                undefined,
                new TypeDesc('int'),
                [new TypeDesc('int')],
                new TypeDesc('int')
              ),
            ])
          ),
        exprs: [
          {
            name: 'plus',
            in: { x: 42n },
            expr: 'x.plus(2)',
            out: new IntVal(44n),
          },
          {
            name: 'plus invalid type',
            in: { x: 42n },
            expr: 'x.plus(2.0)',
            iss: 'no matching overload',
          },
        ],
      },
      {
        name: 'pure custom env',
        beforeOpts: [
          () => {
            return new CustomEnv();
          },
        ],
        conf: new Config('pure custom env').setStdLib(
          new LibrarySubset().addIncludedFunctions(new Function('_==_'))
        ),
        exprs: [
          {
            name: 'equals',
            expr: "'hello world' == 'hello'",
            in: {},
            out: BoolVal.False,
          },
          {
            name: 'not equals - invalid',
            expr: "'hello world' != 'hello'",
            in: {},
            iss: 'undeclared reference',
          },
        ],
      },
      {
        name: 'std env - allow subset',
        conf: new Config('std env - allow subset').setStdLib(
          new LibrarySubset().addIncludedFunctions(new Function('_==_'))
        ),
        exprs: [
          {
            name: 'equals',
            expr: "'hello world' == 'hello'",
            in: {},
            out: BoolVal.False,
          },
          {
            name: 'not equals - invalid',
            expr: "'hello world' != 'hello'",
            in: {},
            iss: 'undeclared reference',
          },
        ],
      },
    ];
    for (const tc of tests) {
      it(tc.name, () => {
        const opts = tc.beforeOpts || [];
        opts.push(fromConfig(tc.conf));
        for (const opt of tc.afterOpts || []) {
          opts.push(opt);
        }
        const e = tc.conf.stdLib ? new CustomEnv(...opts) : new Env(...opts);
        for (const expr of tc.exprs) {
          const compiled = e.compile(expr.expr);
          if (compiled instanceof Issues) {
            if (!(expr as any).iss) {
              throw compiled.err();
            }
            expect(compiled.err()?.message).toContain((expr as any).iss);
            return;
          }
          const program = e.program(compiled);
          if (program instanceof Error) {
            throw new Error(
              `failed to create program for expression ${expr.name}: ${program.toString()}`
            );
          }
          const [out, , err] = program.eval(expr.in);
          if (err) {
            console.error(err?.value());
          }
          expect(out).toEqual(expr.out);
        }
      });
    }
  });
});
