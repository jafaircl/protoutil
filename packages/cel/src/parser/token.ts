/**
 * TokenKind identifies the lexical token categories used by the CEL parser.
 */
export enum TokenKind {
  Eof = "eof",
  Invalid = "invalid",
  Identifier = "identifier",
  EscapedIdentifier = "escaped_identifier",
  Int = "int",
  Uint = "uint",
  Float = "float",
  String = "string",
  Bytes = "bytes",
  True = "true",
  False = "false",
  Null = "null",
  In = "in",
  Dot = ".",
  Comma = ",",
  Colon = ":",
  Question = "?",
  LParen = "(",
  RParen = ")",
  LBracket = "[",
  RBracket = "]",
  LBrace = "{",
  RBrace = "}",
  Plus = "+",
  Minus = "-",
  Star = "*",
  Slash = "/",
  Percent = "%",
  Bang = "!",
  Less = "<",
  LessEquals = "<=",
  Greater = ">",
  GreaterEquals = ">=",
  EqualsEquals = "==",
  NotEquals = "!=",
  LogicalAnd = "&&",
  LogicalOr = "||",
}

/**
 * Token is a lexical unit with absolute and line/column source coordinates.
 */
export interface Token {
  /**
   * Identifies the lexical category.
   */
  kind: TokenKind;
  /**
   * Preserves the original source slice for the token.
   */
  text: string;
  /**
   * Stores the 1-based source line.
   */
  line: number;
  /**
   * Stores the 0-based column within the source line.
   */
  column: number;
  /**
   * Records the inclusive start byte offset.
   */
  start: number;
  /**
   * Records the exclusive end byte offset.
   */
  stop: number;
}

/**
 * RESERVED_IDS contains identifiers that CEL treats as reserved words.
 */
export const RESERVED_IDS = new Set([
  "as",
  "break",
  "const",
  "continue",
  "else",
  "false",
  "for",
  "function",
  "if",
  "import",
  "in",
  "let",
  "loop",
  "namespace",
  "null",
  "package",
  "return",
  "true",
  "var",
  "void",
  "while",
]);

/**
 * tokenRange converts a token into the offset range expected by AST helpers.
 */
export function tokenRange(token: Token): { start: number; stop: number } {
  return { start: token.start, stop: token.stop };
}
