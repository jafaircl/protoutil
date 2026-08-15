/**
 * Returns whether a pattern belongs to the portable ASCII subset shared by
 * CEL RE2, PostgreSQL ARE, and MongoDB PCRE2.
 *
 * The subset deliberately excludes engine-specific escapes, Unicode behavior,
 * lookaround, and oversized counted repetition. Passing this test therefore
 * means each profile can pass the original pattern to its native regex engine
 * without changing the intended match language.
 */
export function isPortableRegex(pattern: string): boolean {
  if (
    [...pattern].some((character) => character === "\0" || character.codePointAt(0)! > 0x7f) ||
    pattern.includes("[[:") ||
    pattern.includes("[[.") ||
    pattern.includes("[[=") ||
    hasOversizedQuantifier(pattern)
  ) {
    return false;
  }
  if (/\(\?/.test(pattern) || /\\[A-Za-z0-9]/.test(pattern)) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns whether a pattern belongs to MongoDB's resource-bounded CEL subset.
 *
 * MongoDB uses a backtracking PCRE2 engine. This subset excludes constructs
 * whose CEL-equivalent language would still permit excessive backtracking.
 */
export function isMongoDbRegex(pattern: string): boolean {
  if (!isPortableRegex(pattern)) return false;
  let inCharacterClass = false;
  let unboundedQuantifiers = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === "\\") {
      const escaped = pattern[index + 1];
      const allowed = inCharacterClass ? "\\]-^" : "\\^$.*+?()[]{}|-";
      if (escaped === undefined || !allowed.includes(escaped)) return false;
      index += 1;
      continue;
    }
    if (character === "[") {
      if (inCharacterClass) return false;
      inCharacterClass = true;
      continue;
    }
    if (character === "]") {
      inCharacterClass = false;
      continue;
    }
    if (inCharacterClass) continue;
    if (character === "(" || character === ")" || character === "|" || character === "$") {
      return false;
    }
    if (character === "^" && index !== 0) return false;
    if (character === "*" || character === "+") {
      unboundedQuantifiers += 1;
    } else if (character === "{" && /\d/.test(pattern[index + 1] ?? "")) {
      const end = pattern.indexOf("}", index + 1);
      if (end < 0) return false;
      const bounds = pattern.slice(index + 1, end).split(",");
      if (bounds.length === 2 && bounds[1] === "") unboundedQuantifiers += 1;
      index = end;
    }
    if (unboundedQuantifiers > 1) return false;
  }
  return !inCharacterClass;
}

/** Detects numeric bounds above the minimum limit accepted by every target. */
function hasOversizedQuantifier(pattern: string): boolean {
  let isCharacterClass = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "\\") {
      index += 1;
    } else if (character === "[") {
      isCharacterClass = true;
    } else if (character === "]") {
      isCharacterClass = false;
    } else if (!isCharacterClass && character === "{" && /\d/.test(pattern[index + 1] ?? "")) {
      const end = pattern.indexOf("}", index + 1);
      if (end < 0) return false;
      const bounds = pattern.slice(index + 1, end).split(",");
      if (bounds.some((bound) => bound.length > 0 && Number(bound) > 255)) return true;
      index = end;
    }
  }
  return false;
}
