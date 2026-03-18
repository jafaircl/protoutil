/** biome-ignore-all lint/suspicious/noExplicitAny: tests will catch any runtime errors */
import { ident, STRING } from "@protoutil/aip/filtering";
import { describe, expect, it } from "vitest";
import { agoDecl } from "../ago.js";
import { checked, fuzzyDecls } from "../test-helpers.js";
import { groups } from "./dialect-cases.js";
import { mysql } from "./mysql.js";

// ---------------------------------------------------------------------------
// Shared cases — every filter expression tested across all 4 dialects
// ---------------------------------------------------------------------------

describe("mysql", () => {
  for (const { group, cases } of groups) {
    describe(group, () => {
      for (const c of cases) {
        const fn = c.only ? it.only : it;
        fn(c.filter, () => {
          expect(mysql(checked(c.filter))).toEqual(c.mysql);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Dialect-specific: matches function (MySQL has REGEXP operator)
// ---------------------------------------------------------------------------

describe("mysql — matches", () => {
  it(`title.matches("^The.*")`, () => {
    expect(mysql(checked(`title.matches("^The.*")`))).toEqual({
      sql: "`title` REGEXP ?",
      params: ["^The.*"],
    });
  });
});

// ---------------------------------------------------------------------------
// Dialect-specific: user-provided function handlers
// ---------------------------------------------------------------------------

describe("mysql — user-provided functions", () => {
  it("overload ID overrides the stdlib handler", () => {
    expect(
      mysql(checked(`title.startsWith("The")`), {
        functions: {
          string_starts_with(target, args, ctx) {
            if (!target || args.length !== 1) throw new Error("missing args");
            const col = ctx.quoteIdent((target.exprKind as any).value.name as string);
            const val = (args[0].exprKind as any).value.constantKind.value as string;
            ctx.write(`${col} LIKE ${ctx.pushParam(`${val}%`)}`);
          },
        },
      }),
    ).toEqual({ sql: "`title` LIKE ?", params: ["The%"] });
  });

  it("function name fallback works when no overload ID matches", () => {
    expect(
      mysql(checked(`title.contains("Lord")`), {
        functions: {
          contains(target, args, ctx) {
            if (!target || args.length !== 1) throw new Error("missing args");
            const col = ctx.quoteIdent((target.exprKind as any).value.name as string);
            const val = (args[0].exprKind as any).value.constantKind.value as string;
            ctx.write(`MATCH(${col}) AGAINST(${ctx.pushParam(val)})`);
          },
        },
      }),
    ).toEqual({
      sql: "MATCH(`title`) AGAINST(?)",
      params: ["Lord"],
    });
  });

  it("custom function not in stdlib is dispatched correctly", () => {
    expect(
      mysql(checked(`title.fuzzy("dragon")`, fuzzyDecls), {
        functions: {
          fuzzy(target, args, ctx) {
            if (!target || args.length !== 1) throw new Error("missing args");
            const col = ctx.quoteIdent((target.exprKind as any).value.name as string);
            const val = (args[0].exprKind as any).value.constantKind.value as string;
            ctx.write(`SOUNDEX(${col}) = SOUNDEX(${ctx.pushParam(val)})`);
          },
        },
      }),
    ).toEqual({
      sql: "SOUNDEX(`title`) = SOUNDEX(?)",
      params: ["dragon"],
    });
  });

  it("unknown function with no handler throws TranslationError", () => {
    expect(() => mysql(checked(`title.fuzzy("dragon")`, fuzzyDecls))).toThrow(
      /No handler for "fuzzy"/,
    );
  });
});

// ---------------------------------------------------------------------------
// Dialect-specific: ago() function
// ---------------------------------------------------------------------------

describe("mysql — non-boolean output type", () => {
  it("rejects a filter expression that does not evaluate to a boolean", () => {
    const decls = [ident("name", STRING)];
    expect(() => mysql(checked("name", decls))).toThrow(
      /filter expression must evaluate to a boolean, got string/,
    );
  });
});

describe("mysql — ago()", () => {
  it(`create_time > ago(24h)`, () => {
    expect(mysql(checked(`create_time > ago(24h)`, [agoDecl]))).toEqual({
      sql: "`create_time` > NOW(6) - INTERVAL ? MICROSECOND",
      params: [86400000000],
    });
  });

  it(`create_time > ago(30s)`, () => {
    expect(mysql(checked(`create_time > ago(30s)`, [agoDecl]))).toEqual({
      sql: "`create_time` > NOW(6) - INTERVAL ? MICROSECOND",
      params: [30000000],
    });
  });

  it(`create_time > ago(1.5s)`, () => {
    expect(mysql(checked(`create_time > ago(1.5s)`, [agoDecl]))).toEqual({
      sql: "`create_time` > NOW(6) - INTERVAL ? MICROSECOND",
      params: [1500000],
    });
  });
});
