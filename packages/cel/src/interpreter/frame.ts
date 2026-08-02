import type { Val } from "../common/types/index.js";
import { Err } from "../common/types/index.js";
import type { Adapter } from "../common/types/provider.js";
import {
  type Activation,
  asPartialActivation,
  hierarchicalActivation,
  isActivation,
  isLocalVariableHolder,
  type PartialActivation,
} from "./activation.js";
import { AsyncCallTracker, type AsyncObserver, type AsyncResultOptions } from "./async.js";

/**
 * FrameContext tracks interrupt-related state shared across a frame hierarchy.
 */
interface FrameContext {
  /**
   * asyncTrackerValue retains asynchronous call results across re-evaluation passes.
   */
  asyncTrackerValue?: AsyncCallTracker;
  /**
   * controllerValue aborts the internal frame signal on close.
   */
  controllerValue: AbortController;

  /**
   * signalValue is the signal shared across the frame hierarchy.
   */
  signalValue: AbortSignal;

  /**
   * interruptCheckCountValue stores how many times interruption has been checked.
   */
  interruptCheckCountValue: number;

  /**
   * interruptCheckFrequencyValue determines how often to inspect the signal.
   */
  interruptCheckFrequencyValue: number;

  /**
   * interruptedValue records whether the evaluation has already been interrupted.
   */
  interruptedValue: boolean;

  /**
   * detachValue removes the external abort listener during cleanup.
   */
  detachValue?: () => void;
}

/**
 * ExecutionFrameOptions configures execution frame construction.
 */
export interface ExecutionFrameOptions {
  /**
   * input contains either an activation or a map of bindings for the frame.
   */
  input: unknown;

  /**
   * adapter converts map-backed input bindings once for the lifetime of the frame.
   */
  adapter?: Adapter;
}

/**
 * FrameContextOptions configures interrupt handling for a frame.
 */
export interface FrameContextOptions {
  /**
   * signal is an optional external abort signal to mirror.
   */
  signal?: AbortSignal;

  /**
   * interruptCheckFrequency controls how often checkInterrupt inspects the signal.
   */
  interruptCheckFrequency: number;
}

/**
 * AsyncFrameOptions configures asynchronous call tracking on an execution frame.
 */
export interface AsyncFrameOptions {
  /** maxConcurrency limits simultaneously executing asynchronous bindings. */
  maxConcurrency: number;
  /** observer receives optional asynchronous call lifecycle events. */
  observer?: AsyncObserver;
}

/**
 * ActivationHierarchyOptions configures an explicit parent-child activation chain on a frame.
 */
export interface ActivationHierarchyOptions {
  /**
   * parent is the activation resolved after the child.
   */
  parent: Activation;

  /**
   * child is the activation resolved first.
   */
  child: Activation;
}

/**
 * InheritParentFrameOptions configures parent-frame inheritance for promoted frames.
 */
export interface InheritParentFrameOptions {
  /**
   * parentFrame is the existing execution frame whose shared context should be inherited.
   */
  parentFrame: ExecutionFrame;
}

/**
 * FrameReuseOptions configures a pooled execution frame for one active scope.
 */
interface FrameReuseOptions {
  /**
   * activation is the name-resolution scope installed on the frame.
   */
  activation: Activation;

  /**
   * context is the interrupt state shared by the frame hierarchy.
   */
  context?: FrameContext;

  /**
   * inputActivation is the pooled map-backed activation owned by a root frame.
   */
  inputActivation?: InputActivation;

  /**
   * parentFrame is the parent scope for a pushed child frame.
   */
  parentFrame?: ExecutionFrame;
}

/**
 * InputActivation provides per-frame lazy binding caching for map-based frame inputs.
 */
class InputActivation implements Activation {
  /**
   * lazyVarsValue stores resolved lazy bindings so each one only runs once per frame.
   */
  private readonly lazyVarsValue = new Map<string, unknown>();

  /**
   * adaptedVarsValue stores CEL values resolved from native map bindings in this evaluation.
   */
  private readonly adaptedVarsValue = new Map<string, Val>();

  /**
   * adapterValue adapts native map bindings when the frame was created by a CEL program.
   */
  private adapterValue?: Adapter;

  /**
   * varsValue stores the input map while this pooled activation is active.
   */
  private varsValue?: Record<string, unknown>;

  /**
   * configure attaches the reusable activation to one input map.
   */
  public configure(vars: Record<string, unknown>, adapter?: Adapter): void {
    this.varsValue = vars;
    this.adapterValue = adapter;
  }

  /**
   * resolveName looks up the input variable and caches lazy values after the first call.
   */
  public resolveName(name: string): [unknown, boolean] {
    if (this.varsValue === undefined || !Object.hasOwn(this.varsValue, name)) {
      return [undefined, false];
    }
    const adapted = this.adaptedVarsValue.get(name);
    if (adapted !== undefined) {
      return [adapted, true];
    }
    let value = this.varsValue[name];
    if (typeof value === "function") {
      if (this.lazyVarsValue.has(name)) {
        value = this.lazyVarsValue.get(name);
      } else {
        value = (value as () => unknown)();
        this.lazyVarsValue.set(name, value);
      }
    }
    if (this.adapterValue !== undefined) {
      const adaptedValue = this.adapterValue.nativeToValue(value);
      this.adaptedVarsValue.set(name, adaptedValue);
      return [adaptedValue, true];
    }
    return [value, true];
  }

  /**
   * parent returns undefined because input activations are not hierarchical.
   */
  public parent(): Activation | undefined {
    return undefined;
  }

  /**
   * clear removes any cached lazy values when the frame is closed.
   */
  public clear(): void {
    this.lazyVarsValue.clear();
    this.adaptedVarsValue.clear();
    this.varsValue = undefined;
    this.adapterValue = undefined;
  }
}

/**
 * inputActivationPool stores inactive map-backed activations for root-frame reuse.
 */
const inputActivationPool: InputActivation[] = [];

/**
 * ExecutionFrame provides the context for a single evaluation of an expression.
 */
export class ExecutionFrame implements Activation {
  /**
   * parentFrameValue stores the parent frame used for pushed child scopes.
   */
  private parentFrameValue?: ExecutionFrame;

  /**
   * contextValue stores the shared interrupt state across a frame hierarchy.
   */
  private contextValue?: FrameContext;

  /**
   * inputActivationValue tracks the pooled map activation owned by a root frame.
   */
  private inputActivationValue?: InputActivation;

  /**
   * activationValue stores the active name-resolution scope.
   */
  private activationValue?: Activation;

  /**
   * acquire configures an inactive pooled frame for one root or child scope.
   */
  public static acquire(options: FrameReuseOptions): ExecutionFrame {
    const frame = framePool.pop() ?? new ExecutionFrame();
    frame.configure(options);
    return frame;
  }

  /**
   * configure prepares a pooled frame for one root or child scope.
   */
  private configure(options: FrameReuseOptions): void {
    this.activationValue = options.activation;
    this.inputActivationValue = options.inputActivation;
    this.parentFrameValue = options.parentFrame;
    this.contextValue = options.context;
  }

  /**
   * activation returns the current activation stored by the frame.
   */
  public activation(): Activation {
    return this.activationValue!;
  }

  /**
   * parentFrame returns the parent frame, if any.
   */
  public parentFrame(): ExecutionFrame | undefined {
    return this.parentFrameValue;
  }

  /**
   * signal returns the shared abort signal, if the frame has one.
   */
  public signal(): AbortSignal | undefined {
    return this.contextValue?.signalValue;
  }

  /**
   * setActivationHierarchy replaces the current activation with an explicit parent-child hierarchy.
   */
  public setActivationHierarchy(options: ActivationHierarchyOptions): void {
    this.activationValue = hierarchicalActivation(options);
  }

  /**
   * inheritParentFrame links a promoted frame to an existing parent frame and shared context.
   */
  public inheritParentFrame(options: InheritParentFrameOptions): void {
    this.parentFrameValue = options.parentFrame;
    this.contextValue = options.parentFrame.contextValue;
  }

  /**
   * setContext configures interrupt tracking on the root frame.
   */
  public setContext(options: FrameContextOptions): void {
    if (this.parentFrameValue !== undefined) {
      throw new Error("setContext() called on child frame");
    }
    if (this.contextValue !== undefined) {
      throw new Error("setContext() called more than once");
    }
    const controller = new AbortController();
    const signalValue = controller.signal;
    let detachValue: (() => void) | undefined;
    if (options.signal !== undefined) {
      const onAbort = () => controller.abort(options.signal?.reason);
      if (options.signal.aborted) {
        controller.abort(options.signal.reason);
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
        detachValue = () => options.signal?.removeEventListener("abort", onAbort);
      }
    }
    this.contextValue = {
      controllerValue: controller,
      signalValue,
      interruptCheckCountValue: 0,
      interruptCheckFrequencyValue: options.interruptCheckFrequency,
      interruptedValue: signalValue.aborted,
      detachValue,
    };
  }

  /**
   * setAsync configures asynchronous call tracking on a context-enabled root frame.
   */
  public setAsync(options: AsyncFrameOptions): void {
    if (this.parentFrameValue !== undefined) {
      throw new Error("setAsync() called on child frame");
    }
    if (this.contextValue === undefined) {
      throw new Error("async setup requires an evaluation context");
    }
    if (this.contextValue.asyncTrackerValue !== undefined) {
      throw new Error("setAsync() called more than once");
    }
    this.contextValue.asyncTrackerValue = new AsyncCallTracker({
      maxConcurrency: options.maxConcurrency,
      observer: options.observer,
      signal: this.contextValue.signalValue,
    });
  }

  /**
   * computeAsyncResult returns a cached result or registers an asynchronous invocation.
   */
  public computeAsyncResult(options: AsyncResultOptions): Val {
    if (this.contextValue?.asyncTrackerValue === undefined) {
      return new Err("async evaluation requires concurrentEval");
    }
    return this.contextValue.asyncTrackerValue.computeResult(options);
  }

  /** asyncCall returns registered call metadata by id. */
  public asyncCall(id: number) {
    return this.contextValue?.asyncTrackerValue?.call(id);
  }

  /**
   * waitForAsyncCompletion waits for one unresolved call represented by the supplied unknown ids.
   */
  public async waitForAsyncCompletion(ids: number[]): Promise<void> {
    if (this.contextValue?.asyncTrackerValue === undefined) {
      throw new Error("async evaluation requires concurrentEval");
    }
    await this.contextValue.asyncTrackerValue.waitForAny(ids);
  }

  /** activeAsyncCalls returns the number of currently executing asynchronous bindings. */
  public activeAsyncCalls(): number {
    return this.contextValue?.asyncTrackerValue?.activeCalls() ?? 0;
  }

  /**
   * close releases any frame-local state and aborts the shared signal on the root frame.
   */
  public close(): void {
    if (this.activationValue === undefined) {
      return;
    }
    if (this.parentFrameValue === undefined && this.contextValue !== undefined) {
      this.contextValue.detachValue?.();
      this.contextValue.controllerValue.abort();
    }
    this.release();
  }

  /**
   * push creates a child frame whose activation resolves through the current frame first and the child second.
   */
  public push(childActivation: Activation): ExecutionFrame {
    const child = ExecutionFrame.acquire({
      activation: hierarchicalActivation({
        parent: this.activationValue!,
        child: childActivation,
      }),
      parentFrame: this,
      context: this.contextValue,
    });
    return child;
  }

  /**
   * pop returns the parent frame, or the frame itself when it has no parent.
   */
  public pop(): ExecutionFrame {
    if (this.parentFrameValue === undefined) {
      return this;
    }
    const parent = this.parentFrameValue;
    this.release();
    return parent;
  }

  /**
   * resolveName proxies name resolution to the current activation.
   */
  public resolveName(name: string): [unknown, boolean] {
    return this.activationValue!.resolveName(name);
  }

  /**
   * parent proxies parent-activation lookup to the current activation.
   */
  public parent(): Activation | undefined {
    return this.activationValue!.parent();
  }

  /**
   * asPartialActivation returns the first partial activation visible from the current activation chain.
   */
  public asPartialActivation(): [PartialActivation | undefined, boolean] {
    return asPartialActivation(this.activationValue!);
  }

  /**
   * unwrap returns the current internal activation.
   */
  public unwrap(): Activation {
    return this.activationValue!;
  }

  /**
   * isLocalVariable reports whether a name belongs to a local scope in the activation hierarchy.
   */
  public isLocalVariable(name: string): boolean {
    return (
      this.activationValue !== undefined &&
      isLocalVariableHolder(this.activationValue) &&
      this.activationValue.isLocalVariable(name)
    );
  }

  /**
   * release clears active references and returns the frame to the shared stack pool.
   */
  private release(): void {
    if (this.inputActivationValue !== undefined) {
      this.inputActivationValue.clear();
      inputActivationPool.push(this.inputActivationValue);
      this.inputActivationValue = undefined;
    }
    this.activationValue = undefined;
    this.parentFrameValue = undefined;
    this.contextValue = undefined;
    framePool.push(this);
  }

  /**
   * checkInterrupt returns whether the shared frame context has been interrupted.
   */
  public checkInterrupt(): boolean {
    if (this.contextValue === undefined) {
      return false;
    }
    if (this.contextValue.interruptedValue) {
      return true;
    }
    this.contextValue.interruptCheckCountValue += 1;
    const frequency = this.contextValue.interruptCheckFrequencyValue;
    if (
      frequency > 0 &&
      this.contextValue.interruptCheckCountValue % frequency === 0 &&
      this.contextValue.signalValue.aborted
    ) {
      this.contextValue.interruptedValue = true;
      return true;
    }
    return false;
  }
}

/**
 * framePool stores inactive frames so root and comprehension evaluation avoid repeated allocation.
 */
const framePool: ExecutionFrame[] = [];

/**
 * executionFrame creates a new execution frame from an activation or binding map.
 */
export function executionFrame(options: ExecutionFrameOptions): ExecutionFrame {
  if (isActivation(options.input)) {
    return ExecutionFrame.acquire({ activation: options.input });
  }
  if (isBindingMap(options.input)) {
    const inputActivation = inputActivationPool.pop() ?? new InputActivation();
    inputActivation.configure(options.input, options.adapter);
    return ExecutionFrame.acquire({
      activation: inputActivation,
      inputActivation,
    });
  }
  throw new Error(
    `invalid input, wanted Activation or map[string]any, got: (${typeof options.input})${String(options.input)}`,
  );
}

/**
 * isBindingMap returns whether the frame input is a plain string-keyed binding map.
 */
function isBindingMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
