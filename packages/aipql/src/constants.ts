// ---------------------------------------------------------------------------
// CEL operator function names (structural, never go through the function registry)
// ---------------------------------------------------------------------------
/** CEL function name for logical AND. */
export const FN_AND = "_&&_";
/** CEL function name for logical OR. */
export const FN_OR = "_||_";
/** CEL function name for logical NOT. */
export const FN_NOT = "@not";
/** CEL function name for equality. */
export const FN_EQ = "_==_";
/** CEL function name for inequality. */
export const FN_NEQ = "_!=_";
/** CEL function name for less-than. */
export const FN_LT = "_<_";
/** CEL function name for less-than-or-equal. */
export const FN_LTE = "_<=_";
/** CEL function name for greater-than. */
export const FN_GT = "_>_";
/** CEL function name for greater-than-or-equal. */
export const FN_GTE = "_>=_";
/** CEL function name used for the AIP-160 has operator (`:`). */
export const FN_HAS = "@in";
/** CEL function name for unary numeric negation. */
export const FN_NEGATE = "-_";
/** Overload ID for has-operator membership checks against lists. */
export const OL_IN_LIST = "in_list";
/** Overload ID for has-operator membership checks against maps. */
export const OL_IN_MAP = "in_map";
