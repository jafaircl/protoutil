import { Bool, True } from "./bool.js";
import type { Val } from "./ref/index.js";
import type { Lister, Mapper } from "./traits/index.js";

interface formattable {
  format(sb: string[]): void;
}

/**
 * formatVal formats the value as a string. The result is only intended for human consumption and ignores errors.
 * Do not depend on the output being stable. It may change at any time.
 */
export function formatVal(val: Val): string {
  const sb: string[] = [];
  formatTo(sb, val);
  return sb.join("");
}

function formatTo(sb: string[], val: Val) {
  if (isFormattable(val)) {
    val.format(sb);
    return;
  }
  // All of the builtins implement formattable. Try to deal with traits.
  if (isLister(val)) {
    formatList(val, sb);
    return;
  }
  if (isMapper(val)) {
    formatMap(val, sb);
    return;
  }
  // This could be an error, unknown, opaque or object.
  // Unfortunately we have no consistent way of inspecting
  // opaque and object. So we just fallback to fmt.Stringer
  // and hope it is relavent.
  sb.push(`${val}`);
}

function isFormattable(value: Val): value is Val & formattable {
  return typeof (value as { format?: unknown }).format === "function";
}

function isLister(value: Val): value is Val & Lister {
  return typeof (value as { iterator?: unknown }).iterator === "function";
}

function isMapper(value: Val): value is Val & Mapper {
  return (
    typeof (value as { iterator?: unknown }).iterator === "function" &&
    typeof (value as { get?: unknown }).get === "function"
  );
}

function formatList(list: Lister, sb: string[]) {
  sb.push("[");
  const it = list.iterator();
  let first = true;
  while (isTrue(it.hasNext())) {
    if (!first) {
      sb.push(", ");
    }
    first = false;
    formatTo(sb, it.next());
  }
  sb.push("]");
}

function formatMap(map: Mapper, sb: string[]) {
  sb.push("{");
  const it = map.iterator();
  let first = true;
  while (isTrue(it.hasNext())) {
    if (!first) {
      sb.push(", ");
    }
    first = false;
    const key = it.next();
    formatTo(sb, key);
    sb.push(": ");
    formatTo(sb, map.get(key));
  }
  sb.push("}");
}

function isTrue(value: Val): boolean {
  return value instanceof Bool && value === True;
}
