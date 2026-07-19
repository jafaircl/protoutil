import type { Val } from "../ref/index.js";

/**
 * Container permits containment tests such as 'a in b'.
 */
export interface Container {
  /**
   * Contains returns true if the value exists within the object.
   */
  contains(value: Val): Val;
}
