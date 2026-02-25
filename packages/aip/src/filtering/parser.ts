import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { NullValue } from "@bufbuild/protobuf/wkt";
import {
  type ConstantSchema,
  type Expr_CallSchema,
  type ExprSchema,
  type ParsedExpr,
  ParsedExprSchema,
  type SourceInfoSchema,
} from "../gen/google/api/expr/v1alpha1/syntax_pb.js";
import { type Token, TokenType, tokenize } from "./lexer.js";

export type ExprInit = MessageInitShape<typeof ExprSchema>;
export type ConstantInit = MessageInitShape<typeof ConstantSchema>;
export type Expr_CallInit = MessageInitShape<typeof Expr_CallSchema>;

/**
 * Compute lineOffsets for v1alpha1 SourceInfo.
 * lineOffsets[i] = code point offset of the i-th '\n' character.
 * An empty array means the source has no newlines (single line).
 */
function computeLineOffsets(input: string): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "\n") offsets.push(i);
  }
  return offsets;
}

/**
 * Convert a character offset to a 1-based line and 0-based column,
 * using v1alpha1 lineOffsets (newline positions).
 *
 * Algorithm:
 *   - Line 1 starts at offset 0. It ends at lineOffsets[0] (exclusive) if set.
 *   - Line k starts at lineOffsets[k-2] + 1.
 *   - Binary search for the largest i where lineOffsets[i] < offset.
 *   - line   = i + 2  (1-based, +1 because arrays are 0-based, +1 because
 *                      the line after newline at lineOffsets[i] is line i+2)
 *   - column = offset - (lineOffsets[i] + 1)  (0-based)
 *   If offset ≤ lineOffsets[0] (or no offsets), it's on line 1.
 */
export function offsetToLineCol(
  offset: number,
  lineOffsets: number[],
): { line: number; column: number } {
  if (lineOffsets.length === 0 || offset <= lineOffsets[0]) {
    return { line: 1, column: offset };
  }
  // Binary search for largest index i where lineOffsets[i] < offset
  let lo = 0;
  let hi = lineOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineOffsets[mid] < offset) lo = mid;
    else hi = mid - 1;
  }
  const lineStart = lineOffsets[lo] + 1;
  return { line: lo + 2, column: offset - lineStart };
}

export function mapToObject<K, V>(map: Map<K, V>): Record<string, V> {
  const obj: Record<string, V> = {};
  for (const [k, v] of map) {
    obj[String(k)] = v;
  }
  return obj;
}

class Parser {
  #tokens: Token[];
  #pos: number = 0;
  #positions: Map<bigint, number> = new Map();
  #macroCalls: Map<bigint, ExprInit> = new Map();
  #idCounter: bigint = 1n;

  constructor(private input: string) {
    this.#tokens = tokenize(input);
  }

  private nextId(): bigint {
    return this.#idCounter++;
  }

  public resetIds(): void {
    this.#idCounter = 1n;
    this.#pos = 0;
    this.#positions.clear();
    this.#macroCalls.clear();
  }

  private peek(skip = 0): Token {
    let p = this.#pos;
    let seen = 0;
    while (p < this.#tokens.length) {
      const t = this.#tokens[p];
      if (t.type === TokenType.WS) {
        p++;
        continue;
      }
      if (seen === skip) return t;
      seen++;
      p++;
    }
    return { type: TokenType.EOF, value: "", offset: this.input.length };
  }

  private peekRaw(): Token {
    return this.#tokens[this.#pos] ?? { type: TokenType.EOF, value: "", offset: this.input.length };
  }

  private consume(): Token {
    this.skipWS();
    return (
      this.#tokens[this.#pos++] ?? { type: TokenType.EOF, value: "", offset: this.input.length }
    );
  }

  private consumeRaw(): Token {
    return (
      this.#tokens[this.#pos++] ?? { type: TokenType.EOF, value: "", offset: this.input.length }
    );
  }

  private skipWS(): void {
    while (this.#pos < this.#tokens.length && this.#tokens[this.#pos].type === TokenType.WS)
      this.#pos++;
  }

  private expect(tt: TokenType): Token {
    const tok = this.consume();
    if (tok.type !== tt) {
      throw new ParseError(
        `Expected ${TokenType[tt]}, got ${TokenType[tok.type]} ("${tok.value}") at offset ${tok.offset}`,
        tok.offset,
      );
    }
    return tok;
  }

  private register(id: bigint, offset: number): void {
    this.#positions.set(id, offset);
  }

  parse(): ParsedExpr {
    this.skipWS();
    const expr =
      this.peek().type === TokenType.EOF ? this.makeIdent("", 0) : this.parseExpression();
    this.skipWS();

    const sourceInfo: MessageInitShape<typeof SourceInfoSchema> = {
      syntaxVersion: "cel1",
      location: "<input>",
      lineOffsets: computeLineOffsets(this.input),
      positions: mapToObject(this.#positions),
      macroCalls: mapToObject(this.#macroCalls),
      extensions: [],
    };

    return create(ParsedExprSchema, { expr, sourceInfo });
  }

  private parseExpression(): ExprInit {
    let left = this.parseSequence();
    while (this.peekNonWS() === TokenType.AND) {
      this.skipWS();
      const t = this.consumeRaw();
      left = this.makeCall("_&&_", [left, this.parseSequence()], t.offset);
    }
    return left;
  }

  private parseSequence(): ExprInit {
    let left = this.parseFactor();
    while (this.hasImplicitAndAhead()) {
      const offset = this.peek().offset;
      left = this.makeCall("_&&_", [left, this.parseFactor()], offset);
    }
    return left;
  }

  private parseFactor(): ExprInit {
    let left = this.parseTerm();
    while (this.peekNonWS() === TokenType.OR) {
      this.skipWS();
      const t = this.consumeRaw();
      left = this.makeCall("_||_", [left, this.parseTerm()], t.offset);
    }
    return left;
  }

  private parseTerm(): ExprInit {
    this.skipWS();
    const raw = this.peekRaw();
    if (raw.type === TokenType.NOT) {
      this.consumeRaw();
      this.skipWS();
      return this.makeCall("@not", [this.parseSimple()], raw.offset);
    }
    if (raw.type === TokenType.MINUS) {
      const saved = this.#pos;
      this.consumeRaw();
      const after = this.peekRaw();
      if (after.type === TokenType.TEXT) {
        const num = parseNumber(`-${after.value}`);
        if (num !== undefined) {
          this.consumeRaw();
          return this.makeConst(num, raw.offset);
        }
      }
      this.#pos = saved;
      this.consumeRaw();
      this.skipWS();
      return this.makeCall("@not", [this.parseSimple()], raw.offset);
    }
    return this.parseSimple();
  }

  private parseSimple(): ExprInit {
    if (this.peek().type === TokenType.LPAREN) return this.parseComposite();
    return this.parseRestriction();
  }

  private parseComposite(): ExprInit {
    this.expect(TokenType.LPAREN);
    this.skipWS();
    const expr = this.parseExpression();
    this.skipWS();
    this.expect(TokenType.RPAREN);
    return expr;
  }

  private parseRestriction(): ExprInit {
    const comp = this.parseComparable();
    const op = this.peekComparator();
    if (!op) return comp;
    this.consume();
    return this.makeCall(comparatorToFunction(op), [comp, this.parseArg()], Number(comp.id));
  }

  private parseComparable(): ExprInit {
    if (this.isStandaloneFunction()) return this.parseTopLevelFunction();
    return this.parseDotChain(this.parseBaseValue());
  }

  private parseDotChain(base: ExprInit): ExprInit {
    let current = base;
    while (this.peekRaw().type === TokenType.DOT) {
      const dotOffset = this.peekRaw().offset;
      const look = this.lookaheadDotChain();
      if (look.endsInCall) {
        this.consumeRaw(); // DOT
        const names: string[] = [];
        for (let si = 0; si < look.segments.length; si++) {
          if (si > 0) this.consumeRaw(); // DOT
          names.push(this.consumeRaw().value);
        }
        const args = this.parseArgList();
        if (names.length === 1) {
          current = this.makeCall(names[0], args, dotOffset, current);
        } else {
          for (let si = 0; si < names.length - 1; si++) {
            const id = this.nextId();
            this.register(id, dotOffset);
            current = {
              id,
              exprKind: {
                case: "selectExpr",
                value: { operand: current, field: names[si], testOnly: false },
              },
            };
          }
          current = this.makeCall(names[names.length - 1], args, dotOffset, current);
        }
      } else {
        this.consumeRaw(); // DOT
        const fieldTok = this.consumeRaw();
        const id = this.nextId();
        this.register(id, fieldTok.offset);
        current = {
          id,
          exprKind: {
            case: "selectExpr",
            value: { operand: current, field: fieldTok.value, testOnly: false },
          },
        };
      }
    }
    return current;
  }

  private lookaheadDotChain(): { segments: string[]; endsInCall: boolean } {
    const saved = this.#pos;
    const segments: string[] = [];
    while (this.peekRaw().type === TokenType.DOT) {
      this.consumeRaw();
      const t = this.peekRaw();
      if (t.type !== TokenType.TEXT && !isKeyword(t.type)) {
        segments.push(t.value);
        this.consumeRaw();
        break;
      }
      this.consumeRaw();
      segments.push(t.value);
      if (this.peekRaw().type === TokenType.LPAREN) {
        this.#pos = saved;
        return { segments, endsInCall: true };
      }
      if (this.peekRaw().type !== TokenType.DOT) break;
    }
    this.#pos = saved;
    return { segments, endsInCall: false };
  }

  private isStandaloneFunction(): boolean {
    const tok = this.peek();
    if (tok.type !== TokenType.TEXT && !isKeyword(tok.type)) return false;
    return this.peek(1).type === TokenType.LPAREN;
  }

  private parseTopLevelFunction(): ExprInit {
    const t = this.consume();
    return this.makeCall(t.value, this.parseArgList(), t.offset);
  }

  private parseBaseValue(): ExprInit {
    const tok = this.peek();
    if (tok.type === TokenType.UNTERMINATED_STRING) {
      throw new ParseError(`Unterminated string literal at offset ${tok.offset}`, tok.offset);
    }
    if (tok.type === TokenType.MINUS) {
      this.consume();
      const numTok = this.peek();
      if (numTok.type === TokenType.TEXT) {
        const num = parseNumber(`-${numTok.value}`);
        if (num !== undefined) {
          this.consume();
          return this.makeConst(num, tok.offset);
        }
      }
      const id = this.nextId();
      this.register(id, tok.offset);
      return { id, exprKind: { case: "identExpr", value: { name: "-" } } };
    }
    if (tok.type === TokenType.STRING) {
      this.consume();
      const id = this.nextId();
      this.register(id, tok.offset);
      return {
        id,
        exprKind: {
          case: "constExpr",
          value: {
            constantKind: {
              case: "stringValue",
              value: tok.value,
            },
          },
        },
      };
    }
    if (tok.type === TokenType.TEXT || isKeyword(tok.type)) {
      this.consume();
      const lit = parseTextLiteral(tok.value);
      const id = this.nextId();
      this.register(id, tok.offset);
      if (lit !== undefined) {
        return { id, exprKind: { case: "constExpr", value: lit } };
      }
      return { id, exprKind: { case: "identExpr", value: { name: tok.value } } };
    }
    throw new ParseError(
      `Unexpected token ${TokenType[tok.type]} ("${tok.value}") at offset ${tok.offset}`,
      tok.offset,
    );
  }

  private parseArgList(): ExprInit[] {
    this.expect(TokenType.LPAREN);
    this.skipWS();
    const args: ExprInit[] = [];
    if (this.peek().type !== TokenType.RPAREN) {
      args.push(this.parseArg());
      this.skipWS();
      while (this.peek().type === TokenType.COMMA) {
        this.consume();
        this.skipWS();
        args.push(this.parseArg());
        this.skipWS();
      }
    }
    this.expect(TokenType.RPAREN);
    return args;
  }

  private parseArg(): ExprInit {
    if (this.peek().type === TokenType.LPAREN) return this.parseComposite();
    return this.parseComparable();
  }

  // ── Look-ahead ────────────────────────────────────────────────────────────

  private peekNonWS(): TokenType {
    const saved = this.#pos;
    this.skipWS();
    const t = this.peekRaw().type;
    this.#pos = saved;
    return t;
  }

  private hasImplicitAndAhead(): boolean {
    if (this.peekRaw().type !== TokenType.WS) return false;
    const saved = this.#pos;
    this.skipWS();
    const next = this.peekRaw().type;
    this.#pos = saved;
    return (
      next !== TokenType.EOF &&
      next !== TokenType.AND &&
      next !== TokenType.OR &&
      next !== TokenType.RPAREN
    );
  }

  private peekComparator(): TokenType | undefined {
    const tt = this.peek().type;
    switch (tt) {
      case TokenType.LESS_EQUALS:
      case TokenType.LESS_THAN:
      case TokenType.GREATER_EQUALS:
      case TokenType.GREATER_THAN:
      case TokenType.NOT_EQUALS:
      case TokenType.EQUALS:
      case TokenType.HAS:
        return tt;
      default:
        return undefined;
    }
  }

  private makeCall(name: string, args: ExprInit[], offset: number, target?: ExprInit): ExprInit {
    const id = this.nextId();
    this.register(id, offset);
    const callValue: Expr_CallInit = { function: name, args };
    if (target !== undefined) callValue.target = target;
    return { id, exprKind: { case: "callExpr", value: callValue } };
  }

  private makeIdent(name: string, offset: number): ExprInit {
    const id = this.nextId();
    this.register(id, offset);
    return { id, exprKind: { case: "identExpr", value: { name } } };
  }

  private makeConst(c: ConstantInit, offset: number): ExprInit {
    const id = this.nextId();
    this.register(id, offset);
    return { id, exprKind: { case: "constExpr", value: c } };
  }
}

function isKeyword(tt: TokenType): boolean {
  return tt === TokenType.AND || tt === TokenType.OR || tt === TokenType.NOT;
}

function parseNumber(s: string): ConstantInit | undefined {
  if (/^\d+u$/i.test(s)) {
    try {
      return {
        constantKind: {
          case: "uint64Value",
          value: BigInt(s.slice(0, -1)),
        },
      };
    } catch {
      return undefined;
    }
  }
  if (/^-?\d+\.\d*([eE][+-]?\d+)?$/.test(s) || /^-?\d+[eE][+-]?\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isNaN(n)) {
      return {
        constantKind: {
          case: "doubleValue",
          value: n,
        },
      };
    }
  }
  if (/^-?\d+$/.test(s)) {
    try {
      return {
        constantKind: {
          case: "int64Value",
          value: BigInt(s),
        },
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseTextLiteral(s: string): ConstantInit | undefined {
  if (s === "true") {
    return {
      constantKind: {
        case: "boolValue",
        value: true,
      },
    };
  }
  if (s === "false") {
    return {
      constantKind: {
        case: "boolValue",
        value: false,
      },
    };
  }
  if (s === "null") {
    return {
      constantKind: {
        case: "nullValue",
        value: NullValue.NULL_VALUE,
      },
    };
  }
  return parseNumber(s);
}

function comparatorToFunction(tt: TokenType): string {
  switch (tt) {
    case TokenType.LESS_EQUALS:
      return "_<=_";
    case TokenType.LESS_THAN:
      return "_<_";
    case TokenType.GREATER_EQUALS:
      return "_>=_";
    case TokenType.GREATER_THAN:
      return "_>_";
    case TokenType.NOT_EQUALS:
      return "_!=_";
    case TokenType.EQUALS:
      return "_==_";
    case TokenType.HAS:
      return "@in";
    default:
      throw new Error("Not a comparator");
  }
}

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly offset: number = 0,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Parse a CEL/AIP-160 filter string.
 * Returns a ParsedExpr with v1alpha1 SourceInfo (lineOffsets = newline positions).
 */
export function parse(input: string): ParsedExpr {
  return new Parser(input).parse();
}
