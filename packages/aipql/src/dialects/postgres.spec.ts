/** biome-ignore-all lint/suspicious/noExplicitAny: tests will catch any runtime errors */
import { describe, expect, it } from "vitest";
import { checked } from "../test-helpers.js";
import { groups } from "./dialect-cases.js";
import { postgres } from "./postgres.js";

// ---------------------------------------------------------------------------
// Shared cases — every filter expression tested across all 3 dialects
// ---------------------------------------------------------------------------

describe("postgres", () => {
  for (const { group, cases } of groups) {
    describe(group, () => {
      for (const c of cases) {
        const fn = c.only ? it.only : it;
        fn(c.filter, () => {
          expect(postgres(checked(c.filter))).toEqual(c.postgres);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Dialect-specific: matches function (Postgres has ~ operator)
// ---------------------------------------------------------------------------

describe("postgres — matches", () => {
  it(`title.matches("^The.*")`, () => {
    expect(postgres(checked(`title.matches("^The.*")`))).toEqual({
      sql: `"title" ~ $1`,
      params: ["^The.*"],
    });
  });
});

// ---------------------------------------------------------------------------
// Dialect-specific: caseInsensitive option
// ---------------------------------------------------------------------------

describe("postgres — caseInsensitive: false", () => {
  const opts = { caseInsensitive: false } as const;

  it(`title:"dragon"`, () => {
    expect(postgres(checked(`title:"dragon"`), opts)).toEqual({
      sql: `"title" LIKE $1`,
      params: ["%dragon%"],
    });
  });

  it(`title.startsWith("The")`, () => {
    expect(postgres(checked(`title.startsWith("The")`), opts)).toEqual({
      sql: `"title" LIKE $1`,
      params: ["The%"],
    });
  });

  it(`title.endsWith("Rings")`, () => {
    expect(postgres(checked(`title.endsWith("Rings")`), opts)).toEqual({
      sql: `"title" LIKE $1`,
      params: ["%Rings"],
    });
  });

  it(`title.contains("Lord")`, () => {
    expect(postgres(checked(`title.contains("Lord")`), opts)).toEqual({
      sql: `"title" LIKE $1`,
      params: ["%Lord%"],
    });
  });
});

// ---------------------------------------------------------------------------
// Dialect-specific: user-provided function handlers
// ---------------------------------------------------------------------------

describe("postgres — user-provided functions", () => {
  it("overload ID overrides the stdlib handler", () => {
    expect(
      postgres(checked(`title.startsWith("The")`), {
        functions: {
          string_starts_with(target, args, ctx) {
            if (!target || args.length !== 1) throw new Error("missing args");
            const col = ctx.quoteIdent((target.exprKind as any).value.name as string);
            const val = (args[0].exprKind as any).value.constantKind.value as string;
            ctx.write(`${col} LIKE ${ctx.pushParam(`${val}%`)}`);
          },
        },
      }),
    ).toEqual({ sql: `"title" LIKE $1`, params: ["The%"] });
  });

  it("function name fallback works when no overload ID matches", () => {
    expect(
      postgres(checked(`title.contains("Lord")`), {
        functions: {
          contains(target, args, ctx) {
            if (!target || args.length !== 1) throw new Error("missing args");
            const col = ctx.quoteIdent((target.exprKind as any).value.name as string);
            const val = (args[0].exprKind as any).value.constantKind.value as string;
            ctx.write(`to_tsvector(${col}) @@ plainto_tsquery(${ctx.pushParam(val)})`);
          },
        },
      }),
    ).toEqual({
      sql: `to_tsvector("title") @@ plainto_tsquery($1)`,
      params: ["Lord"],
    });
  });

  it("custom function not in stdlib is dispatched correctly", () => {
    expect(
      postgres(checked(`title.fuzzy("dragon")`), {
        functions: {
          fuzzy(target, args, ctx) {
            if (!target || args.length !== 1) throw new Error("missing args");
            const col = ctx.quoteIdent((target.exprKind as any).value.name as string);
            const val = (args[0].exprKind as any).value.constantKind.value as string;
            ctx.write(`similarity(${col}, ${ctx.pushParam(val)}) > 0.3`);
          },
        },
      }),
    ).toEqual({
      sql: `similarity("title", $1) > 0.3`,
      params: ["dragon"],
    });
  });

  it("ctx.like reflects caseInsensitive option in custom handlers", () => {
    expect(
      postgres(checked(`title.startsWith("The")`), {
        caseInsensitive: false,
        functions: {
          startsWith(target, args, ctx) {
            if (!target || args.length !== 1) throw new Error("missing args");
            const col = ctx.quoteIdent((target.exprKind as any).value.name as string);
            const val = (args[0].exprKind as any).value.constantKind.value as string;
            ctx.write(`${col} ${ctx.like} ${ctx.pushParam(`${val}%`)}`);
          },
        },
      }),
    ).toEqual({ sql: `"title" LIKE $1`, params: ["The%"] });
  });

  it("unknown function with no handler throws TranslationError", () => {
    expect(() => postgres(checked(`title.fuzzy("dragon")`))).toThrow(/No handler for "fuzzy"/);
  });
});
