import {
  InvalidInputPubSubError,
  TransientPubSubError,
  UnrecoverablePubSubError,
} from "./errors.js";
import type { Disposition, RetryOptions } from "./types.js";

/** Reusable ACK disposition for successful deliveries. */
export const ACK: Disposition = { kind: "ack" };

/** Reusable REJECT disposition for invalid or unsupported deliveries. */
export const REJECT: Disposition = { kind: "reject" };

/** Reusable DEAD_LETTER disposition for unknown routes or unrecoverable deliveries. */
export const DEAD_LETTER: Disposition = { kind: "dead_letter" };

/**
 * Create a RETRY disposition, optionally with a protobuf Duration delay.
 *
 * @see {@link https://protobuf.dev/reference/protobuf/google.protobuf/#duration | google.protobuf.Duration}
 */
export function retry(options?: RetryOptions): Disposition {
  // The transport turns this abstract retry request into its own durable retry
  // primitive, whether that is a scheduled record, delayed queue, or similar.
  return { kind: "retry", delay: options?.delay };
}

/** Convert a thrown handler error into the default pubsub disposition. */
export function normalizeThrown(error: unknown): Disposition {
  if (error instanceof TransientPubSubError) {
    return { kind: "retry", error };
  }
  if (error instanceof InvalidInputPubSubError || isInvalidArgumentLike(error)) {
    return { kind: "reject", error };
  }
  if (error instanceof UnrecoverablePubSubError) {
    return { kind: "dead_letter", error };
  }
  return { kind: "retry", error };
}

/** Detect invalid-argument-shaped errors from sibling libraries and adapters. */
function isInvalidArgumentLike(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  // Some sibling libraries surface InvalidArgument using only a code/name
  // shape, so normalize those without requiring the exact class instance.
  return (
    propertyValue(error, "code") === 3 || propertyValue(error, "name") === "InvalidArgumentError"
  );
}

/** Read one direct property value without widening object indexing. */
function propertyValue(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}
