/**
 * filter-tree.component.ts
 *
 * The root component for the filter tree editor. It:
 *  • Owns the signal that holds the tree state (root FilterNode).
 *  • Maintains an undo/redo history stack of tree snapshots.
 *  • Computes the flat list of all cdkDropList IDs in the tree so every
 *    drop list can be connected to every other (enabling cross-list drag).
 *  • Handles drop, conjunction-toggle, and delete events emitted by
 *    FilterNodeComponent by delegating to FilterTreeService and writing
 *    the result back to the signal.
 *
 * Usage:
 *   <app-filter-tree [initialTree]="myRootNode" (treeChange)="onTreeChange($event)" />
 *
 * UNDO / REDO
 * -----------
 * Every successful mutation pushes the new root onto a history stack.
 * Undo and redo move a pointer through that stack. Keyboard shortcuts
 * (Cmd/Ctrl+Z for undo, Cmd/Ctrl+Shift+Z for redo) are bound via the
 * host element's keydown listener.
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
import { type DropPosition, type FilterTreeHistory, FilterTreeService } from "./filter-tree.service";

@Component({
  selector: "aip-filter-tree",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DragDropModule,
    FilterNodeComponent,
  ],
  templateUrl: "./filter-tree.component.html",
  styleUrls: ["./filter-tree.component.css"],
  host: {
    "(keydown)": "onKeydown($event)",
    tabindex: "0",
  },
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

  /** Emitted after every successful tree mutation (including undo/redo). */
  treeChange = output<FilterNode>();

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** The authoritative tree state. All mutations update this signal. */
  readonly root = signal<FilterNode>(
    createFilterBranchNode([], "_&&_"), // default empty root; replaced in ngOnInit
  );

  // -------------------------------------------------------------------------
  // Undo / Redo history
  // -------------------------------------------------------------------------

  private readonly history = signal<FilterTreeHistory>({ stack: [], index: 0 });

  /** True when there's at least one state to undo to. */
  readonly canUndo = computed(() => this.treeService.canUndo(this.history()));
  /** True when there's at least one state to redo to. */
  readonly canRedo = computed(() => this.treeService.canRedo(this.history()));

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
    const initial = this.initialTree() ?? this.root();
    this.root.set(initial);
    this.history.set(this.treeService.initHistory(initial));
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
    if (treesEqual(before, newRoot)) return;
    this.commitState(newRoot);
  }

  /** Handle a conjunction toggle from any branch. */
  onConjunctionToggle(branchId: string): void {
    const newRoot = this.treeService.toggleConjunction(this.root(), branchId);
    this.commitState(newRoot);
  }

  /** Handle a node deletion from anywhere in the tree. */
  onNodeDelete(nodeId: string): void {
    const before = this.root();
    const newRoot = this.treeService.deleteNode(before, nodeId);
    if (treesEqual(before, newRoot)) return;
    this.commitState(newRoot);
  }

  // -------------------------------------------------------------------------
  // Undo / Redo
  // -------------------------------------------------------------------------

  undo(): void {
    const next = this.treeService.undo(this.history());
    if (!next) return;
    this.history.set(next);
    const state = this.treeService.currentRoot(next);
    this.root.set(state);
    this.treeChange.emit(state);
  }

  redo(): void {
    const next = this.treeService.redo(this.history());
    if (!next) return;
    this.history.set(next);
    const state = this.treeService.currentRoot(next);
    this.root.set(state);
    this.treeChange.emit(state);
  }

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------

  onKeydown(event: KeyboardEvent): void {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    if (event.shiftKey) {
      this.redo();
    } else {
      this.undo();
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private commitState(newRoot: FilterNode): void {
    const next = this.treeService.commitState(this.history(), newRoot);
    this.history.set(next);
    this.root.set(newRoot);
    this.treeChange.emit(newRoot);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk the tree and collect all cdkDropList IDs.
 * Every branch (including root) contributes one body-list ID.
 * Leaves have no drop lists.
 */
function collectDropListIds(node: FilterNode, ids: string[]): void {
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
 * no-op drops so we don't push redundant history entries.
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