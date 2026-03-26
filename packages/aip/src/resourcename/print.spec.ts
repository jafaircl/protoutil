import { describe, expect, it } from "vitest";
import { print } from "./print.js";

describe("print", () => {
  describe("print()", () => {
    const testCases = [
      {
        name: "no variables",
        pattern: "singleton",
        expected: "singleton",
      },
      {
        name: "too many variables",
        pattern: "singleton",
        variables: { publisher: "foo" },
        expected: "singleton",
      },
      {
        name: "single variable",
        pattern: "publishers/{publisher}",
        variables: { publisher: "foo" },
        expected: "publishers/foo",
      },
      {
        name: "two variables",
        pattern: "publishers/{publisher}/books/{book}",
        variables: { publisher: "foo", book: "bar" },
        expected: "publishers/foo/books/bar",
      },
      {
        name: "singleton two variables",
        pattern: "publishers/{publisher}/books/{book}/settings",
        variables: { publisher: "foo", book: "bar" },
        expected: "publishers/foo/books/bar/settings",
      },

      {
        name: "empty variable",
        pattern: "publishers/{publisher}/books/{book}",
        variables: { publisher: "foo", book: "" },
        expected: "publishers/foo/books/",
      },

      {
        name: "too few variables",
        pattern: "publishers/{publisher}/books/{book}/settings",
        variables: { publisher: "foo" },
        expected: "publishers/foo/books//settings",
      },
    ];
    for (const tc of testCases) {
      it(tc.name, () => {
        const expected = tc.expected;
        const pattern = tc.pattern;
        const result = print(pattern, (tc.variables as Record<string, string>) ?? {});
        expect(result).toEqual(expected);
      });
    }
  });
});
