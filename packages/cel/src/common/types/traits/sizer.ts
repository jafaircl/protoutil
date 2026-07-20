import type { Val } from "../ref/index.js";

/**
 * Sizer supports the size() method.
 */
export interface Sizer {
  /**
   * Size returns the number of elements or length of the value.
   */
  size(): Val;
}
