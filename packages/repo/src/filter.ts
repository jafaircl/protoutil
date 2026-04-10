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

type FilterMetadata = {
  decls: Decl[];
  replacements?: Record<string, ReturnType<typeof parse>>;
};

type FilterCacheEntry = {
  columnMap?: Record<string, string>;
  extraDecls?: Decl[];
  metadata: FilterMetadata;
};

const filterMetadataCache = new WeakMap<DescMessage, FilterCacheEntry[]>();

/**
 * Options for building a checked filter expression from user input.
 */
export interface BuildFilterOptions {
  /** Proto field name → database column name mapping. */
  columnMap?: Record<string, string>;

  /** Additional declarations merged with contextDecls(schema). */
  extraDecls?: Decl[];
}

function buildFilterMetadata<Desc extends DescMessage>(
  schema: Desc,
  opts?: BuildFilterOptions,
): FilterMetadata {
  const decls = [...contextDecls(schema), ...(opts?.extraDecls ?? [])];
  let replacements: Record<string, ReturnType<typeof parse>> | undefined;

  if (opts?.columnMap && Object.keys(opts.columnMap).length > 0) {
    replacements = {};
    for (const [protoField, dbColumn] of Object.entries(opts.columnMap)) {
      replacements[protoField] = parse(dbColumn);
    }
  }

  return { decls, replacements };
}

function getFilterMetadata<Desc extends DescMessage>(
  schema: Desc,
  opts?: BuildFilterOptions,
): FilterMetadata {
  const entries = filterMetadataCache.get(schema) ?? [];
  const match = entries.find(
    (entry) => entry.columnMap === opts?.columnMap && entry.extraDecls === opts?.extraDecls,
  );
  if (match) {
    return match.metadata;
  }

  const metadata = buildFilterMetadata(schema, opts);
  entries.push({
    columnMap: opts?.columnMap,
    extraDecls: opts?.extraDecls,
    metadata,
  });
  filterMetadataCache.set(schema, entries);
  return metadata;
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
  const metadata = getFilterMetadata(schema, opts);
  const parsed = parse(filterString);
  const { checkedExpr } = check(parsed, { decls: metadata.decls });

  if (metadata.replacements) {
    return optimize(checkedExpr, inline(metadata.replacements));
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
  const metadata = getFilterMetadata(schema, opts);
  const { checkedExpr } = check(parsed, { decls: metadata.decls });

  if (metadata.replacements) {
    return optimize(checkedExpr, inline(metadata.replacements));
  }

  return checkedExpr;
}
