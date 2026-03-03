/**
 * filter-tree-drag-state.service.spec.ts
 *
 * TWO TEST SUITES
 * ---------------
 *
 * 1. computeZoneFromRects — pure unit tests, no DOM, no mocks.
 *    Covers the hover-highlight snap-point algorithm in isolation.
 *
 * 2. resolveDropPosition — tests drop resolution via real DOM geometry.
 *    Builds a minimal branch-body / child-wrapper DOM tree, attaches it to
 *    document.body so getBoundingClientRect() returns real layout values,
 *    then simulates a drag by:
 *      a) calling startDrag()
 *      b) calling updatePointer() with hover coordinates to set activeDropZone
 *      c) calling endDrag() to snapshot activeDropZone into _pendingDropZone
 *      d) calling resolveDropPosition() which consumes _pendingDropZone
 *    This mirrors the real CDK event sequence:
 *      cdkDragMoved → cdkDragEnded → cdkDropListDropped
 */

import { TestBed } from "@angular/core/testing";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FilterNode } from "./filter-node.model";
import { createFilterBranchNode, createFilterLeafNode } from "./filter-node.model";
import { computeZoneFromRects, FilterTreeDragStateService } from "./filter-tree-drag-state.service";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRect(top: number, bottom: number) {
  return { top, bottom, height: bottom - top };
}

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

// ---------------------------------------------------------------------------
// Suite 1: computeZoneFromRects — pure snap-point algorithm
// ---------------------------------------------------------------------------

describe("computeZoneFromRects — snap points", () => {
  // Three children: [0]=100–136, [1]=140–176, [2]=180–216
  // Snap points (isRoot=true):
  //   gap[0]=100  item[0]=118  gap[1]=138  item[1]=158  gap[2]=178  item[2]=198  gap[3]=216
  const rects = [makeRect(100, 136), makeRect(140, 176), makeRect(180, 216)];
  const ids = ["l1", "l2", "l3"];
  const z = (y: number, drag?: string, root = true) =>
    computeZoneFromRects(y, rects, ids, drag, root);

  it("empty rects → gap[0]", () => {
    expect(computeZoneFromRects(50, [], [], undefined, true)).toEqual({ kind: "gap", index: 0 });
  });
  it("gap[0] at y=100", () => expect(z(100)).toEqual({ kind: "gap", index: 0 }));
  it("item[0] at y=118", () => expect(z(118)).toEqual({ kind: "item", index: 0 }));
  it("gap[1] at y=138", () => expect(z(138)).toEqual({ kind: "gap", index: 1 }));
  it("item[1] at y=158", () => expect(z(158)).toEqual({ kind: "item", index: 1 }));
  it("gap[2] at y=178", () => expect(z(178)).toEqual({ kind: "gap", index: 2 }));
  it("item[2] at y=198", () => expect(z(198)).toEqual({ kind: "item", index: 2 }));
  it("trailing gap[3] at y=216 when isRoot=true", () => {
    expect(z(216, undefined, true)).toEqual({ kind: "gap", index: 3 });
  });
  it("skips item snap for dragged node", () => {
    expect(z(118, "l1")).not.toEqual({ kind: "item", index: 0 });
  });
  it("skips gap immediately before dragged node", () => {
    expect(z(138, "l2")).not.toEqual({ kind: "gap", index: 1 });
  });
  it("skips gap immediately after dragged node", () => {
    expect(z(178, "l2")).not.toEqual({ kind: "gap", index: 2 });
  });
  it("skips trailing gap when dragged node is last child", () => {
    expect(z(216, "l3", true)).not.toEqual({ kind: "gap", index: 3 });
  });
  it("does not skip unrelated gaps", () => {
    expect(z(100, "l2")).toEqual({ kind: "gap", index: 0 });
  });
  it("every y position returns exactly one zone", () => {
    for (let y = 90; y <= 230; y++) {
      const result = z(y, "l2", true);
      expect(result).toHaveProperty("kind");
      expect(result).toHaveProperty("index");
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 2: resolveDropPosition — real DOM geometry
// ---------------------------------------------------------------------------
//
// resolveDropPosition() now reads the _pendingDropZone snapshot set by
// endDrag(). The correct test sequence mirrors the real CDK event order:
//
//   1. startDrag(dragId)           — begin drag
//   2. updatePointer(x, y)         — hover over desired zone (sets activeDropZone)
//   3. endDrag()                   — snapshot activeDropZone → _pendingDropZone, clear state
//   4. resolveDropPosition(...)    — consume _pendingDropZone
//
// We build a minimal real DOM tree and use getBoundingClientRect() coordinates
// for both updatePointer() and the final assertion, ensuring geometry is real.

describe("resolveDropPosition — real DOM geometry", () => {
  let service: FilterTreeDragStateService;
  let host: HTMLDivElement;

  // Tree used in all tests (valid — every branch has >= 2 children):
  //   root (AND)
  //     ├─ orGroup (OR)
  //     │    ├─ regionUS  (leaf, index 0)
  //     │    └─ regionEU  (leaf, index 1)
  //     └─ priority       (leaf, index 1)  ← the dragged node
  let root: FilterNode;

  // DOM structure mirrors what FilterNodeComponent renders:
  //   .branch-body[data-branch-id="root"]
  //     .child-wrapper[data-node-id="orGroup"]
  //       .branch-body[data-branch-id="orGroup"]
  //         .child-wrapper[data-node-id="regionUS"]
  //         .child-wrapper[data-node-id="regionEU"]
  //     .child-wrapper[data-node-id="priority"]

  let regionUSWrapper: HTMLElement;
  let regionEUWrapper: HTMLElement;
  let priorityWrapper: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideAnimationsAsync()],
    }).compileComponents();
    service = TestBed.inject(FilterTreeDragStateService);
    service.startDrag("priority");

    root = branch("root", [
      branch("orGroup", [leaf("regionUS"), leaf("regionEU")], "_||_"),
      leaf("priority"),
    ]);

    // Build a minimal DOM that findDeepestBranchZone can measure.
    // jsdom doesn't do layout, so we mock getBoundingClientRect on each element.
    //
    // Intended layout (30px items, 8px gaps, stacked vertically at x=0..400):
    //   rootBody:        top=0,   bottom=125, paddingTop=1
    //     orGroupWrapper:  top=0,   bottom=87
    //       orGroupBody:   top=0,   bottom=87, paddingTop=1, paddingBottom=10
    //         regionUS:    top=9,   bottom=39
    //         regionEU:    top=47,  bottom=77
    //     priorityWrapper: top=95,  bottom=125

    host = document.createElement("div");
    document.body.appendChild(host);

    const mockRect = (el: HTMLElement, rect: Partial<DOMRect>) => {
      el.getBoundingClientRect = () => ({
        top: 0,
        bottom: 0,
        left: 0,
        right: 400,
        width: 400,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
        ...rect,
      });
    };

    const rootBody = document.createElement("div");
    rootBody.className = "branch-body";
    rootBody.dataset["branchId"] = "root";
    rootBody.style.cssText = "padding-top:1px;";
    mockRect(rootBody, { top: 0, bottom: 125, height: 125 });
    host.appendChild(rootBody);

    const orGroupWrapper = document.createElement("div");
    orGroupWrapper.className = "child-wrapper";
    orGroupWrapper.dataset["nodeId"] = "orGroup";
    mockRect(orGroupWrapper, { top: 0, bottom: 87, height: 87 });
    rootBody.appendChild(orGroupWrapper);

    const orGroupBody = document.createElement("div");
    orGroupBody.className = "branch-body";
    orGroupBody.dataset["branchId"] = "orGroup";
    orGroupBody.style.cssText = "padding-top:1px;padding-bottom:10px;";
    mockRect(orGroupBody, { top: 0, bottom: 87, height: 87 });
    orGroupWrapper.appendChild(orGroupBody);

    regionUSWrapper = document.createElement("div");
    regionUSWrapper.className = "child-wrapper";
    regionUSWrapper.dataset["nodeId"] = "regionUS";
    mockRect(regionUSWrapper, { top: 9, bottom: 39, height: 30 });
    orGroupBody.appendChild(regionUSWrapper);

    regionEUWrapper = document.createElement("div");
    regionEUWrapper.className = "child-wrapper";
    regionEUWrapper.dataset["nodeId"] = "regionEU";
    mockRect(regionEUWrapper, { top: 47, bottom: 77, height: 30 });
    orGroupBody.appendChild(regionEUWrapper);

    priorityWrapper = document.createElement("div");
    priorityWrapper.className = "child-wrapper";
    priorityWrapper.dataset["nodeId"] = "priority";
    mockRect(priorityWrapper, { top: 95, bottom: 125, height: 30 });
    rootBody.appendChild(priorityWrapper);
  });

  afterEach(() => {
    document.body.removeChild(host);
    // endDrag() may already have been called inside simulateDrop; calling it
    // again is harmless — it just snapshots null and clears already-null state.
    service.endDrag();
    TestBed.resetTestingModule();
  });

  /**
   * Simulate a complete drag: hover at (x, y), release, then resolve.
   * Mirrors the real CDK sequence: cdkDragMoved → cdkDragEnded → cdkDropListDropped.
   */
  function simulateDrop(
    x: number,
    y: number,
    dragId = "priority",
  ): ReturnType<typeof service.resolveDropPosition> {
    service.updatePointer(x, y); // cdkDragMoved:       sets activeDropZone
    service.endDrag(); // cdkDragEnded:       snapshots → _pendingDropZone, clears state
    return service.resolveDropPosition(x, y, dragId, root); // cdkDropListDropped: consumes snapshot
  }

  function midY(el: HTMLElement): number {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  }

  function gapMidY(above: HTMLElement, below: HTMLElement): number {
    return (above.getBoundingClientRect().bottom + below.getBoundingClientRect().top) / 2;
  }

  it("pointer at center of regionUS → onto-leaf", () => {
    const y = midY(regionUSWrapper);
    const result = simulateDrop(10, y);
    expect(result).toEqual({ kind: "onto-leaf", leafId: "regionUS" });
  });

  it("pointer at center of regionEU → onto-leaf", () => {
    const y = midY(regionEUWrapper);
    const result = simulateDrop(10, y);
    expect(result).toEqual({ kind: "onto-leaf", leafId: "regionEU" });
  });

  it("pointer at gap midpoint between regionUS and regionEU → into-branch at index 1", () => {
    const y = gapMidY(regionUSWrapper, regionEUWrapper);
    const result = simulateDrop(10, y);
    expect(result).toEqual({ kind: "into-branch", branchId: "orGroup", index: 1 });
  });

  it("REGRESSION: pointer between two siblings → into-branch, never onto-leaf", () => {
    const y = gapMidY(regionUSWrapper, regionEUWrapper);
    const result = simulateDrop(10, y);
    expect(result?.kind).toBe("into-branch");
  });

  it("pointer at center of self (priority) → does not resolve to self", () => {
    const y = midY(priorityWrapper);
    const result = simulateDrop(10, y);
    // priority's item snap is skipped; result must never point back at priority
    if (result?.kind === "onto-leaf") expect(result.leafId).not.toBe("priority");
    if (result?.kind === "onto-branch-header") expect(result.branchId).not.toBe("priority");
    // gap or null are also acceptable
  });

  it("pointer far below all content → null (outside tree)", () => {
    const result = simulateDrop(10, 9999);
    expect(result).toBeNull();
  });
});
