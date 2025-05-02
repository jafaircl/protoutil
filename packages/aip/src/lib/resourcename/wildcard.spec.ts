import { containsWildcard } from './wildcard.js';

describe('wildcard', () => {
  describe('containsWildcard()', () => {
    const testCases = [
      {
        name: 'empty',
        input: '',
        expected: false,
      },
      {
        name: 'singleton',
        input: 'foo',
        expected: false,
      },
      {
        name: 'singleton wildcard',
        input: '-',
        expected: true,
      },
      {
        name: 'multi',
        input: 'foo/bar',
        expected: false,
      },
      {
        name: 'multi wildcard at start',
        input: '-/bar',
        expected: true,
      },
      {
        name: 'multi wildcard at end',
        input: 'foo/-',
        expected: true,
      },
      {
        name: 'multi wildcard at middle',
        input: 'foo/-/bar',
        expected: true,
      },
    ];
    for (const tc of testCases) {
      it(tc.name, () => {
        const result = containsWildcard(tc.input);
        expect(result).toEqual(tc.expected);
      });
    }
  });
});
