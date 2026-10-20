import { describe, expect, it } from "vitest";
import { syncedCases } from "../common/spec-helpers.js";
import { unescape as unescapeString } from "./unescape.js";

type UnescapeCase = {
  in: string;
  out: string | { $expr?: string };
  isBytes?: boolean;
};

describe("parser/unescape_test.go", () => {
  for (const row of syncedCases<UnescapeCase>("parser/unescape_test.go/TestUnescape")) {
    it(`parser/unescape_test.go/TestUnescape ${row.in}`, () => {
      if (typeof row.out === "string") {
        expect(unescapeString(row.in, row.isBytes ?? false)).toBe(row.out);
        return;
      }
      expect(() => unescapeString(row.in, row.isBytes ?? false)).toThrow(
        resolveExpectedUnescapeError(row.out),
      );
    });
  }
});

/**
 * resolveExpectedUnescapeError extracts the upstream error text for unescape failure cases.
 */
function resolveExpectedUnescapeError(value: { $expr?: string }): string {
  const rawMatch = /^errors\.New\(`([\s\S]*)`\)$/.exec(value.$expr ?? "");
  if (rawMatch) {
    return rawMatch[1]!;
  }
  const match = /^errors\.New\("([\s\S]*)"\)$/.exec(value.$expr ?? "");
  if (!match) {
    throw new Error(`unsupported unescape error expr: ${value.$expr}`);
  }
  return match[1]!;
}
