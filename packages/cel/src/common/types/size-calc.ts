import {
  isReflectList,
  isReflectMap,
  isReflectMessage,
  type ReflectList,
  type ReflectMap,
  type ReflectMessage,
} from "@bufbuild/protobuf/reflect";
import {
  type AggregateSizer,
  FoldableAggregateSizer,
  isAggregateSizeVisitor,
} from "./aggregate-sizer.js";
import { Bool } from "./bool.js";
import { Double } from "./double.js";
import { Duration } from "./duration.js";
import { Err } from "./err.js";
import { Int } from "./int.js";
import { Null } from "./null.js";
import {
  MAX_UINT32,
  safeAddUint32,
  safeUint32FromBigInt,
  safeUint32FromNumber,
} from "./overflow.js";
import type { Val } from "./ref/index.js";
import { Timestamp } from "./timestamp.js";
import type { Foldable, Lister, Mapper, Sizer } from "./traits/index.js";
import { Type } from "./types.js";
import { Uint } from "./uint.js";
import { Unknown } from "./unknown.js";

/** defaultSizeCalculatorMaxDepth bounds how deeply a value graph is traversed. */
const defaultSizeCalculatorMaxDepth = 5;

/** defaultSizeCalculatorMaxTraversal bounds how many nodes a single calculation visits. */
const defaultSizeCalculatorMaxTraversal = 10_000;

/**
 * SizeCalculatorOptions configures a SizeCalculator instance.
 */
export interface SizeCalculatorOptions {
  /** maxDepth is the object depth limit before the result saturates to MAX_UINT32. */
  maxDepth?: number;
  /** maxTraversal is the node traversal limit before the result saturates to MAX_UINT32. */
  maxTraversal?: number;
}

/**
 * SizeCalculator calculates the recursive element size of values.
 *
 * Values which exceed either the depth or the traversal limit report MAX_UINT32 rather than
 * paying for an unbounded walk, so a hostile or cyclic input cannot stall the caller.
 */
export class SizeCalculator implements AggregateSizer {
  private readonly maxDepth: number;
  private readonly maxTraversal: number;

  constructor(options: SizeCalculatorOptions = {}) {
    this.maxDepth = options.maxDepth ?? defaultSizeCalculatorMaxDepth;
    this.maxTraversal = options.maxTraversal ?? defaultSizeCalculatorMaxTraversal;
  }

  /** version returns the calculation version. */
  public version(): number {
    return 0;
  }

  /**
   * aggregateSize returns the recursive element count of the input value.
   */
  public aggregateSize(value: unknown): number {
    return new SizeContext(this.maxDepth, this.maxTraversal, 1, { count: 0 }).aggregateSize(value);
  }
}

/**
 * SizeContext carries the depth and shared traversal budget through one calculation.
 */
class SizeContext implements AggregateSizer {
  constructor(
    private readonly maxDepth: number,
    private readonly maxTraversal: number,
    private readonly depth: number,
    private readonly traversal: { count: number },
  ) {}

  private childContext(): SizeContext {
    return new SizeContext(this.maxDepth, this.maxTraversal, this.depth + 1, this.traversal);
  }

  private visitNode(): boolean {
    this.traversal.count += 1;
    return this.traversal.count <= this.maxTraversal && this.depth <= this.maxDepth;
  }

  public aggregateSize(value: unknown): number {
    if (!this.visitNode()) {
      return MAX_UINT32;
    }
    if (isAggregateSizeVisitor(value)) {
      return value.aggregateSize(this.childContext());
    }
    if (isFoldable(value)) {
      const folder = new FoldableAggregateSizer(this.childContext());
      value.fold(folder);
      return folder.total;
    }
    if (isMapper(value)) {
      return this.sizeOfMapper(value);
    }
    if (isLister(value)) {
      return this.sizeOfLister(value);
    }
    if (isSizer(value)) {
      const size = value.size();
      return size instanceof Int ? safeUint32FromBigInt(size.value()) : 1;
    }
    if (isScalarVal(value)) {
      return 1;
    }
    if (isVal(value)) {
      return this.aggregateSize(value.value());
    }
    return this.sizeOfNative(value);
  }

  private sizeOfMapper(value: Mapper): number {
    const child = this.childContext();
    const iterator = value.iterator();
    let total = 1;
    while ((iterator.hasNext() as Bool).value() === true) {
      const key = iterator.next();
      total = safeAddUint32(total, child.aggregateSize(key));
      total = safeAddUint32(total, child.aggregateSize(value.find(key)));
    }
    return total;
  }

  private sizeOfLister(value: Lister): number {
    const child = this.childContext();
    const iterator = value.iterator();
    let total = 1;
    while ((iterator.hasNext() as Bool).value() === true) {
      total = safeAddUint32(total, child.aggregateSize(iterator.next()));
    }
    return total;
  }

  /**
   * sizeOfNative measures plain JavaScript and protobuf-es values.
   *
   * Upstream reaches these through Go reflection; the port inspects native shapes directly.
   */
  private sizeOfNative(value: unknown): number {
    if (value === null || value === undefined) {
      return 1;
    }
    if (typeof value === "string") {
      // Count code points rather than UTF-16 units so the result matches CEL string size.
      return safeUint32FromNumber([...value].length);
    }
    if (value instanceof Uint8Array) {
      return safeUint32FromNumber(value.length);
    }
    if (
      typeof value === "number" ||
      typeof value === "bigint" ||
      typeof value === "boolean" ||
      value instanceof Date
    ) {
      return 1;
    }
    const child = this.childContext();
    if (Array.isArray(value)) {
      let total = 1;
      for (const element of value) {
        total = safeAddUint32(total, child.aggregateSize(element));
      }
      return total;
    }
    if (value instanceof Map) {
      let total = 1;
      for (const [key, entry] of value) {
        total = safeAddUint32(total, child.aggregateSize(key));
        total = safeAddUint32(total, child.aggregateSize(entry));
      }
      return total;
    }
    if (value instanceof Set) {
      let total = 1;
      for (const element of value) {
        total = safeAddUint32(total, child.aggregateSize(element));
      }
      return total;
    }
    if (isReflectMessage(value)) {
      return this.sizeOfReflectMessage(value, child);
    }
    if (isReflectList(value)) {
      return this.sizeOfReflectList(value, child);
    }
    if (isReflectMap(value)) {
      return this.sizeOfReflectMap(value, child);
    }
    if (typeof value === "object") {
      return this.sizeOfPlainObject(value as Record<string, unknown>, child);
    }
    return 1;
  }

  /**
   * sizeOfReflectMessage sums only the fields a message actually sets.
   *
   * Iterating the plain message object instead would count every proto3 scalar default, since
   * protobuf-es materializes those on the object.
   */
  private sizeOfReflectMessage(value: ReflectMessage, child: SizeContext): number {
    let total = 1;
    for (const field of value.desc.fields) {
      if (!value.isSet(field)) {
        continue;
      }
      total = safeAddUint32(total, child.aggregateSize(value.get(field)));
    }
    return total;
  }

  private sizeOfReflectList(value: ReflectList, child: SizeContext): number {
    let total = 1;
    for (const element of value) {
      total = safeAddUint32(total, child.aggregateSize(element));
    }
    return total;
  }

  private sizeOfReflectMap(value: ReflectMap, child: SizeContext): number {
    let total = 1;
    for (const [key, entry] of value) {
      total = safeAddUint32(total, child.aggregateSize(key));
      total = safeAddUint32(total, child.aggregateSize(entry));
    }
    return total;
  }

  /**
   * sizeOfPlainObject sums the own properties of a native object.
   *
   * `$`-prefixed keys are protobuf-es bookkeeping rather than user data, and absent properties
   * carry no size.
   */
  private sizeOfPlainObject(value: Record<string, unknown>, child: SizeContext): number {
    let total = 1;
    for (const [key, entry] of Object.entries(value)) {
      if (key.startsWith("$") || entry === undefined || entry === null) {
        continue;
      }
      total = safeAddUint32(total, child.aggregateSize(entry));
    }
    return total;
  }
}

/**
 * isScalarVal reports whether a CEL value is atomic and therefore has a size of one.
 */
function isScalarVal(value: unknown): boolean {
  return (
    value instanceof Bool ||
    value instanceof Int ||
    value instanceof Uint ||
    value instanceof Double ||
    value instanceof Duration ||
    value instanceof Timestamp ||
    value instanceof Null ||
    value instanceof Type ||
    value instanceof Err ||
    value instanceof Unknown
  );
}

function isFoldable(value: unknown): value is Foldable {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Foldable).fold === "function" &&
    // Lists and maps are foldable but are measured through their richer trait paths.
    !isLister(value) &&
    !isMapper(value)
  );
}

function isMapper(value: unknown): value is Mapper {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Mapper).find === "function" &&
    typeof (value as Mapper).iterator === "function"
  );
}

function isLister(value: unknown): value is Lister {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Lister).iterator === "function" &&
    typeof (value as Lister).contains === "function" &&
    typeof (value as Lister).get === "function" &&
    !isMapper(value)
  );
}

function isSizer(value: unknown): value is Sizer {
  return typeof value === "object" && value !== null && typeof (value as Sizer).size === "function";
}

function isVal(value: unknown): value is Val {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Val).value === "function" &&
    typeof (value as Val).type === "function"
  );
}
