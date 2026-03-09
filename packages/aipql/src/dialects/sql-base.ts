import { timestampDate } from "@bufbuild/protobuf/wkt";
import type { CheckedExpr, Expr, Reference } from "@protoutil/aip/filtering";
import { durationNanos, timestampDateString, timestampFromDateString } from "@protoutil/core/wkt";
import {
  FN_AND,
  FN_EQ,
  FN_GT,
  FN_GTE,
  FN_HAS,
  FN_LT,
  FN_LTE,
  FN_NEGATE,
  FN_NEQ,
  FN_NOT,
  FN_OR,
  OL_IN_MAP,
} from "../constants.js";
import { TranslationError } from "../errors.js";
import type { SqlEmitContext, SqlFunctionHandler, SqlOutput } from "../types.js";
import {
  constStringValue,
  emitIdent,
  hasWildcard,
  isNullConst,
  isStringConst,
  isTimestampString,
  quoteIdent,
  wildcardToLike,
} from "../utils.js";

// ---------------------------------------------------------------------------
// Shared SQL stdlib — string functions that work identically across dialects
// when using ctx.like (which resolves to ILIKE or LIKE per dialect).
//
// Overload IDs match BUILTIN_DECLS:
//   string_starts_with, string_ends_with, string_contains
// ---------------------------------------------------------------------------

export const sqlStdlib: Record<string, SqlFunctionHandler> = {
  string_starts_with(target, args, ctx) {
    if (!target || args.length !== 1)
      throw new TranslationError("startsWith: requires a target and one argument");
    ctx.write(
      `${ctx.emitIdent(target)} ${ctx.like} ${ctx.pushParam(`${constStringValue(args[0], "startsWith")}%`)}`,
    );
  },

  string_ends_with(target, args, ctx) {
    if (!target || args.length !== 1)
      throw new TranslationError("endsWith: requires a target and one argument");
    ctx.write(
      `${ctx.emitIdent(target)} ${ctx.like} ${ctx.pushParam(`%${constStringValue(args[0], "endsWith")}`)}`,
    );
  },

  string_contains(target, args, ctx) {
    if (!target || args.length !== 1)
      throw new TranslationError("contains: requires a target and one argument");
    ctx.write(
      `${ctx.emitIdent(target)} ${ctx.like} ${ctx.pushParam(`%${constStringValue(args[0], "contains")}%`)}`,
    );
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOrCall(expr: Expr): boolean {
  return (
    expr.exprKind.case === "callExpr" &&
    (expr.exprKind as Extract<Expr["exprKind"], { case: "callExpr" }>).value.function === FN_OR
  );
}

// ---------------------------------------------------------------------------
// Base SQL Translator
// ---------------------------------------------------------------------------

export abstract class SqlTranslator {
  protected parts: string[] = [];
  protected params: unknown[] = [];
  protected refMap: Map<bigint, Reference>;
  protected fns: Record<string, SqlFunctionHandler>;
  protected like: "LIKE" | "ILIKE";
  protected quoteStyle: string;

  constructor(
    checkedExpr: CheckedExpr,
    stdlib: Record<string, SqlFunctionHandler>,
    like: "LIKE" | "ILIKE",
    quoteStyle: string,
    userFns?: Record<string, SqlFunctionHandler>,
  ) {
    this.refMap = new Map(Object.entries(checkedExpr.referenceMap).map(([k, v]) => [BigInt(k), v]));
    this.fns = userFns ? { ...stdlib, ...userFns } : stdlib;
    this.like = like;
    this.quoteStyle = quoteStyle;
  }

  translate(expr: CheckedExpr["expr"]): SqlOutput {
    this.visitExpr(expr!);
    return { sql: this.parts.join(""), params: this.params };
  }

  // -------------------------------------------------------------------------
  // Abstract — dialect-specific parameter placeholder
  // -------------------------------------------------------------------------

  protected abstract pushParam(value: unknown): string;

  // -------------------------------------------------------------------------
  // Core visitor
  // -------------------------------------------------------------------------

  private visitExpr(expr: Expr): void {
    switch (expr.exprKind.case) {
      case "callExpr":
        this.visitCall(expr);
        return;
      case "identExpr":
      case "selectExpr":
        this.parts.push(emitIdent(expr, this.quoteStyle));
        return;
      case "constExpr":
        this.visitConst(expr);
        return;
      default:
        throw new TranslationError(`Unsupported expression kind: ${expr.exprKind.case}`);
    }
  }

  private visitCall(expr: Expr): void {
    const call = (expr.exprKind as Extract<Expr["exprKind"], { case: "callExpr" }>).value;
    const fn = call.function;

    switch (fn) {
      case FN_AND:
        this.visitBinary(call.args, "AND");
        return;
      case FN_OR:
        this.visitBinary(call.args, "OR");
        return;
      case FN_NOT:
        this.visitNot(call.args);
        return;
      case FN_NEGATE:
        this.visitNot(call.args);
        return;
      case FN_EQ:
        this.visitComparison(call.args, "=", "IS NULL");
        return;
      case FN_NEQ:
        this.visitComparison(call.args, "<>", "IS NOT NULL");
        return;
      case FN_LT:
        this.visitComparison(call.args, "<", null);
        return;
      case FN_LTE:
        this.visitComparison(call.args, "<=", null);
        return;
      case FN_GT:
        this.visitComparison(call.args, ">", null);
        return;
      case FN_GTE:
        this.visitComparison(call.args, ">=", null);
        return;
      case FN_HAS:
        this.visitHas(call.args, expr.id);
        return;
    }

    // Registry: overload ID first, function name fallback
    const handler = this.resolveHandler(expr.id, fn);
    if (handler) {
      handler(call.target, call.args, this.makeContext());
      return;
    }

    throw new TranslationError(
      `No handler for "${fn}" ` +
        `(overloads: ${this.refMap.get(expr.id)?.overloadId.join(", ") ?? "none"}). ` +
        `Register a handler in options.functions.`,
    );
  }

  // Resolve using the reference from the checker. The reference carries both the
  // function name and the matched overload IDs. Check function name first (lets
  // user-provided handlers override by name), then overload IDs (matches stdlib
  // handlers keyed by overload ID like "string_contains").
  private resolveHandler(exprId: bigint, fnName: string): SqlFunctionHandler | undefined {
    const byName = this.fns[fnName];
    if (byName) return byName;
    const ref = this.refMap.get(exprId);
    if (ref) {
      for (const overloadId of ref.overloadId) {
        const handler = this.fns[overloadId];
        if (handler) return handler;
      }
    }
    return undefined;
  }

  private visitBinary(args: Expr[], op: "AND" | "OR"): void {
    if (args.length !== 2) throw new TranslationError(`${op} requires exactly 2 operands`);
    const [left, right] = args;

    const leftNeedsParens = op === "AND" && isOrCall(left);
    const rightNeedsParens = op === "AND" && isOrCall(right);

    if (leftNeedsParens) this.parts.push("(");
    this.visitExpr(left);
    if (leftNeedsParens) this.parts.push(")");

    this.parts.push(` ${op} `);

    if (rightNeedsParens) this.parts.push("(");
    this.visitExpr(right);
    if (rightNeedsParens) this.parts.push(")");
  }

  private visitNot(args: Expr[]): void {
    if (args.length !== 1) throw new TranslationError("NOT requires exactly 1 operand");
    this.parts.push("NOT (");
    this.visitExpr(args[0]);
    this.parts.push(")");
  }

  private visitComparison(args: Expr[], op: string, nullOp: string | null): void {
    if (args.length !== 2) throw new TranslationError("Comparison requires 2 operands");
    const [lhs, rhs] = args;

    if (nullOp && isNullConst(rhs)) {
      this.parts.push(emitIdent(lhs, this.quoteStyle), " ", nullOp);
      return;
    }
    if (nullOp && isNullConst(lhs)) {
      this.parts.push(emitIdent(rhs, this.quoteStyle), " ", nullOp);
      return;
    }

    // Wildcard string: = with "*" → LIKE, <> with "*" → NOT LIKE
    if (
      (op === "=" || op === "<>") &&
      isStringConst(rhs) &&
      hasWildcard(rhs.exprKind.value.constantKind.value)
    ) {
      const likeOp = op === "=" ? this.like : `NOT ${this.like}`;
      const pattern = wildcardToLike(rhs.exprKind.value.constantKind.value);
      this.parts.push(`${emitIdent(lhs, this.quoteStyle)} ${likeOp} ${this.pushParam(pattern)}`);
      return;
    }

    this.visitExpr(lhs);
    this.parts.push(` ${op} `);
    this.visitExpr(rhs);
  }

  // @in(collection, key) — args[0] is the field, args[1] is the value.
  // Dispatch on overload ID:
  //   in_map  → key existence check (IS NOT NULL)
  //   in_list → string key: substring/wildcard LIKE; otherwise: presence check
  private visitHas(args: Expr[], exprId: bigint): void {
    if (args.length !== 2) throw new TranslationError("@in requires exactly 2 arguments");

    const [collection, key] = args;
    const col = emitIdent(collection, this.quoteStyle);
    const overloadId = this.refMap.get(exprId)?.overloadId[0];

    if (overloadId === OL_IN_MAP) {
      this.parts.push(`${col} IS NOT NULL`);
      return;
    }

    // in_list: if the key is a string literal, emit a LIKE pattern;
    // otherwise treat as a presence check
    if (isStringConst(key)) {
      const raw = constStringValue(key, "@in");
      const hasLeading = raw.startsWith("*");
      const hasTrailing = raw.endsWith("*");
      const inner = raw.replace(/^\*|\*$/g, "");
      const pattern =
        hasLeading || hasTrailing
          ? `${hasLeading ? "%" : ""}${inner}${hasTrailing ? "%" : ""}`
          : `%${raw}%`;
      this.parts.push(`${col} ${this.like} ${this.pushParam(pattern)}`);
    } else {
      this.parts.push(`${col} IS NOT NULL`);
    }
  }

  private visitConst(expr: Expr): void {
    const c = (expr.exprKind as Extract<Expr["exprKind"], { case: "constExpr" }>).value;
    switch (c.constantKind.case) {
      case "stringValue":
        if (isTimestampString(c.constantKind.value)) {
          this.parts.push(
            this.pushParam(timestampDate(timestampFromDateString(c.constantKind.value))),
          );
        } else {
          this.parts.push(this.pushParam(c.constantKind.value));
        }
        break;
      case "int64Value":
      case "uint64Value":
      case "doubleValue":
      case "boolValue":
      case "bytesValue":
        this.parts.push(this.pushParam(c.constantKind.value));
        break;
      case "nullValue":
        // Should be caught upstream by visitComparison null checks
        this.parts.push("NULL");
        break;
      case "durationValue": {
        const nanos = durationNanos(c.constantKind.value);
        this.parts.push(this.pushParam(nanos));
        break;
      }
      case "timestampValue": {
        this.parts.push(this.pushParam(new Date(timestampDateString(c.constantKind.value))));
        break;
      }
      default:
        throw new TranslationError(`Unsupported constant kind: ${c.constantKind.case}`);
    }
  }

  private makeContext(): SqlEmitContext {
    return {
      emit: (expr) => this.visitExpr(expr),
      emitIdent: (expr) => emitIdent(expr, this.quoteStyle),
      pushParam: (val) => this.pushParam(val),
      quoteIdent: (name) => quoteIdent(name, this.quoteStyle),
      write: (sql) => void this.parts.push(sql),
      like: this.like,
    };
  }
}
