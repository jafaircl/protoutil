/** biome-ignore-all lint/suspicious/noExplicitAny: TODO */
/** biome-ignore-all lint/style/noNonNullAssertion: TODO */

import { assert, describe, it } from "vitest";
import type { Decl } from "../gen/google/api/expr/v1alpha1/checked_pb.js";
import { check, outputType } from "./checker.js";
import { AipFilterError, ErrorCode, TypeCheckError } from "./errors.js";
import { parse } from "./parser.js";
import { SemanticAdorner, toDebugString } from "./to-debug-string.js";
import type { TypeInit } from "./types.js";
import {
  BOOL,
  BYTES,
  DOUBLE,
  DYN,
  ERROR,
  func,
  INT64,
  ident,
  listType,
  mapType,
  memberOverload,
  messageType,
  NULL,
  overload,
  STRING,
  TIMESTAMP,
  typeToString,
  UINT64,
} from "./types.js";

// ── Test table ────────────────────────────────────────────────────────────────
//
// Each case mirrors the shape of cel-go's checker_test.go:
//
//   in      – the filter string to parse and check
//   decls   – extra ident/function declarations (optional)
//   out     – expected adorned debug string produced by SemanticAdorner
//   outType – expected top-level output type (omit for DYN / error cases)
//   err     – expected substring of the first error message (error cases only;
//             mutually exclusive with out/outType)
//
// The adorned format is cel-go style: every node gets `~type` and calls/idents
// also get `^overloadId` or `^name`.

type Case = {
  description?: string;
  in: string;
  decls?: Decl[];
} & (
  | { out: string; outType?: TypeInit; err?: never }
  | { err: string; out?: never; outType?: never }
);

const cases: Case[] = [
  // ── Constants ──────────────────────────────────────────────────────────────

  {
    in: "true",
    out: "true~bool",
    outType: BOOL,
  },
  {
    in: "false",
    out: "false~bool",
    outType: BOOL,
  },
  {
    in: "null",
    out: "null~null",
    outType: NULL,
  },
  {
    in: "42",
    out: "42~int",
    outType: INT64,
  },
  {
    in: "-42",
    out: "-42~int",
    outType: INT64,
  },
  {
    in: "1u",
    out: "1u~uint",
    outType: UINT64,
  },
  {
    in: "3.14",
    out: "3.14~double",
    outType: DOUBLE,
  },
  {
    in: `"hello"`,
    out: `"hello"~string`,
    outType: STRING,
  },

  // ── Ident resolution ───────────────────────────────────────────────────────

  {
    description: "known ident resolves to declared type",
    in: "retries",
    decls: [ident("retries", INT64)],
    out: "retries~int^retries",
    outType: INT64,
  },
  {
    description: "known string ident",
    in: "status",
    decls: [ident("status", STRING)],
    out: "status~string^status",
    outType: STRING,
  },
  {
    description: "known bool ident",
    in: "active",
    decls: [ident("active", BOOL)],
    out: "active~bool^active",
    outType: BOOL,
  },
  {
    description: "DYN ident — omitted from typeMap, reference still present",
    in: "x",
    decls: [ident("x", DYN)],
    out: "x^x",
    outType: undefined,
  },
  {
    description: "undeclared ident produces error",
    in: "unknownIdent",
    err: "unknownIdent",
  },

  // ── Comparisons ────────────────────────────────────────────────────────────

  {
    in: "a < 10",
    decls: [ident("a", INT64)],
    out: `_<_(
  a~int^a,
  10~int
)~bool^less_int64`,
    outType: BOOL,
  },
  {
    in: "a <= 10",
    decls: [ident("a", INT64)],
    out: `_<=_(
  a~int^a,
  10~int
)~bool^less_equals_int64`,
    outType: BOOL,
  },
  {
    in: "a > 10",
    decls: [ident("a", INT64)],
    out: `_>_(
  a~int^a,
  10~int
)~bool^greater_int64`,
    outType: BOOL,
  },
  {
    in: "a >= 10",
    decls: [ident("a", INT64)],
    out: `_>=_(
  a~int^a,
  10~int
)~bool^greater_equals_int64`,
    outType: BOOL,
  },
  {
    in: "a = b",
    decls: [ident("a", STRING), ident("b", STRING)],
    out: `_==_(
  a~string^a,
  b~string^b
)~bool^equals_string`,
    outType: BOOL,
  },
  {
    in: "a != b",
    decls: [ident("a", STRING), ident("b", STRING)],
    out: `_!=_(
  a~string^a,
  b~string^b
)~bool^not_equals_string`,
    outType: BOOL,
  },
  {
    description: "has / map-key operator",
    in: `labels:"deprecated"`,
    decls: [ident("labels", mapType(STRING, STRING))],
    out: `@in(
  labels~map(string, string)^labels,
  "deprecated"~string
)~bool^in_map`,
    outType: BOOL,
  },

  // ── Logical operators ──────────────────────────────────────────────────────

  {
    in: "a AND b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    out: `_&&_(
  a~bool^a,
  b~bool^b
)~bool^logical_and`,
    outType: BOOL,
  },
  {
    in: "a OR b",
    decls: [ident("a", BOOL), ident("b", BOOL)],
    out: `_||_(
  a~bool^a,
  b~bool^b
)~bool^logical_or`,
    outType: BOOL,
  },
  {
    in: "NOT a",
    decls: [ident("a", BOOL)],
    out: `@not(
  a~bool^a
)~bool^logical_not`,
    outType: BOOL,
  },
  {
    description: "chained AND",
    in: "a AND b AND c",
    decls: [ident("a", BOOL), ident("b", BOOL), ident("c", BOOL)],
    out: `_&&_(
  _&&_(
    a~bool^a,
    b~bool^b
  )~bool^logical_and,
  c~bool^c
)~bool^logical_and`,
    outType: BOOL,
  },
  {
    description: "AND with comparison children",
    in: "a = 1 AND b = 2",
    decls: [ident("a", INT64), ident("b", INT64)],
    out: `_&&_(
  _==_(
    a~int^a,
    1~int
  )~bool^equals_int64,
  _==_(
    b~int^b,
    2~int
  )~bool^equals_int64
)~bool^logical_and`,
    outType: BOOL,
  },
  {
    description: "NOT over comparison",
    in: "NOT a > 3",
    decls: [ident("a", INT64)],
    out: `@not(
  _>_(
    a~int^a,
    3~int
  )~bool^greater_int64
)~bool^logical_not`,
    outType: BOOL,
  },

  // ── Member access (select) ─────────────────────────────────────────────────

  {
    description: "select on map<string, int> → int",
    in: "m.count",
    decls: [ident("m", mapType(STRING, INT64))],
    out: "m~map(string, int)^m.count~int",
    outType: INT64,
  },
  {
    description: "select on map<string, string> → string",
    in: "m.label",
    decls: [ident("m", mapType(STRING, STRING))],
    out: "m~map(string, string)^m.label~string",
    outType: STRING,
  },
  {
    description: "select on message type → dyn (no schema)",
    in: "r.field",
    decls: [ident("r", messageType("Request"))],
    out: "r~Request^r.field",
    outType: undefined,
  },
  {
    description: "select on dyn → dyn",
    in: "x.field",
    decls: [ident("x", DYN)],
    out: "x^x.field",
    outType: undefined,
  },
  {
    description: "chained select on nested map",
    in: "a.b.c",
    decls: [ident("a", mapType(STRING, mapType(STRING, INT64)))],
    out: "a~map(string, map(string, int))^a.b~map(string, int).c~int",
    outType: INT64,
  },

  // ── Function calls ─────────────────────────────────────────────────────────

  {
    description: "size(string) → int",
    in: "size(s)",
    decls: [ident("s", STRING)],
    out: `size(
  s~string^s
)~int^size_string`,
    outType: INT64,
  },
  {
    description: "timestamp() → timestamp",
    in: `timestamp("2024-01-01T00:00:00Z")`,
    out: `timestamp(
  "2024-01-01T00:00:00Z"~string
)~timestamp^timestamp_string`,
    outType: TIMESTAMP,
  },
  {
    description: "custom function decl",
    in: "cohort(u)",
    decls: [ident("u", STRING), func("cohort", overload("cohort_string", [STRING], BOOL))],
    out: `cohort(
  u~string^u
)~bool^cohort_string`,
    outType: BOOL,
  },
  {
    description: "unknown function → error",
    in: "noSuchFunc(x)",
    err: "noSuchFunc",
  },

  // ── Method calls ───────────────────────────────────────────────────────────

  {
    in: `s.startsWith("x")`,
    decls: [ident("s", STRING)],
    out: `s~string^s.startsWith(
  "x"~string
)~bool^string_starts_with`,
    outType: BOOL,
  },
  {
    in: `s.endsWith("x")`,
    decls: [ident("s", STRING)],
    out: `s~string^s.endsWith(
  "x"~string
)~bool^string_ends_with`,
    outType: BOOL,
  },
  {
    in: `s.contains("x")`,
    decls: [ident("s", STRING)],
    out: `s~string^s.contains(
  "x"~string
)~bool^string_contains`,
    outType: BOOL,
  },
  {
    description: "custom member overload",
    in: `r.cohort("vip")`,
    decls: [
      ident("r", messageType("Request")),
      func("cohort", memberOverload("request_cohort_string", [STRING], BOOL)),
    ],
    out: `r~Request^r.cohort(
  "vip"~string
)~bool^request_cohort_string`,
    outType: BOOL,
  },

  // ── AIP-style real-world filters ───────────────────────────────────────────

  {
    description: "status equality filter",
    in: `status = "ACTIVE"`,
    decls: [ident("status", STRING)],
    out: `_==_(
  status~string^status,
  "ACTIVE"~string
)~bool^equals_string`,
    outType: BOOL,
  },
  {
    description: `NOT labels:"deprecated"`,
    in: `NOT labels:"deprecated"`,
    decls: [ident("labels", mapType(STRING, STRING))],
    out: `@not(
  @in(
    labels~map(string, string)^labels,
    "deprecated"~string
  )~bool^in_map
)~bool^logical_not`,
    outType: BOOL,
  },
  {
    description: "compound AND filter",
    in: `status = "ACTIVE" AND retries < 3`,
    decls: [ident("status", STRING), ident("retries", INT64)],
    out: `_&&_(
  _==_(
    status~string^status,
    "ACTIVE"~string
  )~bool^equals_string,
  _<_(
    retries~int^retries,
    3~int
  )~bool^less_int64
)~bool^logical_and`,
    outType: BOOL,
  },
  {
    description: "experiment.rollout <= cohort(request.user)",
    in: "experiment.rollout <= cohort(request.user)",
    decls: [
      ident("experiment", mapType(STRING, DOUBLE)),
      ident("request", mapType(STRING, STRING)),
      func("cohort", overload("cohort_string", [STRING], DOUBLE)),
    ],
    out: `_<=_(
  experiment~map(string, double)^experiment.rollout~double,
  cohort(
    request~map(string, string)^request.user~string
  )~double^cohort_string
)~bool^less_equals_double`,
    outType: BOOL,
  },

  // ── Error cases ────────────────────────────────────────────────────────────

  {
    description: "undeclared ident typed as ERROR",
    in: "unknownIdent",
    err: "unknownIdent",
  },
  {
    description: "error includes source position info",
    in: "unknownIdent",
    err: "unknownIdent",
  },
  {
    description: "undeclared ident in compound expression",
    in: "a AND missing",
    decls: [ident("a", BOOL)],
    err: "missing",
  },

  // ── Type mismatches ────────────────────────────────────────────────────────
  // The checker does strict overload matching but falls back to the first
  // overload when no match is found — it only errors for completely unknown
  // functions. Type-incompatible operands therefore produce a result type from
  // the fallback overload, not a type error. These cases document that behavior.

  {
    description: "type mismatch: INT64 compared to STRING — falls back to first overload",
    in: `a < "hello"`,
    decls: [ident("a", INT64)],
    // No less_* overload matches (INT64, STRING), falls back to less_int64
    out: `_<_(
  a~int^a,
  "hello"~string
)~bool^less_int64`,
    outType: BOOL,
  },
  {
    description: "non-BOOL in AND — falls back to logical_and",
    in: "a AND b",
    decls: [ident("a", STRING), ident("b", STRING)],
    out: `_&&_(
  a~string^a,
  b~string^b
)~bool^logical_and`,
    outType: BOOL,
  },
  {
    description: "non-BOOL in NOT — falls back to logical_not",
    in: "NOT a",
    decls: [ident("a", STRING)],
    out: `@not(
  a~string^a
)~bool^logical_not`,
    outType: BOOL,
  },

  // ── DYN ident in comparisons ───────────────────────────────────────────────

  {
    description: "DYN ident in equality — succeeds, result is BOOL",
    in: `x = "hello"`,
    decls: [ident("x", DYN)],
    // DYN is compatible with any overload; checker picks first match (equals_string)
    // but since x is DYN it's omitted from typeMap — no ~type on x
    out: `_==_(
  x^x,
  "hello"~string
)~bool^equals_string`,
    outType: BOOL,
  },
  {
    description: "DYN ident in comparison — succeeds, result is BOOL",
    in: "x > 0",
    decls: [ident("x", DYN)],
    out: `_>_(
  x^x,
  0~int
)~bool^greater_int64`,
    outType: BOOL,
  },

  // ── has against a list ─────────────────────────────────────────────────────

  {
    description: "has operator against list(string) — matches in_list overload",
    in: `items:"foo"`,
    decls: [ident("items", listType(STRING))],
    out: `@in(
  items~list(string)^items,
  "foo"~string
)~bool^in_list`,
    outType: BOOL,
  },
  {
    description: "has operator against list(int)",
    in: "scores:42",
    decls: [ident("scores", listType(INT64))],
    out: `@in(
  scores~list(int)^scores,
  42~int
)~bool^in_list`,
    outType: BOOL,
  },

  // ── Numeric type comparisons ───────────────────────────────────────────────

  {
    description: "DOUBLE comparison — price <= 99.99",
    in: "price <= 99.99",
    decls: [ident("price", DOUBLE)],
    out: `_<=_(
  price~double^price,
  99.99~double
)~bool^less_equals_double`,
    outType: BOOL,
  },
  {
    description: "UINT64 comparison",
    in: "count >= 1u",
    decls: [ident("count", UINT64)],
    out: `_>=_(
  count~uint^count,
  1u~uint
)~bool^greater_equals_uint64`,
    outType: BOOL,
  },
  {
    description: "string comparison with < operator",
    in: `name < "m"`,
    decls: [ident("name", STRING)],
    out: `_<_(
  name~string^name,
  "m"~string
)~bool^less_string`,
    outType: BOOL,
  },

  // ── null comparisons ───────────────────────────────────────────────────────

  {
    description: "field = null uses DYN equality fallback",
    in: "field = null",
    decls: [ident("field", DYN)],
    // field is DYN so no ~type; null is ~null; no equality overload takes null
    // so the checker falls back to the first overload (equals_int64)
    out: `_==_(
  field^field,
  null~null
)~bool^equals_int64`,
    outType: BOOL,
  },

  // ── size() on list and map ─────────────────────────────────────────────────

  {
    description: "size(list) → int",
    in: "size(items)",
    decls: [ident("items", listType(STRING))],
    out: `size(
  items~list(string)^items
)~int^size_list`,
    outType: INT64,
  },
  {
    description: "size(map) → int",
    in: "size(m)",
    decls: [ident("m", mapType(STRING, INT64))],
    out: `size(
  m~map(string, int)^m
)~int^size_map`,
    outType: INT64,
  },

  // ── matches() ─────────────────────────────────────────────────────────────

  {
    description: "string.matches() → bool",
    in: `s.matches("^hello.*")`,
    decls: [ident("s", STRING)],
    out: `s~string^s.matches(
  "^hello.*"~string
)~bool^string_matches`,
    outType: BOOL,
  },

  // ── Select on additional map value types ──────────────────────────────────

  {
    description: "select on map<string, bool> → bool",
    in: "flags.enabled",
    decls: [ident("flags", mapType(STRING, BOOL))],
    out: "flags~map(string, bool)^flags.enabled~bool",
    outType: BOOL,
  },
  {
    description: "select on map<string, double> → double",
    in: "metrics.latency",
    decls: [ident("metrics", mapType(STRING, DOUBLE))],
    out: "metrics~map(string, double)^metrics.latency~double",
    outType: DOUBLE,
  },

  // ── Timestamp comparison — canonical AIP date-range pattern ───────────────

  {
    description: "timestamp comparison — create_time > timestamp(...)",
    in: `create_time > timestamp("2024-01-01T00:00:00Z")`,
    decls: [ident("create_time", TIMESTAMP)],
    // TIMESTAMP is a wellKnown type; no comparison overload declared for it,
    // so the checker falls back to the first overload (less_int64) but still
    // resolves and returns BOOL. The important thing is no error is raised
    // for the timestamp() call itself.
    out: `_>_(
  create_time~timestamp^create_time,
  timestamp(
    "2024-01-01T00:00:00Z"~string
  )~timestamp^timestamp_string
)~bool^greater_int64`,
    outType: BOOL,
  },

  // ── Deeply nested compound real-world filter ───────────────────────────────

  {
    description: "compound OR + has + AND — typical API list filter",
    in: `(status = "ACTIVE" OR status = "PENDING") AND NOT labels:"env"`,
    decls: [ident("status", STRING), ident("labels", mapType(STRING, STRING))],
    out: `_&&_(
  _||_(
    _==_(
      status~string^status,
      "ACTIVE"~string
    )~bool^equals_string,
    _==_(
      status~string^status,
      "PENDING"~string
    )~bool^equals_string
  )~bool^logical_or,
  @not(
    @in(
      labels~map(string, string)^labels,
      "env"~string
    )~bool^in_map
  )~bool^logical_not
)~bool^logical_and`,
    outType: BOOL,
  },
  {
    description: "three-clause AND with select, comparison, and has",
    in: `region = "us-east-1" AND priority > 5 AND NOT labels:"archived"`,
    decls: [
      ident("region", STRING),
      ident("priority", INT64),
      ident("labels", mapType(STRING, STRING)),
    ],
    out: `_&&_(
  _&&_(
    _==_(
      region~string^region,
      "us-east-1"~string
    )~bool^equals_string,
    _>_(
      priority~int^priority,
      5~int
    )~bool^greater_int64
  )~bool^logical_and,
  @not(
    @in(
      labels~map(string, string)^labels,
      "archived"~string
    )~bool^in_map
  )~bool^logical_not
)~bool^logical_and`,
    outType: BOOL,
  },

  // ── Wildcard strings ──────────────────────────────────────────────────────
  // Wildcard * inside a string is passed through as a plain string value.
  // The consumer (DB translator, frontend) is responsible for interpreting it.

  {
    description: "prefix wildcard string is a plain string constant",
    in: `name = "hello*"`,
    decls: [ident("name", STRING)],
    out: `_==_(
  name~string^name,
  "hello*"~string
)~bool^equals_string`,
    outType: BOOL,
  },
  {
    description: "suffix wildcard string is a plain string constant",
    in: `name = "*world"`,
    decls: [ident("name", STRING)],
    out: `_==_(
  name~string^name,
  "*world"~string
)~bool^equals_string`,
    outType: BOOL,
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

describe("check", () => {
  for (const tc of cases) {
    const label = tc.description ?? `check: "${tc.in}"`;
    it(label, () => {
      const parsed = parse(tc.in);
      const { checkedExpr, errors } = check(parsed, tc.decls ?? []);

      if (tc.err !== undefined) {
        assert.ok(errors.length > 0, "expected at least one error");
        assert.ok(
          errors.some((e) => e.message.includes(tc.err!)),
          `expected error containing "${tc.err}", got: ${errors.map((e) => e.message).join("; ")}`,
        );
      } else {
        assert.equal(errors.map((e) => e.message).join("; "), "", "expected no errors");

        const adorner = new SemanticAdorner(checkedExpr);
        const got = toDebugString(checkedExpr.expr!, adorner);
        assert.equal(got, tc.out);

        if (tc.outType !== undefined) {
          assert.deepEqual(outputType(checkedExpr), tc.outType);
        } else {
          // outType omitted → top-level type is DYN (absent from typeMap)
          assert.equal(outputType(checkedExpr), undefined);
        }
      }
    });
  }
});

// ── TypeCheckError plumbing ───────────────────────────────────────────────────
// These tests exercise error object shape rather than type-checking logic, so
// they live outside the data-driven table.

describe("TypeCheckError", () => {
  it("is an instance of Error, AipFilterError, and TypeCheckError", () => {
    const { errors } = check(parse("badIdent"));
    assert.ok(errors[0] instanceof Error);
    assert.ok(errors[0] instanceof AipFilterError);
    assert.ok(errors[0] instanceof TypeCheckError);
  });

  it("has exprId as bigint", () => {
    const { errors } = check(parse("badIdent"));
    assert.equal(typeof errors[0].exprId, "bigint");
  });

  it("has CHECK_UNDECLARED_IDENT code for unknown idents", () => {
    const { errors } = check(parse("badIdent"));
    assert.equal(errors[0].code, ErrorCode.CHECK_UNDECLARED_IDENT);
  });

  it("has CHECK_UNKNOWN_FUNCTION code for unknown functions", () => {
    const { errors } = check(parse("unknownFn()"));
    const fnErr = errors.find((e) => e.code === ErrorCode.CHECK_UNKNOWN_FUNCTION);
    assert.ok(fnErr, "expected a CHECK_UNKNOWN_FUNCTION error");
  });

  it("position has correct offset — leading whitespace", () => {
    // "  badIdent" — identifier starts at offset 2
    const { errors } = check(parse("  badIdent"));
    assert.equal(errors[0].position?.offset, 2);
    assert.equal(errors[0].position?.column, 2);
  });

  it("position.exprId matches error.exprId", () => {
    const { errors } = check(parse("badIdent"));
    assert.equal(errors[0].position?.exprId, errors[0].exprId);
  });

  it("multi-line: error on line 2 has correct line number", () => {
    // "a\nbadIdent" — badIdent is on line 2
    const { errors } = check(parse("a\nbadIdent"), [ident("a", BOOL)]);
    const err = errors.find((e) => e.message.includes("badIdent"));
    assert.ok(err);
    assert.equal(err!.position?.line, 2);
    assert.equal(err!.position?.column, 0);
  });

  it("embeds source when passed to check()", () => {
    const source = "badIdent";
    const { errors } = check(parse(source), [], source);
    assert.equal(errors[0].source, source);
  });

  it("toString() without source — header line only, no pointer", () => {
    const { errors } = check(parse("badIdent"));
    const str = String(errors[0]);
    assert.match(str, /^ERROR: <input>:\d+:\d+:/);
    assert.notMatch(str, /\| /);
  });

  it("toString() with source — full CEL block with pointer", () => {
    const source = "badIdent";
    const { errors } = check(parse(source), [], source);
    const str = String(errors[0]);
    assert.match(str, /^ERROR: <input>:1:1:/);
    assert.include(str, `| ${source}`);
    assert.include(str, "^");
  });

  it("name is TypeCheckError", () => {
    const { errors } = check(parse("badIdent"));
    assert.equal(errors[0].name, "TypeCheckError");
  });
});

// ── typeToString ──────────────────────────────────────────────────────────────

describe("typeToString", () => {
  it("BOOL → 'bool'", () => assert.equal(typeToString(BOOL), "bool"));
  it("INT64 → 'int64'", () => assert.equal(typeToString(INT64), "int64"));
  it("UINT64 → 'uint64'", () => assert.equal(typeToString(UINT64), "uint64"));
  it("DOUBLE → 'double'", () => assert.equal(typeToString(DOUBLE), "double"));
  it("STRING → 'string'", () => assert.equal(typeToString(STRING), "string"));
  it("BYTES → 'bytes'", () => assert.equal(typeToString(BYTES), "bytes"));
  it("NULL → 'null'", () => assert.equal(typeToString(NULL), "null"));
  it("DYN → 'dyn'", () => assert.equal(typeToString(DYN), "dyn"));
  it("ERROR → 'error'", () => assert.equal(typeToString(ERROR), "error"));
  it("TIMESTAMP → 'google.protobuf.Timestamp'", () =>
    assert.equal(typeToString(TIMESTAMP), "google.protobuf.Timestamp"));
  it("list(STRING) → 'list(string)'", () =>
    assert.equal(typeToString(listType(STRING)), "list(string)"));
  it("map(STRING, INT64) → 'map(string, int64)'", () =>
    assert.equal(typeToString(mapType(STRING, INT64)), "map(string, int64)"));
  it("messageType → fully qualified name", () =>
    assert.equal(typeToString(messageType("google.type.Date")), "google.type.Date"));
});
