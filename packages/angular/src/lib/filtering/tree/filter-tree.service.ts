/**
 * filter-tree.service.ts
 *
 * Tree-manipulation helpers used by the filter-tree component.
 *
 * MUTATION STRATEGY
 * -----------------
 * Every public method deep-clones the incoming root before mutating
 * anything. This guarantees the caller's original reference is never
 * touched, which is critical for the component's change-detection:
 *
 *   const before = this.root();
 *   const after  = this.treeService.applyDrop(before, …);
 *   if (treesEqual(before, after)) return;   // ← works correctly
 *
 * Internal helpers (extractNode, replaceInChildren, enforceMinChildren)
 * mutate the cloned tree in place for simplicity — since the clone is
 * a fresh object graph, this is safe.
 *
 * Key invariant: every non-root branch must have >= 2 children. If a branch
 * drops to 1 child after a mutation, enforceMinChildren hoists that sole
 * child into the grandparent at the branch's position. Applied bottom-up
 * after every mutation.
 */

import { Injectable } from "@angular/core";
import { cloneNode, createFilterBranchNode, type FilterNode } from "./filter-node.model";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Describes where a dragged node was dropped relative to a target. */
export type DropPosition =
  | { kind: "into-branch"; branchId: string; index: number }
  | { kind: "onto-leaf"; leafId: string }
  | { kind: "onto-branch-header"; branchId: string };

/** Immutable snapshot of the undo/redo history stack. */
export interface FilterTreeHistory {
  readonly stack: readonly FilterNode[];
  readonly index: number;
}

// ---------------------------------------------------------------------------
// Injectable service (state lives in the component signal)
// ---------------------------------------------------------------------------

@Injectable({ providedIn: "root" })
export class FilterTreeService {
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Apply a drop operation to the tree and return a new root.
   *
   * Deep-clones the incoming root first so the caller's reference is
   * never mutated. All splice / replace operations happen on the clone.
   */
  applyDrop(root: FilterNode, dragId: string, position: DropPosition): FilterNode {
    // 0. Guard: dropping a branch onto its own header is a no-op.
    //    Check BEFORE cloning — otherwise we'd do work for nothing.
    if (position.kind === "onto-branch-header" && position.branchId === dragId) return root;

    // Deep-clone so all mutations below are isolated from the caller.
    const tree = cloneNode(root);

    // 1. Extract the dragged node from wherever it currently lives.
    //
    // For "into-branch" drops: the snapshot index was computed while the
    // dragged node was still in the tree. If the dragged node lives in the
    // same branch as the drop target AND its current index is less than the
    // target index, extracting it shifts every subsequent child down by one,
    // so we must decrement the target index by one to compensate.
    let insertIndex = position.kind === "into-branch" ? position.index : 0;
    if (position.kind === "into-branch") {
      const targetBranch = findNode(tree, position.branchId);
      const draggedIndexInBranch = targetBranch?.children.findIndex((c) => c.id === dragId) ?? -1;
      if (draggedIndexInBranch !== -1 && draggedIndexInBranch < position.index) {
        insertIndex = position.index - 1;
      }
    }

    const dragged = extractNode(tree, dragId);
    if (!dragged) return root; // node not found — no-op

    // 2. Insert at the target position.
    switch (position.kind) {
      case "into-branch":
        this._dropIntoBranch(tree, dragged, position.branchId, insertIndex);
        break;
      case "onto-leaf":
        this._dropOntoLeaf(tree, dragged, position.leafId);
        break;
      case "onto-branch-header":
        this._dropOntoBranchHeader(tree, dragged, position.branchId);
        break;
    }

    // 3. Enforce >=2-children invariant on all non-root branches.
    enforceMinChildren(tree);

    return tree;
  }

  /**
   * Toggle a branch's conjunction between "_&&_" and "_||_".
   * Deep-clones the tree first so the original is never mutated.
   */
  toggleConjunction(root: FilterNode, branchId: string): FilterNode {
    const tree = cloneNode(root);
    const target = findNode(tree, branchId);
    if (target?.conjunction) {
      target.conjunction = target.conjunction === "_&&_" ? "_||_" : "_&&_";
    }
    return tree;
  }

  /**
   * Delete a node from the tree by ID.
   *
   * Deep-clones the tree first, extracts the target node from the clone,
   * enforces the >=2-children invariant, then returns the clone.
   */
  deleteNode(root: FilterNode, nodeId: string): FilterNode {
    const tree = cloneNode(root);
    const removed = extractNode(tree, nodeId);
    if (!removed) return root; // node not found — no-op
    enforceMinChildren(tree);
    return tree;
  }

  // -------------------------------------------------------------------------
  // Undo / Redo
  // -------------------------------------------------------------------------

  /** Create a fresh history with a single initial state. */
  initHistory(root: FilterNode): FilterTreeHistory {
    return { stack: [root], index: 0 };
  }

  /**
   * Push a new tree state onto the history stack.
   * Truncates any redo states beyond the current index.
   */
  commitState(history: FilterTreeHistory, newRoot: FilterNode): FilterTreeHistory {
    const stack = history.stack.slice(0, history.index + 1);
    stack.push(newRoot);
    return { stack, index: stack.length - 1 };
  }

  /** Step back one state. Returns null if already at the beginning. */
  undo(history: FilterTreeHistory): FilterTreeHistory | null {
    if (history.index <= 0) return null;
    return { stack: history.stack, index: history.index - 1 };
  }

  /** Step forward one state. Returns null if already at the end. */
  redo(history: FilterTreeHistory): FilterTreeHistory | null {
    if (history.index >= history.stack.length - 1) return null;
    return { stack: history.stack, index: history.index + 1 };
  }

  /** The tree at the current history position. */
  currentRoot(history: FilterTreeHistory): FilterNode {
    return history.stack[history.index] as FilterNode;
  }

  canUndo(history: FilterTreeHistory): boolean {
    return history.index > 0;
  }

  canRedo(history: FilterTreeHistory): boolean {
    return history.index < history.stack.length - 1;
  }

  // -------------------------------------------------------------------------
  // Private drop handlers (mutate the tree in place)
  // -------------------------------------------------------------------------

  /**
   * Insert dragged into a branch's children at index.
   */
  private _dropIntoBranch(
    root: FilterNode,
    dragged: FilterNode,
    branchId: string,
    index: number,
  ): void {
    const branch = findNode(root, branchId);
    if (!branch) return;
    const i = Math.max(0, Math.min(index, branch.children.length));
    branch.children.splice(i, 0, dragged);
  }

  /**
   * Drop a node ONTO a leaf — wraps both in a new _&&_ branch at the leaf's position.
   * The dragged node is placed first, target leaf second.
   * New branches always start as AND (per spec).
   */
  private _dropOntoLeaf(root: FilterNode, dragged: FilterNode, leafId: string): void {
    replaceInChildren(root, leafId, (leaf) => createFilterBranchNode([dragged, leaf], "_&&_"));
  }

  /**
   * Drop a node onto a branch's HEADER — wraps both in a new _&&_ branch.
   * Guard: dropping onto own header is a no-op.
   */
  private _dropOntoBranchHeader(
    root: FilterNode,
    dragged: FilterNode,
    targetBranchId: string,
  ): void {
    if (dragged.id === targetBranchId) return;
    replaceInChildren(root, targetBranchId, (targetBranch) =>
      createFilterBranchNode([dragged, targetBranch], "_&&_"),
    );
  }
}

// ---------------------------------------------------------------------------
// Tree-traversal utilities (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Find a node anywhere in the tree by ID.
 * Returns a direct mutable reference into the tree.
 */
export function findNode(root: FilterNode, id: string): FilterNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Remove the node with `id` from the tree (splices it out of its parent's
 * children array). Returns the removed node, or undefined if not found.
 */
function extractNode(root: FilterNode, id: string): FilterNode | undefined {
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].id === id) {
      return root.children.splice(i, 1)[0];
    }
    const found = extractNode(root.children[i], id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Find the child with `id` at any level under `node` and replace it in-place
 * with the return value of replacer. Returns true if a replacement was made.
 */
function replaceInChildren(
  node: FilterNode,
  id: string,
  replacer: (found: FilterNode) => FilterNode,
): boolean {
  for (let i = 0; i < node.children.length; i++) {
    if (node.children[i].id === id) {
      node.children[i] = replacer(node.children[i]);
      return true;
    }
    if (replaceInChildren(node.children[i], id, replacer)) return true;
  }
  return false;
}

/**
 * Recursively enforce the >=2-children invariant on all NON-ROOT branches.
 *
 * Applied bottom-up (deepest first) so that flattening propagates upward:
 * hoisting a grandchild may cause the parent to also drop to 1 child, which
 * the next level up will then catch.
 *
 * Empty non-root branches are also removed (can occur when both children of a
 * branch are deleted or dragged out).
 */
export function enforceMinChildren(node: FilterNode): void {
  // Recurse into children first (bottom-up).
  for (const child of node.children) {
    enforceMinChildren(child);
  }

  // Flatten invalid branch children (empty or single-child) until stable.
  flattenChildren(node);

  // Any branch (including root) that has exactly 1 child which is itself a
  // branch → absorb: pull up the grandchildren and adopt the child's conjunction.
  // Exception: root with a single LEAF child is left alone (nothing to absorb).
  // The while loop handles cascading (e.g. root→A→B→[l1,l2] all collapse).
  while (node.children.length === 1 && typeof node.children[0].conjunction === "string") {
    const only = node.children[0];
    node.conjunction = only.conjunction;
    node.children = only.children;
    // Newly promoted children may themselves need flattening.
    flattenChildren(node);
  }
}

/**
 * Repeatedly flatten `node.children` until no invalid branches remain.
 *
 *   - branch with 0 children → remove
 *   - branch with 1 child    → hoist the grandchild into this level
 *   - everything else         → keep as-is
 *
 * Runs until stable because hoisting may produce new single-child branches.
 */
function flattenChildren(node: FilterNode): void {
  let changed = true;
  while (changed) {
    changed = false;
    node.children = node.children.flatMap((child) => {
      const isBranch = typeof child.conjunction === "string";
      if (isBranch && child.children.length === 0) {
        changed = true;
        return [];
      }
      if (isBranch && child.children.length === 1) {
        changed = true;
        return [child.children[0]];
      }
      return [child];
    });
  }
}
