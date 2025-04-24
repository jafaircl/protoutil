import { create } from '@bufbuild/protobuf';
import { timestampFromMs, timestampMs, TimestampSchema } from '@bufbuild/protobuf/wkt';
import { Temporal } from 'temporal-polyfill';
import { MAX_INT32, MIN_INT32 } from '../int32.js';
import { MAX_INT64, MIN_INT64 } from '../int64.js';
import { durationFromString, durationNanos } from './duration.js';
import {
  isValidTimestamp,
  MAX_UNIX_TIME_SECONDS,
  MIN_UNIX_TIME_SECONDS,
  roundTimestampNanos,
  temporalTimestampNow,
  timestamp,
  timestampDateString,
  timestampFromDateString,
  timestampFromInstant,
  timestampFromNanos,
  timestampInstant,
  timestampNanos,
} from './timestamp.js';

describe('timestamp', () => {
  describe('timestamp()', () => {
    it('creates a timestamp', () => {
      const ts = timestamp(1234567890n, 123456789);
      expect(ts.seconds).toBe(1234567890n);
      expect(ts.nanos).toBe(123456789);
    });

    it('creates a timestamp with negative seconds', () => {
      const ts = timestamp(-1234567890n, 123456789);
      expect(ts.seconds).toBe(-1234567890n);
      expect(ts.nanos).toBe(123456789);
    });

    it('throws an error with negative nanoseconds', () => {
      expect(() => timestamp(1234567890n, -1)).toThrow('out-of-range nanos');
    });

    it('throws an error with nanoseconds greater than 999_999_999', () => {
      expect(() => timestamp(1234567890n, 1_000_000_000)).toThrow('out-of-range nanos');
    });

    it('throws an error if before 0001-01-01', () => {
      expect(() => timestamp(BigInt(MIN_UNIX_TIME_SECONDS) - 1n)).toThrow('before 0001-01-01');
    });

    it('throws an error if after 9999-12-31', () => {
      expect(() => timestamp(BigInt(MAX_UNIX_TIME_SECONDS) + 1n)).toThrow('after 9999-12-31');
      expect(() => timestamp(BigInt(MAX_UNIX_TIME_SECONDS), 1)).toThrow('after 9999-12-31');
    });

    it('throws an error if seconds is out of range', () => {
      expect(() => timestamp(MAX_INT64 + 1n)).toThrow('out-of-range Int64');
      expect(() => timestamp(MIN_INT64 - 1n)).toThrow('out-of-range Int64');
    });

    it('throws an error if nanos is out of range', () => {
      expect(() => timestamp(0n, MAX_INT32 + 1)).toThrow('out-of-range Int32');
      expect(() => timestamp(0n, MIN_INT32 - 1)).toThrow('out-of-range Int32');
    });
  });

  describe('isValidTimestamp()', () => {
    it('validates a timestamp', () => {
      // Valid timestamps
      expect(isValidTimestamp(timestampFromMs(0))).toBe(true);
      expect(isValidTimestamp(timestampFromMs(1234567890))).toBe(true);
      expect(isValidTimestamp(timestampFromMs(-1234567890))).toBe(true);

      // Invalid timestamps
      expect(
        isValidTimestamp(create(TimestampSchema, { seconds: BigInt(MAX_UNIX_TIME_SECONDS + 1) }))
      ).toBe(false);
      expect(
        isValidTimestamp(
          create(TimestampSchema, { seconds: BigInt(MAX_UNIX_TIME_SECONDS), nanos: 1 })
        )
      ).toBe(false);
      expect(
        isValidTimestamp(create(TimestampSchema, { seconds: BigInt(MIN_UNIX_TIME_SECONDS - 1) }))
      ).toBe(false);
      expect(
        isValidTimestamp(
          create(TimestampSchema, { seconds: BigInt(MIN_UNIX_TIME_SECONDS), nanos: -1 })
        )
      ).toBe(false);
    });
  });

  describe('temporalTimestampNow', () => {
    it('uses current time', () => {
      const timestamp = temporalTimestampNow();
      const wantMs = Date.now();
      const gotMs = timestampMs(timestamp);
      const leewayMs = 50;
      expect(gotMs).toBeGreaterThanOrEqual(wantMs - leewayMs);
      expect(gotMs).toBeLessThanOrEqual(wantMs + leewayMs);
    });
  });

  describe('timestampNanos', () => {
    it('converts timestamp to nanoseconds', () => {
      expect(timestampNanos(create(TimestampSchema, { seconds: 0n, nanos: 0 }))).toBe(0n);
      expect(
        timestampNanos(create(TimestampSchema, { seconds: 818035920n, nanos: 123456789 }))
      ).toBe(818035920123456789n);
      expect(
        timestampNanos(create(TimestampSchema, { seconds: -2n, nanos: 930 * 1_000_000 }))
      ).toBe(-1_070_000_000n);
    });
  });

  describe('timestampFromNanos', () => {
    test('converts unix timestamp with nanoseconds to Timestamp', () => {
      const timestampZero = timestampFromNanos(0n);
      expect(timestampZero.seconds).toBe(0n);
      expect(timestampZero.nanos).toBe(0);
      const timestampWithNs = timestampFromNanos(818035920123456789n);
      expect(timestampWithNs.seconds).toBe(818035920n);
      expect(timestampWithNs.nanos).toBe(123456789);
    });
    test('1000000000 ns', () => {
      const ts = timestampFromNanos(1_000_000_000n);
      expect(ts.seconds).toBe(1n);
      expect(ts.nanos).toBe(0);
    });
    it('1020000000 ns', () => {
      const ts = timestampFromNanos(1_020_000_000n);
      expect(ts.seconds).toBe(1n);
      expect(ts.nanos).toBe(20 * 1_000_000);
    });
    it('-1070000000 ns', () => {
      const ts = timestampFromNanos(-1_070_000_000n);
      expect(ts.seconds).toBe(-2n);
      expect(ts.nanos).toBe(930 * 1_000_000);
    });
    it('-9999999999 ns', () => {
      const ts = timestampFromNanos(-9_999_999_999n);
      expect(ts.seconds).toBe(-10n);
      expect(ts.nanos).toBe(1);
    });
    it('-1000000000 ns', () => {
      const ts = timestampFromNanos(-1_000_000_000n);
      expect(ts.seconds).toBe(-1n);
      expect(ts.nanos).toBe(0);
    });

    it('math should work', () => {
      const epochTimestamp = timestampFromNanos(0n);
      const epochTimestampNanos = timestampNanos(epochTimestamp);
      expect(epochTimestampNanos).toBe(0n);
      const oneWeekDuration = durationFromString(`${7 * 24 * 60 * 60}s`);
      const oneWeekDurationNanos = durationNanos(oneWeekDuration);
      expect(oneWeekDurationNanos).toBe(7n * 24n * 60n * 60n * 1_000_000_000n);
      const oneWeekAfterEpoch = timestampFromNanos(epochTimestampNanos + oneWeekDurationNanos);
      const oneWeekAfterEpochString = timestampDateString(oneWeekAfterEpoch);
      expect(oneWeekAfterEpochString).toBe('1970-01-08T00:00:00.000Z');
    });
  });

  describe('timestampFromInstant()', () => {
    test('converts Temporal.Instant to Timestamp', () => {
      const timestampZero = timestampFromInstant(new Temporal.Instant(0n));
      expect(timestampZero.seconds).toBe(0n);
      expect(timestampZero.nanos).toBe(0);
      const timestampWithNs = timestampFromInstant(new Temporal.Instant(818035920123456789n));
      expect(timestampWithNs.seconds).toBe(818035920n);
      expect(timestampWithNs.nanos).toBe(123456789);
      const negativeTimestamp = timestampFromInstant(new Temporal.Instant(-1_070_000_000n));
      expect(negativeTimestamp.seconds).toBe(-2n);
      expect(negativeTimestamp.nanos).toBe(930 * 1_000_000);
      const negativeTimestamp2 = timestampFromInstant(new Temporal.Instant(-9_999_999_999n));
      expect(negativeTimestamp2.seconds).toBe(-10n);
      expect(negativeTimestamp2.nanos).toBe(1);
      const negativeTimestamp3 = timestampFromInstant(new Temporal.Instant(-1_000_000_000n));
      expect(negativeTimestamp3.seconds).toBe(-1n);
      expect(negativeTimestamp3.nanos).toBe(0);
    });
  });

  describe('timestampInstant()', () => {
    test('converts Timestamp to Temporal.Instant', () => {
      const timestampZero = create(TimestampSchema, {
        seconds: 0n,
        nanos: 0,
      });
      expect(timestampInstant(timestampZero).epochNanoseconds).toBe(0n);
      const timestampWithMs = create(TimestampSchema, {
        seconds: 818035920n,
        nanos: 123456789,
      });
      expect(timestampInstant(timestampWithMs).epochNanoseconds).toBe(818035920123456789n);
      const negativeTimestamp = create(TimestampSchema, {
        seconds: -2n,
        nanos: 930 * 1_000_000,
      });
      expect(timestampInstant(negativeTimestamp).epochNanoseconds).toBe(-1_070_000_000n);
      const negativeTimestamp2 = create(TimestampSchema, {
        seconds: -10n,
        nanos: 1,
      });
      expect(timestampInstant(negativeTimestamp2).epochNanoseconds).toBe(-9_999_999_999n);
      const negativeTimestamp3 = create(TimestampSchema, {
        seconds: -1n,
        nanos: 0,
      });
      expect(timestampInstant(negativeTimestamp3).epochNanoseconds).toBe(-1_000_000_000n);
    });
  });

  describe('timestampFromDateString()', () => {
    it('should parse', () => {
      // Iso8601 without timezone
      expect(timestampFromDateString('2011-10-05T14:48:00.000Z')).toStrictEqual(
        timestamp(1317826080n, 0)
      );

      // Iso8601 with timezone
      expect(timestampFromDateString('2011-10-05T14:48:00.000-04:00')).toStrictEqual(
        timestamp(1317811680n, 0)
      );

      // Nanos without timezone
      expect(timestampFromDateString('1970-01-01T02:07:34.000000321Z')).toStrictEqual(
        timestamp(7654n, 321)
      );

      // Nanos with timezone
      expect(timestampFromDateString('1970-01-01T02:07:34.000000321+07:00')).toStrictEqual(
        timestamp(32854n, 321)
      );

      // February 29th, 2020
      expect(timestampFromDateString('2020-02-29T00:00:00.000Z')).toStrictEqual(
        timestamp(1582934400n, 0)
      );

      // February 29th, 2021 becomes March 1st, 2021
      expect(timestampFromDateString('2021-02-29T00:00:00.000Z')).toStrictEqual(
        timestamp(1614556800n, 0)
      );
    });
  });

  describe('timestampDateString()', () => {
    it('should format', () => {
      expect(timestampDateString(timestamp(1317826080n, 0))).toEqual('2011-10-05T14:48:00.000Z');
      expect(timestampDateString(timestamp(1317826080n, 321))).toEqual(
        '2011-10-05T14:48:00.000000321Z'
      );
    });
  });

  describe('roundTimestampNanos()', () => {
    it('rounds nanoseconds to the nearest nanosecond', () => {
      const ts = create(TimestampSchema, {
        nanos: 123.456,
      });
      const rounded = roundTimestampNanos(ts);
      expect(rounded.nanos).toBe(123);
    });
  });
});
