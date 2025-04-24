import { assertValidInt64, isValidInt64, MAX_INT64, MIN_INT64 } from './int64.js';

describe('int64', () => {
  describe('assertValidInt64()', () => {
    it('validates a valid int64', () => {
      expect(() => assertValidInt64(0n)).not.toThrow();
      expect(() => assertValidInt64(1n)).not.toThrow();
      expect(() => assertValidInt64(-1n)).not.toThrow();
      expect(() => assertValidInt64(MAX_INT64)).not.toThrow();
      expect(() => assertValidInt64(MIN_INT64)).not.toThrow();
    });
    it('throws an error for out of range int64', () => {
      expect(() => assertValidInt64(MAX_INT64 + 1n)).toThrow('out-of-range Int64');
      expect(() => assertValidInt64(MIN_INT64 - 1n)).toThrow('out-of-range Int64');
    });
  });

  describe('isValidInt64()', () => {
    it('validates a valid int64', () => {
      expect(isValidInt64(0n)).toBe(true);
      expect(isValidInt64(1n)).toBe(true);
      expect(isValidInt64(-1n)).toBe(true);
      expect(isValidInt64(MAX_INT64)).toBe(true);
      expect(isValidInt64(MIN_INT64)).toBe(true);
    });
    it('returns false for out of range int64', () => {
      expect(isValidInt64(MAX_INT64 + 1n)).toBe(false);
      expect(isValidInt64(MIN_INT64 - 1n)).toBe(false);
    });
  });
});
