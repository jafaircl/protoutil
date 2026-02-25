import { assert, describe, it } from "vitest";
import { parse } from "./parser";
import { unparse } from "./unparse";

describe("unparse", () => {
  const cases: Array<{ input: string; expected: string }> = [
    // atoms
    { input: "a", expected: "a" },
    { input: "true", expected: "true" },
    { input: "false", expected: "false" },
    { input: "null", expected: "null" },
    { input: "42", expected: "42" },
    { input: "-42", expected: "-42" },
    { input: "3.14", expected: "3.14" },
    { input: "1u", expected: "1u" },
    { input: '"hello"', expected: '"hello"' },

    // member access
    { input: "a.b", expected: "a.b" },
    { input: "a.b.c", expected: "a.b.c" },

    // comparisons — no wrapping parens needed
    { input: "a = b", expected: "a = b" },
    { input: "a != b", expected: "a != b" },
    { input: "a < b", expected: "a < b" },
    { input: "a <= b", expected: "a <= b" },
    { input: "a > b", expected: "a > b" },
    { input: "a >= b", expected: "a >= b" },

    // has
    { input: "map:key", expected: "map:key" },

    // simple logical — no parens needed
    { input: "a AND b", expected: "a AND b" },
    { input: "a OR b", expected: "a OR b" },

    // In the AIP EBNF, AND (expression) is the outermost operator and OR (factor)
    // binds more tightly than AND. So `a AND b OR c AND d` parses as three
    // AND-joined sequences: `a`, `b OR c`, `d` → `a AND (b OR c) AND d`.
    // OR inside AND always needs parens.
    { input: "a AND b OR c AND d", expected: "a AND (b OR c) AND d" },

    // Explicit parens that match the parse tree — no extra parens emitted
    { input: "(a OR b) AND c", expected: "(a OR b) AND c" },
    { input: "a AND (b OR c)", expected: "a AND (b OR c)" },

    // Pure AND chain — no parens
    { input: "a AND b AND c", expected: "a AND b AND c" },

    // Pure OR chain — no parens
    { input: "a OR b OR c", expected: "a OR b OR c" },

    // NOT over atoms and comparisons — no parens needed, they bind tighter
    { input: "NOT a", expected: "NOT a" },
    { input: 'NOT status = "ACTIVE"', expected: 'NOT status = "ACTIVE"' },
    { input: "NOT labels:deprecated", expected: "NOT labels:deprecated" },
    { input: "NOT a.b.c", expected: "NOT a.b.c" },
    // NOT over a logical group — parens required
    { input: "NOT (a AND b)", expected: "NOT (a AND b)" },
    { input: "NOT (a OR b)", expected: "NOT (a OR b)" },
    { input: 'NOT (a = "1" AND b = "2")', expected: 'NOT (a = "1" AND b = "2")' },
    { input: 'NOT (a = "1" OR b = "2")', expected: 'NOT (a = "1" OR b = "2")' },
    // AND inside OR — AND binds tighter so no parens needed
    { input: "(a AND b) OR c", expected: "a AND b OR c" },
    { input: "(a AND b) OR (c AND d)", expected: "a AND b OR c AND d" },

    // comparisons inside logical — no parens needed (comparisons bind tighter)
    { input: "a < 10 OR a > 100", expected: "a < 10 OR a > 100" },

    // method calls
    { input: 's.startsWith("x")', expected: 's.startsWith("x")' },
    { input: 's.contains("x")', expected: 's.contains("x")' },

    // Failing case from the expr-tree component
    {
      input:
        '(status = "ACTIVIA" OR status = "PENDING") AND metadata.region = "us-central1" AND NOT labels:deprecated',
      expected:
        '(status = "ACTIVIA" OR status = "PENDING") AND metadata.region = "us-central1" AND NOT labels:deprecated',
    },
  ];

  for (const { input, expected } of cases) {
    it(`unparse("${input}") → "${expected}"`, () => {
      const { expr } = parse(input);
      assert.isDefined(expr);
      assert.equal(unparse(expr), expected);
    });
  }
});
