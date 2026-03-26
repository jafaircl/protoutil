/**
 * filter-text-input.component.ts
 *
 * A free-text filter input that validates an AIP filter string in real time
 * using Angular 21 signal forms. Validation is debounced and powered by
 * `validateAipFilter` from @protoutil/angular.
 *
 * The submit button is disabled until the form is valid (i.e. the text
 * parses, type-checks, and evaluates to a boolean expression).
 *
 * Usage:
 *   <aip-filter-text-input [declarations]="decls" (exprAdd)="onAdd($event)" />
 */

import { ChangeDetectionStrategy, Component, computed, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { debounce, FormField, form } from "@angular/forms/signals";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { check, type Decl, type Expr, parse } from "@protoutil/aip/filtering";
import { validateAipFilter } from "../validate-aip-filter";

@Component({
  selector: "aip-filter-text-input",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    FormField,
  ],
  templateUrl: "./filter-text-input.component.html",
  styleUrls: ["./filter-text-input.component.css"],
})
export class FilterTextInputComponent {
  // -----------------------------------------------------------------------
  // Inputs / Outputs
  // -----------------------------------------------------------------------

  /** The available field declarations for type-checking. */
  declarations = input<Decl[]>([]);

  /** Placeholder text for the input. */
  placeholder = input(
    $localize`:@@filterTextInput.placeholder:e.g. status = "ACTIVE" AND priority > 3`,
  );

  /** Label shown inside the form field. */
  label = input($localize`:@@filterTextInput.label:Filter expression`);

  /** Text on the submit button. */
  submitLabel = input($localize`:@@filterTextInput.submitLabel:Add`);

  /** Emitted when the user submits a valid filter expression. */
  exprAdd = output<Expr>();

  // -----------------------------------------------------------------------
  // Signal form
  // -----------------------------------------------------------------------

  /** Declarations as a signal accessor for use in the form validator. */
  private readonly decls = computed(() => this.declarations());

  readonly filterForm = form(signal(""), (path) => {
    debounce(path, 300);
    validateAipFilter(path, () => this.decls());
  });

  // -----------------------------------------------------------------------
  // Computed
  // -----------------------------------------------------------------------

  readonly canSubmit = computed(() => {
    const value = this.filterForm().value().trim();
    return value.length > 0 && this.filterForm().valid();
  });

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  onSubmit(): void {
    if (!this.canSubmit()) return;

    const text = this.filterForm().value().trim();

    try {
      const parsed = parse(text);
      const { checkedExpr } = check(parsed, { decls: this.declarations(), source: text });

      if (checkedExpr.expr) {
        this.exprAdd.emit(checkedExpr.expr);
        this.filterForm().value.set("");
      }
    } catch {
      // Validation should have caught this, but guard defensively.
    }
  }
}
