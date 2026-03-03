/**
 * filter-tree.service.spec.ts
 *
 * Unit tests for FilterTreeService and its helper functions.
 *
 * NOTE ON MUTATION STRATEGY
 * -------------------------
 * The service deep-clones the incoming root before any mutation, so the
 * caller's original tree is guaranteed to be untouched. Tests verify:
 *   1. The returned root is a different object from the input.
 *   2. The input tree's structure is unchanged after each operation.
 *   3. The returned tree has the expected new structure.
 */

import { TestBed } from "@angular/core/testing";
import { createFilterBranchNode, createFilterLeafNode, type FilterNode } from "./filter-node.model";
import { enforceMinChildren, type FilterTreeHistory, FilterTreeService, findNode } from "./filter-tree.service";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a leaf with a predictable ID for readability in assertions. */
function leaf(id: string): FilterNode {
  const n = createFilterLeafNode(undefined as any);
  (n as any).id = id;
  return n;
}

/** Build a branch with a predictable ID. */
function branch(
  id: string,
  children: FilterNode[],
  conjunction: "_&&_" | "_||_" = "_&&_",
): FilterNode {
  const n = createFilterBranchNode(children, conjunction);
  (n as any).id = id;
  return n;
}

/**
 * Capture a lightweight structural snapshot of a tree.
 * Used to assert the original tree was NOT mutated after a service call.
 */
interface TreeSnapshot {
  id: string;
  conjunction?: "_&&_" | "_||_";
  children: TreeSnapshot[];
}

function snapshot(node: FilterNode): TreeSnapshot {
  return {
    id: node.id,
    conjunction: node.conjunction,
    children: node.children.map(snapshot),
  };
}

// ---------------------------------------------------------------------------
// enforceMinChildren
// ---------------------------------------------------------------------------

describe("enforceMinChildren", () => {
  it("leaves a valid tree unchanged", () => {
    const root = branch("root", [branch("b1", [leaf("l1"), leaf("l2")]), leaf("l3")]);
    enforceMinChildren(root, true);
    expect(root.children.length).toBe(2);
    expect(root.children[0].children.length).toBe(2);
  });

  it("hoists sole child of a non-root branch into the parent", () => {
    const root = branch("root", [branch("b1", [leaf("l1")]), leaf("l2")]);
    enforceMinChildren(root);
    // b1 should be gone; l1 should be at root level
    expect(root.children.map((c) => c.id)).toEqual(["l1", "l2"]);
  });

  it("recursively flattens nested single-child branches", () => {
    // root→[b1→[b2→[l1], l2]]
    // Step 1 (bottom-up): b2 has 1 child → hoist l1 → b1 gets [l1, l2]
    // Step 2 (root absorption): root has 1 branch child b1 → absorb → root gets [l1, l2]
    const root = branch("root", [branch("b1", [branch("b2", [leaf("l1")]), leaf("l2")])]);
    enforceMinChildren(root, true);
    expect(root.children.map((c) => c.id)).toEqual(["l1", "l2"]);
  });

  it("removes empty non-root branches", () => {
    const root = branch("root", [branch("empty", []), leaf("l1"), leaf("l2")]);
    enforceMinChildren(root, true);
    expect(root.children.map((c) => c.id)).toEqual(["l1", "l2"]);
  });

  it("does NOT flatten root when its only child is a leaf", () => {
    const root = branch("root", [leaf("l1")]);
    enforceMinChildren(root, true);
    expect(root.children.length).toBe(1);
    expect(root.children[0].id).toBe("l1");
  });

  it("absorbs single branch child into root at any level", () => {
    // root → [b1(OR) → [l1, l2]]
    // root has 1 child that is a branch → absorb: root becomes OR with [l1, l2]
    const root = branch("root", [branch("b1", [leaf("l1"), leaf("l2")], "_||_")]);
    enforceMinChildren(root, true);
    expect(root.conjunction).toBe("_||_");
    expect(root.children.map((c) => c.id)).toEqual(["l1", "l2"]);
  });

  it("absorbs single branch child at non-root level", () => {
    // root → [b1 → [b2(OR) → [l1, l2]], l3]
    // b1 has 1 child b2 that is a branch → absorb b2 into b1
    const root = branch("root", [
      branch("b1", [branch("b2", [leaf("l1"), leaf("l2")], "_||_")]),
      leaf("l3"),
    ]);
    enforceMinChildren(root, true);
    const b1 = findNode(root, "b1")!;
    expect(b1.conjunction).toBe("_||_");
    expect(b1.children.map((c) => c.id)).toEqual(["l1", "l2"]);
  });

  it("preserves conjunction when absorbing single branch child", () => {
    // root→[b1(OR)→[l1,l2]]: b1 absorbed into root, conjunction preserved on root
    const root = branch("root", [branch("b1", [leaf("l1"), leaf("l2")], "_||_")]);
    enforceMinChildren(root, true);
    expect(root.conjunction).toBe("_||_");
    expect(root.children.map((c) => c.id)).toEqual(["l1", "l2"]);
  });
});

// ---------------------------------------------------------------------------
// FilterTreeService.toggleConjunction
// ---------------------------------------------------------------------------

describe("FilterTreeService.toggleConjunction", () => {
  let service: FilterTreeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FilterTreeService);
  });

  it("toggles _&&_ to _||_", () => {
    const root = branch("root", [leaf("l1"), leaf("l2")], "_&&_");
    const result = service.toggleConjunction(root, "root");
    expect(result.conjunction).toBe("_||_");
  });

  it("toggles _||_ back to _&&_", () => {
    const root = branch("root", [leaf("l1"), leaf("l2")], "_||_");
    const result = service.toggleConjunction(root, "root");
    expect(result.conjunction).toBe("_&&_");
  });

  it("returns a new root object reference (deep clone)", () => {
    const root = branch("root", [leaf("l1"), leaf("l2")], "_&&_");
    const result = service.toggleConjunction(root, "root");
    expect(result).not.toBe(root);
  });

  it("does NOT mutate the original tree", () => {
    const root = branch("root", [leaf("l1"), leaf("l2")], "_&&_");
    const before = snapshot(root);
    service.toggleConjunction(root, "root");
    expect(snapshot(root)).toEqual(before);
    expect(root.conjunction).toBe("_&&_");
  });

  it("toggles a nested branch without affecting root", () => {
    const root = branch("root", [branch("b1", [leaf("l1"), leaf("l2")], "_||_")]);
    const result = service.toggleConjunction(root, "b1");
    const b1 = findNode(result, "b1")!;
    expect(b1.conjunction).toBe("_&&_");
    expect(result.conjunction).toBe("_&&_"); // root unchanged
  });

  it("does NOT mutate the original tree when toggling a nested branch", () => {
    const root = branch("root", [branch("b1", [leaf("l1"), leaf("l2")], "_||_")]);
    const before = snapshot(root);
    service.toggleConjunction(root, "b1");
    expect(snapshot(root)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// applyDrop — into-branch
// ---------------------------------------------------------------------------

describe("FilterTreeService.applyDrop — into-branch", () => {
  let service: FilterTreeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FilterTreeService);
  });

  it("inserts a leaf at the specified index", () => {
    // root [l1, l2, l3] — drag l3 to index 1 → [l1, l3, l2]
    const root = branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]);
    const result = service.applyDrop(root, "l3", {
      kind: "into-branch",
      branchId: "root",
      index: 1,
    });
    expect(result.children.map((c) => c.id)).toEqual(["l1", "l3", "l2"]);
  });

  it("does NOT mutate the original tree", () => {
    const root = branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]);
    const before = snapshot(root);
    service.applyDrop(root, "l3", {
      kind: "into-branch",
      branchId: "root",
      index: 1,
    });
    expect(snapshot(root)).toEqual(before);
  });

  it("moves a leaf from one branch to another", () => {
    const root = branch("root", [
      branch("b1", [leaf("l1"), leaf("l2")]),
      branch("b2", [leaf("l3"), leaf("l4")]),
    ]);
    const result = service.applyDrop(root, "l1", {
      kind: "into-branch",
      branchId: "b2",
      index: 0,
    });
    // b1 now has only l2 — that 1-child branch gets flattened into root
    const ids = result.children.map((c) => c.id);
    expect(ids).toContain("l2"); // l2 hoisted
    const b2 = findNode(result, "b2")!;
    expect(b2.children.map((c) => c.id)).toEqual(["l1", "l3", "l4"]);
  });

  it("does NOT mutate the original tree when moving across branches", () => {
    const root = branch("root", [
      branch("b1", [leaf("l1"), leaf("l2")]),
      branch("b2", [leaf("l3"), leaf("l4")]),
    ]);
    const before = snapshot(root);
    service.applyDrop(root, "l1", {
      kind: "into-branch",
      branchId: "b2",
      index: 0,
    });
    expect(snapshot(root)).toEqual(before);
  });

  it("preserves the target branch's conjunction when moving a leaf into it", () => {
    // root→[b1(OR)→[l1,l2], l3]. Drop l3 into b1 → root→[b1(OR)→[l1,l2,l3]].
    // Root now has 1 branch child → absorbed: root.conjunction=OR, children=[l1,l2,l3].
    const root = branch("root", [branch("b1", [leaf("l1"), leaf("l2")], "_||_"), leaf("l3")]);
    const result = service.applyDrop(root, "l3", {
      kind: "into-branch",
      branchId: "b1",
      index: 2,
    });
    // b1 was absorbed into root — root now has OR conjunction and b1's children
    expect(result.conjunction).toBe("_||_");
    expect(result.children.map((c) => c.id)).toEqual(["l1", "l2", "l3"]);
  });

  it("returns a new root object reference", () => {
    const root = branch("root", [leaf("l1"), leaf("l2")]);
    const result = service.applyDrop(root, "l1", {
      kind: "into-branch",
      branchId: "root",
      index: 1,
    });
    expect(result).not.toBe(root);
  });
});

// ---------------------------------------------------------------------------
// applyDrop — onto-leaf
// ---------------------------------------------------------------------------

describe("FilterTreeService.applyDrop — onto-leaf", () => {
  let service: FilterTreeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FilterTreeService);
  });

  it("wraps dragged leaf + target leaf in a new AND branch", () => {
    // root [l1, l2, l3] — drag l1 onto l2
    const root = branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]);
    const result = service.applyDrop(root, "l1", {
      kind: "onto-leaf",
      leafId: "l2",
    });
    expect(result.children.length).toBe(2);
    const newBranch = result.children[0];
    expect(newBranch.conjunction).toBe("_&&_");
    expect(newBranch.children.map((c) => c.id)).toEqual(["l1", "l2"]);
    expect(result.children[1].id).toBe("l3");
  });

  it("does NOT mutate the original tree", () => {
    const root = branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]);
    const before = snapshot(root);
    service.applyDrop(root, "l1", { kind: "onto-leaf", leafId: "l2" });
    expect(snapshot(root)).toEqual(before);
  });

  it("wraps a branch + a leaf when dragging a branch onto a leaf", () => {
    // root→[b1→[l1,l2], l3]. Drag b1 onto l3 → new AND group G→[b1,l3].
    // Root has 1 branch child G → G absorbed into root.
    // Result: root.conjunction=AND, root.children=[b1, l3].
    const root = branch("root", [branch("b1", [leaf("l1"), leaf("l2")]), leaf("l3")]);
    const result = service.applyDrop(root, "b1", {
      kind: "onto-leaf",
      leafId: "l3",
    });
    expect(result.conjunction).toBe("_&&_");
    expect(result.children.map((c) => c.id)).toContain("b1");
    expect(result.children.map((c) => c.id)).toContain("l3");
  });
});

// ---------------------------------------------------------------------------
// applyDrop — onto-branch-header
// ---------------------------------------------------------------------------

describe("FilterTreeService.applyDrop — onto-branch-header", () => {
  let service: FilterTreeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FilterTreeService);
  });

  it("wraps dragged branch + target branch in a new AND branch", () => {
    // root→[b1→[l1,l2], b2→[l3,l4]]. Drag b1 onto b2 → G(AND)→[b1,b2].
    // Root has 1 branch child G → G absorbed into root.
    // Result: root.conjunction=AND, root.children=[b1,b2].
    const root = branch("root", [
      branch("b1", [leaf("l1"), leaf("l2")]),
      branch("b2", [leaf("l3"), leaf("l4")]),
    ]);
    const result = service.applyDrop(root, "b1", {
      kind: "onto-branch-header",
      branchId: "b2",
    });
    expect(result.conjunction).toBe("_&&_");
    expect(result.children.map((c) => c.id)).toEqual(["b1", "b2"]);
  });

  it("does NOT mutate the original tree", () => {
    const root = branch("root", [
      branch("b1", [leaf("l1"), leaf("l2")]),
      branch("b2", [leaf("l3"), leaf("l4")]),
    ]);
    const before = snapshot(root);
    service.applyDrop(root, "b1", {
      kind: "onto-branch-header",
      branchId: "b2",
    });
    expect(snapshot(root)).toEqual(before);
  });

  it("is a no-op when dropping a branch onto its own header", () => {
    const root = branch("root", [branch("b1", [leaf("l1"), leaf("l2")]), leaf("l3")]);
    const result = service.applyDrop(root, "b1", {
      kind: "onto-branch-header",
      branchId: "b1",
    });
    expect(result.children.length).toBe(2);
    expect(result.children[0].id).toBe("b1");
  });
});

// ---------------------------------------------------------------------------
// deleteNode
// ---------------------------------------------------------------------------

describe("FilterTreeService.deleteNode", () => {
  let service: FilterTreeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FilterTreeService);
  });

  it("removes a leaf from the root", () => {
    const root = branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]);
    const result = service.deleteNode(root, "l2");
    expect(result.children.map((c) => c.id)).toEqual(["l1", "l3"]);
  });

  it("does NOT mutate the original tree", () => {
    const root = branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]);
    const before = snapshot(root);
    service.deleteNode(root, "l2");
    expect(snapshot(root)).toEqual(before);
  });

  it("returns a new root object reference", () => {
    const root = branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]);
    const result = service.deleteNode(root, "l2");
    expect(result).not.toBe(root);
  });

  it("removes a leaf from a nested branch", () => {
    // root→[b1(OR)→[l1, l2], l3]. Delete l1 → b1 collapses → root→[l2, l3]
    const root = branch("root", [
      branch("b1", [leaf("l1"), leaf("l2")], "_||_"),
      leaf("l3"),
    ]);
    const result = service.deleteNode(root, "l1");
    // b1 had 2 children, now has 1 → enforceMinChildren hoists l2 into root
    expect(result.children.map((c) => c.id)).toEqual(["l2", "l3"]);
    expect(findNode(result, "b1")).toBeUndefined();
  });

  it("removes an entire branch (and enforces invariant)", () => {
    // root→[b1→[l1, l2], l3]. Delete b1 → root→[l3]
    const root = branch("root", [
      branch("b1", [leaf("l1"), leaf("l2")]),
      leaf("l3"),
    ]);
    const result = service.deleteNode(root, "b1");
    expect(result.children.map((c) => c.id)).toEqual(["l3"]);
    expect(findNode(result, "l1")).toBeUndefined();
    expect(findNode(result, "l2")).toBeUndefined();
  });

  it("collapses a 2-child branch down to parent when one child is deleted", () => {
    // root→[b1→[l1, l2], b2→[l3, l4]]. Delete l3 → b2 collapses → root→[b1, l4]
    const root = branch("root", [
      branch("b1", [leaf("l1"), leaf("l2")]),
      branch("b2", [leaf("l3"), leaf("l4")]),
    ]);
    const result = service.deleteNode(root, "l3");
    expect(findNode(result, "b2")).toBeUndefined();
    expect(result.children.map((c) => c.id)).toEqual(["b1", "l4"]);
  });

  it("absorbs single remaining branch child into root after delete", () => {
    // root→[b1(OR)→[l1, l2], l3]. Delete l3 → root has 1 branch child → absorbed.
    // Result: root.conjunction=OR, root.children=[l1, l2]
    const root = branch("root", [
      branch("b1", [leaf("l1"), leaf("l2")], "_||_"),
      leaf("l3"),
    ]);
    const result = service.deleteNode(root, "l3");
    expect(result.conjunction).toBe("_||_");
    expect(result.children.map((c) => c.id)).toEqual(["l1", "l2"]);
  });

  it("returns the original root for an unknown nodeId (no-op)", () => {
    const root = branch("root", [leaf("l1"), leaf("l2")]);
    const result = service.deleteNode(root, "nonexistent");
    expect(result).toBe(root);
  });

  it("handles deleting the last leaf in a nested branch (cascading collapse)", () => {
    // root→[b1→[b2→[l1, l2], l3], l4]. Delete l1 and l2 sequentially.
    // After deleting l1: b2 collapses → b1→[l2, l3]
    const root = branch("root", [
      branch("b1", [branch("b2", [leaf("l1"), leaf("l2")]), leaf("l3")]),
      leaf("l4"),
    ]);
    const afterFirst = service.deleteNode(root, "l1");
    // b2 had 2 children, now has 1 → collapses: b1→[l2, l3]
    expect(findNode(afterFirst, "b2")).toBeUndefined();
    const b1 = findNode(afterFirst, "b1")!;
    expect(b1.children.map((c) => c.id)).toEqual(["l2", "l3"]);

    // Now delete l2 from the result → b1→[l3] → b1 collapses → root→[l3, l4]
    const afterSecond = service.deleteNode(afterFirst, "l2");
    expect(findNode(afterSecond, "b1")).toBeUndefined();
    expect(afterSecond.children.map((c) => c.id)).toEqual(["l3", "l4"]);
  });

  it("leaves root with empty children when all leaves are deleted", () => {
    const root = branch("root", [leaf("l1")]);
    const result = service.deleteNode(root, "l1");
    expect(result.children.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// findNode
// ---------------------------------------------------------------------------

describe("findNode", () => {
  it("finds the root itself", () => {
    const root = branch("root", []);
    expect(findNode(root, "root")).toBe(root);
  });

  it("finds a deeply nested node", () => {
    const deep = leaf("deep");
    const root = branch("root", [branch("b1", [branch("b2", [deep, leaf("x")])])]);
    expect(findNode(root, "deep")).toBe(deep);
  });

  it("returns undefined for an unknown id", () => {
    const root = branch("root", [leaf("l1")]);
    expect(findNode(root, "nobody")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

describe("FilterTreeService — undo / redo", () => {
  let service: FilterTreeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FilterTreeService);
  });

  // -- initHistory ----------------------------------------------------------

  it("initHistory creates a single-entry stack at index 0", () => {
    const root = branch("root", [leaf("l1")]);
    const h = service.initHistory(root);
    expect(h.stack.length).toBe(1);
    expect(h.index).toBe(0);
    expect(service.currentRoot(h)).toBe(root);
  });

  // -- commitState ----------------------------------------------------------

  it("commitState pushes a new state and advances the index", () => {
    const s0 = branch("root", [leaf("l1")]);
    const s1 = branch("root", [leaf("l1"), leaf("l2")]);
    let h = service.initHistory(s0);
    h = service.commitState(h, s1);
    expect(h.stack.length).toBe(2);
    expect(h.index).toBe(1);
    expect(service.currentRoot(h)).toBe(s1);
  });

  it("commitState truncates redo states when committing after an undo", () => {
    const s0 = branch("root", [leaf("l1")]);
    const s1 = branch("root", [leaf("l1"), leaf("l2")]);
    const s2 = branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]);
    const s3 = branch("root", [leaf("l4")]);

    let h = service.initHistory(s0);
    h = service.commitState(h, s1);
    h = service.commitState(h, s2);
    // undo back to s1
    h = service.undo(h)!;
    // commit s3 — s2 should be discarded
    h = service.commitState(h, s3);
    expect(h.stack.length).toBe(3); // s0, s1, s3
    expect(service.currentRoot(h)).toBe(s3);
    // redo should be impossible — s2 was truncated
    expect(service.canRedo(h)).toBe(false);
  });

  // -- undo -----------------------------------------------------------------

  it("undo steps back one state", () => {
    const s0 = branch("root", [leaf("l1")]);
    const s1 = branch("root", [leaf("l1"), leaf("l2")]);
    let h = service.initHistory(s0);
    h = service.commitState(h, s1);
    h = service.undo(h)!;
    expect(h.index).toBe(0);
    expect(service.currentRoot(h)).toBe(s0);
  });

  it("undo returns null when already at the beginning", () => {
    const h = service.initHistory(branch("root", [leaf("l1")]));
    expect(service.undo(h)).toBeNull();
  });

  it("undo does not mutate the history object", () => {
    const s0 = branch("root", [leaf("l1")]);
    const s1 = branch("root", [leaf("l1"), leaf("l2")]);
    let h = service.initHistory(s0);
    h = service.commitState(h, s1);
    const before: FilterTreeHistory = { stack: h.stack, index: h.index };
    service.undo(h);
    expect(h.index).toBe(before.index);
    expect(h.stack).toBe(before.stack);
  });

  // -- redo -----------------------------------------------------------------

  it("redo steps forward one state", () => {
    const s0 = branch("root", [leaf("l1")]);
    const s1 = branch("root", [leaf("l1"), leaf("l2")]);
    let h = service.initHistory(s0);
    h = service.commitState(h, s1);
    h = service.undo(h)!;
    h = service.redo(h)!;
    expect(h.index).toBe(1);
    expect(service.currentRoot(h)).toBe(s1);
  });

  it("redo returns null when already at the end", () => {
    const s0 = branch("root", [leaf("l1")]);
    const s1 = branch("root", [leaf("l1"), leaf("l2")]);
    let h = service.initHistory(s0);
    h = service.commitState(h, s1);
    expect(service.redo(h)).toBeNull();
  });

  it("redo does not mutate the history object", () => {
    const s0 = branch("root", [leaf("l1")]);
    const s1 = branch("root", [leaf("l1"), leaf("l2")]);
    let h = service.initHistory(s0);
    h = service.commitState(h, s1);
    h = service.undo(h)!;
    const before: FilterTreeHistory = { stack: h.stack, index: h.index };
    service.redo(h);
    expect(h.index).toBe(before.index);
    expect(h.stack).toBe(before.stack);
  });

  // -- canUndo / canRedo ----------------------------------------------------

  it("canUndo is false on a fresh history", () => {
    const h = service.initHistory(branch("root", [leaf("l1")]));
    expect(service.canUndo(h)).toBe(false);
  });

  it("canUndo is true after a commit", () => {
    let h = service.initHistory(branch("root", [leaf("l1")]));
    h = service.commitState(h, branch("root", [leaf("l2")]));
    expect(service.canUndo(h)).toBe(true);
  });

  it("canRedo is false at the end of the stack", () => {
    let h = service.initHistory(branch("root", [leaf("l1")]));
    h = service.commitState(h, branch("root", [leaf("l2")]));
    expect(service.canRedo(h)).toBe(false);
  });

  it("canRedo is true after an undo", () => {
    let h = service.initHistory(branch("root", [leaf("l1")]));
    h = service.commitState(h, branch("root", [leaf("l2")]));
    h = service.undo(h)!;
    expect(service.canRedo(h)).toBe(true);
  });

  // -- round-trip -----------------------------------------------------------

  it("multiple undo then redo restores the latest state", () => {
    const s0 = branch("root", [leaf("l1")]);
    const s1 = branch("root", [leaf("l1"), leaf("l2")]);
    const s2 = branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]);

    let h = service.initHistory(s0);
    h = service.commitState(h, s1);
    h = service.commitState(h, s2);

    // undo twice to s0
    h = service.undo(h)!;
    h = service.undo(h)!;
    expect(service.currentRoot(h)).toBe(s0);

    // redo twice back to s2
    h = service.redo(h)!;
    h = service.redo(h)!;
    expect(service.currentRoot(h)).toBe(s2);
  });
});