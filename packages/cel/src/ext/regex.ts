import { RE2JS } from "@bufbuild/re2";
import type { LibraryAliaser, LibraryVersioner, SingletonLibrary } from "../cel/library.js";
import { func, overload } from "../common/decls.js";
import { err } from "../common/types/err.js";
import type { Int } from "../common/types/int.js";
import { stringList } from "../common/types/list.js";
import { OptionalNone, optionalOf } from "../common/types/optional.js";
import { DefaultTypeAdapter } from "../common/types/provider.js";
import type { Val } from "../common/types/ref/index.js";
import { String as CelString } from "../common/types/string.js";
import { IntType, listType, optionalType, StringType } from "../common/types/types.js";

/** regexReplace is the namespaced replacement function. */
const regexReplace = "regex.replace";
/** regexExtract is the namespaced first-match function. */
const regexExtract = "regex.extract";
/** regexExtractAll is the namespaced all-matches function. */
const regexExtractAll = "regex.extractAll";

/** RegexOptions configures the regular-expression extension library. */
export interface RegexOptions {
  /** version records the selected extension version. */
  readonly version?: number;
}

/** RegexLibrary describes the singleton regex extension and serialization metadata. */
export type RegexLibrary = SingletonLibrary & LibraryAliaser & LibraryVersioner;

/**
 * regex configures namespaced RE2-compatible replacement and extraction functions.
 *
 * This library depends on the CEL optional type library.
 */
export function regex(options: RegexOptions = {}): RegexLibrary {
  const version = options.version ?? Number.MAX_SAFE_INTEGER;
  return {
    libraryAlias: "regex",
    libraryName: "cel.lib.ext.regex",
    libraryVersion: version,
    requiredLibraries: ["cel.lib.optional"],
    compileOptions: {
      functions: [
        func(regexExtract, {
          overloads: [
            overload(
              "regex_extract_string_string",
              [StringType, StringType],
              optionalType(StringType),
              { binaryBinding: extract },
            ),
          ],
        }),
        func(regexExtractAll, {
          overloads: [
            overload(
              "regex_extractAll_string_string",
              [StringType, StringType],
              listType(StringType),
              { binaryBinding: extractAll },
            ),
          ],
        }),
        func(regexReplace, {
          overloads: [
            overload(
              "regex_replace_string_string_string",
              [StringType, StringType, StringType],
              StringType,
              {
                functionBinding: (...args) =>
                  replaceRegex({
                    count: -1,
                    pattern: args[1]!,
                    replacement: args[2]!,
                    target: args[0]!,
                  }),
              },
            ),
            overload(
              "regex_replace_string_string_string_int",
              [StringType, StringType, StringType, IntType],
              StringType,
              {
                functionBinding: (...args) =>
                  replaceRegex({
                    count: Number((args[3] as Int).value()),
                    pattern: args[1]!,
                    replacement: args[2]!,
                    target: args[0]!,
                  }),
              },
            ),
          ],
        }),
      ],
    },
    programOptions: {},
  };
}

/** extract returns the first whole match or sole capture group as an optional string. */
function extract(target: Val, pattern: Val): Val {
  const source = (pattern as CelString).value();
  const compiled = compilePattern(source);
  if (compiled instanceof Error) {
    return err(compiled.message);
  }
  if (compiled.groupCount > 1) {
    return err(`regular expression has more than one capturing group: ${JSON.stringify(source)}`);
  }
  const match = compiled.regex.exec((target as CelString).value());
  if (!match) {
    return OptionalNone;
  }
  const value = compiled.groupCount === 1 ? (match[1] ?? "") : match[0];
  return value === "" && compiled.groupCount === 1
    ? OptionalNone
    : optionalOf(new CelString(value));
}

/** extractAll returns every whole match or sole non-empty capture group. */
function extractAll(target: Val, pattern: Val): Val {
  const source = (pattern as CelString).value();
  const compiled = compilePattern(source, true);
  if (compiled instanceof Error) {
    return err(compiled.message);
  }
  if (compiled.groupCount > 1) {
    return err(`regular expression has more than one capturing group: ${JSON.stringify(source)}`);
  }
  const values: string[] = [];
  for (const match of (target as CelString).value().matchAll(compiled.regex)) {
    const value = compiled.groupCount === 1 ? (match[1] ?? "") : match[0];
    if (compiled.groupCount === 0 || value !== "") {
      values.push(value);
    }
  }
  return stringList(DefaultTypeAdapter, values);
}

/** replaceRegex replaces non-overlapping matches and validates CEL-Go backreferences. */
function replaceRegex(options: {
  count: number;
  pattern: Val;
  replacement: Val;
  target: Val;
}): Val {
  const target = (options.target as CelString).value();
  if (options.count === 0) {
    return new CelString(target);
  }
  const source = (options.pattern as CelString).value();
  const compiled = compilePattern(source, true);
  if (compiled instanceof Error) {
    return err(compiled.message);
  }
  const replacement = (options.replacement as CelString).value();
  const replacementError = validateReplacement(replacement, compiled.groupCount);
  if (replacementError) {
    return err(replacementError);
  }
  const limit = options.count < 0 ? Number.MAX_SAFE_INTEGER : options.count;
  let replacements = 0;
  return new CelString(
    target.replace(compiled.regex, (...matchArgs: unknown[]) => {
      if (replacements >= limit) {
        return String(matchArgs[0]);
      }
      replacements += 1;
      return expandReplacement(replacement, matchArgs);
    }),
  );
}

/** CompiledPattern contains a JavaScript matcher validated by the RE2 parser. */
interface CompiledPattern {
  /** groupCount contains the number of capturing groups. */
  groupCount: number;
  /** regex performs extraction after RE2 syntax validation. */
  regex: RegExp;
}

/** JavaScriptPattern contains RE2 source translated to JavaScript's matcher configuration. */
interface JavaScriptPattern {
  /** flags contains JavaScript-compatible regular-expression flags. */
  flags: string;
  /** source contains JavaScript-compatible regular-expression source. */
  source: string;
}

/** compilePattern validates RE2 syntax and creates an extraction-capable matcher. */
function compilePattern(source: string, global = false): CompiledPattern | Error {
  try {
    const re2 = RE2JS.compile(source);
    const javascript = javascriptPattern(source, global);
    return {
      groupCount: re2.groupCount(),
      regex: new RegExp(javascript.source, javascript.flags),
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    // RE2JS exposes the same complete parser diagnostic as Go's regexp package, including the
    // `error parsing regexp` prefix and quoted malformed fragment.
    return new Error(message);
  }
}

/**
 * javascriptPattern translates RE2 constructs with direct JavaScript equivalents.
 *
 * RE2's leading mode modifiers apply to the remaining pattern. JavaScript represents the same
 * case-insensitive, multiline, and dot-all modes as flags on the compiled expression.
 */
function javascriptPattern(source: string, global: boolean): JavaScriptPattern {
  const flags = new Set(global ? ["g", "u"] : ["u"]);
  const mode = /^\(\?([ims]+)\)/.exec(source);
  if (mode) {
    for (const flag of mode[1]!) {
      flags.add(flag);
    }
    source = source.slice(mode[0].length);
  }
  return {
    flags: [...flags].join(""),
    source: source.replace(/\(\?P<([^>]+)>/g, "(?<$1>"),
  };
}

/** validateReplacement checks numeric backreferences and backslash escaping. */
function validateReplacement(replacement: string, groupCount: number): string | undefined {
  const chars = Array.from(replacement);
  for (let index = 0; index < chars.length; index += 1) {
    if (chars[index] !== "\\") {
      continue;
    }
    if (index + 1 >= chars.length) {
      return `invalid replacement string: '${replacement}' \\ not allowed at end`;
    }
    const next = chars[index + 1]!;
    index += 1;
    if (next === "\\") {
      continue;
    }
    if (!/^\d$/.test(next)) {
      return `invalid replacement string: '${replacement}' \\ must be followed by a digit or \\`;
    }
    if (Number(next) > groupCount) {
      return `replacement string references group ${next} but regex has only ${groupCount} group(s)`;
    }
  }
  return undefined;
}

/** expandReplacement substitutes CEL-Go numeric capture references in one match. */
function expandReplacement(replacement: string, matchArgs: unknown[]): string {
  let output = "";
  const chars = Array.from(replacement);
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!;
    if (char !== "\\") {
      output += char;
      continue;
    }
    // biome-ignore lint/suspicious/noAssignInExpressions: cel-go parity
    const next = chars[(index += 1)]!;
    output += next === "\\" ? "\\" : String(matchArgs[Number(next)] ?? "");
  }
  return output;
}
