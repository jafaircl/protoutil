import type { AST } from "../common/ast/index.js";
import { type Container, defaultContainer } from "../common/containers.js";
import { type Adapter, DefaultTypeAdapter, type Provider } from "../common/types/index.js";
import type { AttributeFactory } from "./attributes.js";
import { attributeFactory } from "./attributes.js";
import {
  adaptLegacyDecorator,
  disableShortcircuitsDecorator,
  type InterpretableDecorator,
  type InterpretableDecoratorV2,
  interruptFoldsDecorator,
  observeEvalDecorator,
  optimizeDecorator,
  regexOptimizerDecorator,
} from "./decorators.js";
import type { Dispatcher } from "./dispatcher.js";
import type { EvalState } from "./eval-state.js";
import { evalState } from "./eval-state.js";
import { ExecutionFrame } from "./frame.js";
import {
  adaptToV2,
  type Interpretable,
  type InterpretableV2,
  ObservableInterpretable,
  type StatefulObserver,
} from "./interpretable.js";
import type { RegexOptimization } from "./optimizations.js";
import { planAst } from "./planner.js";

/**
 * PlannerState stores the mutable planning metadata that planner configuration can modify.
 */
export interface PlannerState {
  /**
   * decorators lists the node decorators to apply after planning.
   */
  decorators: InterpretableDecoratorV2[];

  /**
   * observers lists the stateful observers attached to the final program.
   */
  observers: StatefulObserver[];
}

/**
 * PlannerConfig configures interpreter planning behavior.
 */
export interface PlannerConfig {
  /**
   * decorators lists the node decorators to apply after planning.
   */
  decorators?: InterpretableDecoratorV2[];

  /**
   * observers lists the stateful observers attached to the final program.
   */
  observers?: StatefulObserver[];
}

/**
 * EvalStateObserverOptions configures eval-state observer creation.
 */
export interface EvalStateObserverOptions {
  /**
   * factory creates a fresh EvalState for each evaluation.
   */
  factory?: () => EvalState;
}

/**
 * CustomDecoratorOptions configures a legacy interpretable decorator.
 */
export interface CustomDecoratorOptions {
  /**
   * decorator is the legacy decorator to adapt to V2.
   */
  decorator: InterpretableDecorator;
}

/**
 * CustomDecoratorV2Options configures a V2 interpretable decorator.
 */
export interface CustomDecoratorV2Options {
  /**
   * decorator is the V2 decorator to register.
   */
  decorator: InterpretableDecoratorV2;
}

/**
 * CompileRegexConstantsOptions configures constant regular expression compilation.
 */
export interface CompileRegexConstantsOptions {
  /**
   * optimizations lists the regular expression functions to compile.
   */
  optimizations: RegexOptimization[];
}

/**
 * InterpreterOptions configures interpreter construction.
 */
export interface InterpreterOptions {
  /**
   * dispatcher resolves function overloads during planning.
   */
  dispatcher: Dispatcher;

  /**
   * container resolves candidate variable names for unchecked expressions.
   */
  container?: Container;

  /**
   * provider resolves identifiers and types referenced by the AST.
   */
  provider?: Provider;

  /**
   * adapter adapts native values into CEL runtime values.
   */
  adapter?: Adapter;

  /**
   * attrFactory builds runtime attributes for identifier and select planning.
   */
  attrFactory?: AttributeFactory;
}

/**
 * InterpretableOptions configures interpretable planning.
 */
export interface InterpretableOptions {
  /**
   * exprAst is the checked or unchecked AST to plan.
   */
  exprAst: AST;

  /**
   * plannerConfig lists planner behaviors to apply before building the final program.
   */
  plannerConfig?: PlannerConfig;
}

/**
 * AdaptOptions configures legacy-to-V2 interpretable adaptation.
 */
export interface AdaptOptions {
  /**
   * interpretable is the legacy interpretable to adapt.
   */
  interpretable: Interpretable;
}

/**
 * Interpreter builds runtime interpretables from an AST.
 */
export interface Interpreter {
  /**
   * interpretable plans the AST into a V2 interpretable.
   */
  interpretable(options: InterpretableOptions): InterpretableV2;

  /**
   * adapt promotes a legacy interpretable to the V2 runtime interface.
   */
  adapt(options: AdaptOptions): InterpretableV2;
}

/**
 * EvalStateFactoryObserver produces EvalState values and records observed evaluation results into them.
 */
class EvalStateFactoryObserver implements StatefulObserver {
  /**
   * stateByActivationValue stores the eval-state instance associated with each observed activation or frame.
   */
  private readonly stateByActivationValue = new WeakMap<object, EvalState>();

  /**
   * constructor stores the EvalState factory.
   */
  constructor(private readonly factoryValue: () => EvalState) {}

  /**
   * initState creates a fresh EvalState for the evaluation.
   */
  public initState(activation: unknown): unknown {
    const state = this.factoryValue();
    if (typeof activation === "object" && activation !== null) {
      this.stateByActivationValue.set(activation, state);
    }
    return state;
  }

  /**
   * getState returns the EvalState stored on the frame.
   */
  public getState(frame: unknown): unknown {
    if (typeof frame === "object" && frame !== null) {
      return this.stateByActivationValue.get(observerRootActivation(frame)) ?? frame;
    }
    return frame;
  }

  /**
   * observe records the observed expression value into EvalState when available.
   */
  public observe(activation: unknown, exprId: number, __: unknown, value: unknown): void {
    const state =
      typeof activation === "object" && activation !== null
        ? this.stateByActivationValue.get(observerRootActivation(activation))
        : undefined;
    if (state) {
      state.setValue({ exprId, value: value as ReturnType<EvalState["value"]>[0] });
      return;
    }
    if (!isEvalState(activation)) {
      return;
    }
    activation.setValue({ exprId, value: value as ReturnType<EvalState["value"]>[0] });
  }
}

/**
 * ExpressionInterpreter is the default interpreter implementation.
 */
class ExpressionInterpreter implements Interpreter {
  /**
   * containerValue stores the interpreter container dependency.
   */
  private readonly containerValue: Container;

  /**
   * providerValue stores the interpreter provider dependency.
   */
  private readonly providerValue: Provider;

  /**
   * adapterValue stores the interpreter adapter dependency.
   */
  private readonly adapterValue: Adapter;

  /**
   * dispatcherValue stores the interpreter dispatcher dependency.
   */
  private readonly dispatcherValue: Dispatcher;

  /**
   * attrFactoryValue stores the interpreter attribute factory dependency.
   */
  private readonly attrFactoryValue: AttributeFactory;

  /**
   * constructor initializes the interpreter dependencies.
   */
  constructor(optionsValue: InterpreterOptions) {
    this.dispatcherValue = optionsValue.dispatcher;
    this.containerValue = optionsValue.container ?? defaultContainer;
    this.providerValue = optionsValue.provider ?? missingProvider();
    this.adapterValue = optionsValue.adapter ?? DefaultTypeAdapter;
    this.attrFactoryValue =
      optionsValue.attrFactory ??
      attributeFactory({
        containerValue: this.containerValue,
        adapter: this.adapterValue,
        provider: this.providerValue,
      });
  }

  /**
   * interpretable plans the AST into a V2 interpretable and applies planner decorators.
   */
  public interpretable(options: InterpretableOptions): InterpretableV2 {
    const planner = plannerState({
      planner: defaultPlannerState(),
      plannerConfig: options.plannerConfig,
    });
    const planned = planAst({
      exprAst: options.exprAst,
      planner: {
        dispatcher: this.dispatcherValue,
        provider: this.providerValue,
        adapter: this.adapterValue,
        attrFactory: this.attrFactoryValue,
        container: this.containerValue,
        decorators: planner.decorators,
        observers: planner.observers,
      },
    });
    if (planner.observers.length === 0) {
      return planned;
    }
    return new ObservableInterpretable({
      interpretable: planned,
      observers: planner.observers,
    });
  }

  /**
   * adapt promotes a legacy interpretable to the V2 runtime interface.
   */
  public adapt(options: AdaptOptions): InterpretableV2 {
    return adaptToV2(options.interpretable);
  }
}

/**
 * defaultPlannerState returns an empty planner state.
 */
export function defaultPlannerState(): PlannerState {
  return {
    decorators: [],
    observers: [],
  };
}

/**
 * evalStateObserverConfig returns planner configuration for eval-state observation.
 */
export function evalStateObserverConfig(options: EvalStateObserverOptions = {}): PlannerConfig {
  const observer = new EvalStateFactoryObserver(options.factory ?? evalState);
  return {
    observers: [observer],
    decorators: [observeEvalDecorator(observer.observe.bind(observer))],
  };
}

/**
 * exhaustiveEvalConfig disables short-circuiting so every expression branch is evaluated.
 */
export function exhaustiveEvalConfig(): PlannerConfig {
  return {
    decorators: [disableShortcircuitsDecorator()],
  };
}

/**
 * interruptableEvalConfig enables interruption checks within comprehension folds.
 */
export function interruptableEvalConfig(): PlannerConfig {
  return {
    decorators: [interruptFoldsDecorator()],
  };
}

/**
 * optimizeConfig precomputes constant expressions and other common evaluation patterns.
 */
export function optimizeConfig(): PlannerConfig {
  return {
    decorators: [optimizeDecorator()],
  };
}

/**
 * compileRegexConstantsConfig compiles constant regular expression arguments during planning.
 */
export function compileRegexConstantsConfig(options: CompileRegexConstantsOptions): PlannerConfig {
  return {
    decorators: [regexOptimizerDecorator(options)],
  };
}

/**
 * customDecoratorConfig returns planner configuration for a legacy interpretable decorator.
 */
export function customDecoratorConfig(options: CustomDecoratorOptions): PlannerConfig {
  return {
    decorators: [adaptLegacyDecorator(options.decorator)],
  };
}

/**
 * customDecoratorV2Config returns planner configuration for a V2 interpretable decorator.
 */
export function customDecoratorV2Config(options: CustomDecoratorV2Options): PlannerConfig {
  return {
    decorators: [options.decorator],
  };
}

/**
 * interpreter builds an Interpreter from the provided dependencies.
 */
export function interpreter(options: InterpreterOptions): Interpreter {
  return new ExpressionInterpreter(options);
}

/**
 * plannerState merges planner configuration into a concrete planner state.
 */
function plannerState(options: {
  planner: PlannerState;
  plannerConfig?: PlannerConfig;
}): PlannerState {
  return {
    decorators: [...options.planner.decorators, ...(options.plannerConfig?.decorators ?? [])],
    observers: [...options.planner.observers, ...(options.plannerConfig?.observers ?? [])],
  };
}

/**
 * missingProvider returns a placeholder provider that reports configuration gaps eagerly.
 */
function missingProvider(): Provider {
  return {
    findIdent: () => [undefined, false],
    findStructType: () => [undefined, false],
    findStructFieldNames: () => [],
    findStructFieldType: () => [undefined, false],
    enumValue: () => {
      throw new Error("provider not configured");
    },
    newValue: () => {
      throw new Error("provider not configured");
    },
  } as unknown as Provider;
}

/**
 * isEvalState returns whether the observed activation exposes EvalState mutation.
 */
function isEvalState(value: unknown): value is EvalState {
  return (
    typeof value === "object" &&
    value !== null &&
    "setValue" in value &&
    typeof (value as { setValue?: unknown }).setValue === "function"
  );
}

/**
 * observerRootActivation finds the root execution frame used to initialize observer state.
 */
function observerRootActivation(value: object): object {
  if (!(value instanceof ExecutionFrame)) {
    return value;
  }
  let root = value;
  while (root.parentFrame() !== undefined) {
    root = root.parentFrame()!;
  }
  return root;
}
