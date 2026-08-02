import * as overloads from "../common/overloads.js";
import {
  type Adapter,
  Bool,
  String as CelString,
  False,
  isUnknownOrError,
  ListType,
  labelErrNode,
  MapType,
  OptionalNone,
  type Val,
  wrapErr,
} from "../common/types/index.js";
import { regexProgramSize } from "../common/types/regex.js";
import type { Activation } from "./activation.js";
import { emptyActivation } from "./activation.js";
import {
  type Attribute,
  ConditionalAttributeImpl,
  type ConstantQualifier,
  isAttribute,
  isConstantQualifier,
  qualifierAbsent,
  type Qualifier,
} from "./attributes.js";
import { executionFrame } from "./frame.js";
import type {
  EvalObserver,
  Interpretable,
  InterpretableAttribute,
  InterpretableCall,
  InterpretableConst,
  InterpretableConstructor,
  InterpretableV2,
} from "./interpretable.js";
import {
  adaptToV2,
  ConditionalInterpretable,
  constValue,
  FoldInterpretableValue,
  LogicalAndInterpretable,
  LogicalOrInterpretable,
  watchConstructor,
} from "./interpretable.js";
import type { RegexOptimization } from "./optimizations.js";

/**
 * InterpretableDecorator decorates or replaces a legacy interpretable node.
 */
export type InterpretableDecorator = (value: Interpretable) => Interpretable;

/**
 * InterpretableDecoratorV2 decorates or replaces a V2 interpretable node.
 */
export type InterpretableDecoratorV2 = (value: InterpretableV2) => InterpretableV2;

/**
 * observedQualifierSet tracks qualifier wrappers that have already been instrumented.
 */
const observedQualifierSet = new WeakSet<object>();

/**
 * observedInterpretableSet tracks interpretables which have already been instrumented.
 */
const observedInterpretableSet = new WeakSet<object>();

/**
 * typeConversionFunctions lists the CEL conversion functions which can be folded at plan time.
 */
const typeConversionFunctions = new Set([
  "bool",
  "bytes",
  "double",
  "duration",
  "dyn",
  "int",
  "string",
  "timestamp",
  "type",
  "uint",
]);

/**
 * interruptFoldsDecorator marks comprehension folds as interruptable.
 */
export function interruptFoldsDecorator(): InterpretableDecoratorV2 {
  return (value) =>
    value instanceof FoldInterpretableValue ? value.withInterruptableEval() : value;
}

/**
 * disableShortcircuitsDecorator ensures all branches of an expression are evaluated.
 */
export function disableShortcircuitsDecorator(): InterpretableDecoratorV2 {
  return (value) => {
    if (
      value instanceof LogicalOrInterpretable ||
      value instanceof LogicalAndInterpretable ||
      value instanceof ConditionalInterpretable ||
      value instanceof FoldInterpretableValue
    ) {
      return value.withExhaustiveEval();
    }
    if (isInterpretableAttribute(value) && value.attr() instanceof ConditionalAttributeImpl) {
      const conditional = value.attr() as ConditionalAttributeImpl;
      return {
        id: () => value.id(),
        exec: (frame) => {
          try {
            return value.adapter().nativeToValue(conditional.resolveExhaustively(frame));
          } catch (error) {
            return labelErrNode(value.id(), wrapErr(error));
          }
        },
        eval: (activation) => {
          try {
            return value.adapter().nativeToValue(conditional.resolveExhaustively(activation));
          } catch (error) {
            return labelErrNode(value.id(), wrapErr(error));
          }
        },
      };
    }
    return value;
  };
}

/**
 * optimizeDecorator precomputes constant type conversions during program planning.
 */
export function optimizeDecorator(): InterpretableDecoratorV2 {
  return (value) => {
    if (
      isInterpretableConstructor(value) &&
      (value.type() === ListType || value.type() === MapType) &&
      value.initVals().every((init) => isInterpretableConst(init))
    ) {
      const frame = executionFrame({ input: emptyActivation() });
      try {
        return constValue({ id: value.id(), value: value.exec(frame) });
      } finally {
        frame.close();
      }
    }
    if (!isInterpretableCall(value) || !typeConversionFunctions.has(value.functionName())) {
      if (isInterpretableCall(value) && value.overloadId() === overloads.InList) {
        return optimizeSetMembership(value);
      }
      return value;
    }
    const args = value.args();
    if (args.length !== 1 || !isInterpretableConst(args[0]!)) {
      return value;
    }
    const frame = executionFrame({ input: emptyActivation() });
    try {
      const result = value.exec(frame);
      if (result instanceof Error) {
        throw result;
      }
      return constValue({ id: value.id(), value: result });
    } finally {
      frame.close();
    }
  };
}

/**
 * optimizeSetMembership replaces membership in a constant primitive list with a precomputed set.
 */
function optimizeSetMembership(value: InterpretableCall): InterpretableV2 {
  const [lhs, rhs] = value.args();
  if (!lhs || !rhs || !isInterpretableConst(rhs)) {
    return value;
  }
  const elements = rhs.value().value();
  if (!Array.isArray(elements)) {
    return value;
  }
  const supportedTypes = new Set(["bool", "double", "int", "null_type", "string", "uint"]);
  if (
    !elements.every(
      (element): element is Val =>
        isRuntimeVal(element) && supportedTypes.has(element.type().typeName()),
    )
  ) {
    return value;
  }
  if (elements.length === 0) {
    return constValue({ id: value.id(), value: False });
  }
  /**
   * evaluate tests one runtime candidate against the precomputed constant elements.
   */
  const evaluate = (frame: Parameters<InterpretableV2["exec"]>[0]): Val => {
    const candidate = lhs.exec(frame);
    if (isUnknownOrError(candidate)) {
      return candidate;
    }
    for (const element of elements) {
      const equal = candidate.equal(element);
      if (equal instanceof Bool && equal.value()) {
        return new Bool(true);
      }
    }
    return False;
  };
  return {
    id: () => value.id(),
    exec: evaluate,
    eval: (activation) => {
      const frame = executionFrame({ input: activation });
      try {
        return evaluate(frame);
      } finally {
        frame.close();
      }
    },
  };
}

/**
 * isRuntimeVal returns whether a constant list element implements the CEL value contract.
 */
function isRuntimeVal(value: unknown): value is Val {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "function" &&
    "equal" in value &&
    typeof value.equal === "function"
  );
}

/**
 * RegexOptimizerDecoratorOptions configures constant regular expression compilation.
 */
export interface RegexOptimizerDecoratorOptions {
  /**
   * optimizations lists the function-specific regular expression compilers.
   */
  optimizations: RegexOptimization[];
}

/**
 * regexOptimizerDecorator compiles constant regular expression arguments during planning.
 */
export function regexOptimizerDecorator(
  options: RegexOptimizerDecoratorOptions,
): InterpretableDecoratorV2 {
  const byFunction = new Map(
    options.optimizations.map((optimization) => [optimization.functionName, optimization]),
  );
  const byOverload = new Map(
    options.optimizations
      .filter((optimization) => optimization.overloadId)
      .map((optimization) => [optimization.overloadId!, optimization]),
  );
  return (value) => {
    if (!isInterpretableCall(value)) {
      return value;
    }
    const optimization =
      (value.overloadId() ? byOverload.get(value.overloadId()) : undefined) ??
      byFunction.get(value.functionName());
    if (!optimization) {
      return value;
    }
    const regexArg = value.args()[optimization.regexIndex];
    if (!regexArg || !isInterpretableConst(regexArg) || !(regexArg.value() instanceof CelString)) {
      return value;
    }
    return optimization.factory({
      call: value,
      pattern: String(regexArg.value().value()),
    });
  };
}

/**
 * RegexProgramSizeLimitDecoratorOptions configures regex instruction-count enforcement.
 */
export interface RegexProgramSizeLimitDecoratorOptions {
  /** limit is the maximum permitted compiled regex instruction count. */
  limit: number;
}

/**
 * regexProgramSizeLimitDecorator enforces regex program-size limits at planning and evaluation.
 */
export function regexProgramSizeLimitDecorator(
  options: RegexProgramSizeLimitDecoratorOptions,
): InterpretableDecoratorV2 {
  return (value) => {
    if (
      options.limit <= 0 ||
      !isInterpretableCall(value) ||
      !isRegexFunction(value.functionName(), value.overloadId())
    ) {
      return value;
    }
    const pattern = value.args()[1];
    if (pattern === undefined) {
      return value;
    }
    if (isInterpretableConst(pattern) && pattern.value() instanceof CelString) {
      assertRegexProgramSize(String(pattern.value().value()), options.limit);
      return value;
    }
    const execute = (frame: Parameters<InterpretableV2["exec"]>[0]): Val => {
      const patternValue = pattern.exec(frame);
      if (isUnknownOrError(patternValue)) {
        return patternValue;
      }
      if (patternValue instanceof CelString) {
        try {
          assertRegexProgramSize(String(patternValue.value()), options.limit);
        } catch (error) {
          return wrapErr(error);
        }
      }
      return value.exec(frame);
    };
    return {
      id: () => value.id(),
      exec: execute,
      eval: (activation) => {
        const frame = executionFrame({ input: activation });
        try {
          return execute(frame);
        } finally {
          frame.close();
        }
      },
      functionName: () => value.functionName(),
      overloadId: () => value.overloadId(),
      args: () => value.args(),
    };
  };
}

/**
 * isRegexFunction reports whether a call interprets its second argument as an RE2 pattern.
 */
function isRegexFunction(functionName: string, overloadId: string): boolean {
  return (
    functionName === overloads.Matches ||
    functionName === "regex.extract" ||
    functionName === "regex.extractAll" ||
    functionName === "regex.replace" ||
    overloadId === overloads.Matches ||
    overloadId === overloads.MatchesString ||
    overloadId.startsWith("regex_extract") ||
    overloadId.startsWith("regex_replace")
  );
}

/**
 * assertRegexProgramSize throws when a compiled pattern exceeds the configured limit.
 */
function assertRegexProgramSize(pattern: string, limit: number): void {
  const size = regexProgramSize(pattern);
  if (size > limit) {
    throw new Error(`regex program size ${size} exceeds limit of ${limit}`);
  }
}

/**
 * observeEvalDecorator records evaluation state into an observer.
 */
export function observeEvalDecorator(observer: EvalObserver): InterpretableDecoratorV2 {
  return (value) => {
    if (observedInterpretableSet.has(value as object)) {
      return value;
    }
    let decorated: InterpretableV2 | InterpretableConst | InterpretableCall;
    if (isInterpretableConstructor(value)) {
      decorated = watchConstructor({
        constructor: value,
        observer,
      });
    } else if (isInterpretableAttribute(value)) {
      decorated = observeInterpretableAttribute(value, observer);
    } else if (isInterpretableCall(value)) {
      decorated = {
        id: () => value.id(),
        exec: (frame) => {
          const out = value.exec(frame);
          observer(frame, value.id(), value, out);
          return out;
        },
        eval: (activation) => {
          const out = value.eval(activation);
          observer(activation, value.id(), value, out);
          return out;
        },
        functionName: () => value.functionName(),
        overloadId: () => value.overloadId(),
        args: () => value.args(),
      };
    } else if (isInterpretableConst(value)) {
      decorated = {
        id: () => value.id(),
        exec: (frame) => {
          const out = value.exec(frame);
          observer(frame, value.id(), value, out);
          return out;
        },
        eval: (activation) => {
          const out = value.eval(activation);
          observer(activation, value.id(), value, out);
          return out;
        },
        value: () => value.value(),
      };
    } else {
      decorated = {
        id: () => value.id(),
        exec: (frame) => {
          const out = value.exec(frame);
          observer(frame, value.id(), value, out);
          return out;
        },
        eval: (activation) => {
          const out = value.eval(activation);
          observer(activation, value.id(), value, out);
          return out;
        },
      };
    }
    observedInterpretableSet.add(decorated as object);
    return decorated;
  };
}

/**
 * adaptLegacyDecorator converts a legacy decorator into a V2 decorator.
 */
export function adaptLegacyDecorator(decorator: InterpretableDecorator): InterpretableDecoratorV2 {
  return (value) => adaptToV2(decorator(value));
}

/**
 * isInterpretableConst returns whether the input is a constant interpretable.
 */
function isInterpretableConst(value: InterpretableV2): value is InterpretableConst {
  return "value" in value && typeof value.value === "function";
}

/**
 * isInterpretableCall returns whether the input exposes runtime call metadata.
 */
function isInterpretableCall(value: InterpretableV2): value is InterpretableCall {
  return (
    "functionName" in value &&
    typeof value.functionName === "function" &&
    "args" in value &&
    typeof value.args === "function"
  );
}

/**
 * isInterpretableAttribute returns whether the input preserves attribute qualification behavior.
 */
function isInterpretableAttribute(value: InterpretableV2): value is InterpretableAttribute {
  return "attr" in value && typeof value.attr === "function";
}

/**
 * isInterpretableConstructor returns whether the input is a constructor interpretable.
 */
function isInterpretableConstructor(value: InterpretableV2): value is InterpretableConstructor {
  return "initVals" in value && typeof value.initVals === "function";
}

/**
 * ObserveConditionalQualificationOptions configures conditional qualifier observation.
 */
interface ObserveConditionalQualificationOptions {
  /**
   * adapter adapts native qualification results into CEL values.
   */
  adapter: Adapter;

  /**
   * observer records the observed qualifier result.
   */
  observer: EvalObserver;

  /**
   * vars is the active evaluation context.
   */
  vars: Activation;

  /**
   * qualifier identifies the qualifier being observed.
   */
  qualifier: Qualifier;

  /**
   * out is the qualified value when one is present.
   */
  out: unknown;

  /**
   * present reports whether the qualification found a present value.
   */
  present: boolean;

  /**
   * presenceOnly reports whether the caller asked only for presence.
   */
  presenceOnly: boolean;
}

/**
 * observeInterpretableAttribute preserves attribute semantics while recording qualifier observations.
 */
function observeInterpretableAttribute(
  value: InterpretableAttribute,
  observer: EvalObserver,
): InterpretableAttribute {
  wrapObservedQualifiers(value.attr(), observer, value.adapter());
  const watchedAttribute: InterpretableAttribute = {
    id: () => value.id(),
    exec: (frame) => {
      const out = value.exec(frame);
      observer(frame, value.id(), value, out);
      return out;
    },
    eval: (activation) => {
      const out = value.eval(activation);
      observer(activation, value.id(), value, out);
      return out;
    },
    attr: () => value.attr(),
    adapter: () => value.adapter(),
    addQualifier: (qualifier) => {
      value.addQualifier(wrapQualifierOnce(qualifier, observer, value.adapter()));
      return watchedAttribute;
    },
    qualify: (vars, obj) => value.qualify(vars, obj),
    qualifyIfPresent: (vars, obj, presenceOnly) => value.qualifyIfPresent(vars, obj, presenceOnly),
    isOptional: () => value.isOptional(),
    resolve: (vars) => value.resolve(vars),
  };
  return watchedAttribute;
}

/**
 * wrapObservedQualifiers instruments qualifiers that were attached before the attribute was decorated.
 */
function wrapObservedQualifiers(attr: Attribute, observer: EvalObserver, adapter: Adapter): void {
  const attrValue = attr as {
    qualifiersValue?: Qualifier[];
  };
  if (!Array.isArray(attrValue.qualifiersValue)) {
    return;
  }
  attrValue.qualifiersValue = attrValue.qualifiersValue.map((qualifier) =>
    wrapQualifierOnce(qualifier, observer, adapter),
  );
}

/**
 * wrapQualifierOnce avoids double-wrapping qualifiers while preserving their observation behavior.
 */
function wrapQualifierOnce(
  qualifier: Qualifier,
  observer: EvalObserver,
  adapter: Adapter,
): Qualifier {
  if (observedQualifierSet.has(qualifier as object)) {
    return qualifier;
  }
  const wrappedQualifier = observeQualifier(qualifier, observer, adapter);
  observedQualifierSet.add(wrappedQualifier as object);
  return wrappedQualifier;
}

/**
 * observeQualifier preserves qualifier behavior while recording intermediate qualification results.
 */
function observeQualifier(
  qualifier: Qualifier,
  observer: EvalObserver,
  adapter: Adapter,
): Qualifier {
  if (isAttribute(qualifier)) {
    return observeAttributeQualifier(qualifier, observer, adapter);
  }
  if (isConstantQualifier(qualifier)) {
    return observeConstantQualifier(qualifier, observer, adapter);
  }
  return observePlainQualifier(qualifier, observer, adapter);
}

/**
 * observeConstantQualifier records results for constant qualifiers while preserving constant access.
 */
function observeConstantQualifier(
  qualifier: ConstantQualifier,
  observer: EvalObserver,
  adapter: Adapter,
): ConstantQualifier {
  return {
    id: () => qualifier.id(),
    isOptional: () => qualifier.isOptional(),
    qualify: (vars, obj) => {
      try {
        const out = qualifier.qualify(vars, obj);
        observer(vars, qualifier.id(), qualifier, adapter.nativeToValue(out));
        return out;
      } catch (error) {
        observer(vars, qualifier.id(), qualifier, labelErrNode(qualifier.id(), wrapErr(error)));
        throw error;
      }
    },
    qualifyIfPresent: (vars, obj, presenceOnly) => {
      try {
        const result = qualifier.qualifyIfPresent(vars, obj, presenceOnly);
        const present = result !== qualifierAbsent;
        const out = present ? result : undefined;
        observeConditionalQualification({
          adapter,
          observer,
          vars,
          qualifier,
          out,
          present,
          presenceOnly,
        });
        return result;
      } catch (error) {
        observer(vars, qualifier.id(), qualifier, labelErrNode(qualifier.id(), wrapErr(error)));
        throw error;
      }
    },
    value: () => qualifier.value(),
  };
}

/**
 * observeAttributeQualifier records results for attribute-backed qualifiers while preserving attribute APIs.
 */
function observeAttributeQualifier(
  qualifier: Attribute,
  observer: EvalObserver,
  adapter: Adapter,
): Attribute {
  const watchedQualifier: Attribute = {
    id: () => qualifier.id(),
    isOptional: () => qualifier.isOptional(),
    addQualifier: (nestedQualifier) => {
      qualifier.addQualifier(observeQualifier(nestedQualifier, observer, adapter));
      return watchedQualifier;
    },
    resolve: (vars) => qualifier.resolve(vars),
    qualify: (vars, obj) => {
      try {
        const out = qualifier.qualify(vars, obj);
        observer(vars, qualifier.id(), qualifier, adapter.nativeToValue(out));
        return out;
      } catch (error) {
        observer(vars, qualifier.id(), qualifier, labelErrNode(qualifier.id(), wrapErr(error)));
        throw error;
      }
    },
    qualifyIfPresent: (vars, obj, presenceOnly) => {
      try {
        const result = qualifier.qualifyIfPresent(vars, obj, presenceOnly);
        const present = result !== qualifierAbsent;
        const out = present ? result : undefined;
        observeConditionalQualification({
          adapter,
          observer,
          vars,
          qualifier,
          out,
          present,
          presenceOnly,
        });
        return result;
      } catch (error) {
        observer(vars, qualifier.id(), qualifier, labelErrNode(qualifier.id(), wrapErr(error)));
        throw error;
      }
    },
  };
  return watchedQualifier;
}

/**
 * observePlainQualifier records results for custom qualifier implementations.
 */
function observePlainQualifier(
  qualifier: Qualifier,
  observer: EvalObserver,
  adapter: Adapter,
): Qualifier {
  return {
    id: () => qualifier.id(),
    isOptional: () => qualifier.isOptional(),
    qualify: (vars, obj) => {
      try {
        const out = qualifier.qualify(vars, obj);
        observer(vars, qualifier.id(), qualifier, adapter.nativeToValue(out));
        return out;
      } catch (error) {
        observer(vars, qualifier.id(), qualifier, labelErrNode(qualifier.id(), wrapErr(error)));
        throw error;
      }
    },
    qualifyIfPresent: (vars, obj, presenceOnly) => {
      try {
        const result = qualifier.qualifyIfPresent(vars, obj, presenceOnly);
        const present = result !== qualifierAbsent;
        const out = present ? result : undefined;
        observeConditionalQualification({
          adapter,
          observer,
          vars,
          qualifier,
          out,
          present,
          presenceOnly,
        });
        return result;
      } catch (error) {
        observer(vars, qualifier.id(), qualifier, labelErrNode(qualifier.id(), wrapErr(error)));
        throw error;
      }
    },
  };
}

/**
 * observeConditionalQualification mirrors cel-go's conditional qualifier observation rules.
 */
function observeConditionalQualification(options: ObserveConditionalQualificationOptions): void {
  const { adapter, observer, vars, qualifier, out, present, presenceOnly } = options;
  let observedValue: Val | undefined;
  if (out !== null && out !== undefined) {
    observedValue = adapter.nativeToValue(out);
  } else if (!present && qualifier.isOptional() && !presenceOnly) {
    // Optional selections record optional.none() in eval-state even when the traversal short-circuits.
    observedValue = OptionalNone;
  } else if (presenceOnly) {
    observedValue = new Bool(present);
  }
  if (present || presenceOnly || (!present && qualifier.isOptional() && !presenceOnly)) {
    observer(vars, qualifier.id(), qualifier, observedValue as Val);
  }
}
