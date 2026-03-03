/**
 * filter-tree.component.spec.ts
 *
 * Unit tests for FilterTreeComponent's undo/redo functionality.
 *
 * These tests exercise the component's history management directly via its
 * public API (undo, redo, canUndo, canRedo) and indirectly via the event
 * handler methods (onConjunctionToggle, onNodeDelete) which push state onto
 * the history stack.
 *
 * Keyboard shortcut tests simulate KeyboardEvent dispatch on the host element.
 */

import { Component, viewChild } from "@angular/core";
import { type ComponentFixture, TestBed } from "@angular/core/testing";
import { createFilterBranchNode, createFilterLeafNode, type FilterNode } from "./filter-node.model";
import { FilterTreeComponent } from "./filter-tree.component";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function leaf(id: string): FilterNode {
  const n = createFilterLeafNode(undefined as any);
  (n as any).id = id;
  return n;
}

function branch(
  id: string,
  children: FilterNode[],
  conjunction: "_&&_" | "_||_" = "_&&_",
): FilterNode {
  const n = createFilterBranchNode(children, conjunction);
  (n as any).id = id;
  return n;
}

/** Dispatch a keyboard event on the given element. */
function pressKey(el: HTMLElement, key: string, opts: Partial<KeyboardEvent> = {}): void {
  el.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...opts,
    }),
  );
}

// ---------------------------------------------------------------------------
// Wrapper component for testing
// ---------------------------------------------------------------------------

@Component({
  standalone: true,
  imports: [FilterTreeComponent],
  template: `<aip-filter-tree
    [initialTree]="tree"
    (treeChange)="lastEmitted = $event"
  />`,
})
class TestHostComponent {
  tree = branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]);
  lastEmitted: FilterNode | null = null;
  filterTree = viewChild.required(FilterTreeComponent);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FilterTreeComponent — undo/redo", () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let comp: FilterTreeComponent;
  let hostEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    host = fixture.componentInstance;
    comp = host.filterTree();
    hostEl = fixture.debugElement.query((de) => de.componentInstance === comp).nativeElement;
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it("starts with canUndo=false and canRedo=false", () => {
    expect(comp.canUndo()).toBe(false);
    expect(comp.canRedo()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // After a mutation
  // -----------------------------------------------------------------------

  it("enables undo after a conjunction toggle", () => {
    comp.onConjunctionToggle("root");
    expect(comp.canUndo()).toBe(true);
    expect(comp.canRedo()).toBe(false);
  });

  it("enables undo after a node delete", () => {
    comp.onNodeDelete("l1");
    expect(comp.canUndo()).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Undo
  // -----------------------------------------------------------------------

  it("undo restores the previous tree state", () => {
    const before = comp.root();
    comp.onConjunctionToggle("root");
    expect(comp.root().conjunction).toBe("_||_");

    comp.undo();
    expect(comp.root().conjunction).toBe("_&&_");
    expect(comp.root().children.map((c) => c.id)).toEqual(before.children.map((c) => c.id));
  });

  it("undo emits treeChange", () => {
    comp.onConjunctionToggle("root");
    host.lastEmitted = null;

    comp.undo();
    expect(host.lastEmitted).not.toBeNull();
    expect(host.lastEmitted!.conjunction).toBe("_&&_");
  });

  it("undo disables canUndo when back to initial state", () => {
    comp.onConjunctionToggle("root");
    comp.undo();
    expect(comp.canUndo()).toBe(false);
  });

  it("undo is a no-op when canUndo is false", () => {
    const root = comp.root();
    comp.undo(); // should do nothing
    expect(comp.root()).toBe(root);
  });

  // -----------------------------------------------------------------------
  // Redo
  // -----------------------------------------------------------------------

  it("enables redo after an undo", () => {
    comp.onConjunctionToggle("root");
    comp.undo();
    expect(comp.canRedo()).toBe(true);
  });

  it("redo restores the undone state", () => {
    comp.onConjunctionToggle("root");
    const toggled = comp.root();
    comp.undo();
    comp.redo();
    expect(comp.root().conjunction).toBe("_||_");
  });

  it("redo emits treeChange", () => {
    comp.onConjunctionToggle("root");
    comp.undo();
    host.lastEmitted = null;

    comp.redo();
    expect(host.lastEmitted).not.toBeNull();
    expect(host.lastEmitted!.conjunction).toBe("_||_");
  });

  it("redo is a no-op when canRedo is false", () => {
    comp.onConjunctionToggle("root");
    const root = comp.root();
    comp.redo(); // already at latest — should do nothing
    expect(comp.root()).toBe(root);
  });

  // -----------------------------------------------------------------------
  // History truncation
  // -----------------------------------------------------------------------

  it("new mutation after undo truncates redo history", () => {
    comp.onConjunctionToggle("root"); // state 1
    comp.onNodeDelete("l1"); // state 2
    comp.undo(); // back to state 1
    expect(comp.canRedo()).toBe(true);

    comp.onNodeDelete("l2"); // new state — should truncate state 2
    expect(comp.canRedo()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Multiple undo/redo
  // -----------------------------------------------------------------------

  it("supports multiple undo/redo steps", () => {
    const initial = comp.root();

    comp.onConjunctionToggle("root"); // 1: toggle to OR
    comp.onNodeDelete("l1"); // 2: delete l1

    // Undo twice
    comp.undo(); // back to state 1 (OR, 3 children)
    expect(comp.root().conjunction).toBe("_||_");
    expect(comp.root().children.length).toBe(3);

    comp.undo(); // back to initial (AND, 3 children)
    expect(comp.root().conjunction).toBe("_&&_");
    expect(comp.root().children.length).toBe(3);

    expect(comp.canUndo()).toBe(false);
    expect(comp.canRedo()).toBe(true);

    // Redo twice
    comp.redo();
    expect(comp.root().conjunction).toBe("_||_");
    comp.redo();
    expect(comp.root().children.length).toBe(2); // l1 was deleted
  });

  // -----------------------------------------------------------------------
  // Keyboard shortcuts
  // -----------------------------------------------------------------------

  it("Ctrl+Z triggers undo", () => {
    comp.onConjunctionToggle("root");
    expect(comp.root().conjunction).toBe("_||_");

    pressKey(hostEl, "z", { ctrlKey: true });
    fixture.detectChanges();
    expect(comp.root().conjunction).toBe("_&&_");
  });

  it("Meta+Z triggers undo (macOS)", () => {
    comp.onConjunctionToggle("root");

    pressKey(hostEl, "z", { metaKey: true });
    fixture.detectChanges();
    expect(comp.root().conjunction).toBe("_&&_");
  });

  it("Ctrl+Shift+Z triggers redo", () => {
    comp.onConjunctionToggle("root");
    comp.undo();

    pressKey(hostEl, "z", { ctrlKey: true, shiftKey: true });
    fixture.detectChanges();
    expect(comp.root().conjunction).toBe("_||_");
  });

  it("Meta+Shift+Z triggers redo (macOS)", () => {
    comp.onConjunctionToggle("root");
    comp.undo();

    pressKey(hostEl, "z", { metaKey: true, shiftKey: true });
    fixture.detectChanges();
    expect(comp.root().conjunction).toBe("_||_");
  });

  it("Z without modifier does nothing", () => {
    comp.onConjunctionToggle("root");
    const current = comp.root();

    pressKey(hostEl, "z", {});
    fixture.detectChanges();
    expect(comp.root()).toBe(current);
  });
});

describe("FilterTreeComponent - ordering", () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let comp: FilterTreeComponent;
  let hostEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);

    // CRITICAL: attach to document.body so that getBoundingClientRect()
    // returns real pixel values. Without this the fixture lives in a detached
    // DOM node and every rect is {top:0,bottom:0,...}, causing
    // findDeepestBranchZone() to find no candidates and _pendingDropZone
    // to be null when endDrag() snapshots it.
    document.body.appendChild(fixture.nativeElement);

    fixture.detectChanges();
    await fixture.whenStable();

    host = fixture.componentInstance;
    comp = host.filterTree();
    hostEl = fixture.debugElement.query((de) => de.componentInstance === comp).nativeElement;
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    fixture.destroy();
  });

  it("drops a leaf node after a sibling", async () => {
    comp.onNodeDrop({
      dragId: "l1",
      position: { kind: "into-branch", branchId: "root", index: 2 },
    });

    fixture.detectChanges();

    const nodes = hostEl.querySelectorAll('.branch-body > .child-wrapper [id^="l"]');
    expect(nodes[0].getAttribute("id")).toBe("l2");
    expect(nodes[1].getAttribute("id")).toBe("l1");
    expect(nodes[2].getAttribute("id")).toBe("l3");
  });

  it("drops a leaf node before a sibling", () => {
    // Move l3 before l2 (index 1)
    comp.onNodeDrop({
      dragId: "l3",
      position: { kind: "into-branch", branchId: "root", index: 1 },
    });

    fixture.detectChanges();

    const nodes = hostEl.querySelectorAll('.branch-body > .child-wrapper [id^="l"]');
    expect(nodes[0].getAttribute("id")).toBe("l1");
    expect(nodes[1].getAttribute("id")).toBe("l3");
    expect(nodes[2].getAttribute("id")).toBe("l2");
  });

  it("drops a leaf node onto a sibling, merging them into a new branch", () => {
    comp.onNodeDrop({
      dragId: "l1",
      position: { kind: "onto-leaf", leafId: "l2" },
    });

    fixture.detectChanges();

    const root = comp.root();

    // Root should still have 2 children: the new merged branch + l3
    expect(root.children.length).toBe(2);

    const merged = root.children[0];
    const remaining = root.children[1];

    // The merged node should be a branch (has children) with a new id
    expect(merged.children).toHaveLength(2);
    expect(merged.id).not.toBe("l1");
    expect(merged.id).not.toBe("l2");

    // l1 and l2 should be the children of the merged branch
    expect(merged.children.map((c) => c.id)).toContain("l1");
    expect(merged.children.map((c) => c.id)).toContain("l2");

    // l3 should be untouched
    expect(remaining.id).toBe("l3");
  });

  it("dropping a leaf node into its current position is a no-op", () => {
    const before = comp.root();

    // l1 is already at index 0; dropping it at index 0 or 1 (the gaps
    // immediately around it) should produce no structural change
    comp.onNodeDrop({
      dragId: "l1",
      position: { kind: "into-branch", branchId: "root", index: 0 },
    });

    fixture.detectChanges();

    expect(comp.root()).toBe(before);
    expect(comp.canUndo()).toBe(false);
  });
});
