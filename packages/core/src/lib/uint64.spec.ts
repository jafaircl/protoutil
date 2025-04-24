import { assertValidUInt64, isValidUInt64, MAX_UINT64 } from './uint64.js';

describe('uint64', () => {
  describe('assertValidUInt64()', () => {
    it('validates a valid uint64', () => {
      expect(() => assertValidUInt64(0n)).not.toThrow();
      expect(() => assertValidUInt64(1n)).not.toThrow();
      expect(() => assertValidUInt64(MAX_UINT64)).not.toThrow();
    });

    it('throws an error for out of range uint64', () => {
      expect(() => assertValidUInt64(-1n)).toThrow('out-of-range UInt64');
      expect(() => assertValidUInt64(MAX_UINT64 + 1n)).toThrow('out-of-range UInt64');
    });
  });

  describe('isValidUInt64()', () => {
    it('validates a valid uint64', () => {
      expect(isValidUInt64(0n)).toBe(true);
      expect(isValidUInt64(1n)).toBe(true);
      expect(isValidUInt64(MAX_UINT64)).toBe(true);
    });

    it('returns false for out of range uint64', () => {
      expect(isValidUInt64(-1n)).toBe(false);
      expect(isValidUInt64(MAX_UINT64 + 1n)).toBe(false);
    });
  });
});
