import { TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { create } from "@bufbuild/protobuf";
import { type Expr, ExprSchema, ident } from "@protoutil/aip/filtering";
import { createFilterBranchNode, createFilterLeafNode } from "@protoutil/angular";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FilterDialogComponent, type FilterDialogData } from "./filter-dialog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringDecl(name: string) {
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
// Tests
// ---------------------------------------------------------------------------

describe("FilterDialogComponent", () => {
  const closeSpy = vi.fn();
  const initialTree = createFilterBranchNode(
    [createFilterLeafNode(makeLeafExpr("name"), "leaf-1")],
    "_&&_",
    "root-1",
  );

  const dialogData: FilterDialogData = {
    declarations: [stringDecl("name"), stringDecl("status")],
    initialTree,
    initialField: null,
  };

  let comp: FilterDialogComponent;

  beforeEach(async () => {
    closeSpy.mockClear();

    await TestBed.configureTestingModule({
      imports: [FilterDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: MatDialogRef, useValue: { close: closeSpy } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FilterDialogComponent);
    fixture.detectChanges();
    comp = fixture.componentInstance;
  });

  it("initializes with injected data", () => {
    expect(comp.data).toBe(dialogData);
    expect(comp.pendingTree()).toBeUndefined();
    expect(comp.dirty()).toBe(false);
  });

  it("cancel closes with undefined", () => {
    comp.cancel();
    expect(closeSpy).toHaveBeenCalledWith(undefined);
  });

  it("save without edits returns initial tree", () => {
    comp.save();
    expect(closeSpy).toHaveBeenCalledWith(initialTree);
  });

  it("save after edit returns the pending tree", () => {
    const newTree = createFilterBranchNode(
      [createFilterLeafNode(makeLeafExpr("status"), "leaf-2")],
      "_&&_",
      "root-2",
    );
    comp.onTreeChange(newTree);
    comp.save();
    expect(closeSpy).toHaveBeenCalledWith(newTree);
  });

  it("tracks dirty state after tree change", () => {
    expect(comp.dirty()).toBe(false);
    const newTree = createFilterBranchNode([], "_&&_");
    comp.onTreeChange(newTree);
    expect(comp.dirty()).toBe(true);
    expect(comp.pendingTree()).toBe(newTree);
  });
});
