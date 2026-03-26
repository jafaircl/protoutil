import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { FormField, form } from "@angular/forms/signals";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { create } from "@bufbuild/protobuf";
import { createValidator } from "@bufbuild/protovalidate";
import { validateMessageTree } from "@protoutil/angular";
import { CreateShelfRequestSchema } from "../../../gen/library/v1/library_pb";

const validator = createValidator();

@Component({
  selector: "app-create-shelf-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Create Shelf</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Theme</mat-label>
        <input matInput [formField]="f.shelf!.theme" />
        @if (f.shelf!.theme().errors().length) {
          <mat-error>{{ f.shelf!.theme().errors()[0].message }}</mat-error>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancel</button>
      <button mat-flat-button color="primary" (click)="save()">Create</button>
    </mat-dialog-actions>
  `,
  styles: `.full-width { width: 100%; }`,
})
export class CreateShelfDialogComponent {
  private dialogRef = inject(MatDialogRef<CreateShelfDialogComponent>);

  readonly msg = signal(create(CreateShelfRequestSchema, { shelf: { theme: "" } }));
  readonly f = form(this.msg, (path) => {
    validateMessageTree(path, validator, CreateShelfRequestSchema);
  });

  save(): void {
    if (this.f().errorSummary().length > 0) return;
    this.dialogRef.close({
      shelf: { theme: this.f.shelf!.theme().value() },
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
