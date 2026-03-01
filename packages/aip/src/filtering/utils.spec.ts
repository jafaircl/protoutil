import { assert, describe, it } from "vitest";
import type { Expr } from "../gen/google/api/expr/v1alpha1/syntax_pb";
import { AipFilterError, ErrorCode } from "./errors";
import { parse } from "./parser";
import { assertExprDepth, ExprDepthError, exprDepth, MAX_EXPR_DEPTH } from "./utils";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// parse() enforces its own depth limit, so we use a high maxDepth when we
// need to construct deep trees for testing the utility functions themselves.
const UNLIMITED = 10_000;

function expr(filter: string) {
  const { expr } = parse(filter, UNLIMITED);
  assert.isDefined(expr);
  return expr as Expr;
}

// ─────────────────────────────────────────────────────────────────────────────
// exprDepth
// ─────────────────────────────────────────────────────────────────────────────
//
// Depth is defined as: a leaf node has depth 1. A node with children has
// depth 1 + max(child depths).

describe("exprDepth", () => {
  // ── Leaf nodes (depth 1) ──────────────────────────────────────────────────
  it("ident — depth 1", () => {
    assert.equal(exprDepth(expr("a")), 1);
  });

  it("bool constant — depth 1", () => {
    assert.equal(exprDepth(expr("true")), 1);
  });

  it("int constant — depth 1", () => {
    assert.equal(exprDepth(expr("42")), 1);
  });

  it("string constant — depth 1", () => {
    assert.equal(exprDepth(expr('"hello"')), 1);
  });

  it("null constant — depth 1", () => {
    assert.equal(exprDepth(expr("null")), 1);
  });

  // ── Call nodes ────────────────────────────────────────────────────────────
  it("comparison (callExpr with two leaf args) — depth 2", () => {
    // _<_(a, 10): the call is depth 2, each leaf arg is depth 1
    assert.equal(exprDepth(expr("a < 10")), 2);
  });

  it("NOT over ident (callExpr with one leaf arg) — depth 2", () => {
    assert.equal(exprDepth(expr("NOT a")), 2);
  });

  it("AND of two comparisons — depth 3", () => {
    // _&&_(_<_(a,10), _>_(b,0)): AND is depth 3, comparisons depth 2, leaves depth 1
    assert.equal(exprDepth(expr("a < 10 AND b > 0")), 3);
  });

  it("nested AND — depth grows with nesting", () => {
    // _&&_(_&&_(a,b), c): depth 3
    assert.equal(exprDepth(expr("a AND b AND c")), 3);
  });

  // ── Select nodes ──────────────────────────────────────────────────────────
  it("one-level select — depth 2", () => {
    // a.b: select(ident(a)) → depth 2
    assert.equal(exprDepth(expr("a.b")), 2);
  });

  it("two-level select chain — depth 3", () => {
    assert.equal(exprDepth(expr("a.b.c")), 3);
  });

  it("three-level select chain — depth 4", () => {
    assert.equal(exprDepth(expr("a.b.c.d")), 4);
  });

  // ── Method calls ──────────────────────────────────────────────────────────
  it("method call — call node with target ident and const arg — depth 2", () => {
    // s.startsWith("x"): callExpr with target=ident(s) (depth 1) and arg=const (depth 1)
    // The parser builds callExpr(target=ident, args=[const]) directly — no intervening
    // selectExpr — so depth is 1 + max(1, 1) = 2.
    assert.equal(exprDepth(expr('s.startsWith("x")')), 2);
  });

  // ── Depth takes the max child, not the sum ────────────────────────────────
  it("AND of a deep left and shallow right — takes max, not sum", () => {
    // _&&_(_&&_(_&&_(a,b),c), d): left subtree depth 3, right depth 1 → total 4
    assert.equal(exprDepth(expr("a AND b AND c AND d")), 4);
  });

  // ── Parenthesised expressions are transparent ─────────────────────────────
  it("parens do not add to depth — they are transparent in the AST", () => {
    // ((a)) parses to the same AST as a — no extra nodes
    assert.equal(exprDepth(expr("((a))")), 1);
    assert.equal(exprDepth(expr("a")), 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// assertExprDepth
// ─────────────────────────────────────────────────────────────────────────────

describe("assertExprDepth", () => {
  it("does not throw when depth is within limit", () => {
    assert.doesNotThrow(() => assertExprDepth(expr("a < 10"), 10));
  });

  it("does not throw when depth equals the limit exactly", () => {
    // a < 10 has depth 2
    assert.doesNotThrow(() => assertExprDepth(expr("a < 10"), 2));
  });

  it("throws ExprDepthError when depth exceeds limit", () => {
    // a < 10 has depth 2; limit 1 should throw
    assert.throws(() => assertExprDepth(expr("a < 10"), 1), ExprDepthError);
  });

  it("uses MAX_EXPR_DEPTH as default when no limit is passed", () => {
    assert.doesNotThrow(() => assertExprDepth(expr("a AND b")));
  });

  it("thrown error carries the actual depth", () => {
    // a < 10 → depth 2
    try {
      assertExprDepth(expr("a < 10"), 1);
      assert.fail("expected ExprDepthError");
    } catch (e) {
      assert.instanceOf(e, ExprDepthError);
      assert.equal((e as ExprDepthError).depth, 2);
    }
  });

  it("thrown error carries the configured max", () => {
    try {
      assertExprDepth(expr("a < 10"), 1);
      assert.fail("expected ExprDepthError");
    } catch (e) {
      assert.instanceOf(e, ExprDepthError);
      assert.equal((e as ExprDepthError).max, 1);
    }
  });

  it("error message includes both depth and max", () => {
    try {
      assertExprDepth(expr("a < 10"), 1);
      assert.fail("expected ExprDepthError");
    } catch (e) {
      assert.instanceOf(e, ExprDepthError);
      assert.include((e as ExprDepthError).message, "2");
      assert.include((e as ExprDepthError).message, "1");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ExprDepthError
// ─────────────────────────────────────────────────────────────────────────────

describe("ExprDepthError", () => {
  it("is an instance of Error, AipFilterError, and ExprDepthError", () => {
    const e = new ExprDepthError(10, 5);
    assert(e instanceof Error);
    assert(e instanceof AipFilterError);
    assert(e instanceof ExprDepthError);
  });

  it("name is ExprDepthError", () => {
    assert.equal(new ExprDepthError(10, 5).name, "ExprDepthError");
  });

  it("code is DEPTH_EXCEEDED", () => {
    assert.equal(new ExprDepthError(10, 5).code, ErrorCode.DEPTH_EXCEEDED);
  });

  it("exposes depth property", () => {
    assert.equal(new ExprDepthError(10, 5).depth, 10);
  });

  it("exposes max property", () => {
    assert.equal(new ExprDepthError(10, 5).max, 5);
  });

  it("message includes both depth and max", () => {
    const e = new ExprDepthError(10, 5);
    assert.include(e.message, "10");
    assert.include(e.message, "5");
  });

  it("toString() uses the CEL sentinel position -1:0", () => {
    assert.include(String(new ExprDepthError(10, 5)), "ERROR: <input>:-1:0:");
  });

  it("toString() has no pointer line (no source location)", () => {
    assert.notMatch(String(new ExprDepthError(10, 5)), /\| /);
  });

  it("position.line is -1 (sentinel — no meaningful source location)", () => {
    assert.equal(new ExprDepthError(10, 5).position?.line, -1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAX_EXPR_DEPTH
// ─────────────────────────────────────────────────────────────────────────────

describe("MAX_EXPR_DEPTH", () => {
  it("is a positive integer", () => {
    assert.isAbove(MAX_EXPR_DEPTH, 0);
    assert.equal(Math.floor(MAX_EXPR_DEPTH), MAX_EXPR_DEPTH);
  });

  it("is the default used by assertExprDepth", () => {
    // Build a tree just over MAX_EXPR_DEPTH deep by parsing with UNLIMITED,
    // then assert it's rejected by the default assertExprDepth
    // a AND b AND ... (MAX_EXPR_DEPTH chained ANDs) gives depth MAX_EXPR_DEPTH+1
    const deepFilter = Array(MAX_EXPR_DEPTH + 1)
      .fill("a")
      .join(" AND ");
    const deepExpr = expr(deepFilter);
    assert.throws(() => assertExprDepth(deepExpr), ExprDepthError);
  });
});
