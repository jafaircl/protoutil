/* eslint-disable @typescript-eslint/no-explicit-any */
import { LibrarySubset } from '../common/env/env.js';
import { stdFunctions, stdTypes } from '../common/stdlib.js';
import { isFunction, isNil } from '../common/utils.js';
import { AllMacros, Macro } from '../parser/macro.js';
import { FunctionDecl } from './cel.js';
import { EnvOption, macros } from './options.js';

/**
 * These enums enable optional behavior in the library.  See the documentation
 * for each constant to see its effects, compatibility restrictions, and
 * standard conformance.
 */
export enum Feature {
  /**
   * Enable the tracking of function call expressions replaced by macros.
   */
  EnableMacroCallTracking,

  /**
   * Enable the use of cross-type numeric comparisons at the type-checker.
   */
  CrossTypeNumericComparisions,

  /**
   * Enable eager validation of declarations to ensure that Env values
   * created with `Extend` inherit a validated list of declarations from the
   * parent Env.
   */
  EagerlyValidateDeclarations,

  /**
   * Enable the use of the default UTC timezone when a timezone is not
   * specified on a CEL timestamp operation. This fixes the scenario where
   * the input time is not already in UTC.
   */
  DefaultUTCTimeZone,

  /**
   * Enable the serialization of logical operator ASTs as variadic calls, thus
   * compressing the logic graph to a single call when multiple like-operator
   * expressions occur: e.g. a && b && c && d -> call(_&&_, [a, b, c, d])
   */
  VariadicLogicalASTs,

  /**
   * Enable error generation when a presence test or optional field selection
   * is performed on a primitive type.
   */
  EnableErrorOnBadPresenceTest,

  /**
   * Enable escape syntax for field identifiers (`).
   */
  IdentEscapeSyntax,
}

const featureIDsToNames = new Map([
  [Feature.EnableMacroCallTracking, 'cel.feature.macro_call_tracking'],
  [Feature.CrossTypeNumericComparisions, 'cel.feature.cross_type_numeric_comparisons'],
  [Feature.IdentEscapeSyntax, 'cel.feature.backtick_escape_syntax'],
]);

export function featureNameByID(id: Feature): string | undefined {
  return featureIDsToNames.get(id);
}

export function featureIDByName(name: string): Feature | undefined {
  for (const [id, n] of featureIDsToNames.entries()) {
    if (n === name) {
      return id;
    }
  }
  return undefined;
}

/**
 * Library provides a collection of EnvOption and ProgramOption values used to
 * configure a CEL environment for a particular use case or with a related set
 * of functionality.
 *
 * Note, the ProgramOption values provided by a library are expected to be
 * static and not vary between calls to Env.Program(). If there is a need for
 * such dynamic configuration, prefer to configure these options outside the
 * Library and within the Env.Program() call directly.
 */
export interface Library {
  /**
   * CompileOptions returns a collection of functional options for configuring
   * the Parse / Check environment.
   */
  compileOptions(): EnvOption[];

  /**
   * ProgramOptions returns a collection of functional options which should be
   * included in every Program generated from the Env.Program() call.
   */
  programOptions(): any[]; // TODO: need to define this type
}

export function isLibrary(value: any): value is Library {
  return value && isFunction(value['compileOptions']) && isFunction(value['programOptions']);
}

/**
 * SingletonLibrary refines the Library interface to ensure that libraries in
 * this format are only configured once within the environment.
 */
export interface SingletonLibrary extends Library {
  /**
   * LibraryName provides a namespaced name which is used to check whether the
   * library has already
   */
  libraryName(): string;
}

export function isSingletonLibrary(value: any): value is SingletonLibrary {
  return value && isFunction(value['libraryName']) && isLibrary(value);
}

/**
 * LibraryAliaser generates a simple named alias for the library, for use during environment serialization.
 */
export interface LibraryAliaser {
  libraryAlias(): string;
}

export function isLibraryAliaser(value: any): value is LibraryAliaser {
  return value && isFunction(value['libraryAlias']);
}

/**
 * LibrarySubsetter provides the subset description associated with the library, nil if not subset.
 */
export interface LibrarySubsetter {
  librarySubset(): LibrarySubset;
}

export function isLibrarySubsetter(value: any): value is LibrarySubsetter {
  return value && isFunction(value['librarySubset']);
}

/**
 * LibraryVersioner provides a version number for the library.
 *
 * If not implemented, the library version will be flagged as 'latest' during environment serialization.
 */
export interface LibraryVersioner {
  libraryVersion(): number;
}

export function isLibraryVersioner(value: any): value is LibraryVersioner {
  return value && isFunction(value['libraryVersion']);
}

/**
 * Lib creates an EnvOption out of a Library, allowing libraries to be provided
 * as functional args, and to be linked to each other.
 */
export function lib(l: Library): EnvOption {
  return (e) => {
    if (isSingletonLibrary(l)) {
      if (e.hasLibrary(l.libraryName())) {
        return e;
      }
      e.libraries.set(l.libraryName(), l);
    }
    for (const opt of l.compileOptions()) {
      e = opt(e);
    }
    e.progOpts.push(...l.programOptions());
    return e;
  };
}

/**
 * StdLibOption specifies a functional option for configuring the standard CEL library.
 */
export type StdLibOption = (lib: stdLibrary) => stdLibrary;

/**
 * StdLibSubset configures the standard library to use a subset of its functions and macros.
 *
 * Since the StdLib is a singleton library, only the first instance of the StdLib() environment options
 * will be configured on the environment which means only the StdLibSubset() initially configured with
 * the library will be used.
 */
export function stdLibSubset(subset: LibrarySubset): StdLibOption {
  return (lib) => {
    lib.subset = subset;
    return lib;
  };
}

/**
 * StdLib returns an EnvOption for the standard library of CEL functions and
 * macros.
 */
export function StdLib(...opts: StdLibOption[]): EnvOption {
  const l = new stdLibrary();
  for (const opt of opts) {
    opt(l);
  }
  return lib(l);
}

/**
 * StdLibrary implements the Library interface and provides functional options
 * for the core CEL features documented in the specification.
 */
export class stdLibrary implements SingletonLibrary {
  subset?: LibrarySubset;

  libraryName() {
    return 'cel.lib.std';
  }

  /**
   * LibraryAlias returns the simple name of the library.
   */
  libraryAlias(): string {
    return 'stdlib';
  }

  /**
   * LibrarySubset returns the env.LibrarySubset definition associated with the CEL Library.
   */
  librarySubset(): LibrarySubset | undefined {
    return this.subset;
  }

  compileOptions(): EnvOption[] {
    let funcs = stdFunctions;
    let _macros = AllMacros;
    if (this.subset) {
      const subMacros = new Set<Macro>();
      for (const m of _macros) {
        if (this.subset.subsetMacro(m.function())) {
          subMacros.add(m);
        }
      }
      _macros = subMacros;
      const subFuncs: FunctionDecl[] = [];
      for (const fn of funcs) {
        if (this.subset.subsetFunction(fn)) {
          subFuncs.push(fn);
        }
      }
      funcs = subFuncs;
    }
    return [
      (e) => {
        if (this.subset) {
          const err = this.subset.validate();
          if (err) {
            throw err;
          }
        }
        // Set standard types
        for (const t of stdTypes) {
          e.variables.push(t);
        }
        // Set standard functions
        for (const fn of funcs) {
          const existing = e.functions.get(fn.name());
          if (!isNil(existing)) {
            existing.merge(fn);
          }
          e.functions.set(fn.name(), fn);
        }
        return e;
      },
      // Set standard macros
      macros(..._macros),
    ];
  }

  programOptions() {
    return [];
  }
}

// TODO: optionals and time-zoned timestamps
