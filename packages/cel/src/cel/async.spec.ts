import { describe, expect, it } from "vitest";
import { Err, Int, type Val } from "../common/types/index.js";
import type { AsyncCall } from "../interpreter/async.js";
import { drainAll, drainNone, drainReady, retry, timeout } from "./async.js";

/**
 * MockAsyncCall provides stable metadata for drain-strategy tests.
 */
class MockAsyncCall implements AsyncCall {
  /** callId returns the mock invocation id. */
  public callId(): number {
    return 1;
  }

  /** functionName returns the mock function name. */
  public functionName(): string {
    return "f";
  }

  /** overloadId returns the mock overload id. */
  public overloadId(): string {
    return "o";
  }
}

/**
 * retryableErr creates an error marked as retryable by the test policy.
 */
function retryableErr(message: string): Err {
  return Object.assign(new Err(message), { retryable: true });
}

/**
 * isRetryable recognizes the marker attached by retryableErr.
 */
function isRetryable(error: Err): boolean {
  return (error as Err & { retryable?: boolean }).retryable === true;
}

describe("cel/async/async_test.go/TestAsyncCallMethods", () => {
  it("exposes call identity metadata", () => {
    const call = new MockAsyncCall();
    expect(call.callId()).toBe(1);
    expect(call.functionName()).toBe("f");
    expect(call.overloadId()).toBe("o");
  });
});

describe("cel/async/async_test.go/TestDrainNone", () => {
  it("re-evaluates after one completion", () => {
    const strategy = drainNone();
    expect(strategy.nextAction([], 1).reevaluate).toBe(false);
    expect(strategy.nextAction([new MockAsyncCall()], 1).reevaluate).toBe(true);
    expect(strategy.nextAction([], 0).reevaluate).toBe(true);
  });
});

describe("cel/async/async_test.go/TestDrainAll", () => {
  it("waits until no active calls remain", () => {
    const strategy = drainAll();
    expect(strategy.nextAction([new MockAsyncCall()], 1).reevaluate).toBe(false);
    expect(strategy.nextAction([new MockAsyncCall()], 0).reevaluate).toBe(true);
  });
});

describe("cel/async/async_test.go/TestDrainReady", () => {
  it("debounces batches while calls remain active", () => {
    const strategy = drainReady(10);
    expect(strategy.nextAction([new MockAsyncCall()], 0)).toEqual({
      reevaluate: true,
      waitDurationMs: 0,
    });
    expect(strategy.nextAction([], 1)).toEqual({
      reevaluate: false,
      waitDurationMs: 0,
    });
    expect(strategy.nextAction([new MockAsyncCall()], 1)).toEqual({
      reevaluate: false,
      waitDurationMs: 10,
    });
  });
});

describe("cel/async/async_test.go/TestRetryMultipleAttemptsTimerReset", () => {
  it("returns the first successful retry result", async () => {
    let attempts = 0;
    const operation = retry({
      backoffMs: 1,
      binding: async () => {
        attempts++;
        return attempts < 3 ? retryableErr(`attempt ${attempts}`) : new Int(100n);
      },
      isRetryable,
      maxAttempts: 4,
    });
    expect((await operation(new AbortController().signal)).value()).toBe(100n);
    expect(attempts).toBe(3);
  });
});

describe("cel/async/async_test.go/TestRetryMaxAttemptsExhausted", () => {
  it("returns the final error after exhausting attempts", async () => {
    let attempts = 0;
    const operation = retry({
      backoffMs: 1,
      binding: async () => retryableErr(`retry attempt ${++attempts} failed`),
      isRetryable,
      maxAttempts: 3,
    });
    expect((await operation(new AbortController().signal)).toString()).toContain(
      "retry attempt 3 failed",
    );
    expect(attempts).toBe(3);
  });
});

describe("cel/async/async_test.go/TestRetryBindingCancellation", () => {
  it("interrupts the retry backoff when cancelled", async () => {
    const controller = new AbortController();
    const operation = retry({
      backoffMs: 500,
      binding: async () => retryableErr("retry me"),
      isRetryable,
      maxAttempts: 5,
    });
    globalThis.setTimeout(() => controller.abort(), 5);
    expect((await operation(controller.signal)).toString()).toContain("cancelled");
  });
});

describe("cel/async/async_test.go/TestRetryNonRetryableError", () => {
  it("does not retry errors rejected by the retry policy", async () => {
    let attempts = 0;
    const operation = retry({
      binding: async () => {
        attempts++;
        return new Err("do not retry me");
      },
      isRetryable,
      maxAttempts: 5,
    });
    expect((await operation(new AbortController().signal)).toString()).toContain("do not retry me");
    expect(attempts).toBe(1);
  });
});

describe("cel/async/async_test.go/TestRetryStandardError", () => {
  it("does not retry ordinary CEL errors without a retry marker", async () => {
    let attempts = 0;
    const operation = retry({
      binding: async () => {
        attempts++;
        return new Err("generic error");
      },
      isRetryable,
      maxAttempts: 5,
    });
    expect((await operation(new AbortController().signal)).toString()).toContain("generic error");
    expect(attempts).toBe(1);
  });
});

describe("cel/async/async_test.go/TestTimeoutBindingEnforcesAgainstContextIgnoringOp", () => {
  it("abandons a binding which ignores cancellation", async () => {
    const operation = timeout({
      binding: async () =>
        new Promise<Val>((resolve) => {
          globalThis.setTimeout(() => resolve(new Int(1n)), 100);
        }),
      timeoutMs: 5,
    });
    expect((await operation(new AbortController().signal)).toString()).toContain("timed out");
  });
});
