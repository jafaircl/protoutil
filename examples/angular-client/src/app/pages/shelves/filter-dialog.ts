import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import type { Decl } from "@protoutil/aip/filtering";
import { FilterEditorComponent, type FilterNode } from "@protoutil/angular";

export interface FilterDialogData {
  declarations: Decl[];
  initialTree?: FilterNode;
  initialField?: string | null;
}

@Component({
  selector: "app-filter-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, FilterEditorComponent],
  template: `
    <h2 mat-dialog-title>Filter</h2>
    <mat-dialog-content>
      <aip-filter-editor
        [declarations]="data.declarations"
        [initialTree]="data.initialTree"
        [initialField]="data.initialField ?? null"
        (treeChange)="onTreeChange($event)"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancel</button>
      <button mat-flat-button color="primary" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-width: 480px;
    }
  `,
})
export class FilterDialogComponent {
  private dialogRef = inject(MatDialogRef<FilterDialogComponent>);
  data: FilterDialogData = inject(MAT_DIALOG_DATA);

  readonly pendingTree = signal<FilterNode | undefined>(undefined);
  readonly dirty = signal(false);

  onTreeChange(node: FilterNode): void {
    this.pendingTree.set(node);
    this.dirty.set(true);
  }

  save(): void {
    this.dialogRef.close(this.dirty() ? this.pendingTree() : this.data.initialTree);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
