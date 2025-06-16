/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AST } from '../common/ast.js';
import { Container } from '../common/container.js';
import { Adapter, Provider } from '../common/ref/provider.js';
import { RefVal } from '../common/ref/reference.js';
import { isFunction, isNil } from '../common/utils.js';
import { Activation, asPartialActivation } from './activation.js';
import { AttributeFactory } from './attributes.js';
import { decDisableShortcuts, decObserveEval, InterpretableDecorator } from './decorators.js';
import { Dispatcher } from './dispatcher.js';
import { EvalState } from './evalstate.js';
import { Interpretable } from './interpretable.js';
import { Planner } from './planner.js';

/**
 * PlannerOption configures the program plan options during interpretable setup.
 */
export type PlannerOption = (p: Planner) => Planner;

/**
 * Interpreter generates a new Interpretable from a checked or unchecked
 * expression.
 */
export interface Interpreter {
  /**
   * NewInterpretable creates an Interpretable from a checked expression and an  optional list of InterpretableDecorator values.
   */
  newInterpretable(exprAST: AST, ...opts: PlannerOption[]): Interpretable | Error;
}

/**
 * EvalObserver is a functional interface that accepts an expression id and an
 * observed value. The id identifies the expression that was evaluated, the
 * programStep is the Interpretable or Qualifier that was evaluated and value
 * is the result of the evaluation.
 */
export type EvalObserver = (vars: Activation, id: bigint, programStep: any, value: RefVal) => void;

/**
 * StatefulObserver observes evaluation while tracking or utilizing stateful behavior.
 */
export interface StatefulObserver {
  /**
   * InitState configures stateful metadata on the activation.
   */
  initState(a: Activation): Activation;

  /**
   *  GetState retrieves the stateful metadata from the activation.
   */
  getState(a: Activation): any;

  /**
   * Observe passes the activation and relevant evaluation metadata to the observer.
   * The observe method is expected to do the equivalent of GetState(vars) in order
   * to find the metadata that needs to be updated upon invocation
   */
  observe(vars: Activation, id: bigint, programStep: any, value: RefVal): void;
}

/**
 * CancellationCause enumerates the ways a program evaluation operation can be cancelled.
 */
export enum CancellationCause {
  /**
   * CostLimitExceeded indicates that the operation was cancelled in response to the actual cost limit being
   * exceeded.
   */
  CostLimitExceeded = 1,
}

/**
 * EvalCancelledError represents a cancelled program evaluation operation.
 */
export class EvalCancelledError extends Error {
  constructor(message: string, public override readonly cause: CancellationCause) {
    super(message);
  }

  error() {
    return this.message;
  }
}

/**
 * evalStateOption configures the evalStateFactory behavior.
 */
type evalStateOption = (fac: _evalStateFactory) => _evalStateFactory;

/**
 * EvalStateFactory configures the EvalState generator to be used by the EvalStateObserver.
 */
export function evalStateFactory(factory: () => EvalState): evalStateOption {
  return (fac) => {
    fac.factory = factory;
    return fac;
  };
}

/**
 * EvalStateObserver provides an observer which records the value associated with the given expression id.
 * EvalState must be provided to the observer.
 */
export function evalStateObserver(...opts: evalStateOption[]): PlannerOption {
  let et = new _evalStateFactory(() => new EvalState());
  for (const o of opts) {
    et = o(et);
  }
  return (p) => {
    if (isNil(et.factory)) {
      throw new Error('eval state factory not configured');
    }
    p.observers.push(et);
    p.decorators.push(decObserveEval(et.observe.bind(et)));
    return p;
  };
}

/**
 * evalStateConverter identifies an object which is convertible to an EvalState instance.
 */
interface evalStateConverter {
  asEvalState(): EvalState;
}

/**
 * evalStateActivation hides state in the Activation in a manner not accessible to expressions.
 */
class evalStateActivation implements Activation, evalStateConverter {
  constructor(public vars: Activation, public state: EvalState) {}

  resolveName<T = any>(name: string): T | null {
    return this.vars.resolveName(name);
  }

  parent(): Activation | null {
    return this.vars;
  }

  asPartialActivation() {
    return asPartialActivation(this.vars);
  }

  asEvalState(): EvalState {
    return this.state;
  }
}

function asEvalState(a: Activation): EvalState | null {
  if (a && isFunction((a as unknown as evalStateConverter)['asEvalState'])) {
    return (a as unknown as evalStateConverter).asEvalState();
  }
  if (!isNil(a.parent())) {
    return asEvalState(a.parent()!);
  }
  return null;
}

/**
 * _evalStateFactory holds a reference to a factory function that produces an EvalState instance.
 */
class _evalStateFactory implements StatefulObserver {
  constructor(public factory: () => EvalState) {}

  initState(a: Activation): Activation {
    const state = this.factory();
    return new evalStateActivation(a, state);
  }

  getState(a: Activation) {
    return asEvalState(a);
  }

  observe(vars: Activation, id: bigint, programStep: any, value: RefVal): void {
    const state = asEvalState(vars);
    if (isNil(state)) {
      return;
    }
    state.setValue(id, value);
  }
}

/**
 * CustomDecorator configures a custom interpretable decorator for the program.
 */
export function customDecorator(dec: InterpretableDecorator): PlannerOption {
  return (p) => {
    p.decorators.push(dec);
    return p;
  };
}

/**
 * ExhaustiveEval replaces operations that short-circuit with versions that evaluate
 * expressions and couples this behavior with the TrackState() decorator to provide
 * insight into the evaluation state of the entire expression. EvalState must be
 * provided to the decorator. This decorator is not thread-safe, and the EvalState
 * must be reset between Eval() calls.
 */
export function exhaustiveEval() {
  return customDecorator(decDisableShortcuts());
}

// TODO: observers and regex optimization

/**
 * NewInterpreter builds an Interpreter from a Dispatcher and TypeProvider
 * which will be used throughout the Eval of all Interpretable instances
 * generated from it.
 */
export class ExprInterpreter implements Interpreter {
  #dispatcher: Dispatcher;
  #container: Container;
  #provider: Provider;
  #adapter: Adapter;
  #attrFactory: AttributeFactory;

  constructor(
    dispatcher: Dispatcher,
    container: Container,
    provider: Provider,
    adapter: Adapter,
    attrFactory: AttributeFactory
  ) {
    this.#dispatcher = dispatcher;
    this.#container = container;
    this.#provider = provider;
    this.#adapter = adapter;
    this.#attrFactory = attrFactory;
  }

  newInterpretable(checked: AST, ...opts: PlannerOption[]): Interpretable | Error {
    let p = new Planner(
      this.#dispatcher,
      this.#provider,
      this.#adapter,
      this.#attrFactory,
      this.#container,
      checked
    );
    for (const o of opts) {
      p = o(p);
    }
    return p.plan(checked.expr());
  }
}
