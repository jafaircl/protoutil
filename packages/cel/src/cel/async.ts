import type { AsyncOp } from "../common/functions.js";
import { Err, isError, type Val } from "../common/types/index.js";
import type { AsyncCall, AsyncObserver } from "../interpreter/async.js";

/**
 * DrainAction dictates when concurrent evaluation should run another expression pass.
 */
export interface DrainAction {
  /** reevaluate requests an immediate expression evaluation pass. */
  reevaluate: boolean;
  /** waitDurationMs requests a debounce delay; zero means wait indefinitely. */
  waitDurationMs: number;
}

/**
 * DrainStrategy controls when concurrent evaluation runs after async completions.
 */
export interface DrainStrategy {
  /** nextAction determines whether to re-evaluate from completed and active call counts. */
  nextAction(completed: AsyncCall[], active: number): DrainAction;
}

/**
 * TimeoutOptions configures a timeout wrapper around an asynchronous binding.
 */
export interface TimeoutOptions {
  /** binding is the asynchronous function operation to wrap. */
  binding: AsyncOp;
  /** timeoutMs is the per-call timeout in milliseconds. */
  timeoutMs: number;
}

/**
 * RetryOptions configures retry behavior around an asynchronous binding.
 */
export interface RetryOptions {
  /** backoffMs is the delay between attempts and defaults to 100 milliseconds. */
  backoffMs?: number;
  /** binding is the asynchronous function operation to retry. */
  binding: AsyncOp;
  /** isRetryable determines whether an Err should trigger another attempt. */
  isRetryable?: (error: Err) => boolean;
  /** maxAttempts includes the initial attempt and defaults to three. */
  maxAttempts?: number;
}

/**
 * drainNone returns a strategy which re-evaluates after every completion.
 */
export function drainNone(): DrainStrategy {
  return {
    nextAction: (completed, active) => ({
      reevaluate: active === 0 || completed.length > 0,
      waitDurationMs: 0,
    }),
  };
}

/**
 * drainAll returns a strategy which waits for all active calls before re-evaluating.
 */
export function drainAll(): DrainStrategy {
  return {
    nextAction: (_completed, active) => ({
      reevaluate: active === 0,
      waitDurationMs: 0,
    }),
  };
}

/**
 * drainReady returns a strategy which batches calls completing within a debounce window.
 */
export function drainReady(debounceMs: number): DrainStrategy {
  return {
    nextAction: (completed, active) => {
      if (active === 0) {
        return { reevaluate: true, waitDurationMs: 0 };
      }
      if (completed.length === 0) {
        return { reevaluate: false, waitDurationMs: 0 };
      }
      return { reevaluate: false, waitDurationMs: debounceMs };
    },
  };
}

/**
 * timeout bounds an asynchronous binding even when the wrapped operation ignores cancellation.
 */
export function timeout(options: TimeoutOptions): AsyncOp {
  return async (signal, ...args) => {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const timer = globalThis.setTimeout(
      () => controller.abort(new Error("operation timed out")),
      options.timeoutMs,
    );
    try {
      return await Promise.race([
        options.binding(controller.signal, ...args),
        new Promise<Val>((resolve) => {
          controller.signal.addEventListener(
            "abort",
            () => {
              const message = signal.aborted
                ? "operation cancelled"
                : `operation timed out after ${options.timeoutMs}ms`;
              resolve(new Err(message));
            },
            { once: true },
          );
        }),
      ]);
    } finally {
      globalThis.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  };
}

/**
 * retry applies a fixed-attempt, fixed-backoff retry policy to an asynchronous binding.
 */
export function retry(options: RetryOptions): AsyncOp {
  const maxAttempts = options.maxAttempts ?? 3;
  const backoffMs = options.backoffMs ?? 100;
  return async (signal, ...args) => {
    let last: Val = new Err("retry did not execute");
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const cancelled = await waitForBackoff(signal, backoffMs);
        if (cancelled) {
          return new Err("operation cancelled during retry");
        }
      }
      last = await options.binding(signal, ...args);
      if (!isError(last)) {
        return last;
      }
      if (!(options.isRetryable?.(last) ?? false)) {
        return last;
      }
    }
    return last;
  };
}

/**
 * waitForBackoff pauses between retries and reports whether cancellation interrupted the delay.
 */
async function waitForBackoff(signal: AbortSignal, delayMs: number): Promise<boolean> {
  if (signal.aborted) {
    return true;
  }
  return new Promise<boolean>((resolve) => {
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", cancelled);
      resolve(false);
    }, delayMs);
    const cancelled = () => {
      globalThis.clearTimeout(timer);
      resolve(true);
    };
    signal.addEventListener("abort", cancelled, { once: true });
  });
}

export type { AsyncCall, AsyncObserver };
