/**
 * filter-stepper.component.ts
 *
 * A lightweight inline stepper for building a filter leaf expression.
 * The user selects a field (from declared Decls), an operator (determined
 * by the field's type), and a value, then clicks "Add" to emit the
 * constructed Expr.
 *
 * The component resets after each successful add.
 *
 * Usage:
 *   <aip-filter-stepper [declarations]="decls" (exprAdd)="onAdd($event)" />
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import type { Decl } from "@buf/googleapis_googleapis.bufbuild_es/google/api/expr/v1alpha1/checked_pb";
import { create } from "@bufbuild/protobuf";
import { type Expr, ExprSchema } from "@protoutil/aip/filtering";

import {
  type FilterOperator,
  operatorsForType,
  type ValueInputKind,
  valueInputKindForType,
} from "./filter-operators.model";

@Component({
  selector: "aip-filter-stepper",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: "./filter-stepper.component.html",
  styleUrls: ["./filter-stepper.component.css"],
})
export class FilterStepperComponent {
  // -----------------------------------------------------------------------
  // Inputs / Outputs
  // -----------------------------------------------------------------------

  /** The available field declarations. */
  declarations = input.required<Decl[]>();

  /** Optional field name to pre-select. */
  initialField = input<string | null>(null);

  /** Emitted when the user completes all steps and adds a filter. */
  exprAdd = output<Expr>();

  // -----------------------------------------------------------------------
  // String inputs (i18n)
  // -----------------------------------------------------------------------

  fieldLabel = input($localize`:@@filterStepper.fieldLabel:Field`);
  operatorLabel = input($localize`:@@filterStepper.operatorLabel:Operator`);
  valueLabel = input($localize`:@@filterStepper.valueLabel:Value`);
  addLabel = input($localize`:@@filterStepper.addLabel:Add`);
  boolTrueLabel = input($localize`:@@filterStepper.boolTrueLabel:true`);
  boolFalseLabel = input($localize`:@@filterStepper.boolFalseLabel:false`);

  /** Override display labels for operators by filterFn key. */
  operatorLabels = input<Partial<Record<string, string>>>({});

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  /** Currently selected Decl (by name). */
  readonly selectedFieldName = signal<string | null>(null);

  /** Currently selected operator filterFn. */
  readonly selectedOperatorFn = signal<string | null>(null);

  /** Value entered by the user. */
  readonly valueText = signal<string>("");

  /** Boolean value for boolean fields. */
  readonly valueBool = signal<boolean>(true);

  // -----------------------------------------------------------------------
  // Computed — field
  // -----------------------------------------------------------------------

  /** Only ident declarations (not functions). */
  readonly fields = computed(() => this.declarations().filter((d) => d.declKind.case === "ident"));

  /** The currently selected Decl object. */
  readonly selectedDecl = computed(() =>
    this.fields().find((d) => d.name === this.selectedFieldName()),
  );

  /** The Type of the selected field's ident declaration. */
  readonly selectedType = computed(() => {
    const decl = this.selectedDecl();
    if (decl?.declKind.case === "ident") return decl.declKind.value.type;
    return undefined;
  });

  // -----------------------------------------------------------------------
  // Computed — operator
  // -----------------------------------------------------------------------

  /** Operators available for the selected field type. */
  readonly availableOperators = computed(() => operatorsForType(this.selectedType()));

  /** The currently selected operator object. */
  readonly selectedOperator = computed<FilterOperator | undefined>(() => {
    const fn = this.selectedOperatorFn();
    return this.availableOperators().find((op) => op.filterFn === fn);
  });

  // -----------------------------------------------------------------------
  // Computed — value
  // -----------------------------------------------------------------------

  /** What kind of value input to show. */
  readonly valueKind = computed<ValueInputKind>(() => valueInputKindForType(this.selectedType()));

  // -----------------------------------------------------------------------
  // Computed — step visibility
  // -----------------------------------------------------------------------

  /** Show the operator step when a field is selected. */
  readonly showOperator = computed(() => this.selectedFieldName() !== null);

  /** Show the value step when an operator is selected. */
  readonly showValue = computed(() => this.selectedOperator() !== undefined);

  /** Enable the add button when all steps are filled. */
  readonly canAdd = computed(() => {
    if (!this.selectedDecl() || !this.selectedOperator()) return false;
    if (this.valueKind() === "boolean") return true;
    return this.valueText().trim().length > 0;
  });

  // -----------------------------------------------------------------------
  // Effects — reset downstream when upstream changes
  // -----------------------------------------------------------------------

  constructor() {
    // Apply initialField when it changes.
    effect(() => {
      const field = this.initialField();
      if (field != null) {
        this.selectedFieldName.set(field);
      }
    });

    // When field changes, reset operator and value.
    effect(() => {
      this.selectedFieldName(); // track
      this.selectedOperatorFn.set(null);
      this.valueText.set("");
      this.valueBool.set(true);
    });

    // When operator changes, reset value.
    effect(() => {
      this.selectedOperatorFn(); // track
      this.valueText.set("");
      this.valueBool.set(true);
    });
  }

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  onAdd(): void {
    if (!this.canAdd()) return;

    const expr = this.buildExpr();
    if (expr) {
      this.exprAdd.emit(expr);
      this.reset();
    }
  }

  reset(): void {
    this.selectedFieldName.set(null);
    this.selectedOperatorFn.set(null);
    this.valueText.set("");
    this.valueBool.set(true);
  }

  // -----------------------------------------------------------------------
  // Expr construction
  // -----------------------------------------------------------------------

  private buildExpr(): Expr | undefined {
    const fieldName = this.selectedFieldName();
    const operator = this.selectedOperator();
    if (!fieldName || !operator) return undefined;

    const fieldExpr = create(ExprSchema, {
      exprKind: { case: "identExpr", value: { name: fieldName } },
    });

    const valueExpr = this.buildValueExpr();
    if (!valueExpr) return undefined;

    if (operator.kind === "comparison") {
      // Binary infix: fieldExpr <op> valueExpr
      return create(ExprSchema, {
        exprKind: {
          case: "callExpr",
          value: {
            function: operator.filterFn,
            args: [fieldExpr, valueExpr],
          },
        },
      });
    }

    // Method call: fieldExpr.method(valueExpr)
    return create(ExprSchema, {
      exprKind: {
        case: "callExpr",
        value: {
          function: operator.filterFn,
          target: fieldExpr,
          args: [valueExpr],
        },
      },
    });
  }

  private buildValueExpr(): Expr | undefined {
    const kind = this.valueKind();

    if (kind === "boolean") {
      return create(ExprSchema, {
        exprKind: {
          case: "constExpr",
          value: { constantKind: { case: "boolValue", value: this.valueBool() } },
        },
      });
    }

    if (kind === "number") {
      const num = Number(this.valueText());
      if (Number.isNaN(num)) return undefined;
      // Use int64 for integers, double for decimals.
      if (Number.isInteger(num)) {
        return create(ExprSchema, {
          exprKind: {
            case: "constExpr",
            value: { constantKind: { case: "int64Value", value: BigInt(num) } },
          },
        });
      }
      return create(ExprSchema, {
        exprKind: {
          case: "constExpr",
          value: { constantKind: { case: "doubleValue", value: num } },
        },
      });
    }

    // String
    return create(ExprSchema, {
      exprKind: {
        case: "constExpr",
        value: { constantKind: { case: "stringValue", value: this.valueText() } },
      },
    });
  }
}
