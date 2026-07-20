import type { Val } from "../ref/index.js";
import type { Container } from "./container.js";
import type { Indexer } from "./indexer.js";
import type { Iterable } from "./iterator.js";
import type { Sizer } from "./sizer.js";

/**
 * Mapper aggregates the traits of a map.
 */
export interface Mapper extends Val, Container, Indexer, Iterable, Sizer {
  /**
   * Find returns a value, if one exists, for the input key.
   */
  find(key: Val): [Val | undefined, boolean];
}

/**
 * MutableMapper emits an immutable result after an intermediate computation.
 */
export interface MutableMapper extends Mapper {
  /**
   * Insert a key, value pair into the map.
   */
  insert(k: Val, v: Val): Val;
  /**
   * ToImmutableMap converts a mutable map into an immutable map.
   */
  toImmutableMap(): Mapper;
}
