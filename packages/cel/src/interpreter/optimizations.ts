import { Bool, String as CelString, Err } from "../common/types/index.js";
import { compileRegexPattern } from "../common/types/string.js";
import { callInterpretable, type InterpretableCall } from "./interpretable.js";

/**
 * RegexOptimization describes how a constant regular expression call is compiled during planning.
 */
export interface RegexOptimization {
  /**
   * functionName identifies the function to optimize.
   */
  functionName: string;

  /**
   * overloadId optionally narrows the optimization to one overload.
   */
  overloadId?: string;

  /**
   * regexIndex identifies the call argument containing the regular expression.
   */
  regexIndex: number;

  /**
   * factory compiles the pattern and returns the replacement call.
   */
  factory(options: RegexOptimizationFactoryOptions): InterpretableCall;
}

/**
 * RegexOptimizationFactoryOptions configures construction of a compiled regular expression call.
 */
export interface RegexOptimizationFactoryOptions {
  /**
   * call is the original runtime call.
   */
  call: InterpretableCall;

  /**
   * pattern is the constant regular expression pattern.
   */
  pattern: string;
}

/**
 * matchesRegexOptimization optimizes the standard matches function by compiling its pattern once.
 */
export const matchesRegexOptimization: RegexOptimization = {
  functionName: "matches",
  regexIndex: 1,
  factory: ({ call, pattern }) => {
    const compiledRegex = compileRegexPattern(pattern);
    return callInterpretable({
      id: call.id(),
      functionName: call.functionName(),
      overloadId: call.overloadId(),
      args: call.args(),
      impl: (...values) => {
        if (values.length !== 2 || !(values[0] instanceof CelString)) {
          return new Err("no such overload");
        }
        return new Bool(compiledRegex.test(String(values[0].value())));
      },
    });
  },
};
