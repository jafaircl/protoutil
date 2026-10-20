import {
  Bool,
  BoolType,
  type String as CelString,
  func,
  memberOverload,
  StringType,
} from "@protoutil/cel";
import type { CelLibrary } from "./types.js";

/** Stable name of the library that every target binds to its own case-folding syntax. */
export const caseInsensitiveStringsLibraryName = "protoutil.celql.case_insensitive_strings";

/** The CEL member forms that share one ASCII-only case-folding contract. */
export const caseInsensitivePatterns = [
  ["starts_with_ignore_case_string", "startsWith"],
  ["ends_with_ignore_case_string", "endsWith"],
  ["contains_ignore_case_string", "contains"],
] as const;

/** One operation name accepted by the shared case-insensitive string contract. */
export type CaseInsensitivePatternKind = (typeof caseInsensitivePatterns)[number][1];

/** Creates CEL declarations and evaluation bindings for the ASCII-only library contract. */
export function caseInsensitiveStringCompileOptions() {
  return {
    functions: caseInsensitivePatterns.map(([overloadId, kind]) =>
      func(`${kind}IgnoreCase`, {
        overloads: [
          memberOverload(overloadId, [StringType, StringType], BoolType, {
            binaryBinding: (value, search) =>
              new Bool(
                appliesCaseInsensitivePattern(
                  asciiLower((value as CelString).value()),
                  asciiLower((search as CelString).value()),
                  kind,
                ),
              ),
          }),
        ],
      }),
    ),
  };
}

/**
 * Returns the CEL declarations and evaluation bindings of the case-insensitive library.
 *
 * A profile binding adds the target translation that preserves these semantics.
 * Callers that only evaluate CEL, such as a differential test oracle, select
 * this library directly.
 */
export function caseInsensitiveStringsLibrary(): CelLibrary {
  return celLibrary;
}

const celLibrary: CelLibrary = {
  libraryName: caseInsensitiveStringsLibraryName,
  libraryVersion: 1,
  programOptions: {},
  compileOptions: caseInsensitiveStringCompileOptions(),
};

/** Applies the common CEL behavior after ASCII-only case folding. */
export function appliesCaseInsensitivePattern(
  value: string,
  search: string,
  kind: CaseInsensitivePatternKind,
): boolean {
  if (kind === "startsWith") return value.startsWith(search);
  if (kind === "endsWith") return value.endsWith(search);
  return value.includes(search);
}

/** Converts ASCII upper-case letters while leaving every other code point unchanged. */
export function asciiLower(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

/** Reports whether a value stays in the target-independent ASCII contract domain. */
export function isAscii(value: string): boolean {
  return [...value].every((character) => character.codePointAt(0)! <= 0x7f);
}
