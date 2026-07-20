import { describe, expect, it } from "vitest";
import { Lexer } from "./lexer.js";
import { TokenKind } from "./token.js";

/**
 * significantTokens drops the terminal EOF token so lexer unit tests can focus on emitted content.
 */
function significantTokens(source: string) {
  return new Lexer(source).tokenize().tokens.filter((token) => token.kind !== TokenKind.Eof);
}

describe("parser/lexer.ts", () => {
  it("counts code points while tokenizing", () => {
    const result = new Lexer("'😁' + foo").tokenize();
    expect(result.codePointCount).toBe(Array.from("'😁' + foo").length);
  });

  it("prefers the simple string alternative when triple quotes are not the longest valid token", () => {
    const tokens = significantTokens('0"""\\');
    expect(tokens.map((token) => token.kind)).toEqual([
      TokenKind.Int,
      TokenKind.String,
      TokenKind.Invalid,
    ]);
    expect(tokens[1]?.text).toBe('""');
    expect(tokens[2]?.text).toBe('"\\');
  });

  it("prefers the triple-quoted alternative when it is valid and longer", () => {
    const tokens = significantTokens('"""abc"""');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.kind).toBe(TokenKind.String);
    expect(tokens[0]?.text).toBe('"""abc"""');
  });

  it("keeps malformed escapes inside invalid string tokens", () => {
    const tokens = significantTokens('"\\z"');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.kind).toBe(TokenKind.Invalid);
    expect(tokens[0]?.text).toBe('"\\z');
    expect(tokens[1]?.kind).toBe(TokenKind.Invalid);
    expect(tokens[1]?.text).toBe('"');
  });

  it("skips comments while preserving the following token coordinates", () => {
    const tokens = significantTokens("// comment\nfoo");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.kind).toBe(TokenKind.Identifier);
    expect(tokens[0]?.text).toBe("foo");
    expect(tokens[0]?.line).toBe(2);
    expect(tokens[0]?.column).toBe(0);
  });

  it("treats raw strings as string literals without escape processing in the lexer", () => {
    const tokens = significantTokens(String.raw`r"\n"`);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.kind).toBe(TokenKind.String);
    expect(tokens[0]?.text).toBe(String.raw`r"\n"`);
  });

  it("splits malformed quote-heavy tails into ordinary strings plus invalid backslashes", () => {
    const tokens = significantTokens('0"""\\""\\"');
    expect(tokens.map((token) => token.kind)).toEqual([
      TokenKind.Int,
      TokenKind.String,
      TokenKind.String,
      TokenKind.Invalid,
      TokenKind.Invalid,
    ]);
    expect(tokens[1]?.text).toBe('""');
    expect(tokens[2]?.text).toBe('"\\""');
    expect(tokens[3]?.text).toBe("\\");
    expect(tokens[4]?.text).toBe('"');
  });
});
