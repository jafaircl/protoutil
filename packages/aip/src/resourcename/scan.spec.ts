import { describe, expect, it } from "vitest";
import { scan } from "./scan.js";

describe("scan", () => {
  describe("scan()", () => {
    it("no variables", () => {
      const variables = scan("publishers", "publishers");
      expect(variables).toEqual({});
    });

    it("single variable", () => {
      const variables = scan("publishers/foo", "publishers/{publisher}");
      expect(variables).toEqual({ publisher: "foo" });
    });

    it("two variables", () => {
      const variables = scan("publishers/foo/books/bar", "publishers/{publisher}/books/{book}");
      expect(variables).toEqual({ publisher: "foo", book: "bar" });
    });

    it("two variables singleton", () => {
      const variables = scan(
        "publishers/foo/books/bar/settings",
        "publishers/{publisher}/books/{book}/settings",
      );
      expect(variables).toEqual({ publisher: "foo", book: "bar" });
    });

    it("trailing segments", () => {
      expect(() => {
        scan("publishers/foo/books/bar/settings", "publishers/{publisher}/books/{book}");
      }).toThrow("got trailing segments in name");
    });
  });
});
