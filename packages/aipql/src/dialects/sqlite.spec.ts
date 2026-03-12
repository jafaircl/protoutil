import { describe, expect, it } from "vitest";
import { agoDecl } from "../ago.js";
import { checked } from "../test-helpers.js";
import { groups } from "./dialect-cases.js";
import { sqlite } from "./sqlite.js";

// ---------------------------------------------------------------------------
// Shared cases — every filter expression tested across all 3 dialects
// ---------------------------------------------------------------------------

describe("sqlite", () => {
  for (const { group, cases } of groups) {
    describe(group, () => {
      for (const c of cases) {
        const fn = c.only ? it.only : it;
        fn(c.filter, () => {
          expect(sqlite(checked(c.filter))).toEqual(c.sqlite);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Dialect-specific: user-provided function handlers
// ---------------------------------------------------------------------------

describe("sqlite — user-provided functions", () => {
  it("matches without handler throws TranslationError", () => {
    expect(() => sqlite(checked(`title.matches("^The.*")`))).toThrow(/No handler for "matches"/);
  });

  it("custom regexp function via options.functions", () => {
    expect(
      sqlite(checked(`title.matches("^The.*")`), {
        functions: {
          string_matches(target, args, ctx) {
            if (!target || args.length !== 1)
              throw new Error("matches requires target and one argument");
            const pattern = args[0];
            ctx.write(`regexp(`);
            ctx.emit(pattern);
            ctx.write(
              `, "${target.exprKind.case === "identExpr" ? target.exprKind.value.name : "?"}"`,
            );
            ctx.write(`)`);
          },
        },
      }),
    ).toEqual({ sql: `regexp(?, "title")`, params: ["^The.*"] });
  });
});

// ---------------------------------------------------------------------------
// Dialect-specific: ago() function
// ---------------------------------------------------------------------------

describe("sqlite — ago()", () => {
  it(`create_time > ago(24h)`, () => {
    expect(sqlite(checked(`create_time > ago(24h)`, [agoDecl]))).toEqual({
      sql: `"create_time" > datetime('now', ?)`,
      params: ["-86400 seconds"],
    });
  });

  it(`create_time > ago(30s)`, () => {
    expect(sqlite(checked(`create_time > ago(30s)`, [agoDecl]))).toEqual({
      sql: `"create_time" > datetime('now', ?)`,
      params: ["-30 seconds"],
    });
  });

  it(`create_time > ago(1.5s)`, () => {
    expect(sqlite(checked(`create_time > ago(1.5s)`, [agoDecl]))).toEqual({
      sql: `"create_time" > datetime('now', ?)`,
      params: ["-1.5 seconds"],
    });
  });
});
