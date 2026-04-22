import type { CheckedExpr } from "@protoutil/aip/filtering";
import { TranslationError } from "../errors.js";
import type { MysqlOptions, SqlFunctionHandler, SqlOutput } from "../types.js";
import { assertBoolOutput, constStringValue, durationConstNanos } from "../utils.js";
import { SqlTranslator, sqlStdlib } from "./sql-base.js";

// ---------------------------------------------------------------------------
// Stdlib — extends shared sqlStdlib with MySQL-specific handlers.
//
// Overload IDs match BUILTIN_DECLS:
//   string_starts_with, string_ends_with, string_contains, string_matches
// ---------------------------------------------------------------------------

/**
 * Built-in MySQL function handlers for translating supported AIP-160 functions.
 */
export const stdlibMysql: Record<string, SqlFunctionHandler> = {
  ...sqlStdlib,

  string_matches(target, args, ctx) {
    if (!target || args.length !== 1)
      throw new TranslationError("matches: requires a target and one argument");
    ctx.write(
      `${ctx.emitIdent(target)} REGEXP ${ctx.pushParam(constStringValue(args[0], "matches"))}`,
    );
  },

  ago_duration(_target, args, ctx) {
    if (args.length !== 1) throw new TranslationError("ago: requires exactly one argument");
    const nanos = durationConstNanos(args[0]);
    const micros = nanos / 1000n;
    ctx.write(`NOW(6) - INTERVAL ${ctx.pushParam(Number(micros))} MICROSECOND`);
  },
};

// ---------------------------------------------------------------------------
// Translator
// ---------------------------------------------------------------------------

class MysqlTranslator extends SqlTranslator {
  constructor(checkedExpr: CheckedExpr, opts?: MysqlOptions) {
    super(checkedExpr, stdlibMysql, "LIKE", "`", opts?.functions);
  }

  // MySQL uses ? placeholders — no index needed
  protected pushParam(value: unknown): string {
    this.params.push(value);
    return "?";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Translates a checked AIP-160 filter expression into MySQL SQL and bind parameters.
 *
 * Uses `?` placeholders and the built-in MySQL dialect helpers. Custom function
 * handlers can be provided with `opts.functions`.
 */
export function mysql(expr: CheckedExpr, opts?: MysqlOptions): SqlOutput {
  assertBoolOutput(expr);
  return new MysqlTranslator(expr, opts).translate(expr.expr);
}
