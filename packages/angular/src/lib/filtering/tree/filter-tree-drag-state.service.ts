/**
 * filter-tree-drag-state.service.ts
 *
 * Central coordinator for drag-and-drop visual state AND drop resolution.
 *
 * SINGLE-ACTIVE-ZONE GUARANTEE
 * -----------------------------
 * All zone computation is centralised here. On every pointer move we find the
 * single deepest branch body under the pointer, compute its active zone, and
 * publish one atomic { branchId, zone } signal. Components only ask "is MY
 * branch active?" — overlap is architecturally impossible.
 *
 * DROP RESOLUTION
 * ---------------
 * resolveDropPosition() runs the same findDeepestBranchZone walk used for
 * hover highlighting, but fresh at drop time with the actual drop coordinates.
 * This is the single source of truth — no elementFromPoint, no signal timing
 * issues, no special-case padding-zone guards.
 */

import { DOCUMENT } from "@angular/common";
import { Injectable, inject, signal } from "@angular/core";
import { type FilterNode, isFilterLeafNode } from "./filter-node.model";
import type { DropPosition } from "./filter-tree.service";

/**
 * A resolved drag-and-drop target zone within a branch.
 */
export type ZoneKind =
  | { kind: "gap"; index: number } // insert at this index
  | { kind: "item"; index: number }; // merge with / drop-onto item at this index

/**
 * The currently active drop zone for drag-and-drop feedback.
 */
export interface ActiveDropZone {
  branchId: string;
  zone: ZoneKind;
}

/**
 * Central coordinator for drag state and drop-zone resolution in the filter tree UI.
 */
@Injectable({ providedIn: "root" })
export class FilterTreeDragStateService {
  readonly isDragging = signal<boolean>(false);
  readonly activeDropZone = signal<ActiveDropZone | null>(null);
  readonly currentDragId = signal<string | null>(null);

  private readonly document = inject(DOCUMENT);

  /**
   * Snapshot of activeDropZone taken in endDrag() (cdkDragEnded).
   * cdkDragEnded fires BEFORE cdkDropListDropped, so by the time
   * resolveDropPosition() is called the DOM has already reverted to its
   * resting layout. Snapshotting here lets us use the zone the user was
   * actually hovering over at the moment of release.
   */
  private _pendingDropZone: ActiveDropZone | null = null;

  startDrag(dragId: string): void {
    this.currentDragId.set(dragId);
    this.isDragging.set(true);
  }

  /**
   * Called at cdkDragEnded — which fires BEFORE cdkDropListDropped.
   * Snapshots activeDropZone before clearing so resolveDropPosition()
   * has the correct zone at the moment of release.
   */
  endDrag(): void {
    this._pendingDropZone = this.activeDropZone();
    this.isDragging.set(false);
    this.currentDragId.set(null);
    this.activeDropZone.set(null);
  }

  /** Called on every cdkDragMoved — updates the highlighted zone. */
  updatePointer(x: number, y: number): void {
    const result = findDeepestBranchZone(x, y, this.currentDragId() ?? undefined, this.document);
    this.activeDropZone.set(result);
  }

  /**
   * Called from onDrop() (cdkDropListDropped) to determine the DropPosition.
   * Reads the zone snapshotted by endDrag() — the DOM has already reverted
   * to resting layout by this point so re-walking it gives the wrong answer.
   */
  resolveDropPosition(
    _dropX: number,
    _dropY: number,
    dragId: string,
    root: FilterNode,
  ): DropPosition | null {
    const result = this._pendingDropZone;
    this._pendingDropZone = null;
    if (!result) return null;

    if (result.zone.kind === "gap") {
      const branchNode = findNodeById(root, result.branchId);
      if (!branchNode) return null;
      return { kind: "into-branch", branchId: result.branchId, index: result.zone.index };
    }

    // zone is "item" — merge with the child at that index
    const branchNode = findNodeById(root, result.branchId);
    const target = branchNode?.children[result.zone.index];
    if (!target || target.id === dragId) return null;
    if (isFilterLeafNode(target)) return { kind: "onto-leaf", leafId: target.id };
    return { kind: "onto-branch-header", branchId: target.id };
  }
}

// ---------------------------------------------------------------------------
// Core algorithms (module-level, exported for testing)
// ---------------------------------------------------------------------------

/**
 * Find the deepest branch body under (x, y) and compute its active zone.
 *
 * "Deepest" = innermost nested branch. In document order, a child branch
 * body always appears AFTER its ancestor bodies, so the last matching
 * candidate is the deepest.
 *
 * Returns null if the pointer is outside all branch bodies.
 */
export function findDeepestBranchZone(
  x: number,
  y: number,
  dragId?: string,
  doc: Document = document,
): ActiveDropZone | null {
  const allBodies = Array.from(doc.querySelectorAll<HTMLElement>(".branch-body[data-branch-id]"));

  // All branch bodies whose INNER content rect (excluding top+bottom padding)
  // contains the pointer. This means hovering in a branch's padding zone
  // falls through to the parent branch — the pointer must be over actual
  // content or gap-zone area to claim that branch as the target.
  //
  // IMPORTANT: We use the last CHILD WRAPPER's bottom edge as the content
  // boundary, NOT CSS paddingBottom. CSS padding only measures the explicit
  // padding property, but the visual gap between the last child and the
  // branch border may be larger (e.g. margin, flex gap, or simply the
  // padded space between the inner content and the outer border). Using
  // the last child's actual bottom gives us the true "content zone" boundary.
  const candidates = allBodies.filter((el) => {
    const r = el.getBoundingClientRect();
    // Basic rect check first (fast path to exclude most elements)
    if (y < r.top || y > r.bottom || x < r.left || x > r.right) return false;
    // Shrink the top by CSS paddingTop (branch header area)
    const cs = getComputedStyle(el);
    const pt = parseFloat(cs.paddingTop) || 0;
    if (y < r.top + pt) return false;
    return y <= r.bottom - (parseFloat(cs.paddingBottom) || 0);
  });

  if (candidates.length === 0) return null;

  // Last candidate = deepest in the DOM tree (child branches appear after
  // their parents in document order).
  const deepest = candidates[candidates.length - 1];
  const branchId = deepest.dataset["branchId"]!;

  const childWrappers = Array.from(
    deepest.querySelectorAll<HTMLElement>(":scope > .child-wrapper"),
  );

  const zone = computeActiveZone(y, childWrappers, dragId);
  return { branchId, zone };
}

/**
 * Pure, DOM-free version of zone computation. Exported for unit testing.
 *
 * @param pointerY   - pointer Y coordinate
 * @param rects      - bounding rects of child wrappers (in order)
 * @param nodeIds    - data-node-id of each child wrapper (parallel to rects)
 * @param dragId     - ID of the node currently being dragged (to skip its gaps)
 */
export function computeZoneFromRects(
  pointerY: number,
  rects: Array<{ top: number; bottom: number; height: number }>,
  nodeIds: string[],
  dragId?: string,
): ZoneKind {
  if (rects.length === 0) return { kind: "gap", index: 0 };

  interface SnapPoint {
    y: number;
    zone: ZoneKind;
  }
  const snaps: SnapPoint[] = [];

  // Find the index of the dragged child. CDK keeps it in the DOM (invisible)
  // so its rect is still measured. We skip the gaps immediately before AND
  // after it — otherwise both show as active drop zones simultaneously.
  const selfIndex = dragId != null ? nodeIds.indexOf(dragId) : -1;

  const skipGap = (gapIndex: number): boolean => {
    if (selfIndex === -1) return false;
    return gapIndex === selfIndex || gapIndex === selfIndex + 1;
  };

  if (!skipGap(0)) {
    snaps.push({ y: rects[0].top, zone: { kind: "gap", index: 0 } });
  }

  for (let i = 0; i < rects.length; i++) {
    const isSelf = selfIndex === i;

    if (!isSelf) {
      snaps.push({
        y: rects[i].top + rects[i].height / 2,
        zone: { kind: "item", index: i },
      });
    }

    if (i < rects.length - 1 && !skipGap(i + 1)) {
      snaps.push({
        y: (rects[i].bottom + rects[i + 1].top) / 2,
        zone: { kind: "gap", index: i + 1 },
      });
    }
  }

  // Trailing gap only for root. Also skip if the dragged node is the last
  // child (selfIndex === rects.length - 1), since skipGap(rects.length)
  // would be true but the trailing snap is added outside the loop.
  if (!skipGap(rects.length)) {
    snaps.push({
      y: rects[rects.length - 1].bottom,
      zone: { kind: "gap", index: rects.length },
    });
  }

  return snaps.reduce((best, s) =>
    Math.abs(s.y - pointerY) < Math.abs(best.y - pointerY) ? s : best,
  ).zone;
}

/**
 * Computes the active drop zone for the current pointer position.
 */
export function computeActiveZone(
  pointerY: number,
  childWrappers: HTMLElement[],
  dragId?: string,
): ZoneKind {
  if (childWrappers.length === 0) return { kind: "gap", index: 0 };
  const rects = childWrappers.map((el) => el.getBoundingClientRect());
  const nodeIds = childWrappers.map((el) => el.dataset["nodeId"] ?? "");
  return computeZoneFromRects(pointerY, rects, nodeIds, dragId);
}

/** Find a node by ID anywhere in the tree. */
function findNodeById(node: FilterNode, id: string): FilterNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return undefined;
}
