import { assertValidInt32, isValidInt32, MAX_INT32, MIN_INT32 } from './int32.js';

describe('int32', () => {
  describe('assertValidInt32()', () => {
    it('validates a valid int32', () => {
      expect(() => assertValidInt32(0)).not.toThrow();
      expect(() => assertValidInt32(1)).not.toThrow();
      expect(() => assertValidInt32(-1)).not.toThrow();
      expect(() => assertValidInt32(2147483647)).not.toThrow();
      expect(() => assertValidInt32(-2147483648)).not.toThrow();
    });

    it('throws an error for out of range int32', () => {
      expect(() => assertValidInt32(NaN)).toThrow('not an integer');
      expect(() => assertValidInt32(1.5)).toThrow('not an integer');
      expect(() => assertValidInt32(Infinity)).toThrow('not an integer');
      expect(() => assertValidInt32(-Infinity)).toThrow('not an integer');
      expect(() => assertValidInt32(2147483648)).toThrow('out-of-range Int32');
      expect(() => assertValidInt32(-2147483649)).toThrow('out-of-range Int32');
    });
  });

  describe('isValidInt32()', () => {
    it('validates a valid int32', () => {
      expect(isValidInt32(0)).toBe(true);
      expect(isValidInt32(1)).toBe(true);
      expect(isValidInt32(-1)).toBe(true);
      expect(isValidInt32(MAX_INT32)).toBe(true);
      expect(isValidInt32(MIN_INT32)).toBe(true);
    });

    it('returns false for out of range int32', () => {
      expect(isValidInt32(MAX_INT32 + 1)).toBe(false);
      expect(isValidInt32(MIN_INT32 - 1)).toBe(false);
    });
  });
});
