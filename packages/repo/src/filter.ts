import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import {
  type CheckedExpr,
  check,
  contextDecls,
  type Decl,
  inline,
  optimize,
  parse,
} from "@protoutil/aip/filtering";

/**
 * Options for building a checked filter expression from user input.
 */
export interface BuildFilterOptions {
  /** Proto field name → database column name mapping. */
  columnMap?: Record<string, string>;

  /** Additional declarations merged with contextDecls(schema). */
  extraDecls?: Decl[];
}

/**
 * Convert a partial message object into an AIP-160 filter string.
 * Each set field becomes an equality check, joined with AND.
 *
 * ```ts
 * partialToFilter(schema, { uid: "abc", active: true })
 * // → 'uid = "abc" AND active = true'
 * ```
 */
export function partialToFilter<Desc extends DescMessage>(
  schema: Desc,
  partial: Partial<MessageShape<Desc>>,
): string {
  const parts: string[] = [];
  for (const field of schema.fields) {
    const value = (partial as Record<string, unknown>)[field.localName];
    if (value === undefined) {
      continue;
    }
    const fieldName = field.name;
    switch (typeof value) {
      case "string":
        parts.push(`${fieldName} = "${value}"`);
        break;
      case "boolean":
      case "number":
      case "bigint":
        parts.push(`${fieldName} = ${value}`);
        break;
      case "object":
        if (value === null) {
          parts.push(`${fieldName} = null`);
        }
        break;
    }
  }
  return parts.join(" AND ");
}

/**
 * Build a type-checked AIP-160 filter expression from a filter string
 * or partial resource object.
 *
 * Pipeline:
 * 1. Convert partial resource → filter string (if needed)
 * 2. `parse()` → `ParsedExpr`
 * 3. `check()` with `contextDecls(schema)` + extra decls → `CheckedExpr`
 * 4. `optimize()` with `inline()` to remap column names (if columnMap provided)
 *
 * The returned `CheckedExpr` is passed to the engine, which applies
 * its own dialect to translate it into a database-specific query.
 */
export function buildFilter<Desc extends DescMessage>(
  schema: Desc,
  query: string | Partial<MessageShape<Desc>>,
  opts?: BuildFilterOptions,
): CheckedExpr {
  const filterString = typeof query === "string" ? query : partialToFilter(schema, query);

  const parsed = parse(filterString);

  const decls = [...contextDecls(schema), ...(opts?.extraDecls ?? [])];
  const { checkedExpr } = check(parsed, { decls });

  if (opts?.columnMap && Object.keys(opts.columnMap).length > 0) {
    const replacements: Record<string, ReturnType<typeof parse>> = {};
    for (const [protoField, dbColumn] of Object.entries(opts.columnMap)) {
      replacements[protoField] = parse(dbColumn);
    }
    return optimize(checkedExpr, inline(replacements));
  }

  return checkedExpr;
}

/**
 * Build a single checked filter expression from multiple queries,
 * combined with OR. Each query is wrapped in parentheses before
 * joining.
 *
 * ```ts
 * buildBatchFilter(schema, [{ uid: "a" }, { uid: "b" }])
 * // → checked expr for: (uid = "a") OR (uid = "b")
 * ```
 */
export function buildBatchFilter<Desc extends DescMessage>(
  schema: Desc,
  queries: (string | Partial<MessageShape<Desc>>)[],
  opts?: BuildFilterOptions,
): CheckedExpr {
  const parts = queries.map((q) => {
    const filterString = typeof q === "string" ? q : partialToFilter(schema, q);
    return `(${filterString})`;
  });
  const combined = parts.join(" OR ");

  const parsed = parse(combined);
  const decls = [...contextDecls(schema), ...(opts?.extraDecls ?? [])];
  const { checkedExpr } = check(parsed, { decls });

  if (opts?.columnMap && Object.keys(opts.columnMap).length > 0) {
    const replacements: Record<string, ReturnType<typeof parse>> = {};
    for (const [protoField, dbColumn] of Object.entries(opts.columnMap)) {
      replacements[protoField] = parse(dbColumn);
    }
    return optimize(checkedExpr, inline(replacements));
  }

  return checkedExpr;
}
