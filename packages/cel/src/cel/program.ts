import { Unknown } from "../common/types/unknown.js";
import type { Val } from "../common/types/ref/reference.js";
import type { Activation } from "../interpreter/activation.js";
import type { AsyncObserver } from "../interpreter/async.js";
import type { EvalState } from "../interpreter/eval-state.js";
import { executionFrame } from "../interpreter/frame.js";
import type { InterpretableV2 } from "../interpreter/interpretable.js";
import type { EvalStateSink } from "../interpreter/interpreter.js";
import type { CostTracker } from "../interpreter/runtime-cost.js";

/**
 * EvalDetails contains information gathered during CEL evaluation.
 */
export class EvalDetails {
  /**
   * constructor stores the evaluation state and actual runtime cost observed for the result.
   */
  constructor(
    private readonly stateValue?: EvalState,
    private readonly actualCostValue?: number,
  ) {}

  /**
   * state returns the expression values observed during evaluation.
   */
  public state(): EvalState | undefined {
    return this.stateValue;
  }

  /**
   * actualCost returns the measured runtime cost when cost tracking was enabled.
   */
  public actualCost(): number | undefined {
    return this.actualCostValue;
  }
}

/**
 * EvalResult contains a CEL value and the details gathered while producing it.
 */
export interface EvalResult {
  /**
   * value is the CEL evaluation result.
   */
  value: Val;

  /**
   * details contains state and other metadata gathered during evaluation.
   */
  details: EvalDetails;
}

/**
 * ProgramEvalStateSink retains the state initialized for the current synchronous evaluation.
 */
export class ProgramEvalStateSink implements EvalStateSink {
  /**
   * stateValue stores the most recently initialized evaluation state.
   */
  private stateValue?: EvalState;

  /**
   * setEvalState records the state initialized by the interpreter observer.
   */
  public setEvalState(state: EvalState): void {
    this.stateValue = state;
  }

  /**
   * evalState returns the state initialized for the current evaluation.
   */
  public evalState(): EvalState | undefined {
    return this.stateValue;
  }

  /**
   * reset clears state retained from a preceding evaluation.
   */
  public reset(): void {
    this.stateValue = undefined;
  }
}

/**
 * ProgramCostTrackerSink retains the tracker initialized for the current synchronous evaluation.
 */
export class ProgramCostTrackerSink {
  /**
   * trackerValue stores the tracker created by the runtime observer.
   */
  private trackerValue?: CostTracker;

  /**
   * setCostTracker records the tracker initialized for an evaluation.
   */
  public setCostTracker(tracker: CostTracker): void {
    this.trackerValue = tracker;
  }

  /**
   * actualCost returns the current tracker's measured cost.
   */
  public actualCost(): number | undefined {
    return this.trackerValue?.actualCost();
  }

  /**
   * reset clears the tracker retained from a preceding evaluation.
   */
  public reset(): void {
    this.trackerValue = undefined;
  }
}

/**
 * Program evaluates a compiled CEL AST against input variables.
 */
export interface Program {
  /**
   * eval returns the result of evaluating the program against an activation or binding map.
   */
  eval(input: unknown): Val;

  /**
   * evalWithDetails evaluates the program and returns its observed evaluation details.
   */
  evalWithDetails(input: unknown): EvalResult;

  /**
   * contextEval evaluates the program with an abort signal for interruptible comprehensions.
   */
  contextEval(input: unknown, options: ContextEvalOptions): Val;

  /**
   * contextEvalWithDetails evaluates with cancellation and returns observed evaluation details.
   */
  contextEvalWithDetails(input: unknown, options: ContextEvalOptions): EvalResult;

  /**
   * concurrentEval resolves asynchronous function calls and returns the final evaluation result.
   */
  concurrentEval(input: unknown, options: ContextEvalOptions): Promise<EvalResult>;
}

/**
 * ContextEvalOptions configures a context-aware program evaluation.
 */
export interface ContextEvalOptions {
  /**
   * signal communicates cancellation to interruptible evaluation.
   */
  signal: AbortSignal;
}

/**
 * EvalProgramOptions configures the high-level program wrapper.
 */
export interface EvalProgramOptions {
  /**
   * asyncMaxConcurrency limits the number of simultaneously executing asynchronous bindings.
   */
  asyncMaxConcurrency?: number;

  /**
   * asyncObserver receives asynchronous call lifecycle events.
   */
  asyncObserver?: AsyncObserver;

  /**
   * costTrackerSink receives the cost tracker initialized for each evaluation.
   */
  costTrackerSink?: ProgramCostTrackerSink;

  /**
   * globals contains program-scoped variables resolved after evaluation-specific input.
   */
  globals?: Activation;

  /**
   * hasAsync records whether the environment declares asynchronous function bindings.
   */
  hasAsync?: boolean;

  /**
   * interruptCheckFrequency controls how often comprehensions inspect the abort signal.
   */
  interruptCheckFrequency?: number;

  /**
   * stateSink receives evaluation state from a configured interpreter observer.
   */
  stateSink?: ProgramEvalStateSink;
}

/**
 * ProgramEvaluationOptions configures one internal synchronous evaluation.
 */
interface ProgramEvaluationOptions {
  /**
   * input contains the activation or binding map evaluated by the program.
   */
  input: unknown;

  /**
   * context optionally carries cancellation state for context-aware evaluation.
   */
  context?: ContextEvalOptions;
}

/**
 * EvalProgram adapts an interpreter program to the high-level CEL program API.
 */
export class EvalProgram implements Program {
  /**
   * constructor stores the planned interpreter expression.
   */
  constructor(
    private readonly interpretable: InterpretableV2,
    private readonly options: EvalProgramOptions = {},
  ) {}

  /**
   * eval evaluates the program and releases per-evaluation frame resources afterward.
   */
  public eval(input: unknown): Val {
    this.rejectSynchronousAsyncEvaluation();
    return this.execute({ input });
  }

  /**
   * evalWithDetails evaluates the program and returns the per-evaluation state.
   */
  public evalWithDetails(input: unknown): EvalResult {
    this.rejectSynchronousAsyncEvaluation();
    return this.evaluate({ input });
  }

  /**
   * contextEval evaluates the program with cancellation state attached to its execution frame.
   */
  public contextEval(input: unknown, options: ContextEvalOptions): Val {
    if (options?.signal === undefined) {
      throw new Error("context can not be nil");
    }
    this.rejectSynchronousAsyncEvaluation();
    return this.execute({
      input,
      context: options,
    });
  }

  /**
   * contextEvalWithDetails evaluates with cancellation and returns the per-evaluation state.
   */
  public contextEvalWithDetails(input: unknown, options: ContextEvalOptions): EvalResult {
    if (options?.signal === undefined) {
      throw new Error("context can not be nil");
    }
    this.rejectSynchronousAsyncEvaluation();
    return this.evaluate({
      input,
      context: options,
    });
  }

  /**
   * concurrentEval repeatedly evaluates until every required asynchronous call resolves.
   */
  public async concurrentEval(input: unknown, options: ContextEvalOptions): Promise<EvalResult> {
    if (options?.signal === undefined) {
      throw new Error("context can not be nil");
    }
    this.options.stateSink?.reset();
    this.options.costTrackerSink?.reset();
    const frame = executionFrame({ input });
    if (this.options.globals !== undefined) {
      frame.setActivationHierarchy({
        parent: this.options.globals,
        child: frame.activation(),
      });
    }
    frame.setContext({
      signal: options.signal,
      interruptCheckFrequency: this.options.interruptCheckFrequency ?? 0,
    });
    frame.setAsync({
      maxConcurrency: this.options.asyncMaxConcurrency ?? 100,
      observer: this.options.asyncObserver,
    });
    try {
      for (;;) {
        const value = this.interpretable.exec(frame);
        if (!(value instanceof Unknown) || !value.hasUnknownFunction()) {
          return {
            value,
            details: new EvalDetails(
              this.options.stateSink?.evalState(),
              this.options.costTrackerSink?.actualCost(),
            ),
          };
        }
        await frame.waitForAsyncCompletion(value.ids());
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`internal error: ${message}`, { cause });
    } finally {
      frame.close();
    }
  }

  /**
   * rejectSynchronousAsyncEvaluation prevents unresolved async calls from entering sync evaluation.
   */
  private rejectSynchronousAsyncEvaluation(): void {
    if (this.options.hasAsync) {
      throw new Error("expression contains asynchronous function calls; use concurrentEval");
    }
  }

  /**
   * evaluate executes the planned expression and captures state initialized by its observers.
   */
  private evaluate(options: ProgramEvaluationOptions): EvalResult {
    const value = this.execute(options);
    return {
      value,
      details: new EvalDetails(
        this.options.stateSink?.evalState(),
        this.options.costTrackerSink?.actualCost(),
      ),
    };
  }

  /**
   * execute evaluates the planned expression without allocating result-detail wrappers.
   */
  private execute(options: ProgramEvaluationOptions): Val {
    this.options.stateSink?.reset();
    this.options.costTrackerSink?.reset();
    const frame = executionFrame({ input: options.input });
    if (this.options.globals !== undefined) {
      // Evaluation inputs form the child scope so callers can override program globals.
      frame.setActivationHierarchy({
        parent: this.options.globals,
        child: frame.activation(),
      });
    }
    if (options.context !== undefined) {
      frame.setContext({
        signal: options.context.signal,
        interruptCheckFrequency: this.options.interruptCheckFrequency ?? 0,
      });
    }
    try {
      return this.interpretable.exec(frame);
    } catch (cause) {
      // Match cel-go's program recovery boundary: unexpected host failures must not escape as
      // unclassified application exceptions.
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`internal error: ${message}`, { cause });
    } finally {
      frame.close();
    }
  }
}

/**
 * program wraps a planned interpreter expression in the public CEL program API.
 */
export function program(interpretable: InterpretableV2, options: EvalProgramOptions = {}): Program {
  return new EvalProgram(interpretable, options);
}
