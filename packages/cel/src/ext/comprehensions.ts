import type { LibraryAliaser, LibraryVersioner, SingletonLibrary } from "../cel/library.js";
import type { Expr } from "../common/ast/index.js";
import { ExprKind } from "../common/ast/index.js";
import { functionDecl, overload } from "../common/decls.js";
import * as operators from "../common/operators.js";
import { True } from "../common/types/bool.js";
import { isError } from "../common/types/err.js";
import { insertMapKeyValue } from "../common/types/map.js";
import type { Val } from "../common/types/ref/index.js";
import type { Mapper } from "../common/types/traits/index.js";
import { mapType, typeParamType } from "../common/types/types.js";
import { AccumulatorName, receiverMacro } from "../parser/macro.js";
import type { ExprHelper, Macro } from "../parser/options.js";

/** mapInsert is the internal map accumulator function used by transform macros. */
const mapInsert = "cel.@mapInsert";
/** mapInsertOverloadMap identifies map-to-map accumulator insertion. */
const mapInsertOverloadMap = "@mapInsert_map_map";
/** mapInsertOverloadKeyValue identifies key-value accumulator insertion. */
const mapInsertOverloadKeyValue = "@mapInsert_map_key_value";

/**
 * TwoVarComprehensionsOptions configures two-variable comprehension support.
 */
export interface TwoVarComprehensionsOptions {
  /** version limits the library to the selected extension version. */
  readonly version?: number;
}

/**
 * TwoVarComprehensionsLibrary describes the singleton two-variable comprehension library.
 */
export type TwoVarComprehensionsLibrary = SingletonLibrary & LibraryAliaser & LibraryVersioner;

/**
 * twoVarComprehensions introduces support for two-variable comprehensions.
 *
 * Lists expose their index and value, while maps expose their key and value. The library adds
 * `all`, `exists`, `existsOne`, `transformList`, `transformMap`, and `transformMapEntry` forms.
 */
export function twoVarComprehensions(
  options: TwoVarComprehensionsOptions = {},
): TwoVarComprehensionsLibrary {
  const version = options.version ?? Number.MAX_SAFE_INTEGER;
  const keyType = typeParamType("K");
  const valueType = typeParamType("V");
  const genericMap = mapType(keyType, valueType);
  return {
    libraryAlias: "comprehensions",
    libraryName: "cel.lib.ext.comprev2",
    libraryVersion: version,
    compileOptions: {
      functions: [
        functionDecl(mapInsert, {
          overloads: [
            overload(mapInsertOverloadKeyValue, [genericMap, keyType, valueType], genericMap, {
              functionBinding: insertKeyValue,
            }),
            overload(mapInsertOverloadMap, [genericMap, genericMap], genericMap, {
              binaryBinding: insertMap,
            }),
          ],
        }),
      ],
      macros: {
        custom: comprehensionMacros(),
      },
    },
    programOptions: {},
  };
}

/**
 * comprehensionMacros returns every two-variable receiver macro signature.
 */
function comprehensionMacros(): Macro[] {
  return [
    receiverMacro("all", 3, expandAll),
    receiverMacro("exists", 3, expandExists),
    receiverMacro("existsOne", 3, expandExistsOne),
    receiverMacro("exists_one", 3, expandExistsOne),
    receiverMacro("transformList", 3, expandTransformList),
    receiverMacro("transformList", 4, expandTransformList),
    receiverMacro("transformMap", 3, expandTransformMap),
    receiverMacro("transformMap", 4, expandTransformMap),
    receiverMacro("transformMapEntry", 3, expandTransformMapEntry),
    receiverMacro("transformMapEntry", 4, expandTransformMapEntry),
  ];
}

/**
 * expandAll generates a short-circuiting logical-AND comprehension.
 */
function expandAll(helper: ExprHelper, target: Expr | undefined, args: Expr[]): Expr | Error {
  if (!target) {
    return helper.error(0, "missing macro target");
  }
  const variables = extractIterVars(helper, args);
  if (variables instanceof Error) {
    return variables;
  }
  return helper.comprehensionTwoVar(
    target,
    variables[0],
    variables[1],
    helper.accuIdentName(),
    helper.literal(true),
    helper.call(operators.NotStrictlyFalse, helper.accuIdent()),
    helper.call(operators.LogicalAnd, helper.accuIdent(), args[2]!),
    helper.accuIdent(),
  );
}

/**
 * expandExists generates a short-circuiting logical-OR comprehension.
 */
function expandExists(helper: ExprHelper, target: Expr | undefined, args: Expr[]): Expr | Error {
  if (!target) {
    return helper.error(0, "missing macro target");
  }
  const variables = extractIterVars(helper, args);
  if (variables instanceof Error) {
    return variables;
  }
  return helper.comprehensionTwoVar(
    target,
    variables[0],
    variables[1],
    helper.accuIdentName(),
    helper.literal(false),
    helper.call(operators.NotStrictlyFalse, helper.call(operators.LogicalNot, helper.accuIdent())),
    helper.call(operators.LogicalOr, helper.accuIdent(), args[2]!),
    helper.accuIdent(),
  );
}

/**
 * expandExistsOne generates a counting comprehension which requires exactly one match.
 */
function expandExistsOne(helper: ExprHelper, target: Expr | undefined, args: Expr[]): Expr | Error {
  if (!target) {
    return helper.error(0, "missing macro target");
  }
  const variables = extractIterVars(helper, args);
  if (variables instanceof Error) {
    return variables;
  }
  return helper.comprehensionTwoVar(
    target,
    variables[0],
    variables[1],
    helper.accuIdentName(),
    helper.literal(0n),
    helper.literal(true),
    helper.call(
      operators.Conditional,
      args[2]!,
      helper.call(operators.Add, helper.accuIdent(), helper.literal(1n)),
      helper.accuIdent(),
    ),
    helper.call(operators.Equals, helper.accuIdent(), helper.literal(1n)),
  );
}

/**
 * expandTransformList converts a list or map into a optionally filtered list.
 */
function expandTransformList(
  helper: ExprHelper,
  target: Expr | undefined,
  args: Expr[],
): Expr | Error {
  return expandTransform({ args, helper, kind: "list", target });
}

/**
 * expandTransformMap preserves each source key and transforms its value.
 */
function expandTransformMap(
  helper: ExprHelper,
  target: Expr | undefined,
  args: Expr[],
): Expr | Error {
  return expandTransform({ args, helper, kind: "map", target });
}

/**
 * expandTransformMapEntry merges each transformed single-entry map into the accumulator.
 */
function expandTransformMapEntry(
  helper: ExprHelper,
  target: Expr | undefined,
  args: Expr[],
): Expr | Error {
  return expandTransform({ args, helper, kind: "entry", target });
}

/**
 * TransformExpansionOptions contains the shared transform macro inputs.
 */
interface TransformExpansionOptions {
  /** args contains iteration variables, optional filter, and transformation. */
  readonly args: Expr[];
  /** helper builds parser-owned expressions. */
  readonly helper: ExprHelper;
  /** kind selects list, map-value, or map-entry transformation. */
  readonly kind: "entry" | "list" | "map";
  /** target is the source list or map. */
  readonly target: Expr | undefined;
}

/**
 * expandTransform implements the common filtered transformation control flow.
 */
function expandTransform(options: TransformExpansionOptions): Expr | Error {
  const { args, helper, kind, target } = options;
  if (!target) {
    return helper.error(0, "missing macro target");
  }
  const variables = extractIterVars(helper, args);
  if (variables instanceof Error) {
    return variables;
  }
  const transform = args.length === 4 ? args[3]! : args[2]!;
  const filter = args.length === 4 ? args[2] : undefined;
  let step: Expr;
  let initial: Expr;
  if (kind === "list") {
    initial = helper.list();
    step = helper.call(operators.Add, helper.accuIdent(), helper.list(transform));
  } else {
    initial = helper.map();
    step =
      kind === "map"
        ? helper.call(mapInsert, helper.accuIdent(), helper.ident(variables[0]), transform)
        : helper.call(mapInsert, helper.accuIdent(), transform);
  }
  if (filter) {
    step = helper.call(operators.Conditional, filter, step, helper.accuIdent());
  }
  return helper.comprehensionTwoVar(
    target,
    variables[0],
    variables[1],
    helper.accuIdentName(),
    initial,
    helper.literal(true),
    step,
    helper.accuIdent(),
  );
}

/**
 * extractIterVars validates the two simple and distinct iteration identifiers.
 */
function extractIterVars(helper: ExprHelper, args: Expr[]): [string, string] | Error {
  const first = extractIterVar(helper, args[0]!);
  if (first instanceof Error) {
    return first;
  }
  const second = extractIterVar(helper, args[1]!);
  if (second instanceof Error) {
    return second;
  }
  if (first === second) {
    return helper.error(args[1]!.id(), `duplicate variable name: ${first}`);
  }
  if (first === helper.accuIdentName() || first === AccumulatorName) {
    return helper.error(args[0]!.id(), "iteration variable overwrites accumulator variable");
  }
  if (second === helper.accuIdentName() || second === AccumulatorName) {
    return helper.error(args[1]!.id(), "iteration variable overwrites accumulator variable");
  }
  return [first, second];
}

/**
 * extractIterVar returns a simple identifier or a parser-anchored macro error.
 */
function extractIterVar(helper: ExprHelper, expression: Expr): string | Error {
  if (expression.kind() !== ExprKind.Ident) {
    return helper.error(expression.id(), "argument must be a simple name");
  }
  return expression.asIdent() ?? helper.error(expression.id(), "argument must be a simple name");
}

/**
 * insertKeyValue inserts one key-value pair into a comprehension map accumulator.
 */
function insertKeyValue(...args: Val[]): Val {
  return insertMapKeyValue({
    key: args[1]!,
    map: args[0] as Mapper,
    value: args[2]!,
  });
}

/**
 * insertMap merges a transformed map into a comprehension map accumulator.
 */
function insertMap(target: Val, update: Val): Val {
  let output = target as Mapper;
  const source = update as Mapper;
  const iterator = source.iterator();
  while (iterator.hasNext() === True) {
    const key = iterator.next();
    const inserted = insertMapKeyValue({ key, map: output, value: source.get(key) });
    if (isError(inserted)) {
      return inserted;
    }
    output = inserted as Mapper;
  }
  return output;
}
