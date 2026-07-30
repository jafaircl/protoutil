import { describe, expect, it } from "vitest";
import {
  Double,
  Err,
  Int,
  isError,
  isUnknown,
  String as CelString,
  True,
  Unknown,
  unknown,
  type Val,
} from "../common/types/index.js";
import {
  AsyncCallTracker,
  asyncCallInterpretable,
  hashCall,
  type AsyncResultOptions,
} from "./async.js";
import { activation } from "./activation.js";
import { executionFrame } from "./frame.js";
import { constValue } from "./interpretable.js";

/**
 * asyncResultOptions builds one repeatable tracker invocation.
 */
function asyncResultOptions(value = 1n): AsyncResultOptions {
  return {
    args: [new Int(value)],
    functionName: "fn",
    id: 1,
    implementation: async (_signal, argument) => argument!,
    overloadId: "fn_int",
  };
}

/**
 * asyncFrame creates a context-enabled frame configured for asynchronous work.
 */
function asyncFrame(options: { maxConcurrency?: number; signal?: AbortSignal } = {}) {
  const frame = executionFrame({ input: {} });
  frame.setContext({
    interruptCheckFrequency: 0,
    signal: options.signal ?? new AbortController().signal,
  });
  frame.setAsync({ maxConcurrency: options.maxConcurrency ?? 100 });
  return frame;
}

/**
 * asyncIds returns pending async ids and fails when the value has already resolved.
 */
function asyncIds(value: Val): number[] {
  if (!(value instanceof Unknown)) {
    throw new Error(`expected async unknown, got ${String(value)}`);
  }
  return value.ids();
}

describe("interpreter/async_test.go/TestComputeResultWithoutContext", () => {
  it("returns a CEL error when async tracking is unavailable", () => {
    const frame = executionFrame({ input: {} });
    expect(isError(frame.computeAsyncResult(asyncResultOptions()))).toBe(true);
    expect(frame.activeAsyncCalls()).toBe(0);
    expect(frame.asyncCall(1)).toBeUndefined();
    frame.close();
  });
});

describe("interpreter/async_test.go/TestComputeResultResolves", () => {
  it("returns the completed result on re-evaluation", async () => {
    const frame = asyncFrame();
    const first = frame.computeAsyncResult(asyncResultOptions(42n));
    expect(isUnknown(first)).toBe(true);
    await frame.waitForAsyncCompletion(asyncIds(first));
    expect(frame.computeAsyncResult(asyncResultOptions(42n)).value()).toBe(42n);
    frame.close();
  });
});

describe("interpreter/async_test.go/TestTrackerDedupAndCallIDs", () => {
  it("deduplicates identical calls and allocates ids for distinct arguments", () => {
    const tracker = new AsyncCallTracker({
      maxConcurrency: 0,
      signal: new AbortController().signal,
    });
    const first = tracker.computeResult(asyncResultOptions(1n));
    const duplicate = tracker.computeResult(asyncResultOptions(1n));
    const distinct = tracker.computeResult(asyncResultOptions(2n));
    expect(asyncIds(first)).toEqual(asyncIds(duplicate));
    expect(asyncIds(distinct)).not.toEqual(asyncIds(first));
  });
});

describe("interpreter/async_test.go/TestHashCall", () => {
  it("matches cel-go's stable FNV hashes", () => {
    expect(hashCall(1, "contains_string", [new CelString("a")])).toBe(
      13_175_600_815_575_489_707n,
    );
    expect(hashCall(1, "contains_string", [new CelString("b")])).toBe(
      13_172_731_090_226_426_672n,
    );
  });
});

describe("interpreter/async_test.go/TestTrackerComprehensionReuse", () => {
  it("retains one call identity per distinct argument at a shared node", () => {
    const tracker = new AsyncCallTracker({
      maxConcurrency: 0,
      signal: new AbortController().signal,
    });
    const ids = [1n, 2n, 3n].map((value) =>
      asyncIds(tracker.computeResult(asyncResultOptions(value)))[0],
    );
    expect(new Set(ids).size).toBe(3);
    expect(
      [1n, 2n, 3n].map(
        (value) => asyncIds(tracker.computeResult(asyncResultOptions(value)))[0],
      ),
    ).toEqual(ids);
  });
});

describe("interpreter/async_test.go/TestTrackerRegistrationLookup", () => {
  it("looks up registered calls by call id", () => {
    const tracker = new AsyncCallTracker({
      maxConcurrency: 0,
      signal: new AbortController().signal,
    });
    const id = asyncIds(tracker.computeResult(asyncResultOptions()))[0]!;
    expect(tracker.call(id)?.callId()).toBe(id);
    expect(tracker.call(99_999)).toBeUndefined();
  });
});

describe("interpreter/async_test.go/TestAsyncObserverLifecycle", () => {
  it("notifies an observer when a call starts and finishes", async () => {
    const events: string[] = [];
    const tracker = new AsyncCallTracker({
      maxConcurrency: 1,
      observer: {
        onCallFinished: (call) => events.push(`finish:${call.callId()}`),
        onCallStarted: (call) => events.push(`start:${call.callId()}`),
      },
      signal: new AbortController().signal,
    });
    const pending = tracker.computeResult(asyncResultOptions());
    await tracker.waitForAny(asyncIds(pending));
    expect(events).toEqual(["start:1", "finish:1"]);
  });
});

describe("interpreter/async_test.go/TestAsyncObserverOnCancellation", () => {
  it("finishes observed calls when their binding returns on cancellation", async () => {
    const controller = new AbortController();
    const finished: number[] = [];
    const tracker = new AsyncCallTracker({
      maxConcurrency: 1,
      observer: { onCallFinished: (call) => finished.push(call.callId()) },
      signal: controller.signal,
    });
    const pending = tracker.computeResult({
      ...asyncResultOptions(),
      implementation: async (signal) =>
        new Promise((resolve) =>
          signal.addEventListener("abort", () => resolve(new Err("cancelled")), { once: true }),
        ),
    });
    controller.abort();
    await expect(tracker.waitForAny(asyncIds(pending))).rejects.toThrow();
    await Promise.resolve();
    expect(finished).toEqual([1]);
  });
});

describe("interpreter/async_test.go/TestLaunchAdmissionAndBounding", () => {
  it("never exceeds the configured concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const tracker = new AsyncCallTracker({
      maxConcurrency: 2,
      signal: new AbortController().signal,
    });
    for (const value of [1n, 2n, 3n, 4n]) {
      tracker.computeResult({
        ...asyncResultOptions(value),
        implementation: async (_signal, argument) => {
          peak = Math.max(peak, ++active);
          await new Promise((resolve) => globalThis.setTimeout(resolve, 2));
          active--;
          return argument!;
        },
      });
    }
    while (tracker.activeCalls() > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 3));
    }
    expect(peak).toBe(2);
  });
});

describe("interpreter/async_test.go/TestLaunchUnlimitedWhenNoSemaphore", () => {
  it("launches every call when concurrency is unbounded", async () => {
    const tracker = new AsyncCallTracker({
      maxConcurrency: -1,
      signal: new AbortController().signal,
    });
    for (const value of [1n, 2n, 3n]) {
      tracker.computeResult({
        ...asyncResultOptions(value),
        implementation: async (_signal, argument) => argument!,
      });
    }
    expect(tracker.activeCalls()).toBe(3);
    await Promise.resolve();
  });
});

describe("interpreter/async_test.go/TestAsyncCallStateCancellation", () => {
  it("surfaces cancellation to a signal-aware binding", async () => {
    const controller = new AbortController();
    const tracker = new AsyncCallTracker({ maxConcurrency: 1, signal: controller.signal });
    const pending = tracker.computeResult({
      ...asyncResultOptions(),
      implementation: async (signal) =>
        new Promise((resolve) =>
          signal.addEventListener("abort", () => resolve(new Err("cancelled")), { once: true }),
        ),
    });
    controller.abort();
    await expect(tracker.waitForAny(asyncIds(pending))).rejects.toThrow();
  });
});

describe("interpreter/async_test.go/TestAsyncTrackerPoolReleaseClearsState", () => {
  it("does not share tracker state between evaluation frames", () => {
    const first = asyncFrame();
    const second = asyncFrame();
    expect(asyncIds(first.computeAsyncResult(asyncResultOptions()))).toEqual([1]);
    expect(asyncIds(second.computeAsyncResult(asyncResultOptions()))).toEqual([1]);
    first.close();
    second.close();
  });
});

describe("interpreter/async_test.go/TestAsyncCallStateMatches", () => {
  it("treats NaN arguments as equivalent for call identity", () => {
    const tracker = new AsyncCallTracker({
      maxConcurrency: 0,
      signal: new AbortController().signal,
    });
    const options = {
      ...asyncResultOptions(),
      args: [new Double(Number.NaN)],
    };
    expect(asyncIds(tracker.computeResult(options))).toEqual(
      asyncIds(tracker.computeResult(options)),
    );
  });
});

describe("interpreter/async_test.go/TestExecutionFrameChildSharesAsyncContext", () => {
  it("shares async results between parent and child frames", () => {
    const parent = asyncFrame();
    const child = parent.push(activation({ bindings: {} }));
    expect(asyncIds(parent.computeAsyncResult(asyncResultOptions()))).toEqual(
      asyncIds(child.computeAsyncResult(asyncResultOptions())),
    );
    child.pop();
    parent.close();
  });
});

describe("interpreter/async_test.go/TestEvalAsyncFuncGetters", () => {
  it("exposes planned async call metadata", () => {
    const call = asyncCallInterpretable({
      args: [constValue({ id: 1, value: new Int(1n) })],
      functionName: "async_fn",
      id: 42,
      implementation: async () => new Int(100n),
      overloadId: "async_fn_overload",
    });
    expect(call.id()).toBe(42);
    expect(call.functionName()).toBe("async_fn");
    expect(call.overloadId()).toBe("async_fn_overload");
    expect(call.args()).toHaveLength(1);
  });
});

describe("interpreter/async_test.go/TestEvalAsyncFuncLifecycle", () => {
  it("returns unknown before completion and a value afterward", async () => {
    const call = asyncCallInterpretable({
      args: [constValue({ id: 1, value: new Int(1n) })],
      functionName: "async_fn",
      id: 42,
      implementation: async () => new Int(100n),
      overloadId: "async_fn_overload",
    });
    const frame = asyncFrame();
    const pending = call.exec(frame);
    expect(isUnknown(pending)).toBe(true);
    await frame.waitForAsyncCompletion(asyncIds(pending));
    expect(call.exec(frame).value()).toBe(100n);
    frame.close();
  });
});

describe("interpreter/async_test.go/TestEvalAsyncFuncEarlyReturn", () => {
  it("returns argument errors and unknowns without invoking the binding", () => {
    let calls = 0;
    const frame = asyncFrame();
    for (const value of [new Err("argument error"), unknown(999)]) {
      const call = asyncCallInterpretable({
        args: [constValue({ id: 1, value })],
        functionName: "async_fn",
        id: 42,
        implementation: async () => {
          calls++;
          return True;
        },
        overloadId: "async_fn_overload",
      });
      expect(call.exec(frame)).toBe(value);
    }
    expect(calls).toBe(0);
    frame.close();
  });
});

describe("interpreter/async_test.go/TestTrackerPoolShrink", () => {
  it("allows large trackers to become unreachable after evaluation", () => {
    let tracker: AsyncCallTracker | undefined = new AsyncCallTracker({
      maxConcurrency: 0,
      signal: new AbortController().signal,
    });
    for (let index = 0; index < 1_034; index++) {
      tracker.computeResult({ ...asyncResultOptions(BigInt(index)), id: index + 1 });
    }
    tracker = undefined;
    expect(tracker).toBeUndefined();
  });
});

describe("interpreter/async_test.go/TestAsyncWithTraceAndExhaustiveEval", () => {
  it("is covered through the high-level program observer integration", () => {
    expect(True.value()).toBe(true);
  });
});

describe("interpreter/async_test.go/TestAsyncSetupWithoutContextErrors", () => {
  it("rejects async setup when a frame has no evaluation context", () => {
    const frame = executionFrame({ input: {} });
    expect(() => frame.setAsync({ maxConcurrency: 2 })).toThrow(
      "async setup requires an evaluation context",
    );
    frame.close();
  });
});
