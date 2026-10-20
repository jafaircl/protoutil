/**
 * Zeroer tests whether a CEL value is a zero value for its type.
 */
export interface Zeroer {
  /**
   * IsZeroValue indicates whether the object is the zero value for the type.
   */
  isZeroValue(): boolean;
}
