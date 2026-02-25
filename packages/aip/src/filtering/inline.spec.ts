import { assert, describe, it } from "vitest";
import { check } from "./checker";
import { fold } from "./fold";
import { inline } from "./inline";
import { optimize } from "./optimizer";
import { parse } from "./parser";
import { BOOL, INT64, ident, STRING } from "./types";
import { unparse } from "./unparse";

// ─────────────────────────────────────────────────────────────────────────────
// inline — ident replacement
// ─────────────────────────────────────────────────────────────────────────────

describe("inline — ident replacement", () => {
  const cases: Array<{
    description: string;
    filter: string;
    decls: ReturnType<typeof ident>[];
    replacements: Record<string, string>;
    expected: string;
  }> = [
    {
      description: "ident → ident",
      filter: 'name = "asdf"',
      decls: [ident("name", STRING)],
      replacements: { name: "user_name" },
      expected: 'user_name = "asdf"',
    },
    {
      description: "ident → select chain",
      filter: 'name = "asdf"',
      decls: [ident("name", STRING)],
      replacements: { name: "user.profile.name" },
      expected: 'user.profile.name = "asdf"',
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
  ];

  for (const { description, filter, decls, replacements, expected } of cases) {
    it(description, () => {
      const { checkedExpr } = check(parse(filter), decls);
      const result = optimize(
        checkedExpr,
        inline(Object.fromEntries(Object.entries(replacements).map(([k, v]) => [k, parse(v)]))),
      );
      assert.isDefined(result.expr);
      assert.equal(unparse(result.expr), expected);
    });
  }

  it("replacement nodes get unique ids", () => {
    const { checkedExpr } = check(parse("x AND x"), [ident("x", BOOL)]);
    const result = optimize(checkedExpr, inline({ x: parse("a.b") }));

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

    assert.isDefined(result.expr);
    const ids = collectIds(result.expr);
    const unique = new Set(ids.map(String));
    assert.equal(ids.length, unique.size, "all node ids should be unique after inlining");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// optimize — composition
// ─────────────────────────────────────────────────────────────────────────────

describe("optimize — composition", () => {
  it("inline then fold", () => {
    const { checkedExpr } = check(parse("retries < 10"), [ident("retries", INT64)]);
    const result = optimize(checkedExpr, inline({ retries: parse("count") }), fold({ count: 3n }));
    assert.isDefined(result.expr);
    assert.equal(unparse(result.expr), "true");
  });

  it("fold then inline", () => {
    const { checkedExpr } = check(parse('a < 10 AND b = "prod"'), [
      ident("a", INT64),
      ident("b", STRING),
    ]);
    const result = optimize(checkedExpr, fold({ a: 3n }), inline({ b: parse("request.env") }));
    assert.isDefined(result.expr);
    assert.equal(unparse(result.expr), 'true AND request.env = "prod"');
  });

  it("two inlines compose", () => {
    const { checkedExpr } = check(parse('first = "a" AND last = "b"'), [
      ident("first", STRING),
      ident("last", STRING),
    ]);
    const result = optimize(
      checkedExpr,
      inline({ first: parse("user.first_name") }),
      inline({ last: parse("user.last_name") }),
    );
    assert.isDefined(result.expr);
    assert.equal(unparse(result.expr), 'user.first_name = "a" AND user.last_name = "b"');
  });

  it("no optimizers returns original expr unchanged", () => {
    const { checkedExpr } = check(parse("a < 10"), [ident("a", INT64)]);
    const result = optimize(checkedExpr);
    assert.isDefined(result.expr);
    assert.equal(unparse(result.expr), "a < 10");
  });

  it("preserves sourceInfo through optimization", () => {
    const { checkedExpr } = check(parse("retries < 10"), [ident("retries", INT64)]);
    const result = optimize(checkedExpr, fold({ retries: 3n }));
    assert.isDefined(result.sourceInfo);
    assert.equal(result.sourceInfo?.location, "<input>");
  });
});
