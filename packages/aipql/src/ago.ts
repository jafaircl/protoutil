import { DURATION, func, overload, TIMESTAMP } from "@protoutil/aip/filtering";

/**
 * Checker declaration for the `ago()` function. Pass to `check()` as an
 * extra declaration so that filter expressions like `create_time > ago(24h)`
 * type-check correctly.
 *
 * @example
 * ```typescript
 * import { parse, check } from "@protoutil/aip/filtering";
 * import { postgres, agoDecl } from "@protoutil/aipql";
 *
 * const parsed = parse('create_time > ago(24h)');
 * const { checkedExpr } = check(parsed, { decls: [agoDecl] });
 * const { sql, params } = postgres(checkedExpr);
 * ```
 */
export const agoDecl = func(
  "ago",
  overload("ago_duration", [DURATION], TIMESTAMP, "Returns now minus the given duration"),
);
