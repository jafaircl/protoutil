import {
  AllMacro,
  crossTypeNumericComparisons,
  enableMacroCallTracking,
  EnvOption,
  ExistsMacro,
  ExistsOneMacro,
  func,
  lib,
  macros,
  overload,
  SingletonLibrary,
  StringType,
} from '@bearclaw/cel';
import { defaultLibraryFunctions } from '../default/library.js';
import {
  LIST_TO_LIST_OVERLOAD,
  STRING_TO_LIST_OVERLOAD,
  TYPE_CONVERT_LIST_OVERLOAD,
  UNNEST_OVERLOAD,
} from '../overloads.js';
import { listOfA } from '../types.js';

export const postgresLibraryFunctions = new Map(defaultLibraryFunctions);

postgresLibraryFunctions.set(
  TYPE_CONVERT_LIST_OVERLOAD,
  func(
    TYPE_CONVERT_LIST_OVERLOAD,
    overload(LIST_TO_LIST_OVERLOAD, [listOfA], listOfA),
    overload(STRING_TO_LIST_OVERLOAD, [StringType], listOfA)
  )
);
postgresLibraryFunctions.set(
  UNNEST_OVERLOAD,
  func(UNNEST_OVERLOAD, overload(UNNEST_OVERLOAD, [listOfA], listOfA))
);

export const postgresLibraryTypes = new Map<string, EnvOption>();

class postgresLib implements SingletonLibrary {
  libraryName() {
    return 'celql.lib.postgres';
  }

  compileOptions(): EnvOption[] {
    return [
      crossTypeNumericComparisons(true),
      enableMacroCallTracking(),
      // Set default functions
      ...postgresLibraryFunctions.values(),
      // Set default types
      ...postgresLibraryTypes.values(),
      // Set macros
      macros(ExistsMacro, ExistsOneMacro, AllMacro),
    ];
  }

  programOptions() {
    return [];
  }
}

/**
 * PostgresLib implements the Library interface and provides functional options
 * for the documented PostgreSQL features.
 */
export function PostgresLib() {
  return lib(new postgresLib());
}
