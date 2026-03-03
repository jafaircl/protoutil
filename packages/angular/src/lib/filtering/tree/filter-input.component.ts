/**
 * filter-input.component.ts
 *
 * Wrapper that toggles between the guided stepper input and the free-text
 * input. A pair of icon buttons lets the user switch modes.
 *
 * Usage:
 *   <aip-filter-input [declarations]="decls" (exprAdd)="onAdd($event)" />
 */

import { ChangeDetectionStrategy, Component, input, output, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import type { Decl } from "@buf/googleapis_googleapis.bufbuild_es/google/api/expr/v1alpha1/checked_pb";
import type { Expr } from "@protoutil/aip/filtering";

import { FilterStepperComponent } from "./filter-stepper.component";
import { FilterTextInputComponent } from "./filter-text-input.component";

export type FilterInputMode = "stepper" | "text";

@Component({
  selector: "aip-filter-input",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    FilterStepperComponent,
    FilterTextInputComponent,
  ],
  templateUrl: "./filter-input.component.html",
  styleUrls: ["./filter-input.component.css"],
})
export class FilterInputComponent {
  /** The available field declarations for the stepper and text input. */
  declarations = input<Decl[]>([]);

  /** The initial input mode. */
  initialMode = input<FilterInputMode>("stepper");

  /** Emitted when the user submits a valid filter expression. */
  exprAdd = output<Expr>();

  /** The currently active input mode. */
  readonly mode = signal<FilterInputMode>("stepper");

  ngOnInit(): void {
    this.mode.set(this.initialMode());
  }

  setMode(mode: FilterInputMode): void {
    this.mode.set(mode);
  }

  toggleMode(): void {
    this.mode.set(this.mode() === "stepper" ? "text" : "stepper");
  }

  onExprAdd(expr: Expr): void {
    this.exprAdd.emit(expr);
  }
}
