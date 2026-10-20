import {
  Bool,
  BoolType,
  type String as CelString,
  err,
  func,
  memberOverload,
  opaqueType,
  StringType,
  type Type,
  TypeType,
  type Val,
} from "@protoutil/cel";
import type { CelLibrary } from "./types.js";

const term = /^[a-z0-9]+$/;
const query = /^[a-z0-9]+(?: [a-z0-9]+)*$/;

/** Stable name of the library that every target binds to its own full-text storage. */
export const fullTextSearchLibraryName = "protoutil.celql.full_text_search";

/** Resolved overload that each target's full-text translation binds. */
export const fullTextIndexMatchesText = "full_text_index_matches_text";

/**
 * Opaque CEL type for a query field that a target's full-text index covers.
 *
 * The value is the set of terms that the index holds for one record. Each
 * profile documents the storage and index configuration that its target
 * requires for this type. Do not expose this type for a field whose index
 * stems terms, applies a stop-word list, or applies language-specific
 * tokenization, because no target reproduces those rules portably.
 */
export const FullTextIndexType = opaqueType("protoutil.celql.FullTextIndex");

/**
 * Reports whether a query stays inside the portable full-text search domain.
 *
 * The domain is one or more lowercase ASCII alphanumeric terms separated by one
 * ASCII space. Every target binds this form without exposing its own query
 * operators, stop-word list, stemmer, or language configuration.
 */
export function isFullTextQuery(value: string): boolean {
  return query.test(value);
}

/** Splits a query that `isFullTextQuery` accepts into its terms. */
export function fullTextQueryTerms(value: string): string[] {
  return value.split(" ");
}

/**
 * CEL runtime value for a `FullTextIndexType` query field.
 *
 * The value carries no position, frequency, weight, or ranking information,
 * because no target reproduces those uniformly.
 */
export class FullTextIndexValue implements Val {
  /**
   * Creates a canonical indexed term set.
   *
   * Throws when a term is outside the lowercase ASCII alphanumeric domain.
   *
   * @param terms Terms that the target's index holds for the field.
   */
  public constructor(terms: readonly string[]) {
    if (terms.some((value) => !term.test(value))) {
      throw new Error("a full-text index requires lowercase ASCII alphanumeric terms");
    }
    this.terms = [...new Set(terms)].sort();
  }

  /** Sorted, duplicate-free terms that form this value's comparison domain. */
  public readonly terms: readonly string[];

  /** Returns this value for its own native type and rejects other conversions. */
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === FullTextIndexValue || typeDesc === undefined) return this;
    throw new Error(`type conversion from '${FullTextIndexType.typeName()}' is not supported`);
  }

  /** Converts only to this opaque CEL type or CEL's type value. */
  public convertToType(typeValue: Type): Val {
    if (typeValue === FullTextIndexType) return this;
    if (typeValue === TypeType) return FullTextIndexType;
    return err(
      "type conversion error from '%s' to '%s'",
      FullTextIndexType.typeName(),
      typeValue.typeName(),
    );
  }

  /** Compares canonical term sets. */
  public equal(other: Val): Val {
    return new Bool(
      other instanceof FullTextIndexValue &&
        this.terms.length === other.terms.length &&
        this.terms.every((value, index) => value === other.terms[index]),
    );
  }

  /** Returns the opaque CEL type of this value. */
  public type(): Type {
    return FullTextIndexType;
  }

  /** Returns the canonical term sequence for CEL-native consumers. */
  public value(): unknown {
    return this.terms;
  }

  /** Reports whether every query term occurs in this value's term set. */
  public matchesText(value: string): boolean {
    return (
      isFullTextQuery(value) && fullTextQueryTerms(value).every((item) => this.terms.includes(item))
    );
  }
}

/**
 * Returns the CEL declarations and evaluation bindings of the full-text library.
 *
 * A profile binding adds the target translation that preserves these semantics.
 * Callers that only evaluate CEL, such as a differential test oracle, select
 * this library directly.
 */
export function fullTextSearchLibrary(): CelLibrary {
  return celLibrary;
}

const celLibrary: CelLibrary = {
  libraryName: fullTextSearchLibraryName,
  libraryVersion: 1,
  programOptions: {},
  compileOptions: {
    types: [FullTextIndexType],
    functions: [
      func("matchesText", {
        overloads: [
          memberOverload(fullTextIndexMatchesText, [FullTextIndexType, StringType], BoolType, {
            binaryBinding: (value, search) =>
              new Bool((value as FullTextIndexValue).matchesText((search as CelString).value())),
          }),
        ],
      }),
    ],
  },
};
