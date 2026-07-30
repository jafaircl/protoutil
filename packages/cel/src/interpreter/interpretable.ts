import { type AST, type ConstantValue, constantToVal, ExprKind } from "../common/ast/index.js";
import type { BinaryOp, FunctionOp, UnaryOp } from "../common/functions.js";
import * as operators from "../common/operators.js";
import {
  type Adapter,
  Bool,
  String as CelString,
  DefaultTypeAdapter,
  Double,
  Err,
  False,
  type Foldable,
  FoldableType,
  Int,
  IterableType,
  isError,
  isUnknown,
  isUnknownOrError,
  ListType,
  labelErrNode,
  MapType,
  maybeMergeUnknowns,
  maybeNoSuchOverloadErr,
  NullValue,
  Optional,
  OptionalNone,
  optionalOf,
  type Provider,
  type Receiver,
  ReceiverType,
  type RefType,
  True,
  Uint,
  Unknown,
  type Val,
  wrapErr,
} from "../common/types/index.js";
import { refValList } from "../common/types/list.js";
import { refValMap } from "../common/types/map.js";
import type { Constant } from "../gen/cel/expr/syntax_pb.js";
import type { Activation, ActivationWrapper } from "./activation.js";
import type { Attribute, ConstantQualifier, Qualifier } from "./attributes.js";
import { ExecutionFrame, executionFrame } from "./frame.js";

/**
 * Interpretable evaluates an Activation and produces a value.
 */
export interface Interpretable {
  /**
   * id returns the expression id associated with the node.
   */
  id(): number;

  /**
   * eval evaluates the current node against an activation.
   */
  eval(activation: Activation): Val;
}

/**
 * InterpretableV2 evaluates an ExecutionFrame and produces a value.
 */
export interface InterpretableV2 extends Interpretable {
  /**
   * exec evaluates the current node within the given execution frame.
   */
  exec(frame: ExecutionFrame): Val;
}

/**
 * InterpretableConst tracks whether the interpretable is a constant value.
 */
export interface InterpretableConst extends InterpretableV2 {
  /**
   * value returns the constant value of the instruction.
   */
  value(): Val;
}

/**
 * InterpretableAttribute tracks whether the interpretable is an attribute.
 */
export interface InterpretableAttribute extends InterpretableV2 {
  /**
   * attr returns the Attribute value.
   */
  attr(): Attribute;

  /**
   * adapter returns the type adapter used to adapt resolved attribute values.
   */
  adapter(): Adapter;

  /**
   * addQualifier appends a qualifier to the attribute path.
   */
  addQualifier(qualifier: Qualifier): Attribute;

  /**
   * qualify performs field or index qualification on the target object.
   */
  qualify(vars: Activation, obj: unknown): unknown;

  /**
   * qualifyIfPresent qualifies the object only when the field or index is present.
   */
  qualifyIfPresent(vars: Activation, obj: unknown, presenceOnly: boolean): [unknown, boolean];

  /**
   * isOptional reports whether the resulting value is optional.
   */
  isOptional(): boolean;

  /**
   * resolve resolves the full attribute value in the activation.
   */
  resolve(vars: Activation): unknown;
}

/**
 * InterpretableConstructor tracks constructor instructions such as list initialization.
 */
export interface InterpretableConstructor extends InterpretableV2 {
  /**
   * initVals returns the constructor input values.
   */
  initVals(): InterpretableV2[];

  /**
   * type returns the type constructed by the instruction.
   */
  type(): RefType;
}

/**
 * InterpretableCall tracks function-call nodes and exposes their normalized call metadata.
 */
export interface InterpretableCall extends InterpretableV2 {
  /**
   * functionName returns the CEL function name for the call.
   */
  functionName(): string;

  /**
   * overloadId returns the overload id selected for the call, when known.
   */
  overloadId(): string;

  /**
   * args returns the normalized argument list for the call.
   */
  args(): InterpretableV2[];
}

/**
 * EvalObserver observes a node evaluation result.
 */
export type EvalObserver = (vars: Activation, id: number, programStep: unknown, value: Val) => void;

/**
 * StatefulObserver observes evaluation while maintaining per-evaluation state.
 */
export interface StatefulObserver {
  /**
   * initState configures stateful metadata on the execution frame.
   */
  initState(frame: ExecutionFrame): unknown;

  /**
   * getState returns the stateful metadata stored on the execution frame.
   */
  getState(frame: ExecutionFrame): unknown;

  /**
   * observe updates the observer state with the evaluation event.
   */
  observe(activation: Activation, id: number, programStep: unknown, value: Val): void;
}

/**
 * ObservableInterpretableOptions configures an ObservableInterpretable.
 */
export interface ObservableInterpretableOptions {
  /**
   * interpretable is the wrapped interpretable to observe.
   */
  interpretable: InterpretableV2;

  /**
   * observers lists the stateful observers attached to each evaluation.
   */
  observers: StatefulObserver[];
}

/**
 * ConstValueOptions configures constant interpretable construction.
 */
export interface ConstValueOptions {
  /**
   * id is the expression id associated with the constant node.
   */
  id: number;

  /**
   * value is the CEL value returned by the node.
   */
  value: Val;
}

/**
 * ListInterpretableOptions configures a list constructor interpretable.
 */
export interface ListInterpretableOptions {
  /**
   * id is the expression id associated with the list node.
   */
  id: number;

  /**
   * elements lists the child interpretable nodes for the list elements.
   */
  elements: InterpretableV2[];

  /**
   * optionalIndices marks which list element positions are optional.
   */
  optionalIndices?: number[];
}

/**
 * WatchConstructorOptions configures constructor observation.
 */
export interface WatchConstructorOptions {
  /**
   * constructor is the wrapped constructor interpretable.
   */
  constructor: InterpretableConstructor;

  /**
   * observer is invoked with the constructor evaluation result.
   */
  observer: EvalObserver;
}

/**
 * TestOnlyInterpretableOptions configures a presence-test interpretable wrapper.
 */
export interface TestOnlyInterpretableOptions {
  /**
   * id is the expression id associated with the presence-test select.
   */
  id: number;

  /**
   * attr is the attribute being evaluated in test-only mode.
   */
  attr: InterpretableAttribute;
}

/**
 * AsFrameOptions configures execution-frame promotion for an activation.
 */
export interface AsFrameOptions {
  /**
   * activation is the activation to promote to an execution frame.
   */
  activation: Activation;
}

/**
 * InterruptError is used to signal that program evaluation should stop and check interruption state.
 */
export class InterruptError extends Error {
  /**
   * constructor initializes the interrupt error message.
   */
  constructor() {
    super("operation interrupted");
  }

  /**
   * is reports whether the target error is also an InterruptError.
   */
  public is(target: unknown): boolean {
    return target instanceof InterruptError;
  }
}

/**
 * LegacyV2Adapter bridges a V1 Interpretable to the V2 interface.
 */
class LegacyV2Adapter implements InterpretableV2 {
  /**
   * constructor stores the wrapped legacy interpretable.
   */
  constructor(private readonly interpretableValue: Interpretable) {}

  /**
   * id returns the wrapped expression id.
   */
  public id(): number {
    return this.interpretableValue.id();
  }

  /**
   * eval delegates to the wrapped legacy interpretable.
   */
  public eval(activation: Activation): Val {
    return this.interpretableValue.eval(activation);
  }

  /**
   * exec evaluates through the legacy activation-based interface.
   */
  public exec(frame: ExecutionFrame): Val {
    return this.interpretableValue.eval(frame);
  }
}

/**
 * ConstValueInterpretable is the default constant-valued interpretable implementation.
 */
class ConstValueInterpretable implements InterpretableConst {
  /**
   * constructor initializes the constant node id and value.
   */
  constructor(
    private readonly idValue: number,
    private readonly valueValue: Val,
  ) {}

  /**
   * id returns the expression id associated with the node.
   */
  public id(): number {
    return this.idValue;
  }

  /**
   * exec returns the constant value without consulting frame state.
   */
  public exec(_: ExecutionFrame): Val {
    return this.valueValue;
  }

  /**
   * eval returns the constant value without consulting activation state.
   */
  public eval(_: Activation): Val {
    return this.valueValue;
  }

  /**
   * value returns the constant CEL value stored on the node.
   */
  public value(): Val {
    return this.valueValue;
  }
}

/**
 * ListInterpretableValue constructs a runtime list from its element instructions.
 */
class ListInterpretableValue implements InterpretableConstructor {
  /**
   * constructor initializes the list node id and elements.
   */
  constructor(
    private readonly idValue: number,
    private readonly elementsValue: InterpretableV2[],
    private readonly optionalIndicesValue: Set<number>,
  ) {}

  /**
   * id returns the expression id associated with the list node.
   */
  public id(): number {
    return this.idValue;
  }

  /**
   * exec evaluates the list elements and adapts them into a CEL list value.
   */
  public exec(frame: ExecutionFrame): Val {
    const out: Val[] = [];
    let mergedUnknown: Unknown | undefined;
    for (let index = 0; index < this.elementsValue.length; index += 1) {
      let value = this.elementsValue[index]!.exec(frame);
      if (isError(value)) {
        return value;
      }
      [mergedUnknown] = maybeMergeUnknowns(value, mergedUnknown);
      if (!this.optionalIndicesValue.has(index)) {
        out.push(value);
        continue;
      }
      if (!isUnknown(value)) {
        // Skip optional checks for unknown values as they are not fully resolved yet.
        if (!(value instanceof Optional)) {
          return new Err(
            `cannot initialize optional list element from non-optional value ${formatConstructorValue(value)}`,
          );
        }
        if (value === OptionalNone || !value.hasValue()) {
          continue;
        }
        value = value.getValue();
      }
      out.push(value);
    }
    if (mergedUnknown) {
      return mergedUnknown;
    }
    return refValList(DefaultTypeAdapter, out);
  }

  /**
   * eval delegates to exec after promoting the activation to a frame.
   */
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }

  /**
   * initVals returns the list element instructions.
   */
  public initVals(): InterpretableV2[] {
    return this.elementsValue;
  }

  /**
   * type returns the CEL runtime list type.
   */
  public type(): RefType {
    return ListType;
  }
}

/**
 * WatchConstructorInterpretable observes constructor evaluation.
 */
class WatchConstructorInterpretable implements InterpretableConstructor {
  /**
   * constructor initializes the wrapped constructor and observer.
   */
  constructor(
    private readonly constructorValue: InterpretableConstructor,
    private readonly observerValue: EvalObserver,
  ) {}

  /**
   * id returns the wrapped constructor expression id.
   */
  public id(): number {
    return this.constructorValue.id();
  }

  /**
   * exec evaluates the wrapped constructor and reports the result.
   */
  public exec(frame: ExecutionFrame): Val {
    const value = this.constructorValue.exec(frame);
    this.observerValue(frame, this.id(), this.constructorValue, value);
    return value;
  }

  /**
   * eval delegates to exec after promoting the activation to a frame.
   */
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }

  /**
   * initVals returns the wrapped constructor inputs.
   */
  public initVals(): InterpretableV2[] {
    return this.constructorValue.initVals();
  }

  /**
   * type returns the wrapped constructor result type.
   */
  public type(): RefType {
    return this.constructorValue.type();
  }
}

/**
 * ObservableInterpretable performs per-evaluation state tracking around an interpretable.
 */
export class ObservableInterpretable implements InterpretableV2 {
  /**
   * constructor initializes the wrapped interpretable and observers.
   */
  constructor(private readonly optionsValue: ObservableInterpretableOptions) {}

  /**
   * id returns the wrapped expression id.
   */
  public id(): number {
    return this.optionsValue.interpretable.id();
  }

  /**
   * exec evaluates the wrapped interpretable and reports observer state before and after execution.
   */
  public exec(frame: ExecutionFrame): Val {
    return this.observeExec({
      frame,
      observer: () => {},
    });
  }

  /**
   * eval delegates to exec after promoting the activation to a frame.
   */
  public eval(activation: Activation): Val {
    return this.observeExec({
      frame: asFrame({ activation }),
      observer: () => {},
    });
  }

  /**
   * observeEval evaluates an interpretable while exposing observer state updates.
   */
  public observeEval(options: { activation: Activation; observer: (state: unknown) => void }): Val {
    return this.observeExec({
      frame: asFrame({ activation: options.activation }),
      observer: options.observer,
    });
  }

  /**
   * observeExec evaluates an interpretable while exposing observer state updates.
   */
  public observeExec(options: { frame: ExecutionFrame; observer: (state: unknown) => void }): Val {
    for (const statefulObserver of this.optionsValue.observers) {
      const state = statefulObserver.initState(options.frame);
      options.observer(state);
    }
    const result = this.optionsValue.interpretable.exec(options.frame);
    for (const statefulObserver of this.optionsValue.observers) {
      options.observer(statefulObserver.getState(options.frame));
    }
    return result;
  }
}

/**
 * adaptToV2 adapts a V1 Interpretable implementation to the V2 interface.
 */
export function adaptToV2(interpretable: Interpretable): InterpretableV2 {
  if (isInterpretableV2(interpretable)) {
    return interpretable;
  }
  return new LegacyV2Adapter(interpretable);
}

/**
 * constValue creates a constant-valued interpretable.
 */
export function constValue(options: ConstValueOptions): InterpretableConst {
  return new ConstValueInterpretable(options.id, options.value);
}

/**
 * listInterpretable creates a list constructor interpretable.
 */
export function listInterpretable(options: ListInterpretableOptions): InterpretableConstructor {
  return new ListInterpretableValue(
    options.id,
    options.elements,
    new Set(options.optionalIndices ?? []),
  );
}

/**
 * watchConstructor wraps a constructor interpretable with observation behavior.
 */
export function watchConstructor(options: WatchConstructorOptions): InterpretableConstructor {
  return new WatchConstructorInterpretable(options.constructor, options.observer);
}

/**
 * asFrame promotes an Activation to an ExecutionFrame.
 */
export function asFrame(options: AsFrameOptions): ExecutionFrame {
  if (options.activation instanceof ExecutionFrame) {
    return options.activation;
  }
  const frame = executionFrame({ input: options.activation });
  const parentFrame = findFrame(options.activation);
  if (parentFrame !== undefined) {
    frame.inheritParentFrame({ parentFrame });
  }
  return frame;
}

/**
 * findFrame walks the activation hierarchy to locate an existing ExecutionFrame, if present.
 */
export function findFrame(activation: Activation): ExecutionFrame | undefined {
  if (isActivationWrapper(activation)) {
    const unwrapped = activation.unwrap();
    if (unwrapped instanceof ExecutionFrame) {
      return unwrapped;
    }
    return findFrame(unwrapped);
  }
  const parentValue = activation.parent();
  if (parentValue instanceof ExecutionFrame) {
    return parentValue;
  }
  if (parentValue !== undefined) {
    return findFrame(parentValue);
  }
  return undefined;
}

/**
 * planConstantAst converts a literal AST into an interpretable constant.
 */
export function planConstantAst(options: { exprAst: AST }): InterpretableConst {
  const root = options.exprAst.expr();
  if (root.kind() !== ExprKind.Literal) {
    throw new Error(`unsupported expr kind: ${root.kind()}`);
  }
  const literal = root.asLiteral();
  return constValue({
    id: root.id(),
    value: constantRuntimeValue({ adapter: DefaultTypeAdapter, literal }),
  });
}

/**
 * AttrInterpretableOptions configures attribute interpretable construction.
 */
export interface AttrInterpretableOptions {
  /**
   * attr is the runtime attribute to resolve.
   */
  attr: Attribute;

  /**
   * adapter converts resolved native values into CEL values.
   */
  adapter: Adapter;

  /**
   * optional indicates whether the resolved value should be wrapped as an optional.
   */
  optional?: boolean;
}

/**
 * CallInterpretableOptions configures a variable-arity call interpretable.
 */
export interface CallInterpretableOptions {
  /**
   * id is the expression id associated with the call.
   */
  id: number;

  /**
   * functionName is the CEL function name.
   */
  functionName: string;

  /**
   * overloadId is the resolved overload id, if any.
   */
  overloadId?: string;

  /**
   * args are the normalized call arguments.
   */
  args: InterpretableV2[];

  /**
   * impl is the runtime function implementation.
   */
  impl?: FunctionOp;

  /**
   * unary is the runtime unary implementation.
   */
  unary?: UnaryOp;

  /**
   * binary is the runtime binary implementation.
   */
  binary?: BinaryOp;

  /**
   * nonStrict indicates whether unknown and error arguments are permitted.
   */
  nonStrict?: boolean;

  /**
   * operandTrait is the runtime trait required on the first argument.
   */
  operandTrait?: number;
}

/**
 * ConditionalInterpretableOptions configures a value-level conditional interpretable.
 */
export interface ConditionalInterpretableOptions {
  /**
   * id is the expression id associated with the conditional node.
   */
  id: number;

  /**
   * condition evaluates the branch condition.
   */
  condition: InterpretableV2;

  /**
   * truthy evaluates the true branch.
   */
  truthy: InterpretableV2;

  /**
   * falsy evaluates the false branch.
   */
  falsy: InterpretableV2;
}

/**
 * MapInterpretableOptions configures a map constructor interpretable.
 */
export interface MapInterpretableOptions {
  /**
   * id is the expression id associated with the map node.
   */
  id: number;

  /**
   * keys are the map key instructions.
   */
  keys: InterpretableV2[];

  /**
   * values are the map value instructions.
   */
  values: InterpretableV2[];

  /**
   * optionalEntries marks which map entries are optional.
   */
  optionalEntries?: boolean[];
}

/**
 * ObjInterpretableOptions configures an object constructor interpretable.
 */
export interface ObjInterpretableOptions {
  /**
   * id is the expression id associated with the object node.
   */
  id: number;

  /**
   * typeName is the fully-qualified object type name.
   */
  typeName: string;

  /**
   * fields are the initialized field names.
   */
  fields: string[];

  /**
   * values are the field value instructions.
   */
  values: InterpretableV2[];

  /**
   * optionalFields marks which object fields are optional.
   */
  optionalFields?: boolean[];

  /**
   * provider constructs the final object value.
   */
  provider: Provider;
}

/**
 * FoldInterpretableOptions configures a comprehension fold interpretable.
 */
export interface FoldInterpretableOptions {
  /**
   * id is the expression id associated with the fold node.
   */
  id: number;

  /**
   * accuVar is the accumulator variable name.
   */
  accuVar: string;

  /**
   * iterVar is the first iteration variable name.
   */
  iterVar: string;

  /**
   * iterVar2 is the second iteration variable name, if present.
   */
  iterVar2?: string;

  /**
   * iterRange evaluates to the input collection.
   */
  iterRange: InterpretableV2;

  /**
   * accuInit evaluates to the initial accumulator value.
   */
  accuInit: InterpretableV2;

  /**
   * condition evaluates the loop condition.
   */
  condition: InterpretableV2;

  /**
   * step evaluates the next accumulator value.
   */
  step: InterpretableV2;

  /**
   * result evaluates the final fold result.
   */
  result: InterpretableV2;

  /**
   * exhaustive ensures every loop condition and step is evaluated.
   */
  exhaustive?: boolean;

  /**
   * interruptable checks the execution frame for cancellation after each loop step.
   */
  interruptable?: boolean;
}

/**
 * TestOnlyQualifier converts a constant qualifier into one that only reports field presence.
 */
class TestOnlyQualifier implements ConstantQualifier {
  /**
   * constructor initializes the wrapped constant qualifier.
   */
  constructor(private readonly qualifierValue: ConstantQualifier) {}

  /**
   * id returns the qualifier expression id.
   */
  public id(): number {
    return this.qualifierValue.id();
  }

  /**
   * isOptional preserves the wrapped qualifier optionality.
   */
  public isOptional(): boolean {
    return this.qualifierValue.isOptional();
  }

  /**
   * qualify reports whether the target field or key is present.
   */
  public qualify(vars: Activation, obj: unknown): unknown {
    const [value, present] = this.qualifierValue.qualifyIfPresent(vars, obj, true);
    if (value instanceof Unknown) {
      return value;
    }
    return present;
  }

  /**
   * qualifyIfPresent always performs a presence-only qualification.
   */
  public qualifyIfPresent(
    vars: Activation,
    obj: unknown,
    _presenceOnly: boolean,
  ): [unknown, boolean] {
    return this.qualifierValue.qualifyIfPresent(vars, obj, true);
  }

  /**
   * value returns the wrapped constant CEL value.
   */
  public value(): Val {
    return this.qualifierValue.value();
  }
}

/**
 * AttrInterpretable evaluates an attribute and adapts the resolved result into a CEL value.
 */
export class AttrInterpretable implements InterpretableAttribute {
  /**
   * constructor initializes the attribute interpretable state.
   */
  constructor(
    private attrValue: Attribute,
    private readonly adapterValue: Adapter,
    private optionalValue = false,
  ) {}

  /**
   * withOptional marks the attribute result as an optional value.
   */
  public withOptional(): AttrInterpretable {
    this.optionalValue = true;
    return this;
  }

  /**
   * id returns the expression id associated with the attribute.
   */
  public id(): number {
    return this.attrValue.id();
  }

  /**
   * exec resolves the attribute against the current frame.
   */
  public exec(frame: ExecutionFrame): Val {
    return this.eval(frame);
  }

  /**
   * eval resolves the attribute against the current activation.
   */
  public eval(activation: Activation): Val {
    try {
      const value = this.attrValue.resolve(activation);
      if (value instanceof Unknown) {
        return value;
      }
      if (this.optionalValue && value instanceof Optional) {
        return value;
      }
      // Attribute resolution frequently returns an already-adapted slot or comprehension value.
      // Preserve it directly instead of repeating the adapter's full native type dispatch.
      const adapted = isRuntimeVal(value) ? value : this.adapterValue.nativeToValue(value);
      return this.optionalValue ? optionalOf(adapted) : adapted;
    } catch (error) {
      return labelErrNode(this.id(), wrapErr(error));
    }
  }

  /**
   * attr returns the underlying runtime attribute.
   */
  public attr(): Attribute {
    return this.attrValue;
  }

  /**
   * adapter returns the attribute adapter.
   */
  public adapter(): Adapter {
    return this.adapterValue;
  }

  /**
   * addQualifier appends a qualifier to the underlying attribute.
   */
  public addQualifier(qualifier: Qualifier): Attribute {
    this.attrValue = this.attrValue.addQualifier(qualifier);
    return this.attrValue;
  }

  /**
   * qualify delegates to the underlying attribute.
   */
  public qualify(vars: Activation, obj: unknown): unknown {
    return this.attrValue.qualify(vars, obj);
  }

  /**
   * qualifyIfPresent delegates to the underlying attribute.
   */
  public qualifyIfPresent(
    vars: Activation,
    obj: unknown,
    presenceOnly: boolean,
  ): [unknown, boolean] {
    return this.attrValue.qualifyIfPresent(vars, obj, presenceOnly);
  }

  /**
   * isOptional reports whether the resolved result is optional.
   */
  public isOptional(): boolean {
    return this.optionalValue;
  }

  /**
   * resolve delegates to the underlying attribute.
   */
  public resolve(vars: Activation): unknown {
    return this.attrValue.resolve(vars);
  }
}

/**
 * TestOnlyInterpretable evaluates a select expression as a CEL presence test.
 */
class TestOnlyInterpretable implements InterpretableAttribute {
  /**
   * constructor initializes the wrapped attribute and its select expression id.
   */
  constructor(private readonly optionsValue: TestOnlyInterpretableOptions) {}

  /**
   * id returns the presence-test expression id.
   */
  public id(): number {
    return this.optionsValue.id;
  }

  /**
   * exec resolves the wrapped attribute and converts presence into a CEL value.
   */
  public exec(frame: ExecutionFrame): Val {
    return this.eval(frame);
  }

  /**
   * eval resolves the wrapped attribute and converts presence into a CEL value.
   */
  public eval(activation: Activation): Val {
    try {
      const value = this.optionsValue.attr.resolve(activation);
      if (value instanceof Optional) {
        return new Bool(value.hasValue());
      }
      return this.optionsValue.attr.adapter().nativeToValue(value);
    } catch (error) {
      return labelErrNode(this.id(), wrapErr(error));
    }
  }

  /**
   * attr returns the wrapped attribute.
   */
  public attr(): Attribute {
    return this.optionsValue.attr.attr();
  }

  /**
   * adapter returns the wrapped attribute adapter.
   */
  public adapter(): Adapter {
    return this.optionsValue.attr.adapter();
  }

  /**
   * addQualifier appends a qualifier that only performs presence tests.
   */
  public addQualifier(qualifier: Qualifier): Attribute {
    if (!("value" in qualifier) || typeof qualifier.value !== "function") {
      throw new Error(`test only expressions must have constant qualifiers: ${qualifier}`);
    }
    return this.optionsValue.attr.addQualifier(
      new TestOnlyQualifier(qualifier as ConstantQualifier),
    );
  }

  /**
   * qualify delegates to the wrapped attribute.
   */
  public qualify(vars: Activation, obj: unknown): unknown {
    return this.optionsValue.attr.qualify(vars, obj);
  }

  /**
   * qualifyIfPresent delegates to the wrapped attribute.
   */
  public qualifyIfPresent(
    vars: Activation,
    obj: unknown,
    presenceOnly: boolean,
  ): [unknown, boolean] {
    return this.optionsValue.attr.qualifyIfPresent(vars, obj, presenceOnly);
  }

  /**
   * isOptional mirrors the wrapped attribute optionality.
   */
  public isOptional(): boolean {
    return this.optionsValue.attr.isOptional();
  }

  /**
   * resolve delegates to the wrapped attribute.
   */
  public resolve(vars: Activation): unknown {
    return this.optionsValue.attr.resolve(vars);
  }
}

/**
 * ConditionalInterpretable evaluates a value-level CEL conditional expression.
 */
export class ConditionalInterpretable implements InterpretableV2 {
  /**
   * constructor initializes the conditional node state.
   */
  constructor(
    private readonly optionsValue: ConditionalInterpretableOptions,
    private readonly exhaustiveValue = false,
  ) {}

  /**
   * withExhaustiveEval returns a conditional which evaluates both result branches.
   */
  public withExhaustiveEval(): ConditionalInterpretable {
    return new ConditionalInterpretable(this.optionsValue, true);
  }

  /**
   * id returns the expression id associated with the conditional node.
   */
  public id(): number {
    return this.optionsValue.id;
  }

  /**
   * exec evaluates the condition and then only the selected branch.
   */
  public exec(frame: ExecutionFrame): Val {
    const condition = this.optionsValue.condition.exec(frame);
    if (this.exhaustiveValue) {
      // Exhaustive evaluation observes both branches before selecting the condition result.
      const truthy = this.optionsValue.truthy.exec(frame);
      const falsy = this.optionsValue.falsy.exec(frame);
      if (condition instanceof Bool) {
        return condition.value() ? truthy : falsy;
      }
      if (isUnknownOrError(condition)) {
        return condition;
      }
      return maybeNoSuchOverloadErr(condition);
    }
    if (condition instanceof Bool) {
      return condition.value()
        ? this.optionsValue.truthy.exec(frame)
        : this.optionsValue.falsy.exec(frame);
    }
    if (isUnknownOrError(condition)) {
      return condition;
    }
    return maybeNoSuchOverloadErr(condition);
  }

  /**
   * eval delegates to exec after promoting the activation to a frame.
   */
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }
}

/**
 * ZeroArityCallInterpretable evaluates a zero-argument runtime call.
 */
class ZeroArityCallInterpretable implements InterpretableCall {
  constructor(
    private readonly idValue: number,
    private readonly functionValue: string,
    private readonly overloadValue: string,
    private readonly implValue: FunctionOp,
  ) {}
  public id(): number {
    return this.idValue;
  }
  public exec(_: ExecutionFrame): Val {
    return labelErrNode(this.idValue, this.implValue());
  }
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }
  public functionName(): string {
    return this.functionValue;
  }
  public overloadId(): string {
    return this.overloadValue;
  }
  public args(): InterpretableV2[] {
    return [];
  }
}

/**
 * UnaryCallInterpretable evaluates a unary runtime call.
 */
class UnaryCallInterpretable implements InterpretableCall {
  constructor(
    private readonly idValue: number,
    private readonly functionValue: string,
    private readonly overloadValue: string,
    private readonly argValue: InterpretableV2,
    private readonly operandTraitValue = 0,
    private readonly implValue?: UnaryOp,
    private readonly nonStrictValue = false,
  ) {}
  public id(): number {
    return this.idValue;
  }
  public exec(frame: ExecutionFrame): Val {
    const arg = this.argValue.exec(frame);
    if (!this.nonStrictValue && isUnknownOrError(arg)) {
      return arg;
    }
    if (
      this.implValue &&
      (this.operandTraitValue === 0 ||
        (this.nonStrictValue && isUnknownOrError(arg)) ||
        (arg.type().hasTrait?.(this.operandTraitValue) ?? false))
    ) {
      return labelErrNode(this.idValue, this.implValue(arg));
    }
    if ((arg.type().hasTrait?.(ReceiverType) ?? false) && "receive" in (arg as object)) {
      return labelErrNode(
        this.idValue,
        (arg as unknown as Receiver).receive(this.functionValue, this.overloadValue, []),
      );
    }
    return labelErrNode(this.idValue, maybeNoSuchOverloadErr(arg));
  }
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }
  public functionName(): string {
    return this.functionValue;
  }
  public overloadId(): string {
    return this.overloadValue;
  }
  public args(): InterpretableV2[] {
    return [this.argValue];
  }
}

/**
 * BinaryCallInterpretable evaluates a binary runtime call.
 */
class BinaryCallInterpretable implements InterpretableCall {
  constructor(
    private readonly idValue: number,
    private readonly functionValue: string,
    private readonly overloadValue: string,
    private readonly lhsValue: InterpretableV2,
    private readonly rhsValue: InterpretableV2,
    private readonly operandTraitValue = 0,
    private readonly implValue?: BinaryOp,
    private readonly nonStrictValue = false,
  ) {}
  public id(): number {
    return this.idValue;
  }
  public exec(frame: ExecutionFrame): Val {
    const lhs = this.lhsValue.exec(frame);
    const strict = !this.nonStrictValue;
    if (strict && isError(lhs)) {
      return lhs;
    }
    const rhs = this.rhsValue.exec(frame);
    if (strict && isError(rhs)) {
      return rhs;
    }
    if (strict) {
      let mergedUnknown: Unknown | undefined;
      [mergedUnknown] = maybeMergeUnknowns(lhs, mergedUnknown);
      [mergedUnknown] = maybeMergeUnknowns(rhs, mergedUnknown);
      if (mergedUnknown) {
        return mergedUnknown;
      }
    }
    if (
      this.implValue &&
      (this.operandTraitValue === 0 ||
        (this.nonStrictValue && isUnknownOrError(lhs)) ||
        (lhs.type().hasTrait?.(this.operandTraitValue) ?? false))
    ) {
      return labelErrNode(this.idValue, this.implValue(lhs, rhs));
    }
    if ((lhs.type().hasTrait?.(ReceiverType) ?? false) && "receive" in (lhs as object)) {
      return labelErrNode(
        this.idValue,
        (lhs as unknown as Receiver).receive(this.functionValue, this.overloadValue, [rhs]),
      );
    }
    return labelErrNode(this.idValue, maybeNoSuchOverloadErr(lhs));
  }
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }
  public functionName(): string {
    return this.functionValue;
  }
  public overloadId(): string {
    return this.overloadValue;
  }
  public args(): InterpretableV2[] {
    return [this.lhsValue, this.rhsValue];
  }
}

/**
 * VarArgsCallInterpretable evaluates a variadic runtime call.
 */
class VarArgsCallInterpretable implements InterpretableCall {
  constructor(
    private readonly idValue: number,
    private readonly functionValue: string,
    private readonly overloadValue: string,
    private readonly argsValue: InterpretableV2[],
    private readonly operandTraitValue = 0,
    private readonly implValue?: FunctionOp,
    private readonly nonStrictValue = false,
  ) {}
  public id(): number {
    return this.idValue;
  }
  public exec(frame: ExecutionFrame): Val {
    const args: Val[] = [];
    const strict = !this.nonStrictValue;
    let mergedUnknown: Unknown | undefined;
    for (const arg of this.argsValue) {
      const value = arg.exec(frame);
      args.push(value);
      if (strict) {
        if (isError(value)) {
          return value;
        }
        [mergedUnknown] = maybeMergeUnknowns(value, mergedUnknown);
      }
    }
    if (strict && mergedUnknown) {
      return mergedUnknown;
    }
    const receiver = args[0];
    if (
      this.implValue &&
      (this.operandTraitValue === 0 ||
        (this.nonStrictValue && receiver !== undefined && isUnknownOrError(receiver)) ||
        (receiver?.type().hasTrait?.(this.operandTraitValue) ?? false))
    ) {
      return labelErrNode(this.idValue, this.implValue(...args));
    }
    if (
      receiver &&
      (receiver.type().hasTrait?.(ReceiverType) ?? false) &&
      "receive" in (receiver as object)
    ) {
      return labelErrNode(
        this.idValue,
        (receiver as unknown as Receiver).receive(
          this.functionValue,
          this.overloadValue,
          args.slice(1),
        ),
      );
    }
    return labelErrNode(this.idValue, maybeNoSuchOverloadErr(receiver));
  }
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }
  public functionName(): string {
    return this.functionValue;
  }
  public overloadId(): string {
    return this.overloadValue;
  }
  public args(): InterpretableV2[] {
    return this.argsValue;
  }
}

/**
 * LogicalOrInterpretable evaluates CEL logical-or short-circuit semantics.
 */
export class LogicalOrInterpretable implements InterpretableCall {
  constructor(
    private readonly idValue: number,
    private readonly termsValue: InterpretableV2[],
    private readonly exhaustiveValue = false,
  ) {}

  /**
   * withExhaustiveEval returns a logical-or which evaluates every term.
   */
  public withExhaustiveEval(): LogicalOrInterpretable {
    return new LogicalOrInterpretable(this.idValue, this.termsValue, true);
  }
  public id(): number {
    return this.idValue;
  }
  public exec(frame: ExecutionFrame): Val {
    let lastUnknown: Unknown | undefined;
    let lastError: Val | undefined;
    let isTrue = false;
    for (const term of this.termsValue) {
      const value = term.exec(frame);
      if (value instanceof Bool) {
        if (value.value()) {
          if (!this.exhaustiveValue) {
            return True;
          }
          isTrue = true;
        }
        continue;
      }
      if (isUnknown(value) && !isTrue) {
        lastUnknown = value as Unknown;
        continue;
      }
      if (!isTrue) {
        lastError ??= labelErrNode(this.idValue, maybeNoSuchOverloadErr(value));
      }
    }
    if (isTrue) {
      return True;
    }
    return lastUnknown ?? lastError ?? False;
  }
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }
  public functionName(): string {
    return operators.LogicalOr;
  }
  public overloadId(): string {
    return "";
  }
  public args(): InterpretableV2[] {
    return this.termsValue;
  }
}

/**
 * LogicalAndInterpretable evaluates CEL logical-and short-circuit semantics.
 */
export class LogicalAndInterpretable implements InterpretableCall {
  constructor(
    private readonly idValue: number,
    private readonly termsValue: InterpretableV2[],
    private readonly exhaustiveValue = false,
  ) {}

  /**
   * withExhaustiveEval returns a logical-and which evaluates every term.
   */
  public withExhaustiveEval(): LogicalAndInterpretable {
    return new LogicalAndInterpretable(this.idValue, this.termsValue, true);
  }
  public id(): number {
    return this.idValue;
  }
  public exec(frame: ExecutionFrame): Val {
    let lastUnknown: Unknown | undefined;
    let lastError: Val | undefined;
    let isFalse = false;
    for (const term of this.termsValue) {
      const value = term.exec(frame);
      if (value instanceof Bool) {
        if (!value.value()) {
          if (!this.exhaustiveValue) {
            return False;
          }
          isFalse = true;
        }
        continue;
      }
      if (isUnknown(value) && !isFalse) {
        lastUnknown = value as Unknown;
        continue;
      }
      if (!isFalse) {
        lastError ??= labelErrNode(this.idValue, maybeNoSuchOverloadErr(value));
      }
    }
    if (isFalse) {
      return False;
    }
    return lastUnknown ?? lastError ?? True;
  }
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }
  public functionName(): string {
    return operators.LogicalAnd;
  }
  public overloadId(): string {
    return "";
  }
  public args(): InterpretableV2[] {
    return this.termsValue;
  }
}

/**
 * EqualityInterpretable evaluates CEL equality.
 */
class EqualityInterpretable implements InterpretableCall {
  constructor(
    private readonly idValue: number,
    private readonly lhsValue: InterpretableV2,
    private readonly rhsValue: InterpretableV2,
  ) {}
  public id(): number {
    return this.idValue;
  }
  public exec(frame: ExecutionFrame): Val {
    const lhs = this.lhsValue.exec(frame);
    if (isError(lhs)) {
      return lhs;
    }
    const rhs = this.rhsValue.exec(frame);
    if (isError(rhs)) {
      return rhs;
    }
    let mergedUnknown: Unknown | undefined;
    [mergedUnknown] = maybeMergeUnknowns(lhs, mergedUnknown);
    [mergedUnknown] = maybeMergeUnknowns(rhs, mergedUnknown);
    if (mergedUnknown) {
      return mergedUnknown;
    }
    return lhs.equal(rhs);
  }
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }
  public functionName(): string {
    return operators.Equals;
  }
  public overloadId(): string {
    return "";
  }
  public args(): InterpretableV2[] {
    return [this.lhsValue, this.rhsValue];
  }
}

/**
 * NotEqualityInterpretable evaluates CEL inequality.
 */
class NotEqualityInterpretable implements InterpretableCall {
  constructor(
    private readonly idValue: number,
    private readonly lhsValue: InterpretableV2,
    private readonly rhsValue: InterpretableV2,
  ) {}
  public id(): number {
    return this.idValue;
  }
  public exec(frame: ExecutionFrame): Val {
    const lhs = this.lhsValue.exec(frame);
    if (isError(lhs)) {
      return lhs;
    }
    const rhs = this.rhsValue.exec(frame);
    if (isError(rhs)) {
      return rhs;
    }
    let mergedUnknown: Unknown | undefined;
    [mergedUnknown] = maybeMergeUnknowns(lhs, mergedUnknown);
    [mergedUnknown] = maybeMergeUnknowns(rhs, mergedUnknown);
    if (mergedUnknown) {
      return mergedUnknown;
    }
    const equal = lhs.equal(rhs);
    return equal instanceof Bool ? new Bool(!equal.value()) : equal;
  }
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }
  public functionName(): string {
    return operators.NotEquals;
  }
  public overloadId(): string {
    return "";
  }
  public args(): InterpretableV2[] {
    return [this.lhsValue, this.rhsValue];
  }
}

/**
 * MapInterpretableValue constructs a runtime map from key and value instructions.
 */
class MapInterpretableValue implements InterpretableConstructor {
  constructor(
    private readonly idValue: number,
    private readonly keysValue: InterpretableV2[],
    private readonly valuesValue: InterpretableV2[],
    private readonly optionalEntriesValue: boolean[],
  ) {}
  public id(): number {
    return this.idValue;
  }
  public exec(frame: ExecutionFrame): Val {
    const entries = new Map<Val, Val>();
    let mergedUnknown: Unknown | undefined;
    for (let index = 0; index < this.keysValue.length; index += 1) {
      const key = this.keysValue[index]!.exec(frame);
      if (isError(key)) {
        return key;
      }
      [mergedUnknown] = maybeMergeUnknowns(key, mergedUnknown);

      const value = this.valuesValue[index]!.exec(frame);
      if (isError(value)) {
        return value;
      }
      [mergedUnknown] = maybeMergeUnknowns(value, mergedUnknown);
      if (
        !isUnknown(key) &&
        !(key instanceof Bool) &&
        !(key instanceof Int) &&
        !(key instanceof Uint) &&
        !(key instanceof CelString)
      ) {
        return new Err(`unsupported key type: ${key.type().typeName()}`);
      }
      // JavaScript maps use object identity, while CEL map keys use CEL equality. Compare the
      // evaluated keys before insertion so equal values and cross-numeric equalities are rejected.
      if (!isUnknown(key)) {
        for (const existingKey of entries.keys()) {
          const equal = existingKey.equal(key);
          if (equal instanceof Bool && equal.value()) {
            return new Err(`Failed with repeated key: ${key.value()}`);
          }
        }
      }
      let entryValue = value;
      if (this.optionalEntriesValue[index] === true && !isUnknown(value)) {
        if (!(value instanceof Optional)) {
          return new Err(
            `cannot initialize optional entry '${key.value()}' from non-optional value ${formatConstructorValue(value)}`,
          );
        }
        if (value === OptionalNone || !value.hasValue()) {
          continue;
        }
        entryValue = value.getValue();
      }
      if (!isUnknown(key) && !isUnknown(entryValue)) {
        entries.set(key, entryValue);
      }
    }
    if (mergedUnknown) {
      return mergedUnknown;
    }
    return refValMap(DefaultTypeAdapter, entries);
  }
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }
  public initVals(): InterpretableV2[] {
    return [...this.keysValue, ...this.valuesValue];
  }
  public type(): RefType {
    return MapType;
  }
}

/**
 * ObjInterpretableValue constructs a runtime object value via the provider.
 */
class ObjInterpretableValue implements InterpretableConstructor {
  constructor(
    private readonly idValue: number,
    private readonly typeNameValue: string,
    private readonly fieldsValue: string[],
    private readonly valuesValue: InterpretableV2[],
    private readonly optionalFieldsValue: boolean[],
    private readonly providerValue: Provider,
  ) {}
  public id(): number {
    return this.idValue;
  }
  public exec(frame: ExecutionFrame): Val {
    const fields: Record<string, Val> = {};
    let mergedUnknown: Unknown | undefined;
    for (let index = 0; index < this.fieldsValue.length; index += 1) {
      let value = this.valuesValue[index]!.exec(frame);
      if (isError(value)) {
        return value;
      }
      [mergedUnknown] = maybeMergeUnknowns(value, mergedUnknown);
      if (this.optionalFieldsValue[index] === true && !isUnknown(value)) {
        if (!(value instanceof Optional)) {
          return new Err(
            `cannot initialize optional entry '${this.fieldsValue[index]}' from non-optional value ${formatConstructorValue(value)}`,
          );
        }
        if (value === OptionalNone || !value.hasValue()) {
          continue;
        }
        value = value.getValue();
      }
      if (!isUnknown(value)) {
        fields[this.fieldsValue[index]!] = value;
      }
    }
    if (mergedUnknown) {
      return mergedUnknown;
    }
    return labelErrNode(this.idValue, this.providerValue.newValue(this.typeNameValue, fields));
  }
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }
  public initVals(): InterpretableV2[] {
    return this.valuesValue;
  }
  public type(): RefType {
    const [structType] = this.providerValue.findStructType(this.typeNameValue);
    return structType ?? ListType;
  }
}

/**
 * FoldIterationOptions contains the mutable bindings for one comprehension iteration.
 */
interface FoldIterationOptions {
  /**
   * accumulator is the current comprehension accumulator.
   */
  accumulator: Val;

  /**
   * first is the value bound to the first iteration variable.
   */
  first: unknown;

  /**
   * second is the value bound to the optional second iteration variable.
   */
  second: unknown;
}

/**
 * FoldActivation reuses one mutable local scope throughout comprehension evaluation.
 */
class FoldActivation implements Activation {
  private accumulatorValue?: Val;
  private firstValue: unknown = undefined;
  private secondValue: unknown = undefined;
  private resultOnly = true;
  private parentValue?: Activation;

  /**
   * constructor initializes the reusable fold scope.
   */
  constructor(private readonly optionsValue: FoldInterpretableOptions) {}

  /**
   * configure attaches the reusable fold state to one comprehension evaluation.
   */
  public configure(accumulator: Val, parent: Activation): void {
    this.accumulatorValue = accumulator;
    this.parentValue = parent;
  }

  /**
   * setIteration updates the local bindings for the next comprehension iteration.
   */
  public setIteration(options: FoldIterationOptions): void {
    this.accumulatorValue = options.accumulator;
    this.firstValue = options.first;
    this.secondValue = options.second;
    this.resultOnly = false;
  }

  /**
   * setResult restricts the local scope to the final accumulator binding.
   */
  public setResult(accumulator: Val): void {
    this.accumulatorValue = accumulator;
    this.firstValue = undefined;
    this.secondValue = undefined;
    this.resultOnly = true;
  }

  /**
   * reset releases evaluation references before the activation returns to its pool.
   */
  public reset(): void {
    this.accumulatorValue = undefined;
    this.firstValue = undefined;
    this.secondValue = undefined;
    this.resultOnly = true;
    this.parentValue = undefined;
  }

  /**
   * resolveName resolves accumulator and active iteration bindings.
   */
  public resolveName(name: string): [unknown, boolean] {
    if (name === this.optionsValue.accuVar) {
      return [this.accumulatorValue, true];
    }
    if (!this.resultOnly && name === this.optionsValue.iterVar) {
      return [this.firstValue, true];
    }
    if (
      !this.resultOnly &&
      this.optionsValue.iterVar2 !== undefined &&
      this.optionsValue.iterVar2.length !== 0 &&
      name === this.optionsValue.iterVar2
    ) {
      return [this.secondValue, true];
    }
    return [undefined, false];
  }

  /**
   * parent returns the activation outside the comprehension scope.
   */
  public parent(): Activation | undefined {
    return this.parentValue;
  }

  /**
   * isLocalVariable reports whether a name belongs to this comprehension scope.
   */
  public isLocalVariable(name: string): boolean {
    return (
      name === this.optionsValue.accuVar ||
      name === this.optionsValue.iterVar ||
      (this.optionsValue.iterVar2 !== undefined &&
        this.optionsValue.iterVar2.length !== 0 &&
        name === this.optionsValue.iterVar2)
    );
  }
}

/**
 * FoldInterpretableValue evaluates a CEL comprehension loop.
 */
export class FoldInterpretableValue implements InterpretableV2 {
  private readonly activationPool: FoldActivation[] = [];

  constructor(private readonly optionsValue: FoldInterpretableOptions) {}

  /**
   * withExhaustiveEval marks the fold so false loop conditions do not short-circuit iteration.
   */
  public withExhaustiveEval(): FoldInterpretableValue {
    return new FoldInterpretableValue({ ...this.optionsValue, exhaustive: true });
  }

  /**
   * withInterruptableEval marks the fold so it checks the execution frame for interruption.
   */
  public withInterruptableEval(): FoldInterpretableValue {
    return new FoldInterpretableValue({ ...this.optionsValue, interruptable: true });
  }
  public id(): number {
    return this.optionsValue.id;
  }
  public exec(frame: ExecutionFrame): Val {
    let accu = this.optionsValue.accuInit.exec(frame);
    const iterRange = this.optionsValue.iterRange.exec(frame);
    if (isUnknownOrError(iterRange)) {
      return iterRange;
    }
    const hasSecondIterVar =
      this.optionsValue.iterVar2 !== undefined && this.optionsValue.iterVar2.length !== 0;
    // cel-go pools one folder and frame for the complete fold. Reuse the local activation and child
    // frame here as well, updating only their iteration bindings.
    const foldActivation = this.activationPool.pop() ?? new FoldActivation(this.optionsValue);
    foldActivation.configure(accu, frame);
    const stepFrame = frame.push(foldActivation);
    const iteration: FoldIterationOptions = {
      accumulator: accu,
      first: undefined,
      second: undefined,
    };
    try {
      const nativeRange = iterRange.value();
      if (Array.isArray(nativeRange)) {
        // Lists are the dominant comprehension input. Iterate their native storage directly so
        // each step does not allocate a generator result and a key-value tuple.
        for (let index = 0; index < nativeRange.length; index += 1) {
          const iterValue = nativeRange[index];
          iteration.accumulator = accu;
          iteration.first = hasSecondIterVar ? index : iterValue;
          iteration.second = iterValue;
          foldActivation.setIteration(iteration);
          const cond = this.optionsValue.condition.exec(stepFrame);
          if (!this.optionsValue.exhaustive && cond instanceof Bool && !cond.value()) {
            break;
          }

          // cel-go allows non-strict comprehensions to continue carrying unknown/error accumulator
          // state forward until a later iteration determines a concrete result.
          accu = this.optionsValue.step.exec(stepFrame);
          if (this.optionsValue.interruptable && stepFrame.checkInterrupt()) {
            return wrapErr(new InterruptError());
          }
        }
      } else {
        for (const [iterKey, iterValue] of iterateRange(iterRange, nativeRange)) {
          // cel-go's one-variable iterable path yields map keys and list elements. Its two-variable
          // fold path binds the key or index first and the corresponding value second.
          iteration.accumulator = accu;
          iteration.first = hasSecondIterVar || iterRange.type() === MapType ? iterKey : iterValue;
          iteration.second = iterValue;
          foldActivation.setIteration(iteration);
          const cond = this.optionsValue.condition.exec(stepFrame);
          if (!this.optionsValue.exhaustive && cond instanceof Bool && !cond.value()) {
            break;
          }

          // cel-go allows non-strict comprehensions to continue carrying unknown/error accumulator
          // state forward until a later iteration determines a concrete result.
          accu = this.optionsValue.step.exec(stepFrame);
          if (this.optionsValue.interruptable && stepFrame.checkInterrupt()) {
            return wrapErr(new InterruptError());
          }
        }
      }
      foldActivation.setResult(accu);
      return this.optionsValue.result.exec(stepFrame);
    } finally {
      stepFrame.pop();
      foldActivation.reset();
      this.activationPool.push(foldActivation);
    }
  }
  public eval(activation: Activation): Val {
    return this.exec(asFrame({ activation }));
  }
}

/**
 * attrInterpretable creates an attribute interpretable.
 */
export function attrInterpretable(options: AttrInterpretableOptions): InterpretableAttribute {
  return new AttrInterpretable(options.attr, options.adapter, options.optional ?? false);
}

/**
 * testOnlyInterpretable creates a presence-test interpretable wrapper.
 */
export function testOnlyInterpretable(
  options: TestOnlyInterpretableOptions,
): InterpretableAttribute {
  return new TestOnlyInterpretable(options);
}

/**
 * callInterpretable creates a runtime call interpretable specialized by arity.
 */
export function callInterpretable(options: CallInterpretableOptions): InterpretableCall {
  if (options.unary && options.args.length === 1) {
    return new UnaryCallInterpretable(
      options.id,
      options.functionName,
      options.overloadId ?? "",
      options.args[0]!,
      options.operandTrait ?? 0,
      options.unary,
      options.nonStrict ?? false,
    );
  }
  if (options.binary && options.args.length === 2) {
    return new BinaryCallInterpretable(
      options.id,
      options.functionName,
      options.overloadId ?? "",
      options.args[0]!,
      options.args[1]!,
      options.operandTrait ?? 0,
      options.binary,
      options.nonStrict ?? false,
    );
  }
  if (options.impl && options.args.length === 0) {
    return new ZeroArityCallInterpretable(
      options.id,
      options.functionName,
      options.overloadId ?? "",
      options.impl,
    );
  }
  return new VarArgsCallInterpretable(
    options.id,
    options.functionName,
    options.overloadId ?? "",
    options.args,
    options.operandTrait ?? 0,
    options.impl,
    options.nonStrict ?? false,
  );
}

/**
 * logicalOrInterpretable creates a logical-or interpretable.
 */
export function logicalOrInterpretable(id: number, terms: InterpretableV2[]): InterpretableCall {
  return new LogicalOrInterpretable(id, terms);
}

/**
 * logicalAndInterpretable creates a logical-and interpretable.
 */
export function logicalAndInterpretable(id: number, terms: InterpretableV2[]): InterpretableCall {
  return new LogicalAndInterpretable(id, terms);
}

/**
 * equalityInterpretable creates an equality interpretable.
 */
export function equalityInterpretable(
  id: number,
  lhs: InterpretableV2,
  rhs: InterpretableV2,
): InterpretableCall {
  return new EqualityInterpretable(id, lhs, rhs);
}

/**
 * notEqualityInterpretable creates an inequality interpretable.
 */
export function notEqualityInterpretable(
  id: number,
  lhs: InterpretableV2,
  rhs: InterpretableV2,
): InterpretableCall {
  return new NotEqualityInterpretable(id, lhs, rhs);
}

/**
 * conditionalInterpretable creates a value-level conditional interpretable.
 */
export function conditionalInterpretable(
  options: ConditionalInterpretableOptions,
): InterpretableV2 {
  return new ConditionalInterpretable(options);
}

/**
 * mapInterpretable creates a map constructor interpretable.
 */
export function mapInterpretable(options: MapInterpretableOptions): InterpretableConstructor {
  return new MapInterpretableValue(
    options.id,
    options.keys,
    options.values,
    options.optionalEntries ?? [],
  );
}

/**
 * objInterpretable creates an object constructor interpretable.
 */
export function objInterpretable(options: ObjInterpretableOptions): InterpretableConstructor {
  return new ObjInterpretableValue(
    options.id,
    options.typeName,
    options.fields,
    options.values,
    options.optionalFields ?? [],
    options.provider,
  );
}

/**
 * formatConstructorValue renders constructor initializer values using their native payloads.
 */
function formatConstructorValue(value: Val): string {
  const native = value.value();
  return typeof native === "bigint" ? native.toString() : String(native);
}

/**
 * foldInterpretable creates a comprehension-fold interpretable.
 */
export function foldInterpretable(options: FoldInterpretableOptions): InterpretableV2 {
  return new FoldInterpretableValue(options);
}

/**
 * iterateRange streams non-list CEL iterable values as key-value pairs for comprehension evaluation.
 */
function* iterateRange(
  value: Val,
  native: unknown,
): Generator<readonly [unknown, unknown], void> {
  if ((value.type().hasTrait?.(IterableType) ?? false) && native instanceof Map) {
    yield* native.entries();
    return;
  }
  if (
    (value.type().hasTrait?.(IterableType) ?? false) &&
    typeof native === "object" &&
    native !== null
  ) {
    for (const key in native) {
      if (Object.hasOwn(native, key)) {
        yield [key, (native as Record<string, unknown>)[key]];
      }
    }
    return;
  }
  if ((value.type().hasTrait?.(FoldableType) ?? false) && "fold" in (value as object)) {
    // Custom Foldable values expose a callback rather than an iterator, so retain a buffered
    // fallback for that compatibility seam while native list and map paths remain streaming.
    const out: Array<[unknown, unknown]> = [];
    (value as unknown as Foldable).fold({
      foldEntry: (key: unknown, entry: unknown) => {
        out.push([key, entry]);
        return true;
      },
    });
    yield* out;
  }
}

/**
 * isInterpretableV2 returns whether the input already satisfies InterpretableV2.
 */
function isInterpretableV2(value: Interpretable): value is InterpretableV2 {
  return "exec" in value && typeof value.exec === "function";
}

/**
 * isRuntimeVal returns whether a resolved attribute already implements the complete CEL value contract.
 */
function isRuntimeVal(value: unknown): value is Val {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<Val>;
  return (
    typeof candidate.convertToNative === "function" &&
    typeof candidate.convertToType === "function" &&
    typeof candidate.equal === "function" &&
    typeof candidate.type === "function" &&
    typeof candidate.value === "function"
  );
}

/**
 * isActivationWrapper returns whether the activation exposes an unwrap method.
 */
function isActivationWrapper(value: Activation): value is Activation & ActivationWrapper {
  return "unwrap" in value && typeof value.unwrap === "function";
}

/**
 * isStructuredConstantValue returns whether a literal is still represented as a protobuf Constant object.
 */
function isStructuredConstantValue(value: ConstantValue | undefined): value is Constant {
  return typeof value === "object" && value !== null && "constantKind" in value;
}

/**
 * constantRuntimeValue preserves the CEL runtime type encoded by a protobuf constant.
 */
export function constantRuntimeValue(options: {
  adapter: Adapter;
  literal: ConstantValue | undefined;
}): Val {
  if (!isStructuredConstantValue(options.literal)) {
    return options.adapter.nativeToValue(options.literal);
  }
  switch (options.literal.constantKind.case) {
    case "nullValue":
      return NullValue;
    case "boolValue":
      return new Bool(options.literal.constantKind.value);
    case "int64Value":
      return new Int(options.literal.constantKind.value);
    case "uint64Value":
      return new Uint(options.literal.constantKind.value);
    case "doubleValue":
      return new Double(options.literal.constantKind.value);
    case "stringValue":
    case "bytesValue":
      return options.adapter.nativeToValue(
        options.literal.constantKind.value instanceof Uint8Array
          ? new Uint8Array(options.literal.constantKind.value)
          : options.literal.constantKind.value,
      );
    default:
      return options.adapter.nativeToValue(constantToVal(options.literal));
  }
}
