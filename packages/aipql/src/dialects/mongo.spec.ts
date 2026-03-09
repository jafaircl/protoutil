/** biome-ignore-all lint/suspicious/noExplicitAny: tests will catch any runtime errors */
import { describe, expect, it } from "vitest";
import { checked } from "../test-helpers.js";
import { groups } from "./dialect-cases.js";
import { mongo } from "./mongo.js";

// ---------------------------------------------------------------------------
// Shared cases — every filter expression tested across all 3 dialects
// ---------------------------------------------------------------------------

describe("mongo", () => {
  for (const { group, cases } of groups) {
    describe(group, () => {
      for (const c of cases) {
        const fn = c.only ? it.only : it;
        fn(c.filter, () => {
          expect(mongo(checked(c.filter))).toEqual(c.mongo);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Dialect-specific: matches function
// ---------------------------------------------------------------------------

describe("mongo — matches", () => {
  it(`title.matches("^The.*")`, () => {
    expect(mongo(checked(`title.matches("^The.*")`))).toEqual({
      filter: { title: { $regex: "^The.*" } },
    });
  });
});

// ---------------------------------------------------------------------------
// Dialect-specific: caseInsensitive option
// ---------------------------------------------------------------------------

describe("mongo — caseInsensitive: false", () => {
  const opts = { caseInsensitive: false } as const;

  it(`title:"dragon"`, () => {
    expect(mongo(checked(`title:"dragon"`), opts)).toEqual({
      filter: { title: { $regex: "dragon" } },
    });
  });

  it(`title.startsWith("The")`, () => {
    expect(mongo(checked(`title.startsWith("The")`), opts)).toEqual({
      filter: { title: { $regex: "^The" } },
    });
  });

  it(`title.endsWith("Rings")`, () => {
    expect(mongo(checked(`title.endsWith("Rings")`), opts)).toEqual({
      filter: { title: { $regex: "Rings$" } },
    });
  });

  it(`title.contains("Lord")`, () => {
    expect(mongo(checked(`title.contains("Lord")`), opts)).toEqual({
      filter: { title: { $regex: "Lord" } },
    });
  });
});

// ---------------------------------------------------------------------------
// Dialect-specific: user-provided function handlers
// ---------------------------------------------------------------------------

describe("mongo — user-provided functions", () => {
  it("overload ID overrides the stdlib handler", () => {
    expect(
      mongo(checked(`title.startsWith("The")`), {
        functions: {
          string_starts_with(target, args, ctx) {
            if (!target) throw new Error("missing target");
            const pattern = (args[0].exprKind as any).value.constantKind.value as string;
            return { [ctx.fieldPath(target)]: { $regex: `^${pattern}` } };
          },
        },
      }),
    ).toEqual({ filter: { title: { $regex: "^The" } } });
  });

  it("function name fallback works when no overload ID matches", () => {
    expect(
      mongo(checked(`title.contains("Lord")`), {
        functions: {
          contains(target, args, _ctx) {
            if (!target) throw new Error("missing target");
            const value = (args[0].exprKind as any).value.constantKind.value as string;
            return { $text: { $search: value } };
          },
        },
      }),
    ).toEqual({ filter: { $text: { $search: "Lord" } } });
  });

  it("custom function not in stdlib is dispatched correctly", () => {
    expect(
      mongo(checked(`title.fuzzy("dragon")`), {
        functions: {
          fuzzy(target, args, ctx) {
            if (!target) throw new Error("missing target");
            const value = (args[0].exprKind as any).value.constantKind.value as string;
            return { [ctx.fieldPath(target)]: { $regex: value, $options: "i" } };
          },
        },
      }),
    ).toEqual({ filter: { title: { $regex: "dragon", $options: "i" } } });
  });

  it("unknown function with no handler throws TranslationError", () => {
    expect(() => mongo(checked(`title.fuzzy("dragon")`))).toThrow(/No handler for "fuzzy"/);
  });
});
