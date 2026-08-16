import { safeAddUint32 } from "./overflow.js";
import type { Folder } from "./traits/index.js";

/**
 * AggregateSizer calculates the recursive element size of values.
 */
export interface AggregateSizer {
  /**
   * aggregateSize returns the size of the input value, if known. Otherwise a unit size of 1 is
   * returned.
   */
  aggregateSize(value: unknown): number;
}

/**
 * AggregateSizeVisitor is implemented by values capable of reporting their total recursive
 * element count.
 */
export interface AggregateSizeVisitor {
  /**
   * aggregateSize returns the total count of nested atomic elements, saturating at MAX_UINT32.
   */
  aggregateSize(sizer: AggregateSizer): number;
}

/**
 * isAggregateSizeVisitor reports whether a value can compute its own aggregate size.
 */
export function isAggregateSizeVisitor(value: unknown): value is AggregateSizeVisitor {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AggregateSizeVisitor).aggregateSize === "function"
  );
}

/**
 * FoldableAggregateSizer accumulates the aggregate size of every key and value in a foldable.
 */
export class FoldableAggregateSizer implements Folder {
  public total = 1;

  constructor(private readonly sizer: AggregateSizer) {}

  public foldEntry(key: unknown, value: unknown): boolean {
    this.total = safeAddUint32(this.total, this.sizer.aggregateSize(key));
    this.total = safeAddUint32(this.total, this.sizer.aggregateSize(value));
    return true;
  }
}
