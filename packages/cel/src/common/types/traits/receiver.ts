import type { Val } from "../ref/index.js";

/**
 * Receiver routes instance method calls within a value.
 */
export interface Receiver {
  /**
   * Receive accepts a function name, overload id, and arguments and returns a value.
   */
  receive(functionName: string, overload: string, args: Val[]): Val;
}
