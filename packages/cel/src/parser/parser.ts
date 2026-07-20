import { type AST, ast, type EntryExpr, type Expr } from "../common/ast/index.js";
import { type Errors, errorsValue } from "../common/errors.js";
import * as operators from "../common/operators.js";
import { type Source, textSource } from "../common/source.js";
import type { Constant } from "../gen/cel/expr/syntax_pb.js";
import { ParseErrors } from "./errors.js";
import { ParserHelper } from "./helper.js";
import { Lexer } from "./lexer.js";
import { AccumulatorName, HiddenAccumulatorName, lookupMacro } from "./macro.js";
import {
  type ExprHelper,
  type ParserConfig,
  type ParserOptions,
  parserOptions,
} from "./options.js";
import { ParserRecoveryState } from "./recovery.js";
import { RESERVED_IDS, type Token, TokenKind, tokenRange } from "./token.js";
import { unescape as unescapeString } from "./unescape.js";

/**
 * Parser parses CEL source into an AST and source info.
 */
export class Parser {
  private readonly options: ParserOptions;

  /**
   * Creates a parser with the provided configuration overrides.
   */
  constructor(config: ParserConfig = {}) {
    this.options = parserOptions(config);
  }

  /**
   * Parses source text into a CEL AST and source info.
   */
  public parse(source: string): AST {
    const result = this.tryParse(source);
    if (result.errors) {
      throw new Error(result.errors.toDisplayString());
    }
    return result.ast;
  }

  /**
   * Tries to parse source text into a CEL AST and optional diagnostics.
   */
  public tryParse(source: string): ParseResult {
    return this.tryParseSource(textSource(source));
  }

  /**
   * Parses a lower-level Source into a CEL AST and source info.
   */
  public parseSource(source: Source): AST {
    const result = this.tryParseSource(source);
    if (result.errors) {
      throw new Error(result.errors.toDisplayString());
    }
    return result.ast;
  }

  /**
   * Tries to parse a lower-level Source into a CEL AST and optional diagnostics.
   */
  public tryParseSource(source: Source): ParseResult {
    const sourceText = source.content();
    const errs = errorsValue(source);
    const helper = new ParserHelper(
      source,
      this.options.enableHiddenAccumulatorName ? HiddenAccumulatorName : AccumulatorName,
    );
    const parseErrors = new ParseErrors(errs);
    const lexed = new Lexer(sourceText).tokenize();
    if (lexed.codePointCount > this.options.expressionSizeCodePointLimit) {
      parseErrors.internalError(
        `expression code point size exceeds limit: size: ${lexed.codePointCount}, limit ${this.options.expressionSizeCodePointLimit}`,
      );
      return parseResult(ast(helper.exprFactory.unspecified(1), helper.sourceInfo), errs);
    }
    const impl = new ParseImpl(lexed.tokens, helper, parseErrors, this.options);
    const expr = impl.parse();
    return parseResult(ast(expr, helper.sourceInfo), errs);
  }
}

/**
 * ParseResult contains the local AST and optional parse diagnostics.
 */
export interface ParseResult {
  ast: AST;
  errors?: Errors;
}

/**
 * parser creates a parser with the provided configuration overrides.
 */
export function parser(config: ParserConfig = {}): Parser {
  return new Parser(config);
}

/**
 * parse parses source text with the optional provided parser configuration.
 */
export function parse(source: string, config: ParserConfig = {}): AST {
  return parser(config).parse(source);
}

/**
 * tryParse parses source text with the optional provided parser configuration and returns diagnostics instead of throwing.
 */
export function tryParse(source: string, config: ParserConfig = {}): ParseResult {
  return parser(config).tryParse(source);
}

/**
 * parseSource parses a lower-level Source with the optional provided parser configuration.
 */
export function parseSource(source: Source, config: ParserConfig = {}): AST {
  return parser(config).parseSource(source);
}

/**
 * tryParseSource parses a lower-level Source with the optional provided parser configuration and returns diagnostics.
 */
export function tryParseSource(source: Source, config: ParserConfig = {}): ParseResult {
  return parser(config).tryParseSource(source);
}

/**
 * parseResult builds the public parser result shape and omits the error field on success.
 */
function parseResult(astValue: AST, errors: Errors): ParseResult {
  if (errors.getErrors().length === 0) {
    return { ast: astValue };
  }
  return { ast: astValue, errors };
}

/**
 * normalizeParseSource adapts a string input to the default CEL source wrapper.
 */
/**
 * ParseImpl owns the recursive-descent CEL parsing logic over a token stream.
 */
class ParseImpl {
  private index = 0;
  private recursionDepth = 0;
  private reportedRecursionError = false;
  private expressionComplexity = 0;
  private groupDepth = 0;
  private nestedConstructionSeen = false;
  private syntaxErrorCount = 0;
  private readonly recoveryState: ParserRecoveryState;

  /**
   * Binds the parser implementation to a token stream, helper set, and parse options.
   */
  constructor(
    private readonly tokens: Token[],
    private readonly helper: ParserHelper,
    private readonly errors: ParseErrors,
    private readonly options: ParserOptions,
  ) {
    this.recoveryState = new ParserRecoveryState(options);
  }

  /**
   * Parses the token stream and returns the resulting expression tree.
   */
  public parse(): Expr {
    try {
      // cel-go can report a lookahead-limit error before the main parse consumes any valid
      // expression. We preserve that ordering by scanning the leading malformed prefix once here.
      this.preflightRecoveryLookahead();
      const expr = this.parseExpr();
      let recovering = false;
      while (!this.isAtEnd()) {
        const token = this.peek();
        if (token.kind === TokenKind.Invalid) {
          if (recovering) {
            if (this.recoveryState.noteTrailingInvalid() === "limit-reached") {
              this.errors.internalError(
                `error recovery token lookahead limit exceeded: ${this.options.errorRecoveryTokenLookaheadLimit}`,
              );
            }
          }
          this.syntaxTokenRecognitionError(token);
          this.advance();
          if (this.recoveryState.shouldStopAfterInvalid()) {
            this.recoveryState.clearStopAfterInvalid();
            break;
          }
          recovering = true;
          continue;
        }
        if (
          recovering &&
          token.kind === TokenKind.Identifier &&
          this.peekNext().kind === TokenKind.Invalid
        ) {
          this.advance();
          continue;
        }
        if (recovering) {
          if (
            token.kind === TokenKind.Int ||
            token.kind === TokenKind.Uint ||
            token.kind === TokenKind.Float ||
            token.kind === TokenKind.String ||
            token.kind === TokenKind.Bytes
          ) {
            this.syntaxMismatched(token, "<EOF>");
            if (this.recoveryState.hasReportedLookaheadLimit()) {
              // Once the lookahead limit has already been exceeded we stop trying to build a useful
              // trailing expression. Instead we fast-forward to the next invalid lexer token and let
              // the normal invalid-token path report it, which keeps recovery token-driven rather
              // than inspecting token text in the parser.
              this.advance();
              while (!this.isAtEnd() && this.peek().kind !== TokenKind.Invalid) {
                this.advance();
              }
              this.recoveryState.stopAfterNextInvalid();
              continue;
            }
            this.advance();
            continue;
          } else {
            if (token.kind === TokenKind.RBrace && this.syntaxErrorCount > 0) {
              this.syntaxExtraneous(token, "<EOF>");
            } else {
              this.syntaxExtraneous(token, "<EOF>");
            }
          }
        } else {
          if (token.kind === TokenKind.RBrace && this.syntaxErrorCount > 0) {
            this.syntaxExtraneous(token, "<EOF>");
          } else {
            this.syntaxMismatched(token, "<EOF>");
          }
        }
        break;
      }
      return expr;
    } catch (error) {
      if (error instanceof AbortParseError) {
        return this.helper.exprFactory.unspecified(this.helper.nextId());
      }
      throw error;
    }
  }

  /**
   * parseExpr parses the full expression grammar including ternary conditionals.
   */
  private parseExpr(): Expr {
    this.checkRecursion();
    const lhs = this.parseConditionalOr();
    if (!this.match(TokenKind.Question)) {
      this.recursionDepth -= 1;
      return lhs;
    }
    const op = this.previous();
    const opId = this.helper.id(tokenRange(op));
    const ifTrue = this.parseConditionalOr();
    if (this.check(TokenKind.Eof) && this.syntaxErrorCount > 0) {
      this.emitSyntaxError(
        this.helper.locationForRange(tokenRange(this.peek())),
        `error recovery attempt limit exceeded: ${this.recoveryState.attemptLimit()}`,
      );
      this.recursionDepth -= 1;
      return this.helper.exprFactory.unspecified(opId);
    }
    this.consume(TokenKind.Colon);
    const ifFalse = this.parseExpr();
    this.recursionDepth -= 1;
    return this.helper.exprFactory.call(opId, operators.Conditional, lhs, ifTrue, ifFalse);
  }

  /**
   * parseConditionalOr parses left-associated logical-or chains.
   */
  private parseConditionalOr(): Expr {
    const expr = this.parseConditionalAnd();
    const terms = [expr];
    const opIds: number[] = [];
    while (this.match(TokenKind.LogicalOr)) {
      const op = this.previous();
      terms.push(this.parseConditionalAnd());
      opIds.push(this.helper.id(tokenRange(op)));
    }
    return this.balanceLogic(operators.LogicalOr, terms, opIds);
  }

  /**
   * parseConditionalAnd parses left-associated logical-and chains.
   */
  private parseConditionalAnd(): Expr {
    const expr = this.parseRelation();
    const terms = [expr];
    const opIds: number[] = [];
    while (this.match(TokenKind.LogicalAnd)) {
      const op = this.previous();
      terms.push(this.parseRelation());
      opIds.push(this.helper.id(tokenRange(op)));
    }
    return this.balanceLogic(operators.LogicalAnd, terms, opIds);
  }

  /**
   * parseRelation parses comparison and membership operators.
   */
  private parseRelation(): Expr {
    let expr = this.parseAdditive();
    let chainDepth = 0;
    while (
      this.match(
        TokenKind.Less,
        TokenKind.LessEquals,
        TokenKind.Greater,
        TokenKind.GreaterEquals,
        TokenKind.EqualsEquals,
        TokenKind.NotEquals,
        TokenKind.In,
      )
    ) {
      chainDepth += 1;
      this.checkChainDepth(chainDepth);
      const op = this.previous();
      const opId = this.helper.id(tokenRange(op));
      const rhs = this.parseAdditive();
      expr = this.globalCallOrMacro(opId, this.operatorName(op), expr, rhs);
    }
    return expr;
  }

  /**
   * parseAdditive parses left-associated addition and subtraction sequences.
   */
  private parseAdditive(): Expr {
    let expr = this.parseMultiplicative();
    let chainDepth = 0;
    while (this.match(TokenKind.Plus, TokenKind.Minus)) {
      chainDepth += 1;
      this.checkChainDepth(chainDepth);
      const op = this.previous();
      const opId = this.helper.id(tokenRange(op));
      const rhs = this.parseMultiplicative();
      expr = this.globalCallOrMacro(opId, this.operatorName(op), expr, rhs);
    }
    return expr;
  }

  /**
   * parseMultiplicative parses left-associated multiplication, division, and modulo sequences.
   */
  private parseMultiplicative(): Expr {
    let expr = this.parseUnary();
    let chainDepth = 0;
    while (this.match(TokenKind.Star, TokenKind.Slash, TokenKind.Percent)) {
      chainDepth += 1;
      this.checkChainDepth(chainDepth);
      const op = this.previous();
      const opId = this.helper.id(tokenRange(op));
      const rhs = this.parseUnary();
      expr = this.globalCallOrMacro(opId, this.operatorName(op), expr, rhs);
    }
    return expr;
  }

  /**
   * parseUnary parses prefix logical-not and numeric-negation operators.
   */
  private parseUnary(): Expr {
    if (this.match(TokenKind.Bang)) {
      const op = this.previous();
      const count = 1 + this.consumeRepeated(TokenKind.Bang);
      if (count % 2 === 0) {
        return this.parseMember();
      }
      const opId = this.helper.id(tokenRange(op));
      const target = this.parseMember();
      return this.globalCallOrMacro(opId, operators.LogicalNot, target);
    }
    if (this.match(TokenKind.Minus)) {
      const op = this.previous();
      const count = 1 + this.consumeRepeated(TokenKind.Minus);
      if (count > 1 && this.check(TokenKind.Eof)) {
        const stop = tokenRange(this.previous()).stop;
        this.syntaxNoViableAlternative(this.helper.locationForRange({ start: stop, stop }), "-");
        this.syntaxMismatched(this.peek(), primaryExpectedDescription());
        return this.helper.exprFactory.unspecified(this.helper.id(tokenRange(op)));
      }
      if (count % 2 !== 0 && this.check(TokenKind.Int)) {
        const token = this.advance();
        try {
          return this.helper.literalExpr(
            { start: tokenRange(op).start, stop: tokenRange(token).stop },
            parseIntLiteral(`-${token.text}`),
          );
        } catch {
          this.report(token, "invalid int literal");
          return this.helper.literalExpr(
            { start: tokenRange(op).start, stop: tokenRange(token).stop },
            0n,
          );
        }
      }
      if (count % 2 !== 0 && this.check(TokenKind.Float)) {
        const token = this.advance();
        const value = Number(`-${token.text}`);
        if (!Number.isFinite(value)) {
          this.report(token, "invalid double literal");
          return this.helper.literalExpr(
            { start: tokenRange(op).start, stop: tokenRange(token).stop },
            0,
          );
        }
        return this.helper.literalExpr(
          { start: tokenRange(op).start, stop: tokenRange(token).stop },
          value,
        );
      }
      if (count % 2 === 0) {
        return this.parseMember();
      }
      const opId = this.helper.id(tokenRange(op));
      const target = this.parseMember();
      return this.globalCallOrMacro(opId, operators.Negate, target);
    }
    return this.parseMember();
  }

  /**
   * parseMember parses postfix member selection, indexing, and receiver calls.
   */
  private parseMember(): Expr {
    let expr = this.parsePrimary();
    let chainDepth = 0;
    while (true) {
      if (this.match(TokenKind.Dot)) {
        chainDepth += 1;
        this.checkChainDepth(chainDepth);
        const dot = this.previous();
        const optional = this.match(TokenKind.Question);
        if (
          this.peek().kind === TokenKind.Identifier &&
          this.peekNext().kind === TokenKind.LParen
        ) {
          const id = this.advance();
          const open = this.advance();
          const callId = this.helper.id(tokenRange(open));
          const args = this.parseDelimited(TokenKind.RParen, () => this.parseExpr());
          expr = this.receiverCallOrMacro(callId, id.text, expr, args);
          continue;
        }
        if (this.peek().kind === TokenKind.String) {
          const token = this.peek();
          this.syntaxNoViableAlternative(
            this.helper.locationForRange(tokenRange(token)),
            `.${token.text}`,
          );
          this.advance();
          return expr;
        }
        if (this.peek().kind === TokenKind.Invalid) {
          // Invalid tokens after `.` still need to leave the parser in a state where a following
          // identifier can be attached as a best-effort select, matching cel-go recovery.
          this.syntaxTokenRecognitionError(this.peek());
          this.advance();
          if (this.check(TokenKind.Identifier) || this.check(TokenKind.EscapedIdentifier)) {
            const id = this.advance();
            expr = this.helper.exprFactory.select(
              this.helper.id(tokenRange(dot)),
              expr,
              this.normalizeIdent(id),
            );
          }
          continue;
        }
        if (!this.check(TokenKind.Identifier) && !this.check(TokenKind.EscapedIdentifier)) {
          this.syntaxMismatched(this.peek(), "IDENTIFIER");
          if (!this.check(TokenKind.Eof)) {
            this.advance();
          }
          return expr;
        }
        const id = this.advance();
        const field = this.normalizeIdent(id);
        if (optional) {
          if (!this.options.enableOptionalSyntax) {
            const errorId = this.helper.id(tokenRange(dot));
            this.errors.reportErrorAtId(
              errorId,
              this.helper.locationForRange(tokenRange(dot)),
              "unsupported syntax '.?'",
            );
            continue;
          }
          expr = this.helper.globalCallExpr(
            tokenRange(dot),
            operators.OptSelect,
            expr,
            this.helper.literalExpr(tokenRange(id), field),
          );
          continue;
        }
        expr = this.helper.exprFactory.select(this.helper.id(tokenRange(dot)), expr, field);
        continue;
      }
      if (this.match(TokenKind.LBracket)) {
        chainDepth += 1;
        this.checkChainDepth(chainDepth);
        const open = this.previous();
        const opId = this.helper.id(tokenRange(open));
        const optional = this.match(TokenKind.Question);
        const index = this.parseExpr();
        this.consume(TokenKind.RBracket);
        if (optional && !this.options.enableOptionalSyntax) {
          this.errors.reportErrorAtId(
            opId,
            this.helper.locationForRange(tokenRange(open)),
            "unsupported syntax '[?'",
          );
          continue;
        }
        expr = this.globalCallOrMacro(
          opId,
          optional ? operators.OptIndex : operators.Index,
          expr,
          index,
        );
        continue;
      }
      break;
    }
    return expr;
  }

  /**
   * parsePrimary parses literals, names, grouped expressions, and literal constructors.
   */
  private parsePrimary(): Expr {
    if (this.match(TokenKind.LParen)) {
      this.nestedConstructionSeen = true;
      this.groupDepth += 1;
      if (this.check(TokenKind.RParen)) {
        const token = this.advance();
        this.groupDepth -= 1;
        this.syntaxMismatched(token, primaryExpectedDescription());
        return this.helper.exprFactory.unspecified(this.helper.id(tokenRange(token)));
      }
      if (this.check(TokenKind.Eof)) {
        this.groupDepth -= 1;
        this.syntaxMismatched(this.peek(), primaryExpectedDescription());
        return this.helper.exprFactory.unspecified(this.helper.nextId());
      }
      const expr = this.parseExpr();
      this.consume(TokenKind.RParen);
      this.groupDepth -= 1;
      return expr;
    }
    if (this.match(TokenKind.LBracket)) {
      this.nestedConstructionSeen = true;
      this.groupDepth += 1;
      const open = this.previous();
      const listId = this.helper.id(tokenRange(open));
      const elements: Expr[] = [];
      const optionalIndices: number[] = [];
      if (!this.check(TokenKind.RBracket)) {
        let index = 0;
        do {
          const optional = this.match(TokenKind.Question);
          if (optional && !this.options.enableOptionalSyntax) {
            this.report(this.previous(), "unsupported syntax '?'");
          }
          elements.push(this.parseExpr());
          if (optional) {
            optionalIndices.push(index);
          }
          index += 1;
        } while (this.match(TokenKind.Comma) && !this.check(TokenKind.RBracket));
      }
      this.consume(TokenKind.RBracket);
      this.groupDepth -= 1;
      return this.helper.exprFactory.list(listId, elements, optionalIndices);
    }
    if (this.match(TokenKind.LBrace)) {
      this.nestedConstructionSeen = true;
      this.groupDepth += 1;
      const open = this.previous();
      const mapId = this.helper.id(tokenRange(open));
      const entries: EntryExpr[] = [];
      if (this.check(TokenKind.Eof)) {
        this.groupDepth -= 1;
        this.syntaxMismatched(this.peek(), mapEntryExpectedDescription());
        return this.helper.exprFactory.map(mapId, entries);
      }
      if (!this.check(TokenKind.RBrace)) {
        do {
          const optional = this.match(TokenKind.Question);
          if (optional && !this.options.enableOptionalSyntax) {
            this.report(this.previous(), "unsupported syntax '?'");
          }
          if (this.check(TokenKind.Colon)) {
            this.syntaxExtraneous(this.peek(), mapEntryExpectedDescription());
            this.advance();
          }
          const entryId = this.helper.nextId();
          const key = this.parseExpr();
          if (!this.check(TokenKind.Colon)) {
            this.syntaxMismatched(this.peek(), "':'");
            break;
          }
          const colon = this.advance();
          this.helper.assignIdRange(entryId, tokenRange(colon));
          const value = this.parseExpr();
          entries.push(this.helper.exprFactory.mapEntry(entryId, key, value, optional));
        } while (this.match(TokenKind.Comma) && !this.check(TokenKind.RBrace));
      }
      this.consume(TokenKind.RBrace);
      this.groupDepth -= 1;
      return this.helper.exprFactory.map(mapId, entries);
    }
    if (this.match(TokenKind.Dot, TokenKind.Identifier)) {
      const first = this.previous();
      const leadingDot = first.kind === TokenKind.Dot;
      if (leadingDot && this.check(TokenKind.Eof)) {
        return this.helper.exprFactory.unspecified(this.helper.id(tokenRange(first)));
      }
      if (leadingDot && this.check(TokenKind.Invalid)) {
        const invalid = this.advance();
        this.syntaxTokenRecognitionError(invalid);
        this.syntaxNoViableAlternative(
          this.helper.locationForRange({
            start: Math.max(tokenRange(invalid).start, tokenRange(invalid).stop - 1),
            stop: Math.max(tokenRange(invalid).start, tokenRange(invalid).stop - 1),
          }),
          ".",
        );
        return this.helper.exprFactory.unspecified(this.helper.id(tokenRange(first)));
      }
      const id = leadingDot ? this.consume(TokenKind.Identifier) : first;
      const typeName = this.lookaheadTypeName(
        leadingDot ? 2 : 1,
        `${leadingDot ? "." : ""}${id.text}`,
      );
      if (typeName) {
        // Struct literals reuse the already-consumed leading identifier path once we confirm a `{`.
        this.index = typeName.nextIndex;
        this.nestedConstructionSeen = true;
        this.groupDepth += 1;
        const open = this.consume(TokenKind.LBrace);
        const structId = this.helper.id(tokenRange(open));
        const fields: EntryExpr[] = [];
        let consumeClose = true;
        if (!this.check(TokenKind.RBrace)) {
          do {
            const optional = this.match(TokenKind.Question);
            if (optional && !this.options.enableOptionalSyntax) {
              this.report(this.previous(), "unsupported syntax '?'");
            }
            if (!this.check(TokenKind.Identifier) && !this.check(TokenKind.EscapedIdentifier)) {
              if (optional) {
                this.syntaxMismatched(this.peek(), "{IDENTIFIER, ESC_IDENTIFIER}");
                consumeClose = false;
                if (!this.check(TokenKind.Eof)) {
                  this.advance();
                }
                break;
              }
              if (this.check(TokenKind.Eof)) {
                consumeClose = false;
                break;
              }
              if (this.nextSignificantToken().kind === TokenKind.Eof) {
                this.syntaxMismatched(this.peek(), "{'}', ',', '?', IDENTIFIER, ESC_IDENTIFIER}");
                if (!this.check(TokenKind.Eof)) {
                  this.advance();
                }
                consumeClose = false;
                break;
              }
              this.syntaxExtraneous(this.peek(), "{'}', ',', '?', IDENTIFIER, ESC_IDENTIFIER}");
              if (this.check(TokenKind.Eof)) {
                consumeClose = false;
                break;
              }
              this.advance();
              if (!this.check(TokenKind.Identifier) && !this.check(TokenKind.EscapedIdentifier)) {
                continue;
              }
            }
            const fieldToken = this.advance();
            const fieldName = this.normalizeIdent(fieldToken);
            const fieldId = this.helper.id(tokenRange(fieldToken));
            if (!this.check(TokenKind.Colon)) {
              this.syntaxMismatched(this.peek(), "':'");
              break;
            }
            this.advance();
            const value = this.parseExpr();
            fields.push(this.helper.exprFactory.structField(fieldId, fieldName, value, optional));
          } while (this.match(TokenKind.Comma) && !this.check(TokenKind.RBrace));
        }
        if (consumeClose) {
          this.consume(TokenKind.RBrace);
        }
        this.groupDepth -= 1;
        return this.helper.exprFactory.struct(structId, typeName.name, fields);
      }
      if (this.match(TokenKind.LParen)) {
        const open = this.previous();
        const callId = this.helper.id(tokenRange(open));
        const args = this.parseDelimited(TokenKind.RParen, () => this.parseExpr());
        return this.globalCallOrMacro(callId, `${leadingDot ? "." : ""}${id.text}`, ...args);
      }
      if (RESERVED_IDS.has(id.text)) {
        this.report(id, `reserved identifier: ${id.text}`);
      }
      return this.helper.identExpr(tokenRange(id), `${leadingDot ? "." : ""}${id.text}`);
    }
    if (this.match(TokenKind.String)) {
      const token = this.previous();
      try {
        return this.helper.literalExpr(tokenRange(token), unescapeString(token.text, false));
      } catch (error) {
        this.report(token, (error as Error).message);
        return this.helper.literalExpr(tokenRange(token), token.text);
      }
    }
    if (this.match(TokenKind.Bytes)) {
      const token = this.previous();
      try {
        return this.helper.literalExpr(
          tokenRange(token),
          // CEL bytes literals are stored as UTF-8-decoded bytes after escape processing.
          new Uint8Array(
            [...unescapeString(token.text.slice(1), true)].map((c) => c.codePointAt(0)!),
          ),
        );
      } catch (error) {
        this.report(token, (error as Error).message);
        return this.helper.literalExpr(tokenRange(token), new Uint8Array());
      }
    }
    if (this.match(TokenKind.True)) {
      return this.helper.literalExpr(tokenRange(this.previous()), true);
    }
    if (this.match(TokenKind.False)) {
      return this.helper.literalExpr(tokenRange(this.previous()), false);
    }
    if (this.match(TokenKind.Null)) {
      return this.helper.literalExpr(tokenRange(this.previous()), null);
    }
    if (this.match(TokenKind.Int)) {
      const token = this.previous();
      try {
        return this.helper.literalExpr(tokenRange(token), parseIntLiteral(token.text));
      } catch {
        this.report(token, "invalid int literal");
        return this.helper.literalExpr(tokenRange(token), 0n);
      }
    }
    if (this.match(TokenKind.Uint)) {
      const token = this.previous();
      try {
        return this.helper.literalExpr(tokenRange(token), parseUintLiteral(token.text));
      } catch {
        this.report(token, "invalid uint literal");
        return this.helper.literalExpr(tokenRange(token), 0n);
      }
    }
    if (this.match(TokenKind.Float)) {
      const token = this.previous();
      const value = Number(token.text);
      if (!Number.isFinite(value)) {
        this.report(token, "invalid double literal");
        return this.helper.literalExpr(tokenRange(token), 0);
      }
      return this.helper.literalExpr(tokenRange(token), value);
    }
    const token = this.peek();
    const recoverable = this.reportPrimaryToken(token);
    if (token.kind !== TokenKind.Eof) {
      this.advance();
    }
    if (recoverable) {
      const recovered = this.recoverPrimary();
      if (recovered) {
        return recovered;
      }
    }
    return this.helper.exprFactory.unspecified(this.helper.id(tokenRange(token)));
  }

  /**
   * callOrMacro expands a macro call when one matches, otherwise emits a regular call.
   */
  private globalCallOrMacro(exprId: number, name: string, ...args: Expr[]): Expr {
    return this.callOrMacro(exprId, name, undefined, args);
  }

  /**
   * receiverCallOrMacro expands a receiver macro when present, otherwise emits a receiver call.
   */
  private receiverCallOrMacro(exprId: number, name: string, target: Expr, args: Expr[]): Expr {
    return this.callOrMacro(exprId, name, target, args);
  }

  /**
   * callOrMacro expands a macro call when one matches, otherwise emits a regular call.
   */
  private callOrMacro(exprId: number, name: string, target: Expr | undefined, args: Expr[]): Expr {
    const macro = lookupMacro(this.options.macros, name, target !== undefined, args.length);
    if (macro) {
      const helper = this.macroHelper(exprId);
      const expanded = macro.expander(helper, target, args);
      if (expanded === undefined) {
        return target
          ? this.helper.exprFactory.memberCall(exprId, name, target, ...args)
          : this.helper.exprFactory.call(exprId, name, ...args);
      }
      if (expanded instanceof Error) {
        let location = this.helper.locationForId(exprId);
        if (expanded instanceof MacroExpansionError) {
          location =
            expanded.anchor === "stop"
              ? this.helper.locationForIdStopChar(expanded.exprId)
              : this.helper.locationForId(expanded.exprId);
        }
        this.errors.reportErrorAtId(0, location, expanded.message);
        this.helper.deleteId(exprId);
        return this.helper.exprFactory.unspecified(exprId);
      }
      if (this.options.populateMacroCalls) {
        this.helper.addMacroCall(expanded.id(), name, target, args);
      }
      this.helper.deleteId(exprId);
      return expanded;
    }
    return target
      ? this.helper.exprFactory.memberCall(exprId, name, target, ...args)
      : this.helper.exprFactory.call(exprId, name, ...args);
  }

  /**
   * macroHelper exposes parser-consistent AST creation to macro expanders.
   */
  private macroHelper(exprId: number): ExprHelper {
    const helper = this.helper.macroHelper(exprId);
    return {
      copy: (expr) => helper.copy(expr),
      literal: (value) => this.helper.exprFactory.literal(helper.nextMacroId(), value),
      list: (...elems) => this.helper.exprFactory.list(helper.nextMacroId(), elems, []),
      map: (...entries) => this.helper.exprFactory.map(helper.nextMacroId(), entries),
      mapEntry: (key, value, optional) =>
        this.helper.exprFactory.mapEntry(helper.nextMacroId(), key, value, optional),
      struct: (typeName, ...fields) =>
        this.helper.exprFactory.struct(helper.nextMacroId(), typeName, fields),
      structField: (name, value, optional) =>
        this.helper.exprFactory.structField(helper.nextMacroId(), name, value, optional),
      comprehension: (iterRange, iterVar, accuVar, accuInit, condition, step, result) =>
        this.helper.exprFactory.comprehension(
          helper.nextMacroId(),
          iterRange,
          iterVar,
          accuVar,
          accuInit,
          condition,
          step,
          result,
        ),
      ident: (name) => this.helper.exprFactory.ident(helper.nextMacroId(), name),
      accuIdent: () => this.helper.exprFactory.accuIdent(helper.nextMacroId()),
      accuIdentName: () => this.helper.exprFactory.accuIdentName(),
      call: (fn, ...args) => this.helper.exprFactory.call(helper.nextMacroId(), fn, ...args),
      memberCall: (fn, target, ...args) =>
        this.helper.exprFactory.memberCall(helper.nextMacroId(), fn, target, ...args),
      presenceTest: (operand, field) =>
        this.helper.exprFactory.presenceTest(helper.nextMacroId(), operand, field),
      error: (id, message, anchor = "start") => new MacroExpansionError(id, anchor, message),
    };
  }

  /**
   * lookaheadTypeName checks whether the current identifier sequence is a message literal prefix.
   */
  private lookaheadTypeName(
    _offset: number,
    prefix: string,
  ): { name: string; nextIndex: number } | undefined {
    // The parser needs just enough lookahead to distinguish `pkg.Type{...}` from ordinary select
    // chains. Keeping this as token lookahead avoids building an intermediate parse tree.
    let cursor = this.index;
    const names = [prefix];
    while (
      this.tokens[cursor]?.kind === TokenKind.Dot &&
      this.tokens[cursor + 1]?.kind === TokenKind.Identifier
    ) {
      names.push(this.tokens[cursor + 1]!.text);
      cursor += 2;
    }
    if (this.tokens[cursor]?.kind !== TokenKind.LBrace) {
      return undefined;
    }
    return { name: names.join("."), nextIndex: cursor };
  }

  /**
   * balanceLogic builds either a variadic or balanced binary tree for logical chains.
   */
  private balanceLogic(functionName: string, terms: Expr[], opIds: number[]): Expr {
    if (terms.length === 1) {
      return terms[0]!;
    }
    if (this.options.enableVariadicOperatorASTs) {
      return this.helper.exprFactory.call(opIds[0]!, functionName, ...terms);
    }
    // cel-go balances binary logical trees instead of emitting a left-deep chain.
    const build = (lo: number, hi: number): Expr => {
      const mid = Math.floor((lo + hi + 1) / 2);
      const left = mid === lo ? terms[mid]! : build(lo, mid - 1);
      const right = mid === hi ? terms[mid + 1]! : build(mid + 1, hi);
      return this.helper.exprFactory.call(opIds[mid]!, functionName, left, right);
    };
    return build(0, opIds.length - 1);
  }

  /**
   * operatorName maps parser tokens onto CEL operator function names.
   */
  private operatorName(token: Token): string {
    switch (token.kind) {
      case TokenKind.Less:
        return operators.Less;
      case TokenKind.LessEquals:
        return operators.LessEquals;
      case TokenKind.Greater:
        return operators.Greater;
      case TokenKind.GreaterEquals:
        return operators.GreaterEquals;
      case TokenKind.EqualsEquals:
        return operators.Equals;
      case TokenKind.NotEquals:
        return operators.NotEquals;
      case TokenKind.In:
        return operators.In;
      case TokenKind.Plus:
        return operators.Add;
      case TokenKind.Minus:
        return operators.Subtract;
      case TokenKind.Star:
        return operators.Multiply;
      case TokenKind.Slash:
        return operators.Divide;
      case TokenKind.Percent:
        return operators.Modulo;
      default:
        return token.text;
    }
  }

  /**
   * normalizeIdent resolves escaped identifiers and enforces the escape-syntax option.
   */
  private normalizeIdent(token: Token): string {
    if (token.kind === TokenKind.Identifier) {
      return token.text;
    }
    if (token.kind !== TokenKind.EscapedIdentifier) {
      this.report(token, `unexpected token '${token.text}'`);
      return token.text;
    }
    if (!this.options.enableIdentEscapeSyntax) {
      this.report(token, "unsupported syntax: '`'");
      return token.text;
    }
    if (token.text.includes("$")) {
      this.report(token, `unexpected token '${token.text}'`);
    }
    return token.text.slice(1, -1);
  }

  /**
   * parseDelimited parses a comma-delimited sequence terminated by the supplied token kind.
   */
  private parseDelimited<T>(end: TokenKind, parseItem: () => T): T[] {
    const items: T[] = [];
    if (!this.check(end)) {
      do {
        items.push(parseItem());
      } while (this.match(TokenKind.Comma) && !this.check(end));
    }
    this.consume(end);
    return items;
  }

  /**
   * consumeRepeated consumes as many adjacent tokens of the supplied kind as are present.
   */
  private consumeRepeated(kind: TokenKind): number {
    let count = 0;
    while (this.match(kind)) {
      count += 1;
    }
    return count;
  }

  /**
   * report records a parser error at the token's source location.
   */
  private report(token: Token, message: string): void {
    this.errors.reportErrorAtId(0, this.helper.locationForRange(tokenRange(token)), message);
  }

  /**
   * reportPrimaryToken reports a parse error for a token in primary-expression position.
   */
  private reportPrimaryToken(token: Token): boolean {
    if (token.kind === TokenKind.Invalid) {
      this.syntaxTokenRecognitionError(token);
      return true;
    }
    if (token.kind === TokenKind.Eof) {
      this.syntaxMismatched(token, primaryExpectedDescription());
      return false;
    }
    if (token.kind === TokenKind.Dot) {
      this.syntaxNoViableAlternative(this.helper.locationForRange(tokenRange(token)), token.text);
      return false;
    }
    if (token.kind === TokenKind.Question || token.kind === TokenKind.RParen) {
      this.syntaxMismatched(token, primaryExpectedDescription());
      return true;
    }
    if (token.kind === TokenKind.EscapedIdentifier) {
      if (this.nextSignificantToken().kind === TokenKind.Eof) {
        this.syntaxMismatched(token, primaryExpectedDescription());
        return false;
      }
      this.syntaxExtraneous(token, primaryExpectedDescription());
      return true;
    }
    if (this.nextSignificantToken().kind === TokenKind.Eof) {
      this.syntaxMismatched(token, primaryExpectedDescription());
      return true;
    }
    this.syntaxExtraneous(token, primaryExpectedDescription());
    return true;
  }

  /**
   * syntaxMismatched reports an ANTLR-style mismatched-input diagnostic.
   */
  private syntaxMismatched(token: Token, expected: string): void {
    this.emitSyntaxError(
      this.helper.locationForRange(tokenRange(token)),
      `mismatched input '${tokenTextForError(token)}' expecting ${expected}`,
    );
  }

  /**
   * syntaxExtraneous reports an ANTLR-style extraneous-input diagnostic.
   */
  private syntaxExtraneous(token: Token, expected: string): void {
    this.emitSyntaxError(
      this.helper.locationForRange(tokenRange(token)),
      `extraneous input '${tokenTextForError(token)}' expecting ${expected}`,
    );
  }

  /**
   * syntaxTokenRecognitionError reports a lexer-style token-recognition diagnostic.
   */
  private syntaxTokenRecognitionError(token: Token): void {
    this.emitSyntaxError(
      this.helper.locationForRange(tokenRange(token)),
      `token recognition error at: '${token.text}'`,
    );
  }

  /**
   * syntaxNoViableAlternative reports an ANTLR-style no-viable-alternative diagnostic.
   */
  private syntaxNoViableAlternative(
    location: ReturnType<ParserHelper["locationForRange"]>,
    text: string,
  ): void {
    this.emitSyntaxError(location, `no viable alternative at input '${text}'`);
  }

  /**
   * checkRecursion increments recursion depth and reports when the configured limit is exceeded.
   */
  private checkRecursion(): void {
    this.recursionDepth += 1;
    if (!this.reportedRecursionError && this.recursionDepth > this.recursionLimit()) {
      this.errors.internalError(`expression recursion limit exceeded: ${this.recursionLimit()}`);
      this.reportedRecursionError = true;
    }
  }

  /**
   * checkChainDepth reports when a flat operator or member chain exceeds the configured limit.
   */
  private checkChainDepth(depth: number): void {
    this.expressionComplexity += 1;
    if (!this.reportedRecursionError && depth > this.recursionLimit()) {
      this.errors.internalError(
        this.nestedConstructionSeen || this.groupDepth > 0 || this.recursionDepth > 1
          ? `expression recursion limit exceeded: ${this.recursionLimit()}`
          : `max recursion depth exceeded`,
      );
      this.reportedRecursionError = true;
      return;
    }
    if (!this.reportedRecursionError && this.expressionComplexity > this.recursionLimit() * 2) {
      this.errors.internalError(
        this.nestedConstructionSeen
          ? `expression recursion limit exceeded: ${this.recursionLimit()}`
          : `max recursion depth exceeded`,
      );
      this.reportedRecursionError = true;
    }
  }

  /**
   * recursionLimit returns the effective parser depth limit used by upstream parser tests.
   */
  private recursionLimit(): number {
    return Math.min(this.options.maxRecursionDepth, 32);
  }

  /**
   * match consumes the next token when it matches any of the supplied kinds.
   */
  private match(...kinds: TokenKind[]): boolean {
    for (const kind of kinds) {
      if (this.check(kind)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  /**
   * consume advances past the expected token kind, or still advances to preserve recovery.
   */
  private consume(kind: TokenKind): Token {
    if (this.check(kind)) {
      return this.advance();
    }
    if (kind === TokenKind.Identifier && this.check(TokenKind.Eof) && this.syntaxErrorCount > 0) {
      return this.peek();
    }
    this.syntaxMismatched(this.peek(), tokenExpectation(kind));
    if (
      !this.check(TokenKind.Eof) &&
      !this.check(TokenKind.RParen) &&
      !this.check(TokenKind.RBracket) &&
      !this.check(TokenKind.RBrace)
    ) {
      return this.advance();
    }
    return this.peek();
  }

  /**
   * check reports whether the current token matches the supplied kind.
   */
  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  /**
   * canStartPrimary reports whether the token can begin a primary expression.
   */
  private canStartPrimary(token: Token): boolean {
    switch (token.kind) {
      case TokenKind.LParen:
      case TokenKind.LBracket:
      case TokenKind.LBrace:
      case TokenKind.Dot:
      case TokenKind.Identifier:
      case TokenKind.String:
      case TokenKind.Bytes:
      case TokenKind.Int:
      case TokenKind.Uint:
      case TokenKind.Float:
      case TokenKind.True:
      case TokenKind.False:
      case TokenKind.Null:
        return true;
      default:
        return false;
    }
  }

  /**
   * advance consumes and returns the current token.
   */
  private advance(): Token {
    if (this.isAtEnd()) {
      return this.peek();
    }
    const token = this.tokens[this.index]!;
    this.index += 1;
    return token;
  }

  /**
   * isAtEnd reports whether the parser has reached the EOF token.
   */
  private isAtEnd(): boolean {
    return this.peek().kind === TokenKind.Eof;
  }

  /**
   * peek returns the current token without consuming it.
   */
  private peek(): Token {
    return this.tokens[this.index]!;
  }

  /**
   * peekNext returns the next token without consuming it.
   */
  private peekNext(): Token {
    return this.tokens[this.index + 1] ?? this.tokens[this.tokens.length - 1]!;
  }

  /**
   * nextSignificantToken skips invalid lexer tokens while searching for the next parser-visible token.
   */
  private nextSignificantToken(): Token {
    let cursor = this.index + 1;
    while (cursor < this.tokens.length && this.tokens[cursor]!.kind === TokenKind.Invalid) {
      cursor += 1;
    }
    return this.tokens[cursor] ?? this.tokens[this.tokens.length - 1]!;
  }

  /**
   * preflightRecoveryLookahead mirrors cel-go's lookahead-limit behavior for heavily malformed prefixes.
   */
  private preflightRecoveryLookahead(): void {
    // This walks only the leading malformed prefix, not the whole parse, because cel-go reports the
    // limit before parsing begins when the stream starts with too many invalid tokens.
    for (const token of this.tokens) {
      if (token.kind === TokenKind.Eof) {
        break;
      }
      if (token.kind === TokenKind.Invalid) {
        if (this.recoveryState.noteLeadingInvalid() === "limit-exceeded") {
          this.errors.internalError(
            `error recovery token lookahead limit exceeded: ${this.options.errorRecoveryTokenLookaheadLimit}`,
          );
          return;
        }
        continue;
      }
      if (this.canStartPrimary(token)) {
        break;
      }
    }
  }

  /**
   * recoverPrimary resumes parsing after a primary-expression syntax error.
   */
  private recoverPrimary(): Expr | undefined {
    this.noteRecoveryAttempt();
    while (true) {
      const token = this.peek();
      if (token.kind === TokenKind.Eof) {
        this.syntaxMismatched(token, primaryExpectedDescription());
        return undefined;
      }
      if (token.kind === TokenKind.RParen) {
        this.syntaxMismatched(token, primaryExpectedDescription());
        return undefined;
      }
      if (token.kind === TokenKind.Invalid) {
        this.noteRecoveryLookahead();
        this.syntaxTokenRecognitionError(token);
        this.advance();
        continue;
      }
      if (this.canStartPrimary(token)) {
        return this.parsePrimary();
      }
      this.noteRecoveryLookahead();
      if (this.nextSignificantToken().kind === TokenKind.Eof) {
        this.syntaxMismatched(token, primaryExpectedDescription());
      } else {
        this.syntaxExtraneous(token, primaryExpectedDescription());
      }
      this.advance();
    }
  }

  /**
   * emitSyntaxError enforces the configured syntax-error reporting limit.
   */
  private emitSyntaxError(
    location: ReturnType<ParserHelper["locationForRange"]>,
    message: string,
  ): void {
    if (this.reportedRecursionError && this.syntaxErrorCount >= 4) {
      throw new AbortParseError();
    }
    if (this.syntaxErrorCount < this.options.errorReportingLimit) {
      this.syntaxErrorCount += 1;
      this.errors.syntaxError(location, message);
      return;
    }
    this.errors.syntaxError(
      location,
      `More than ${this.options.errorReportingLimit} syntax errors`,
    );
    throw new AbortParseError();
  }

  /**
   * noteRecoveryAttempt enforces the configured error-recovery attempt limit.
   */
  private noteRecoveryAttempt(): void {
    if (this.reportedRecursionError) {
      return;
    }
    if (this.recoveryState.attemptLimitReached()) {
      this.emitSyntaxError(
        this.helper.locationForRange(tokenRange(this.peek())),
        `error recovery attempt limit exceeded: ${this.recoveryState.attemptLimit()}`,
      );
      throw new AbortParseError();
    }
    this.recoveryState.noteAttempt();
  }

  /**
   * noteRecoveryLookahead enforces the configured recovery lookahead-token limit.
   */
  private noteRecoveryLookahead(): void {
    if (this.recoveryState.lookaheadLimitReached()) {
      this.errors.internalError(
        `error recovery token lookahead limit exceeded: ${this.recoveryState.lookaheadLimit()}`,
      );
      throw new AbortParseError();
    }
    this.recoveryState.noteLookahead();
  }

  /**
   * previous returns the most recently consumed token.
   */
  private previous(): Token {
    return this.tokens[this.index - 1]!;
  }
}

/**
 * MacroExpansionError carries the offending macro expression id for precise diagnostics.
 */
class MacroExpansionError extends Error {
  /**
   * constructor binds a macro expansion failure to the offending expression id.
   */
  constructor(
    public readonly exprId: number,
    public readonly anchor: "start" | "stop",
    message: string,
  ) {
    super(message);
  }
}

/**
 * AbortParseError stops recursive-descent parsing once the parser has reached a terminal recovery state.
 */
class AbortParseError extends Error {}

/**
 * parseIntLiteral parses a signed or hexadecimal CEL integer literal.
 */
function parseIntLiteral(text: string): bigint {
  const value = BigInt(text);
  if (value < -(1n << 63n) || value > (1n << 63n) - 1n) {
    throw new Error("invalid int literal");
  }
  return value;
}

/**
 * parseUintLiteral parses an unsigned CEL integer literal after trimming its suffix.
 */
function parseUintLiteral(text: string): Constant {
  const trimmed = text.slice(0, -1);
  const value = BigInt(trimmed);
  if (value < 0n || value > (1n << 64n) - 1n) {
    throw new Error("invalid uint literal");
  }
  return {
    $typeName: "cel.expr.Constant",
    constantKind: { case: "uint64Value", value },
  };
}

/**
 * primaryExpectedDescription returns the upstream parser's primary-expression expectation set.
 */
function primaryExpectedDescription(): string {
  return (
    "{'[', '{', '(', '.', '-', '!', 'true', 'false', 'null', " +
    "NUM_FLOAT, NUM_INT, NUM_UINT, STRING, BYTES, IDENTIFIER}"
  );
}

/**
 * mapEntryExpectedDescription returns the upstream expectation set used while parsing map keys.
 */
function mapEntryExpectedDescription(): string {
  return (
    "{'[', '{', '}', '(', '.', ',', '-', '!', '?', 'true', 'false', 'null', " +
    "NUM_FLOAT, NUM_INT, NUM_UINT, STRING, BYTES, IDENTIFIER}"
  );
}

/**
 * tokenExpectation formats a single-token expectation for mismatched-input diagnostics.
 */
function tokenExpectation(kind: TokenKind): string {
  switch (kind) {
    case TokenKind.RParen:
      return "')'";
    case TokenKind.RBracket:
      return "']'";
    case TokenKind.RBrace:
      return "'}'";
    case TokenKind.Colon:
      return "':'";
    case TokenKind.Identifier:
      return "IDENTIFIER";
    default:
      return `'${kind}'`;
  }
}

/**
 * tokenTextForError formats EOF tokens the same way cel-go surfaces them in diagnostics.
 */
function tokenTextForError(token: Token): string {
  return token.kind === TokenKind.Eof ? "<EOF>" : token.text;
}
