import { check, parse } from "@protoutil/aip/filtering";

export function checked(str: string) {
  const parsed = parse(str);
  const { checkedExpr } = check(parsed);
  return checkedExpr;
}
