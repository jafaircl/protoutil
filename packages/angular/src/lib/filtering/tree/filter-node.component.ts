/**
 * filter-node.component.ts
 *
 * Recursive component that renders a single FilterNode (leaf or branch).
 *
 * Leaves are rendered as `mat-chip` elements with a drag handle in the
 * leading (avatar) slot and `matChipRemove` for deletion.
 *
 * Branches use a flat left-rail style with a `mat-button-toggle-group`
 * for the AND/OR conjunction.
 *
 * ZONE DISPLAY
 * ------------
 * This component does NOT compute zones itself. All zone logic lives in
 * FilterTreeDragStateService.updatePointer(), which publishes one atomic
 * signal: activeDropZone = { branchId, zone }.
 *
 * Each branch instance reads that signal and checks: "is MY branchId the
 * active one?" If yes, it activates the matching gap or item overlay.
 * If no, it shows nothing. This makes overlap impossible by design.
 *
 * See FilterTreeDragStateService for the full algorithm.
 */

import {
  type CdkDragDrop,
  type CdkDragMove,
  DragDropModule,
} from "@angular/cdk/drag-drop";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { unparse } from "@protoutil/aip/filtering";

import { type FilterNode, isFilterBranchNode, isFilterLeafNode } from "./filter-node.model";
import type { DropPosition } from "./filter-tree.service";
import { FilterTreeDragStateService } from "./filter-tree-drag-state.service";

@Component({
  selector: "aip-filter-node",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DragDropModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: "./filter-node.component.html",
  styleUrls: ["./filter-node.component.css"],
})
export class FilterNodeComponent {
  // -------------------------------------------------------------------------
  // Inputs / Outputs
  // -------------------------------------------------------------------------

  node = input.required<FilterNode>();
  isRoot = input<boolean>(false);
  root = input.required<FilterNode>();
  allDropListIds = input<string[]>([]);

  /**
   * True when this node is the active item-center drop target in its parent
   * branch. Used to highlight the chip or branch header.
   * Passed in by the parent's @for loop via isItemActive(i).
   */
  isDropTarget = input<boolean>(false);

  /** Whether undo is available — only used by the root branch header. */
  canUndo = input<boolean>(false);
  /** Whether redo is available — only used by the root branch header. */
  canRedo = input<boolean>(false);

  /** Final resolved drop — emitted after the root resolves the position. */
  nodeDrop = output<{ dragId: string; position: DropPosition }>();
  conjunctionToggle = output<string>();
  /** Emitted when the user clicks the delete button on a node. */
  nodeDelete = output<string>();
  /** Emitted when the root undo button is clicked. */
  undoClick = output<void>();
  /** Emitted when the root redo button is clicked. */
  redoClick = output<void>();

  // -------------------------------------------------------------------------
  // Services
  // -------------------------------------------------------------------------

  readonly dragState = inject(FilterTreeDragStateService);

  // -------------------------------------------------------------------------
  // Computed display helpers
  // -------------------------------------------------------------------------

  isLeaf = computed(() => isFilterLeafNode(this.node()));
  isBranch = computed(() => isFilterBranchNode(this.node()));

  leafLabel = computed(() => {
    const n = this.node();
    if (n.expr == null) return $localize`:@@filterNode.emptyLeaf:(empty)`;
    try {
      return unparse(n.expr);
    } catch {
      return $localize`:@@filterNode.invalidExpr:(invalid expr)`;
    }
  });

  conjunctionLabel = computed(() =>
    this.node().conjunction === "_&&_"
      ? $localize`:@@filterNode.conjunction.and:AND`
      : $localize`:@@filterNode.conjunction.or:OR`,
  );

  conjunctionAriaLabel = computed(() =>
    $localize`:@@filterNode.conjunction.ariaLabel:Conjunction, currently ${this.conjunctionLabel()}:conjunction:`,
  );
  dropListId = computed(() => `drop-list-${this.node().id}`);
  isDragging = this.dragState.isDragging;

  /** True when THIS node is the one currently being dragged. */
  isSelfDragging = computed(() => this.dragState.currentDragId() === this.node().id);

  /**
   * True only when THIS branch is the active drop target.
   * Computed from the service's single activeDropZone signal.
   */
  isActiveBranch = computed(() => {
    return this.dragState.activeDropZone()?.branchId === this.node().id;
  });

  // -------------------------------------------------------------------------
  // Template zone-query helpers
  // Called from the @for loop — only return true when THIS branch is active.
  // -------------------------------------------------------------------------

  /** Is the gap at index `i` (before child i) currently active? */
  isGapActive(i: number): boolean {
    if (!this.isActiveBranch()) return false;
    const z = this.dragState.activeDropZone()?.zone;
    return z?.kind === "gap" && z.index === i;
  }

  /** Is the trailing gap (after the last child) currently active? */
  isTrailingGapActive(): boolean {
    if (!this.isActiveBranch()) return false;
    const z = this.dragState.activeDropZone()?.zone;
    return z?.kind === "gap" && z.index === this.node().children.length;
  }

  /** Is the item-center merge zone for child[i] currently active? */
  isItemActive(i: number): boolean {
    if (!this.isActiveBranch()) return false;
    const z = this.dragState.activeDropZone()?.zone;
    return z?.kind === "item" && z.index === i;
  }

  // -------------------------------------------------------------------------
  // CDK drag events
  // -------------------------------------------------------------------------

  onDragStarted(): void {
    this.dragState.startDrag(this.node().id);
  }

  onDragEnded(): void {
    this.dragState.endDrag();
  }

  /** Forward pointer position to the service on every drag-move tick. */
  onDragMoved(event: CdkDragMove): void {
    this.dragState.updatePointer(event.pointerPosition.x, event.pointerPosition.y);
  }

  // -------------------------------------------------------------------------
  // Drop handler
  // -------------------------------------------------------------------------

  /**
   * CDK fires this when an item is dropped into THIS branch's drop list.
   *
   * Resolves the drop position by running findDeepestBranchZone fresh at the
   * drop coordinates — the same geometry used for hover highlighting — then
   * emits nodeDrop with the fully resolved position. The root FilterTreeComponent
   * applies the mutation.
   */
  onDrop(event: CdkDragDrop<FilterNode[]>): void {
    const dragId: string = event.item.data;
    const position = this.dragState.resolveDropPosition(
      event.dropPoint.x,
      event.dropPoint.y,
      dragId,
      this.root(),
    );
    if (!position) return;
    this.nodeDrop.emit({ dragId, position });
  }

  // -------------------------------------------------------------------------
  // Conjunction toggle + event bubbling
  // -------------------------------------------------------------------------

  onToggleConjunction(): void {
    this.conjunctionToggle.emit(this.node().id);
  }

  onChildDrop(event: unknown): void {
    this.nodeDrop.emit(event as { dragId: string; position: DropPosition });
  }

  onChildConjunctionToggle(branchId: unknown): void {
    this.conjunctionToggle.emit(branchId as string);
  }

  onDeleteNode(): void {
    this.nodeDelete.emit(this.node().id);
  }

  onChildDelete(nodeId: unknown): void {
    this.nodeDelete.emit(nodeId as string);
  }
}