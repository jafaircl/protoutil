/* eslint-disable @typescript-eslint/no-explicit-any */
import { RefVal } from '../../ref/reference.js';
import { isFunction } from '../../utils.js';

/**
 * Sizer interface for supporting 'size()' overloads.
 */
export interface Sizer {
  /**
   * Size returns the number of elements or length of the value.
   */
  size(): RefVal;
}

export function isSizer(value: any): value is Sizer {
  return value && isFunction(value.size);
}
