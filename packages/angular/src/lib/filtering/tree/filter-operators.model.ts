/**
 * filter-operators.model.ts
 *
 * Maps CEL primitive types to the set of comparison and function operators
 * available for each type. Used by the filter stepper to populate the
 * operator selector.
 *
 * Operator `filterFn` describes the AIP filter function name as it appears
 * in the Expr AST (e.g. "_==_", "_<_", "startsWith").
 * `label` is the human-readable display text.
 * `kind` distinguishes comparison operators (binary infix like `_==_`)
 * from method operators (member calls like `x.startsWith(y)`).
 */

import type { Type } from "@protoutil/aip/filtering";

// ---------------------------------------------------------------------------
// Operator descriptor
// ---------------------------------------------------------------------------

export interface FilterOperator {
  /** Display label, e.g. "equals", "starts with". */
  label: string;
  /** The CEL function name in the AST, e.g. "_==_", "startsWith". */
  filterFn: string;
  /** Whether this is a binary comparison or a method-style call. */
  kind: "comparison" | "method";
}

// ---------------------------------------------------------------------------
// Operator sets
// ---------------------------------------------------------------------------

const EQUALITY: FilterOperator[] = [
  { label: $localize`:@@filterOperator.equals:equals`, filterFn: "_==_", kind: "comparison" },
  {
    label: $localize`:@@filterOperator.notEquals:not equals`,
    filterFn: "_!=_",
    kind: "comparison",
  },
];

const ORDERING: FilterOperator[] = [
  { label: $localize`:@@filterOperator.lessThan:less than`, filterFn: "_<_", kind: "comparison" },
  {
    label: $localize`:@@filterOperator.lessOrEqual:less or equal`,
    filterFn: "_<=_",
    kind: "comparison",
  },
  {
    label: $localize`:@@filterOperator.greaterThan:greater than`,
    filterFn: "_>_",
    kind: "comparison",
  },
  {
    label: $localize`:@@filterOperator.greaterOrEqual:greater or equal`,
    filterFn: "_>=_",
    kind: "comparison",
  },
];

const STRING_METHODS: FilterOperator[] = [
  { label: $localize`:@@filterOperator.contains:contains`, filterFn: "contains", kind: "method" },
  {
    label: $localize`:@@filterOperator.startsWith:starts with`,
    filterFn: "startsWith",
    kind: "method",
  },
  { label: $localize`:@@filterOperator.endsWith:ends with`, filterFn: "endsWith", kind: "method" },
];

const BOOL_OPS: FilterOperator[] = [...EQUALITY];
const NUMERIC_OPS: FilterOperator[] = [...EQUALITY, ...ORDERING];
const STRING_OPS: FilterOperator[] = [...EQUALITY, ...STRING_METHODS];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the available filter operators for a given CEL Type.
 * Falls back to equality-only for unknown or dynamic types.
 */
export function operatorsForType(type: Type | undefined): FilterOperator[] {
  if (!type) return EQUALITY;

  const kind = type.typeKind;

  if (kind.case === "primitive") {
    switch (kind.value) {
      case 1: // BOOL
        return BOOL_OPS;
      case 2: // INT64
      case 3: // UINT64
      case 4: // DOUBLE
        return NUMERIC_OPS;
      case 5: // STRING
        return STRING_OPS;
      default:
        return EQUALITY;
    }
  }

  // Wrapper types follow the same rules as their underlying primitive.
  if (kind.case === "wrapper") {
    switch (kind.value) {
      case 1:
        return BOOL_OPS;
      case 2:
      case 3:
      case 4:
        return NUMERIC_OPS;
      case 5:
        return STRING_OPS;
      default:
        return EQUALITY;
    }
  }

  // Timestamps and durations support ordering.
  if (kind.case === "wellKnown" && (kind.value === 2 || kind.value === 3)) {
    return NUMERIC_OPS;
  }

  return EQUALITY;
}

/**
 * Return the value input type hint for a given CEL Type.
 * Used to choose the right form control (text, number, boolean).
 */
export type ValueInputKind = "text" | "number" | "boolean";

export function valueInputKindForType(type: Type | undefined): ValueInputKind {
  if (!type) return "text";
  const kind = type.typeKind;

  if (kind.case === "primitive" || kind.case === "wrapper") {
    switch (kind.value) {
      case 1:
        return "boolean";
      case 2:
      case 3:
      case 4:
        return "number";
      default:
        return "text";
    }
  }

  return "text";
}
