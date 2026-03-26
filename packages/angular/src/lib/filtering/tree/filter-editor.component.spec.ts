/**
 * filter-editor.component.spec.ts
 *
 * Unit tests for the FilterEditorComponent wrapper that combines
 * the filter tree with the input wrapper.
 */

import { Component, viewChild } from "@angular/core";
import { type ComponentFixture, TestBed } from "@angular/core/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { create } from "@bufbuild/protobuf";
import { type Decl, type Expr, ExprSchema, ident } from "@protoutil/aip/filtering";

import { FilterEditorComponent } from "./filter-editor.component";
import { createFilterBranchNode, createFilterLeafNode, type FilterNode } from "./filter-node.model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringDecl(name: string): Decl {
  return ident(name, { typeKind: { case: "primitive", value: 5 } });
}

function makeLeafExpr(fieldName: string): Expr {
  return create(ExprSchema, {
    exprKind: {
      case: "callExpr",
      value: {
        function: "_==_",
        args: [
          create(ExprSchema, {
            exprKind: { case: "identExpr", value: { name: fieldName } },
          }),
          create(ExprSchema, {
            exprKind: {
              case: "constExpr",
              value: { constantKind: { case: "stringValue", value: "test" } },
            },
          }),
        ],
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Test host — empty initial tree
// ---------------------------------------------------------------------------

@Component({
  standalone: true,
  imports: [FilterEditorComponent],
  template: `<aip-filter-editor
    [declarations]="decls"
    (treeChange)="lastTree = $event"
  />`,
})
class EmptyTestHostComponent {
  decls: Decl[] = [stringDecl("name"), stringDecl("status")];
  lastTree: FilterNode | null = null;
  editor = viewChild.required(FilterEditorComponent);
}

// ---------------------------------------------------------------------------
// Test host — with initialField
// ---------------------------------------------------------------------------

@Component({
  standalone: true,
  imports: [FilterEditorComponent],
  template: `<aip-filter-editor
    [declarations]="decls"
    [initialField]="initialField"
    (treeChange)="lastTree = $event"
  />`,
})
class InitialFieldHostComponent {
  decls: Decl[] = [stringDecl("name"), stringDecl("status")];
  initialField: string | null = "status";
  lastTree: FilterNode | null = null;
  editor = viewChild.required(FilterEditorComponent);
}

// ---------------------------------------------------------------------------
// Test host — pre-populated tree
// ---------------------------------------------------------------------------

@Component({
  standalone: true,
  imports: [FilterEditorComponent],
  template: `<aip-filter-editor
    [declarations]="decls"
    [initialTree]="initialTree"
    (treeChange)="lastTree = $event"
  />`,
})
class PopulatedTestHostComponent {
  decls: Decl[] = [stringDecl("name"), stringDecl("status")];
  initialTree: FilterNode = createFilterBranchNode(
    [createFilterLeafNode(makeLeafExpr("name"), "leaf-1")],
    "_&&_",
    "root-1",
  );
  lastTree: FilterNode | null = null;
  editor = viewChild.required(FilterEditorComponent);
}

// ---------------------------------------------------------------------------
// Tests — empty initial state
// ---------------------------------------------------------------------------

describe("FilterEditorComponent (empty)", () => {
  let fixture: ComponentFixture<EmptyTestHostComponent>;
  let host: EmptyTestHostComponent;
  let comp: FilterEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyTestHostComponent, InitialFieldHostComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(EmptyTestHostComponent);
    fixture.detectChanges();
    host = fixture.componentInstance;
    comp = host.editor();
  });

  it("starts with an empty root", () => {
    expect(comp.root().children.length).toBe(0);
  });

  it("does not show the tree when empty", () => {
    expect(comp.showTree()).toBe(false);
  });

  it("hides the tree element in the DOM when empty", () => {
    const el: HTMLElement = fixture.nativeElement;
    const tree = el.querySelector("aip-filter-tree") as HTMLElement;
    expect(tree).not.toBeNull();
    expect(tree.hidden).toBe(true);
  });

  it("shows the input wrapper", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("aip-filter-input")).not.toBeNull();
  });

  it("appends a leaf when an expression is added", () => {
    const expr = makeLeafExpr("name");
    comp.onExprAdd(expr);
    fixture.detectChanges();

    expect(comp.root().children.length).toBe(1);
    expect(comp.root().children[0].expr).toBe(expr);
  });

  it("shows the tree after adding an expression", () => {
    comp.onExprAdd(makeLeafExpr("name"));
    fixture.detectChanges();
    expect(comp.showTree()).toBe(true);
  });

  it("emits treeChange when an expression is added", () => {
    comp.onExprAdd(makeLeafExpr("name"));
    expect(host.lastTree).not.toBeNull();
    expect(host.lastTree!.children.length).toBe(1);
  });

  it("preserves the root conjunction when adding expressions", () => {
    comp.onExprAdd(makeLeafExpr("name"));
    comp.onExprAdd(makeLeafExpr("status"));
    expect(comp.root().conjunction).toBe("_&&_");
    expect(comp.root().children.length).toBe(2);
  });

  it("decomposes a compound OR expression into a branch node", () => {
    const orExpr = create(ExprSchema, {
      exprKind: {
        case: "callExpr",
        value: {
          function: "_||_",
          args: [makeLeafExpr("name"), makeLeafExpr("status")],
        },
      },
    });
    comp.onExprAdd(orExpr);
    fixture.detectChanges();

    const addedChild = comp.root().children[0];
    expect(addedChild.conjunction).toBe("_||_");
    expect(addedChild.children.length).toBe(2);
  });

  it("adds a simple expression as a leaf node", () => {
    const expr = makeLeafExpr("name");
    comp.onExprAdd(expr);
    fixture.detectChanges();

    const addedChild = comp.root().children[0];
    expect(addedChild.children.length).toBe(0);
    expect(addedChild.expr).toBe(expr);
  });

  it("passes initialField through to the input", () => {
    const f = TestBed.createComponent(InitialFieldHostComponent);
    f.detectChanges();
    const editorComp = f.componentInstance.editor();
    expect(editorComp.initialField()).toBe("status");
  });
});

// ---------------------------------------------------------------------------
// Tests — pre-populated state
// ---------------------------------------------------------------------------

describe("FilterEditorComponent (populated)", () => {
  let fixture: ComponentFixture<PopulatedTestHostComponent>;
  let host: PopulatedTestHostComponent;
  let comp: FilterEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PopulatedTestHostComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(PopulatedTestHostComponent);
    fixture.detectChanges();
    host = fixture.componentInstance;
    comp = host.editor();
  });

  it("initializes with the provided tree", () => {
    expect(comp.root().children.length).toBe(1);
    expect(comp.root().id).toBe("root-1");
  });

  it("shows the tree when it has children", () => {
    expect(comp.showTree()).toBe(true);
  });

  it("renders the tree element in the DOM", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("aip-filter-tree")).not.toBeNull();
  });

  it("appends to existing children", () => {
    comp.onExprAdd(makeLeafExpr("status"));
    expect(comp.root().children.length).toBe(2);
    expect(comp.root().id).toBe("root-1");
  });

  it("preserves the root ID when adding expressions", () => {
    comp.onExprAdd(makeLeafExpr("status"));
    expect(comp.root().id).toBe("root-1");
  });
});
