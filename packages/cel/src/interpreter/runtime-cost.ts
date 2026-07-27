import {
  ListCreateBaseCost,
  MapCreateBaseCost,
  RegexStringLengthCostFactor,
  SelectAndIdentCost,
  StringTraversalCostFactor,
  StructCreateBaseCost,
} from "../common/cost.js";
import * as operators from "../common/operators.js";
import * as overloads from "../common/overloads.js";
import { Int, ListType, MapType, Optional, type Val } from "../common/types/index.js";
import type { Activation } from "./activation.js";
import {
  type Attribute,
  type ConstantQualifier,
  isConstantQualifier,
  type Qualifier,
} from "./attributes.js";
import { observeEvalDecorator } from "./decorators.js";
import type { ExecutionFrame } from "./frame.js";
import type {
  InterpretableAttribute,
  InterpretableCall,
  InterpretableConst,
  InterpretableConstructor,
  InterpretableV2,
  StatefulObserver,
} from "./interpretable.js";
import type { PlannerConfig } from "./interpreter.js";

// WARNING: Any changes to cost calculations in this file require a corresponding change in checker/cost.ts.

/**
 * ActualCallCostOptions contains one runtime function invocation passed to an ActualCostEstimator.
 */
export interface ActualCallCostOptions {
  /**
   * functionName is the CEL function name.
   */
  functionName: string;

  /**
   * overloadId is the selected overload identifier.
   */
  overloadId: string;

  /**
   * args contains the evaluated CEL arguments.
   */
  args: Val[];

  /**
   * result is the evaluated CEL result.
   */
  result: Val;
}

/**
 * ActualCostEstimator provides function call cost estimations at runtime.
 *
 * callCost returns an estimated cost for the function overload invocation with the given arguments,
 * or undefined if it has no estimate to provide. CEL attempts to provide reasonable estimates for
 * its standard function library, so callCost should typically not need to provide an estimate for
 * CEL's standard functions.
 */
export interface ActualCostEstimator {
  /**
   * callCost estimates the cost of one runtime function overload invocation.
   */
  callCost(options: ActualCallCostOptions): number | undefined;
}

/**
 * FunctionCostOptions contains one runtime function invocation passed to a FunctionTracker.
 */
export interface FunctionCostOptions {
  /**
   * args contains the evaluated CEL arguments.
   */
  args: Val[];

  /**
   * result is the evaluated CEL result.
   */
  result: Val;
}

/**
 * FunctionTracker computes the actual cost of evaluating a function with the given arguments and
 * result.
 */
export interface FunctionTracker {
  /**
   * cost returns the invocation cost, or undefined to defer to the estimator and standard rules.
   */
  cost(options: FunctionCostOptions): number | undefined;
}

/**
 * CostTrackerOptions configures runtime cost-tracker construction.
 */
export interface CostTrackerOptions {
  /**
   * estimator provides application-specific runtime function costs.
   */
  estimator?: ActualCostEstimator;

  /**
   * overloadTrackers binds overload identifiers to versioned or optional runtime cost rules.
   */
  overloadTrackers?: Readonly<Record<string, FunctionTracker>>;

  /**
   * limit is the runtime evaluation cost limit.
   */
  limit?: number;

  /**
   * presenceTestHasCost determines whether presence testing has a cost of one or zero.
   */
  presenceTestHasCost?: boolean;

  /**
   * cost is the initial accumulated runtime cost.
   */
  cost?: number;
}

/**
 * CostObserverOptions configures runtime cost observation for an interpreter program.
 */
export interface CostObserverOptions {
  /**
   * trackerFactory produces a fresh CostTracker for each evaluation.
   */
  trackerFactory: () => CostTracker;
}

/**
 * CostLimitExceededError reports that evaluation exceeded its configured actual cost limit.
 */
export class CostLimitExceededError extends Error {
  /**
   * constructor initializes the standard cel-go cost-limit error.
   */
  constructor() {
    super("operation cancelled: actual cost limit exceeded");
    this.name = "CostLimitExceededError";
  }
}

/**
 * StackValue associates an observed CEL value with its expression identifier.
 */
interface StackValue {
  /**
   * value is the observed CEL value.
   */
  value: Val;

  /**
   * id is the observed expression identifier.
   */
  id: number;
}

/**
 * DropArgsResult contains values removed from the runtime cost stack.
 */
interface DropArgsResult {
  /**
   * args contains the argument values in call order.
   */
  args: Val[];

  /**
   * found reports whether every requested argument identifier was found.
   */
  found: boolean;
}

/**
 * RefValStack keeps track of values on the stack for cost calculation purposes.
 */
class RefValStack {
  /**
   * values stores observed values in evaluation order.
   */
  private values: StackValue[] = [];

  /**
   * push appends an observed value and expression identifier.
   */
  public push(options: StackValue): void {
    this.values.push(options);
  }

  /**
   * drop searches the stack for each ID and removes the ID and all stack items above it.
   *
   * If none of the IDs are found, the stack is not modified.
   *
   * WARNING: It is possible for multiple expressions with the same ID to exist due to macro
   * expansion, so a dropped ID may remain on the stack. It will be removed when higher stack IDs
   * are popped.
   */
  public drop(options: { ids: number[] }): void {
    for (const id of options.ids) {
      for (let index = this.values.length - 1; index >= 0; index -= 1) {
        if (this.values[index]!.id === id) {
          this.values = this.values.slice(0, index);
          break;
        }
      }
    }
  }

  /**
   * dropArgs searches the stack for all arguments by ID, accumulates their associated values, and
   * drops any stack items above the argument IDs.
   *
   * If any ID is not found, found is false. Arguments are expected in reverse evaluation order:
   * the last argument should be highest on the stack.
   *
   * WARNING: It is possible for multiple expressions with the same ID to exist due to macro
   * expansion, so a dropped ID may remain on the stack. It will be removed when higher stack IDs
   * are popped.
   */
  public dropArgs(options: { args: InterpretableV2[] }): DropArgsResult {
    const result = new Array<Val>(options.args.length);
    for (let argumentIndex = options.args.length - 1; argumentIndex >= 0; argumentIndex -= 1) {
      let found = false;
      for (let stackIndex = this.values.length - 1; stackIndex >= 0; stackIndex -= 1) {
        if (this.values[stackIndex]!.id === options.args[argumentIndex]!.id()) {
          const element = this.values[stackIndex]!;
          this.values = this.values.slice(0, stackIndex);
          result[argumentIndex] = element.value;
          found = true;
          break;
        }
      }
      if (!found) {
        return { args: [], found: false };
      }
    }
    return { args: result, found: true };
  }
}

/**
 * CostTracker represents the information needed for tracking runtime cost.
 */
export class CostTracker {
  /**
   * estimatorValue stores the application-specific runtime cost estimator.
   */
  private readonly estimatorValue?: ActualCostEstimator;

  /**
   * overloadTrackersValue stores overload-specific runtime cost trackers.
   */
  private readonly overloadTrackersValue: Readonly<Record<string, FunctionTracker>>;

  /**
   * limitValue stores the optional runtime cost limit.
   */
  private readonly limitValue?: number;

  /**
   * presenceTestHasCostValue stores whether presence tests cost one.
   */
  private readonly presenceTestHasCostValue: boolean;

  /**
   * costValue stores the accumulated actual runtime cost.
   */
  private costValue: number;

  /**
   * stackValue stores observed intermediate values used to recover call arguments.
   */
  private readonly stackValue = new RefValStack();

  /**
   * constructor initializes a runtime cost tracker.
   */
  constructor(options: CostTrackerOptions = {}) {
    this.estimatorValue = options.estimator;
    this.overloadTrackersValue = options.overloadTrackers ?? {};
    this.limitValue = options.limit;
    this.presenceTestHasCostValue = options.presenceTestHasCost ?? true;
    this.costValue = options.cost ?? 0;
  }

  /**
   * clone makes a shallow copy of the tracker.
   *
   * Different clones can be used independently from each other. Accumulated cost and stack state
   * are intentionally reset.
   */
  public clone(): CostTracker {
    return new CostTracker({
      estimator: this.estimatorValue,
      overloadTrackers: this.overloadTrackersValue,
      limit: this.limitValue,
      presenceTestHasCost: this.presenceTestHasCostValue,
    });
  }

  /**
   * actualCost returns the runtime cost.
   */
  public actualCost(): number {
    return this.costValue;
  }

  /**
   * observe computes the incremental cost of a step and records it in this tracker.
   */
  public observe(options: { id: number; programStep: unknown; value: Val }): void {
    const { id, programStep, value } = options;
    if (isObservedConstantQualifier(programStep)) {
      // Identifiers are not yet pushed before their constant qualifiers, so this qualifier cannot
      // use the ordinary qualifier pop path.
      this.costValue += 1;
    } else if (isObservedConst(programStep)) {
      // Constants have zero direct runtime cost.
    } else if (isObservedAttribute(programStep)) {
      const attr = programStep.attr();
      const conditionalParts = conditionalAttributeParts(attr);
      if (conditionalParts !== undefined) {
        // Ternary has no direct cost. All cost belongs to the condition and selected branch.
        this.stackValue.drop({
          ids: [
            conditionalParts.falsy.id(),
            conditionalParts.truthy.id(),
            conditionalParts.expr.id(),
          ],
        });
      } else {
        this.stackValue.drop({ ids: [attr.id()] });
        this.costValue += SelectAndIdentCost;
      }
      if (!this.presenceTestHasCostValue && isPresenceTest(programStep)) {
        this.costValue -= SelectAndIdentCost;
      }
    } else if (isLogicalCall(programStep)) {
      // The boolean operation implementations do not expose a separate shared interface in cel-go.
      // Dropping every executed term preserves the same behavior for both short-circuit operators.
      this.stackValue.drop({ ids: programStep.args().map((arg) => arg.id()) });
    } else if (isFold(programStep)) {
      this.stackValue.drop({ ids: [programStep.optionsValue.iterRange.id()] });
    } else if (isObservedQualifier(programStep)) {
      this.costValue += 1;
    } else if (isObservedCall(programStep)) {
      const dropped = this.stackValue.dropArgs({ args: programStep.args() });
      if (dropped.found) {
        this.costValue += this.costCall({
          call: programStep,
          args: dropped.args,
          result: value,
        });
      }
    } else if (isObservedConstructor(programStep)) {
      this.stackValue.dropArgs({ args: programStep.initVals() });
      if (programStep.type() === ListType) {
        this.costValue += ListCreateBaseCost;
      } else if (programStep.type() === MapType) {
        this.costValue += MapCreateBaseCost;
      } else {
        this.costValue += StructCreateBaseCost;
      }
    }
    this.stackValue.push({ value, id });

    if (this.limitValue !== undefined && this.costValue > this.limitValue) {
      throw new CostLimitExceededError();
    }
  }

  /**
   * costCall computes an observed function invocation's overload-specific cost.
   */
  private costCall(options: { call: InterpretableCall; args: Val[]; result: Val }): number {
    const { call, args, result } = options;
    const trackedOverload = this.overloadTrackersValue[call.overloadId()];
    if (trackedOverload !== undefined) {
      const trackedCost = trackedOverload.cost({ args, result });
      if (trackedCost !== undefined) {
        return trackedCost;
      }
    }
    if (this.estimatorValue !== undefined) {
      const estimatedCost = this.estimatorValue.callCost({
        functionName: call.functionName(),
        overloadId: call.overloadId(),
        args,
        result,
      });
      if (estimatedCost !== undefined) {
        return estimatedCost;
      }
    }

    // If the user did not specify a cost, use the default runtime cost calculation. Custom
    // estimators should cover any application-specific mapping between overload IDs and costs.
    const overloadId = call.overloadId() || call.functionName();
    switch (overloadId) {
      // O(n) functions.
      case overloads.StartsWithString:
      case overloads.EndsWithString:
        return Math.ceil(actualSize(args[1]!) * StringTraversalCostFactor);
      case overloads.StringToBytes:
      case overloads.BytesToString:
      case overloads.ExtQuoteString:
      case overloads.ExtFormatString:
        return Math.ceil(actualSize(args[0]!) * StringTraversalCostFactor);
      case overloads.InList:
        // A list made entirely of constants may be O(1), but runtime cost conservatively assumes
        // every list containment check is O(n).
        return actualSize(args[1]!);

      // O(min(m, n)) functions.
      case overloads.LessString:
      case overloads.GreaterString:
      case overloads.LessEqualsString:
      case overloads.GreaterEqualsString:
      case overloads.LessBytes:
      case overloads.GreaterBytes:
      case overloads.LessEqualsBytes:
      case overloads.GreaterEqualsBytes:
      case overloads.Equals:
      case overloads.NotEquals:
      case operators.Equals:
      case operators.NotEquals: {
        // Scalar equality has size one for both operands and therefore costs one.
        const minSize = Math.min(actualSize(args[0]!), actualSize(args[1]!));
        return Math.ceil(minSize * StringTraversalCostFactor);
      }

      // O(m+n) functions.
      case overloads.AddString:
      case overloads.AddBytes:
        // The worst case reallocates a backing store and copies both operands.
        return Math.ceil((actualSize(args[0]!) + actualSize(args[1]!)) * StringTraversalCostFactor);

      // O(nm) functions.
      case overloads.Matches:
      case overloads.MatchesString: {
        // RE2 matching is linear in the product of input and regular-expression program sizes.
        // Add one to the string length so an empty string cannot make an expensive regex free.
        const stringCost = Math.ceil((1 + actualSize(args[0]!)) * StringTraversalCostFactor);
        // Runtime only knows regex source length. Assume each regex expression averages at least
        // four characters until compiled regex state size is available.
        const regexCost = Math.ceil(actualSize(args[1]!) * RegexStringLengthCostFactor);
        return stringCost * regexCost;
      }
      case overloads.ContainsString: {
        const stringCost = Math.ceil(actualSize(args[0]!) * StringTraversalCostFactor);
        const substringCost = Math.ceil(actualSize(args[1]!) * StringTraversalCostFactor);
        return stringCost * substringCost;
      }
      default:
        // The following operations are assumed to have O(1) complexity:
        // - AddList because index cost for concatenated lists is not tracked.
        // - Conversions because none traverse a type of unbound length.
        // - Computing the size of strings, bytes, lists, and maps.
        // - Logical operations and operators on fixed-width scalars.
        // - Functions without a declared standard or application-specific cost.
        return 1;
    }
  }
}

/**
 * CostTrackerFactory holds a factory for producing a CostTracker on each evaluation.
 */
class CostTrackerFactory implements StatefulObserver {
  /**
   * trackers stores the tracker associated with each root execution frame.
   */
  private readonly trackers = new WeakMap<ExecutionFrame, CostTracker>();

  /**
   * constructor stores the per-evaluation tracker factory.
   */
  constructor(private readonly trackerFactoryValue: () => CostTracker) {}

  /**
   * initState produces a CostTracker and associates it with the evaluation frame.
   */
  public initState(frame: ExecutionFrame): CostTracker {
    const tracker = this.trackerFactoryValue();
    this.trackers.set(rootFrame(frame), tracker);
    return tracker;
  }

  /**
   * getState extracts the CostTracker from the evaluation frame.
   */
  public getState(frame: ExecutionFrame): CostTracker | undefined {
    return this.trackers.get(rootFrame(frame));
  }

  /**
   * observe computes the incremental cost of each step using the evaluation's CostTracker.
   */
  public observe(activationValue: Activation, id: number, programStep: unknown, value: Val): void {
    if (!(activationValue instanceof Object) || !isExecutionFrame(activationValue)) {
      return;
    }
    this.getState(activationValue)?.observe({ id, programStep, value });
  }
}

/**
 * costObserverConfig provides an observer that tracks runtime cost.
 */
export function costObserverConfig(options: CostObserverOptions): PlannerConfig {
  const trackerFactory = new CostTrackerFactory(options.trackerFactory);
  return {
    observers: [trackerFactory],
    decorators: [observeEvalDecorator(trackerFactory.observe.bind(trackerFactory))],
  };
}

/**
 * actualSize returns the size of Sizer values, recursively unwraps populated optionals, and returns
 * one for all other value types.
 */
function actualSize(value: Val): number {
  if (isSizer(value)) {
    const size = value.size();
    if (size instanceof Int) {
      return Number(size.value());
    }
  }
  if (value instanceof Optional && value.hasValue()) {
    return actualSize(value.getValue());
  }
  return 1;
}

/**
 * rootFrame returns the root of an execution frame hierarchy.
 */
function rootFrame(frame: ExecutionFrame): ExecutionFrame {
  let current = frame;
  while (current.parentFrame() !== undefined) {
    current = current.parentFrame()!;
  }
  return current;
}

/**
 * isExecutionFrame returns whether a value exposes the execution-frame APIs used by cost tracking.
 */
function isExecutionFrame(value: unknown): value is ExecutionFrame {
  return (
    typeof value === "object" &&
    value !== null &&
    "parentFrame" in value &&
    typeof (value as { parentFrame?: unknown }).parentFrame === "function"
  );
}

/**
 * isSizer returns whether a CEL value exposes a size operation.
 */
function isSizer(value: Val): value is Val & { size(): Val } {
  return "size" in value && typeof (value as { size?: unknown }).size === "function";
}

/**
 * isObservedConst returns whether an observed program step is a constant interpretable.
 */
function isObservedConst(value: unknown): value is InterpretableConst {
  return (
    isInterpretable(value) &&
    "value" in value &&
    typeof (value as { value?: unknown }).value === "function" &&
    !("qualify" in value)
  );
}

/**
 * isObservedAttribute returns whether an observed program step is an attribute interpretable.
 */
function isObservedAttribute(value: unknown): value is InterpretableAttribute {
  return (
    isInterpretable(value) &&
    "attr" in value &&
    typeof (value as { attr?: unknown }).attr === "function"
  );
}

/**
 * isObservedCall returns whether an observed program step is a function call interpretable.
 */
function isObservedCall(value: unknown): value is InterpretableCall {
  return (
    isInterpretable(value) &&
    "args" in value &&
    typeof (value as { args?: unknown }).args === "function" &&
    "functionName" in value &&
    typeof (value as { functionName?: unknown }).functionName === "function" &&
    "overloadId" in value &&
    typeof (value as { overloadId?: unknown }).overloadId === "function"
  );
}

/**
 * isLogicalCall returns whether an observed call is a short-circuit boolean operation.
 */
function isLogicalCall(value: unknown): value is InterpretableCall {
  if (!isObservedCall(value)) {
    return false;
  }
  const functionName = value.functionName();
  return functionName === operators.LogicalOr || functionName === operators.LogicalAnd;
}

/**
 * isObservedConstructor returns whether an observed step constructs a CEL aggregate.
 */
function isObservedConstructor(value: unknown): value is InterpretableConstructor {
  return (
    isInterpretable(value) &&
    "initVals" in value &&
    typeof (value as { initVals?: unknown }).initVals === "function" &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "function"
  );
}

/**
 * FoldStepShape exposes the private fold state needed to mirror cel-go's stack cleanup.
 */
interface FoldStepShape extends InterpretableV2 {
  /**
   * optionsValue contains the fold input range.
   */
  optionsValue: {
    /**
     * iterRange evaluates the collection iterated by the fold.
     */
    iterRange: InterpretableV2;
  };
}

/**
 * isFold returns whether an observed step is a comprehension fold.
 */
function isFold(value: unknown): value is FoldStepShape {
  if (!isInterpretable(value) || !("optionsValue" in value)) {
    return false;
  }
  const optionsValue = (value as { optionsValue?: unknown }).optionsValue;
  return (
    typeof optionsValue === "object" &&
    optionsValue !== null &&
    "iterRange" in optionsValue &&
    isInterpretable((optionsValue as { iterRange?: unknown }).iterRange)
  );
}

/**
 * isObservedConstantQualifier returns whether a program step is a constant attribute qualifier.
 */
function isObservedConstantQualifier(value: unknown): value is ConstantQualifier {
  return isObservedQualifier(value) && isConstantQualifier(value as Qualifier);
}

/**
 * isObservedQualifier returns whether a program step is an attribute qualifier.
 */
function isObservedQualifier(value: unknown): value is Qualifier {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id?: unknown }).id === "function" &&
    "qualify" in value &&
    typeof (value as { qualify?: unknown }).qualify === "function" &&
    "qualifyIfPresent" in value &&
    typeof (value as { qualifyIfPresent?: unknown }).qualifyIfPresent === "function"
  );
}

/**
 * isInterpretable returns whether a value exposes the common interpreter instruction shape.
 */
function isInterpretable(value: unknown): value is InterpretableV2 {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id?: unknown }).id === "function" &&
    "exec" in value &&
    typeof (value as { exec?: unknown }).exec === "function"
  );
}

/**
 * isPresenceTest returns whether an attribute step is the test-only select wrapper.
 */
function isPresenceTest(value: InterpretableAttribute): boolean {
  const optionsValue = (value as unknown as { optionsValue?: unknown }).optionsValue;
  return (
    typeof optionsValue === "object" &&
    optionsValue !== null &&
    "attr" in optionsValue &&
    "id" in optionsValue
  );
}

/**
 * ConditionalAttributeParts contains the expressions owned by a conditional attribute.
 */
interface ConditionalAttributeParts {
  /**
   * expr is the conditional expression.
   */
  expr: InterpretableV2;

  /**
   * truthy is the true-branch attribute.
   */
  truthy: Attribute;

  /**
   * falsy is the false-branch attribute.
   */
  falsy: Attribute;
}

/**
 * conditionalAttributeParts returns a conditional attribute's internal expressions when present.
 */
function conditionalAttributeParts(attr: Attribute): ConditionalAttributeParts | undefined {
  const candidate = attr as unknown as {
    exprValue?: unknown;
    truthyValue?: unknown;
    falsyValue?: unknown;
  };
  if (
    isInterpretable(candidate.exprValue) &&
    isAttribute(candidate.truthyValue) &&
    isAttribute(candidate.falsyValue)
  ) {
    return {
      expr: candidate.exprValue,
      truthy: candidate.truthyValue,
      falsy: candidate.falsyValue,
    };
  }
  return undefined;
}

/**
 * isAttribute returns whether a value exposes the attribute interface.
 */
function isAttribute(value: unknown): value is Attribute {
  return (
    isObservedQualifier(value) &&
    "resolve" in value &&
    typeof (value as { resolve?: unknown }).resolve === "function" &&
    "addQualifier" in value &&
    typeof (value as { addQualifier?: unknown }).addQualifier === "function"
  );
}
