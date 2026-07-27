import type { Val } from "../common/types/index.js";

/**
 * EvalState tracks the values associated with expression ids during execution.
 */
export interface EvalState {
  /**
   * ids returns the list of ids with recorded values.
   */
  ids(): number[];

  /**
   * value returns the observed value for the expression id, if one has been recorded.
   */
  value(exprId: number): [Val | undefined, boolean];

  /**
   * setValue records the observed value for the expression id.
   */
  setValue(options: EvalStateValueOptions): void;

  /**
   * reset clears the previously recorded expression values.
   */
  reset(): void;
}

/**
 * EvalStateValueOptions configures a value write into EvalState.
 */
export interface EvalStateValueOptions {
  /**
   * exprId identifies the expression node being recorded.
   */
  exprId: number;

  /**
   * value is the observed CEL value for the expression node.
   */
  value: Val | undefined;
}

/**
 * MutableEvalState is the default EvalState implementation.
 */
class MutableEvalState implements EvalState {
  /**
   * valuesValue stores observed values by expression id.
   */
  private valuesValue = new Map<number, Val>();

  /**
   * ids returns all recorded expression ids that currently hold a value.
   */
  public ids(): number[] {
    return [...this.valuesValue.keys()];
  }

  /**
   * value returns the observed value for the expression id.
   */
  public value(exprId: number): [Val | undefined, boolean] {
    const value = this.valuesValue.get(exprId);
    return [value, value !== undefined];
  }

  /**
   * setValue stores or clears the observed value for the expression id.
   */
  public setValue(options: EvalStateValueOptions): void {
    if (options.value === undefined) {
      this.valuesValue.delete(options.exprId);
      return;
    }
    this.valuesValue.set(options.exprId, options.value);
  }

  /**
   * reset clears all recorded expression values.
   */
  public reset(): void {
    this.valuesValue = new Map();
  }
}

/**
 * evalState returns an EvalState instance used to observe intermediate evaluations.
 */
export function evalState(): EvalState {
  return new MutableEvalState();
}
