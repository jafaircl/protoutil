import type { AsyncOp } from "../common/functions.js";
import {
  Err,
  isError,
  isUnknown,
  maybeMergeUnknowns,
  type Unknown,
  unknown,
  type Val,
  wrapErr,
} from "../common/types/index.js";
import type { ExecutionFrame } from "./frame.js";
import type { InterpretableCall, InterpretableV2 } from "./interpretable.js";

/**
 * AsyncCall describes one pending or completed asynchronous function invocation.
 */
export interface AsyncCall {
  /** callId returns the unique identifier assigned to this invocation. */
  callId(): number;
  /** functionName returns the CEL function name. */
  functionName(): string;
  /** overloadId returns the selected overload identifier. */
  overloadId(): string;
}

/**
 * AsyncObserver monitors asynchronous function call lifecycle events.
 */
export interface AsyncObserver {
  /** onCallStarted runs when an asynchronous invocation is launched. */
  onCallStarted?(call: AsyncCall, args: Val[]): void;
  /** onCallFinished runs when an asynchronous invocation settles. */
  onCallFinished?(call: AsyncCall, result: Val): void;
}

/**
 * AsyncTrackerOptions configures one concurrent evaluation's async call tracker.
 */
export interface AsyncTrackerOptions {
  /** maxConcurrency limits simultaneously executing bindings; negative values are unbounded. */
  maxConcurrency: number;
  /** observer receives optional call lifecycle notifications. */
  observer?: AsyncObserver;
  /** signal cancels outstanding and future asynchronous work. */
  signal: AbortSignal;
}

/**
 * AsyncResultOptions identifies an asynchronous call and its evaluated arguments.
 */
export interface AsyncResultOptions {
  /** args contains the CEL arguments passed to the binding. */
  args: Val[];
  /** functionName is the CEL function name. */
  functionName: string;
  /** id is the AST expression node id. */
  id: number;
  /** implementation performs the asynchronous work. */
  implementation: AsyncOp;
  /** overloadId is the selected overload identifier. */
  overloadId: string;
}

/**
 * AsyncCallState retains one async invocation across repeated expression evaluation.
 */
class AsyncCallState implements AsyncCall {
  /** resultValue stores the completed CEL result. */
  public resultValue?: Val;
  /** started records whether the invocation has acquired a launch slot. */
  public started = false;

  /** constructor records immutable invocation identity and implementation data. */
  constructor(
    private readonly callIdValue: number,
    public readonly nodeId: number,
    private readonly functionNameValue: string,
    private readonly overloadIdValue: string,
    public readonly args: Val[],
    public readonly implementation: AsyncOp,
  ) {}

  /** callId returns the unique identifier assigned to this invocation. */
  public callId(): number {
    return this.callIdValue;
  }

  /** functionName returns the CEL function name. */
  public functionName(): string {
    return this.functionNameValue;
  }

  /** overloadId returns the selected overload identifier. */
  public overloadId(): string {
    return this.overloadIdValue;
  }
}

/**
 * AsyncCallTracker coordinates asynchronous calls across repeated evaluation passes.
 */
export class AsyncCallTracker {
  /** activeCountValue tracks the number of currently executing bindings. */
  private activeCountValue = 0;
  /** nextCallIdValue allocates stable unknown ids for invocations. */
  private nextCallIdValue = 1;
  /** states retains every invocation discovered during evaluation. */
  private readonly states: AsyncCallState[] = [];
  /** buckets index invocation candidates by a stable primitive-argument hash. */
  private readonly buckets = new Map<bigint, AsyncCallState[]>();
  /** queued retains calls waiting for a concurrency slot. */
  private readonly queued: AsyncCallState[] = [];
  /** waiters are notified whenever a call settles. */
  private readonly waiters = new Set<() => void>();

  /** constructor binds evaluation-wide cancellation, observer, and concurrency settings. */
  constructor(private readonly options: AsyncTrackerOptions) {}

  /**
   * computeResult returns a cached result or an unknown while asynchronous work remains.
   */
  public computeResult(options: AsyncResultOptions): Val {
    const key = hashCall(options.id, options.overloadId, options.args);
    const bucket = this.buckets.get(key) ?? [];
    let state = bucket.find((candidate) => callsMatch(candidate, options));
    if (state === undefined) {
      state = new AsyncCallState(
        this.nextCallIdValue++,
        options.id,
        options.functionName,
        options.overloadId,
        [...options.args],
        options.implementation,
      );
      this.states.push(state);
      bucket.push(state);
      this.buckets.set(key, bucket);
      this.queued.push(state);
      this.launchQueued();
    }
    return state.resultValue ?? unknown(state.callId());
  }

  /**
   * waitForAny pauses until one of the requested calls completes or evaluation is cancelled.
   */
  public async waitForAny(ids: number[]): Promise<void> {
    if (ids.some((id) => this.states.some((state) => state.callId() === id && state.resultValue))) {
      return;
    }
    if (this.options.signal.aborted) {
      throw cancellationError(this.options.signal);
    }
    await new Promise<void>((resolve, reject) => {
      const complete = () => {
        cleanup();
        resolve();
      };
      const cancelled = () => {
        cleanup();
        reject(cancellationError(this.options.signal));
      };
      const cleanup = () => {
        this.waiters.delete(complete);
        this.options.signal.removeEventListener("abort", cancelled);
      };
      this.waiters.add(complete);
      this.options.signal.addEventListener("abort", cancelled, { once: true });
    });
  }

  /** activeCalls returns the number of currently executing asynchronous calls. */
  public activeCalls(): number {
    return this.activeCountValue;
  }

  /** call returns call metadata for a registered call id. */
  public call(id: number): AsyncCall | undefined {
    return this.states.find((state) => state.callId() === id);
  }

  /** launchQueued starts as much pending work as the concurrency limit permits. */
  private launchQueued(): void {
    while (
      this.queued.length > 0 &&
      (this.options.maxConcurrency < 0 || this.activeCountValue < this.options.maxConcurrency)
    ) {
      const state = this.queued.shift()!;
      if (state.started || state.resultValue !== undefined) {
        continue;
      }
      this.launch(state);
    }
  }

  /** launch begins one asynchronous invocation and records its eventual result. */
  private launch(state: AsyncCallState): void {
    state.started = true;
    this.activeCountValue++;
    this.options.observer?.onCallStarted?.(state, [...state.args]);
    void Promise.resolve()
      .then(() => this.invoke(state))
      .then(
        (result) => {
          state.resultValue = result;
        },
        (cause) => {
          state.resultValue = cause instanceof Err ? cause : wrapErr(cause);
        },
      )
      .finally(() => {
        this.activeCountValue--;
        this.options.observer?.onCallFinished?.(state, state.resultValue!);
        this.launchQueued();
        for (const waiter of [...this.waiters]) {
          waiter();
        }
      });
  }

  /**
   * invoke waits for the binding or evaluation cancellation, whichever happens first.
   */
  private async invoke(state: AsyncCallState): Promise<Val> {
    const signal = this.options.signal;
    if (signal.aborted) {
      return wrapErr(cancellationError(signal));
    }
    let detachCancellation: (() => void) | undefined;
    const cancelled = new Promise<Val>((resolve) => {
      const onAbort = () => resolve(wrapErr(cancellationError(signal)));
      signal.addEventListener("abort", onAbort, { once: true });
      detachCancellation = () => signal.removeEventListener("abort", onAbort);
    });
    try {
      return await Promise.race([state.implementation(signal, ...state.args), cancelled]);
    } finally {
      detachCancellation?.();
    }
  }
}

/**
 * hashCall computes the stable FNV-1a bucket hash for an asynchronous invocation.
 *
 * Primitive values contribute to the key. Complex CEL values are matched within their bucket
 * using full CEL equality semantics.
 */
export function hashCall(id: number, overloadId: string, args: Val[]): bigint {
  let hash = 14_695_981_039_346_656_037n;
  const write = (bytes: Uint8Array): void => {
    for (const byte of bytes) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
    }
  };
  const idBytes = new Uint8Array(8);
  new DataView(idBytes.buffer).setBigUint64(0, BigInt(id), true);
  write(idBytes);
  write(new TextEncoder().encode(overloadId));
  write(new Uint8Array([0]));
  for (const argument of args) {
    const typeName = argument.type().typeName();
    if (typeName === "string") {
      write(new Uint8Array([115]));
      write(new TextEncoder().encode(String(argument.value())));
    } else if (typeName === "bool") {
      write(new Uint8Array([98, argument.value() === true ? 1 : 0]));
    } else if (typeName === "int" || typeName === "uint" || typeName === "double") {
      write(new Uint8Array([110]));
      const number = Number(argument.value());
      if (Number.isNaN(number)) {
        write(new TextEncoder().encode("NaN"));
        write(new Uint8Array([0]));
        continue;
      }
      const bytes = new Uint8Array(8);
      new DataView(bytes.buffer).setFloat64(0, Object.is(number, -0) ? 0 : number, true);
      write(bytes);
    } else {
      write(new Uint8Array([120]));
    }
    write(new Uint8Array([0]));
  }
  return hash;
}

/**
 * AsyncCallInterpretable evaluates arguments and delegates result tracking to the execution frame.
 */
class AsyncCallInterpretable implements InterpretableCall {
  /** constructor stores the planned call metadata and async binding. */
  constructor(
    private readonly idValue: number,
    private readonly functionNameValue: string,
    private readonly overloadIdValue: string,
    private readonly argsValue: InterpretableV2[],
    private readonly implementation: AsyncOp,
  ) {}

  /** id returns the expression node id. */
  public id(): number {
    return this.idValue;
  }

  /** functionName returns the CEL function name. */
  public functionName(): string {
    return this.functionNameValue;
  }

  /** overloadId returns the selected overload identifier. */
  public overloadId(): string {
    return this.overloadIdValue;
  }

  /** args returns the planned argument expressions. */
  public args(): InterpretableV2[] {
    return this.argsValue;
  }

  /** eval evaluates through a temporary frame and therefore rejects missing async setup. */
  public eval(): Val {
    return new Err("async evaluation requires concurrentEval");
  }

  /** exec evaluates strict arguments and resolves or registers the asynchronous invocation. */
  public exec(frame: ExecutionFrame): Val {
    const values: Val[] = [];
    let mergedUnknown: Unknown | undefined;
    for (const argument of this.argsValue) {
      const value = argument.exec(frame);
      if (isError(value)) {
        return value;
      }
      mergedUnknown = maybeMergeUnknowns(value, mergedUnknown);
      values.push(value);
    }
    if (mergedUnknown !== undefined) {
      return mergedUnknown;
    }
    return frame.computeAsyncResult({
      args: values,
      functionName: this.functionNameValue,
      id: this.idValue,
      implementation: this.implementation,
      overloadId: this.overloadIdValue,
    });
  }
}

/**
 * AsyncCallInterpretableOptions configures a planned asynchronous function call.
 */
export interface AsyncCallInterpretableOptions {
  /** args contains planned argument expressions before runtime evaluation. */
  args: InterpretableV2[];
  /** functionName is the CEL function name. */
  functionName: string;
  /** id is the AST expression node id. */
  id: number;
  /** implementation performs the asynchronous work. */
  implementation: AsyncOp;
  /** overloadId is the selected overload identifier. */
  overloadId: string;
}

/**
 * asyncCallInterpretable creates the planned representation of an asynchronous function call.
 */
export function asyncCallInterpretable(options: AsyncCallInterpretableOptions): InterpretableCall {
  return new AsyncCallInterpretable(
    options.id,
    options.functionName,
    options.overloadId,
    options.args,
    options.implementation,
  );
}

/**
 * callsMatch reports whether an existing state represents the same invocation.
 */
function callsMatch(state: AsyncCallState, options: AsyncResultOptions): boolean {
  if (
    state.nodeId !== options.id ||
    state.functionName() !== options.functionName ||
    state.overloadId() !== options.overloadId ||
    state.args.length !== options.args.length
  ) {
    return false;
  }
  return state.args.every((argument, index) => {
    const other = options.args[index]!;
    const equal = argument.equal(other);
    if (!isUnknown(equal) && !isError(equal) && equal.value() === true) {
      return true;
    }
    return (
      argument.type().typeName() === "double" &&
      other.type().typeName() === "double" &&
      Number.isNaN(Number(argument.value())) &&
      Number.isNaN(Number(other.value()))
    );
  });
}

/**
 * cancellationError converts an AbortSignal reason into an Error.
 */
function cancellationError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("evaluation cancelled");
}
