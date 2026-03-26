import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { FormField, form } from "@angular/forms/signals";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { create } from "@bufbuild/protobuf";
import { createValidator } from "@bufbuild/protovalidate";
import { validateMessageTree } from "@protoutil/angular";
import { type Book, UpdateBookRequestSchema } from "../../../gen/library/v1/library_pb";

export interface EditBookDialogData {
  book: Book;
}

const validator = createValidator();

@Component({
  selector: "app-edit-book-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
  ],
  template: `
    <h2 mat-dialog-title>Edit Book</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Author</mat-label>
        <input matInput [formField]="f.book!.author" />
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Title</mat-label>
        <input matInput [formField]="f.book!.title" />
      </mat-form-field>
      <mat-checkbox [formField]="f.book!.read">Read</mat-checkbox>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancel</button>
      <button mat-flat-button color="primary" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `
    .full-width { width: 100%; }
    mat-checkbox { display: block; margin: 8px 0 16px; }
  `,
})
export class EditBookDialogComponent {
  private dialogRef = inject(MatDialogRef<EditBookDialogComponent>);
  private data: EditBookDialogData = inject(MAT_DIALOG_DATA);
  private original = this.data.book;

  readonly msg = signal(
    create(UpdateBookRequestSchema, {
      book: {
        name: this.original.name,
        author: this.original.author,
        title: this.original.title,
        read: this.original.read,
      },
      updateMask: { paths: [] },
    }),
  );
  readonly f = form(this.msg, (path) => {
    validateMessageTree(path, validator, UpdateBookRequestSchema);
  });

  private computeDirtyPaths(): string[] {
    const paths: string[] = [];
    if (this.f.book!.author().value() !== this.original.author) paths.push("author");
    if (this.f.book!.title().value() !== this.original.title) paths.push("title");
    if (this.f.book!.read().value() !== this.original.read) paths.push("read");
    return paths;
  }

  save(): void {
    const dirtyPaths = this.computeDirtyPaths();
    if (dirtyPaths.length === 0) {
      this.dialogRef.close(undefined);
      return;
    }
    this.dialogRef.close({
      book: {
        name: this.original.name,
        author: this.f.book!.author().value(),
        title: this.f.book!.title().value(),
        read: this.f.book!.read().value(),
      },
      updateMask: { paths: dirtyPaths },
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
