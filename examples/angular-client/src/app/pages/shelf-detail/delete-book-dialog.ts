import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";

export interface DeleteBookDialogData {
  bookName: string;
  bookTitle: string;
}

@Component({
  selector: "app-delete-book-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Delete Book</h2>
    <mat-dialog-content>
      <p>Are you sure you want to delete <strong>{{ data.bookTitle }}</strong>?</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)">Cancel</button>
      <button mat-flat-button color="warn" (click)="dialogRef.close(true)">Delete</button>
    </mat-dialog-actions>
  `,
})
export class DeleteBookDialogComponent {
  dialogRef = inject(MatDialogRef<DeleteBookDialogComponent>);
  data: DeleteBookDialogData = inject(MAT_DIALOG_DATA);
}
