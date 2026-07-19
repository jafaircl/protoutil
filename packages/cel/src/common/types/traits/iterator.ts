import type { Val } from "../ref/index.js";

/**
 * Iterable aggregate types permit traversal over their elements.
 */
export interface Iterable {
  /**
   * Iterator returns a new iterator view of the struct.
   */
  iterator(): Iterator;
}

/**
 * Iterator permits safe traversal over the contents of an aggregate type.
 */
export interface Iterator extends Val {
  /**
   * HasNext returns true if there are unvisited elements in the Iterator.
   */
  hasNext(): Val;
  /**
   * Next returns the next element.
   */
  next(): Val;
}

/**
 * Foldable aggregate types support iteration over (key, value) or (index, value) pairs.
 */
export interface Foldable {
  /**
   * Fold invokes the Folder.foldEntry for all entries in the type.
   */
  fold(folder: Folder): void;
}

/**
 * Folder performs a fold on a given entry and indicates whether to continue folding.
 */
export interface Folder {
  /**
   * FoldEntry indicates the key, value pair associated with the entry.
   */
  foldEntry(key: unknown, val: unknown): boolean;
}
