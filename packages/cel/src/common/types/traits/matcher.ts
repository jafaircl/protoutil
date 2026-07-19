import type { Val } from "../ref/index.js";

/**
 * Matcher supports 'matches()' overloads.
 */
export interface Matcher {
  /**
   * Match returns true if the pattern matches the current value.
   */
  match(pattern: Val): Val;
}
