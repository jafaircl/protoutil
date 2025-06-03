/* eslint-disable @typescript-eslint/no-explicit-any */
import { RefVal } from '../../ref/reference.js';
import { isFunction } from '../../utils.js';

/**
 * Container interface which permits containment tests such as 'a in b'.
 */
export interface Container {
  /**
   * Contains returns true if the value exists within the object.
   */
  contains(value: RefVal): RefVal;
}

export function isContainer(value: any): value is Container {
  return value && isFunction(value.contains);
}
