import type { Val } from "../ref/index.js";

/**
 * FieldTester indicates if a defined field on an object type is set to a non-default value.
 */
export interface FieldTester {
  /**
   * IsSet returns true if the field is defined and set to a non-default value.
   */
  isSet(field: Val): Val;
}
