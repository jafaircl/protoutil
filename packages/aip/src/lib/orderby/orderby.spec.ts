import { compileMessage } from '@bufbuild/protocompile';
import { Field, OrderBy, parseAndValidateOrderBy, parseOrderBy } from './orderby.js';

const TestOrderBySchema = compileMessage(`
  syntax = "proto3";
  
  message TestOrderBy {
    message TestOrderByChild {
      string name = 1;
    }

    string name = 1;

    string description = 2;

    TestOrderByChild child = 3;
  }
`);

describe('orderby', () => {
  const ctorTestCases = [
    {
      orderBy: '',
      expected: new OrderBy([]),
    },
    {
      orderBy: 'foo desc, bar',
      expected: new OrderBy([new Field('foo', true), new Field('bar')]),
    },
    {
      orderBy: 'foo.bar',
      expected: new OrderBy([new Field('foo.bar')]),
    },
    {
      orderBy: ' foo , bar desc ',
      expected: new OrderBy([new Field('foo'), new Field('bar', true)]),
    },

    { orderBy: 'foo,', errorContains: 'invalid format' },
    { orderBy: ',', errorContains: 'invalid ' },
    { orderBy: ',foo', errorContains: 'invalid format' },
    { orderBy: 'foo/bar', errorContains: "invalid character '/'" },
    { orderBy: 'foo bar', errorContains: 'invalid format' },
  ];
  for (const tc of ctorTestCases) {
    it(`should parse '${tc.orderBy}'`, () => {
      if (tc.errorContains) {
        expect(() => parseOrderBy(tc.orderBy)).toThrow(tc.errorContains);
        return;
      }
      const orderBy = parseOrderBy(tc.orderBy);
      expect(orderBy).toEqual(tc.expected);
    });
  }

  const validationTestCases = [
    {
      name: 'valid empty',
      orderBy: () => parseAndValidateOrderBy('', TestOrderBySchema),
    },
    {
      name: 'valid single',
      orderBy: () => parseAndValidateOrderBy('name, description', TestOrderBySchema),
    },
    {
      name: 'invalid single',
      orderBy: () => parseAndValidateOrderBy('name, foo', TestOrderBySchema),
      errorContains: "field 'foo' not found in message TestOrderBy",
    },
    {
      name: 'valid nested',
      orderBy: () => parseAndValidateOrderBy('name, child.name', TestOrderBySchema),
    },
    {
      name: 'invalid nested',
      orderBy: () => parseAndValidateOrderBy('name, child.foo', TestOrderBySchema),
      errorContains: "field 'foo' not found in message TestOrderBy.TestOrderByChild",
    },
  ];
  for (const tc of validationTestCases) {
    it(`should validate ${tc.name}`, () => {
      if (tc.errorContains) {
        expect(() => tc.orderBy()).toThrow(tc.errorContains);
        return;
      }
      expect(tc.orderBy).not.toThrow();
    });
  }
});
