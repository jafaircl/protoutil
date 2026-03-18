import { assert, describe, it } from "vitest";
import { check } from "./checker";
import { fold } from "./fold";
import { inline } from "./inline";
import { optimize } from "./optimizer";
import { parse } from "./parser";
import { BOOL, INT64, ident, STRING } from "./types";
import { unparse } from "./unparse";

// ─────────────────────────────────────────────────────────────────────────────
// Test tables
// ─────────────────────────────────────────────────────────────────────────────
//
// InlineCase
//   description  – human-readable label
//   filter       – AIP filter string to parse and check
//   decls        – ident declarations required by the checker
//   replacements – map of ident name → replacement filter string
//   expected     – unparsed string of the result after inlining
//
// CompositionCase
//   description  – human-readable label
//   filter       – AIP filter string
//   decls        – ident declarations
//   steps        – ordered optimizer steps (inline or fold) to compose
//   expected     – unparsed string of the final result
//

type InlineCase = {
  description: string;
  filter: string;
  decls: ReturnType<typeof ident>[];
  replacements: Record<string, string>;
  expected: string;
};

// ── Ident replacement ──────────────────────────────────────────────────────────
// inline() rewrites ident nodes to arbitrary Expr subtrees. Idents that have
// no entry in the replacements map are left untouched.

const inlineCases: InlineCase[] = [
  // ── Basic replacements ────────────────────────────────────────────────────────
  {
    description: "ident → simple ident",
    filter: 'name = "asdf"',
    decls: [ident("name", STRING)],
    replacements: { name: "user_name" },
    expected: 'user_name = "asdf"',
  },
  {
    description: "ident → two-level select chain",
    filter: 'name = "asdf"',
    decls: [ident("name", STRING)],
    replacements: { name: "user.profile.name" },
    expected: 'user.profile.name = "asdf"',
  },
  {
    description: "ident → deep select chain (3+ levels)",
    filter: 'name = "asdf"',
    decls: [ident("name", STRING)],
    replacements: { name: "a.b.c.d" },
    expected: 'a.b.c.d = "asdf"',
  },
  {
    description: "ident appearing twice gets replaced at both sites",
    filter: "x < 10 AND x > 0",
    decls: [ident("x", INT64)],
    replacements: { x: "req.count" },
    expected: "req.count < 10 AND req.count > 0",
  },
  {
    description: "unreferenced ident left untouched",
    filter: "a < 10",
    decls: [ident("a", INT64)],
    replacements: { b: "something" },
    expected: "a < 10",
  },

  // ── Replacement position coverage ────────────────────────────────────────────
  {
    description: "ident on the right-hand side of a comparison",
    filter: "10 > x",
    decls: [ident("x", INT64)],
    replacements: { x: "req.count" },
    expected: "10 > req.count",
  },
  {
    description: "ident inside NOT",
    filter: "NOT x",
    decls: [ident("x", BOOL)],
    replacements: { x: "feature.enabled" },
    expected: "NOT feature.enabled",
  },
  {
    description: "ident as method call target",
    filter: 's.startsWith("hello")',
    decls: [ident("s", STRING)],
    replacements: { s: "request.name" },
    expected: 'request.name.startsWith("hello")',
  },
  {
    description: "ident inside has operator",
    filter: "labels:deprecated",
    decls: [ident("labels", STRING)],
    replacements: { labels: "resource.labels" },
    expected: "resource.labels:deprecated",
  },

  // ── Multiple replacements in a single pass ────────────────────────────────────
  {
    description: "two idents replaced in a single inline pass",
    filter: 'first = "a" AND last = "b"',
    decls: [ident("first", STRING), ident("last", STRING)],
    replacements: { first: "user.first_name", last: "user.last_name" },
    expected: 'user.first_name = "a" AND user.last_name = "b"',
  },

  // ── Replacement is not a select chain ────────────────────────────────────────
  {
    description: "replacement is a constant",
    filter: "x < 10",
    decls: [ident("x", INT64)],
    replacements: { x: "5" },
    expected: "5 < 10",
  },
];

// ── Optimizer composition ──────────────────────────────────────────────────────

type CompositionCase = {
  description: string;
  filter: string;
  decls: ReturnType<typeof ident>[];
  steps: (
    | { kind: "inline"; replacements: Record<string, string> }
    | { kind: "fold"; bindings: Record<string, bigint | string | boolean | number | null> }
  )[];
  expected: string;
};

const compositionCases: CompositionCase[] = [
  {
    description: "inline then fold — ident replaced then constant-evaluated",
    filter: "retries < 10",
    decls: [ident("retries", INT64)],
    steps: [
      { kind: "inline", replacements: { retries: "count" } },
      { kind: "fold", bindings: { count: 3n } },
    ],
    expected: "true",
  },
  {
    description: "fold then inline — one clause folds, other gets ident rewritten",
    filter: 'a < 10 AND b = "prod"',
    decls: [ident("a", INT64), ident("b", STRING)],
    steps: [
      { kind: "fold", bindings: { a: 3n } },
      { kind: "inline", replacements: { b: "request.env" } },
    ],
    expected: 'true AND request.env = "prod"',
  },
  {
    description: "two inline passes compose — each rewrites its own ident",
    filter: 'first = "a" AND last = "b"',
    decls: [ident("first", STRING), ident("last", STRING)],
    steps: [
      { kind: "inline", replacements: { first: "user.first_name" } },
      { kind: "inline", replacements: { last: "user.last_name" } },
    ],
    expected: 'user.first_name = "a" AND user.last_name = "b"',
  },
  {
    description: "three passes compose — inline, fold, inline",
    filter: 'a < 10 AND b = "prod"',
    decls: [ident("a", INT64), ident("b", STRING)],
    steps: [
      { kind: "inline", replacements: { a: "count" } },
      { kind: "fold", bindings: { count: 3n } },
      { kind: "inline", replacements: { b: "request.env" } },
    ],
    expected: 'true AND request.env = "prod"',
  },
  {
    description: "second inline pass ignores already-replaced select node",
    // After the first pass `x` becomes a selectExpr (a.b), not an identExpr.
    // The second pass targets `x` and must leave the select node untouched.
    filter: "x AND y",
    decls: [ident("x", BOOL), ident("y", BOOL)],
    steps: [
      { kind: "inline", replacements: { x: "a.b" } },
      { kind: "inline", replacements: { x: "should.not.appear" } },
    ],
    expected: "a.b AND y",
  },
  {
    description: "no optimizers — original expression returned unchanged",
    filter: "a < 10",
    decls: [ident("a", INT64)],
    steps: [],
    expected: "a < 10",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildOptimizers(steps: CompositionCase["steps"]) {
  return steps.map((step) => {
    if (step.kind === "inline") {
      return inline(
        Object.fromEntries(Object.entries(step.replacements).map(([k, v]) => [k, parse(v)])),
      );
    }
    return fold(step.bindings);
  });
}

function collectIds(expr: ReturnType<typeof parse>["expr"]): bigint[] {
  if (!expr) return [];
  const ids: bigint[] = [expr.id];
  const k = expr.exprKind;
  if (k.case === "callExpr") {
    if (k.value.target) ids.push(...collectIds(k.value.target));
    for (const a of k.value.args) ids.push(...collectIds(a));
  } else if (k.case === "selectExpr") {
    ids.push(...collectIds(k.value.operand));
  }
  return ids;
}

function assertUniqueIds(expr: ReturnType<typeof parse>["expr"]) {
  const ids = collectIds(expr);
  const unique = new Set(ids.map(String));
  assert.equal(ids.length, unique.size, "all node ids should be unique");
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

describe("inline — ident replacement", () => {
  for (const tc of inlineCases) {
    it(tc.description, () => {
      const { checkedExpr } = check(parse(tc.filter), { decls: tc.decls });
      const result = optimize(
        checkedExpr,
        inline(Object.fromEntries(Object.entries(tc.replacements).map(([k, v]) => [k, parse(v)]))),
      );
      assert.isDefined(result.expr);
      assert.equal(unparse(result.expr), tc.expected);
    });
  }

  // ── Node-id uniqueness ────────────────────────────────────────────────────
  // Each substitution clones the replacement subtree with fresh ids so that
  // the resulting tree never has duplicate node ids, even when the same ident
  // appears multiple times in the filter.

  it("replacement nodes get unique ids — ident appears twice", () => {
    const { checkedExpr } = check(parse("x AND x"), { decls: [ident("x", BOOL)] });
    const result = optimize(checkedExpr, inline({ x: parse("a.b") }));
    assert.isDefined(result.expr);
    assertUniqueIds(result.expr);
  });

  it("replacement nodes get unique ids — ident appears three times", () => {
    const { checkedExpr } = check(parse("x AND x AND x"), { decls: [ident("x", BOOL)] });
    const result = optimize(checkedExpr, inline({ x: parse("a.b") }));
    assert.isDefined(result.expr);
    assertUniqueIds(result.expr);
  });

  // Known bug: two separate inline() calls both start their idCounter at
  // 100_000n, so clones produced by different passes can collide. This test
  // documents the bug and should be updated to assertUniqueIds once fixed.
  it.todo("node ids remain unique after two inline passes on different idents");
});

describe("optimize — composition", () => {
  for (const tc of compositionCases) {
    it(tc.description, () => {
      const { checkedExpr } = check(parse(tc.filter), { decls: tc.decls });
      const result = optimize(checkedExpr, ...buildOptimizers(tc.steps));
      assert.isDefined(result.expr);
      assert.equal(unparse(result.expr), tc.expected);
    });
  }

  // ── sourceInfo preservation ────────────────────────────────────────────────
  // optimize() must pass sourceInfo through unchanged regardless of which
  // optimizer passes run.

  it("preserves sourceInfo through optimization", () => {
    const { checkedExpr } = check(parse("retries < 10"), { decls: [ident("retries", INT64)] });
    const result = optimize(checkedExpr, fold({ retries: 3n }));
    assert.isDefined(result.sourceInfo);
    assert.equal(result.sourceInfo?.location, "<input>");
  });
});
