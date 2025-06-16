/* eslint-disable @typescript-eslint/no-explicit-any */
import { create, createRegistry } from '@bufbuild/protobuf';
import { timestampFromDateString } from '@protoutil/core';
import { Container } from '../common/container.js';
import { StringSource } from '../common/source.js';
import { Registry } from '../common/types/provider.js';
import { AllMacros } from '../parser/macro.js';
import { enableOptionalSyntax, macros, Parser, populateMacroCalls } from '../parser/parser.js';
import { unparse } from '../parser/unparser.js';
import { TestAllTypesSchema } from '../protogen-exports/index_conformance_proto3.js';
import { newActivation, PartActivation, PartialActivation } from './activation.js';
import { AttributePattern, PartialAttributeFactory } from './attribute-patterns.js';
import { DefaultDispatcher } from './dispatcher.js';
import { EvalState } from './evalstate.js';
import {
  evalStateFactory,
  evalStateObserver,
  exhaustiveEval,
  ExprInterpreter,
} from './interpreter.js';
import { addFunctionBindings } from './interpreter.spec.js';
import { AstPruner } from './prune.js';

describe('Prune', () => {
  const testCases: { in?: any; expr: string; out: string; iterRange?: string }[] = [
    {
      expr: `{{'nested_key': true}.nested_key: true}`,
      out: `{true: true}`,
    },
    {
      in: {
        msg: { foo: 'bar' },
      },
      expr: `msg`,
      out: `{"foo": "bar"}`,
    },
    {
      expr: `true && false`,
      out: `false`,
    },
    {
      in: unknownActivation('x'),
      expr: `(true || false) && x`,
      out: `x`,
    },
    {
      in: unknownActivation('x'),
      expr: `(false || false) && x`,
      out: `false`,
    },
    {
      in: unknownActivation('a'),
      expr: `a && [1, 1u, 1.0].exists(x, type(x) == uint)`,
      out: `a`,
    },
    {
      in: unknownActivation('this'),
      expr: `this in []`,
      out: `false`,
    },
    {
      in: partialActivation(
        {
          this: { b: 'exists' },
        },
        new AttributePattern('this')
      ),
      expr: `has(this.a) || !has(this.b)`,
      out: `has(this.a) || !has(this.b)`,
    },
    {
      in: partialActivation(
        {
          this: {},
        },
        new AttributePattern('this').qualString('a')
      ),
      expr: `has(this.a)`,
      out: `has(this.a)`,
    },
    {
      in: partialActivation(
        {
          this: { b: 'exists' },
        },
        new AttributePattern('this').qualString('a')
      ),
      expr: `has(this.a) || !has(this.b)`,
      out: `has(this.a)`,
    },
    {
      in: partialActivation(
        {
          this: { b: 'exists' },
        },
        new AttributePattern('this').qualString('a')
      ),
      expr: `!has(this.b) || has(this.a)`,
      out: `has(this.a)`,
    },
    {
      in: partialActivation(
        {
          this: {},
        },
        new AttributePattern('this')
      ),
      expr: `(!(this.a in []) || has(this.a)) || !has(this.b)`,
      out: `true`,
    },
    {
      in: partialActivation(
        {
          this: {},
        },
        new AttributePattern('this')
      ),
      expr: `has(this.a) || !has(this.b)`,
      out: `has(this.a) || !has(this.b)`,
    },
    {
      in: partialActivation(
        {
          this: {},
        },
        new AttributePattern('this')
      ),
      expr: `(has(this.a) || !(this.a in [])) || !has(this.b)`,
      out: `true`,
    },
    {
      in: partialActivation(
        {
          this: { a: 'exists' },
        },
        new AttributePattern('this').qualString('b')
      ),
      expr: `has(this.a) && !has(this.b)`,
      out: `!has(this.b)`,
    },
    {
      in: partialActivation(
        {
          this: {},
        },
        new AttributePattern('this')
      ),
      expr: `(has(this.a) && this.a in []) || !has(this.b)`,
      out: `!has(this.b)`,
    },
    {
      in: partialActivation(
        {
          this: {},
        },
        new AttributePattern('this')
      ),
      expr: `(this.a in [] && has(this.a)) || !has(this.b)`,
      out: `!has(this.b)`,
    },
    {
      in: partialActivation(
        {
          this: { a: {} },
        },
        new AttributePattern('this').qualString('a')
      ),
      expr: `has(this.a.b)`,
      out: `has(this.a.b)`,
    },
    {
      in: partialActivation(
        {
          this: { a: {} },
        },
        new AttributePattern('this').qualString('a')
      ),
      expr: `has(this["a"].b)`,
      out: `has(this["a"].b)`,
    },
    {
      in: partialActivation({
        this: create(TestAllTypesSchema, { singleInt32: 0, singleInt64: 1n }),
      }),
      expr: `has(this.single_int32) && !has(this.single_int64)`,
      out: `false`,
    },
    {
      in: partialActivation(
        {
          this: create(TestAllTypesSchema, { singleInt32: 0, singleInt64: 1n }),
        },
        new AttributePattern('this').qualString('single_int64')
      ),
      expr: `has(this.single_int32) && !has(this.single_int64)`,
      out: `false`,
    },
    {
      in: unknownActivation('this'),
      expr: `this in {}`,
      out: `false`,
    },
    {
      in: partialActivation({ rules: [] }, 'this'),
      expr: `this in rules`,
      out: `false`,
    },
    {
      in: partialActivation({ rules: { not_in: [] } }, 'this'),
      expr: `this.size() > 0 ? this in rules.not_in : !(this in rules.not_in)`,
      out: `(this.size() > 0) ? false : true`,
    },
    {
      in: partialActivation({ rules: { not_in: [] } }, 'this'),
      expr: `this.size() > 0 ? this in rules.not_in :
          !(this in rules.not_in) ? true : false`,
      out: `(this.size() > 0) ? false : true`,
    },
    {
      expr: `{'hello': 'world'.size()}`,
      out: `{"hello": 5}`,
    },
    {
      expr: `[b'bytes-string']`,
      out: `[b"\\142\\171\\164\\145\\163\\055\\163\\164\\162\\151\\156\\147"]`,
    },
    {
      expr: `[b'bytes'] + [b'-' + b'string']`,
      out: `[b"\\142\\171\\164\\145\\163", b"\\055\\163\\164\\162\\151\\156\\147"]`,
    },
    {
      expr: `1u + 3u`,
      out: `4u`,
    },
    {
      expr: `2 < 3`,
      out: `true`,
    },
    {
      expr: `!false`,
      out: `true`,
    },
    {
      in: unknownActivation('y'),
      expr: `!y`,
      out: `!y`,
    },
    // TODO: optionals
    // {
    //   in:   partialActivation(map[string]any{"y": 10}),
    //   expr: `optional.of(y)`,
    //   out:  `optional.of(10)`,
    // },
    // {
    //   in:   unknownActivation("a"),
    //   expr: `a.?b`,
    //   out:  `a.?b`,
    // },
    // {
    //   in:   partialActivation(map[string]any{"a": map[string]any{"b": 10}}),
    //   expr: `a.?b`,
    //   out:  `optional.of(10)`,
    // },
    // {
    //   in:   partialActivation(map[string]any{"a": map[string]any{"b": 10}}),
    //   expr: `a[?"b"]`,
    //   out:  `optional.of(10)`,
    // },
    // {
    //   in:   unknownActivation(),
    //   expr: `{'b': optional.of(10)}.?b`,
    //   out:  `optional.of(optional.of(10))`,
    // },
    // {
    //   in:   partialActivation(map[string]any{"a": map[string]any{}}),
    //   expr: `a.?b`,
    //   out:  `optional.none()`,
    // },
    // {
    //   in:   unknownActivation(),
    //   expr: `[10].last()`,
    //   out:  "optional.of(10)",
    // },
    // {
    //   in:   unknownActivation(),
    //   expr: `[].last()`,
    //   out:  "optional.none()",
    // },
    // {
    //   in:   unknownActivation("a"),
    //   expr: `a[?"b"]`,
    //   out:  `a[?"b"]`,
    // },
    // {
    //   in:   unknownActivation(),
    //   expr: `[1, 2, 3, ?optional.none()]`,
    //   out:  `[1, 2, 3]`,
    // },
    // {
    //   in:   unknownActivation(),
    //   expr: `[1, 2, 3, ?optional.of(10)]`,
    //   out:  `[1, 2, 3, 10]`,
    // },
    // {
    //   in:   unknownActivation(),
    //   expr: `{1: 2, ?3: optional.none()}`,
    //   out:  `{1: 2}`,
    // },
    // {
    //   in:   unknownActivation("a"),
    //   expr: `[?optional.none(), a, 2, 3]`,
    //   out:  `[a, 2, 3]`,
    // },
    // {
    //   in:   unknownActivation("a"),
    //   expr: `[?optional.of(10), ?a, 2, 3]`,
    //   out:  `[10, ?a, 2, 3]`,
    // },
    // {
    //   in:   unknownActivation("a"),
    //   expr: `[?optional.of(10), a, 2, 3]`,
    //   out:  `[10, a, 2, 3]`,
    // },
    // {
    //   in:   partialActivation(map[string]any{"a": "hi"}, "b"),
    //   expr: `{?a: b.?c}`,
    //   out:  `{?"hi": b.?c}`,
    // },
    // {
    //   in:   partialActivation(map[string]any{"a": "hi"}, "b"),
    //   expr: `"hi" in {?a: b.?c}`,
    //   out:  `"hi" in {?"hi": b.?c}`,
    // },
    // {
    //   in:   partialActivation(map[string]any{"a": "hi"}, "b"),
    //   expr: `"hi" in {?a: optional.of("world")}`,
    //   out:  `true`,
    // },
    // {
    //   in:   partialActivation(map[string]any{"a": "hi"}, "b"),
    //   expr: `{?a: optional.of("world")}[b]`,
    //   out:  `{"hi": "world"}[b]`,
    // },
    {
      in: unknownActivation('y'),
      expr: `duration('1h') + duration('2h') > y`,
      out: `duration("10800s") > y`,
    },
    {
      in: unknownActivation('x'),
      expr: `[x, timestamp(0)]`,
      out: `[x, timestamp(0)]`,
    },
    {
      expr: `[timestamp(0), timestamp(1)]`,
      out: `[timestamp("1970-01-01T00:00:00Z"), timestamp("1970-01-01T00:00:01Z")]`,
    },
    {
      expr: `{"epoch": timestamp(0)}`,
      out: `{"epoch": timestamp("1970-01-01T00:00:00Z")}`,
    },
    {
      in: partialActivation({ x: false }, 'y'),
      expr: `!y && !x`,
      out: `!y`,
    },
    {
      expr: `!y && !(1/0 < 0)`,
      out: `!y && !(1 / 0 < 0)`,
    },
    {
      in: partialActivation({ y: false }),
      expr: `!y && !(1/0 < 0)`,
      out: `!(1 / 0 < 0)`,
    },
    {
      in: unknownActivation(),
      expr: `test == null`,
      out: `test == null`,
    },
    {
      in: unknownActivation(),
      expr: `test == null || true`,
      out: `true`,
    },
    {
      in: unknownActivation(),
      expr: `test == null && false`,
      out: `false`,
    },
    {
      in: unknownActivation('b', 'c'),
      expr: `true ? b < 1.2 : c == ['hello']`,
      out: `b < 1.2`,
    },
    {
      in: unknownActivation('b', 'c'),
      expr: `false ? b < 1.2 : c == ['hello']`,
      out: `c == ["hello"]`,
    },
    {
      in: unknownActivation(),
      expr: `[1+3, 2+2, 3+1, four]`,
      out: `[4, 4, 4, four]`,
    },
    {
      in: unknownActivation(),
      expr: `test == {'a': 1, 'field': 2}.field`,
      out: `test == 2`,
    },
    {
      in: unknownActivation(),
      expr: `test in {'a': 1, 'field': [2, 3]}.field`,
      out: `test in [2, 3]`,
    },
    {
      in: unknownActivation(),
      expr: `test == {'field': [1 + 2, 2 + 3]}`,
      out: `test == {"field": [3, 5]}`,
    },
    // TODO: this one gives a weird output result. Need to look into lists
    // {
    //   in: unknownActivation(),
    //   expr: `test in {'a': 1, 'field': [test, 3]}.field`,
    //   out: `test in {"a": 1, "field": [test, 3]}.field`,
    // },
    {
      in: partialActivation({ foo: 'bar' }, 'r.attr'),
      expr: `foo == "bar" && r.attr.loc in ["GB", "US"]`,
      out: `r.attr.loc in ["GB", "US"]`,
    },
    {
      in: partialActivation(
        {
          users: [
            { name: 'alice', role: 'EMPLOYEE' },
            { name: 'bob', role: 'MANAGER' },
            { name: 'eve', role: 'CUSTOMER' },
          ],
        },
        'r.attr'
      ),
      expr: `users.filter(u, u.role=="MANAGER").map(u, u.name) == r.attr.authorized["managers"]`,
      out: `["bob"] == r.attr.authorized["managers"]`,
    },
    {
      in: partialActivation(
        {
          users: ['alice', 'bob'],
        },
        new AttributePattern('r').qualString('attr').wildcard()
      ),
      expr: `users.filter(u, u.startsWith(r.attr.prefix))`,
      out: `["alice", "bob"].filter(u, u.startsWith(r.attr.prefix))`,
      iterRange: `["alice", "bob"]`,
    },
    {
      in: partialActivation(
        {
          users: ['alice', 'bob'],
        },
        new AttributePattern('r').qualString('attr').wildcard()
      ),
      expr: `users.filter(u, r.attr.prefix.endsWith(u))`,
      out: `["alice", "bob"].filter(u, r.attr.prefix.endsWith(u))`,
      iterRange: `["alice", "bob"]`,
    },
    {
      in: unknownActivation('four'),
      expr: `[1+3, 2+2, 3+1, four]`,
      out: `[4, 4, 4, four]`,
    },
    {
      in: unknownActivation('four'),
      expr: `[1+3, 2+2, 3+1, four].exists(x, x == four)`,
      out: `[4, 4, 4, four].exists(x, x == four)`,
      iterRange: `[4, 4, 4, four]`,
    },
    {
      in: unknownActivation('a', 'c'),
      expr: `[has(a.b), has(c.d)].exists(x, x == true)`,
      out: `[has(a.b), has(c.d)].exists(x, x == true)`,
    },
    {
      in: partialActivation(
        {
          a: {},
        },
        'c'
      ),
      expr: `[has(a.b), has(c.d)].exists(x, x == true)`,
      out: `[false, has(c.d)].exists(x, x == true)`,
    },
    {
      in: partialActivation(
        {
          a: {},
        },
        'c'
      ),
      expr: `[has(a.b), has(c.d)].exists(x, x == true)`,
      out: `[false, has(c.d)].exists(x, x == true)`,
      iterRange: `[false, has(c.d)]`,
    },
    // TODO: optionals
    // {
    //   in: partialActivation({
    //     a: {},
    //   }),
    //   expr: `[?a[?0], a.b]`,
    //   out: `[a.b]`,
    // },
    // {
    //   in: partialActivation(
    //     {
    //       a: {},
    //     },
    //     'a'
    //   ),
    //   expr: `[?a[?0], a.b].exists(x, x == true)`,
    //   out: `[?a[?0], a.b].exists(x, x == true)`,
    // },
    // {
    //   in: partialActivation(map[string]any{
    //     "a": map[string]string{},
    //   }),
    //   expr: `[?a[?0], a.b].exists(x, x == true)`,
    //   out:  `[a.b].exists(x, x == true)`,
    // },
    {
      in: partialActivation({
        a: {},
      }),
      expr: `[a[0], a.b].exists(x, x == true)`,
      out: `[a[0], a.b].exists(x, x == true)`,
    },
    {
      in: partialActivation({}, 'x', 'y'),
      expr: `x < 10 && (y == 0 || 'hello' != 'goodbye')`,
      out: `x < 10`,
    },
    // subject-action-resource-environment pass
    {
      in: partialActivation({
        subject: {
          name: {
            first: 'Alice',
            last: 'Smith',
          },
        },
        action: 'create',
        environment: {
          time: timestampFromDateString('2023-10-01T00:00:00Z'),
        },
      }),
      expr: `subject.name.first == 'Alice' && action == 'create' && environment.time > timestamp('2023-09-30T23:59:59Z') && resource.type == 'document'`,
      out: `resource.type == "document"`,
    },
    // subject-action-resource-environment fail
    {
      in: partialActivation({
        subject: {
          name: {
            first: 'Alice',
            last: 'Smith',
          },
        },
        action: 'create',
        environment: {
          time: timestampFromDateString('2023-10-01T00:00:00Z'),
        },
      }),
      expr: `subject.name.first == 'Joe' && action == 'read' && environment.time > timestamp('2024-09-30T23:59:59Z') && resource.type == 'document'`,
      out: `false`,
    },
  ];
  for (const tc of testCases) {
    it(`should prune: ${tc.expr}`, () => {
      const p = new Parser(
        enableOptionalSyntax(true),
        populateMacroCalls(true),
        macros(...AllMacros)
      );
      const parsed = p.parse(new StringSource(tc.expr, '<input>'));
      const state = new EvalState();
      const reg = new Registry(undefined, createRegistry(TestAllTypesSchema));
      const attrs = new PartialAttributeFactory(new Container(), reg, reg);
      const dispatcher = new DefaultDispatcher();
      addFunctionBindings(dispatcher);
      // dispatcher.Add(funcBindings(t, optionalDecls(t)...)...)
      const interp = new ExprInterpreter(dispatcher, new Container(), reg, reg, attrs);
      const interpretable = interp.newInterpretable(
        parsed,
        exhaustiveEval(),
        evalStateObserver(evalStateFactory(() => state))
      );
      if (interpretable instanceof Error) {
        throw interpretable;
      }
      interpretable.eval(newActivation(tc.in ?? {}));
      const newExpr = new AstPruner(parsed.expr(), parsed.sourceInfo().macroCalls(), state).prune();
      const actual = unparse(newExpr);
      expect(actual).toEqual(tc.out);
    });
  }
});

function unknownActivation(...vars: string[]): PartialActivation {
  const pats: AttributePattern[] = [];
  for (const v of vars) {
    pats.push(new AttributePattern(v));
  }
  return new PartActivation(newActivation({}), pats);
}

function partialActivation(_in: Record<string, any>, ...vars: any[]): PartialActivation {
  const pats: AttributePattern[] = [];
  for (const v of vars) {
    if (v instanceof AttributePattern) {
      pats.push(v);
      continue;
    }
    if (typeof v === 'string') {
      pats.push(new AttributePattern(v));
      continue;
    }
  }
  return new PartActivation(newActivation(_in), pats);
}
