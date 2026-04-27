/**
 * Check whether a retry disposition has reached the configured attempt limit.
 */
export function retryLimitReached(attempt: number, maxAttempts: number | undefined): boolean {
  return (
    maxAttempts !== undefined &&
    Number.isInteger(maxAttempts) &&
    maxAttempts > 0 &&
    attempt >= maxAttempts
  );
}

/**
 * Hash a set of topics so transport-owned consumer names remain deterministic
 * and bounded.
 */
export function stableTopicHash(topics: string[]): string {
  return Buffer.from([...topics].sort().join("|"))
    .toString("base64url")
    .slice(0, 24);
}

/** Default retry delay used by all scheduler implementations when delivery fails. */
export const DEFAULT_SCHEDULER_RETRY_DELAY_MS = 1_000;

/** Compute an ISO 8601 not-before timestamp from a millisecond delay offset. */
export function delayToNotBefore(delayMs: number): string {
  return new Date(Date.now() + delayMs).toISOString();
}

/** Parse a string attempt header value into a positive integer, defaulting to 1. */
export function parseAttempt(value: string | undefined): number {
  if (!value) {
    return 1;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
