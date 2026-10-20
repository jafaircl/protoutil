import { describe, expect, it } from "vitest";
import { isMongoDbRegex, isPortableRegex } from "./regex.js";

describe("portable regex subset", () => {
  it("accepts a counted repetition at the shared limit", () => {
    expect(isPortableRegex("a{255}")).toBe(true);
    expect(isPortableRegex("a{1,255}")).toBe(true);
  });

  it("rejects a counted repetition above the shared limit", () => {
    expect(isPortableRegex("a{256}")).toBe(false);
    expect(isPortableRegex("a{1,256}")).toBe(false);
    expect(isPortableRegex("a{99999,}")).toBe(false);
  });

  // A brace that begins no well-formed bound is a literal brace. Treating the
  // span up to some later "}" as a repetition would skip the real quantifiers
  // between them and let an oversized bound through.
  it("still sees an oversized bound after a literal brace", () => {
    expect(isPortableRegex("a{2 b{99999}")).toBe(false);
    expect(isPortableRegex("a{,5}b{4096}")).toBe(false);
  });

  it("accepts a literal brace that encloses no repetition", () => {
    expect(isPortableRegex("a{2 b}")).toBe(true);
  });
});

describe("MongoDB regex subset", () => {
  it("allows one unbounded quantifier and rejects two", () => {
    expect(isMongoDbRegex("a*")).toBe(true);
    expect(isMongoDbRegex("a{2,}")).toBe(true);
    expect(isMongoDbRegex("a*b+")).toBe(false);
    expect(isMongoDbRegex("a{2,}b{3,}")).toBe(false);
  });

  it("counts an unbounded quantifier that follows a literal brace", () => {
    expect(isMongoDbRegex("a{2 b}c*d{3,}")).toBe(false);
  });
});
