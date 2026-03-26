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
import { CreateBookRequestSchema } from "../../../gen/library/v1/library_pb";

export interface CreateBookDialogData {
  parent: string;
}

const validator = createValidator();

@Component({
  selector: "app-create-book-dialog",
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
    <h2 mat-dialog-title>Create Book</h2>
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
      <button mat-flat-button color="primary" (click)="save()">Create</button>
    </mat-dialog-actions>
  `,
  styles: `
    .full-width { width: 100%; }
    mat-checkbox { display: block; margin: 8px 0 16px; }
  `,
})
export class CreateBookDialogComponent {
  private dialogRef = inject(MatDialogRef<CreateBookDialogComponent>);
  private data: CreateBookDialogData = inject(MAT_DIALOG_DATA);

  readonly msg = signal(
    create(CreateBookRequestSchema, {
      parent: this.data.parent,
      book: { author: "", title: "", read: false },
    }),
  );
  readonly f = form(this.msg, (path) => {
    validateMessageTree(path, validator, CreateBookRequestSchema);
  });

  save(): void {
    if (this.f().errorSummary().length > 0) return;
    this.dialogRef.close({
      parent: this.data.parent,
      book: {
        author: this.f.book!.author().value(),
        title: this.f.book!.title().value(),
        read: this.f.book!.read().value(),
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
