/**
 * filter-stepper.component.spec.ts
 *
 * Unit tests for the filter stepper inline input component.
 */

import { Component, signal, viewChild } from "@angular/core";
import { type ComponentFixture, TestBed } from "@angular/core/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import type { Decl } from "@buf/googleapis_googleapis.bufbuild_es/google/api/expr/v1alpha1/checked_pb";
import { type Expr, ExprSchema, ident } from "@protoutil/aip/filtering";
import { operatorsForType, valueInputKindForType } from "./filter-operators.model";
import { FilterStepperComponent } from "./filter-stepper.component";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringDecl(name: string): Decl {
  return ident(name, { typeKind: { case: "primitive", value: 5 /* STRING */ } });
}

function intDecl(name: string): Decl {
  return ident(name, { typeKind: { case: "primitive", value: 2 /* INT64 */ } });
}

function boolDecl(name: string): Decl {
  return ident(name, { typeKind: { case: "primitive", value: 1 /* BOOL */ } });
}

// ---------------------------------------------------------------------------
// Test host
// ---------------------------------------------------------------------------

@Component({
  standalone: true,
  imports: [FilterStepperComponent],
  template: `<aip-filter-stepper [declarations]="decls" (exprAdd)="lastExpr = $event" />`,
})
class TestHostComponent {
  decls: Decl[] = [stringDecl("name"), intDecl("priority"), boolDecl("active")];
  lastExpr: Expr | null = null;
  stepper = viewChild.required(FilterStepperComponent);
}

@Component({
  standalone: true,
  imports: [FilterStepperComponent],
  template: `<aip-filter-stepper [declarations]="decls" [initialField]="initialField" (exprAdd)="lastExpr = $event" />`,
})
class InitialFieldHostComponent {
  decls: Decl[] = [stringDecl("name"), intDecl("priority"), boolDecl("active")];
  initialField: string | null = "priority";
  lastExpr: Expr | null = null;
  stepper = viewChild.required(FilterStepperComponent);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FilterStepperComponent", () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let comp: FilterStepperComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, InitialFieldHostComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    host = fixture.componentInstance;
    comp = host.stepper();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it("starts with no field selected", () => {
    expect(comp.selectedFieldName()).toBeNull();
  });

  it("shows only ident declarations as fields", () => {
    expect(comp.fields().length).toBe(3);
    expect(comp.fields().map((f) => f.name)).toEqual(["name", "priority", "active"]);
  });

  it("does not show operator step initially", () => {
    expect(comp.showOperator()).toBe(false);
  });

  it("does not show value step initially", () => {
    expect(comp.showValue()).toBe(false);
  });

  it("cannot add initially", () => {
    expect(comp.canAdd()).toBe(false);
  });

  it("renders the add button disabled when stepper is incomplete", () => {
    expect(comp.canAdd()).toBe(false);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector(".stepper-add") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
  });

  it("add button is always present in the DOM", () => {
    // Button should be present regardless of stepper completeness
    fixture.detectChanges();
    const btnBefore = fixture.nativeElement.querySelector(".stepper-add") as HTMLButtonElement;
    expect(btnBefore).not.toBeNull();

    // Complete all steps
    comp.selectedFieldName.set("name");
    comp.selectedOperatorFn.set("_==_");
    comp.valueText.set("Alice");
    fixture.detectChanges();
    const btnAfter = fixture.nativeElement.querySelector(".stepper-add") as HTMLButtonElement;
    expect(btnAfter).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // Field selection
  // -----------------------------------------------------------------------

  it("shows operator step after selecting a field", () => {
    comp.selectedFieldName.set("name");
    expect(comp.showOperator()).toBe(true);
  });

  it("provides string operators for a string field", () => {
    comp.selectedFieldName.set("name");
    const ops = comp.availableOperators();
    expect(ops.some((op) => op.filterFn === "startsWith")).toBe(true);
    expect(ops.some((op) => op.filterFn === "_==_")).toBe(true);
  });

  it("provides numeric operators for an int field", () => {
    comp.selectedFieldName.set("priority");
    const ops = comp.availableOperators();
    expect(ops.some((op) => op.filterFn === "_<_")).toBe(true);
    expect(ops.some((op) => op.filterFn === "_>_")).toBe(true);
    // String methods should NOT be present.
    expect(ops.some((op) => op.filterFn === "startsWith")).toBe(false);
  });

  it("provides boolean operators for a bool field", () => {
    comp.selectedFieldName.set("active");
    const ops = comp.availableOperators();
    expect(ops.some((op) => op.filterFn === "_==_")).toBe(true);
    // No ordering.
    expect(ops.some((op) => op.filterFn === "_<_")).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Operator selection
  // -----------------------------------------------------------------------

  it("shows value step after selecting an operator", () => {
    comp.selectedFieldName.set("name");
    comp.selectedOperatorFn.set("_==_");
    expect(comp.showValue()).toBe(true);
  });

  it("shows text input for string fields", () => {
    comp.selectedFieldName.set("name");
    expect(comp.valueKind()).toBe("text");
  });

  it("shows number input for int fields", () => {
    comp.selectedFieldName.set("priority");
    expect(comp.valueKind()).toBe("number");
  });

  it("shows boolean toggle for bool fields", () => {
    comp.selectedFieldName.set("active");
    expect(comp.valueKind()).toBe("boolean");
  });

  // -----------------------------------------------------------------------
  // Add — string comparison
  // -----------------------------------------------------------------------

  it("emits a comparison Expr for a string equality filter", () => {
    comp.selectedFieldName.set("name");
    comp.selectedOperatorFn.set("_==_");
    comp.valueText.set("Alice");
    comp.onAdd();

    expect(host.lastExpr).not.toBeNull();
    const expr = host.lastExpr!;
    expect(expr.exprKind.case).toBe("callExpr");
    if (expr.exprKind.case === "callExpr") {
      expect(expr.exprKind.value.function).toBe("_==_");
      expect(expr.exprKind.value.args.length).toBe(2);
    }
  });

  // -----------------------------------------------------------------------
  // Add — method call
  // -----------------------------------------------------------------------

  it("emits a method Expr for a string startsWith filter", () => {
    comp.selectedFieldName.set("name");
    comp.selectedOperatorFn.set("startsWith");
    comp.valueText.set("Al");
    comp.onAdd();

    expect(host.lastExpr).not.toBeNull();
    const expr = host.lastExpr!;
    if (expr.exprKind.case === "callExpr") {
      expect(expr.exprKind.value.function).toBe("startsWith");
      expect(expr.exprKind.value.target).toBeDefined();
      expect(expr.exprKind.value.args.length).toBe(1);
    }
  });

  // -----------------------------------------------------------------------
  // Add — numeric
  // -----------------------------------------------------------------------

  it("emits an int64 constant for an integer value", () => {
    comp.selectedFieldName.set("priority");
    comp.selectedOperatorFn.set("_>_");
    comp.valueText.set("3");
    comp.onAdd();

    const expr = host.lastExpr!;
    if (expr.exprKind.case === "callExpr") {
      const valueArg = expr.exprKind.value.args[1];
      if (valueArg.exprKind.case === "constExpr") {
        expect(valueArg.exprKind.value.constantKind.case).toBe("int64Value");
      }
    }
  });

  it("emits a double constant for a decimal value", () => {
    comp.selectedFieldName.set("priority");
    comp.selectedOperatorFn.set("_==_");
    comp.valueText.set("3.5");
    comp.onAdd();

    const expr = host.lastExpr!;
    if (expr.exprKind.case === "callExpr") {
      const valueArg = expr.exprKind.value.args[1];
      if (valueArg.exprKind.case === "constExpr") {
        expect(valueArg.exprKind.value.constantKind.case).toBe("doubleValue");
      }
    }
  });

  // -----------------------------------------------------------------------
  // Add — boolean
  // -----------------------------------------------------------------------

  it("emits a bool constant for a boolean field", () => {
    comp.selectedFieldName.set("active");
    comp.selectedOperatorFn.set("_==_");
    comp.valueBool.set(false);
    comp.onAdd();

    const expr = host.lastExpr!;
    if (expr.exprKind.case === "callExpr") {
      const valueArg = expr.exprKind.value.args[1];
      if (valueArg.exprKind.case === "constExpr") {
        expect(valueArg.exprKind.value.constantKind.case).toBe("boolValue");
        expect(valueArg.exprKind.value.constantKind.value).toBe(false);
      }
    }
  });

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  it("resets all steps after a successful add", () => {
    comp.selectedFieldName.set("name");
    comp.selectedOperatorFn.set("_==_");
    comp.valueText.set("Alice");
    comp.onAdd();

    expect(comp.selectedFieldName()).toBeNull();
    expect(comp.selectedOperatorFn()).toBeNull();
    expect(comp.valueText()).toBe("");
    expect(comp.showOperator()).toBe(false);
  });

  it("does not emit when value is empty", () => {
    comp.selectedFieldName.set("name");
    comp.selectedOperatorFn.set("_==_");
    comp.valueText.set("");
    comp.onAdd();
    expect(host.lastExpr).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Downstream reset on upstream change
  // -----------------------------------------------------------------------

  it("resets operator when field changes", () => {
    comp.selectedFieldName.set("name");
    comp.selectedOperatorFn.set("_==_");
    comp.selectedFieldName.set("priority");
    TestBed.tick();
    expect(comp.selectedOperatorFn()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // initialField
  // -----------------------------------------------------------------------

  it("pre-selects a field when initialField is set", async () => {
    const f2 = TestBed.createComponent(InitialFieldHostComponent);
    f2.detectChanges();
    await f2.whenStable();
    const stepper = f2.componentInstance.stepper();
    expect(stepper.selectedFieldName()).toBe("priority");
    expect(stepper.showOperator()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Operator model unit tests
// ---------------------------------------------------------------------------

describe("operatorsForType", () => {
  it("returns string operators for STRING primitive", () => {
    const ops = operatorsForType({ typeKind: { case: "primitive", value: 5 } } as any);
    expect(ops.some((o) => o.filterFn === "startsWith")).toBe(true);
  });

  it("returns numeric operators for INT64 primitive", () => {
    const ops = operatorsForType({ typeKind: { case: "primitive", value: 2 } } as any);
    expect(ops.some((o) => o.filterFn === "_<_")).toBe(true);
    expect(ops.some((o) => o.filterFn === "startsWith")).toBe(false);
  });

  it("returns equality-only for BOOL primitive", () => {
    const ops = operatorsForType({ typeKind: { case: "primitive", value: 1 } } as any);
    expect(ops.length).toBe(2);
    expect(ops.every((o) => o.filterFn === "_==_" || o.filterFn === "_!=_")).toBe(true);
  });

  it("returns equality-only for undefined type", () => {
    const ops = operatorsForType(undefined);
    expect(ops.length).toBe(2);
  });
});

describe("valueInputKindForType", () => {
  it("returns 'boolean' for BOOL", () => {
    expect(valueInputKindForType({ typeKind: { case: "primitive", value: 1 } } as any)).toBe(
      "boolean",
    );
  });

  it("returns 'number' for INT64", () => {
    expect(valueInputKindForType({ typeKind: { case: "primitive", value: 2 } } as any)).toBe(
      "number",
    );
  });

  it("returns 'text' for STRING", () => {
    expect(valueInputKindForType({ typeKind: { case: "primitive", value: 5 } } as any)).toBe(
      "text",
    );
  });

  it("returns 'text' for undefined", () => {
    expect(valueInputKindForType(undefined)).toBe("text");
  });
});
