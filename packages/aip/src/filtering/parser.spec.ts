/** biome-ignore-all lint/suspicious/noExplicitAny: TODO */
/** biome-ignore-all lint/style/noNonNullAssertion: TODO */

import { create } from "@bufbuild/protobuf";
import { assert, describe, expect, it } from "vitest";
import { ConstantSchema, type Expr } from "../gen/google/api/expr/v1alpha1/syntax_pb";
import { prettyExpr } from "./debug";
import { type ExprInit, offsetToLineCol, ParseError, parse } from "./parser";

// ── Test helpers ──────────────────────────────────────────────────────────────

function exprCase(expr: Expr | undefined): string {
  return expr?.exprKind.case as string;
}

function callFn(expr: Expr | undefined): string {
  switch (expr?.exprKind.case) {
    case "callExpr":
      return expr.exprKind.value.function;
    default:
      assert.fail(`Expected callExpr, got ${expr?.exprKind.case}`);
  }
}

function callArgs(expr: Expr | undefined): Expr[] {
  switch (expr?.exprKind.case) {
    case "callExpr":
      return expr.exprKind.value.args;
    default:
      assert.fail(`Expected callExpr, got ${expr?.exprKind.case}`);
  }
}

function callTarget(expr: Expr | undefined): Expr | undefined {
  switch (expr?.exprKind.case) {
    case "callExpr":
      return expr.exprKind.value.target;
    default:
      assert.fail(`Expected callExpr, got ${expr?.exprKind.case}`);
  }
}

function identName(expr: Expr | undefined): string {
  switch (expr?.exprKind.case) {
    case "identExpr":
      return expr.exprKind.value.name;
    default:
      assert.fail(`Expected identExpr, got ${expr?.exprKind.case}`);
  }
}

function constValue(expr: Expr | undefined): any {
  switch (expr?.exprKind.case) {
    case "constExpr":
      return expr.exprKind.value;
    default:
      assert.fail(`Expected constExpr, got ${expr?.exprKind.case}`);
  }
}

function selectField(expr: Expr | undefined): string {
  switch (expr?.exprKind.case) {
    case "selectExpr":
      return expr.exprKind.value.field;
    default:
      assert.fail(`Expected selectExpr, got ${expr?.exprKind.case}`);
  }
}

function selectOperand(expr: Expr | undefined): Expr {
  switch (expr?.exprKind.case) {
    case "selectExpr":
      return expr.exprKind.value.operand as Expr;
    default:
      assert.fail(`Expected selectExpr, got ${expr?.exprKind.case}`);
  }
}

describe("Lexer / tokenization basics", () => {
  it("parses empty filter", () => {
    const { expr } = parse("");
    assert.equal(exprCase(expr), "identExpr");
    assert.equal(identName(expr), "");
  });

  it("parses whitespace-only filter as empty", () => {
    const { expr } = parse("   ");
    assert.equal(exprCase(expr), "identExpr");
  });

  it("fails with invalid filters", () => {
    assert.throws(() => parse(`"abc" = '`));
    assert.throws(() => parse("'abc"));
    assert.throws(() => parse(`theme = "ab`));
    assert.throws(() => parse(`"bc = " = "`));
  });
});

describe("EBNF grammar examples", () => {
  it("global: `prod`", () => {
    const { expr } = parse("prod");
    assert.equal(exprCase(expr), "identExpr");
    assert.equal(identName(expr), "prod");
  });

  it("equality: `package=com.google`", () => {
    const { expr } = parse("package=com.google");
    assert.equal(callFn(expr), "_==_");
    const args = callArgs(expr);
    assert.equal(identName(args[0]), "package");
    assert.equal(exprCase(args[1]), "selectExpr");
    assert.equal(selectField(args[1]), "google");
    assert.equal(identName(selectOperand(args[1])), "com");
  });

  it("inequality: `msg != 'hello'`", () => {
    const { expr } = parse("msg != 'hello'");
    assert.equal(callFn(expr), "_!=_");
    assert.equal(identName(callArgs(expr)[0]), "msg");
    assert.deepEqual(
      constValue(callArgs(expr)[1]),
      create(ConstantSchema, {
        constantKind: { case: "stringValue", value: "hello" },
      }),
    );
  });

  it("greater than: `1 > 0`", () => {
    const { expr } = parse("1 > 0");
    assert.equal(callFn(expr), "_>_");
    assert.deepEqual(
      constValue(callArgs(expr)[0]),
      create(ConstantSchema, {
        constantKind: { case: "int64Value", value: 1n },
      }),
    );
    assert.deepEqual(
      constValue(callArgs(expr)[1]),
      create(ConstantSchema, {
        constantKind: { case: "int64Value", value: 0n },
      }),
    );
  });

  it("greater or equal: `2.5 >= 2.4`", () => {
    const { expr } = parse("2.5 >= 2.4");
    assert.equal(callFn(expr), "_>=_");
    assert.deepEqual(
      constValue(callArgs(expr)[0]),
      create(ConstantSchema, {
        constantKind: { case: "doubleValue", value: 2.5 },
      }),
    );
    assert.deepEqual(
      constValue(callArgs(expr)[1]),
      create(ConstantSchema, {
        constantKind: { case: "doubleValue", value: 2.4 },
      }),
    );
  });

  it("less than: `yesterday < request.time`", () => {
    const { expr } = parse("yesterday < request.time");
    assert.equal(callFn(expr), "_<_");
    assert.equal(identName(callArgs(expr)[0]), "yesterday");
    assert.equal(selectField(callArgs(expr)[1]), "time");
    assert.equal(identName(selectOperand(callArgs(expr)[1])), "request");
  });

  it("less or equal: `experiment.rollout <= cohort(request.user)`", () => {
    const { expr } = parse("experiment.rollout <= cohort(request.user)");
    assert.equal(callFn(expr), "_<=_");
    assert.equal(exprCase(callArgs(expr)[0]), "selectExpr");
    assert.equal(callFn(callArgs(expr)[1]), "cohort");
  });

  it("has: `map:key`", () => {
    const { expr } = parse("map:key");
    assert.equal(callFn(expr), "@in");
    assert.equal(identName(callArgs(expr)[0]), "map");
    assert.equal(identName(callArgs(expr)[1]), "key");
  });

  it("logical not: `NOT (a OR b)`", () => {
    const { expr } = parse("NOT (a OR b)");
    assert.equal(callFn(expr), "@not");
    assert.equal(callFn(callArgs(expr)[0]), "_||_");
  });

  it('alternative not: `-file:".java"`', () => {
    const { expr } = parse('-file:".java"');
    assert.equal(callFn(expr), "@not");
    assert.equal(callFn(callArgs(expr)[0]), "@in");
  });

  it("negation: `-30`", () => {
    const { expr } = parse("-30");
    assert.deepEqual(
      constValue(expr),
      create(ConstantSchema, {
        constantKind: { case: "int64Value", value: -30n },
      }),
    );
  });

  it("function: `regex(m.key, '^.*prod.*$')`", () => {
    const { expr } = parse("regex(m.key, '^.*prod.*$')");
    assert.equal(callFn(expr), "regex");
    assert.equal(exprCase(callArgs(expr)[0]), "selectExpr");
    assert.deepEqual(
      constValue(callArgs(expr)[1]),
      create(ConstantSchema, {
        constantKind: { case: "stringValue", value: "^.*prod.*$" },
      }),
    );
  });

  it("qualified function (CEL receiver-call): `math.mem('30mb')`", () => {
    const { expr } = parse("math.mem('30mb')");
    assert.equal(callFn(expr), "mem");
    assert.equal(identName(callTarget(expr)!), "math");
    assert.deepEqual(
      constValue(callArgs(expr)[0]),
      create(ConstantSchema, {
        constantKind: { case: "stringValue", value: "30mb" },
      }),
    );
  });

  it("composite: `(msg.endsWith('world') AND retries < 10)`", () => {
    const { expr } = parse("(msg.endsWith('world') AND retries < 10)");
    assert.equal(callFn(expr), "_&&_");
    assert.equal(callFn(callArgs(expr)[0]), "endsWith");
    assert.notEqual(callTarget(callArgs(expr)[0]), undefined);
    assert.equal(callFn(callArgs(expr)[1]), "_<_");
  });

  it("sequence (implicit AND): `New York Giants`", () => {
    const { expr } = parse("New York Giants");
    assert.equal(callFn(expr), "_&&_");
  });

  it("expression with explicit AND: `a b AND c AND d`", () => {
    const { expr } = parse("a b AND c AND d");
    assert.equal(callFn(expr), "_&&_");
  });

  it("factor with OR: `a < 10 OR a >= 100`", () => {
    const { expr } = parse("a < 10 OR a >= 100");
    assert.equal(callFn(expr), "_||_");
    assert.equal(callFn(callArgs(expr)[0]), "_<_");
    assert.equal(callFn(callArgs(expr)[1]), "_>=_");
  });

  it("member traversal: `expr.type_map.1.type`", () => {
    const { expr } = parse("expr.type_map.1.type");
    assert.equal(exprCase(expr), "selectExpr");
    assert.equal(selectField(expr), "type");
  });

  it('string equality: `package = "com.google"`', () => {
    const { expr } = parse('package = "com.google"');
    assert.equal(callFn(expr), "_==_");
    assert.deepEqual(
      constValue(callArgs(expr)[1]),
      create(ConstantSchema, {
        constantKind: { case: "stringValue", value: "com.google" },
      }),
    );
  });
});

describe("v1alpha1 field names and structure", () => {
  it("literal node uses constExpr (not literalExpr)", () => {
    const { expr } = parse("42");
    assert.equal(expr?.exprKind.case, "constExpr");
  });

  it("struct uses messageName (not type)", () => {
    const structExpr: ExprInit = {
      id: 1n,
      exprKind: {
        case: "structExpr",
        value: { messageName: "my.Type", entries: [] },
      },
    };
    assert.equal((structExpr.exprKind as any).value.messageName, "my.Type");
  });

  it("createList has optionalIndices", () => {
    const listExpr: ExprInit = {
      id: 1n,
      exprKind: {
        case: "listExpr",
        value: { elements: [], optionalIndices: [] },
      },
    };
    assert.deepEqual((listExpr.exprKind as any).value.optionalIndices, []);
  });

  it("comprehension has iterVar2", () => {
    const { expr: boolExpr } = parse("true");
    const comp: ExprInit = {
      id: 1n,
      exprKind: {
        case: "comprehensionExpr",
        value: {
          iterVar: "x",
          iterVar2: "i",
          iterRange: boolExpr,
          accuVar: "acc",
          accuInit: boolExpr,
          loopCondition: boolExpr,
          loopStep: boolExpr,
          result: boolExpr,
        },
      },
    };
    assert.equal((comp.exprKind as any).value.iterVar2, "i");
  });

  it("ParsedExpr has no syntaxVersion field (moved to SourceInfo)", () => {
    const parsed = parse("a = 1");
    assert.ok(!("syntaxVersion" in parsed), "ParsedExpr should not have syntaxVersion");
    assert.equal(parsed.sourceInfo?.syntaxVersion, "cel1");
  });
});

// ── Method calls ──────────────────────────────────────────────────────────────

describe("Method call support", () => {
  it('"hello world".contains("hello")', () => {
    const { expr } = parse('"hello world".contains("hello")');
    assert.equal(callFn(expr), "contains");
    assert.deepEqual(
      constValue(callTarget(expr)!),
      create(ConstantSchema, {
        constantKind: { case: "stringValue", value: "hello world" },
      }),
    );
    assert.deepEqual(
      constValue(callArgs(expr)[0]),
      create(ConstantSchema, {
        constantKind: { case: "stringValue", value: "hello" },
      }),
    );
  });

  it("str.startsWith('hello')", () => {
    const { expr } = parse("str.startsWith('hello')");
    assert.equal(callFn(expr), "startsWith");
    assert.equal(identName(callTarget(expr)!), "str");
  });

  it("request.auth.startsWith('Bearer ')", () => {
    const { expr } = parse("request.auth.startsWith('Bearer ')");
    assert.equal(callFn(expr), "startsWith");
    const target = callTarget(expr)!;
    assert.equal(exprCase(target), "selectExpr");
    assert.equal(selectField(target), "auth");
    assert.equal(identName(selectOperand(target)), "request");
  });
});

// ── Literals ──────────────────────────────────────────────────────────────────

describe("Literals (Constant in v1alpha1)", () => {
  it("true → constExpr boolValue", () => {
    const { expr } = parse("true");
    assert.deepEqual(
      constValue(expr),
      create(ConstantSchema, {
        constantKind: { case: "boolValue", value: true },
      }),
    );
  });
  it("null → constExpr nullValue", () => {
    const { expr } = parse("null");
    assert.deepEqual(
      constValue(expr),
      create(ConstantSchema, { constantKind: { case: "nullValue", value: 0 } }),
    );
  });
  it("42 → int64Value", () => {
    const { expr } = parse("42");
    assert.deepEqual(
      constValue(expr),
      create(ConstantSchema, {
        constantKind: { case: "int64Value", value: 42n },
      }),
    );
  });
  it("-42 → negative int", () => {
    const { expr } = parse("-42");
    assert.deepEqual(
      constValue(expr),
      create(ConstantSchema, {
        constantKind: { case: "int64Value", value: -42n },
      }),
    );
  });
  it("3.14 → doubleValue", () => {
    const { expr } = parse("3.14");
    assert.deepEqual(
      constValue(expr),
      create(ConstantSchema, {
        constantKind: { case: "doubleValue", value: 3.14 },
      }),
    );
  });
  it("-3.14 → negative double", () => {
    const { expr } = parse("-3.14");
    assert.deepEqual(
      constValue(expr),
      create(ConstantSchema, {
        constantKind: { case: "doubleValue", value: -3.14 },
      }),
    );
  });
  it("2.997e9 → double with exponent", () => {
    const { expr } = parse("2.997e9");
    assert.deepEqual(
      constValue(expr),
      create(ConstantSchema, {
        constantKind: { case: "doubleValue", value: 2.997e9 },
      }),
    );
  });
  it("1u → uint64Value", () => {
    const { expr } = parse("1u");
    assert.deepEqual(
      constValue(expr),
      create(ConstantSchema, {
        constantKind: { case: "uint64Value", value: 1n },
      }),
    );
  });
  it("double-quoted string", () => {
    const { expr } = parse('"hello"');
    assert.deepEqual(
      constValue(expr),
      create(ConstantSchema, {
        constantKind: { case: "stringValue", value: "hello" },
      }),
    );
  });
  it("escape sequences", () => {
    const { expr } = parse('"hello\\nworld"');
    assert.deepEqual(
      constValue(expr),
      create(ConstantSchema, {
        constantKind: { case: "stringValue", value: "hello\nworld" },
      }),
    );
  });
});

// ── SourceInfo (v1alpha1 semantics) ───────────────────────────────────────────

describe("SourceInfo v1alpha1", () => {
  it("has syntaxVersion cel1 inside sourceInfo", () => {
    assert.equal(parse("a = 1").sourceInfo?.syntaxVersion, "cel1");
  });

  it("location is <input>", () => {
    assert.equal(parse("a = 1").sourceInfo?.location, "<input>");
  });

  it("lineOffsets: empty for single-line input", () => {
    // No newlines → empty array
    assert.deepEqual(parse("a = 1").sourceInfo?.lineOffsets, []);
  });

  it("lineOffsets: newline positions for multi-line input", () => {
    // "a\nb\nc" → newlines at offsets 1 and 3
    const { sourceInfo } = parse("a\nb\nc");
    assert.deepEqual(sourceInfo?.lineOffsets, [1, 3]);
  });

  it("positions map covers all expr nodes", () => {
    const parsed = parse("a = 1");
    expect(parsed.sourceInfo).toBeDefined();
    expect(parsed.sourceInfo?.positions).toEqual({ "1": 0, "2": 4, "3": 1 });
  });

  it("offsetToLineCol: first char is line 1 col 0", () => {
    const pos = offsetToLineCol(0, []);
    assert.equal(pos.line, 1);
    assert.equal(pos.column, 0);
  });

  it("offsetToLineCol: char after \\n is line 2 col 0", () => {
    // "a\nb" → lineOffsets = [1], 'b' is at offset 2
    const pos = offsetToLineCol(2, [1]);
    assert.equal(pos.line, 2);
    assert.equal(pos.column, 0);
  });

  it("offsetToLineCol: column 3 on line 1", () => {
    const pos = offsetToLineCol(3, [10]); // newline at 10, so offset 3 is on line 1
    assert.equal(pos.line, 1);
    assert.equal(pos.column, 3);
  });

  it("ParseError has offset", () => {
    try {
      parse("a AND (b OR");
      assert.fail("should throw");
    } catch (e: any) {
      assert.ok(e instanceof ParseError);
      assert.ok(typeof e.offset === "number");
    }
  });
});

// ── NOT-after-explicit-AND regression ─────────────────────────────────────────

describe("NOT after explicit AND (whitespace regression)", () => {
  // Regression: parseTerm() used peekRaw() which saw the whitespace token
  // *before* NOT when called after parseExpression consumed AND without
  // a trailing skipWS(). NOT was then consumed as an identifier by
  // parseBaseValue(), producing an implicit-AND of `NOT` ident and the
  // following restriction instead of a proper @not node.

  it("A AND NOT B — NOT becomes @not, not an ident", () => {
    const { expr } = parse("a AND NOT b");
    // outer node must be AND, not an implicit-AND of (a, AND(NOT_ident, b))
    assert.equal(callFn(expr), "_&&_");
    const [left, right] = callArgs(expr);
    assert.equal(identName(left), "a");
    assert.equal(callFn(right), "@not", prettyExpr(expr));
    assert.equal(identName(callArgs(right)[0]), "b");
  });

  it("A AND NOT B:C — NOT labels:has", () => {
    const { expr } = parse("a AND NOT b:c");
    assert.equal(callFn(expr), "_&&_");
    const [, right] = callArgs(expr);
    assert.equal(callFn(right), "@not", prettyExpr(expr));
    assert.equal(callFn(callArgs(right)[0]), "@in");
  });

  it("three-term chain: A AND B AND NOT C", () => {
    const { expr } = parse("a AND b AND NOT c");
    // tree: AND(AND(a, b), NOT(c))
    assert.equal(callFn(expr), "_&&_");
    const [, right] = callArgs(expr);
    assert.equal(callFn(right), "@not", prettyExpr(expr));
  });

  it("full regression case: (OR) AND comparison AND NOT has", () => {
    const input =
      '(status = "ACTIVE" OR status = "PENDING") AND metadata.region = "us-central1" AND NOT labels:deprecated';
    const { expr } = parse(input);

    // Outer shape: AND( AND(OR(...), ==(...)), NOT(HAS(...)) )
    assert.equal(callFn(expr), "_&&_", prettyExpr(expr));
    const [outerLeft, outerRight] = callArgs(expr);

    // Right side must be @not, never an implicit AND of (ident"NOT", ...)
    assert.equal(
      callFn(outerRight),
      "@not",
      `Expected @not on right side but got: ${prettyExpr(outerRight)}`,
    );

    // The @not wraps a HAS restriction
    assert.equal(callFn(callArgs(outerRight)[0]), "@in");

    // Left side is AND(OR(...), ==(...))
    assert.equal(callFn(outerLeft), "_&&_");
    const [orNode, eqNode] = callArgs(outerLeft);
    assert.equal(callFn(orNode), "_||_");
    assert.equal(callFn(eqNode), "_==_");
  });

  it("prettyExpr renders the correct shape for the regression case", () => {
    const input =
      '(status = "ACTIVE" OR status = "PENDING") AND metadata.region = "us-central1" AND NOT labels:deprecated';
    const { expr } = parse(input);
    assert.equal(
      prettyExpr(expr),
      '_&&_(_&&_(_||_(_==_(ident(status), "ACTIVE"), _==_(ident(status), "PENDING")), _==_(select(ident(metadata).region), "us-central1")), @not(@in(ident(labels), ident(deprecated))))',
    );
  });
});
