import { assert, describe, it } from "vitest";
import { check } from "./checker";
import { type FoldValue, fold } from "./fold";
import { optimize } from "./optimizer";
import { parse } from "./parser";
import { BOOL, DOUBLE, INT64, ident, NULL, STRING } from "./types";
import { unparse } from "./unparse";

// ─────────────────────────────────────────────────────────────────────────────
// Test table
// ─────────────────────────────────────────────────────────────────────────────
//
// Each case:
//   description – human-readable label
//   filter      – AIP filter string to parse and check
//   decls       – ident declarations required by the checker
//   bindings    – runtime values to fold into the expression
//   expected    – unparsed string of the fully-optimized expression
//
// Note on UINT64: FoldValue maps bigint → int64Value only, so there is no
// public API to supply a uint64 binding. UINT64 constant-eval is covered by
// the fold.ts arithmetic path but cannot be exercised through fold() directly.
//
// Note on arithmetic operators: +, -, *, / are not part of the AIP-160
// grammar, so they cannot be expressed as filter strings. fold.ts handles them
// for programmatically-constructed ASTs, but they are not testable here.
//
// Note on short-circuit with one unbound operand: fold() only folds a logical
// call when *both* of its children are constants. If one side is still an
// unbound ident after substitution, the call node is left as-is. This means
// `false AND b` stays `false AND b`, not `false`. The implementation does
// short-circuit when both children happen to be constants (e.g. after a prior
// substitution makes both sides known), but true one-sided short-circuiting is
// not implemented.

type FoldCase = {
  description: string;
  filter: string;
  decls: ReturnType<typeof ident>[];
  bindings: Record<string, FoldValue>;
  expected: string;
};

// ── Ident substitution ────────────────────────────────────────────────────────
// Verifies that known idents are replaced with their literal constant value and
// that unknown idents (no binding supplied) are left as-is in the output.

const substitutionCases: FoldCase[] = [
  {
    description: "replaces a known int64 ident",
    filter: "retries",
    decls: [ident("retries", INT64)],
    bindings: { retries: 3n },
    expected: "3",
  },
  {
    description: "replaces multiple bool idents — both bound",
    filter: "a AND b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: true, b: true },
    expected: "true",
  },
  {
    description: "leaves unknown idents untouched — only one side bound",
    filter: "a < b",
    decls: [ident("a", INT64), ident("b", INT64)],
    bindings: { a: 5n },
    expected: "5 < b",
  },
  {
    description: "folds null",
    filter: "x",
    decls: [ident("x", NULL)],
    bindings: { x: null },
    expected: "null",
  },
  {
    description: "folds string",
    filter: "env",
    decls: [ident("env", STRING)],
    bindings: { env: "prod" },
    expected: '"prod"',
  },
  {
    description: "folds double",
    filter: "threshold",
    decls: [ident("threshold", DOUBLE)],
    bindings: { threshold: 0.5 },
    expected: "0.5",
  },
  {
    description: "ident in comparison position — not just standalone",
    filter: "threshold > 0.25",
    decls: [ident("threshold", DOUBLE)],
    bindings: { threshold: 0.5 },
    expected: "true",
  },
  {
    description: "same ident appears multiple times — all sites replaced",
    filter: "x < 10 AND x > 0",
    decls: [ident("x", INT64)],
    bindings: { x: 5n },
    expected: "true",
  },
  {
    description: "empty bindings — expression returned unchanged",
    filter: "a < 10",
    decls: [ident("a", INT64)],
    bindings: {},
    expected: "a < 10",
  },
];

// ── Constant evaluation — comparisons ─────────────────────────────────────────
// Every comparison operator is tested for both true and false outcomes across
// the supported numeric and string types.

const comparisonCases: FoldCase[] = [
  // ── int64 ─────────────────────────────────────────────────────────────────────
  {
    description: "int < → true",
    filter: "a < 10",
    decls: [ident("a", INT64)],
    bindings: { a: 3n },
    expected: "true",
  },
  {
    description: "int < → false",
    filter: "a < 10",
    decls: [ident("a", INT64)],
    bindings: { a: 15n },
    expected: "false",
  },
  {
    description: "int <= → true (equal boundary)",
    filter: "a <= 10",
    decls: [ident("a", INT64)],
    bindings: { a: 10n },
    expected: "true",
  },
  {
    description: "int <= → false",
    filter: "a <= 10",
    decls: [ident("a", INT64)],
    bindings: { a: 11n },
    expected: "false",
  },
  {
    description: "int > → true",
    filter: "a > 10",
    decls: [ident("a", INT64)],
    bindings: { a: 11n },
    expected: "true",
  },
  {
    description: "int > → false",
    filter: "a > 10",
    decls: [ident("a", INT64)],
    bindings: { a: 3n },
    expected: "false",
  },
  {
    description: "int >= → true (equal boundary)",
    filter: "a >= 10",
    decls: [ident("a", INT64)],
    bindings: { a: 10n },
    expected: "true",
  },
  {
    description: "int >= → false",
    filter: "a >= 10",
    decls: [ident("a", INT64)],
    bindings: { a: 9n },
    expected: "false",
  },
  {
    description: "int = → true",
    filter: "a = 10",
    decls: [ident("a", INT64)],
    bindings: { a: 10n },
    expected: "true",
  },
  {
    description: "int = → false",
    filter: "a = 10",
    decls: [ident("a", INT64)],
    bindings: { a: 9n },
    expected: "false",
  },
  {
    description: "int != → true",
    filter: "a != 10",
    decls: [ident("a", INT64)],
    bindings: { a: 9n },
    expected: "true",
  },
  {
    description: "int != → false",
    filter: "a != 10",
    decls: [ident("a", INT64)],
    bindings: { a: 10n },
    expected: "false",
  },

  // ── double ────────────────────────────────────────────────────────────────────
  {
    description: "double < → true",
    filter: "price < 9.99",
    decls: [ident("price", DOUBLE)],
    bindings: { price: 4.99 },
    expected: "true",
  },
  {
    description: "double < → false",
    filter: "price < 9.99",
    decls: [ident("price", DOUBLE)],
    bindings: { price: 14.99 },
    expected: "false",
  },
  {
    description: "double = → true",
    filter: "price = 9.99",
    decls: [ident("price", DOUBLE)],
    bindings: { price: 9.99 },
    expected: "true",
  },
  {
    description: "double = → false",
    filter: "price = 9.99",
    decls: [ident("price", DOUBLE)],
    bindings: { price: 4.99 },
    expected: "false",
  },

  // ── string ────────────────────────────────────────────────────────────────────
  {
    description: "string = → true",
    filter: 'env = "prod"',
    decls: [ident("env", STRING)],
    bindings: { env: "prod" },
    expected: "true",
  },
  {
    description: "string = → false",
    filter: 'env = "prod"',
    decls: [ident("env", STRING)],
    bindings: { env: "staging" },
    expected: "false",
  },
  {
    description: "string != → true",
    filter: 'env != "prod"',
    decls: [ident("env", STRING)],
    bindings: { env: "staging" },
    expected: "true",
  },
  {
    description: "string != → false",
    filter: 'env != "prod"',
    decls: [ident("env", STRING)],
    bindings: { env: "prod" },
    expected: "false",
  },
];

// ── Constant evaluation — logical operators ───────────────────────────────────
// AND and OR are folded only when *both* children are constants after
// substitution. With one unbound operand the call node is left as-is.

const logicalCases: FoldCase[] = [
  // ── AND truth table (both operands bound) ─────────────────────────────────────
  {
    description: "AND true true → true",
    filter: "a AND b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: true, b: true },
    expected: "true",
  },
  {
    description: "AND true false → false",
    filter: "a AND b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: true, b: false },
    expected: "false",
  },
  {
    description: "AND false true → false",
    filter: "a AND b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: false, b: true },
    expected: "false",
  },
  {
    description: "AND false false → false",
    filter: "a AND b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: false, b: false },
    expected: "false",
  },

  // ── AND with one unbound operand — no short-circuit ───────────────────────────
  // fold() requires both children to be constants before it evaluates a call.
  {
    description: "AND false left + unbound right — residual (no short-circuit)",
    filter: "a AND b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: false },
    expected: "false AND b",
  },
  {
    description: "AND unbound left + false right — residual (no short-circuit)",
    filter: "a AND b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { b: false },
    expected: "a AND false",
  },
  {
    description: "AND true left + unbound right — residual",
    filter: "a AND b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: true },
    expected: "true AND b",
  },

  // ── OR truth table (both operands bound) ──────────────────────────────────────
  {
    description: "OR true true → true",
    filter: "a OR b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: true, b: true },
    expected: "true",
  },
  {
    description: "OR true false → true",
    filter: "a OR b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: true, b: false },
    expected: "true",
  },
  {
    description: "OR false true → true",
    filter: "a OR b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: false, b: true },
    expected: "true",
  },
  {
    description: "OR false false → false",
    filter: "a OR b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: false, b: false },
    expected: "false",
  },

  // ── OR with one unbound operand — no short-circuit ────────────────────────────
  {
    description: "OR true left + unbound right — residual (no short-circuit)",
    filter: "a OR b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: true },
    expected: "true OR b",
  },
  {
    description: "OR unbound left + true right — residual (no short-circuit)",
    filter: "a OR b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { b: true },
    expected: "a OR true",
  },
  {
    description: "OR false left + unbound right — residual",
    filter: "a OR b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    bindings: { a: false },
    expected: "false OR b",
  },

  // ── NOT ───────────────────────────────────────────────────────────────────────
  {
    description: "NOT true → false",
    filter: "NOT a",
    decls: [ident("a", BOOL)],
    bindings: { a: true },
    expected: "false",
  },
  {
    description: "NOT false → true",
    filter: "NOT a",
    decls: [ident("a", BOOL)],
    bindings: { a: false },
    expected: "true",
  },
  {
    description: "NOT over a comparison — inner true → outer false",
    filter: "NOT a > 10",
    decls: [ident("a", INT64)],
    bindings: { a: 15n },
    expected: "false",
  },
  {
    description: "NOT over a comparison — inner false → outer true",
    filter: "NOT a > 10",
    decls: [ident("a", INT64)],
    bindings: { a: 3n },
    expected: "true",
  },
];

// ── Constant evaluation — iterative / partial folding ─────────────────────────
// fold() runs up to 10 passes. These cases verify that multi-level reductions
// complete fully and that partial bindings leave a correct residual expression.

const iterativeCases: FoldCase[] = [
  {
    description: "nested comparisons fold iteratively — both sides fully bound",
    filter: "a < 10 AND b > 0",
    decls: [ident("a", INT64), ident("b", INT64)],
    bindings: { a: 3n, b: 5n },
    expected: "true",
  },
  {
    description: "partial fold — bound side evaluates, unbound side stays",
    filter: "a < 10 AND b > 0",
    decls: [ident("a", INT64), ident("b", INT64)],
    bindings: { a: 3n },
    // (3 < 10) folds to true; (true AND (b > 0)) cannot fully reduce
    expected: "true AND b > 0",
  },
  {
    description: "three-clause AND folds completely when all idents bound",
    filter: "a < 10 AND b > 0 AND c = 1",
    decls: [ident("a", INT64), ident("b", INT64), ident("c", INT64)],
    bindings: { a: 3n, b: 5n, c: 1n },
    expected: "true",
  },
  {
    description: "NOT over AND over comparisons folds fully",
    filter: "NOT (a > 0 AND b > 0)",
    decls: [ident("a", INT64), ident("b", INT64)],
    bindings: { a: 5n, b: 5n },
    expected: "false",
  },
];

// ── Constant evaluation — string methods ──────────────────────────────────────
// All four methods are tested for both match and non-match outcomes.

const stringMethodCases: FoldCase[] = [
  {
    description: "startsWith — match → true",
    filter: 'env.startsWith("pr")',
    decls: [ident("env", STRING)],
    bindings: { env: "prod" },
    expected: "true",
  },
  {
    description: "startsWith — no match → false",
    filter: 'env.startsWith("st")',
    decls: [ident("env", STRING)],
    bindings: { env: "prod" },
    expected: "false",
  },
  {
    description: "endsWith — match → true",
    filter: 'env.endsWith("od")',
    decls: [ident("env", STRING)],
    bindings: { env: "prod" },
    expected: "true",
  },
  {
    description: "endsWith — no match → false",
    filter: 'env.endsWith("pr")',
    decls: [ident("env", STRING)],
    bindings: { env: "prod" },
    expected: "false",
  },
  {
    description: "contains — match → true",
    filter: 'env.contains("ro")',
    decls: [ident("env", STRING)],
    bindings: { env: "prod" },
    expected: "true",
  },
  {
    description: "contains — no match → false",
    filter: 'env.contains("xyz")',
    decls: [ident("env", STRING)],
    bindings: { env: "prod" },
    expected: "false",
  },
  {
    description: "matches — regex match → true",
    filter: 'env.matches("^pr.*")',
    decls: [ident("env", STRING)],
    bindings: { env: "prod" },
    expected: "true",
  },
  {
    description: "matches — regex no match → false",
    filter: 'env.matches("^st.*")',
    decls: [ident("env", STRING)],
    bindings: { env: "prod" },
    expected: "false",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

function runFoldCase({ filter, decls, bindings, expected }: FoldCase) {
  const { checkedExpr } = check(parse(filter), decls);
  const result = optimize(checkedExpr, fold(bindings));
  assert.isDefined(result.expr);
  assert.equal(unparse(result.expr), expected);
}

describe("fold — ident substitution", () => {
  for (const tc of substitutionCases) {
    it(tc.description, () => runFoldCase(tc));
  }
});

describe("fold — constant evaluation: comparisons", () => {
  for (const tc of comparisonCases) {
    it(tc.description, () => runFoldCase(tc));
  }
});

describe("fold — constant evaluation: logical operators", () => {
  for (const tc of logicalCases) {
    it(tc.description, () => runFoldCase(tc));
  }
});

describe("fold — constant evaluation: iterative and partial folding", () => {
  for (const tc of iterativeCases) {
    it(tc.description, () => runFoldCase(tc));
  }
});

describe("fold — constant evaluation: string methods", () => {
  for (const tc of stringMethodCases) {
    it(tc.description, () => runFoldCase(tc));
  }
});
