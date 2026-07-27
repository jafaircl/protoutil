import {
  type Activation,
  asPartialActivation,
  hierarchicalActivation,
  isActivation,
  type PartialActivation,
} from "./activation.js";

/**
 * FrameContext tracks interrupt-related state shared across a frame hierarchy.
 */
interface FrameContext {
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
 * InputActivation provides per-frame lazy binding caching for map-based frame inputs.
 */
class InputActivation implements Activation {
  /**
   * lazyVarsValue stores resolved lazy bindings so each one only runs once per frame.
   */
  private readonly lazyVarsValue = new Map<string, unknown>();

  /**
   * constructor initializes the frame input variable map.
   */
  constructor(private readonly varsValue: Record<string, unknown>) {}

  /**
   * resolveName looks up the input variable and caches lazy values after the first call.
   */
  public resolveName(name: string): [unknown, boolean] {
    if (!Object.hasOwn(this.varsValue, name)) {
      return [undefined, false];
    }
    const value = this.varsValue[name];
    if (typeof value === "function") {
      if (this.lazyVarsValue.has(name)) {
        return [this.lazyVarsValue.get(name), true];
      }
      const resolved = (value as () => unknown)();
      this.lazyVarsValue.set(name, resolved);
      return [resolved, true];
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
  }
}

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
   * constructor initializes the frame with its activation.
   */
  constructor(private activationValue: Activation) {}

  /**
   * activation returns the current activation stored by the frame.
   */
  public activation(): Activation {
    return this.activationValue;
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
      const onAbort = () => controller.abort();
      if (options.signal.aborted) {
        controller.abort();
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
   * close releases any frame-local state and aborts the shared signal on the root frame.
   */
  public close(): void {
    if (this.parentFrameValue === undefined && this.contextValue !== undefined) {
      this.contextValue.detachValue?.();
      this.contextValue.controllerValue.abort();
    }
    if (this.activationValue instanceof InputActivation) {
      this.activationValue.clear();
    }
    this.parentFrameValue = undefined;
    this.contextValue = undefined;
  }

  /**
   * push creates a child frame whose activation resolves through the current frame first and the child second.
   */
  public push(childActivation: Activation): ExecutionFrame {
    const child = new ExecutionFrame(
      hierarchicalActivation({ parent: this.activationValue, child: childActivation }),
    );
    child.parentFrameValue = this;
    child.contextValue = this.contextValue;
    return child;
  }

  /**
   * pop returns the parent frame, or the frame itself when it has no parent.
   */
  public pop(): ExecutionFrame {
    return this.parentFrameValue ?? this;
  }

  /**
   * resolveName proxies name resolution to the current activation.
   */
  public resolveName(name: string): [unknown, boolean] {
    return this.activationValue.resolveName(name);
  }

  /**
   * parent proxies parent-activation lookup to the current activation.
   */
  public parent(): Activation | undefined {
    return this.activationValue.parent();
  }

  /**
   * asPartialActivation returns the first partial activation visible from the current activation chain.
   */
  public asPartialActivation(): [PartialActivation | undefined, boolean] {
    return asPartialActivation(this.activationValue);
  }

  /**
   * unwrap returns the current internal activation.
   */
  public unwrap(): Activation {
    return this.activationValue;
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
 * executionFrame creates a new execution frame from an activation or binding map.
 */
export function executionFrame(options: ExecutionFrameOptions): ExecutionFrame {
  return new ExecutionFrame(frameActivation(options.input));
}

/**
 * frameActivation converts frame input into the activation used by the execution frame.
 */
function frameActivation(input: unknown): Activation {
  if (isActivation(input)) {
    return input;
  }
  if (isBindingMap(input)) {
    return new InputActivation(input);
  }
  throw new Error(
    `invalid input, wanted Activation or map[string]any, got: (${typeof input})${String(input)}`,
  );
}

/**
 * isBindingMap returns whether the frame input is a plain string-keyed binding map.
 */
function isBindingMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
