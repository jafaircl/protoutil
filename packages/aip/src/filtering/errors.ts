import { offsetToLineCol } from "./parser.js";

// ─────────────────────────────────────────────────────────────────────────────
// ErrorCode
// ─────────────────────────────────────────────────────────────────────────────
//
// Stable string codes for every error this library produces. Callers should
// switch on `error.code` to drive i18n message lookup rather than inspecting
// `error.message`, which is an English-language implementation detail.
//
// Grouping:
//   PARSE_*  — errors thrown by parse()
//   CHECK_*  — errors collected by check()
//   DEPTH_*  — errors thrown by assertExprDepth()
/**
 * Stable string codes for errors produced by the filtering package.
 */
export const ErrorCode = {
  // ── Parser errors ──────────────────────────────────────────────────────────
  /** A token that could not be incorporated into a valid expression was encountered. */
  PARSE_UNEXPECTED_TOKEN: "PARSE_UNEXPECTED_TOKEN",
  /** A string literal was opened but never closed before end-of-input. */
  PARSE_UNTERMINATED_STRING: "PARSE_UNTERMINATED_STRING",
  /** The expression's parenthesis nesting exceeds the configured depth limit. */
  PARSE_DEPTH_EXCEEDED: "PARSE_DEPTH_EXCEEDED",

  // ── Checker errors ─────────────────────────────────────────────────────────
  /** An identifier was referenced but has no matching declaration. */
  CHECK_UNDECLARED_IDENT: "CHECK_UNDECLARED_IDENT",
  /** A function or operator was called but has no known declaration. */
  CHECK_UNKNOWN_FUNCTION: "CHECK_UNKNOWN_FUNCTION",
  /** A structural invariant of the expression tree was violated. */
  CHECK_INVALID_EXPRESSION: "CHECK_INVALID_EXPRESSION",

  // ── Depth errors ───────────────────────────────────────────────────────────
  /** An already-built Expr tree exceeds the configured depth limit. */
  DEPTH_EXCEEDED: "DEPTH_EXCEEDED",
} as const;

/**
 * Union of all stable filtering error codes.
 */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ─────────────────────────────────────────────────────────────────────────────
// SourcePosition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A source location within a filter string.
 */
export interface SourcePosition {
  /** The location label from SourceInfo (e.g. "<input>"). */
  location: string;
  /** Byte offset of the relevant token within the source string. */
  offset: number;
  /** 1-based line number. Use -1 for errors with no meaningful position. */
  line: number;
  /** 0-based column within the line. */
  column: number;
  /** The expression node id associated with this position, when available. */
  exprId?: bigint;
}

// ─────────────────────────────────────────────────────────────────────────────
// formatPosition
// ─────────────────────────────────────────────────────────────────────────────

/** Formats a SourcePosition as "location:line:col" (1-based col for human display). */
export function formatPosition(pos: SourcePosition): string {
  if (pos.line === -1) return `${pos.location}:-1:0`;
  return `${pos.location}:${pos.line}:${pos.column + 1}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AipFilterError — base class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base class for all errors produced by this library.
 *
 * toString() renders the CEL/AIP standard error format:
 *
 *   ERROR: <input>:1:5: unknown identifier 'foo'
 *   | some expression here
 *   | ....^
 *
 * The source-line and pointer are omitted when `source` is not available,
 * or when position.line is -1 (no meaningful source location).
 */
export abstract class AipFilterError extends Error {
  readonly code: ErrorCode;
  readonly source?: string;
  readonly position?: SourcePosition;

  constructor(code: ErrorCode, message: string, source?: string, position?: SourcePosition) {
    super(message);
    this.code = code;
    this.source = source;
    this.position = position;
  }

  override toString(): string {
    const pos = this.position;
    const location = pos ? formatPosition(pos) : "<input>:-1:0";
    const header = `ERROR: ${location}: ${this.message}`;

    if (!this.source || !pos || pos.line === -1) {
      return header;
    }

    const lines = this.source.split("\n");
    const sourceLine = lines[pos.line - 1] ?? "";
    const pointer = `${".".repeat(pos.column)}^`;
    return `${header}\n| ${sourceLine}\n| ${pointer}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ParseError
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown by parse() when the input cannot be parsed into a valid expression.
 *
 * `position.offset` is the byte offset of the offending token within the
 * source string. Line and column are derived from the source string directly
 * (no SourceInfo is available at parse time).
 */
export class ParseError extends AipFilterError {
  constructor(code: ErrorCode, message: string, source: string, offset: number) {
    // Compute line offsets inline — cannot import computeLineOffsets from
    // parser.ts because parser.ts imports from errors.ts (would be circular).
    const lineOffsets: number[] = [];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === "\n") lineOffsets.push(i);
    }
    const { line, column } = offsetToLineCol(offset, lineOffsets);
    const position: SourcePosition = { location: "<input>", offset, line, column };
    super(code, message, source, position);
    this.name = "ParseError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ExprDepthError
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown by assertExprDepth() when an Expr tree exceeds the configured depth.
 *
 * Uses the CEL sentinel position -1:0 since there is no meaningful source
 * location for a post-parse depth violation.
 */
export class ExprDepthError extends AipFilterError {
  readonly depth: number;
  readonly max: number;

  constructor(depth: number, max: number, source?: string) {
    const position: SourcePosition = { location: "<input>", offset: 0, line: -1, column: 0 };
    super(
      ErrorCode.DEPTH_EXCEEDED,
      `expression depth ${depth} exceeds maximum allowed depth of ${max}`,
      source,
      position,
    );
    this.name = "ExprDepthError";
    this.depth = depth;
    this.max = max;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeCheckError
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Represents a single type-check failure. check() returns an array of these
 * rather than throwing — all errors are collected in a single pass.
 *
 * `exprId` is the node id of the expression that triggered the error.
 * `position` carries the source location when SourceInfo is available.
 */
export class TypeCheckError extends AipFilterError {
  readonly exprId: bigint;

  constructor(
    code: ErrorCode,
    exprId: bigint,
    message: string,
    source?: string,
    position?: SourcePosition,
  ) {
    super(code, message, source, position);
    this.name = "TypeCheckError";
    this.exprId = exprId;
  }
}
