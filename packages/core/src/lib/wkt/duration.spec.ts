import { create } from '@bufbuild/protobuf';
import { DurationSchema } from '@bufbuild/protobuf/wkt';
import { MAX_INT32, MIN_INT32 } from '../int32.js';
import { MAX_INT64, MIN_INT64 } from '../int64.js';
import {
  duration,
  durationFromNanos,
  durationFromString,
  durationNanos,
  durationString,
  isValidDuration,
} from './duration.js';

describe('duration', () => {
  describe('duration()', () => {
    it('creates a duration', () => {
      const ts = duration(1234567890n, 123456789);
      expect(ts.seconds).toBe(1234567890n);
      expect(ts.nanos).toBe(123456789);
    });

    it('throws an error for out of range nanos', () => {
      expect(() => duration(0n, 1_000_000_000)).toThrow('out-of-range nanos');
      expect(() => duration(0n, 999_999_999)).not.toThrow();
      expect(() => duration(0n, -1_000_000_000)).toThrow('out-of-range nanos');
      expect(() => duration(0n, -999_999_999)).not.toThrow();
      expect(() => duration(0n, MAX_INT32 + 1)).toThrow('out-of-range Int32');
      expect(() => duration(0n, MIN_INT32 - 1)).toThrow('out-of-range Int32');
    });

    it('throws an error for out of range seconds', () => {
      expect(() => duration(315_576_000_001n)).toThrow('exceeds +10000 years');
      expect(() => duration(315_576_000_000n)).not.toThrow();
      expect(() => duration(315_576_000_000n, 1)).toThrow('exceeds +10000 years');
      expect(() => duration(-315_576_000_001n)).toThrow('exceeds -10000 years');
      expect(() => duration(-315_576_000_000n)).not.toThrow();
      expect(() => duration(-315_576_000_000n, -1)).toThrow('exceeds -10000 years');
      expect(() => duration(MAX_INT64 + 1n)).toThrow('out-of-range Int64');
      expect(() => duration(MIN_INT64 - 1n)).toThrow('out-of-range Int64');
    });
  });

  describe('isValidDuration()', () => {
    it('validates a duration', () => {
      // Valid durations
      expect(isValidDuration(create(DurationSchema, { seconds: 0n, nanos: 0 }))).toBe(true);
      expect(
        isValidDuration(create(DurationSchema, { seconds: 1234567890n, nanos: 123456789 }))
      ).toBe(true);
      expect(
        isValidDuration(create(DurationSchema, { seconds: -1234567890n, nanos: -123456789 }))
      ).toBe(true);

      // Invalid durations
      expect(isValidDuration(create(DurationSchema, { seconds: 315_576_000_001n }))).toBe(false);
      expect(isValidDuration(create(DurationSchema, { seconds: 315_576_000_000n, nanos: 1 }))).toBe(
        false
      );
      expect(isValidDuration(create(DurationSchema, { seconds: -315_576_000_001n }))).toBe(false);
      expect(
        isValidDuration(create(DurationSchema, { seconds: -315_576_000_000n, nanos: -1 }))
      ).toBe(false);
    });
  });

  describe('durationFromString()', () => {
    it('should throw an error if the string is not formatted correctly', () => {
      expect(() => durationFromString('invalid')).toThrow(`duration string must end with 's'`);
      expect(() => durationFromString('1.0')).toThrow(`duration string must end with 's'`);
    });

    it('should create a duration from a string', () => {
      expect(durationFromString('0s')).toEqual(duration(0n, 0));
      expect(durationFromString('-1s')).toEqual(duration(-1n, 0));
      expect(durationFromString('1s')).toEqual(duration(1n, 0));
      expect(durationFromString('1.000000001s')).toEqual(duration(1n, 1));
      expect(durationFromString('-1.000000001s')).toEqual(duration(-1n, -1));
    });
  });

  describe('durationString()', () => {
    it('should convert a duration to a string', () => {
      expect(durationString(duration(0n, 0))).toBe('0s');
      expect(durationString(duration(-1n, 0))).toBe('-1s');
      expect(durationString(duration(1n, 0))).toBe('1s');
      expect(durationString(duration(1n, 1))).toBe('1.000000001s');
      expect(durationString(duration(-1n, -1))).toBe('-1.000000001s');
    });
  });

  describe('durationFromNanos()', () => {
    it('should create a duration from nanoseconds', () => {
      expect(durationFromNanos(0n)).toEqual(duration(0n, 0));
      expect(durationFromNanos(1n)).toEqual(duration(0n, 1));
      expect(durationFromNanos(-1n)).toEqual(duration(0n, -1));
      expect(durationFromNanos(1_000_000_000n)).toEqual(duration(1n, 0));
      expect(durationFromNanos(-1_000_000_000n)).toEqual(duration(-1n, 0));
      expect(durationFromNanos(1_000_000_001n)).toEqual(duration(1n, 1));
      expect(durationFromNanos(-1_000_000_001n)).toEqual(duration(-1n, -1));
    });
  });

  describe('durationNanos()', () => {
    it('should convert a duration to nanoseconds', () => {
      expect(durationNanos(duration(0n, 0))).toBe(0n);
      expect(durationNanos(duration(1n, 0))).toBe(1_000_000_000n);
      expect(durationNanos(duration(-1n, 0))).toBe(-1_000_000_000n);
      expect(durationNanos(duration(0n, 1))).toBe(1n);
      expect(durationNanos(duration(0n, -1))).toBe(-1n);
      expect(durationNanos(duration(1n, 1))).toBe(1_000_000_001n);
      expect(durationNanos(duration(-1n, -1))).toBe(-1_000_000_001n);
    });
  });
});
