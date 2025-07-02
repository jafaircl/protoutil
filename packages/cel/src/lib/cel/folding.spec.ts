import { create } from '@bufbuild/protobuf';
import { ImportEnum, ImportEnumSchema } from '@protoutil/core/unittest-proto2';
import { TestAllTypesSchema } from '../protogen-exports/index_conformance_proto3.js';
import { constant, DynType, IntType, listType, objectType, StringType, variable } from './decls.js';
import { Env, Issues } from './env.js';
import { ConstantFoldingOptimizer, ConstantFoldingOption, foldKnownValues } from './folding.js';
import { astToString } from './io.js';
import { StaticOptimizer } from './optimizer.js';
import { enableMacroCallTracking, enableOptionalSyntax, types } from './options.js';
import { newActivation } from './program.js';

describe('folding', () => {
  describe('TestConstantFoldingOptimizer', () => {
    const testCases = [
      {
        expr: `[1, 1 + 2, 1 + (2 + 3)]`,
        folded: `[1, 3, 6]`,
      },
      {
        expr: `6 in [1, 1 + 2, 1 + (2 + 3)]`,
        folded: `true`,
      },
      {
        expr: `5 in [1, 1 + 2, 1 + (2 + 3)]`,
        folded: `false`,
      },
      {
        expr: `x in [1, 1 + 2, 1 + (2 + 3)]`,
        folded: `x in [1, 3, 6]`,
      },
      {
        expr: `1 in [1, x + 2, 1 + (2 + 3)]`,
        folded: `true`,
      },
      {
        expr: `1 in [x, x + 2, 1 + (2 + 3)]`,
        folded: `1 in [x, x + 2, 6]`,
      },
      {
        expr: `x in []`,
        folded: `false`,
      },
      {
        expr: `{'hello': 'world'}.hello == x`,
        folded: `"world" == x`,
      },
      // TODO: optional library
      //   {
      //     expr: `{'hello': 'world'}.?hello.orValue('default') == x`,
      //     folded: `"world" == x`,
      //   },
      {
        expr: `{'hello': 'world'}['hello'] == x`,
        folded: `"world" == x`,
      },
      // TODO: optional library
      //   {
      //     expr: `optional.of("hello")`,
      //     folded: `optional.of("hello")`,
      //   },
      // TODO: optional library
      //   {
      //     expr: `optional.ofNonZeroValue("")`,
      //     folded: `optional.none()`,
      //   },
      // TODO: optional library
      //   {
      //     expr:   `{?'hello': optional.of('world')}['hello'] == x`,
      // 	 folded: `"world" == x`,
      //   },
      {
        expr: `duration(string(7 * 24) + 'h')`,
        folded: `duration("604800s")`,
      },
      {
        expr: `timestamp("1970-01-01T00:00:00Z")`,
        folded: `timestamp("1970-01-01T00:00:00Z")`,
      },
      {
        expr: `[1, 1 + 1, 1 + 2, 2 + 3].exists(i, i < 10)`,
        folded: `true`,
      },
      {
        expr: `[1, 1 + 1, 1 + 2, 2 + 3].exists(i, i < 1 % 2)`,
        folded: `false`,
      },
      {
        expr: `[1, 2, 3].map(i, [1, 2, 3].map(j, i * j))`,
        folded: `[[1, 2, 3], [2, 4, 6], [3, 6, 9]]`,
      },
      {
        expr: `[1, 2, 3].map(i, [1, 2, 3].map(j, i * j).filter(k, k % 2 == 0))`,
        folded: `[[2], [2, 4, 6], [6]]`,
      },
      {
        expr: `[1, 2, 3].map(i, [1, 2, 3].map(j, i * j).filter(k, k % 2 == x))`,
        folded: `[1, 2, 3].map(i, [1, 2, 3].map(j, i * j).filter(k, k % 2 == x))`,
      },
      {
        expr: `[{}, {"a": 1}, {"b": 2}].filter(m, has(m.a))`,
        folded: `[{"a": 1}]`,
      },
      {
        expr: `[{}, {"a": 1}, {"b": 2}].filter(m, has({'a': true}.a))`,
        folded: `[{}, {"a": 1}, {"b": 2}]`,
      },
      {
        expr: `type(1)`,
        folded: `int`,
      },
      {
        expr: `[cel.expr.conformance.proto3.TestAllTypes{single_int32: 2 + 3}].map(i, i)[0]`,
        folded: `cel.expr.conformance.proto3.TestAllTypes{single_int32: 5}`,
      },
      // TODO: optional library
      //   {
      //     expr: `[?optional.ofNonZeroValue(0)]`,
      //     folded: `[]`,
      //   },
      // TODO: optional library
      //   {
      //     expr: `[1, ?optional.ofNonZeroValue(0)]`,
      //     folded: `[1]`,
      //   },
      // TODO: optional library
      //   {
      //     expr: `[optional.none(), ?x]`,
      //     folded: `[optional.none(), ?x]`,
      //   },
      // TODO: optional library
      //   {
      //     expr: `[?optional.none(), ?x]`,
      //     folded: `[?x]`,
      //   },
      // TODO: optional library
      //   {
      //     expr: `[1, x, ?optional.ofNonZeroValue(0), ?x.?y]`,
      //     folded: `[1, x, ?x.?y]`,
      //   },
      // TODO: optional library
      //   {
      //     expr: `[1, x, ?optional.ofNonZeroValue(3), ?x.?y]`,
      //     folded: `[1, x, 3, ?x.?y]`,
      //   },
      // TODO: optional library
      //   {
      //     expr: `[1, x, ?optional.ofNonZeroValue(3), ?x.?y].size() > 3`,
      //     folded: `[1, x, 3, ?x.?y].size() > 3`,
      //   },
      // TODO: optional library
      //   {
      //     expr: `{?'a': optional.of('hello'), ?x : optional.of(1), ?'b': optional.none()}`,
      //     folded: `{"a": "hello", ?x: optional.of(1)}`,
      //   },
      {
        expr: `true ? x + 1 : x + 2`,
        folded: `x + 1`,
      },
      {
        expr: `false ? x + 1 : x + 2`,
        folded: `x + 2`,
      },
      {
        expr: `false ? x + 'world' : 'hello' + 'world'`,
        folded: `"helloworld"`,
      },
      {
        expr: `true && x`,
        folded: `x`,
      },
      {
        expr: `x && true`,
        folded: `x`,
      },
      {
        expr: `false && x`,
        folded: `false`,
      },
      {
        expr: `x && false`,
        folded: `false`,
      },
      {
        expr: `true || x`,
        folded: `true`,
      },
      {
        expr: `x || true`,
        folded: `true`,
      },
      {
        expr: `false || x`,
        folded: `x`,
      },
      {
        expr: `x || false`,
        folded: `x`,
      },
      {
        expr: `true && x && true && x`,
        folded: `x && x`,
      },
      {
        expr: `false || x || false || x`,
        folded: `x || x`,
      },
      {
        expr: `true && true`,
        folded: `true`,
      },
      {
        expr: `true && false`,
        folded: `false`,
      },
      {
        expr: `true || false`,
        folded: `true`,
      },
      {
        expr: `false || false`,
        folded: `false`,
      },
      {
        expr: `true && false || true`,
        folded: `true`,
      },
      {
        expr: `false && true || false`,
        folded: `false`,
      },
      {
        expr: `null`,
        folded: `null`,
      },
      // TODO: optional library
      //   {
      //     expr: `google.expr.proto3.test.TestAllTypes{?single_int32: optional.ofNonZeroValue(1)}`,
      //     folded: `google.expr.proto3.test.TestAllTypes{single_int32: 1}`,
      //   },
      // TODO: optional library
      //   {
      //     expr: `cel.expr.conformance.proto3.TestAllTypes{?single_int32: optional.ofNonZeroValue(0)}`,
      //     folded: `cel.expr.conformance.proto3.TestAllTypes{}`,
      //   },
      {
        expr: `cel.expr.conformance.proto3.TestAllTypes{single_int32: x, repeated_int32: [1, 2, 3]}`,
        folded: `cel.expr.conformance.proto3.TestAllTypes{single_int32: x, repeated_int32: [1, 2, 3]}`,
      },
      {
        expr: `x + dyn([1, 2] + [3, 4])`,
        folded: `x + [1, 2, 3, 4]`,
      },
      {
        expr: `dyn([1, 2]) + [3.0, 4.0]`,
        folded: `[1, 2, 3.0, 4.0]`,
      },
      {
        expr: `{'a': dyn([1, 2]), 'b': x}`,
        folded: `{"a": [1, 2], "b": x}`,
      },
      {
        expr: `1 + x + 2 == 2 + x + 1`,
        folded: `1 + x + 2 == 2 + x + 1`,
      },
      {
        // The order of operations makes it such that the appearance of x in the first means that
        // none of the values provided into the addition call will be folded with the current
        // implementation. Ideally, the result would be 3 + x == x + 3 (which could be trivially true
        // and more easily observed as a result of common subexpression eliminiation)
        expr: `1 + 2 + x ==  x + 2 + 1`,
        folded: `3 + x == x + 2 + 1`,
      },
      {
        expr: `proto2_unittest_import.ImportEnum.IMPORT_BAR`,
        folded: `8`,
        knownValues: {},
      },
      // TODO: why is this any different from the above?
      //   {
      //     expr: `proto2_unittest_import.ImportEnum.IMPORT_BAR`,
      //     folded: `proto2_unittest_import.ImportEnum.IMPORT_BAR`,
      //   },
      {
        expr: `c == proto2_unittest_import.ImportEnum.IMPORT_BAZ ? "BAZ" : "Unknown"`,
        folded: `"BAZ"`,
        knownValues: {},
      },
      {
        expr: `[
                      proto2_unittest_import.ImportEnum.IMPORT_BAR,
                      c,
                      proto2_unittest_import.ImportEnum.IMPORT_FOO
                  ].exists(e, e == proto2_unittest_import.ImportEnum.IMPORT_FOO)
                      ? "has Foo" : "no Foo"`,
        folded: `"has Foo"`,
        knownValues: {},
      },
      {
        expr: `l.exists(e, e == "foo") ? "has Foo" : "no Foo"`,
        folded: `"has Foo"`,
        knownValues: {
          l: ['foo', 'bar', 'baz'],
        },
      },
      {
        expr: `"foo" in l`,
        folded: `true`,
        knownValues: {
          l: ['foo', 'bar', 'baz'],
        },
      },
      {
        expr: `o.repeated_int32`,
        folded: `[1.0, 2.0, 3.0]`,
        knownValues: {
          o: create(TestAllTypesSchema, { repeatedInt32: [1, 2, 3] }),
        },
      },
    ];
    let e = new Env(
      enableOptionalSyntax(true),
      enableMacroCallTracking(),
      types(TestAllTypesSchema, ImportEnumSchema),
      variable('x', DynType),
      constant('c', IntType, ImportEnum.IMPORT_BAZ)
    );
    e = e.extend(variable('l', listType(StringType)));
    e = e.extend(variable('o', objectType('cel.expr.conformance.proto3.TestAllTypes')));

    for (const tc of testCases) {
      it(`should fold ${tc.expr}`, () => {
        const checked = e.compile(tc.expr);
        if (checked instanceof Issues) {
          throw checked.err();
        }
        const foldingOpts: ConstantFoldingOption[] = [];
        if (tc.knownValues) {
          const knownValues = newActivation(tc.knownValues);
          foldingOpts.push(foldKnownValues(knownValues));
        }
        const folder = new ConstantFoldingOptimizer(...foldingOpts);
        const opt = new StaticOptimizer(folder);
        const optimized = opt.optimize(e, checked);
        if (optimized instanceof Issues) {
          throw optimized.err();
        }
        const folded = astToString(optimized);
        expect(folded).toEqual(tc.folded);
      });
    }
  });
});
