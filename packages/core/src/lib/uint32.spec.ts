import { assertValidUInt32, isValidUInt32, MAX_UINT32 } from './uint32.js';

describe('uint32', () => {
  describe('assertValidUInt32()', () => {
    it('validates a valid uint32', () => {
      expect(() => assertValidUInt32(0)).not.toThrow();
      expect(() => assertValidUInt32(1)).not.toThrow();
      expect(() => assertValidUInt32(MAX_UINT32)).not.toThrow();
    });
    it('throws an error for out of range uint32', () => {
      expect(() => assertValidUInt32(NaN)).toThrow('not an integer');
      expect(() => assertValidUInt32(1.5)).toThrow('not an integer');
      expect(() => assertValidUInt32(-1)).toThrow('out-of-range UInt32');
      expect(() => assertValidUInt32(MAX_UINT32 + 1)).toThrow('out-of-range UInt32');
    });
  });

  describe('isValidUInt32()', () => {
    it('validates a valid uint32', () => {
      expect(isValidUInt32(0)).toBe(true);
      expect(isValidUInt32(1)).toBe(true);
      expect(isValidUInt32(MAX_UINT32)).toBe(true);
    });
    it('returns false for out of range uint32', () => {
      expect(isValidUInt32(-1)).toBe(false);
      expect(isValidUInt32(MAX_UINT32 + 1)).toBe(false);
    });
  });
});
