import { timestampDate } from "@bufbuild/protobuf/wkt";
import type { CheckedExpr, Expr, Reference } from "@protoutil/aip/filtering";
import { durationNanos, timestampFromString } from "@protoutil/core/wkt";
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
import type {
  MongoEmitContext,
  MongoFilter,
  MongoFunctionHandler,
  MongoOptions,
  MongoOutput,
} from "../types.js";
import {
  constStringValue,
  durationConstNanos,
  hasWildcard,
  isNullConst,
  isStringConst,
  isTimestampString,
} from "../utils.js";

// ---------------------------------------------------------------------------
// Field path resolution — MongoDB uses dotted strings, no quoting needed
// ---------------------------------------------------------------------------

function fieldPath(expr: Expr): string {
  if (expr.exprKind.case === "identExpr") {
    return expr.exprKind.value.name;
  }
  if (expr.exprKind.case === "selectExpr") {
    const sel = expr.exprKind.value;
    if (!sel.operand) {
      throw new TranslationError(`Expected operand, got ${sel}`);
    }
    return `${fieldPath(sel.operand)}.${sel.field}`;
  }
  throw new TranslationError(`Expected field reference, got ${expr.exprKind.case}`);
}

// Escape regex metacharacters in a literal value.
// Applied to startsWith/endsWith/contains but NOT matches (raw pattern).
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function regexFilter(field: string, pattern: string, caseInsensitive: boolean): MongoFilter {
  return caseInsensitive
    ? { [field]: { $regex: pattern, $options: "i" } }
    : { [field]: { $regex: pattern } };
}

// ---------------------------------------------------------------------------
// Stdlib — keyed by overload ID, with function name aliases for convenience.
//
// Overload IDs match BUILTIN_DECLS:
//   string_starts_with, string_ends_with, string_contains, string_matches
// ---------------------------------------------------------------------------

export const stdlibMongo: Record<string, MongoFunctionHandler> = {
  string_starts_with(target, args, ctx) {
    if (!target || args.length !== 1)
      throw new TranslationError("startsWith: requires a target and one argument");
    return regexFilter(
      fieldPath(target),
      `^${escapeRegex(constStringValue(args[0], "startsWith"))}`,
      ctx.caseInsensitive,
    );
  },

  string_ends_with(target, args, ctx) {
    if (!target || args.length !== 1)
      throw new TranslationError("endsWith: requires a target and one argument");
    return regexFilter(
      fieldPath(target),
      `${escapeRegex(constStringValue(args[0], "endsWith"))}$`,
      ctx.caseInsensitive,
    );
  },

  string_contains(target, args, ctx) {
    if (!target || args.length !== 1)
      throw new TranslationError("contains: requires a target and one argument");
    return regexFilter(
      fieldPath(target),
      escapeRegex(constStringValue(args[0], "contains")),
      ctx.caseInsensitive,
    );
  },

  string_matches(target, args, _ctx) {
    if (!target || args.length !== 1)
      throw new TranslationError("matches: requires a target and one argument");
    // matches never applies caseInsensitive — caller controls via pattern
    return { [fieldPath(target)]: { $regex: constStringValue(args[0], "matches") } };
  },

  // ago() returns a scalar Date, not a filter. The $value wrapper signals to
  // resolveValue() that this is a value-returning function.
  ago_duration(_target, args, _ctx) {
    if (args.length !== 1) throw new TranslationError("ago: requires exactly one argument");
    const nanos = durationConstNanos(args[0]);
    const ms = Number(nanos / 1_000_000n);
    return { $value: new Date(Date.now() - ms) };
  },
};

// ---------------------------------------------------------------------------
// Translator
// ---------------------------------------------------------------------------

class MongoTranslator {
  private refMap: Map<bigint, Reference>;
  private fns: Record<string, MongoFunctionHandler>;
  private caseInsensitive: boolean;

  constructor(checkedExpr: CheckedExpr, opts?: MongoOptions) {
    this.refMap = new Map(Object.entries(checkedExpr.referenceMap).map(([k, v]) => [BigInt(k), v]));
    this.fns = opts?.functions ? { ...stdlibMongo, ...opts.functions } : stdlibMongo;
    this.caseInsensitive = opts?.caseInsensitive ?? true;
  }

  translate(expr: CheckedExpr["expr"]): MongoOutput {
    return { filter: this.visitExpr(expr!) };
  }

  // -------------------------------------------------------------------------
  // Core visitor — returns a MongoFilter rather than mutating state
  // -------------------------------------------------------------------------

  private visitExpr(expr: Expr): MongoFilter {
    switch (expr.exprKind.case) {
      case "callExpr":
        return this.visitCall(expr);
      case "constExpr":
        throw new TranslationError(
          "Bare constant at top level is not supported in MongoDB filters",
        );
      case "identExpr":
      case "selectExpr":
        // Bare field reference — treat as presence check
        return { [fieldPath(expr)]: { $exists: true } };
      default:
        throw new TranslationError(`Unsupported expression kind: ${expr.exprKind.case}`);
    }
  }

  private visitCall(expr: Expr): MongoFilter {
    const call = (expr.exprKind as Extract<Expr["exprKind"], { case: "callExpr" }>).value;
    const fn = call.function;

    if (fn === FN_AND) return this.visitBinary(call.args, "$and");
    if (fn === FN_OR) return this.visitBinary(call.args, "$or");
    if (fn === FN_NOT) return this.visitNot(call.args);
    if (fn === FN_NEGATE) return this.visitNot(call.args);
    if (fn === FN_EQ) return this.visitComparison(call.args, "$eq");
    if (fn === FN_NEQ) return this.visitComparison(call.args, "$ne");
    if (fn === FN_LT) return this.visitComparison(call.args, "$lt");
    if (fn === FN_LTE) return this.visitComparison(call.args, "$lte");
    if (fn === FN_GT) return this.visitComparison(call.args, "$gt");
    if (fn === FN_GTE) return this.visitComparison(call.args, "$gte");
    if (fn === FN_HAS) return this.visitHas(call.args, expr.id);

    // Registry: overload ID first, function name fallback
    const handler = this.resolveHandler(expr.id, fn);
    if (handler) return handler(call.target, call.args, this.makeContext());

    throw new TranslationError(
      `No handler for "${fn}" ` +
        `(overloads: ${this.refMap.get(expr.id)?.overloadId.join(", ") ?? "none"}). ` +
        `Register a handler in options.functions.`,
    );
  }

  // Resolve using the reference from the checker. Check function name first
  // (user overrides by name), then overload IDs (stdlib keyed by overload ID).
  private resolveHandler(exprId: bigint, fnName: string): MongoFunctionHandler | undefined {
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

  private visitBinary(args: Expr[], op: "$and" | "$or"): MongoFilter {
    if (args.length !== 2) throw new TranslationError(`${op} requires exactly 2 operands`);
    const items: MongoFilter[] = [];
    for (const arg of args) {
      const child = this.visitExpr(arg);
      // Flatten nested same-operator arrays (e.g. $or inside $or)
      if (op === "$or" && "$or" in child && Array.isArray(child.$or)) {
        items.push(...child.$or);
      } else {
        items.push(child);
      }
    }
    return { [op]: items };
  }

  private visitNot(args: Expr[]): MongoFilter {
    if (args.length !== 1) throw new TranslationError("NOT requires exactly 1 operand");
    // $nor: [expr] works for any sub-expression; $not only wraps a single operator
    return { $nor: [this.visitExpr(args[0])] };
  }

  private visitComparison(args: Expr[], op: string): MongoFilter {
    if (args.length !== 2) throw new TranslationError("Comparison requires 2 operands");
    const [lhs, rhs] = args;

    if (isNullConst(rhs)) {
      const f = fieldPath(lhs);
      return op === "$eq" ? { [f]: null } : { [f]: { [op]: null } };
    }
    if (isNullConst(lhs)) {
      const f = fieldPath(rhs);
      return op === "$eq" ? { [f]: null } : { [f]: { [op]: null } };
    }

    // Wildcard string: = with "*" → regex, != with "*" → $not regex
    if (
      (op === "$eq" || op === "$ne") &&
      isStringConst(rhs) &&
      hasWildcard(rhs.exprKind.value.constantKind.value)
    ) {
      const raw = rhs.exprKind.value.constantKind.value;
      const hasLeading = raw.startsWith("*");
      const hasTrailing = raw.endsWith("*");
      const inner = escapeRegex(raw.replace(/^\*|\*$/g, ""));

      let pattern: string;
      if (hasLeading && hasTrailing) {
        pattern = inner;
      } else if (hasLeading) {
        pattern = `${inner}$`;
      } else if (hasTrailing) {
        pattern = `^${inner}`;
      } else {
        pattern = inner;
      }

      const field = fieldPath(lhs);
      const filter = regexFilter(field, pattern, this.caseInsensitive);
      if (op === "$ne") {
        return { [field]: { $not: filter[field] } };
      }
      return filter;
    }

    return { [fieldPath(lhs)]: { [op]: this.resolveValue(rhs) } };
  }

  // @in(collection, key) — args[0] is the field, args[1] is the value.
  // Dispatch on overload ID:
  //   in_map  → key existence ($exists: true)
  //   in_list → string field: substring/wildcard regex; otherwise: $exists
  private visitHas(args: Expr[], exprId: bigint): MongoFilter {
    if (args.length !== 2) throw new TranslationError("@in requires exactly 2 arguments");

    const [collection, key] = args;
    const field = fieldPath(collection);
    const overloadId = this.refMap.get(exprId)?.overloadId[0];

    if (overloadId === OL_IN_MAP) {
      return { [field]: { $exists: true } };
    }

    // in_list: if the key is a string literal, emit a regex pattern;
    // otherwise treat as a presence check
    if (isStringConst(key)) {
      const raw = constStringValue(key, "@in");
      const hasLeading = raw.startsWith("*");
      const hasTrailing = raw.endsWith("*");
      const inner = escapeRegex(raw.replace(/^\*|\*$/g, ""));

      let pattern: string;
      if (hasLeading && hasTrailing) {
        pattern = inner;
      } else if (hasLeading) {
        pattern = `${inner}$`;
      } else if (hasTrailing) {
        pattern = `^${inner}`;
      } else {
        pattern = inner; // substring
      }

      return regexFilter(field, pattern, this.caseInsensitive);
    }

    return { [field]: { $exists: true } };
  }

  // Resolve an expression to a scalar value for use in comparisons.
  // Handles constants directly and delegates call expressions (e.g. ago())
  // to the stdlib via overload ID resolution.
  private resolveValue(expr: Expr): unknown {
    if (expr.exprKind.case === "constExpr") return this.constValue(expr);
    if (expr.exprKind.case === "callExpr") {
      const call = expr.exprKind.value;
      const handler = this.resolveHandler(expr.id, call.function);
      if (handler) {
        // Execute the handler and extract the scalar value from the filter.
        // Value-returning functions like ago() produce { $value: <scalar> }.
        const result = handler(call.target, call.args, this.makeContext());
        if ("$value" in result) return result.$value;
        throw new TranslationError(
          `Function "${call.function}" cannot be used as a comparison value in MongoDB`,
        );
      }
      throw new TranslationError(
        `No handler for "${call.function}". Register a handler in options.functions.`,
      );
    }
    throw new TranslationError(`Expected value expression, got ${expr.exprKind.case}`);
  }

  private constValue(expr: Expr): unknown {
    if (expr.exprKind.case !== "constExpr")
      throw new TranslationError(`Expected constant, got ${expr.exprKind.case}`);
    const c = expr.exprKind.value;
    switch (c.constantKind.case) {
      case "stringValue":
        if (isTimestampString(c.constantKind.value)) {
          return timestampDate(timestampFromString(c.constantKind.value));
        }
        return c.constantKind.value;
      case "int64Value":
      case "uint64Value":
      case "doubleValue":
      case "boolValue":
      case "bytesValue":
        return c.constantKind.value;
      case "nullValue":
        return null;
      case "durationValue":
        return durationNanos(c.constantKind.value);
      case "timestampValue":
        return timestampDate(c.constantKind.value);
      default:
        throw new TranslationError(`Unsupported constant kind: ${c.constantKind.case}`);
    }
  }

  private makeContext(): MongoEmitContext {
    return {
      emit: (expr) => this.visitExpr(expr),
      fieldPath: (expr) => fieldPath(expr),
      caseInsensitive: this.caseInsensitive,
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mongo(expr: CheckedExpr, opts?: MongoOptions): MongoOutput {
  return new MongoTranslator(expr, opts).translate(expr.expr);
}
