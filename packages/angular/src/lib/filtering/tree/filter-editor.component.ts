/**
 * filter-editor.component.ts
 *
 * Top-level filter editor that combines the filter tree with the input
 * wrapper. The tree is hidden when the root has no children.
 *
 * When the user adds an expression via the input, it is appended as a
 * new leaf to the root branch. Tree mutations are re-emitted via the
 * `treeChange` output.
 *
 * Usage:
 *   <aip-filter-editor [declarations]="decls" (treeChange)="onTreeChange($event)" />
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import type { Decl, Expr } from "@protoutil/aip/filtering";

import { FilterInputComponent, type FilterInputMode } from "./filter-input.component";
import { createFilterBranchNode, exprToFilterNode, type FilterNode } from "./filter-node.model";
import { FilterTreeComponent } from "./filter-tree.component";

@Component({
  selector: "aip-filter-editor",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FilterTreeComponent, FilterInputComponent],
  templateUrl: "./filter-editor.component.html",
  styleUrls: ["./filter-editor.component.css"],
})
export class FilterEditorComponent {
  /** The available field declarations. */
  declarations = input<Decl[]>([]);

  /** Optional initial tree state. */
  initialTree = input<FilterNode | undefined>(undefined);

  /** Optional field name to pre-select in the stepper. */
  initialField = input<string | null>(null);

  /** The initial input mode for the input wrapper. */
  initialInputMode = input<FilterInputMode>("stepper");

  /** Emitted after every tree mutation. */
  treeChange = output<FilterNode>();

  /** Reference to the inner tree component. */
  readonly tree = viewChild(FilterTreeComponent);

  /**
   * The current root node. Initialized from `initialTree` input via a one-time
   * effect (to handle async query param resolution) without creating a feedback
   * loop when the parent re-derives initialTree from tree changes.
   */
  readonly root = signal<FilterNode>(createFilterBranchNode([], "_&&_"));

  constructor() {
    let applied = false;
    effect(() => {
      const tree = this.initialTree();
      if (tree != null && !applied) {
        applied = true;
        // If the initial tree is a leaf (single expression), wrap it in a
        // branch so the root is always a branch node.
        const normalized =
          tree.children.length === 0 && tree.expr != null
            ? createFilterBranchNode([tree], "_&&_")
            : tree;
        this.root.set(normalized);
      }
    });
  }

  /**
   * True when the tree should be visible: either it has children, or the
   * tree component has undo history (so the user can undo a clear-all).
   */
  readonly showTree = computed(
    () => this.root().children.length > 0 || (this.tree()?.canUndo() ?? false),
  );

  onTreeChange(node: FilterNode): void {
    this.root.set(node);
    this.treeChange.emit(node);
  }

  onExprAdd(expr: Expr): void {
    const currentRoot = this.root();
    const newNode = exprToFilterNode(expr);
    const newRoot = createFilterBranchNode(
      [...currentRoot.children, newNode],
      currentRoot.conjunction ?? "_&&_",
      currentRoot.id,
    );
    this.root.set(newRoot);

    const treeComp = this.tree();
    if (treeComp) {
      treeComp.applyExternalUpdate(newRoot);
    } else {
      // Tree not yet mounted — treeChange triggers showTree(),
      // and ngOnInit will pick up root() as initialTree.
      this.treeChange.emit(newRoot);
    }
  }
}
