import { type Token, TokenKind } from "./token.js";

/**
 * identifierStart matches the leading character of an unescaped CEL identifier.
 */
const identifierStart = /[A-Za-z_]/;
/**
 * identifierPart matches subsequent characters of an unescaped CEL identifier.
 */
const identifierPart = /[A-Za-z0-9_]/;
/**
 * hexDigit matches hexadecimal digits used by numeric literals.
 */
const hexDigit = /[0-9A-Fa-f]/;

/**
 * LexerResult contains the tokens emitted by the lexer and the source code point count observed
 * while scanning them.
 */
export interface LexerResult {
  /**
   * tokens stores the emitted token stream, including the terminal EOF token.
   */
  tokens: Token[];
  /**
   * codePointCount stores the total number of Unicode code points in the source.
   */
  codePointCount: number;
}

/**
 * Lexer tokenizes CEL source text.
 */
export class Lexer {
  private index = 0;
  private line = 1;
  private column = 0;
  private codePointCount = 0;

  /**
   * Binds the lexer to a source string.
   */
  constructor(private readonly source: string) {}

  /**
   * tokenize scans the entire input once, appends EOF, and reports the source code point count
   * collected during that same pass.
   */
  public tokenize(): LexerResult {
    const tokens: Token[] = [];
    while (this.index < this.source.length) {
      const token = this.nextToken();
      if (token === undefined) {
        continue;
      }
      tokens.push(token);
    }
    tokens.push(this.makeToken(TokenKind.Eof, "", this.index, this.index, this.line, this.column));
    return { tokens, codePointCount: this.codePointCount };
  }

  /**
   * nextToken scans the next significant token while skipping whitespace and comments.
   */
  private nextToken(): Token | undefined {
    const char = this.currentChar();
    if (char === " " || char === "\t" || char === "\f") {
      this.advance(char);
      return undefined;
    }
    if (char === "\n") {
      this.advance(char);
      this.line += 1;
      this.column = 0;
      return undefined;
    }
    if (char === "\r") {
      this.advance(char);
      if (this.source[this.index] === "\n") {
        this.advance("\n");
      }
      this.line += 1;
      this.column = 0;
      return undefined;
    }
    if (char === "/" && this.source[this.index + 1] === "/") {
      // CEL line comments consume through the newline but let newline handling update coordinates.
      while (this.index < this.source.length && this.source[this.index] !== "\n") {
        this.advance(this.source[this.index]!);
      }
      return undefined;
    }
    const start = this.index;
    const line = this.line;
    const column = this.column;
    const two = this.source.slice(this.index, this.index + 2);
    switch (two) {
      case "==":
        return this.emit(TokenKind.EqualsEquals, 2, start, line, column);
      case "!=":
        return this.emit(TokenKind.NotEquals, 2, start, line, column);
      case "<=":
        return this.emit(TokenKind.LessEquals, 2, start, line, column);
      case ">=":
        return this.emit(TokenKind.GreaterEquals, 2, start, line, column);
      case "&&":
        return this.emit(TokenKind.LogicalAnd, 2, start, line, column);
      case "||":
        return this.emit(TokenKind.LogicalOr, 2, start, line, column);
    }
    if (char === "." && /\d/.test(this.source[this.index + 1] ?? "")) {
      return this.scanNumber(start, line, column);
    }
    if (
      char === "'" ||
      char === `"` ||
      ((char === "r" || char === "R") && isQuote(this.source[this.index + 1]))
    ) {
      return this.scanString(start, line, column, false);
    }
    if ((char === "b" || char === "B") && isQuote(this.source[this.index + 1])) {
      return this.scanString(start, line, column, true);
    }
    if (char === "`") {
      return this.scanEscapedIdentifier(start, line, column);
    }
    if (/\d/.test(char)) {
      return this.scanNumber(start, line, column);
    }
    if (identifierStart.test(char)) {
      return this.scanIdentifier(start, line, column);
    }
    switch (char) {
      case ".":
        return this.emit(TokenKind.Dot, 1, start, line, column);
      case ",":
        return this.emit(TokenKind.Comma, 1, start, line, column);
      case ":":
        return this.emit(TokenKind.Colon, 1, start, line, column);
      case "?":
        return this.emit(TokenKind.Question, 1, start, line, column);
      case "(":
        return this.emit(TokenKind.LParen, 1, start, line, column);
      case ")":
        return this.emit(TokenKind.RParen, 1, start, line, column);
      case "[":
        return this.emit(TokenKind.LBracket, 1, start, line, column);
      case "]":
        return this.emit(TokenKind.RBracket, 1, start, line, column);
      case "{":
        return this.emit(TokenKind.LBrace, 1, start, line, column);
      case "}":
        return this.emit(TokenKind.RBrace, 1, start, line, column);
      case "+":
        return this.emit(TokenKind.Plus, 1, start, line, column);
      case "-":
        return this.emit(TokenKind.Minus, 1, start, line, column);
      case "*":
        return this.emit(TokenKind.Star, 1, start, line, column);
      case "/":
        return this.emit(TokenKind.Slash, 1, start, line, column);
      case "%":
        return this.emit(TokenKind.Percent, 1, start, line, column);
      case "!":
        return this.emit(TokenKind.Bang, 1, start, line, column);
      case "<":
        return this.emit(TokenKind.Less, 1, start, line, column);
      case ">":
        return this.emit(TokenKind.Greater, 1, start, line, column);
      default:
        this.advance(char);
        while (this.source[this.index] === " " || this.source[this.index] === "\t") {
          this.advance(this.source[this.index]!);
        }
        return this.makeToken(
          TokenKind.Invalid,
          this.source.slice(start, this.index),
          start,
          this.index,
          line,
          column,
        );
    }
  }

  /**
   * scanIdentifier scans identifiers and keyword-like literals.
   */
  private scanIdentifier(start: number, line: number, column: number): Token {
    this.advance(this.source[this.index]!);
    while (identifierPart.test(this.source[this.index] ?? "")) {
      this.advance(this.source[this.index]!);
    }
    const text = this.source.slice(start, this.index);
    if (text === "true") {
      return this.makeToken(TokenKind.True, text, start, this.index, line, column);
    }
    if (text === "false") {
      return this.makeToken(TokenKind.False, text, start, this.index, line, column);
    }
    if (text === "null") {
      return this.makeToken(TokenKind.Null, text, start, this.index, line, column);
    }
    if (text === "in") {
      return this.makeToken(TokenKind.In, text, start, this.index, line, column);
    }
    return this.makeToken(TokenKind.Identifier, text, start, this.index, line, column);
  }

  /**
   * scanEscapedIdentifier scans a backtick-delimited identifier token.
   */
  private scanEscapedIdentifier(start: number, line: number, column: number): Token {
    this.advance("`");
    if (this.source[this.index] === "$") {
      this.advance("$");
      return this.makeToken(
        TokenKind.Invalid,
        this.source.slice(start, this.index),
        start,
        this.index,
        line,
        column,
      );
    }
    while (this.index < this.source.length && this.source[this.index] !== "`") {
      this.advance(this.source[this.index]!);
    }
    if (this.source[this.index] === "`") {
      this.advance("`");
      return this.makeToken(
        TokenKind.EscapedIdentifier,
        this.source.slice(start, this.index),
        start,
        this.index,
        line,
        column,
      );
    }
    return this.makeToken(
      TokenKind.Invalid,
      this.source.slice(start),
      start,
      this.index,
      line,
      column,
    );
  }

  /**
   * scanNumber scans integer, unsigned, hexadecimal, and floating-point literals.
   */
  private scanNumber(start: number, line: number, column: number): Token {
    let kind = TokenKind.Int;
    if (this.source[this.index] === ".") {
      kind = TokenKind.Float;
      this.advance(".");
      while (/\d/.test(this.source[this.index] ?? "")) {
        this.advance(this.source[this.index]!);
      }
      this.scanExponent();
      return this.makeToken(
        kind,
        this.source.slice(start, this.index),
        start,
        this.index,
        line,
        column,
      );
    }
    if (this.source.startsWith("0x", this.index)) {
      this.advance("0");
      this.advance("x");
      while (hexDigit.test(this.source[this.index] ?? "")) {
        this.advance(this.source[this.index]!);
      }
    } else {
      while (/\d/.test(this.source[this.index] ?? "")) {
        this.advance(this.source[this.index]!);
      }
    }
    if (this.source[this.index] === "." && /\d/.test(this.source[this.index + 1] ?? "")) {
      kind = TokenKind.Float;
      this.advance(".");
      while (/\d/.test(this.source[this.index] ?? "")) {
        this.advance(this.source[this.index]!);
      }
    }
    if (this.source[this.index] === "e" || this.source[this.index] === "E") {
      kind = TokenKind.Float;
      this.scanExponent();
    }
    if (
      (this.source[this.index] === "u" || this.source[this.index] === "U") &&
      kind !== TokenKind.Float
    ) {
      kind = TokenKind.Uint;
      this.advance(this.source[this.index]!);
    }
    return this.makeToken(
      kind,
      this.source.slice(start, this.index),
      start,
      this.index,
      line,
      column,
    );
  }

  /**
   * scanExponent consumes the exponent suffix of a floating-point literal.
   */
  private scanExponent(): void {
    if (this.source[this.index] !== "e" && this.source[this.index] !== "E") {
      return;
    }
    this.advance(this.source[this.index]!);
    if (this.source[this.index] === "+" || this.source[this.index] === "-") {
      this.advance(this.source[this.index]!);
    }
    while (/\d/.test(this.source[this.index] ?? "")) {
      this.advance(this.source[this.index]!);
    }
  }

  /**
   * scanString scans regular, raw, triple-quoted, and bytes string literals.
   *
   * The CEL grammar has overlapping string alternatives, so this method probes the simple and
   * triple-quoted forms first and then commits to the longest valid one. Keeping that choice in the
   * lexer avoids parser-side string shape guessing.
   */
  private scanString(start: number, line: number, column: number, isBytes: boolean): Token {
    const prefixLength = stringPrefixLength(this.source, start, isBytes);
    const quoteStart = start + prefixLength;
    const quote = this.source[quoteStart]!;
    const simple = scanQuotedLiteral(this.source, start, quoteStart, isBytes, false);
    const triple =
      this.source.slice(quoteStart, quoteStart + 3) === quote.repeat(3)
        ? scanQuotedLiteral(this.source, start, quoteStart, isBytes, true)
        : undefined;
    const scanned = chooseQuotedLiteral(simple, triple);
    this.advanceScannedString(scanned);
    return this.makeToken(
      scanned.kind,
      this.source.slice(start, scanned.stop),
      start,
      scanned.stop,
      line,
      column,
    );
  }

  /**
   * emit advances a fixed-width punctuation or operator token.
   */
  private emit(kind: TokenKind, width: number, start: number, line: number, column: number): Token {
    for (let i = 0; i < width; i += 1) {
      this.advance(this.source[this.index]!);
    }
    return this.makeToken(
      kind,
      this.source.slice(start, this.index),
      start,
      this.index,
      line,
      column,
    );
  }

  /**
   * makeToken builds a token with the recorded source coordinates.
   */
  private makeToken(
    kind: TokenKind,
    text: string,
    start: number,
    stop: number,
    line: number,
    column: number,
  ): Token {
    return { kind, text, start, stop, line, column };
  }

  /**
   * advance consumes the provided source fragment, tracking both byte-ish string offsets and the
   * logical code point count used by the parser's expression-size limit.
   */
  private advance(char: string): void {
    this.index += char.length;
    this.column += char.length;
    this.codePointCount += 1;
  }

  /**
   * advanceScannedString commits a previously analyzed string span to the live lexer state after a
   * helper chose which overlapping string alternative should win.
   */
  private advanceScannedString(scanned: ScannedString): void {
    while (this.index < scanned.stop) {
      const current = this.currentChar();
      this.advance(current);
      if (current === "\n") {
        this.line += 1;
        this.column = 0;
      }
    }
  }

  /**
   * currentChar returns the current Unicode code point as a string.
   */
  private currentChar(): string {
    return String.fromCodePoint(this.source.codePointAt(this.index)!);
  }
}

/**
 * ScannedString stores the outcome of trying one CEL quoted-string form.
 */
interface ScannedString {
  /**
   * kind identifies whether the scan succeeded as a string/bytes literal or failed.
   */
  kind: TokenKind;
  /**
   * stop records the exclusive end offset chosen for the token.
   */
  stop: number;
  /**
   * valid reports whether the candidate matched a complete lexer alternative.
   */
  valid: boolean;
}

/**
 * stringPrefixLength reports the number of non-content prefix bytes before the opening quote.
 */
function stringPrefixLength(source: string, start: number, isBytes: boolean): number {
  let length = isBytes ? 1 : 0;
  const rawIndex = start + length;
  if (source[rawIndex] === "r" || source[rawIndex] === "R") {
    length += 1;
  }
  return length;
}

/**
 * chooseQuotedLiteral selects the lexer alternative that matches CEL's longest-valid-token behavior.
 */
function chooseQuotedLiteral(
  simple: ScannedString,
  triple: ScannedString | undefined,
): ScannedString {
  if (!triple) {
    return simple;
  }
  if (simple.valid && triple.valid) {
    return triple.stop > simple.stop ? triple : simple;
  }
  if (triple.valid) {
    return triple;
  }
  if (simple.valid) {
    return simple;
  }
  return triple.stop > simple.stop ? triple : simple;
}

/**
 * scanQuotedLiteral simulates one CEL quoted-string lexer alternative without mutating lexer state.
 */
function scanQuotedLiteral(
  source: string,
  start: number,
  quoteStart: number,
  isBytes: boolean,
  triple: boolean,
): ScannedString {
  const quote = source[quoteStart]!;
  const raw =
    source[start + (isBytes ? 1 : 0)] === "r" || source[start + (isBytes ? 1 : 0)] === "R";
  let index = quoteStart + (triple ? 3 : 1);
  while (index < source.length) {
    if (triple && source.slice(index, index + 3) === quote.repeat(3)) {
      return { kind: isBytes ? TokenKind.Bytes : TokenKind.String, stop: index + 3, valid: true };
    }
    if (!triple && source[index] === quote) {
      return { kind: isBytes ? TokenKind.Bytes : TokenKind.String, stop: index + 1, valid: true };
    }
    if (!raw && source[index] === "\\") {
      if (!isValidEscape(source, index + 1)) {
        return invalidQuotedLiteral(source, start, index);
      }
      index = advanceEscapedIndex(source, index + 1);
      continue;
    }
    const current = source[index]!;
    if (!triple && (current === "\n" || current === "\r")) {
      return { kind: TokenKind.Invalid, stop: index, valid: false };
    }
    index += 1;
  }
  return { kind: TokenKind.Invalid, stop: index, valid: false };
}

/**
 * invalidQuotedLiteral reproduces CEL's invalid-token span for malformed escapes.
 */
function invalidQuotedLiteral(source: string, _start: number, escapeIndex: number): ScannedString {
  const stop = advanceInvalidEscapeIndex(source, escapeIndex + 1);
  return { kind: TokenKind.Invalid, stop: stop, valid: false };
}

/**
 * advanceEscapedIndex returns the exclusive offset after one validated escape sequence.
 */
function advanceEscapedIndex(source: string, escapeKindIndex: number): number {
  const kind = source[escapeKindIndex]!;
  const index = escapeKindIndex + 1;
  switch (kind) {
    case "x":
    case "X":
      return index + 2;
    case "u":
      return index + 4;
    case "U":
      return index + 8;
    default:
      if (/[0-7]/.test(kind)) {
        return index + 2;
      }
      return index;
  }
}

/**
 * advanceInvalidEscapeIndex returns the exclusive offset after consuming a malformed escape sequence.
 */
function advanceInvalidEscapeIndex(source: string, escapeKindIndex: number): number {
  const kind = source[escapeKindIndex]!;
  if (kind === undefined) {
    return source.length;
  }
  let index = escapeKindIndex + 1;
  if ((kind === "x" || kind === "X") && index < source.length) {
    if (hexDigit.test(source[index] ?? "")) {
      index += 1;
    }
    if (index < source.length) {
      index += 1;
    }
    return index;
  }
  if (kind === "u" || kind === "U") {
    const width = kind === "u" ? 4 : 8;
    for (let i = 0; i < width && index < source.length; i += 1) {
      if (!hexDigit.test(source[index] ?? "")) {
        return index + 1;
      }
      index += 1;
    }
    return index;
  }
  if (/[0-7]/.test(kind)) {
    for (let i = 0; i < 2 && index < source.length; i += 1) {
      if (!/[0-7]/.test(source[index] ?? "")) {
        return index + 1;
      }
      index += 1;
    }
  }
  return index;
}

/**
 * isQuote reports whether a character can open a CEL string literal.
 */
function isQuote(char: string | undefined): boolean {
  return char === `"` || char === `'`;
}

/**
 * isValidEscape reports whether the next escape sequence is legal CEL string syntax.
 */
function isValidEscape(source: string, index: number): boolean {
  const kind = source[index];
  if (!kind) {
    return false;
  }
  if ("abfnrtv'\"\\?".includes(kind)) {
    return true;
  }
  if (kind === "x" || kind === "X") {
    return hexDigit.test(source[index + 1] ?? "") && hexDigit.test(source[index + 2] ?? "");
  }
  if (kind === "u") {
    for (let i = 1; i <= 4; i += 1) {
      if (!hexDigit.test(source[index + i] ?? "")) {
        return false;
      }
    }
    return true;
  }
  if (kind === "U") {
    for (let i = 1; i <= 8; i += 1) {
      if (!hexDigit.test(source[index + i] ?? "")) {
        return false;
      }
    }
    return true;
  }
  if (/[0-7]/.test(kind)) {
    return /[0-7]/.test(source[index + 1] ?? "") && /[0-7]/.test(source[index + 2] ?? "");
  }
  return false;
}
