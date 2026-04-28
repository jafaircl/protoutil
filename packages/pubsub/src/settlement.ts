import { retryLimitReached } from "./transport-utils.js";
import type { Disposition } from "./types.js";

/** Return true when a retry disposition has exhausted the allowed attempts. */
export function retryLimitReachedForDisposition(
  disposition: Disposition,
  attempt: number,
  maxAttempts: number | undefined,
): boolean {
  return disposition.kind === "retry" && retryLimitReached(attempt, maxAttempts);
}

/** Normalize a nullable disposition into a concrete one for settlement. */
export function resolveDisposition(disposition: Disposition | undefined): Disposition {
  return disposition ?? { kind: "ack" };
}
