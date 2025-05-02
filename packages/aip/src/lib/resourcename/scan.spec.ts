import { scanResourceName } from './scan.js';

describe('scan', () => {
  describe('scanResourceName()', () => {
    it('no variables', () => {
      const variables = scanResourceName('publishers', 'publishers');
      expect(variables).toEqual({});
    });

    it('single variable', () => {
      const variables = scanResourceName('publishers/foo', 'publishers/{publisher}');
      expect(variables).toEqual({ publisher: 'foo' });
    });

    it('two variables', () => {
      const variables = scanResourceName(
        'publishers/foo/books/bar',
        'publishers/{publisher}/books/{book}'
      );
      expect(variables).toEqual({ publisher: 'foo', book: 'bar' });
    });

    it('two variables singleton', () => {
      const variables = scanResourceName(
        'publishers/foo/books/bar/settings',
        'publishers/{publisher}/books/{book}/settings'
      );
      expect(variables).toEqual({ publisher: 'foo', book: 'bar' });
    });

    it('trailing segments', () => {
      expect(() => {
        scanResourceName(
          'publishers/foo/books/bar/settings',
          'publishers/{publisher}/books/{book}'
        );
      }).toThrow('got trailing segments in name');
    });
  });
});
