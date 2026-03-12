import { check, type Decl, parse } from "@protoutil/aip/filtering";

export function checked(str: string, extraDecls?: Decl[]) {
  const parsed = parse(str);
  const { checkedExpr } = check(parsed, extraDecls);
  return checkedExpr;
}
