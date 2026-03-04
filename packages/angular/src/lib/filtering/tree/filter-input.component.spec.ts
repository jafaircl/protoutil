/**
 * filter-input.component.spec.ts
 *
 * Unit tests for the FilterInputComponent wrapper that toggles
 * between stepper and text input modes.
 */

import { Component, viewChild } from "@angular/core";
import { type ComponentFixture, TestBed } from "@angular/core/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { type Decl, type Expr, ident } from "@protoutil/aip/filtering";

import { FilterInputComponent, type FilterInputMode } from "./filter-input.component";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringDecl(name: string): Decl {
  return ident(name, { typeKind: { case: "primitive", value: 5 } });
}

// ---------------------------------------------------------------------------
// Test hosts
// ---------------------------------------------------------------------------

@Component({
  standalone: true,
  imports: [FilterInputComponent],
  template: `<aip-filter-input
    [declarations]="decls"
    [initialMode]="initialMode"
    (exprAdd)="lastExpr = $event"
  />`,
})
class TestHostComponent {
  decls: Decl[] = [stringDecl("name")];
  initialMode: FilterInputMode = "stepper";
  lastExpr: Expr | null = null;
  input = viewChild.required(FilterInputComponent);
}

@Component({
  standalone: true,
  imports: [FilterInputComponent],
  template: `<aip-filter-input [declarations]="decls" initialMode="text" />`,
})
class TextModeHostComponent {
  decls: Decl[] = [stringDecl("name")];
  input = viewChild.required(FilterInputComponent);
}

@Component({
  standalone: true,
  imports: [FilterInputComponent],
  template: `<aip-filter-input [declarations]="decls" [initialField]="initialField" />`,
})
class InitialFieldHostComponent {
  decls: Decl[] = [stringDecl("name"), stringDecl("status")];
  initialField: string | null = "status";
  input = viewChild.required(FilterInputComponent);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FilterInputComponent", () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let comp: FilterInputComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TestHostComponent,
        TextModeHostComponent,
        InitialFieldHostComponent,
        NoopAnimationsModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    host = fixture.componentInstance;
    comp = host.input();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it("defaults to stepper mode", () => {
    expect(comp.mode()).toBe("stepper");
  });

  it("respects initialMode input", async () => {
    const textFixture = TestBed.createComponent(TextModeHostComponent);
    textFixture.detectChanges();
    const textComp = textFixture.componentInstance.input();
    expect(textComp.mode()).toBe("text");
  });

  // -----------------------------------------------------------------------
  // Mode toggling
  // -----------------------------------------------------------------------

  it("switches to text mode", () => {
    comp.mode.set("text");
    expect(comp.mode()).toBe("text");
  });

  it("switches back to stepper mode", () => {
    comp.mode.set("text");
    comp.mode.set("stepper");
    expect(comp.mode()).toBe("stepper");
  });

  // -----------------------------------------------------------------------
  // Expression forwarding
  // -----------------------------------------------------------------------

  it("forwards exprAdd from child component", () => {
    const mockExpr = { exprKind: { case: "identExpr" as const, value: { name: "test" } } } as Expr;
    comp.onExprAdd(mockExpr);
    expect(host.lastExpr).toBe(mockExpr);
  });

  // -----------------------------------------------------------------------
  // DOM — mode-dependent rendering
  // -----------------------------------------------------------------------

  it("renders the stepper component in stepper mode", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("aip-filter-stepper")).not.toBeNull();
    expect(el.querySelector("aip-filter-text-input")).toBeNull();
  });

  it("renders the text input component in text mode", () => {
    comp.mode.set("text");
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("aip-filter-text-input")).not.toBeNull();
    expect(el.querySelector("aip-filter-stepper")).toBeNull();
  });

  it("renders a single toggle button", () => {
    const el: HTMLElement = fixture.nativeElement;
    const buttons = el.querySelectorAll(".filter-input-toggle button");
    expect(buttons.length).toBe(1);
  });

  it("shows pencil icon in stepper mode", () => {
    const el: HTMLElement = fixture.nativeElement;
    const icon = el.querySelector(".filter-input-toggle mat-icon");
    expect(icon?.textContent?.trim()).toBe("edit");
  });

  it("shows wand icon in text mode", () => {
    comp.mode.set("text");
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const icon = el.querySelector(".filter-input-toggle mat-icon");
    expect(icon?.textContent?.trim()).toBe("auto_fix_high");
  });

  it("toggles mode when the button is clicked", () => {
    comp.toggleMode();
    expect(comp.mode()).toBe("text");
    comp.toggleMode();
    expect(comp.mode()).toBe("stepper");
  });

  // -----------------------------------------------------------------------
  // initialField passthrough
  // -----------------------------------------------------------------------

  it("passes initialField through to the stepper", () => {
    const f = TestBed.createComponent(InitialFieldHostComponent);
    f.detectChanges();
    const inputComp = f.componentInstance.input();
    expect(inputComp.initialField()).toBe("status");
  });
});
