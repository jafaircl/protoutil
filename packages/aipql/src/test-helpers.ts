import {
  BOOL,
  check,
  type Decl,
  func,
  ident,
  memberOverload,
  parse,
  STRING,
} from "@protoutil/aip/filtering";

export function checked(str: string, extraDecls?: Decl[]) {
  const parsed = parse(str);
  const { checkedExpr } = check(parsed, { decls: extraDecls });
  return checkedExpr;
}

/**
 * Test-only declarations for a custom `fuzzy` member function:
 *   title.fuzzy("pattern") → bool
 */
export const fuzzyDecls: Decl[] = [
  ident("title", STRING),
  func("fuzzy", memberOverload("string_fuzzy", [STRING, STRING], BOOL, "Fuzzy string match")),
];
