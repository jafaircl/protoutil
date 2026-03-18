import { describe, expect, it } from "vitest";
import type { Expr } from "../gen/google/api/expr/v1alpha1/syntax_pb.js";
import { AipFilterError, ErrorCode, ParseError } from "./errors.js";
import { parse } from "./parser.js";
import { KindAdorner, toDebugString } from "./to-debug-string.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function P(input: string): string {
  const { expr } = parse(input);
  return normalise(toDebugString(expr as Expr, KindAdorner.singleton));
}

function normalise(s: string): string {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Valid cases
// ─────────────────────────────────────────────────────────────────────────────

const cases: Array<{ description?: string; input: string; P: string }> = [
  // ── Atoms ──────────────────────────────────────────────────────────────────
  {
    input: `"A"`,
    P: `"A"^#1:*expr.Constant_StringValue#`,
  },
  {
    input: `'hello'`,
    P: `"hello"^#1:*expr.Constant_StringValue#`,
  },
  {
    input: "true",
    P: "true^#1:*expr.Constant_BoolValue#",
  },
  {
    input: "false",
    P: "false^#1:*expr.Constant_BoolValue#",
  },
  {
    input: "null",
    P: "null^#1:*expr.Constant_NullValue#",
  },
  {
    input: "42",
    P: "42^#1:*expr.Constant_Int64Value#",
  },
  {
    input: "-1",
    P: "-1^#1:*expr.Constant_Int64Value#",
  },
  {
    input: "23.39",
    P: "23.39^#1:*expr.Constant_DoubleValue#",
  },
  {
    input: "-3.14",
    P: "-3.14^#1:*expr.Constant_DoubleValue#",
  },
  {
    input: "1u",
    P: "1u^#1:*expr.Constant_Uint64Value#",
  },
  {
    input: "a",
    P: "a^#1:*expr.Expr_IdentExpr#",
  },

  // ── Duration atoms ──────────────────────────────────────────────────────
  {
    description: "duration: 20s",
    input: "20s",
    P: "20s^#1:*expr.Constant_DurationValue#",
  },
  {
    description: "duration: 1.5s",
    input: "1.5s",
    P: "1.500000000s^#1:*expr.Constant_DurationValue#",
  },
  {
    description: "duration: 1h",
    input: "1h",
    P: "3600s^#1:*expr.Constant_DurationValue#",
  },
  {
    description: "duration: 1m",
    input: "1m",
    P: "60s^#1:*expr.Constant_DurationValue#",
  },
  {
    description: "duration: 1ms",
    input: "1ms",
    P: "0.001000000s^#1:*expr.Constant_DurationValue#",
  },
  {
    description: "duration: 1us",
    input: "1us",
    P: "0.000001000s^#1:*expr.Constant_DurationValue#",
  },
  {
    description: "duration: 1ns",
    input: "1ns",
    P: "0.000000001s^#1:*expr.Constant_DurationValue#",
  },
  {
    description: "duration: 1.5h",
    input: "1.5h",
    P: "5400s^#1:*expr.Constant_DurationValue#",
  },
  {
    description: "duration: compound 1h30m",
    input: "1h30m",
    P: "5400s^#1:*expr.Constant_DurationValue#",
  },
  {
    description: "negative duration: -5s",
    input: "-5s",
    P: "-5s^#1:*expr.Constant_DurationValue#",
  },
  {
    description: "duration as comparison arg",
    input: "ttl > 5s",
    P: `_>_(
ttl^#1:*expr.Expr_IdentExpr#,
5s^#2:*expr.Constant_DurationValue#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    description: "decimal duration as comparison arg",
    input: "ttl <= 1.5s",
    P: `_<=_(
ttl^#1:*expr.Expr_IdentExpr#,
1.500000000s^#2:*expr.Constant_DurationValue#
)^#3:*expr.Expr_CallExpr#`,
  },

  // ── Timestamp atoms ─────────────────────────────────────────────────────
  {
    description: "timestamp: UTC",
    input: "2021-01-01T00:00:00Z",
    P: "2021-01-01T00:00:00Z^#1:*expr.Constant_TimestampValue#",
  },
  {
    description: "timestamp: with timezone offset",
    input: "2012-04-21T11:30:00-04:00",
    P: "2012-04-21T15:30:00Z^#1:*expr.Constant_TimestampValue#",
  },
  {
    description: "timestamp UTC as comparison arg",
    input: "created_at > 2021-01-01T00:00:00Z",
    P: `_>_(
created_at^#1:*expr.Expr_IdentExpr#,
2021-01-01T00:00:00Z^#2:*expr.Constant_TimestampValue#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    description: "timestamp with TZ as comparison arg",
    input: "created_at <= 2012-04-21T11:30:00-04:00",
    P: `_<=_(
created_at^#1:*expr.Expr_IdentExpr#,
2012-04-21T15:30:00Z^#2:*expr.Constant_TimestampValue#
)^#3:*expr.Expr_CallExpr#`,
  },

  // ── Empty filter — EBNF: filter = [expression] ─────────────────────────────
  {
    description: "empty string is a valid filter",
    input: "",
    P: `^#1:*expr.Expr_IdentExpr#`,
  },
  {
    description: "whitespace-only is a valid filter",
    input: "   ",
    P: `^#1:*expr.Expr_IdentExpr#`,
  },

  // ── Member access ──────────────────────────────────────────────────────────
  {
    input: "a.b",
    P: "a^#1:*expr.Expr_IdentExpr#.b^#2:*expr.Expr_SelectExpr#",
  },
  {
    input: "a.b.c",
    P: "a^#1:*expr.Expr_IdentExpr#.b^#2:*expr.Expr_SelectExpr#.c^#3:*expr.Expr_SelectExpr#",
  },
  {
    input: "expr.type_map.1.type",
    P: "expr^#1:*expr.Expr_IdentExpr#.type_map^#2:*expr.Expr_SelectExpr#.1^#3:*expr.Expr_SelectExpr#.type^#4:*expr.Expr_SelectExpr#",
  },
  {
    description: "keywords are valid field names in dot-chains (EBNF: field = value | keyword)",
    input: "a.AND",
    P: "a^#1:*expr.Expr_IdentExpr#.AND^#2:*expr.Expr_SelectExpr#",
  },
  {
    description: "OR as field name in dot-chain",
    input: "a.OR",
    P: "a^#1:*expr.Expr_IdentExpr#.OR^#2:*expr.Expr_SelectExpr#",
  },
  {
    description: "NOT as field name in dot-chain",
    input: "a.NOT",
    P: "a^#1:*expr.Expr_IdentExpr#.NOT^#2:*expr.Expr_SelectExpr#",
  },

  // ── Comparisons ────────────────────────────────────────────────────────────
  {
    input: "a = b",
    P: `_==_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    input: "a != b",
    P: `_!=_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    input: "a > b",
    P: `_>_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    input: "a >= b",
    P: `_>=_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    input: "a < b",
    P: `_<_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    input: "a <= b",
    P: `_<=_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    input: "map:key",
    P: `@in(
map^#1:*expr.Expr_IdentExpr#,
key^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    description: "has with member on left-hand side",
    input: "a.b:c",
    P: `@in(
a^#1:*expr.Expr_IdentExpr#.b^#2:*expr.Expr_SelectExpr#,
c^#3:*expr.Expr_IdentExpr#
)^#4:*expr.Expr_CallExpr#`,
  },
  {
    input: "package=com.google",
    P: `_==_(
package^#1:*expr.Expr_IdentExpr#,
com^#2:*expr.Expr_IdentExpr#.google^#3:*expr.Expr_SelectExpr#
)^#4:*expr.Expr_CallExpr#`,
  },
  {
    input: "yesterday < request.time",
    P: `_<_(
yesterday^#1:*expr.Expr_IdentExpr#,
request^#2:*expr.Expr_IdentExpr#.time^#3:*expr.Expr_SelectExpr#
)^#4:*expr.Expr_CallExpr#`,
  },
  {
    description: "string as comparator arg",
    input: `status = "ACTIVE"`,
    P: `_==_(
status^#1:*expr.Expr_IdentExpr#,
"ACTIVE"^#2:*expr.Constant_StringValue#
)^#3:*expr.Expr_CallExpr#`,
  },

  // ── Duration/timestamp in comparisons ────────────────────────────────
  {
    description: "duration as comparison arg",
    input: "ttl = 20s",
    P: `_==_(
ttl^#1:*expr.Expr_IdentExpr#,
20s^#2:*expr.Constant_DurationValue#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    description: "timestamp as comparison arg",
    input: "create_time > 2021-01-01T00:00:00Z",
    P: `_>_(
create_time^#1:*expr.Expr_IdentExpr#,
2021-01-01T00:00:00Z^#2:*expr.Constant_TimestampValue#
)^#3:*expr.Expr_CallExpr#`,
  },

  // ── NOT / negation ─────────────────────────────────────────────────────────
  {
    input: "NOT a",
    P: `@not(
a^#1:*expr.Expr_IdentExpr#
)^#2:*expr.Expr_CallExpr#`,
  },
  {
    description: "NOT over a comparison",
    input: "NOT a > 3",
    P: `@not(
_>_(
a^#1:*expr.Expr_IdentExpr#,
3^#2:*expr.Constant_Int64Value#
)^#3:*expr.Expr_CallExpr#
)^#4:*expr.Expr_CallExpr#`,
  },
  {
    input: "NOT (a OR b)",
    P: `@not(
_||_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#
)^#4:*expr.Expr_CallExpr#`,
  },
  {
    input: `-file:".java"`,
    P: `@not(
@in(
file^#1:*expr.Expr_IdentExpr#,
".java"^#2:*expr.Constant_StringValue#
)^#3:*expr.Expr_CallExpr#
)^#4:*expr.Expr_CallExpr#`,
  },
  {
    description: "-30 produces a negative constant, not @not",
    input: "-30",
    P: "-30^#1:*expr.Constant_Int64Value#",
  },

  // ── AND ────────────────────────────────────────────────────────────────────
  {
    input: "a AND b",
    P: `_&&_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    description: "AND is left-associative",
    input: "a AND b AND c",
    P: `_&&_(
_&&_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#,
c^#4:*expr.Expr_IdentExpr#
)^#5:*expr.Expr_CallExpr#`,
  },
  {
    description: "implicit AND (sequence) with bare idents",
    input: "New York Giants",
    P: `_&&_(
_&&_(
New^#1:*expr.Expr_IdentExpr#,
York^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#,
Giants^#4:*expr.Expr_IdentExpr#
)^#5:*expr.Expr_CallExpr#`,
  },
  {
    description: "implicit AND with comparisons",
    input: "a = 1 b = 2",
    P: `_&&_(
_==_(
a^#1:*expr.Expr_IdentExpr#,
1^#2:*expr.Constant_Int64Value#
)^#3:*expr.Expr_CallExpr#,
_==_(
b^#4:*expr.Expr_IdentExpr#,
2^#5:*expr.Constant_Int64Value#
)^#6:*expr.Expr_CallExpr#
)^#7:*expr.Expr_CallExpr#`,
  },

  // ── OR ─────────────────────────────────────────────────────────────────────
  {
    input: "a OR b",
    P: `_||_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    description: "OR is left-associative",
    input: "a OR b OR c",
    P: `_||_(
_||_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#,
c^#4:*expr.Expr_IdentExpr#
)^#5:*expr.Expr_CallExpr#`,
  },

  // ── AND / OR precedence ────────────────────────────────────────────────────
  // In the AIP EBNF, OR (factor) binds TIGHTER than AND (expression/sequence).
  {
    description: "OR binds tighter: a AND b OR c → a AND (b OR c)",
    input: "a AND b OR c",
    P: `_&&_(
a^#1:*expr.Expr_IdentExpr#,
_||_(
b^#2:*expr.Expr_IdentExpr#,
c^#3:*expr.Expr_IdentExpr#
)^#4:*expr.Expr_CallExpr#
)^#5:*expr.Expr_CallExpr#`,
  },
  {
    description: "a AND b OR c AND d → a AND (b OR c) AND d",
    input: "a AND b OR c AND d",
    P: `_&&_(
_&&_(
a^#1:*expr.Expr_IdentExpr#,
_||_(
b^#2:*expr.Expr_IdentExpr#,
c^#3:*expr.Expr_IdentExpr#
)^#4:*expr.Expr_CallExpr#
)^#5:*expr.Expr_CallExpr#,
d^#6:*expr.Expr_IdentExpr#
)^#7:*expr.Expr_CallExpr#`,
  },
  {
    description: "a OR b AND c → (a OR b) AND c",
    input: "a OR b AND c",
    P: `_&&_(
_||_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#,
c^#4:*expr.Expr_IdentExpr#
)^#5:*expr.Expr_CallExpr#`,
  },
  {
    description: "explicit parens force AND inside OR",
    input: "(a AND b) OR c",
    P: `_||_(
_&&_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#,
c^#4:*expr.Expr_IdentExpr#
)^#5:*expr.Expr_CallExpr#`,
  },
  {
    description: "implicit AND sequence containing an OR factor: a b OR c → a AND (b OR c)",
    input: "a b OR c",
    P: `_&&_(
a^#1:*expr.Expr_IdentExpr#,
_||_(
b^#2:*expr.Expr_IdentExpr#,
c^#3:*expr.Expr_IdentExpr#
)^#4:*expr.Expr_CallExpr#
)^#5:*expr.Expr_CallExpr#`,
  },
  {
    description: "doubly nested parens are transparent",
    input: "((a AND b))",
    P: `_&&_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#`,
  },

  // ── Problematic round-trip cases ───────────────────────────────────────────
  {
    description: "round-trip: AND child nested inside OR child of AND",
    input: "(region = US OR (region = EU AND status = ACTIVE)) AND priority > 3",
    P: `_&&_(
_||_(
_==_(
region^#1:*expr.Expr_IdentExpr#,
US^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#,
_&&_(
_==_(
region^#4:*expr.Expr_IdentExpr#,
EU^#5:*expr.Expr_IdentExpr#
)^#6:*expr.Expr_CallExpr#,
_==_(
status^#7:*expr.Expr_IdentExpr#,
ACTIVE^#8:*expr.Expr_IdentExpr#
)^#9:*expr.Expr_CallExpr#
)^#10:*expr.Expr_CallExpr#
)^#11:*expr.Expr_CallExpr#,
_>_(
priority^#12:*expr.Expr_IdentExpr#,
3^#13:*expr.Constant_Int64Value#
)^#14:*expr.Expr_CallExpr#
)^#15:*expr.Expr_CallExpr#`,
  },
  {
    description: "round-trip: OR child of AND",
    input: "(region = US OR region = EU) AND status = ACTIVE",
    P: `_&&_(
_||_(
_==_(
region^#1:*expr.Expr_IdentExpr#,
US^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#,
_==_(
region^#4:*expr.Expr_IdentExpr#,
EU^#5:*expr.Expr_IdentExpr#
)^#6:*expr.Expr_CallExpr#
)^#7:*expr.Expr_CallExpr#,
_==_(
status^#8:*expr.Expr_IdentExpr#,
ACTIVE^#9:*expr.Expr_IdentExpr#
)^#10:*expr.Expr_CallExpr#
)^#11:*expr.Expr_CallExpr#`,
  },
  {
    description: "round-trip: NOT after AND regression",
    input:
      '(status = "ACTIVIA" OR status = "PENDING") AND metadata.region = "us-central1" AND NOT labels:deprecated',
    P: `_&&_(
_&&_(
_||_(
_==_(
status^#1:*expr.Expr_IdentExpr#,
"ACTIVIA"^#2:*expr.Constant_StringValue#
)^#3:*expr.Expr_CallExpr#,
_==_(
status^#4:*expr.Expr_IdentExpr#,
"PENDING"^#5:*expr.Constant_StringValue#
)^#6:*expr.Expr_CallExpr#
)^#7:*expr.Expr_CallExpr#,
_==_(
metadata^#8:*expr.Expr_IdentExpr#.region^#9:*expr.Expr_SelectExpr#,
"us-central1"^#10:*expr.Constant_StringValue#
)^#11:*expr.Expr_CallExpr#
)^#12:*expr.Expr_CallExpr#,
@not(
@in(
labels^#13:*expr.Expr_IdentExpr#,
deprecated^#14:*expr.Expr_IdentExpr#
)^#15:*expr.Expr_CallExpr#
)^#16:*expr.Expr_CallExpr#
)^#17:*expr.Expr_CallExpr#`,
  },

  // ── Functions ──────────────────────────────────────────────────────────────
  {
    description: "function with no args",
    input: "foo()",
    P: `foo()^#1:*expr.Expr_CallExpr#`,
  },
  {
    input: "regex(m.key, '^.*prod.*$')",
    P: `regex(
m^#1:*expr.Expr_IdentExpr#.key^#2:*expr.Expr_SelectExpr#,
"^.*prod.*$"^#3:*expr.Constant_StringValue#
)^#4:*expr.Expr_CallExpr#`,
  },
  {
    description: "function with three args",
    input: "foo(a, b, c)",
    P: `foo(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#,
c^#3:*expr.Expr_IdentExpr#
)^#4:*expr.Expr_CallExpr#`,
  },
  {
    input: "math.mem('30mb')",
    P: `math^#1:*expr.Expr_IdentExpr#.mem(
"30mb"^#2:*expr.Constant_StringValue#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    input: "str.startsWith('hello')",
    P: `str^#1:*expr.Expr_IdentExpr#.startsWith(
"hello"^#2:*expr.Constant_StringValue#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    input: "experiment.rollout <= cohort(request.user)",
    P: `_<=_(
experiment^#1:*expr.Expr_IdentExpr#.rollout^#2:*expr.Expr_SelectExpr#,
cohort(
request^#3:*expr.Expr_IdentExpr#.user^#4:*expr.Expr_SelectExpr#
)^#5:*expr.Expr_CallExpr#
)^#6:*expr.Expr_CallExpr#`,
  },

  // ── Wildcard strings ───────────────────────────────────────────────────────
  // The EBNF notes that STRING may contain a leading/trailing '*' for
  // prefix/suffix matching. The parser treats it as a plain string constant;
  // interpretation is left to the consumer (DB translator / frontend).
  {
    description: "prefix wildcard — trailing * inside a string literal",
    input: `name = "hello*"`,
    P: `_==_(
name^#1:*expr.Expr_IdentExpr#,
"hello*"^#2:*expr.Constant_StringValue#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    description: "suffix wildcard — leading * inside a string literal",
    input: `name = "*world"`,
    P: `_==_(
name^#1:*expr.Expr_IdentExpr#,
"*world"^#2:*expr.Constant_StringValue#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    description: "wildcard string as has-operator arg",
    input: `description:"important*"`,
    P: `@in(
description^#1:*expr.Expr_IdentExpr#,
"important*"^#2:*expr.Constant_StringValue#
)^#3:*expr.Expr_CallExpr#`,
  },

  // ── Minus-negation of a bare ident (not a number) ──────────────────────────
  // EBNF: term = [(NOT WS | MINUS)] simple
  // When MINUS precedes a non-numeric token, the parser produces @not, not a
  // negative constant.
  {
    description: "-a produces @not(a), not a negative constant",
    input: "-a",
    P: `@not(
a^#1:*expr.Expr_IdentExpr#
)^#2:*expr.Expr_CallExpr#`,
  },
  {
    description: "-a.b.c negates a member chain",
    input: "-a.b.c",
    P: `@not(
a^#1:*expr.Expr_IdentExpr#.b^#2:*expr.Expr_SelectExpr#.c^#3:*expr.Expr_SelectExpr#
)^#4:*expr.Expr_CallExpr#`,
  },

  // ── Composite as comparator argument ──────────────────────────────────────
  // EBNF: arg = comparable | composite
  // A parenthesised expression is a valid right-hand side for a comparator.
  {
    description: "composite (parenthesised OR) as comparator arg",
    input: "a = (b OR c)",
    P: `_==_(
a^#1:*expr.Expr_IdentExpr#,
_||_(
b^#2:*expr.Expr_IdentExpr#,
c^#3:*expr.Expr_IdentExpr#
)^#4:*expr.Expr_CallExpr#
)^#5:*expr.Expr_CallExpr#`,
  },

  // ── Function as LHS of a comparator ───────────────────────────────────────
  // EBNF: comparable = member | function, so a function call can be compared.
  {
    description: "function call as left-hand side of a comparison",
    input: "foo() = bar",
    P: `_==_(
foo()^#1:*expr.Expr_CallExpr#,
bar^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#`,
  },
  {
    description: "method call as left-hand side of a comparison",
    input: `s.startsWith("hello") = true`,
    P: `_==_(
s^#1:*expr.Expr_IdentExpr#.startsWith(
"hello"^#2:*expr.Constant_StringValue#
)^#3:*expr.Expr_CallExpr#,
true^#4:*expr.Constant_BoolValue#
)^#5:*expr.Expr_CallExpr#`,
  },

  // ── Mixed implicit and explicit AND ───────────────────────────────────────
  // sequence is implicit AND; expression is explicit AND. They can be combined.
  {
    description: "implicit AND (sequence) followed by explicit AND",
    input: "a b AND c",
    P: `_&&_(
_&&_(
a^#1:*expr.Expr_IdentExpr#,
b^#2:*expr.Expr_IdentExpr#
)^#3:*expr.Expr_CallExpr#,
c^#4:*expr.Expr_IdentExpr#
)^#5:*expr.Expr_CallExpr#`,
  },
  {
    description: "explicit AND followed by implicit AND (sequence)",
    input: "a AND b c",
    P: `_&&_(
a^#1:*expr.Expr_IdentExpr#,
_&&_(
b^#2:*expr.Expr_IdentExpr#,
c^#3:*expr.Expr_IdentExpr#
)^#4:*expr.Expr_CallExpr#
)^#5:*expr.Expr_CallExpr#`,
  },

  // ── Struct literals ──────────────────────────────────────────────────────
  {
    description: "struct literal: Foo{a: 1}",
    input: `Foo{a: 1}`,
    P: `Foo{
a:1^#2:*expr.Constant_Int64Value#^#3:*expr.Expr_CreateStruct_Entry#
}^#4:*expr.Expr_StructExpr#`,
  },
  {
    description: "struct literal: empty",
    input: `Foo{}`,
    P: `Foo{}^#2:*expr.Expr_StructExpr#`,
  },
  {
    description: "struct literal: qualified name",
    input: `google.rpc.Status{code: 1, message: "hello"}`,
    P: `google.rpc.Status{
code:1^#4:*expr.Constant_Int64Value#^#5:*expr.Expr_CreateStruct_Entry#,
message:"hello"^#6:*expr.Constant_StringValue#^#7:*expr.Expr_CreateStruct_Entry#
}^#8:*expr.Expr_StructExpr#`,
  },
  {
    description: "struct literal in comparison",
    input: `x = Foo{a: 1}`,
    P: `_==_(
x^#1:*expr.Expr_IdentExpr#,
Foo{
a:1^#3:*expr.Constant_Int64Value#^#4:*expr.Expr_CreateStruct_Entry#
}^#5:*expr.Expr_StructExpr#
)^#6:*expr.Expr_CallExpr#`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Error cases
// ─────────────────────────────────────────────────────────────────────────────

const errorCases: Array<{ description: string; input: string }> = [
  // ── Unterminated strings ───────────────────────────────────────────────────
  { description: "unterminated double-quoted string", input: `"abc` },
  { description: "unterminated single-quoted string", input: `'abc` },
  { description: "unterminated string mid-expression", input: `theme = "ab` },
  { description: "unterminated string after operator", input: `a = 'hello` },

  // ── Missing operands around AND / OR ──────────────────────────────────────
  { description: "AND with no left operand", input: "AND b" },
  { description: "OR with no left operand", input: "OR b" },
  { description: "AND with no right operand", input: "a AND" },
  { description: "OR with no right operand", input: "a OR" },
  { description: "consecutive AND", input: "a AND AND b" },
  { description: "consecutive OR", input: "a OR OR b" },
  { description: "OR immediately followed by AND", input: "a OR AND b" },

  // ── Missing operands around comparators ───────────────────────────────────
  { description: "comparator with no right arg", input: "a =" },
  { description: "comparator with no left operand", input: "= b" },
  { description: "chained comparators", input: "a = b = c" },
  { description: "double comparator", input: "a = = b" },

  // ── Paren errors ───────────────────────────────────────────────────────────
  { description: "unmatched open paren", input: "(a AND b" },
  { description: "unmatched close paren", input: "a AND b)" },
  { description: "empty parens — composite requires an expression inside", input: "()" },
  { description: "nested unmatched parens", input: "((a AND b)" },
  { description: "composite missing expression: AND inside empty parens", input: "(AND)" },

  // ── NOT errors ─────────────────────────────────────────────────────────────
  { description: "NOT with no operand", input: "NOT" },
  { description: "NOT NOT with no final operand", input: "NOT NOT" },

  // ── has errors ─────────────────────────────────────────────────────────────
  { description: "has with no right arg", input: "a:" },
  { description: "has with no left operand", input: ":b" },

  // ── Function call errors ───────────────────────────────────────────────────
  { description: "function call missing closing paren", input: "foo(a, b" },
  { description: "function call missing opening paren", input: "foo a, b)" },
  { description: "argList trailing comma", input: "foo(a,)" },
  { description: "function two args missing comma", input: "foo(a b)" },

  // ── Member / dot-chain errors ──────────────────────────────────────────────
  { description: "trailing dot with no field", input: "a." },
  { description: "double dot", input: "a..b" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

describe("parser", () => {
  describe("valid expressions", () => {
    for (const tc of cases) {
      const label = tc.description ?? `parse(${JSON.stringify(tc.input)})`;
      it(label, () => {
        expect(P(tc.input)).toBe(normalise(tc.P));
      });
    }
  });

  describe("invalid expressions", () => {
    for (const tc of errorCases) {
      it(tc.description, () => {
        expect(() => parse(tc.input)).toThrow(ParseError);
      });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Depth limiting
// ─────────────────────────────────────────────────────────────────────────────
//
// Depth is measured as nesting levels of parenthesised sub-expressions.
// A flat expression like `a AND b` has depth 0. Each layer of parens adds 1.
// The depth counter increments in parseComposite() before recursing back into
// parseExpression(), so the limit is enforced before the work happens.

describe("parse — depth limiting", () => {
  // Build a string of n nested paren pairs wrapping a single ident.
  // depth=1 → "(a)", depth=2 → "((a))", etc.
  function nested(depth: number): string {
    return `${"(".repeat(depth)}a${")".repeat(depth)}`;
  }

  it("depth 0 — flat expression parses regardless of maxDepth", () => {
    expect(() => parse("a AND b", 0)).not.toThrow();
  });

  it("depth 1 — exactly at limit passes", () => {
    expect(() => parse(nested(1), 1)).not.toThrow();
  });

  it("depth 1 — one over limit throws ParseError", () => {
    expect(() => parse(nested(2), 1)).toThrow(ParseError);
  });

  it("depth 5 — exactly at limit passes", () => {
    expect(() => parse(nested(5), 5)).not.toThrow();
  });

  it("depth 5 — one over limit throws ParseError", () => {
    expect(() => parse(nested(6), 5)).toThrow(ParseError);
  });

  it("throws ParseError (not a generic Error subclass) on depth violation", () => {
    expect(() => parse(nested(2), 1)).toThrow(ParseError);
  });

  it("error message includes the configured max depth", () => {
    expect(() => parse(nested(2), 1)).toThrowError("1");
  });

  it("default limit accepts a normally nested expression", () => {
    // A realistic deeply nested filter — well within MAX_EXPR_DEPTH
    const input = "((a AND b) OR (c AND d)) AND NOT (e OR f)";
    expect(() => parse(input)).not.toThrow();
  });

  it("default limit rejects pathologically deep nesting", () => {
    // MAX_EXPR_DEPTH + 1 levels of nesting should be rejected by default
    expect(() => parse(nested(33))).toThrow(ParseError);
  });

  it("depth limit applies inside function argument lists", () => {
    // Parens inside an arglist re-enter parseComposite the same way
    expect(() => parse("foo((a))", 1)).not.toThrow();
    expect(() => parse("foo(((a)))", 1)).toThrow(ParseError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ParseError plumbing
// ─────────────────────────────────────────────────────────────────────────────

describe("ParseError plumbing", () => {
  it("is an instance of Error, AipFilterError, and ParseError", () => {
    try {
      parse("a AND");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(AipFilterError);
      expect(e).toBeInstanceOf(ParseError);
    }
  });

  it("has PARSE_UNEXPECTED_TOKEN code for generic parse errors", () => {
    try {
      parse("a AND");
    } catch (e) {
      expect((e as ParseError).code).toBe(ErrorCode.PARSE_UNEXPECTED_TOKEN);
    }
  });

  it("has PARSE_UNTERMINATED_STRING code for unterminated strings", () => {
    try {
      parse('"abc');
    } catch (e) {
      expect((e as ParseError).code).toBe(ErrorCode.PARSE_UNTERMINATED_STRING);
    }
  });

  it("has PARSE_DEPTH_EXCEEDED code for depth violations", () => {
    try {
      parse("((a))", 1);
    } catch (e) {
      expect((e as ParseError).code).toBe(ErrorCode.PARSE_DEPTH_EXCEEDED);
    }
  });

  it("embeds the source string", () => {
    try {
      parse("a AND");
    } catch (e) {
      expect((e as ParseError).source).toBe("a AND");
    }
  });

  it("position.line is 1 for a single-line input", () => {
    try {
      parse("a AND");
    } catch (e) {
      expect((e as ParseError).position?.line).toBe(1);
    }
  });

  it("position.offset is a non-negative number", () => {
    try {
      parse("a AND");
    } catch (e) {
      expect((e as ParseError).position?.offset).toBeGreaterThanOrEqual(0);
    }
  });

  it("toString() produces the CEL error block format", () => {
    try {
      parse('env = "abc');
    } catch (e) {
      const s = String(e);
      expect(s).toMatch(/^ERROR: <input>:\d+:\d+:/);
      expect(s).toContain("| ");
      expect(s).toContain("^");
    }
  });

  it("toString() source line contains the original input", () => {
    const input = 'name = "hello';
    try {
      parse(input);
    } catch (e) {
      expect(String(e)).toContain(input);
    }
  });

  it("name is ParseError", () => {
    try {
      parse("a AND");
    } catch (e) {
      expect((e as ParseError).name).toBe("ParseError");
    }
  });
});
