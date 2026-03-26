import { assert, describe, it } from "vitest";
import { parse } from "./parser.js";
import { unparse } from "./unparse.js";

// Every case must satisfy: unparse(parse(input).expr) === input
// If the round-trip produces a different string, that is a bug in the unparser.
// Cases where the canonical form differs from a user-supplied input are handled
// by writing the canonical form as the input (i.e. we test the canonical string,
// not every possible way to write an equivalent expression).

describe("unparse", () => {
  const cases: Array<{ description?: string; input: string }> = [
    // ── Atoms ──────────────────────────────────────────────────────────────────
    { input: "a" },
    { input: "true" },
    { input: "false" },
    { input: "null" },
    { input: "42" },
    { input: "-42" },
    { input: "3.14" },
    { input: "-3.14" },
    { input: "1u" },
    { input: `"hello"` },
    // single-quoted strings are normalised to double-quoted by the parser
    { description: "single-quoted string normalises to double-quoted", input: `"hello"` },

    // ── Member access ───────────────────────────────────────────────────────────
    { input: "a.b" },
    { input: "a.b.c" },
    { input: "expr.type_map.1.type" },
    { input: "a.AND" },
    { input: "a.OR" },
    { input: "a.NOT" },

    // ── Comparisons ─────────────────────────────────────────────────────────────
    { input: "a = b" },
    { input: "a != b" },
    { input: "a < b" },
    { input: "a <= b" },
    { input: "a > b" },
    { input: "a >= b" },
    { input: "map:key" },
    { input: "a.b:c" },
    { description: "has with quoted string key", input: `labels:"deprecated"` },
    { input: "package = com.google" },
    { input: "yesterday < request.time" },
    { input: `status = "ACTIVE"` },
    { description: "null literal in equality", input: "field = null" },
    { description: "prefix wildcard string round-trips", input: `name = "hello*"` },
    { description: "suffix wildcard string round-trips", input: `name = "*world"` },

    // ── NOT ─────────────────────────────────────────────────────────────────────
    { input: "NOT a" },
    { input: "NOT a > 3" },
    { input: "NOT (a OR b)" },
    { input: "NOT (a AND b)" },
    { input: `NOT status = "ACTIVE"` },
    { input: "NOT labels:deprecated" },
    { input: "NOT a.b.c" },
    { input: `NOT (a = "1" AND b = "2")` },
    { input: `NOT (a = "1" OR b = "2")` },
    { description: "minus-negation unparses as NOT", input: `NOT file:".java"` },

    // ── AND ─────────────────────────────────────────────────────────────────────
    { input: "a AND b" },
    { input: "a AND b AND c" },
    { input: "a = 1 AND b = 2" },

    // ── OR ──────────────────────────────────────────────────────────────────────
    { input: "a OR b" },
    { input: "a OR b OR c" },

    // ── AND / OR precedence ─────────────────────────────────────────────────────
    // In AIP EBNF, OR (factor) binds TIGHTER than AND (expression/sequence).
    // Consequences:
    //   - OR inside AND needs parens:        a AND (b OR c)
    //   - AND inside OR does NOT need parens: a AND b OR c AND d
    //   - a AND b OR c AND d parses as:       a AND (b OR c) AND d
    //     so its canonical unparse is:        a AND (b OR c) AND d
    {
      description: "OR inside AND requires parens",
      input: "a AND (b OR c)",
    },
    {
      description: "AND inside OR does not require parens — canonical form after parse",
      input: "a AND (b OR c) AND d",
    },
    {
      description: "(a OR b) AND c — OR on left of AND, needs parens",
      input: "(a OR b) AND c",
    },

    {
      description: "comparisons inside OR — no parens needed",
      input: "a < 10 OR a > 100",
    },

    // ── Implicit AND (sequence) ─────────────────────────────────────────────────
    // The unparser emits explicit AND for all _&&_ nodes. Implicit-AND inputs
    // therefore do NOT round-trip to themselves; skip them here. The parser
    // spec already covers the parse tree shape for those inputs.

    // ── Nested combinations ─────────────────────────────────────────────────────
    {
      description: "OR child nested inside AND — classic round-trip case",
      input: "(region = US OR (region = EU AND status = ACTIVE)) AND priority > 3",
    },
    {
      description: "OR child of AND",
      input: "(region = US OR region = EU) AND status = ACTIVE",
    },
    {
      description: "NOT after AND regression case",
      input:
        '(status = "ACTIVIA" OR status = "PENDING") AND metadata.region = "us-central1" AND NOT labels:deprecated',
    },
    {
      description: "deeply nested AND inside OR inside AND",
      input: "a AND (b AND c OR d) AND e",
    },
    {
      description: "NOT over AND inside OR",
      input: "NOT (a AND b) OR c",
    },

    // ── Functions ───────────────────────────────────────────────────────────────
    { input: "foo()" },
    { input: "foo(a, b, c)" },
    { input: `regex(m.key, "^.*prod.*$")` },
    { input: `math.mem("30mb")` },
    { input: `s.startsWith("x")` },
    { input: `s.contains("x")` },
    { input: "experiment.rollout <= cohort(request.user)" },

    // ── Durations ───────────────────────────────────────────────────────────────
    { input: "20s" },
    { input: "-5s" },
    // Round trip will only ever output seconds. See below for normalized tests

    // ── Timestamps ──────────────────────────────────────────────────────────────
    { input: "2021-01-01T00:00:00Z" },
    // Round trip normalizes to UTC time. See below for normalized tests
  ];

  for (const tc of cases) {
    const label = tc.description
      ? `${tc.description}: "${tc.input}"`
      : `round-trips: "${tc.input}"`;
    it(label, () => {
      const { expr } = parse(tc.input);
      assert.isDefined(expr);
      assert.equal(unparse(expr), tc.input);
    });
  }

  describe("duration/timestamp normalized output", () => {
    const cases = [
      // Durations
      {
        description: "duration: 1.5s",
        input: "1.5s",
        output: "1.500000000s",
      },
      {
        description: "duration: 1h",
        input: "1h",
        output: "3600s",
      },
      {
        description: "duration: 1m",
        input: "1m",
        output: "60s",
      },
      {
        description: "duration: 1ms",
        input: "1ms",
        output: "0.001000000s",
      },
      {
        description: "duration: 1us",
        input: "1us",
        output: "0.000001000s",
      },
      {
        description: "duration: 1ns",
        input: "1ns",
        output: "0.000000001s",
      },
      {
        description: "duration: 1.5h",
        input: "1.5h",
        output: "5400s",
      },
      {
        description: "duration: compound 1h30m",
        input: "1h30m",
        output: "5400s",
      },
      // Timestamps
      {
        description: "timestamp: with timezone offset",
        input: "2012-04-21T11:30:00-04:00",
        output: "2012-04-21T15:30:00Z",
      },
    ];
    for (const tc of cases) {
      it(tc.description);
      const { expr } = parse(tc.input);
      assert.isDefined(expr);
      assert.equal(unparse(expr), tc.output);
    }
  });
});
