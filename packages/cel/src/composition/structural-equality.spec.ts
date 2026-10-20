import { describe, expect, it } from "vitest";
import {
  callExpr,
  type Expr,
  functionReference,
  identExpr,
  identReference,
  literalExpr,
  type ReferenceInfo,
  selectExpr,
} from "../common/ast/index.js";
import { BoolType, BytesType, IntType, typeToExprType, UintType } from "../common/types/types.js";
import { type StructuralEqualityContext, structurallyEqual } from "./structural-equality.js";

/** uint64Literal builds a uint literal the way `protoToExpr` does: as a raw Constant message,
 * since a bare bigint can't itself record that it is unsigned. */
function uint64Literal(id: number, value: bigint): Expr {
  return literalExpr(id, {
    $typeName: "cel.expr.Constant",
    constantKind: { case: "uint64Value", value },
  });
}

/** contextFrom builds a StructuralEqualityContext from id-keyed type/reference fixtures. */
function contextFrom(
  types: Record<number, ReturnType<typeof typeToExprType>>,
  references: Record<number, ReferenceInfo> = {},
): StructuralEqualityContext {
  return {
    getType: (id) => types[id],
    getReference: (id) => references[id],
  };
}

describe("composition/structural-equality", () => {
  it("treats identical literal ints as structurally equal", () => {
    const left = literalExpr(1, 1n);
    const right = literalExpr(2, 1n);
    const context = contextFrom({ 1: typeToExprType(IntType), 2: typeToExprType(IntType) });
    expect(structurallyEqual(left, right, context)).toBe(true);
  });

  it("treats different literal int values as distinct", () => {
    const left = literalExpr(1, 1n);
    const right = literalExpr(2, 2n);
    const context = contextFrom({ 1: typeToExprType(IntType), 2: typeToExprType(IntType) });
    expect(structurallyEqual(left, right, context)).toBe(false);
  });

  it("treats int(1) and uint(1) as distinct even though the raw literal value matches", () => {
    const left = literalExpr(1, 1n);
    const right = literalExpr(2, 1n);
    const context = contextFrom({ 1: typeToExprType(IntType), 2: typeToExprType(UintType) });
    expect(structurallyEqual(left, right, context)).toBe(false);
  });

  it("treats idents with the same name and resolved reference as equal", () => {
    const left = identExpr(1, "x");
    const right = identExpr(2, "x");
    const context = contextFrom(
      { 1: typeToExprType(IntType), 2: typeToExprType(IntType) },
      { 1: identReference("x"), 2: identReference("x") },
    );
    expect(structurallyEqual(left, right, context)).toBe(true);
  });

  it("treats idents with different names as distinct", () => {
    const left = identExpr(1, "x");
    const right = identExpr(2, "y");
    const context = contextFrom({ 1: typeToExprType(IntType), 2: typeToExprType(IntType) });
    expect(structurallyEqual(left, right, context)).toBe(false);
  });

  it("treats calls selecting different overload ids as distinct even with identical syntax", () => {
    const left = callExpr(1, "f", [identExpr(2, "x")]);
    const right = callExpr(3, "f", [identExpr(4, "x")]);
    const context = contextFrom(
      {
        1: typeToExprType(BoolType),
        2: typeToExprType(IntType),
        3: typeToExprType(BoolType),
        4: typeToExprType(IntType),
      },
      {
        1: functionReference("f_int"),
        3: functionReference("f_other_int"),
      },
    );
    expect(structurallyEqual(left, right, context)).toBe(false);
  });

  it("treats calls with identical overloads and ordered args as equal", () => {
    const left = callExpr(1, "f", [identExpr(2, "x"), literalExpr(3, 1n)]);
    const right = callExpr(4, "f", [identExpr(5, "x"), literalExpr(6, 1n)]);
    const context = contextFrom(
      {
        1: typeToExprType(BoolType),
        2: typeToExprType(IntType),
        3: typeToExprType(IntType),
        4: typeToExprType(BoolType),
        5: typeToExprType(IntType),
        6: typeToExprType(IntType),
      },
      { 1: functionReference("f_int_int"), 4: functionReference("f_int_int") },
    );
    expect(structurallyEqual(left, right, context)).toBe(true);
  });

  it("treats calls with swapped argument order as distinct", () => {
    const left = callExpr(1, "f", [literalExpr(2, 1n), literalExpr(3, 2n)]);
    const right = callExpr(4, "f", [literalExpr(5, 2n), literalExpr(6, 1n)]);
    const context = contextFrom(
      {
        1: typeToExprType(BoolType),
        2: typeToExprType(IntType),
        3: typeToExprType(IntType),
        4: typeToExprType(BoolType),
        5: typeToExprType(IntType),
        6: typeToExprType(IntType),
      },
      { 1: functionReference("f_int_int"), 4: functionReference("f_int_int") },
    );
    expect(structurallyEqual(left, right, context)).toBe(false);
  });

  it("treats select expressions with the same field and operand as equal", () => {
    const left = selectExpr(1, identExpr(2, "msg"), "field", false);
    const right = selectExpr(3, identExpr(4, "msg"), "field", false);
    const context = contextFrom({
      1: typeToExprType(IntType),
      2: typeToExprType(IntType),
      3: typeToExprType(IntType),
      4: typeToExprType(IntType),
    });
    expect(structurallyEqual(left, right, context)).toBe(true);
  });

  it("treats a presence test and a field selection on the same field as distinct", () => {
    const left = selectExpr(1, identExpr(2, "msg"), "field", true);
    const right = selectExpr(3, identExpr(4, "msg"), "field", false);
    const context = contextFrom({
      1: typeToExprType(BoolType),
      2: typeToExprType(IntType),
      3: typeToExprType(IntType),
      4: typeToExprType(IntType),
    });
    expect(structurallyEqual(left, right, context)).toBe(false);
  });

  it("ignores expression ids", () => {
    const left: Expr = literalExpr(100, true);
    const right: Expr = literalExpr(200, true);
    const context = contextFrom({ 100: typeToExprType(BoolType), 200: typeToExprType(BoolType) });
    expect(structurallyEqual(left, right, context)).toBe(true);
  });

  it("treats equal-content byte arrays as structurally equal", () => {
    const left = literalExpr(1, new Uint8Array([1, 2, 3]));
    const right = literalExpr(2, new Uint8Array([1, 2, 3]));
    const context = contextFrom({ 1: typeToExprType(BytesType), 2: typeToExprType(BytesType) });
    expect(structurallyEqual(left, right, context)).toBe(true);
  });

  it("treats different-content byte arrays as distinct", () => {
    const left = literalExpr(1, new Uint8Array([1, 2, 3]));
    const right = literalExpr(2, new Uint8Array([1, 2, 4]));
    const context = contextFrom({ 1: typeToExprType(BytesType), 2: typeToExprType(BytesType) });
    expect(structurallyEqual(left, right, context)).toBe(false);
  });

  it("treats different-length byte arrays as distinct", () => {
    const left = literalExpr(1, new Uint8Array([1, 2, 3]));
    const right = literalExpr(2, new Uint8Array([1, 2]));
    const context = contextFrom({ 1: typeToExprType(BytesType), 2: typeToExprType(BytesType) });
    expect(structurallyEqual(left, right, context)).toBe(false);
  });

  it("treats equal uint64 literals built as raw Constant messages as structurally equal", () => {
    // protoToExpr keeps a uint64 literal as its original Constant message rather than unwrapping
    // it to a bigint, since a bare bigint can't record that it is unsigned.
    const left = uint64Literal(1, 5n);
    const right = uint64Literal(2, 5n);
    const context = contextFrom({ 1: typeToExprType(UintType), 2: typeToExprType(UintType) });
    expect(structurallyEqual(left, right, context)).toBe(true);
  });

  it("treats different uint64 literals built as raw Constant messages as distinct", () => {
    const left = uint64Literal(1, 5n);
    const right = uint64Literal(2, 6n);
    const context = contextFrom({ 1: typeToExprType(UintType), 2: typeToExprType(UintType) });
    expect(structurallyEqual(left, right, context)).toBe(false);
  });
});
