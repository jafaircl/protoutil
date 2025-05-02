import { joinResourceNames } from './join.js';

describe('join', () => {
  describe('joinResourceNames()', () => {
    const testCases = [
      {
        name: 'zero',
        input: [],
        expected: '/',
      },
      {
        name: 'one',
        input: ['parent/1'],
        expected: 'parent/1',
      },
      {
        name: 'two',
        input: ['parent/1', 'child/2'],
        expected: 'parent/1/child/2',
      },
      {
        name: 'root first',
        input: ['/', 'child/2'],
        expected: 'child/2',
      },
      {
        name: 'root last',
        input: ['parent/1', '/'],
        expected: 'parent/1',
      },
      {
        name: 'root second',
        input: ['parent/1', '/', 'child/2'],
        expected: 'parent/1/child/2',
      },
      {
        name: 'root first and last',
        input: ['/', 'child/1', '/'],
        expected: 'child/1',
      },
      {
        name: 'only roots',
        input: ['/', '/'],
        expected: '/',
      },
      {
        name: 'empty first',
        input: ['', 'child/2'],
        expected: 'child/2',
      },
      {
        name: 'empty second',
        input: ['parent/1', '', 'child/2'],
        expected: 'parent/1/child/2',
      },
      {
        name: 'invalid first suffix',
        input: ['parent/1/', 'child/2'],
        expected: 'parent/1/child/2',
      },
      {
        name: 'invalid last suffix',
        input: ['parent/1', 'child/2/'],
        expected: 'parent/1/child/2',
      },

      {
        name: 'fully qualified first',
        input: ['//foo.example.com/foo/1', 'bar/2'],
        expected: '//foo.example.com/foo/1/bar/2',
      },
      {
        name: 'fully qualified second',
        input: ['foo/1', '//foo.example.com/bar/2'],
        expected: 'foo/1/bar/2',
      },
      {
        name: 'fully qualified both',
        input: ['//foo.example.com/foo/1', '//bar.example.com/bar/2'],
        expected: '//foo.example.com/foo/1/bar/2',
      },

      // TODO: Should these be disallowed?
      // See https://github.com/einride/aip-go/pull/258
      {
        name: 'first slash prefix',
        input: ['/parent/1', 'child/2'],
        expected: 'parent/1/child/2',
      },
      {
        name: 'second slash prefix',
        input: ['parent/1', '/child/2'],
        expected: 'parent/1/child/2',
      },
      {
        name: 'thirds slash prefix',
        input: ['parent/1', 'child/2', '/extra/3'],
        expected: 'parent/1/child/2/extra/3',
      },
      {
        name: 'all slash prefix',
        input: ['/parent/1', '/child/2', '/extra/3'],
        expected: 'parent/1/child/2/extra/3',
      },
    ];
    for (const tc of testCases) {
      it(tc.name, () => {
        const result = joinResourceNames(...tc.input);
        expect(result).toEqual(tc.expected);
      });
    }
  });
});
