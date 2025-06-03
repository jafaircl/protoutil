/* eslint-disable @typescript-eslint/no-explicit-any */
import { isFunction } from '../../utils.js';
import { RefVal } from './../../ref/reference.js';

/**
 * Receiver interface for routing instance method calls within a value.
 */
export interface Receiver {
  /**
   * Receive accepts a function name, overload id, and arguments and returns a
   * value.
   */
  receive(fn: string, overload: string, args: RefVal[]): RefVal;
}

export function isReceiver(value: any): value is Receiver {
  return value && isFunction(value.receive);
}
