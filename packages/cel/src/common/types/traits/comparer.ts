import type { Val } from "../ref/index.js";

/**
 * Comparer provides ordering comparisons between values.
 */
export interface Comparer {
  /**
   * Compare this value to the input other value.
   */
  compare(other: Val): Val;
}
