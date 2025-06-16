/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AST } from '../common/ast.js';
import { RefVal } from '../common/ref/reference.js';
import { isErrorRefVal } from '../common/types/error.js';
import { isNil } from '../common/utils.js';
import {
  EmptyActivation as InterpreterEmptyActivation,
  newActivation as interpreterNewActivation,
  PartActivation as InterpreterPartialActivation,
  isActivation,
} from '../interpreter/activation.js';
import { AttributePattern, PartialAttributeFactory } from '../interpreter/attribute-patterns.js';
import {
  AttrFactory,
  AttrFactoryOption,
  AttributeFactory,
  enableErrorOnBadPresenceTest,
} from '../interpreter/attributes.js';
import { DefaultDispatcher, Dispatcher } from '../interpreter/dispatcher.js';
import { EvalState } from '../interpreter/evalstate.js';
import { Interpretable, ObservableInterpretable } from '../interpreter/interpretable.js';
import {
  ActualCostEstimator,
  costObserver,
  CostTracker,
  costTrackerFactory,
  costTrackerLimit,
  CostTrackerOption,
} from '../interpreter/runtimecost.js';
import {
  HierarchicalActivation,
  Activation as InterpreterActivation,
} from './../interpreter/activation.js';
import {
  evalStateObserver,
  exhaustiveEval,
  ExprInterpreter,
  Interpreter,
  PlannerOption,
} from './../interpreter/interpreter.js';
import { Env } from './env.js';
import { Feature } from './library.js';
import { EvalOption, ProgramOption } from './options.js';

/**
 * Program is an evaluable view of an Ast.
 */
export interface Program {
  /**
   * Eval returns the result of an evaluation of the Ast and environment
   * against the input vars.
   *
   * The vars value may either be an `interpreter.Activation` or a
   * `map[string]any`.
   *
   * If the `OptTrackState`, `OptTrackCost` or `OptExhaustiveEval` flags are used, the `details` response will be non-nil. Given this caveat on `details`, the return state from evaluation will be:
   *
   * *  `val`, `details`, `nil` - Successful evaluation of a non-error result.
   * *  `val`, `details`, `err` - Successful evaluation to an error result.
   * *  `nil`, `details`, `err` - Unsuccessful evaluation.
   *
   * An unsuccessful evaluation is typically the result of a series of
   * incompatible `EnvOption` or `ProgramOption` values used in the creation
   * of the evaluation environment or executable program.
   */
  eval(
    input: Activation | Record<string, any> | Map<string, any>
  ): [RefVal | null, EvalDetails | null, Error | null];
}

/**
 * Activation used to resolve identifiers by name and references by id.
 *
 * An Activation is the primary mechanism by which a caller supplies input into a CEL program.
 */
export type Activation = InterpreterActivation;

/**
 * NewActivation returns an activation based on a map-based binding where the map keys are
 * expected to be qualified names used with ResolveName calls.
 *
 * The input `bindings` may either be of type `Activation` or `map[string]any`.
 * Lazy bindings may be supplied within the map-based input in either of the following forms:
 * - func() any
 * - func() ref.Val
 * The output of the lazy binding will overwrite the variable reference in the internal map.
 *
 * Values which are not represented as ref.Val types on input may be adapted to a ref.Val using
 * the types.Adapter configured in the environment.
 */
export function newActivation(bindings: Map<string, any> | Record<string, any>): Activation {
  return interpreterNewActivation(bindings);
}

/**
 * PartialActivation extends the Activation interface with a set of unknown AttributePatterns.
 */
export type PartialActivation = InterpreterPartialActivation;

/**
 * NoVars returns an empty Activation.
 */
export function noVars(): Activation {
  return new InterpreterEmptyActivation();
}

/**
 * PartialVars returns a PartialActivation which contains variables and a set of AttributePattern
 * values that indicate variables or parts of variables whose value are not yet known.
 *
 * This method relies on manually configured sets of missing attribute patterns. For a method which
 * infers the missing variables from the input and the configured environment, use Env.PartialVars().
 *
 * The `vars` value may either be an Activation or any valid input to the NewActivation call.
 */
export function partialVars(
  vars: Map<string, any> | Record<string, any>,
  ...unknowns: AttributePatternType[]
): PartialActivation {
  return new InterpreterPartialActivation(newActivation(vars), unknowns);
}

// AttributePattern returns an AttributePattern that matches a top-level variable. The pattern is
// mutable, and its methods support the specification of one or more qualifier patterns.
//
// For example, the AttributePattern(`a`).QualString(`b`) represents a variable access `a` with a
// string field or index qualification `b`. This pattern will match Attributes `a`, and `a.b`,
// but not `a.c`.
//
// When using a CEL expression within a container, e.g. a package or namespace, the variable name
// in the pattern must match the qualified name produced during the variable namespace resolution.
// For example, when variable `a` is declared within an expression whose container is `ns.app`, the
// fully qualified variable name may be `ns.app.a`, `ns.a`, or `a` per the CEL namespace resolution
// rules. Pick the fully qualified variable name that makes sense within the container as the
// AttributePattern `varName` argument.
export function attributePattern(varName: string): AttributePatternType {
  return new AttributePattern(varName);
}

// AttributePatternType represents a top-level variable with an optional set of qualifier patterns.
//
// See the interpreter.AttributePattern and interpreter.AttributeQualifierPattern for more info
// about how to create and manipulate AttributePattern values.
export type AttributePatternType = AttributePattern;

/**
 * prog is the internal implementation of the Program interface.
 */
export class prog implements Program {
  env: Env;
  evalOpts: EvalOption[];
  defaultVars: Activation;
  dispatcher: Dispatcher;
  interpreter: Interpreter | null;
  interruptCheckFrequency: number;

  // Intermediate state used to configure the InterpretableDecorator set provided
  // to the initInterpretable call.
  plannerOptions: PlannerOption[];
  // TODO: regex optimizations
  // regexOptimizations []*interpreter.RegexOptimization

  // Interpretable configured from an Ast and aggregate decorator set based on program options.
  interpretable: Interpretable | null;
  observable: ObservableInterpretable | null;
  callCostEstimator: ActualCostEstimator | null;
  costOptions: CostTrackerOption[];
  costLimit: bigint | null;

  constructor(
    env: Env,
    evalOpts: EvalOption[],
    defaultVars: Activation,
    dispatcher: Dispatcher,
    interpreter?: Interpreter | null,
    interruptCheckFrequency?: number | null,
    plannerOptions?: PlannerOption[] | null,
    // regexOptimizations: []*interpreter.RegexOptimization,
    interpretable?: Interpretable | null,
    observable?: ObservableInterpretable | null,
    callCostEstimator?: ActualCostEstimator | null,
    costOptions?: CostTrackerOption[] | null,
    costLimit?: bigint | null
  ) {
    this.env = env;
    this.evalOpts = evalOpts || [];
    this.defaultVars = defaultVars || new InterpreterEmptyActivation();
    this.dispatcher = dispatcher;
    this.interpreter = interpreter || null;
    this.interruptCheckFrequency = interruptCheckFrequency || 0;
    this.plannerOptions = plannerOptions || [];
    // this.regexOptimizations = regexOptimizations;
    this.interpretable = interpretable || null;
    this.observable = observable || null;
    this.callCostEstimator = callCostEstimator || null;
    this.costOptions = costOptions || [];
    this.costLimit = costLimit ?? null;
  }

  initInterpretable(a: AST, plannerOptions: PlannerOption[]): prog | Error {
    // When the AST has been exprAST it contains metadata that can be used to
    // speed up program execution.
    const interpretable = this.interpreter?.newInterpretable(a, ...plannerOptions);
    if (isNil(interpretable)) {
      return new Error('failed to create interpretable');
    }
    if (interpretable instanceof Error) {
      return interpretable;
    }
    this.interpretable = interpretable;
    if (interpretable instanceof ObservableInterpretable) {
      this.observable = interpretable;
    }
    return this;
  }

  eval(
    input: Activation | Record<string, any> | Map<string, any>
  ): [RefVal | null, EvalDetails | null, Error | null] {
    if (isNil(this.interpretable)) {
      return [null, null, new Error('program not initialized')];
    }
    // Build a hierarchical activation if there are default vars set.
    let vars: Activation;
    if (isActivation(input)) {
      vars = input;
    } else {
      vars = newActivation(input);
    }
    if (!isNil(this.defaultVars)) {
      vars = new HierarchicalActivation(this.defaultVars, vars);
    }
    let out: RefVal;
    let det: EvalDetails | null = null;
    if (!isNil(this.observable)) {
      det = new EvalDetails();
      out = this.observable.observeEval(vars, (observed) => {
        if (observed instanceof EvalState) {
          (det as EvalDetails).state = observed;
        } else if (observed instanceof CostTracker) {
          (det as EvalDetails).costTracker = observed;
        }
      });
    } else {
      out = this.interpretable.eval(vars);
    }
    // The output of an internal Eval may have a value (`v`) that is a types.Err. This step translates the CEL value to a JS error response. This interface does not quite match the RPC signature which allows for multiple errors to be returned, but should be sufficient
    if (isErrorRefVal(out)) {
      return [null, det, out.value()];
    }
    return [out, det, null];
  }
}

/**
 * newProgram creates a program instance with an environment, an ast, and an
 * optional list of ProgramOption values.
 *
 * If the program cannot be configured the prog will be nil, with a non-nil
 * error response.
 */
export function newProgram(e: Env, a: AST, opts: ProgramOption[]): Program | Error {
  // Build the dispatcher, interpreter, and default program value.
  const disp = new DefaultDispatcher();

  // Ensure the default attribute factory is set after the adapter and provider
  // are configured.
  const p = new prog(e, [], new InterpreterEmptyActivation(), disp);

  // Configure the program via the ProgramOption values.
  for (const opt of opts) {
    const maybeErr = opt(p);
    if (maybeErr instanceof Error) {
      return maybeErr;
    }
  }

  // Add the function bindings created via Function() options.
  for (const fn of e.functions.values()) {
    const bindings = fn.bindings();
    const err = disp.add(...bindings);
    if (err instanceof Error) {
      return err;
    }
  }

  // Set the attribute factory after the options have been set.
  let attrFactory: AttributeFactory;
  const attrFactorOpts: AttrFactoryOption[] = [
    enableErrorOnBadPresenceTest(p.env.hasFeature(Feature.EnableErrorOnBadPresenceTest)),
  ];
  if (p.evalOpts.includes(EvalOption.PartialEval)) {
    attrFactory = new PartialAttributeFactory(
      e.container,
      e.adapter,
      e.provider,
      ...attrFactorOpts
    );
  } else {
    attrFactory = new AttrFactory(e.container, e.adapter, e.provider, ...attrFactorOpts);
  }
  const interp = new ExprInterpreter(disp, e.container, e.provider, e.adapter, attrFactory);
  p.interpreter = interp;

  // Translate the EvalOption flags into InterpretableDecorator instances.
  const plannerOptions: PlannerOption[] = [...p.plannerOptions];

  // TODO: observers and regex optimization
  //   // Enable interrupt checking if there's a non-zero check frequency
  // 	if p.interruptCheckFrequency > 0 {
  // 		decorators = append(decorators, interpreter.InterruptableEval())
  // 	}
  // 	// Enable constant folding first.
  // 	if p.evalOpts&OptOptimize == OptOptimize {
  // 		decorators = append(decorators, interpreter.Optimize())
  // 		p.regexOptimizations = append(p.regexOptimizations, interpreter.MatchesRegexOptimization)
  // 	}
  // 	// Enable regex compilation of constants immediately after folding constants.
  // 	if len(p.regexOptimizations) > 0 {
  // 		decorators = append(decorators, interpreter.CompileRegexConstants(p.regexOptimizations...))
  // 	}

  // Enable exhaustive eval, state tracking and cost tracking last since they
  // require a factory.
  if (
    p.evalOpts.includes(EvalOption.ExhaustiveEval) ||
    p.evalOpts.includes(EvalOption.TrackState) ||
    p.evalOpts.includes(EvalOption.TrackCost)
  ) {
    let costOptCount = p.costOptions.length;
    if (!isNil(p.costLimit)) {
      costOptCount++;
    }
    const costOpts: CostTrackerOption[] = [...p.costOptions];
    if (!isNil(p.costLimit)) {
      costOpts.push(costTrackerLimit(p.costLimit));
    }
    const trackerFactory = () => new CostTracker(p.callCostEstimator, ...costOpts);
    const observers: PlannerOption[] = [];
    if (
      p.evalOpts.includes(EvalOption.ExhaustiveEval) ||
      p.evalOpts.includes(EvalOption.TrackState)
    ) {
      // EvalStateObserver is required for OptExhaustiveEval.
      observers.push(evalStateObserver());
    }
    if (p.evalOpts.includes(EvalOption.TrackCost)) {
      observers.push(costObserver(costTrackerFactory(trackerFactory)));
    }
    // Enable exhaustive eval over a basic observer since it offers a superset of features.
    if (p.evalOpts.includes(EvalOption.ExhaustiveEval)) {
      plannerOptions.push(exhaustiveEval());
    }
    for (const obs of observers) {
      plannerOptions.push(obs);
    }
  }
  return p.initInterpretable(a, plannerOptions);
}

/**
 * EvalDetails holds additional information observed during the Eval() call.
 */
export class EvalDetails {
  constructor(
    /**
     * State of the evaluation, non-nil if the OptTrackState or OptExhaustiveEval
     * is specified within EvalOptions.
     */
    public state?: EvalState,
    public costTracker?: CostTracker
  ) {
    if (isNil(state)) {
      this.state = new EvalState();
    }
  }

  /**
   * ActualCost returns the tracked cost through the course of execution when
   * `CostTracking` is enabled. Otherwise, returns nil if the cost was not
   * enabled.
   */
  actualCost() {
    return this.costTracker?.actualCost();
  }
}
