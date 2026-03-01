/**
 * filter-tree.component.ts
 *
 * The root component for the filter tree editor. It:
 *  • Owns the signal that holds the tree state (root FilterNode).
 *  • Computes the flat list of all cdkDropList IDs in the tree so every
 *    drop list can be connected to every other (enabling cross-list drag).
 *  • Handles drop and conjunction-toggle events emitted by FilterNodeComponent
 *    by delegating to FilterTreeService and writing the result back to the
 *    signal.
 *
 * Usage:
 *   <app-filter-tree [initialTree]="myRootNode" (treeChange)="onTreeChange($event)" />
 */

import { DragDropModule } from "@angular/cdk/drag-drop";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from "@angular/core";
import { FilterNodeComponent } from "./filter-node.component";
import {
  createFilterBranchNode,
  type FilterNode,
} from "./filter-node.model";
import { type DropPosition, FilterTreeService } from "./filter-tree.service";

@Component({
  selector: "aip-filter-tree",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DragDropModule, FilterNodeComponent],
  templateUrl: "./filter-tree.component.html",
  styleUrls: ["./filter-tree.component.css"],
})
export class FilterTreeComponent implements OnInit {
  // -------------------------------------------------------------------------
  // Inputs / Outputs
  // -------------------------------------------------------------------------

  /**
   * Optional initial tree. If not provided, an empty root branch is created.
   * The component makes its own internal copy so callers don't need to worry
   * about mutations.
   */
  initialTree = input<FilterNode | undefined>(undefined);

  /** Emitted after every successful tree mutation. */
  treeChange = output<FilterNode>();

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** The authoritative tree state. All mutations update this signal. */
  readonly root = signal<FilterNode>(
    createFilterBranchNode([], "_&&_"), // default empty root; replaced in ngOnInit
  );

  // -------------------------------------------------------------------------
  // Services
  // -------------------------------------------------------------------------

  private treeService = inject(FilterTreeService);

  // -------------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------------

  /**
   * Flat array of ALL cdkDropList IDs currently in the tree.
   * Passed to [cdkDropListConnectedTo] on every branch body so cross-branch
   * dragging works. Each branch contributes one ID: `drop-list-<nodeId>`.
   */
  allDropListIds = computed<string[]>(() => {
    const ids: string[] = [];
    collectDropListIds(this.root(), ids);
    return ids;
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  ngOnInit(): void {
    const initial = this.initialTree();
    if (initial) {
      this.root.set(initial);
    }
    // If no initial tree was provided, keep the empty root created above.
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  /**
   * Handle a drop event from any node in the tree.
   * resolveDropPosition runs inside FilterNodeComponent at drop time,
   * so we receive a fully resolved DropPosition here.
   */
  onNodeDrop(event: { dragId: string; position: DropPosition }): void {
    const before = this.root();
    const newRoot = this.treeService.applyDrop(before, event.dragId, event.position);
    // Don't emit if the tree structure didn't actually change — an unchanged
    // tree must not trigger downstream side effects (e.g. expensive DB queries).
    if (treesEqual(before, newRoot)) return;
    this.root.set(newRoot);
    this.treeChange.emit(newRoot);
  }

  /** Handle a conjunction toggle from any branch. */
  onConjunctionToggle(branchId: string): void {
    const newRoot = this.treeService.toggleConjunction(this.root(), branchId);
    this.root.set(newRoot);
    this.treeChange.emit(newRoot);
  }

  /** Handle a node deletion from anywhere in the tree. */
  onNodeDelete(nodeId: string): void {
    const before = this.root();
    const newRoot = this.treeService.deleteNode(before, nodeId);
    if (treesEqual(before, newRoot)) return;
    this.root.set(newRoot);
    this.treeChange.emit(newRoot);
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Walk the tree and collect all cdkDropList IDs.
 * Every branch (including root) contributes one body-list ID.
 * Leaves have no drop lists.
 */
function collectDropListIds(node: FilterNode, ids: string[]): void {
  // A branch is any node that has a conjunction (or is root with empty children)
  if (typeof node.conjunction === "string" || node.children.length > 0) {
    ids.push(`drop-list-${node.id}`);
    for (const child of node.children) {
      collectDropListIds(child, ids);
    }
  }
}

/**
 * Deep structural equality check for two FilterNode trees.
 *
 * Compares id, conjunction, and children shape recursively. Used to detect
 * no-op drops — where the user released the node in its original position —
 * so we don't emit treeChange and trigger unnecessary downstream side effects.
 *
 * We intentionally do NOT compare expr — drop operations never mutate
 * expressions, only structure.
 */
function treesEqual(a: FilterNode, b: FilterNode): boolean {
  if (a.id !== b.id) return false;
  if (a.conjunction !== b.conjunction) return false;
  if (a.children.length !== b.children.length) return false;
  return a.children.every((child, i) => treesEqual(child, b.children[i]));
}