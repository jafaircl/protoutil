import type { Val } from "../ref/index.js";
import type { Container } from "./container.js";
import type { Indexer } from "./indexer.js";
import type { Iterable } from "./iterator.js";
import type { Adder, Sizer } from "./math.js";

/**
 * Lister aggregates the traits of a list.
 */
export interface Lister extends Val, Adder, Container, Indexer, Iterable, Sizer {}

/**
 * MutableLister emits an immutable result after an intermediate computation.
 */
export interface MutableLister extends Lister {
  /**
   * ToImmutableList converts the mutable list into an immutable list.
   */
  toImmutableList(): Lister;
}
