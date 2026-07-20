import type { Val } from "./types/ref/index.js";

/**
 * UnaryOp is a function that takes a single value and produces an output.
 */
export type UnaryOp = (value: Val) => Val;

/**
 * BinaryOp is a function that takes two values and produces an output.
 */
export type BinaryOp = (left: Val, right: Val) => Val;

/**
 * FunctionOp is a function that accepts zero or more arguments and produces a value.
 */
export type FunctionOp = (...args: Val[]) => Val;

/**
 * AsyncOp is a function that accepts zero or more arguments and produces a value asynchronously.
 */
export type AsyncOp = (signal: AbortSignal, ...args: Val[]) => Promise<Val>;

/**
 * BlockingAsyncOp is a function that accepts zero or more arguments and blocks until complete.
 */
export type BlockingAsyncOp = (signal: AbortSignal, ...args: Val[]) => Val;

/**
 * Overload defines a named overload of a function.
 */
export interface Overload {
  /** Operator name as written in an expression or defined within operators. */
  operator: string;
  /** Operand trait used to dispatch the call. */
  operandTrait: number;
  /** Unary defines the overload with a UnaryOp implementation. */
  unary?: UnaryOp;
  /** Binary defines the overload with a BinaryOp implementation. */
  binary?: BinaryOp;
  /** Function defines the overload with a FunctionOp implementation. */
  func?: FunctionOp;
  /** Async defines the overload with an AsyncOp implementation. */
  async?: AsyncOp;
  /** NonStrict specifies whether the overload tolerates error and unknown arguments. */
  nonStrict: boolean;
}
