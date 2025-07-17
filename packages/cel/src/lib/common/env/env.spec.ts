import { MAX_UINT32 } from '@protoutil/core';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';
import {
  FunctionDecl,
  functionDocs,
  FunctionOpt,
  memberOverload,
  newFunction,
  newVariableDecl,
  overload,
  overloadExamples,
  VariableDecl,
} from '../decls.js';
import {
  ADD_OPERATOR,
  EQUALS_OPERATOR,
  GREATER_EQUALS_OPERATOR,
  GREATER_OPERATOR,
  LESS_EQUALS_OPERATOR,
  LESS_OPERATOR,
  LOGICAL_NOT_OPERATOR,
  NOT_EQUALS_OPERATOR,
} from '../operators.js';
import {
  ADD_BYTES_OVERLOAD,
  ADD_LIST_OVERLOAD,
  ADD_STRING_OVERLOAD,
  MATCHES_OVERLOAD,
  STRING_TO_DURATION_OVERLOAD,
  STRING_TO_TIMESTAMP_OVERLOAD,
  TYPE_CONVERT_DURATION_OVERLOAD,
  TYPE_CONVERT_TIMESTAMP_OVERLOAD,
} from '../overloads.js';
import { Registry } from '../types/provider.js';
import {
  DynType,
  IntType,
  newListType,
  newMapType,
  newNullableType,
  newObjectType,
  newOpaqueType,
  newOptionalType,
  newTypeParamType,
  StringType,
  UintType,
} from '../types/types.js';
import {
  Config,
  ConfigJson,
  ContextVariable,
  Extension,
  Feature,
  Function,
  Import,
  LibrarySubset,
  Overload,
  TypeDesc,
  TypeParamDesc,
  Validator,
  Variable,
} from './env.js';

describe('config', () => {
  describe('TestConfig', () => {
    const tests = [
      {
        name: 'context_env',
        want: new Config('context-env')
          .setContainer('google.expr')
          .addImports(new Import('google.expr.proto3.test.TestAllTypes'))
          .setStdLib(
            new LibrarySubset()
              .addIncludedMacros('has')
              .addIncludedFunctions(
                new Function(EQUALS_OPERATOR),
                new Function(NOT_EQUALS_OPERATOR),
                new Function(LOGICAL_NOT_OPERATOR),
                new Function(LESS_OPERATOR),
                new Function(LESS_EQUALS_OPERATOR),
                new Function(GREATER_OPERATOR),
                new Function(GREATER_EQUALS_OPERATOR)
              )
          )
          .addExtensions(
            new Extension('optional', MAX_UINT32.toString()),
            new Extension('strings', '1')
          )
          .setContextVariable(new ContextVariable('google.expr.proto3.test.TestAllTypes'))
          .addFunctions(
            new Function(
              'coalesce',
              'Converts a potentially null wrapper-type to a default value.',
              [
                new Overload(
                  'coalesce_wrapped_int',
                  [`coalesce(null, 1) // 1`, `coalesce(2, 1) // 2`],
                  undefined,
                  [new TypeDesc('google.protobuf.Int64Value'), new TypeDesc('int')],
                  new TypeDesc('int')
                ),
                new Overload(
                  'coalesce_wrapped_double',
                  [`coalesce(null, 1.3) // 1.3`],
                  undefined,
                  [new TypeDesc('google.protobuf.DoubleValue'), new TypeDesc('double')],
                  new TypeDesc('double')
                ),
                new Overload(
                  'coalesce_wrapped_uint',
                  [`coalesce(null, 14u) // 14u`],
                  undefined,
                  [new TypeDesc('google.protobuf.UInt64Value'), new TypeDesc('uint')],
                  new TypeDesc('uint')
                ),
              ]
            )
          ),
      },
      {
        name: 'extended_env',
        want: new Config('extended-env')
          .setContainer('google.expr')
          .addExtensions(new Extension('optional', '2'), new Extension('math', 'latest'))
          .addVariables(
            new Variable(
              'msg',
              'google.expr.proto3.test.TestAllTypes',
              undefined,
              undefined,
              `msg represents all possible type permutation which CEL understands from a proto perspective`
            )
          )
          .addFunctions(
            new Function(
              'isEmpty',
              `determines whether a list is empty,
or a string has no characters`,
              [
                // TODO: common.MultilineDescription
                // common.MultilineDescription(
                // 	`determines whether a list is empty,`,
                // 	`or a string has no characters`),
                new Overload(
                  'wrapper_string_isEmpty',
                  [`''.isEmpty() // true`],
                  new TypeDesc('google.protobuf.StringValue'),
                  undefined,
                  new TypeDesc('bool')
                ),
                new Overload(
                  'list_isEmpty',
                  [`[].isEmpty() // true`, `[1].isEmpty() // false`],
                  new TypeDesc('list', [new TypeDesc('T', undefined, true)]),
                  undefined,
                  new TypeDesc('bool')
                ),
              ]
            )
          )
          .addFeatures(new Feature('cel.feature.macro_call_tracking', true))
          .addValidators(
            new Validator('cel.validator.duration'),
            new Validator('cel.validator.matches'),
            new Validator('cel.validator.timestamp'),
            new Validator('cel.validator.nesting_comprehension_limit').setConfig({ limit: 2 })
          ),
      },
      {
        name: 'subset_env',
        want: new Config('subset-env')
          .setStdLib(
            new LibrarySubset()
              .addExcludedMacros('map', 'filter')
              .addExcludedFunctions(
                new Function(ADD_OPERATOR, undefined, [
                  new Overload(ADD_BYTES_OVERLOAD),
                  new Overload(ADD_LIST_OVERLOAD),
                  new Overload(ADD_STRING_OVERLOAD),
                ]),
                new Function(MATCHES_OVERLOAD),
                new Function(TYPE_CONVERT_TIMESTAMP_OVERLOAD, undefined, [
                  new Overload(STRING_TO_TIMESTAMP_OVERLOAD),
                ]),
                new Function(TYPE_CONVERT_DURATION_OVERLOAD, undefined, [
                  new Overload(STRING_TO_DURATION_OVERLOAD),
                ])
              )
          )
          .addVariables(
            new Variable('x', 'int'),
            new Variable('y', 'double'),
            new Variable('z', 'uint')
          ),
      },
    ];
    for (const tc of tests) {
      it(tc.name, () => {
        const yaml = readFileSync(join(__dirname, 'testdata', tc.name + '.yaml'), 'utf8');
        const got = unmarshalYAML(yaml);
        expect(got).toEqual(tc.want);
      });
    }
  });

  describe('TestConfigValidateErrors', () => {
    const tests = [
      // {
      // 	name: "nil config valid",
      // },
      {
        name: 'invalid import',
        in: new Config('invalid import').addImports(new Import('')),
        want: 'invalid import',
      },
      {
        name: 'invalid subset',
        in: new Config('invalid subset').setStdLib(
          new LibrarySubset().addExcludedMacros('has').addIncludedMacros('exists')
        ),
        want: 'invalid subset',
      },
      {
        name: 'invalid extension',
        in: new Config('invalid extension').addExtensions(new Extension('', '0')),
        want: 'invalid extension',
      },
      {
        name: 'invalid context variable',
        in: new Config('invalid context variable').setContextVariable(new ContextVariable('')),
        want: 'invalid context variable',
      },
      {
        name: 'invalid variable',
        in: new Config('invalid variable').addVariables(new Variable('', '')),
        want: 'invalid variable',
      },
      {
        name: 'colliding context variable',
        in: new Config('colliding context variable')
          .setContextVariable(new ContextVariable('msg.type.Name'))
          .addVariables(new Variable('local', 'string')),
        want: 'invalid config',
      },
      {
        name: 'invalid function',
        in: new Config('invalid function').addFunctions(new Function('')),
        want: 'invalid function',
      },
      {
        name: 'invalid feature',
        in: new Config('invalid feature').addFeatures(new Feature('', false)),
        want: 'invalid feature',
      },
      {
        name: 'invalid validator',
        in: new Config('invalid validator').addValidators(new Validator('')),
        want: 'invalid validator',
      },
    ];
    for (const tc of tests) {
      it(tc.name, () => {
        const err = tc.in.validate();
        if (!err) {
          expect(tc.want).toBeFalsy();
          return;
        }
        expect(err.message).toContain(tc.want);
      });
    }
  });

  describe('TestConfigAddVariableDecls', () => {
    const tests = [
      // {
      // 	name: "nil var decl",
      // },
      {
        name: 'simple var decl',
        in: newVariableDecl('var', StringType),
        out: new Variable('var', 'string'),
      },
      {
        name: 'parameterized var decl',
        in: newVariableDecl('var', newListType(newTypeParamType('T'))),
        out: new Variable('var', 'list', [new TypeParamDesc('T')]),
      },
      {
        name: 'opaque var decl',
        in: newVariableDecl('var', newOpaqueType('bitvector')),
        out: new Variable('var', 'bitvector'),
      },
      {
        name: 'proto var decl',
        in: newVariableDecl('var', newObjectType('google.type.Expr')),
        out: new Variable('var', 'google.type.Expr'),
      },
      {
        name: 'proto var decl with doc',
        in: new VariableDecl(
          'var',
          newObjectType('google.type.Expr'),
          undefined,
          'API-friendly CEL expression type'
        ),
        out: new Variable(
          'var',
          'google.type.Expr',
          undefined,
          undefined,
          'API-friendly CEL expression type'
        ),
      },
    ];
    for (const tc of tests) {
      it(tc.name, () => {
        const config = new Config();
        config.addVariableDecls(tc.in);
        expect(config.variables.length).toEqual(1);
        expect(config.variables[0]).toEqual(tc.out);
      });
    }
  });

  describe('TestConfigAddVariableDeclsEmpty', () => {
    it('should work', () => {
      const config = new Config();
      config.addVariables();
      expect(config.variables.length).toEqual(0);
    });
  });

  describe('TestConfigAddFunctionDecls', () => {
    const tests = [
      // {
      // 	name: "nil function decl",
      // },
      {
        name: 'global function decl',
        in: mustNewFunction('size', overload('size_string', [StringType], IntType)),
        out: new Function('size', undefined, [
          new Overload(
            'size_string',
            undefined,
            undefined,
            [new TypeDesc('string')],
            new TypeDesc('int')
          ),
        ]),
      },
      {
        name: 'global function decl - nullable arg',
        in: mustNewFunction(
          'size',
          overload('size_wrapper_string', [newNullableType(StringType)], IntType)
        ),
        out: new Function('size', undefined, [
          new Overload(
            'size_wrapper_string',
            undefined,
            undefined,
            [new TypeDesc('google.protobuf.StringValue')],
            new TypeDesc('int')
          ),
        ]),
      },
      {
        name: 'member function decl - nullable arg',
        in: mustNewFunction(
          'size',
          memberOverload('list_size', newListType(newTypeParamType('T')), [], IntType),
          memberOverload('string_size', StringType, [], IntType)
        ),
        out: new Function('size', undefined, [
          new Overload(
            'list_size',
            undefined,
            new TypeDesc('list', [new TypeParamDesc('T')]),
            [],
            new TypeDesc('int')
          ),
          new Overload('string_size', undefined, new TypeDesc('string'), [], new TypeDesc('int')),
        ]),
      },
      {
        name: 'global function decl - with doc',
        in: mustNewFunction(
          'size',
          functionDocs('return the number of unicode code points', 'in a string'),
          overload('size_string', [StringType], IntType, overloadExamples(`'hello'.size() // 5`))
        ),
        out: new Function('size', 'return the number of unicode code points\nin a string', [
          new Overload(
            'size_string',
            [`'hello'.size() // 5`],
            undefined,
            [new TypeDesc('string')],
            new TypeDesc('int')
          ),
        ]),
      },
    ];
    for (const tc of tests) {
      it(tc.name, () => {
        const config = new Config();
        config.addFunctionDecls(tc.in);
        expect(config.functions.length).toEqual(1);
        expect(config.functions[0]).toEqual(tc.out);
      });
    }
  });

  describe('TestNewImport', () => {
    it('should work', () => {
      const imp = new Import('qualified.type.name');
      expect(imp.name).toEqual('qualified.type.name');
    });
  });

  describe('TestImportValidate', () => {
    it('should work', () => {
      const imp = new Import('');
      const err = imp.validate();
      expect(err).toBeDefined();
      expect(err?.message).toContain('invalid import');
    });
  });

  describe('TestNewContextVariable', () => {
    it('should work', () => {
      const ctx = new ContextVariable('qualified.type.name');
      expect(ctx.typeName).toEqual('qualified.type.name');
    });
  });

  describe('TestContextVariableValidate', () => {
    it('should work', () => {
      const ctx = new ContextVariable('');
      const err = ctx.validate();
      expect(err).toBeDefined();
      expect(err?.message).toContain('invalid context variable');
    });
  });

  describe('TestVariableGetType', () => {
    const tests = [
      // {
      // 	name: "nil-safety check",
      // 	v:    nil,
      // 	t:    nil,
      // },
      {
        name: 'nil type access',
        v: new Variable('', ''),
        t: null,
      },
      // All of these tests rely on nested type precedence which we don't support.
      // {
      // 	name: "nested type desc",
      // 	v:    &Variable{TypeDesc: &TypeDesc{}},
      // 	t:    &TypeDesc{},
      // },
      // {
      // 	name: "field type desc",
      // 	v:    &Variable{Type: &TypeDesc{}},
      // 	t:    &TypeDesc{},
      // },
      // {
      // 	name: "nested type desc precedence",
      // 	v: &Variable{
      // 		TypeDesc: &TypeDesc{TypeName: "type.name.EmbeddedType"},
      // 		Type:     &TypeDesc{TypeName: "type.name.FieldType"},
      // 	},
      // 	t: &TypeDesc{TypeName: "type.name.EmbeddedType"},
      // },

      {
        name: 'type access',
        v: new Variable('test', 'string'),
        t: new TypeDesc('string'),
      },
    ];
    for (const tc of tests) {
      it(tc.name, () => {
        expect(tc.v.getType()).toEqual(tc.t);
      });
    }
  });

  describe('TestVariableAsCELVariable', () => {
    const tests = [
      // {
      // 	name: "nil-safety check",
      // 	v:    nil,
      // 	want: errors.New("invalid variable: nil"),
      // },
      {
        name: 'no variable name',
        v: new Variable('', ''),
        want: 'invalid variable',
      },
      //   {
      //     name: 'no type',
      //     v: new Variable('hello', ''),
      //     want: 'invalid type',
      //   },
      {
        name: 'bad type',
        v: new Variable('hello', ''),
        want: 'missing type name',
      },
      {
        name: 'undefined type',
        v: new Variable('hello', 'undefined'),
        want: 'undefined type name',
      },
      {
        name: 'int type',
        v: new Variable('int_var', 'int'),
        want: newVariableDecl('int_var', IntType),
      },
      {
        name: 'uint type',
        v: new Variable('uint_var', 'uint'),
        want: newVariableDecl('uint_var', UintType),
      },
      {
        name: 'dyn type',
        v: new Variable('dyn_var', 'dyn'),
        want: newVariableDecl('dyn_var', DynType),
      },
      {
        name: 'list type',
        v: new Variable('list_var', 'list', [new TypeParamDesc('T')]),
        want: newVariableDecl('list_var', newListType(newTypeParamType('T'))),
      },
      {
        name: 'map type',
        v: new Variable('map_var', 'map', [
          new TypeDesc('string'),
          new TypeDesc('optional_type', [new TypeParamDesc('T')]),
        ]),
        want: newVariableDecl(
          'map_var',
          newMapType(StringType, newOptionalType(newTypeParamType('T')))
        ),
      },
      {
        name: 'set type',
        v: new Variable('set_var', 'set', [new TypeDesc('string')]),
        want: newVariableDecl('set_var', newOpaqueType('set', StringType)),
      },
      //   { // We don't support the deprecated nested type so this test doesn't apply.
      //   	name: "string type - nested type precedence",
      //   	v: &Variable{
      //   		Name:     "hello",
      //   		TypeDesc: NewTypeDesc("string"),
      //   		Type:     NewTypeDesc("int"),
      //   	},
      //   	want: decls.NewVariable("hello", types.StringType),
      //   },
      // TODO: gotVar and want are exactly the same but the test fails anyway because
      // isAssignableType and isAssignableRuntimeType are not the same.
      //   {
      //     name: 'wrapper type variable',
      //     v: new Variable('msg', 'google.protobuf.StringValue'),
      //     want: newVariableDecl('msg', newNullableType(StringType)),
      //   },
    ];
    const tp = new Registry();
    tp.registerType(newOpaqueType('set', newTypeParamType('T')));
    for (const tc of tests) {
      it(tc.name, () => {
        const gotVar = tc.v.asCELVariable(tp);
        if (gotVar instanceof Error) {
          expect(gotVar.message).toContain(tc.want);
        } else {
          expect(gotVar).toStrictEqual(tc.want);
        }
      });
    }
  });

  describe('TestTypeDescString', () => {
    const tests = [
      { desc: new TypeDesc('string'), want: 'string' },
      { desc: new TypeDesc('list', [new TypeParamDesc('T')]), want: 'list(T)' },
      {
        desc: new TypeDesc('map', [new TypeParamDesc('string'), new TypeParamDesc('T')]),
        want: 'map(string,T)',
      },
    ];
    for (const tc of tests) {
      it(`should convert ${tc.desc.toString()} to string`, () => {
        expect(tc.desc.toString()).toEqual(tc.want);
      });
    }
  });

  describe('TestFunctionAsCELFunction', () => {
    const tests = [
      // {
      // 	name: "nil function",
      // 	f:    nil,
      // 	want: errors.New("invalid function: nil"),
      // },
      {
        name: 'unnamed function',
        f: new Function(''),
        want: 'invalid function',
      },
      {
        name: 'no overloads',
        f: new Function('no_overloads'),
        want: 'missing overloads',
      },
      {
        name: 'nil overload',
        f: new Function('no_overloads'),
        want: 'missing overloads',
      },
      {
        name: 'missing overload id',
        f: new Function('size', undefined, [new Overload('')]),
        want: 'missing overload id',
      },
      {
        name: 'no return type',
        f: new Function('size', undefined, [
          new Overload('size_string', undefined, undefined, [new TypeDesc('string')], undefined),
        ]),
        want: 'return: missing return type',
      },
      {
        name: 'bad return type',
        f: new Function('size', undefined, [
          new Overload(
            'size_string',
            undefined,
            undefined,
            [new TypeDesc('string')],
            new TypeDesc('')
          ),
        ]),
        want: 'invalid type',
      },
      {
        name: 'bad arg type',
        f: new Function('size', undefined, [
          new Overload('size_string', undefined, undefined, [new TypeDesc('')], new TypeDesc('')),
        ]),
        want: 'invalid type',
      },
      {
        name: 'undefined arg type',
        f: new Function('size', undefined, [
          new Overload(
            'size_undefined',
            undefined,
            undefined,
            [new TypeDesc('undefined')],
            new TypeDesc('int')
          ),
        ]),
        want: 'undefined type',
      },
      {
        name: 'undefined return type',
        f: new Function('size', undefined, [
          new Overload(
            'size_undefined',
            undefined,
            undefined,
            [new TypeDesc('string')],
            new TypeDesc('undefined')
          ),
        ]),
        want: 'undefined type',
      },
      {
        name: 'undefined target type',
        f: new Function('size', undefined, [
          new Overload(
            'size_undefined',
            undefined,
            new TypeDesc('undefined'),
            [new TypeDesc('string')],
            new TypeDesc('int')
          ),
        ]),
        want: 'undefined type',
      },
      {
        name: 'bad target type',
        f: new Function('size', undefined, [
          new Overload(
            'string_size',
            undefined,
            new TypeDesc(''),
            [new TypeDesc('')],
            new TypeDesc('int')
          ),
        ]),
        want: 'invalid type',
      },
      {
        name: 'global function',
        f: new Function('size', undefined, [
          new Overload(
            'size_string',
            undefined,
            undefined,
            [new TypeDesc('string')],
            new TypeDesc('int')
          ),
        ]),
        want: mustNewFunction('size', overload('size_string', [StringType], IntType)),
      },
      {
        name: 'member function',
        f: new Function('size', undefined, [
          new Overload('string_size', undefined, new TypeDesc('string'), [], new TypeDesc('int')),
        ]),
        want: mustNewFunction('size', memberOverload('string_size', StringType, [], IntType)),
      },
      {
        name: 'member function',
        f: new Function('size', 'return the number of unicode points in a string', [
          new Overload(
            'string_size',
            [`'hello'.size() // 5`, `'hello world'.size() // 11`],
            new TypeDesc('string'),
            [],
            new TypeDesc('int')
          ),
        ]),
        want: mustNewFunction(
          'size',
          functionDocs('return the number of unicode code points in a string'),
          memberOverload(
            'string_size',
            StringType,
            [],
            IntType,
            overloadExamples(`'hello'.size() // 5`, `'hello world'.size() // 11`)
          )
        ),
      },
    ];
    const tp = new Registry();
    tp.registerType(newOpaqueType('set', newTypeParamType('T')));
    for (const tc of tests) {
      it(tc.name, () => {
        const gotVar = tc.f.asCELFunction(tp);
        if (gotVar instanceof Error) {
          expect(gotVar.message).toContain(tc.want);
        } else {
          assertFuncEquals(expect, gotVar, tc.want as FunctionDecl);
        }
      });
    }
  });

  describe('TestTypeDescAsCELTypeErrors', () => {
    const tests = [
      // {
      // 	name: "nil-safety check",
      // 	t:    nil,
      // 	want: errors.New("invalid type: nil"),
      // },
      {
        name: 'no type name',
        t: new TypeDesc(''),
        want: 'missing type name',
      },
      {
        name: 'invalid optional_type',
        t: new TypeDesc('optional_type'),
        want: 'expects 1 parameter',
      },
      {
        name: 'invalid optional param type',
        t: new TypeDesc('optional_type', [new TypeDesc('')]),
        want: 'invalid type',
      },
      {
        name: 'undefined optional param type',
        t: new TypeDesc('optional_type', [new TypeDesc('undefined')]),
        want: 'undefined type',
      },
      {
        name: 'invalid param type',
        t: new TypeDesc('T', [new TypeDesc('string')], true),
        want: 'invalid type: param type',
      },
      {
        name: 'invalid list',
        t: new TypeDesc('list'),
        want: 'expects 1 parameter',
      },
      {
        name: 'invalid list param type',
        t: new TypeDesc('list', [new TypeDesc('')]),
        want: 'invalid type',
      },
      {
        name: 'undefined list param type',
        t: new TypeDesc('list', [new TypeDesc('undefined')]),
        want: 'undefined type name',
      },
      {
        name: 'invalid map',
        t: new TypeDesc('map'),
        want: 'expects 2 parameters',
      },
      {
        name: 'invalid map key type',
        t: new TypeDesc('map', [new TypeDesc(''), new TypeDesc('string')]),
        want: 'invalid type',
      },
      {
        name: 'invalid map value type',
        t: new TypeDesc('map', [new TypeDesc('string'), new TypeDesc('')]),
        want: 'invalid type',
      },
      {
        name: 'undefined map key type',
        t: new TypeDesc('map', [new TypeDesc('undefined'), new TypeDesc('undefined')]),
        want: 'undefined type name',
      },
      {
        name: 'undefined map value type',
        t: new TypeDesc('map', [new TypeDesc('string'), new TypeDesc('undefined')]),
        want: 'undefined type name',
      },
      {
        name: 'invalid set',
        t: new TypeDesc('set', [new TypeDesc('')]),
        want: 'invalid type',
      },
      {
        name: 'undefined type identifier',
        t: new TypeDesc('undefined'),
        want: 'undefined type',
      },
    ];
    const tp = new Registry();
    tp.registerType(newOpaqueType('set', newTypeParamType('T')));
    for (const tc of tests) {
      const gotVar = tc.t.asCelType(tp);
      if (gotVar instanceof Error) {
        expect(gotVar.message).toContain(tc.want);
      } else {
        expect(true).toBeFalsy();
      }
    }
  });

  describe('TestLibrarySubsetValidate', () => {
    const tests = [
      // {
      // 	name: "nil library",
      // 	lib:  NewLibrarySubset(),
      // },
      {
        name: 'empty library',
        lib: new LibrarySubset(),
      },
      {
        name: 'only excluded funcs',
        lib: new LibrarySubset().addExcludedFunctions(new Function('size')),
      },
      {
        name: 'only included funcs',
        lib: new LibrarySubset().addIncludedFunctions(new Function('size')),
      },
      {
        name: 'only excluded macros',
        lib: new LibrarySubset().addExcludedMacros('has'),
      },
      {
        name: 'only included macros',
        lib: new LibrarySubset().addIncludedMacros('exists'),
      },
      {
        name: 'both included and excluded funcs',
        lib: new LibrarySubset()
          .addIncludedFunctions(new Function('size'))
          .addExcludedFunctions(new Function('size')),
        want: 'invalid subset',
      },
      {
        name: 'both included and excluded macros',
        lib: new LibrarySubset().addIncludedMacros('has').addExcludedMacros('exists'),
        want: 'invalid subset',
      },
    ];
    for (const tc of tests) {
      it(tc.name, () => {
        const err = tc.lib.validate();
        if (!err) {
          expect(tc.want).toBeFalsy();
          return;
        }
        expect(err.message).toContain(tc.want);
      });
    }
  });

  describe('TestSubsetFunction', () => {
    const tests = [
      //   {
      //     name: 'nil lib, included',
      //     orig: mustNewFunction('size', overload('size_string', [StringType], IntType)),
      //     subset: mustNewFunction('size', overload('size_string', [StringType], IntType)),
      //     included: true,
      //   },
      {
        name: 'empty, included',
        lib: new LibrarySubset(),
        orig: mustNewFunction('size', overload('size_string', [StringType], IntType)),
        subset: mustNewFunction('size', overload('size_string', [StringType], IntType)),
        included: true,
      },
      {
        name: 'empty, disabled',
        lib: new LibrarySubset().setDisabled(true),
        orig: mustNewFunction('size', overload('size_string', [StringType], IntType)),
        included: false,
      },
      {
        name: 'lib, not included allow-list',
        lib: new LibrarySubset().addIncludedFunctions(new Function('int')),
        orig: mustNewFunction('size', overload('size_string', [StringType], IntType)),
        included: false,
      },
      {
        name: 'lib, included whole function',
        lib: new LibrarySubset().addIncludedFunctions(new Function('size')),
        orig: mustNewFunction('size', overload('size_string', [StringType], IntType)),
        subset: mustNewFunction('size', overload('size_string', [StringType], IntType)),
        included: true,
      },
      {
        name: 'lib, included overload subset',
        lib: new LibrarySubset().addIncludedFunctions(
          new Function('size', undefined, [new Overload('size_string')])
        ),
        orig: mustNewFunction(
          'size',
          overload('size_string', [StringType], IntType),
          overload('size_list', [newListType(newTypeParamType('T'))], IntType)
        ),
        subset: mustNewFunction('size', overload('size_string', [StringType], IntType)),
        included: true,
      },
      {
        name: 'lib, included deny-list',
        lib: new LibrarySubset().addExcludedFunctions(new Function('int')),
        orig: mustNewFunction('size', overload('size_string', [StringType], IntType)),
        subset: mustNewFunction('size', overload('size_string', [StringType], IntType)),
        included: true,
      },
      {
        name: 'lib, excluded whole function',
        lib: new LibrarySubset().addExcludedFunctions(new Function('size')),
        orig: mustNewFunction('size', overload('size_string', [StringType], IntType)),
        included: false,
      },
      {
        name: 'lib, excluded partial function',
        lib: new LibrarySubset().addExcludedFunctions(
          new Function('size', undefined, [new Overload('size_list')])
        ),
        orig: mustNewFunction(
          'size',
          overload('size_string', [StringType], IntType),
          overload('size_list', [newListType(newTypeParamType('T'))], IntType)
        ),
        subset: mustNewFunction('size', overload('size_string', [StringType], IntType)),
        included: true,
      },
    ];
    for (const tc of tests) {
      const got = tc.lib?.subsetFunction(tc.orig);
      expect(!!got).toEqual(tc.included);
      if (!tc.included || !tc.subset) {
        continue;
      }
      assertFuncEquals(expect, got as FunctionDecl, tc.subset);
    }
  });

  describe('TestSubsetMacro', () => {
    const tests = [
      // {
      // 	name:      "nil lib, included",
      // 	macroName: "has",
      // 	included:  true,
      // },
      {
        name: 'empty, included',
        lib: new LibrarySubset(),
        macroName: 'has',
        included: true,
      },
      {
        name: 'empty, disabled',
        lib: new LibrarySubset().setDisabled(true),
        macroName: 'has',
        included: false,
      },
      {
        name: 'empty, included',
        lib: new LibrarySubset().setDisableMacros(true),
        macroName: 'has',
        included: false,
      },
      {
        name: 'lib, not included allow-list',
        lib: new LibrarySubset().addIncludedMacros('exists'),
        macroName: 'has',
        included: false,
      },
      {
        name: 'lib, included allow-list',
        lib: new LibrarySubset().addIncludedMacros('exists'),
        macroName: 'exists',
        included: true,
      },
      {
        name: 'lib, not included deny-list',
        lib: new LibrarySubset().addExcludedMacros('exists'),
        macroName: 'exists',
        included: false,
      },
      {
        name: 'lib, included deny-list',
        lib: new LibrarySubset().addExcludedMacros('exists'),
        macroName: 'has',
        included: true,
      },
    ];
    for (const tc of tests) {
      it(tc.name, () => {
        const included = tc.lib.subsetMacro(tc.macroName);
        expect(included).toEqual(tc.included);
      });
    }
  });

  describe('TestNewExtension', () => {
    const tests = [
      {
        name: 'strings',
        version: MAX_UINT32,
        want: new Extension('strings', 'latest'),
      },
      {
        name: 'bindings',
        version: 1,
        want: new Extension('bindings', '1'),
      },
    ];
    for (const test of tests) {
      it(test.name, () => {
        const ext = new Extension(test.name, test.version.toString());
        expect(ext.name).toEqual(test.want.name);
        expect(ext.version).toEqual(test.want.version);
      });
    }
  });

  describe('TestExtensionGetVersion', () => {
    const tests = [
      // {
      // 	name: "nil extension",
      // 	want: errors.New("invalid extension: nil"),
      // },
      {
        name: 'missing name',
        ext: new Extension(''),
        want: 'missing name',
      },
      {
        name: 'unset version',
        ext: new Extension('test'),
        want: 0,
      },
      {
        name: 'numeric version',
        ext: Extension.fromJson({ name: 'test', version: '1' }),
        want: 1,
      },
      {
        name: 'latest version',
        ext: Extension.fromJson({ name: 'test', version: 'latest' }),
        want: MAX_UINT32,
      },
      {
        name: 'bad version',
        ext: Extension.fromJson({ name: 'test', version: '1.0' }),
        want: 'invalid extension',
      },
    ];
    for (const test of tests) {
      it(test.name, () => {
        const version = test.ext?.versionNumber();
        if (version instanceof Error) {
          expect(version?.message).toContain(test.want);
        } else {
          expect(version).toEqual(test.want);
        }
      });
    }
  });

  describe('TestValidatorValidate', () => {
    const tests = [
      // {
      // 	name: "nil validator",
      // 	v:    nil,
      // 	want: errors.New("invalid validator: nil"),
      // },
      {
        name: 'empty validator',
        v: new Validator(''),
        want: 'missing name',
      },
    ];
    for (const test of tests) {
      it(test.name, () => {
        expect(test.v?.validate()?.message).toContain(test.want);
      });
    }
  });

  describe('TestValidatorConfigValue', () => {
    it('should work', () => {
      let v = new Validator('');
      expect(v.configValue('limit')).toEqual(undefined);
      v = new Validator('validator');
      v.setConfig({ limit: 2 });
      expect(v.configValue('absent')).toEqual(undefined);
      expect(v.configValue('limit')).toEqual(2);
    });
  });

  describe('TestFeatureValidate', () => {
    const tests = [
      // {
      // 	name: "nil feature",
      // 	f:    null,
      // 	want: ("invalid feature: nil"),
      // },
      {
        name: 'empty feature',
        f: new Feature('', true),
        want: 'missing name',
      },
    ];
    for (const test of tests) {
      it(test.name, () => {
        expect(test.f?.validate()?.message).toContain(test.want);
      });
    }
  });

  it('should round trip valid YAML', () => {
    const files = ['context_env.yaml', 'extended_env.yaml', 'subset_env.yaml'];
    for (const file of files) {
      const yaml = readFileSync(join(__dirname, 'testdata', file), 'utf8');
      const config = unmarshalYAML(yaml);
      const serialized = marshalYAML(config);
      expect(unmarshalYAML(serialized)).toEqual(config);
    }
  });
});

function mustNewFunction(name: string, ...opts: FunctionOpt[]): FunctionDecl {
  const decl = newFunction(name, ...opts);
  if (decl instanceof Error) {
    throw new Error(`Failed to create function ${name}: ${decl.message}`);
  }
  return decl;
}

function assertFuncEquals(expect: jest.Expect, got: FunctionDecl, want: FunctionDecl) {
  if (got?.name() !== want?.name()) {
    expect('').toEqual(`got function name ${got?.name()}, wanted ${want?.name()}`);
  }
  if (got?.overloadDecls().length !== want?.overloadDecls().length) {
    expect('').toEqual(
      `got overload count ${got.overloadDecls().length}, wanted ${want.overloadDecls().length}`
    );
  }
  for (let i = 0; i < got.overloadDecls().length; i++) {
    const gotOverload = got.overloadDecls()[i];
    const wantOverload = want.overloadDecls()[i];
    if (gotOverload?.id() !== wantOverload?.id()) {
      expect('').toEqual(`got overload id ${gotOverload?.id()}, wanted ${wantOverload?.id()}`);
    }
    if (gotOverload.isMemberFunction() !== wantOverload.isMemberFunction()) {
      expect('').toEqual(
        `got is member function ${gotOverload.isMemberFunction()}, wanted ${wantOverload.isMemberFunction()}`
      );
    }
    if (gotOverload.argTypes().length !== wantOverload.argTypes().length) {
      expect('').toEqual(
        `got arg count ${gotOverload.argTypes().length}, wanted ${wantOverload.argTypes().length}`
      );
    }
    for (let j = 0; j < gotOverload.argTypes().length; j++) {
      const gotType = gotOverload.argTypes()[j];
      const wantType = wantOverload.argTypes()[j];
      if (!gotType.isExactType(wantType)) {
        expect('').toEqual(`got arg[${j}] type ${gotType}, wanted ${wantType}`);
      }
    }
    if (gotOverload.typeParams().length !== wantOverload.typeParams().length) {
      expect('').toEqual(
        `got type param count ${gotOverload.typeParams().length}, wanted ${
          wantOverload.typeParams().length
        }`
      );
    }
    for (let j = 0; j < gotOverload.typeParams().length; j++) {
      const gotTypeParam = gotOverload.typeParams()[j];
      const wantTypeParam = wantOverload.typeParams()[j];
      if (gotTypeParam !== wantTypeParam) {
        expect('').toEqual(`got type param[${j}] ${gotTypeParam}, wanted ${wantTypeParam}`);
      }
    }
    if (!gotOverload.resultType().isExactType(wantOverload.resultType())) {
      expect('').toEqual(
        `got result type ${gotOverload.resultType()}, wanted ${wantOverload.resultType()}`
      );
    }
  }
  expect(true).toBeTruthy();
}

function unmarshalYAML(data: string): Config {
  const parsed = parse(data) as ConfigJson;
  return Config.fromJson(parsed);
}

function marshalYAML(config: Config): string {
  const data = config.toJson();
  return stringify(data);
}
