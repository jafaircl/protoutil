import { create } from '@bufbuild/protobuf';
import { DurationSchema } from '@bufbuild/protobuf/wkt';
import { Temporal } from 'temporal-polyfill';
import { MAX_INT32, MIN_INT32 } from '../int32.js';
import { MAX_INT64, MIN_INT64 } from '../int64.js';
import {
  clampDuration,
  duration,
  durationFromNanos,
  durationFromString,
  durationFromTemporal,
  durationNanos,
  durationString,
  durationTemporal,
  isValidDuration,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
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
      expect(durationFromString('1.01s')).toEqual(duration(1n, 10000000));
      expect(durationFromString('-1.01s')).toEqual(duration(-1n, -10000000));
      expect(durationFromString('1.1s')).toEqual(duration(1n, 100000000));
      expect(durationFromString('-1.1s')).toEqual(duration(-1n, -100000000));
      expect(durationFromString('1.234s')).toEqual(duration(1n, 234000000));
      expect(durationFromString('-1.234s')).toEqual(duration(-1n, -234000000));
      expect(durationFromString('1.00234s')).toEqual(duration(1n, 2340000));
      expect(durationFromString('-1.00234s')).toEqual(duration(-1n, -2340000));
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

  describe('durationFromTemporal()', () => {
    it('should create a duration from a Temporal.Duration', () => {
      const d = Temporal.Duration.from({
        years: 1,
      });
      expect(durationFromTemporal(d)).toEqual(duration(BigInt(365 * 24 * 60 * 60), 0));
    });

    it('should create a duration from a Temporal.Duration with a relativeTo', () => {
      const d = Temporal.Duration.from({
        years: 1,
      });
      const relativeTo = Temporal.PlainDateTime.from({
        year: 2020,
        month: 1,
        day: 1,
      });
      expect(durationFromTemporal(d, relativeTo)).toEqual(duration(BigInt(366 * 24 * 60 * 60), 0));
    });

    it('should create a duration from a Tempora.Duration with nanoseconds', () => {
      const d = Temporal.Duration.from({
        years: 1,
        months: 2,
        days: 3,
        hours: 4,
        minutes: 5,
        seconds: 6,
        milliseconds: 7,
        microseconds: 8,
        nanoseconds: 9,
      });
      const relativeToDate = '2022-01-01';
      const yearsInSeconds = 365 * 24 * 60 * 60 * d.years;
      const monthsInSeconds = 60 * 60 * 24 * (31 + 28); // January + February
      const daysInSeconds = 60 * 60 * 24 * d.days;
      const hoursInSeconds = 60 * 60 * d.hours;
      const minutesInSeconds = 60 * d.minutes;
      const secondsInSeconds = d.seconds;
      const millisInNanos = d.milliseconds * 1_000_000;
      const microsInNanos = d.microseconds * 1_000;
      const nanosInNanos = d.nanoseconds;
      expect(durationFromTemporal(d, relativeToDate)).toEqual(
        duration(
          BigInt(
            yearsInSeconds +
              monthsInSeconds +
              daysInSeconds +
              hoursInSeconds +
              minutesInSeconds +
              secondsInSeconds
          ),
          millisInNanos + microsInNanos + nanosInNanos
        )
      );
    });

    it('should handle negative durations', () => {
      const d = Temporal.Duration.from({
        years: -1,
      });
      expect(durationFromTemporal(d)).toEqual(duration(BigInt(-365 * 24 * 60 * 60), 0));
    });
  });

  describe('temporalDuration()', () => {
    it('should convert a duration to a Temporal.Duration', () => {
      const d1 = durationTemporal(duration(0n, 0));
      const t1 = Temporal.Duration.from({
        years: 0,
        months: 0,
        weeks: 0,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        milliseconds: 0,
        microseconds: 0,
        nanoseconds: 0,
      });
      expect(Temporal.Duration.compare(d1, t1)).toEqual(0);
      const d2 = durationTemporal(duration(24n * 60n * 60n + 2n, 1));
      const t2 = Temporal.Duration.from({
        years: 0,
        months: 0,
        weeks: 0,
        days: 1,
        hours: 0,
        minutes: 0,
        seconds: 1,
        milliseconds: 0,
        microseconds: 0,
        nanoseconds: 1_000_000_001,
      });
      expect(Temporal.Duration.compare(d2, t2)).toEqual(0);
    });

    it('should handle negative durations', () => {
      const d = durationTemporal(duration(-1n * 24n * 60n * 60n - 2n, -1));
      const t = Temporal.Duration.from({
        years: 0,
        months: 0,
        weeks: 0,
        days: -1,
        hours: 0,
        minutes: 0,
        seconds: -1,
        milliseconds: 0,
        microseconds: 0,
        nanoseconds: -1_000_000_001,
      });
      expect(Temporal.Duration.compare(d, t)).toEqual(0);
    });
  });

  describe('clampDuration()', () => {
    it('should clamp a duration to the max duration', () => {
      const d = create(DurationSchema, { seconds: MAX_DURATION_SECONDS + 1n });
      const clamped = clampDuration(d);
      expect(clamped.seconds).toBe(MAX_DURATION_SECONDS);
      expect(clamped.nanos).toBe(0);
    });

    it('should clamp a duration to the min duration', () => {
      const d = create(DurationSchema, { seconds: MIN_DURATION_SECONDS - 1n });
      const clamped = clampDuration(d);
      expect(clamped.seconds).toBe(MIN_DURATION_SECONDS);
      expect(clamped.nanos).toBe(0);
    });

    it('should accept a custom min duration', () => {
      const d = create(DurationSchema, { seconds: -100n });
      const min = create(DurationSchema, { seconds: -50n });
      const clamped = clampDuration(d, min);
      expect(clamped.seconds).toBe(-50n);
      expect(clamped.nanos).toBe(0);
    });

    it('should accept a custom max duration', () => {
      const d = create(DurationSchema, { seconds: 100n });
      const max = create(DurationSchema, { seconds: 50n });
      const clamped = clampDuration(d, undefined, max);
      expect(clamped.seconds).toBe(50n);
      expect(clamped.nanos).toBe(0);
    });
  });
});
