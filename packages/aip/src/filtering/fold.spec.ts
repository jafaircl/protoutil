import { assert, describe, it } from "vitest";
import { check } from "./checker";
import { type FoldValue, fold } from "./fold";
import { optimize } from "./optimizer";
import { parse } from "./parser";
import { BOOL, DOUBLE, INT64, ident, NULL, STRING } from "./types";
import { unparse } from "./unparse";

// ─────────────────────────────────────────────────────────────────────────────
// fold — ident substitution
// ─────────────────────────────────────────────────────────────────────────────

describe("fold — ident substitution", () => {
  const cases: Array<{
    description: string;
    filter: string;
    decls: ReturnType<typeof ident>[];
    bindings: Record<string, FoldValue>;
    expected: string;
  }> = [
    {
      description: "replaces a known ident",
      filter: "retries",
      decls: [ident("retries", INT64)],
      bindings: { retries: 3n },
      expected: "3",
    },
    {
      description: "replaces multiple idents",
      filter: "a AND b",
      decls: [ident("a", BOOL), ident("b", BOOL)],
      bindings: { a: true, b: true },
      expected: "true",
    },
    {
      description: "leaves unknown idents untouched",
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
  ];

  for (const { description, filter, decls, bindings, expected } of cases) {
    it(description, () => {
      const { checkedExpr } = check(parse(filter), decls);
      const result = optimize(checkedExpr, fold(bindings));
      assert.isDefined(result.expr);
      assert.equal(unparse(result.expr), expected);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// fold — constant evaluation
// ─────────────────────────────────────────────────────────────────────────────

describe("fold — constant evaluation", () => {
  const cases: Array<{
    description: string;
    filter: string;
    decls: ReturnType<typeof ident>[];
    bindings: Record<string, FoldValue>;
    expected: string;
  }> = [
    {
      description: "int comparison → true",
      filter: "retries < 10",
      decls: [ident("retries", INT64)],
      bindings: { retries: 3n },
      expected: "true",
    },
    {
      description: "int comparison → false",
      filter: "retries < 10",
      decls: [ident("retries", INT64)],
      bindings: { retries: 15n },
      expected: "false",
    },
    {
      description: "equality → true",
      filter: 'env = "prod"',
      decls: [ident("env", STRING)],
      bindings: { env: "prod" },
      expected: "true",
    },
    {
      description: "inequality → true",
      filter: 'env != "prod"',
      decls: [ident("env", STRING)],
      bindings: { env: "staging" },
      expected: "true",
    },
    {
      description: "AND both true",
      filter: "a AND b",
      decls: [ident("a", BOOL), ident("b", BOOL)],
      bindings: { a: true, b: true },
      expected: "true",
    },
    {
      description: "AND short-circuit false",
      filter: "a AND b",
      decls: [ident("a", BOOL), ident("b", BOOL)],
      bindings: { a: false, b: true },
      expected: "false",
    },
    {
      description: "OR short-circuit true",
      filter: "a OR b",
      decls: [ident("a", BOOL), ident("b", BOOL)],
      bindings: { a: true, b: false },
      expected: "true",
    },
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
      description: "nested folds iteratively",
      filter: "a < 10 AND b > 0",
      decls: [ident("a", INT64), ident("b", INT64)],
      bindings: { a: 3n, b: 5n },
      expected: "true",
    },
    {
      description: "partial fold — one side known",
      filter: "a < 10 AND b > 0",
      decls: [ident("a", INT64), ident("b", INT64)],
      bindings: { a: 3n },
      // (3 < 10) folds to true; (true AND (b > 0)) stays since b is unknown
      expected: "true AND b > 0",
    },
    {
      description: "startsWith method",
      filter: 'env.startsWith("pr")',
      decls: [ident("env", STRING)],
      bindings: { env: "prod" },
      expected: "true",
    },
    {
      description: "contains method",
      filter: 'env.contains("ro")',
      decls: [ident("env", STRING)],
      bindings: { env: "prod" },
      expected: "true",
    },
    {
      description: "endsWith method",
      filter: 'env.endsWith("od")',
      decls: [ident("env", STRING)],
      bindings: { env: "prod" },
      expected: "true",
    },
  ];

  for (const { description, filter, decls, bindings, expected } of cases) {
    it(description, () => {
      const { checkedExpr } = check(parse(filter), decls);
      const result = optimize(checkedExpr, fold(bindings));
      assert.isDefined(result.expr);
      assert.equal(unparse(result.expr), expected);
    });
  }
});
