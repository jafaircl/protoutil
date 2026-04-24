import type {
  PubSubTransportObserver,
  PubSubTransportObserverEvent,
  PubSubTransportObserverFailure,
} from "./types.js";

/**
 * Transport observer hooks that report normal lifecycle events.
 */
export type PubSubTransportObserverHook =
  | "scheduled"
  | "retried"
  | "retryExhausted"
  | "deadLettered"
  | "recovered"
  | "delivered"
  | "tombstoned"
  | "committed";

/**
 * Transport observer hooks that report failures without affecting delivery flow.
 */
export type PubSubTransportObserverFailureHook = "parseFailed" | "deliveryFailed";

/**
 * Invoke one transport observer hook while keeping observer failures non-fatal.
 */
export function notifyTransportObserver(
  observer: PubSubTransportObserver | undefined,
  hook: PubSubTransportObserverHook,
  event: PubSubTransportObserverEvent,
): void {
  if (!observer) {
    return;
  }
  try {
    switch (hook) {
      case "committed":
        observer.committed?.(event);
        return;
      case "deadLettered":
        observer.deadLettered?.(event);
        return;
      case "delivered":
        observer.delivered?.(event);
        return;
      case "recovered":
        observer.recovered?.(event);
        return;
      case "retried":
        observer.retried?.(event);
        return;
      case "retryExhausted":
        observer.retryExhausted?.(event);
        return;
      case "scheduled":
        observer.scheduled?.(event);
        return;
      case "tombstoned":
        observer.tombstoned?.(event);
        return;
    }
  } catch {
    // Observer hooks are diagnostics, not part of the delivery transaction.
  }
}

/**
 * Invoke one transport failure observer hook while keeping observer failures non-fatal.
 */
export function notifyTransportFailureObserver(
  observer: PubSubTransportObserver | undefined,
  hook: PubSubTransportObserverFailureHook,
  event: PubSubTransportObserverFailure,
): void {
  if (!observer) {
    return;
  }
  try {
    if (hook === "deliveryFailed") {
      observer.deliveryFailed?.(event);
      return;
    }
    observer.parseFailed?.(event);
  } catch {
    // Observer hooks are diagnostics, not part of the delivery transaction.
  }
}
