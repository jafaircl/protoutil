import type { MessageInitShape } from "@bufbuild/protobuf";
import { NullValue } from "@bufbuild/protobuf/wkt";
import type { Constant, ConstantSchema, Expr } from "../gen/google/api/expr/v1alpha1/syntax_pb.js";
import type { Optimizer } from "./optimizer.js";
import { unparse } from "./unparse.js";
import { constBool, isConst, makeConst, mapExpr } from "./utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Primitive JS values that can be used as fold constants.
 * bigint → int64, number → double, boolean → bool, string → string, null → null.
 */
export type FoldValue = bigint | number | boolean | string | null;

// ─────────────────────────────────────────────────────────────────────────────
// fold
// ─────────────────────────────────────────────────────────────────────────────

function foldValueToConstantKind(
  value: FoldValue,
): MessageInitShape<typeof ConstantSchema>["constantKind"] {
  if (value === null) return { case: "nullValue", value: NullValue.NULL_VALUE };
  if (typeof value === "boolean") return { case: "boolValue", value };
  if (typeof value === "bigint") return { case: "int64Value", value };
  if (typeof value === "string") return { case: "stringValue", value };
  return { case: "doubleValue", value };
}

function tryEvalConstCall(expr: Expr): Expr | undefined {
  if (expr.exprKind.case !== "callExpr") return undefined;
  const call = expr.exprKind.value;

  if (call.target) {
    return tryEvalMethodCall(expr);
  }

  const { args } = call;
  if (!args.every(isConst)) return undefined;

  const fn = call.function;
  const { id } = expr;

  if (fn === "@not" && args.length === 1) {
    const b = constBool(args[0]);
    if (b !== undefined) return makeConst(id, { case: "boolValue", value: !b });
  }

  if (args.length !== 2) return undefined;

  // Both args are const — safe to access their constantKind directly
  const lConst = args[0].exprKind.value as Constant;
  const rConst = args[1].exprKind.value as Constant;
  const lk = lConst.constantKind;
  const rk = rConst.constantKind;

  if (fn === "_&&_") {
    const lb = constBool(args[0]);
    const rb = constBool(args[1]);
    if (lb === false || rb === false) return makeConst(id, { case: "boolValue", value: false });
    if (lb === true && rb === true) return makeConst(id, { case: "boolValue", value: true });
  }

  if (fn === "_||_") {
    const lb = constBool(args[0]);
    const rb = constBool(args[1]);
    if (lb === true || rb === true) return makeConst(id, { case: "boolValue", value: true });
    if (lb === false && rb === false) return makeConst(id, { case: "boolValue", value: false });
  }

  if (lk.case !== rk.case) return undefined;

  const lv = lk.value;
  const rv = rk.value;

  switch (fn) {
    case "_==_":
      return makeConst(id, { case: "boolValue", value: lv === rv });
    case "_!=_":
      return makeConst(id, { case: "boolValue", value: lv !== rv });
    case "_<_":
      return makeConst(id, { case: "boolValue", value: (lv as number) < (rv as number) });
    case "_<=_":
      return makeConst(id, { case: "boolValue", value: (lv as number) <= (rv as number) });
    case "_>_":
      return makeConst(id, { case: "boolValue", value: (lv as number) > (rv as number) });
    case "_>=_":
      return makeConst(id, { case: "boolValue", value: (lv as number) >= (rv as number) });
  }

  if (lk.case === "int64Value" || lk.case === "uint64Value" || lk.case === "doubleValue") {
    if (lk.case === "doubleValue") {
      const l = lv as number;
      const r = rv as number;
      switch (fn) {
        case "_+_":
          return makeConst(id, { case: "doubleValue", value: l + r });
        case "_-_":
          return makeConst(id, { case: "doubleValue", value: l - r });
        case "_*_":
          return makeConst(id, { case: "doubleValue", value: l * r });
        case "_/_":
          return r !== 0 ? makeConst(id, { case: "doubleValue", value: l / r }) : undefined;
      }
    } else {
      const l = lv as bigint;
      const r = rv as bigint;
      switch (fn) {
        case "_+_":
          return makeConst(id, { case: lk.case, value: l + r });
        case "_-_":
          return makeConst(id, { case: lk.case, value: l - r });
        case "_*_":
          return makeConst(id, { case: lk.case, value: l * r });
        case "_/_":
          return r !== 0n ? makeConst(id, { case: lk.case, value: l / r }) : undefined;
      }
    }
  }

  if (lk.case === "stringValue" && fn === "_+_") {
    return makeConst(id, { case: "stringValue", value: (lv as string) + (rv as string) });
  }

  return undefined;
}

function tryEvalMethodCall(expr: Expr): Expr | undefined {
  if (expr.exprKind.case !== "callExpr") return undefined;
  const call = expr.exprKind.value;
  if (!call.target || !isConst(call.target) || !call.args.every(isConst)) return undefined;

  const targetExpr = call.target;
  if (targetExpr.exprKind.case !== "constExpr") return undefined;
  const targetKind = targetExpr.exprKind.value.constantKind;
  if (targetKind.case !== "stringValue") return undefined;
  const target = targetKind.value;

  const argExpr = call.args[0];
  if (!argExpr || argExpr.exprKind.case !== "constExpr") return undefined;
  const argKind = argExpr.exprKind.value.constantKind;
  if (argKind.case !== "stringValue") return undefined;
  const arg = argKind.value;

  const { id } = expr;
  switch (call.function) {
    case "startsWith":
      return makeConst(id, { case: "boolValue", value: target.startsWith(arg) });
    case "endsWith":
      return makeConst(id, { case: "boolValue", value: target.endsWith(arg) });
    case "contains":
      return makeConst(id, { case: "boolValue", value: target.includes(arg) });
    case "matches":
      return makeConst(id, { case: "boolValue", value: new RegExp(arg).test(target) });
    default:
      return undefined;
  }
}

/**
 * Creates an optimizer that substitutes ident nodes with constant values,
 * then evaluates any call expression whose arguments are all constants.
 * Runs iteratively until no further reductions are possible (up to 10 passes).
 */
export function fold(bindings: Record<string, FoldValue>): Optimizer {
  const constKinds = new Map<string, MessageInitShape<typeof ConstantSchema>["constantKind"]>();
  for (const [name, value] of Object.entries(bindings)) {
    constKinds.set(name, foldValueToConstantKind(value));
  }

  return (root: Expr): Expr => {
    let current = root;
    for (let i = 0; i < 10; i++) {
      const next = mapExpr(current, (expr: Expr) => {
        if (expr.exprKind.case === "identExpr") {
          const kind = constKinds.get(expr.exprKind.value.name);
          if (kind) return makeConst(expr.id, kind);
        }
        return tryEvalConstCall(expr) ?? expr;
      });
      if (unparse(next) === unparse(current)) break;
      current = next;
    }
    return current;
  };
}
