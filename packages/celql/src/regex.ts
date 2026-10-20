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
    } else if (character === "{") {
      const bound = repetitionBound(pattern, index);
      // A brace that begins no well-formed repetition is a literal brace, so
      // scanning continues at the next character rather than jumping ahead.
      if (bound === undefined) continue;
      if (bound.maximum === undefined) unboundedQuantifiers += 1;
      index = bound.end;
    }
    if (unboundedQuantifiers > 1) return false;
  }
  return !inCharacterClass;
}

/** Largest counted repetition that every target engine accepts. */
const maximumRepetition = 255;

/** One counted repetition parsed from a pattern. */
interface RepetitionBound {
  /** Index of the closing brace. */
  end: number;
  /** Lower bound of the repetition. */
  minimum: number;
  /** Upper bound, or undefined where the repetition is unbounded. */
  maximum: number | undefined;
}

/**
 * Parses a counted repetition that starts at an opening brace.
 *
 * Returns undefined when the brace does not begin a well-formed `{n}`, `{n,}`,
 * or `{n,m}`, which every target engine reads as a literal brace. Scanning
 * must then continue at the next character: a brace span that merely reaches
 * some later `}` is not a repetition, and treating it as one would skip over
 * the repetitions between them.
 */
function repetitionBound(pattern: string, start: number): RepetitionBound | undefined {
  const end = pattern.indexOf("}", start + 1);
  if (end < 0) return undefined;
  const span = pattern.slice(start + 1, end);
  const match = /^(\d+)(?:,(\d*))?$/.exec(span);
  if (match === null) return undefined;
  return {
    end,
    minimum: Number(match[1]),
    maximum:
      match[2] === undefined ? Number(match[1]) : match[2] === "" ? undefined : Number(match[2]),
  };
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
    } else if (!isCharacterClass && character === "{") {
      const bound = repetitionBound(pattern, index);
      if (bound === undefined) continue;
      if (bound.minimum > maximumRepetition) return true;
      if (bound.maximum !== undefined && bound.maximum > maximumRepetition) return true;
      index = bound.end;
    }
  }
  return false;
}
