/**
 * filter-text-input.component.spec.ts
 *
 * Unit tests for the free-text filter input component.
 * Tests exercise the component's signal form validation and submit behavior.
 */

import { Component, viewChild } from "@angular/core";
import { type ComponentFixture, TestBed } from "@angular/core/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { type Decl, type Expr, ident } from "@protoutil/aip/filtering";

import { FilterTextInputComponent } from "./filter-text-input.component";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringDecl(name: string): Decl {
  return ident(name, { typeKind: { case: "primitive", value: 5 } });
}

function intDecl(name: string): Decl {
  return ident(name, { typeKind: { case: "primitive", value: 2 } });
}

/** Set the form value and wait for debounce (300ms) + stabilize. */
function typeAndWait(
  comp: FilterTextInputComponent,
  text: string,
  fixture: ComponentFixture<unknown>,
): void {
  comp.filterForm().value.set(text);
  vi.advanceTimersByTime(350);
  fixture.detectChanges();
}

// ---------------------------------------------------------------------------
// Test host
// ---------------------------------------------------------------------------

@Component({
  standalone: true,
  imports: [FilterTextInputComponent],
  template: `<aip-filter-text-input [declarations]="decls" (exprAdd)="lastExpr = $event" />`,
})
class TestHostComponent {
  decls: Decl[] = [stringDecl("status"), intDecl("priority")];
  lastExpr: Expr | null = null;
  textInput = viewChild.required(FilterTextInputComponent);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FilterTextInputComponent", () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let comp: FilterTextInputComponent;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    host = fixture.componentInstance;
    comp = host.textInput();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it("starts with empty text", () => {
    expect(comp.filterForm().value()).toBe("");
  });

  it("cannot submit when empty", () => {
    expect(comp.canSubmit()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Valid expression
  // -----------------------------------------------------------------------

  it("enables submit for a valid filter after debounce", () => {
    typeAndWait(comp, 'status = "ACTIVE"', fixture);
    expect(comp.canSubmit()).toBe(true);
  });

  it("emits an Expr on submit for a valid filter", () => {
    typeAndWait(comp, 'status = "ACTIVE"', fixture);
    comp.onSubmit();
    expect(host.lastExpr).not.toBeNull();
  });

  it("resets text after a successful submit", () => {
    typeAndWait(comp, 'status = "ACTIVE"', fixture);
    comp.onSubmit();
    expect(comp.filterForm().value()).toBe("");
  });

  it("enables submit for a numeric comparison", () => {
    typeAndWait(comp, "priority > 3", fixture);
    expect(comp.canSubmit()).toBe(true);
  });

  it("enables submit for a compound expression", () => {
    typeAndWait(comp, 'status = "ACTIVE" AND priority > 3', fixture);
    expect(comp.canSubmit()).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Invalid expression
  // -----------------------------------------------------------------------

  it("disables submit for an unparseable expression", () => {
    typeAndWait(comp, "=== invalid", fixture);
    expect(comp.canSubmit()).toBe(false);
  });

  it("shows validation errors for an invalid expression", () => {
    typeAndWait(comp, "=== invalid", fixture);
    expect(comp.filterForm().errors().length).toBeGreaterThan(0);
  });

  it("does not emit on submit when invalid", () => {
    typeAndWait(comp, "=== invalid", fixture);
    comp.onSubmit();
    expect(host.lastExpr).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Error clearing
  // -----------------------------------------------------------------------

  it("clears errors when text becomes valid", () => {
    typeAndWait(comp, "=== bad", fixture);
    expect(comp.filterForm().errors().length).toBeGreaterThan(0);

    typeAndWait(comp, 'status = "ACTIVE"', fixture);
    expect(comp.filterForm().errors().length).toBe(0);
    expect(comp.canSubmit()).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it("does not emit for empty input on submit", () => {
    comp.filterForm().value.set("");
    vi.advanceTimersByTime(350);
    comp.onSubmit();
    expect(host.lastExpr).toBeNull();
  });

  it("does not emit for whitespace-only input", () => {
    typeAndWait(comp, "   ", fixture);
    comp.onSubmit();
    expect(host.lastExpr).toBeNull();
  });
});
