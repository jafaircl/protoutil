/* eslint-disable @typescript-eslint/no-explicit-any */
import { RefVal } from '../../ref/reference.js';
import { isFunction } from '../../utils.js';

/**
 * Indexer permits random access of elements by index 'a[b()]'.
 */
export interface Indexer {
  /**
   * Get the value at the specified index or error.
   */
  get(index: RefVal): RefVal;
}

export function isIndexer(value: any): value is Indexer {
  return value && isFunction(value.get);
}
