import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";

export interface DeleteShelfDialogData {
  shelfName: string;
  shelfTheme: string;
}

@Component({
  selector: "app-delete-shelf-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Delete Shelf</h2>
    <mat-dialog-content>
      <p>Are you sure you want to delete the shelf <strong>{{ data.shelfTheme }}</strong>?</p>
      <p class="warning">This will also delete all books on this shelf.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)">Cancel</button>
      <button mat-flat-button color="warn" (click)="dialogRef.close(true)">Delete</button>
    </mat-dialog-actions>
  `,
  styles: `.warning { color: var(--mat-sys-error); }`,
})
export class DeleteShelfDialogComponent {
  dialogRef = inject(MatDialogRef<DeleteShelfDialogComponent>);
  data: DeleteShelfDialogData = inject(MAT_DIALOG_DATA);
}
