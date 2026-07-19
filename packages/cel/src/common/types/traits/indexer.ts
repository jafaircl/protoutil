import type { Val } from "../ref/index.js";

/**
 * Indexer permits random access of elements by index 'a[b()]'.
 */
export interface Indexer {
  /**
   * Get the value at the specified index or error.
   */
  get(index: Val): Val;
}
