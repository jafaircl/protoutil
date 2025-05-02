import { resourceNameAncestor } from './ancestor.js';

describe('ancestor', () => {
  describe('resourceNameAncestor()', () => {
    const testCases = [
      {
        name: 'empty all',
        input: '',
        pattern: '',
        expected: '',
      },
      {
        name: 'empty pattern',
        input: 'foo/1/bar/2',
        pattern: '',
        expected: '',
      },
      {
        name: 'empty name',
        input: '',
        pattern: 'foo/{foo}',
        expected: '',
      },
      {
        name: 'non-matching pattern',
        input: 'foo/1/bar/2',
        pattern: 'baz/{baz}',
        expected: '',
      },
      {
        name: 'ok',
        input: 'foo/1/bar/2',
        pattern: 'foo/{foo}',
        expected: 'foo/1',
      },
      {
        name: 'ok full',
        input: '//foo.example.com/foo/1/bar/2',
        pattern: 'foo/{foo}',
        expected: '//foo.example.com/foo/1',
      },
    ];
    for (const tc of testCases) {
      it(tc.name, () => {
        const result = resourceNameAncestor(tc.input, tc.pattern);
        expect(result).toEqual(tc.expected);
      });
    }
  });
});
