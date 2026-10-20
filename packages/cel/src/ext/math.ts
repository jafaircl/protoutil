import type { LibraryAliaser, LibraryVersioner, SingletonLibrary } from "../cel/library.js";
import {
  type AstNode,
  CallEstimate,
  type CostEstimator,
  type FunctionEstimator,
  fixedCostEstimate,
  fixedSizeEstimate,
  unknownSizeEstimate,
} from "../checker/cost.js";
import { type Expr, ExprKind } from "../common/ast/index.js";
import { func, overload } from "../common/decls.js";
import { Bool } from "../common/types/bool.js";
import { Double } from "../common/types/double.js";
import { err, isError } from "../common/types/err.js";
import { Int, IntNegOne, IntOne } from "../common/types/int.js";
import type { Val } from "../common/types/ref/index.js";
import type { Comparer, Lister } from "../common/types/traits/index.js";
import {
  BoolType,
  DoubleType,
  DynType,
  IntType,
  listType,
  UintType,
} from "../common/types/types.js";
import { Uint } from "../common/types/uint.js";
import type { FunctionTracker } from "../interpreter/runtime-cost.js";
import { receiverVarArgMacro } from "../parser/macro.js";
import type { Macro } from "../parser/options.js";

/** mathNamespace is the receiver required for the math macros. */
const mathNamespace = "math";
/** minFunction is the internal overload set used by `math.least`. */
const minFunction = "math.@min";
/** maxFunction is the internal overload set used by `math.greatest`. */
const maxFunction = "math.@max";
/** uint64Mask limits unsigned bit operations to CEL's uint64 range. */
const uint64Mask = (1n << 64n) - 1n;
/** int64Min is the one signed value whose absolute value overflows int64. */
const int64Min = -(1n << 63n);

/**
 * MathOptions configures the math extension library.
 */
export interface MathOptions {
  /**
   * version limits the library to functions introduced at or below the selected version.
   */
  readonly version?: number;
}

/**
 * MathLibrary describes the singleton math extension and its serialization metadata.
 */
export type MathLibrary = SingletonLibrary & LibraryAliaser & LibraryVersioner;

/**
 * math configures namespaced numeric macros and functions.
 *
 * Version zero provides `math.least` and `math.greatest`. Version one adds
 * rounding, floating-point inspection, signedness, and bitwise functions.
 * Version two adds `math.sqrt`.
 */
export function math(options: MathOptions = {}): MathLibrary {
  const version = options.version ?? Number.MAX_SAFE_INTEGER;
  const functions = [
    extremumDeclaration(minFunction, "min"),
    extremumDeclaration(maxFunction, "max"),
  ];
  if (version >= 1) {
    functions.push(
      unaryDoubleDeclaration({ id: "math_ceil_double", name: "math.ceil", operation: Math.ceil }),
      unaryDoubleDeclaration({
        id: "math_floor_double",
        name: "math.floor",
        operation: Math.floor,
      }),
      unaryDoubleDeclaration({
        id: "math_round_double",
        name: "math.round",
        operation: roundAwayFromZero,
      }),
      unaryDoubleDeclaration({
        id: "math_trunc_double",
        name: "math.trunc",
        operation: Math.trunc,
      }),
      unaryDoubleBooleanDeclaration({
        id: "math_isInf_double",
        name: "math.isInf",
        predicate: (value) => !Number.isFinite(value) && !Number.isNaN(value),
      }),
      unaryDoubleBooleanDeclaration({
        id: "math_isNaN_double",
        name: "math.isNaN",
        predicate: Number.isNaN,
      }),
      unaryDoubleBooleanDeclaration({
        id: "math_isFinite_double",
        name: "math.isFinite",
        predicate: Number.isFinite,
      }),
      func("math.abs", {
        overloads: [
          overload("math_abs_double", [DoubleType], DoubleType, { unaryBinding: absolute }),
          overload("math_abs_int", [IntType], IntType, { unaryBinding: absolute }),
          overload("math_abs_uint", [UintType], UintType, { unaryBinding: identity }),
        ],
      }),
      func("math.sign", {
        overloads: [
          overload("math_sign_double", [DoubleType], DoubleType, { unaryBinding: sign }),
          overload("math_sign_int", [IntType], IntType, { unaryBinding: sign }),
          overload("math_sign_uint", [UintType], UintType, { unaryBinding: sign }),
        ],
      }),
      binaryIntegerDeclaration({
        idName: "bitAnd",
        name: "math.bitAnd",
        operation: (left, right) => left & right,
      }),
      binaryIntegerDeclaration({
        idName: "bitOr",
        name: "math.bitOr",
        operation: (left, right) => left | right,
      }),
      binaryIntegerDeclaration({
        idName: "bitXor",
        name: "math.bitXor",
        operation: (left, right) => left ^ right,
      }),
      func("math.bitNot", {
        overloads: [
          overload("math_bitNot_int_int", [IntType], IntType, {
            unaryBinding: (value) => new Int(~(value as Int).value()),
          }),
          overload("math_bitNot_uint_uint", [UintType], UintType, {
            unaryBinding: (value) => new Uint(~(value as Uint).value() & uint64Mask),
          }),
        ],
      }),
      shiftDeclaration({
        direction: "left",
        idName: "bitShiftLeft",
        name: "math.bitShiftLeft",
      }),
      shiftDeclaration({
        direction: "right",
        idName: "bitShiftRight",
        name: "math.bitShiftRight",
      }),
    );
  }
  if (version >= 2) {
    functions.push(
      func("math.sqrt", {
        overloads: [
          overload("math_sqrt_double", [DoubleType], DoubleType, { unaryBinding: squareRoot }),
          overload("math_sqrt_int", [IntType], DoubleType, { unaryBinding: squareRoot }),
          overload("math_sqrt_uint", [UintType], DoubleType, { unaryBinding: squareRoot }),
        ],
      }),
    );
  }
  return {
    libraryAlias: "math",
    libraryName: "cel.lib.ext.math",
    libraryVersion: version,
    compileOptions: {
      functions,
      macros: {
        custom: [extremumMacro("least"), extremumMacro("greatest")],
      },
      cost:
        version >= 3
          ? {
              overloadCostEstimates: mathListCostEstimates(),
            }
          : undefined,
    },
    programOptions:
      version >= 3
        ? {
            costTracking: {
              overloadTrackers: mathListCostTrackers(),
            },
          }
        : {},
  };
}

/** mathListOverloads contains every list extremum overload with linear cost. */
const mathListOverloads = [
  "math_@min_list_double",
  "math_@min_list_int",
  "math_@min_list_uint",
  "math_@max_list_double",
  "math_@max_list_int",
  "math_@max_list_uint",
] as const;

/** estimateMathListCost computes one comparison per list element plus nominal call cost. */
const estimateMathListCost: FunctionEstimator = (estimator, _target, args) => {
  if (args.length !== 1) {
    return undefined;
  }
  const size = estimateMathNodeSize(estimator, args[0]!);
  const cost = size.asCost().add(fixedCostEstimate(1));
  return new CallEstimate(cost.Min, cost.Max, fixedSizeEstimate(1));
};

/** trackMathListCost computes one runtime comparison per list element plus nominal call cost. */
const trackMathListCost: FunctionTracker = {
  cost: ({ args }) => Number(((args[0] as Lister).size() as Int).value()) + 1,
};

/** mathListCostEstimates maps list extremum overloads to their shared checker estimator. */
function mathListCostEstimates(): Record<string, FunctionEstimator> {
  return Object.fromEntries(
    mathListOverloads.map((overloadId) => [overloadId, estimateMathListCost]),
  );
}

/** mathListCostTrackers maps list extremum overloads to their shared runtime tracker. */
function mathListCostTrackers(): Record<string, FunctionTracker> {
  return Object.fromEntries(mathListOverloads.map((overloadId) => [overloadId, trackMathListCost]));
}

/** estimateMathNodeSize returns a computed, hinted, or unknown list size. */
function estimateMathNodeSize(estimator: CostEstimator, node: AstNode) {
  return node.computedSize() ?? estimator.estimateSize(node) ?? unknownSizeEstimate();
}

/**
 * extremumDeclaration creates the internal overload set for a least or greatest macro expansion.
 */
function extremumDeclaration(name: string, operation: "max" | "min") {
  const pair = (left: Val, right: Val) => extremumPair(left, right, operation);
  return func(name, {
    singletonBinding: {
      func: (...args) =>
        args.length === 1 ? extremumSingle(args[0]!, operation) : pair(args[0]!, args[1]!),
    },
    overloads: [
      overload(`math_@${operation}_double`, [DoubleType], DoubleType),
      overload(`math_@${operation}_int`, [IntType], IntType),
      overload(`math_@${operation}_uint`, [UintType], UintType),
      overload(`math_@${operation}_double_double`, [DoubleType, DoubleType], DoubleType),
      overload(`math_@${operation}_int_int`, [IntType, IntType], IntType),
      overload(`math_@${operation}_uint_uint`, [UintType, UintType], UintType),
      overload(`math_@${operation}_int_uint`, [IntType, UintType], DynType),
      overload(`math_@${operation}_int_double`, [IntType, DoubleType], DynType),
      overload(`math_@${operation}_double_int`, [DoubleType, IntType], DynType),
      overload(`math_@${operation}_double_uint`, [DoubleType, UintType], DynType),
      overload(`math_@${operation}_uint_int`, [UintType, IntType], DynType),
      overload(`math_@${operation}_uint_double`, [UintType, DoubleType], DynType),
      overload(`math_@${operation}_list_double`, [listType(DoubleType)], DoubleType),
      overload(`math_@${operation}_list_int`, [listType(IntType)], IntType),
      overload(`math_@${operation}_list_uint`, [listType(UintType)], UintType),
    ],
  });
}

/**
 * extremumSingle accepts one numeric value or folds one list argument.
 */
function extremumSingle(value: Val, operation: "max" | "min"): Val {
  if (typeof (value as Partial<Lister>).iterator === "function") {
    return extremumList(value, operation);
  }
  return value instanceof Int || value instanceof Uint || value instanceof Double
    ? value
    : err(`no such overload: math.@${operation}`);
}

/**
 * extremumMacro creates the namespace-sensitive variable-argument least or greatest macro.
 */
function extremumMacro(operation: "greatest" | "least"): Macro {
  return receiverVarArgMacro(operation, (helper, target, args) => {
    if (target?.kind() !== ExprKind.Ident || target.asIdent() !== mathNamespace) {
      return undefined;
    }
    const internalFunction = operation === "least" ? minFunction : maxFunction;
    if (args.length === 0) {
      return helper.error(target.id(), `math.${operation}() requires at least one argument`);
    }
    if (args.length === 1) {
      const argument = args[0]!;
      if (!isNumericExpression(argument) && !isNumericListLiteral(argument)) {
        return helper.error(argument.id(), `math.${operation}() invalid single argument value`);
      }
      return helper.call(internalFunction, argument);
    }
    for (const argument of args) {
      if (!isNumericExpression(argument)) {
        return helper.error(
          argument.id(),
          `math.${operation}() simple literal arguments must be numeric`,
        );
      }
    }
    return args.length === 2
      ? helper.call(internalFunction, ...args)
      : helper.call(internalFunction, helper.list(...args));
  });
}

/**
 * isNumericExpression reports whether an expression is numeric or requires type checking.
 */
function isNumericExpression(expression: Expr): boolean {
  if (expression.kind() === ExprKind.Literal) {
    const value = expression.asLiteral();
    if (typeof value === "bigint" || typeof value === "number") {
      return true;
    }
    if (
      typeof value === "object" &&
      value !== null &&
      "$typeName" in value &&
      value.$typeName === "cel.expr.Constant"
    ) {
      const constantCase = (value as { constantKind: { case?: string } }).constantKind.case;
      return ["doubleValue", "int64Value", "uint64Value"].includes(constantCase ?? "");
    }
    return false;
  }
  return ![ExprKind.List, ExprKind.Map, ExprKind.Struct].includes(expression.kind());
}

/**
 * isNumericListLiteral reports whether a non-empty list contains only numeric expressions.
 */
function isNumericListLiteral(expression: Expr): boolean {
  if (expression.kind() !== ExprKind.List) {
    return false;
  }
  const elements = expression.asList()!.elements();
  return elements.length > 0 && elements.every(isNumericExpression);
}

/** identity returns its CEL argument unchanged. */
function identity(value: Val): Val {
  return value;
}

/**
 * unaryDoubleDeclaration creates a double-to-double math function declaration.
 */
function unaryDoubleDeclaration(options: {
  id: string;
  name: string;
  operation: (value: number) => number;
}) {
  return func(options.name, {
    overloads: [
      overload(options.id, [DoubleType], DoubleType, {
        unaryBinding: (value) => new Double(options.operation((value as Double).value())),
      }),
    ],
  });
}

/**
 * unaryDoubleBooleanDeclaration creates a double predicate declaration.
 */
function unaryDoubleBooleanDeclaration(options: {
  id: string;
  name: string;
  predicate: (value: number) => boolean;
}) {
  return func(options.name, {
    overloads: [
      overload(options.id, [DoubleType], BoolType, {
        unaryBinding: (value) => new Bool(options.predicate((value as Double).value())),
      }),
    ],
  });
}

/**
 * roundAwayFromZero rounds ties away from zero, matching Go's `math.Round`.
 */
function roundAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

/**
 * absolute returns the absolute numeric value or an int64 overflow error.
 */
function absolute(value: Val): Val {
  if (value instanceof Double) {
    return new Double(Math.abs(value.value()));
  }
  if (value instanceof Int) {
    return value.value() === int64Min
      ? err("integer overflow")
      : new Int(value.value() < 0n ? -value.value() : value.value());
  }
  return value;
}

/**
 * sign returns -1, 0, or 1 using the same numeric type as its argument.
 */
function sign(value: Val): Val {
  if (value instanceof Double) {
    const number = value.value();
    return new Double(Number.isNaN(number) ? number : number === 0 ? 0 : number < 0 ? -1 : 1);
  }
  if (value instanceof Int) {
    return new Int(value.value() === 0n ? 0n : value.value() < 0n ? -1n : 1n);
  }
  if (value instanceof Uint) {
    return new Uint(value.value() === 0n ? 0n : 1n);
  }
  return err(`no such overload: math.sign(${value.type().typeName()})`);
}

/**
 * binaryIntegerDeclaration creates matching signed and unsigned bitwise overloads.
 */
function binaryIntegerDeclaration(options: {
  idName: string;
  name: string;
  operation: (left: bigint, right: bigint) => bigint;
}) {
  return func(options.name, {
    overloads: [
      overload(`math_${options.idName}_int_int`, [IntType, IntType], IntType, {
        binaryBinding: (left, right) =>
          new Int(
            BigInt.asIntN(64, options.operation((left as Int).value(), (right as Int).value())),
          ),
      }),
      overload(`math_${options.idName}_uint_uint`, [UintType, UintType], UintType, {
        binaryBinding: (left, right) =>
          new Uint(options.operation((left as Uint).value(), (right as Uint).value()) & uint64Mask),
      }),
    ],
  });
}

/**
 * shiftDeclaration creates signed and unsigned logical shift overloads.
 */
function shiftDeclaration(options: { direction: "left" | "right"; idName: string; name: string }) {
  const shift = (value: Val, bits: Val): Val => {
    const offset = (bits as Int).value();
    if (offset < 0n) {
      return err(`${options.name}() negative offset: ${offset}`);
    }
    const input = value instanceof Int ? value.value() : (value as Uint).value();
    if (offset >= 64n) {
      return value instanceof Int ? new Int(0n) : new Uint(0n);
    }
    if (options.direction === "left") {
      const shifted = (input << offset) & uint64Mask;
      return value instanceof Int ? new Int(BigInt.asIntN(64, shifted)) : new Uint(shifted);
    }
    const shifted = BigInt.asUintN(64, input) >> offset;
    return value instanceof Int ? new Int(shifted) : new Uint(shifted);
  };
  return func(options.name, {
    overloads: [
      overload(`math_${options.idName}_int_int`, [IntType, IntType], IntType, {
        binaryBinding: shift,
      }),
      overload(`math_${options.idName}_uint_int`, [UintType, IntType], UintType, {
        binaryBinding: shift,
      }),
    ],
  });
}

/**
 * squareRoot converts a CEL numeric value to double and computes its square root.
 */
function squareRoot(value: Val): Val {
  return new Double(Math.sqrt(Number(value.value())));
}

/**
 * extremumPair returns the least or greatest of two CEL numeric values.
 */
function extremumPair(left: Val, right: Val, operation: "max" | "min"): Val {
  if (typeof (left as Partial<Comparer>).compare !== "function") {
    return err(`no such overload: math.@${operation}`);
  }
  const compared = (left as Val & Comparer).compare(right);
  if (isError(compared)) {
    const message = String(compared);
    return message.includes(`math.@${operation}`)
      ? compared
      : err(`${message}: math.@${operation}`);
  }
  const comparison = (compared as Int).value();
  return operation === "min"
    ? comparison === IntOne.value()
      ? right
      : left
    : comparison === IntNegOne.value()
      ? right
      : left;
}

/**
 * extremumList folds a non-empty CEL numeric list using least or greatest comparison.
 */
function extremumList(value: Val, operation: "max" | "min"): Val {
  const list = value as Lister;
  const size = Number((list.size() as Int).value());
  if (size === 0) {
    return err(`math.@${operation}(list) argument must not be empty`);
  }
  let result = list.get(new Int(0n));
  for (let index = 1; index < size; index += 1) {
    result = extremumPair(result, list.get(new Int(BigInt(index))), operation);
  }
  return result instanceof Int || result instanceof Uint || result instanceof Double
    ? result
    : err(`no such overload: math.@${operation}`);
}
