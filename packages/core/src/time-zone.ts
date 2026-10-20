/** A civil date and time used to resolve an IANA time zone through Intl. */
export interface CivilDateTime {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

/** Asserts that an IANA time zone is available from the host Intl implementation. */
export function assertIntlTimeZone(timeZone: string): void {
  new Intl.DateTimeFormat("en-US", { timeZone });
}

/** Resolves a civil date and time to an instant using compatible disambiguation. */
export function civilTimeToEpochMilliseconds(value: CivilDateTime, timeZone: string): number {
  assertIntlTimeZone(timeZone);
  const local = utcMilliseconds(value);
  const offsets = new Set<number>();
  for (const candidate of [local, local - 86_400_000, local + 86_400_000]) {
    offsets.add(offsetAt(candidate, timeZone));
  }
  const candidates = [...offsets]
    .map((offset) => local - offset)
    .sort((left, right) => left - right);
  const exact = candidates.find((candidate) =>
    civilTimeEquals(partsAt(candidate, timeZone), value),
  );
  // When the local time is repeated, select the earlier instant. When the local time falls in a
  // daylight-saving gap, advance it by the gap.
  return exact ?? candidates[candidates.length - 1]!;
}

/** Returns the numeric UTC offset for a civil time in an IANA time zone. */
export function civilTimeZoneOffset(value: CivilDateTime, timeZone: string): string {
  const epochMilliseconds = civilTimeToEpochMilliseconds(value, timeZone);
  return formatOffset(offsetAt(epochMilliseconds, timeZone));
}

function partsAt(epochMilliseconds: number, timeZone: string): Required<CivilDateTime> {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epochMilliseconds));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === type)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

function offsetAt(epochMilliseconds: number, timeZone: string): number {
  const local = partsAt(epochMilliseconds, timeZone);
  return utcMilliseconds(local) - epochMilliseconds;
}

function civilTimeEquals(left: Required<CivilDateTime>, right: CivilDateTime): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === (right.hour ?? 0) &&
    left.minute === (right.minute ?? 0) &&
    left.second === (right.second ?? 0)
  );
}

function utcMilliseconds(value: CivilDateTime): number {
  const date = new Date(0);
  date.setUTCFullYear(value.year, value.month - 1, value.day);
  date.setUTCHours(value.hour ?? 0, value.minute ?? 0, value.second ?? 0, 0);
  return date.getTime();
}

function formatOffset(milliseconds: number): string {
  if (milliseconds === 0) {
    return "Z";
  }
  const sign = milliseconds < 0 ? "-" : "+";
  const minutes = Math.abs(milliseconds) / 60_000;
  const hours = Math.trunc(minutes / 60);
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
