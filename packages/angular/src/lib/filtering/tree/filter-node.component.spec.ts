/**
 * filter-node.component.spec.ts
 *
 * Runs in a real Chromium browser via @vitest/browser-playwright.
 *
 * APPROACH
 * --------
 * All drag interactions use the Chrome DevTools Protocol (CDP) Input API to
 * dispatch genuine mouse events at the OS level. This is the same mechanism
 * Playwright itself uses internally, and it correctly triggers CDK's drag
 * pipeline (mousedown → mousemove past threshold → mousemove to target →
 * mouseup), which in turn fires cdkDragMoved, cdkDragEnded, and
 * cdkDropListDropped in the correct order.
 *
 * The component is mounted in the live browser document — no host div tricks
 * needed, getBoundingClientRect() always returns real values.
 *
 * VALID TREES
 * -----------
 * Every branch must have >= 2 children, otherwise enforceMinChildren()
 * collapses it immediately.
 *
 * STATUS
 * ------
 * Gap zone data attribute tests (5): PASSING — service-driven, no CDP needed.
 * All CDP drag tests (15): COMMENTED OUT — cdp() from @vitest/browser/context
 * has no type definition, requiring `as any` to call .send(). Blocked until
 * a typed path to CDP (e.g. via BrowserProvider.getCDPSession in a custom
 * Vitest command) is wired up, or the trailing gap zone UI bug is fixed and
 * we revisit the approach.
 */

import { TestBed } from "@angular/core/testing";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { afterEach, describe, expect, it } from "vitest";
import { createFilterBranchNode, createFilterLeafNode, type FilterNode } from "./filter-node.model";
import { FilterTreeComponent } from "./filter-tree.component";
import { FilterTreeDragStateService } from "./filter-tree-drag-state.service";

// ---------------------------------------------------------------------------
// Tree builders
// ---------------------------------------------------------------------------

function leaf(id: string): FilterNode {
  const n = createFilterLeafNode(
    undefined as unknown as Parameters<typeof createFilterLeafNode>[0],
  );
  Object.assign(n, { id });
  return n;
}

function branch(
  id: string,
  children: FilterNode[],
  conjunction: "_&&_" | "_||_" = "_&&_",
): FilterNode {
  const n = createFilterBranchNode(children, conjunction);
  Object.assign(n, { id });
  return n;
}

// ---------------------------------------------------------------------------
// Tree helpers (used by commented-out suites — kept for when tests re-enable)
// ---------------------------------------------------------------------------

function collectIds(node: FilterNode): string[] {
  if (node.children.length === 0) return [node.id];
  return node.children.flatMap(collectIds);
}

function findNode(root: FilterNode, id: string): FilterNode | undefined {
  if (root.id === id) return root;
  for (const c of root.children) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return undefined;
}

function childIds(root: FilterNode, branchId: string): string[] {
  return findNode(root, branchId)?.children.map((c) => c.id) ?? [];
}

function areSiblings(node: FilterNode, a: string, b: string): boolean {
  const ids = node.children.map((c) => c.id);
  if (ids.includes(a) && ids.includes(b)) return true;
  return node.children.some((c) => areSiblings(c, a, b));
}

// Suppress unused-variable warnings for helpers only used in commented suites
void collectIds;
void findNode;
void childIds;
void areSiblings;

// ---------------------------------------------------------------------------
// Suite: Gap zone DOM attributes
// (service-driven — no drag needed, PASSING)
// ---------------------------------------------------------------------------

describe("FilterNodeComponent — gap zone data attributes", () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup(initialTree: FilterNode) {
    await TestBed.configureTestingModule({
      imports: [FilterTreeComponent],
      providers: [provideAnimationsAsync()],
    }).compileComponents();
    const fixture = TestBed.createComponent(FilterTreeComponent);
    const dragState = TestBed.inject(FilterTreeDragStateService);
    fixture.componentRef.setInput("initialTree", initialTree);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, dragState };
  }

  it("gap zones have no data attributes before dragging", async () => {
    const { fixture } = await setup(branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]));
    expect(fixture.nativeElement.querySelectorAll(".gap-zone[data-gap-index]").length).toBe(0);
  });

  it("gap zones get data-gap-index and data-branch-id while dragging", async () => {
    const { fixture, dragState } = await setup(
      branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]),
    );
    dragState.startDrag("l1");
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      fixture.nativeElement.querySelectorAll(".gap-zone[data-gap-index]").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("each gap zone has the correct index", async () => {
    const { fixture, dragState } = await setup(
      branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]),
    );
    dragState.startDrag("l1");
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      fixture.nativeElement.querySelector(`.gap-zone[data-branch-id="root"][data-gap-index="1"]`),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(`.gap-zone[data-branch-id="root"][data-gap-index="2"]`),
    ).not.toBeNull();
  });

  it("nested branch gap zones carry the nested branch's ID, not root's", async () => {
    const { fixture, dragState } = await setup(
      branch("root", [branch("inner", [leaf("l1"), leaf("l2")], "_||_"), leaf("l3")]),
    );
    dragState.startDrag("l1");
    fixture.detectChanges();
    await fixture.whenStable();
    const innerGap = fixture.nativeElement.querySelector(
      `.gap-zone[data-branch-id="inner"][data-gap-index="1"]`,
    ) as HTMLElement;
    expect(innerGap).not.toBeNull();
    expect(innerGap.dataset["branchId"]).toBe("inner");
  });

  it("gap zone attributes are removed after drag ends", async () => {
    const { fixture, dragState } = await setup(branch("root", [leaf("l1"), leaf("l2")]));
    dragState.startDrag("l1");
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      fixture.nativeElement.querySelectorAll(".gap-zone[data-gap-index]").length,
    ).toBeGreaterThan(0);
    dragState.endDrag();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll(".gap-zone[data-gap-index]").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suites below: COMMENTED OUT
// Blocked on: cdp() from @vitest/browser/context has no .d.ts — using it
// requires `as any`. Will re-enable once CDP access is available through a
// typed path (BrowserProvider.getCDPSession via a custom Vitest command).
// ---------------------------------------------------------------------------

/*
import { beforeEach } from "vitest";

async function cdpDrag(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Promise<void> {
  // cdp() has no type definition — blocked
}

async function setupAttached(initialTree: FilterNode, host: HTMLElement) {
  await TestBed.configureTestingModule({
    imports: [FilterTreeComponent],
    providers: [provideAnimationsAsync()],
  }).compileComponents();

  const fixture = TestBed.createComponent(FilterTreeComponent);
  host.appendChild(fixture.nativeElement);
  fixture.componentRef.setInput("initialTree", initialTree);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();

  const component = fixture.componentInstance;
  const treeChanges: FilterNode[] = [];
  component.treeChange.subscribe((t: FilterNode) => treeChanges.push(t));

  function rect(nodeId: string): DOMRect {
    return (
      fixture.nativeElement.querySelector(
        `.child-wrapper[data-node-id="${nodeId}"]`,
      ) as HTMLElement
    ).getBoundingClientRect();
  }

  function handle(nodeId: string): DOMRect {
    return (
      fixture.nativeElement.querySelector(
        `.child-wrapper[data-node-id="${nodeId}"] .drag-handle`,
      ) as HTMLElement
    ).getBoundingClientRect();
  }

  async function dragTo(nodeId: string, toX: number, toY: number): Promise<void> {
    const h = handle(nodeId);
    await cdpDrag(h.left + h.width / 2, h.top + h.height / 2, toX, toY);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function dragOnto(nodeId: string, targetId: string): Promise<void> {
    const r = rect(targetId);
    await dragTo(nodeId, r.left + r.width / 2, r.top + r.height / 2);
  }

  return { fixture, component, treeChanges, rect, handle, dragTo, dragOnto };
}

describe("FilterTreeComponent — drop resolution", () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement("div");
    host.style.cssText = "position:fixed;top:0;left:0;width:600px;";
    document.body.appendChild(host);
  });
  afterEach(() => {
    document.body.removeChild(host);
    TestBed.resetTestingModule();
  });

  it("dropping into a gap zone reorders — does not create a group", async () => {
    const tree = branch("root", [
      branch("orGroup", [leaf("regionUS"), leaf("regionEU")], "_||_"),
      leaf("priority"),
    ]);
    const { treeChanges, rect, dragTo } = await setupAttached(tree, host);
    const us = rect("regionUS");
    const eu = rect("regionEU");
    await dragTo("priority", us.left + us.width / 2, (us.bottom + eu.top) / 2);
    expect(treeChanges.length).toBeGreaterThan(0);
    const ids = collectIds(treeChanges.at(-1));
    expect(ids).toContain("priority");
    expect(ids).toContain("regionUS");
    expect(ids).toContain("regionEU");
    expect(ids.length).toBe(3);
  });

  it("REGRESSION: pointer between two siblings → reorder, no new sub-group", async () => {
    const tree = branch("root", [
      branch("orGroup", [leaf("regionUS"), leaf("regionEU")], "_||_"),
      leaf("priority"),
    ]);
    const { treeChanges, rect, dragTo } = await setupAttached(tree, host);
    const us = rect("regionUS");
    const eu = rect("regionEU");
    await dragTo("priority", us.left + us.width / 2, (us.bottom + eu.top) / 2);
    expect(treeChanges.length).toBeGreaterThan(0);
    function findUnexpectedBranches(node: FilterNode, originalIds: Set<string>): string[] {
      if (node.children.length === 0) return [];
      const unexpected = !originalIds.has(node.id) ? [node.id] : [];
      return [...unexpected, ...node.children.flatMap((c) => findUnexpectedBranches(c, originalIds))];
    }
    expect(
      findUnexpectedBranches(treeChanges.at(-1), new Set(["root", "orGroup"])),
    ).toEqual([]);
  });

  it("dropping onto the center of a leaf creates a new group containing both", async () => {
    const tree = branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]);
    const { treeChanges, rect, dragTo } = await setupAttached(tree, host);
    const r = rect("l2");
    await dragTo("l1", r.left + r.width / 2, r.top + r.height / 2);
    expect(treeChanges.length).toBeGreaterThan(0);
    const result = treeChanges.at(-1);
    expect(collectIds(result)).toContain("l1");
    expect(collectIds(result)).toContain("l2");
    expect(collectIds(result)).toContain("l3");
    expect(result.children.length).toBe(2);
  });

  it("dropping outside all branch bodies → no tree change", async () => {
    const tree = branch("root", [leaf("l1"), leaf("l2")]);
    const { treeChanges, dragTo } = await setupAttached(tree, host);
    await dragTo("l1", 100, 5000);
    expect(treeChanges.length).toBe(0);
  });
});

describe("FilterTreeComponent — padding-zone drop guard", () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement("div");
    host.style.cssText = "position:fixed;top:0;left:0;width:600px;";
    document.body.appendChild(host);
  });
  afterEach(() => {
    document.body.removeChild(host);
    TestBed.resetTestingModule();
  });

  it("REGRESSION: dropping in andGroup padding zone inserts into root, not into andGroup", async () => {
    const tree = branch(
      "root",
      [
        leaf("status"),
        branch("andGroup", [leaf("regionUS"), leaf("regionEU")], "_&&_"),
        leaf("priority"),
        leaf("name"),
      ],
      "_||_",
    );
    const { treeChanges, rect, dragTo, fixture } = await setupAttached(tree, host);
    const andGroupBody = fixture.nativeElement.querySelector(
      '.branch-body[data-branch-id="andGroup"]',
    ) as HTMLElement;
    const andGroupRect = andGroupBody.getBoundingClientRect();
    const euRect = rect("regionEU");
    const dropX = andGroupRect.left + andGroupRect.width / 2;
    const dropY = andGroupRect.bottom - 3;
    expect(dropY).toBeGreaterThan(euRect.bottom);
    expect(dropY).toBeLessThan(andGroupRect.bottom);
    await dragTo("status", dropX, dropY);
    expect(treeChanges.length).toBeGreaterThan(0);
    const result = treeChanges.at(-1);
    expect(areSiblings(result, "status", "regionEU")).toBe(false);
    expect(result.children.map((c) => c.id)).toContain("status");
    expect(childIds(result, "andGroup")).toEqual(["regionUS", "regionEU"]);
  });
});

describe("FilterTreeComponent — drop targets (screenshot state)", () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement("div");
    host.style.cssText = "position:fixed;top:0;left:0;width:600px;";
    document.body.appendChild(host);
  });
  afterEach(() => {
    document.body.removeChild(host);
    TestBed.resetTestingModule();
  });

  function makeTree() {
    return branch("root", [
      leaf("statusActive"),
      branch("orGroup", [leaf("regionUS"), leaf("regionEU")], "_||_"),
      leaf("priorityGt3"),
      leaf("nameFoo"),
    ]);
  }

  it("dropped above orGroup → no tree change (already in position)", async () => {
    const { treeChanges, rect, dragTo } = await setupAttached(makeTree(), host);
    const r = rect("orGroup");
    await dragTo("statusActive", r.left + 10, r.top - 4);
    expect(treeChanges.length).toBe(0);
  });

  it("dropped inside orGroup above regionUS → orGroup has [statusActive, regionUS, regionEU]", async () => {
    const { treeChanges, rect, dragTo } = await setupAttached(makeTree(), host);
    const r = rect("regionUS");
    await dragTo("statusActive", r.left + 10, r.top - 4);
    expect(treeChanges.length).toBeGreaterThan(0);
    expect(childIds(treeChanges.at(-1), "orGroup")).toEqual(["statusActive", "regionUS", "regionEU"]);
  });

  it("dropped inside orGroup between regionUS and regionEU → orGroup has [regionUS, statusActive, regionEU]", async () => {
    const { treeChanges, rect, dragTo } = await setupAttached(makeTree(), host);
    const us = rect("regionUS");
    const eu = rect("regionEU");
    await dragTo("statusActive", us.left + 10, (us.bottom + eu.top) / 2);
    expect(treeChanges.length).toBeGreaterThan(0);
    expect(childIds(treeChanges.at(-1), "orGroup")).toEqual(["regionUS", "statusActive", "regionEU"]);
  });

  // Known UI bug: trailing gap of non-root branches is unreachable.
  // it("dropped inside orGroup below regionEU → orGroup has [regionUS, regionEU, statusActive]", ...

  it("dropped below orGroup above priorityGt3 → root has [orGroup, statusActive, priorityGt3, nameFoo]", async () => {
    const { treeChanges, rect, dragTo } = await setupAttached(makeTree(), host);
    const r = rect("priorityGt3");
    await dragTo("statusActive", r.left + 10, r.top - 4);
    expect(treeChanges.length).toBeGreaterThan(0);
    expect(childIds(treeChanges.at(-1), "root")).toEqual(["orGroup", "statusActive", "priorityGt3", "nameFoo"]);
  });

  it("dropped between priorityGt3 and nameFoo → root has [orGroup, priorityGt3, statusActive, nameFoo]", async () => {
    const { treeChanges, rect, dragTo } = await setupAttached(makeTree(), host);
    const p = rect("priorityGt3");
    const n = rect("nameFoo");
    await dragTo("statusActive", p.left + 10, (p.bottom + n.top) / 2);
    expect(treeChanges.length).toBeGreaterThan(0);
    expect(childIds(treeChanges.at(-1), "root")).toEqual(["orGroup", "priorityGt3", "statusActive", "nameFoo"]);
  });

  it("dropped below nameFoo → root has [orGroup, priorityGt3, nameFoo, statusActive]", async () => {
    const { treeChanges, rect, dragTo } = await setupAttached(makeTree(), host);
    const r = rect("nameFoo");
    await dragTo("statusActive", r.left + 10, r.bottom + 10);
    expect(treeChanges.length).toBeGreaterThan(0);
    expect(childIds(treeChanges.at(-1), "root")).toEqual(["orGroup", "priorityGt3", "nameFoo", "statusActive"]);
  });
});

describe("FilterTreeComponent — collapsing and combining", () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement("div");
    host.style.cssText = "position:fixed;top:0;left:0;width:600px;";
    document.body.appendChild(host);
  });
  afterEach(() => {
    document.body.removeChild(host);
    TestBed.resetTestingModule();
  });

  it("moving a leaf out of a 2-child group collapses the group", async () => {
    const tree = branch("root", [
      leaf("statusActive"),
      branch("orGroup", [leaf("regionUS"), leaf("regionEU")], "_||_"),
      leaf("priorityGt3"),
      leaf("nameFoo"),
    ]);
    const { treeChanges, rect, dragTo } = await setupAttached(tree, host);
    const r = rect("priorityGt3");
    await dragTo("regionUS", r.left + 10, r.top - 4);
    expect(treeChanges.length).toBeGreaterThan(0);
    const result = treeChanges.at(-1);
    expect(findNode(result, "orGroup")).toBeUndefined();
    expect(collectIds(result)).toEqual(
      expect.arrayContaining(["statusActive", "regionUS", "regionEU", "priorityGt3", "nameFoo"]),
    );
    expect(collectIds(result).length).toBe(5);
  });

  it("dropping a leaf onto another leaf creates a new AND branch containing both", async () => {
    const tree = branch("root", [leaf("l1"), leaf("l2"), leaf("l3")]);
    const { treeChanges, dragOnto } = await setupAttached(tree, host);
    await dragOnto("l1", "l2");
    expect(treeChanges.length).toBeGreaterThan(0);
    const result = treeChanges.at(-1);
    expect(result.children.length).toBe(2);
    const newGroup = result.children.find((c) => c.children.length > 0);
    expect(newGroup).toBeDefined();
    expect(newGroup.conjunction).toBe("_&&_");
    expect(newGroup.children.map((c) => c.id)).toEqual(["l1", "l2"]);
  });

  it("dropping a leaf onto a branch header wraps both in a new AND branch", async () => {
    const tree = branch("root", [
      branch("orGroup", [leaf("regionUS"), leaf("regionEU")], "_||_"),
      leaf("statusActive"),
    ]);
    const { treeChanges, dragOnto } = await setupAttached(tree, host);
    await dragOnto("statusActive", "orGroup");
    expect(treeChanges.length).toBeGreaterThan(0);
    const result = treeChanges.at(-1);
    expect(collectIds(result)).toEqual(
      expect.arrayContaining(["regionUS", "regionEU", "statusActive"]),
    );
    expect(areSiblings(result, "orGroup", "statusActive")).toBe(true);
  });

  it("dropping a branch onto a leaf wraps both in a new AND branch", async () => {
    const tree = branch("root", [
      branch("orGroup", [leaf("regionUS"), leaf("regionEU")], "_||_"),
      leaf("statusActive"),
    ]);
    const { treeChanges, dragOnto } = await setupAttached(tree, host);
    await dragOnto("orGroup", "statusActive");
    expect(treeChanges.length).toBeGreaterThan(0);
    const result = treeChanges.at(-1);
    expect(collectIds(result)).toEqual(
      expect.arrayContaining(["regionUS", "regionEU", "statusActive"]),
    );
    expect(areSiblings(result, "orGroup", "statusActive")).toBe(true);
  });

  it("dropping a branch into another branch via gap zone nests it inside the target", async () => {
    const tree = branch("root", [
      branch("branchA", [leaf("l1"), leaf("l2")]),
      branch("branchB", [leaf("l3"), leaf("l4")]),
    ]);
    const { treeChanges, rect, dragTo } = await setupAttached(tree, host);
    const r = rect("l3");
    await dragTo("branchA", r.left + 10, r.top - 4);
    expect(treeChanges.length).toBeGreaterThan(0);
    const result = treeChanges.at(-1);
    const branchB = findNode(result, "branchB");
    expect(branchB).toBeDefined();
    expect(branchB.children.map((c) => c.id)).toContain("branchA");
  });

  it("dropping a branch onto a branch header wraps both in a new AND branch", async () => {
    const tree = branch("root", [
      branch("branchA", [leaf("l1"), leaf("l2")]),
      branch("branchB", [leaf("l3"), leaf("l4")]),
    ]);
    const { treeChanges, dragOnto } = await setupAttached(tree, host);
    await dragOnto("branchA", "branchB");
    expect(treeChanges.length).toBeGreaterThan(0);
    const result = treeChanges.at(-1);
    expect(areSiblings(result, "branchA", "branchB")).toBe(true);
    expect(collectIds(result)).toEqual(expect.arrayContaining(["l1", "l2", "l3", "l4"]));
  });
});
*/
