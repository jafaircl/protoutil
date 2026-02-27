import { create, type MessageInitShape } from "@bufbuild/protobuf";
import type {
  Expr,
  Expr_Call,
  Expr_Comprehension,
  Expr_CreateList,
  Expr_CreateStruct,
  Expr_Select,
} from "../gen/google/api/expr/v1alpha1/syntax_pb.js";
import { type ConstantSchema, ExprSchema } from "../gen/google/api/expr/v1alpha1/syntax_pb.js";

// ─────────────────────────────────────────────────────────────────────────────
// makeConst
// ─────────────────────────────────────────────────────────────────────────────

export function makeConst(
  id: bigint,
  kind: MessageInitShape<typeof ConstantSchema>["constantKind"],
): Expr {
  return create(ExprSchema, {
    id,
    exprKind: { case: "constExpr", value: { constantKind: kind } },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// isConst / constBool
// ─────────────────────────────────────────────────────────────────────────────

export function isConst(expr: Expr): boolean {
  return expr.exprKind.case === "constExpr";
}

export function constBool(expr: Expr): boolean | undefined {
  if (expr.exprKind.case !== "constExpr") return undefined;
  const k = expr.exprKind.value.constantKind;
  return k.case === "boolValue" ? k.value : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// mapExpr — bottom-up structural transform
// ─────────────────────────────────────────────────────────────────────────────

/** Walk an Expr bottom-up, applying a transform at each node. */
export function mapExpr(expr: Expr, fn: (e: Expr) => Expr): Expr {
  switch (expr.exprKind.case) {
    case "selectExpr": {
      const sel = expr.exprKind.value satisfies Expr_Select;
      const transformed = create(ExprSchema, {
        id: expr.id,
        exprKind: {
          case: "selectExpr",
          value: {
            operand: mapExpr(sel.operand ?? create(ExprSchema), fn),
            field: sel.field,
            testOnly: sel.testOnly,
          },
        },
      });
      return fn(transformed);
    }

    case "callExpr": {
      const call = expr.exprKind.value satisfies Expr_Call;
      const transformed = create(ExprSchema, {
        id: expr.id,
        exprKind: {
          case: "callExpr",
          value: {
            function: call.function,
            target: call.target ? mapExpr(call.target, fn) : undefined,
            args: call.args.map((a) => mapExpr(a, fn)),
          },
        },
      });
      return fn(transformed);
    }

    case "listExpr": {
      const list = expr.exprKind.value satisfies Expr_CreateList;
      const transformed = create(ExprSchema, {
        id: expr.id,
        exprKind: {
          case: "listExpr",
          value: {
            elements: list.elements.map((e) => mapExpr(e, fn)),
            optionalIndices: list.optionalIndices,
          },
        },
      });
      return fn(transformed);
    }

    case "structExpr": {
      const struct = expr.exprKind.value satisfies Expr_CreateStruct;
      const transformed = create(ExprSchema, {
        id: expr.id,
        exprKind: {
          case: "structExpr",
          value: {
            messageName: struct.messageName,
            entries: struct.entries.map((e) => ({
              ...e,
              value: mapExpr(e.value ?? create(ExprSchema), fn),
              keyKind:
                e.keyKind.case === "mapKey"
                  ? { case: "mapKey" as const, value: mapExpr(e.keyKind.value, fn) }
                  : e.keyKind,
            })),
          },
        },
      });
      return fn(transformed);
    }

    case "comprehensionExpr": {
      const c = expr.exprKind.value satisfies Expr_Comprehension;
      const transformed = create(ExprSchema, {
        id: expr.id,
        exprKind: {
          case: "comprehensionExpr",
          value: {
            iterVar: c.iterVar,
            iterVar2: c.iterVar2,
            iterRange: mapExpr(c.iterRange ?? create(ExprSchema), fn),
            accuVar: c.accuVar,
            accuInit: mapExpr(c.accuInit ?? create(ExprSchema), fn),
            loopCondition: mapExpr(c.loopCondition ?? create(ExprSchema), fn),
            loopStep: mapExpr(c.loopStep ?? create(ExprSchema), fn),
            result: mapExpr(c.result ?? create(ExprSchema), fn),
          },
        },
      });
      return fn(transformed);
    }

    default:
      return fn(expr);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// cloneExpr — deep clone with fresh ids
// ─────────────────────────────────────────────────────────────────────────────

/** Deep-clone an Expr, replacing every node's id with a fresh one from the counter. */
export function cloneExpr(expr: Expr, nextId: () => bigint): Expr {
  const id = nextId();

  switch (expr.exprKind.case) {
    case "constExpr":
    case "identExpr":
      return create(ExprSchema, { id, exprKind: expr.exprKind });

    case "selectExpr": {
      const sel = expr.exprKind.value satisfies Expr_Select;
      return create(ExprSchema, {
        id,
        exprKind: {
          case: "selectExpr",
          value: {
            operand: cloneExpr(sel.operand ?? create(ExprSchema), nextId),
            field: sel.field,
            testOnly: sel.testOnly,
          },
        },
      });
    }

    case "callExpr": {
      const call = expr.exprKind.value satisfies Expr_Call;
      return create(ExprSchema, {
        id,
        exprKind: {
          case: "callExpr",
          value: {
            function: call.function,
            target: call.target ? cloneExpr(call.target, nextId) : undefined,
            args: call.args.map((a) => cloneExpr(a, nextId)),
          },
        },
      });
    }

    default:
      return create(ExprSchema, { id, exprKind: expr.exprKind });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Expr depth
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_EXPR_DEPTH = 32;

export class ExprDepthError extends Error {
  constructor(
    public readonly depth: number,
    public readonly max: number,
  ) {
    super(`Expression depth ${depth} exceeds maximum allowed depth of ${max}`);
    this.name = "ExprDepthError";
  }
}

/** Returns the maximum nesting depth of an Expr tree. A leaf node has depth 1. */
export function exprDepth(expr: Expr): number {
  switch (expr.exprKind.case) {
    case "selectExpr": {
      const operand = expr.exprKind.value.operand;
      return 1 + (operand ? exprDepth(operand) : 0);
    }
    case "callExpr": {
      const { target, args } = expr.exprKind.value;
      const childDepths = [target ? exprDepth(target) : 0, ...args.map(exprDepth)];
      return 1 + Math.max(0, ...childDepths);
    }
    case "listExpr": {
      const depths = expr.exprKind.value.elements.map(exprDepth);
      return 1 + Math.max(0, ...depths);
    }
    case "structExpr": {
      const depths = expr.exprKind.value.entries.flatMap((e) => [
        e.value ? exprDepth(e.value) : 0,
        e.keyKind.case === "mapKey" ? exprDepth(e.keyKind.value) : 0,
      ]);
      return 1 + Math.max(0, ...depths);
    }
    case "comprehensionExpr": {
      const c = expr.exprKind.value;
      const depths = [
        c.iterRange ? exprDepth(c.iterRange) : 0,
        c.accuInit ? exprDepth(c.accuInit) : 0,
        c.loopCondition ? exprDepth(c.loopCondition) : 0,
        c.loopStep ? exprDepth(c.loopStep) : 0,
        c.result ? exprDepth(c.result) : 0,
      ];
      return 1 + Math.max(0, ...depths);
    }
    default:
      // constExpr, identExpr — leaves
      return 1;
  }
}

/**
 * Throws an ExprDepthError if the expression's depth exceeds `max`.
 * Defaults to MAX_EXPR_DEPTH if `max` is not provided.
 */
export function assertExprDepth(expr: Expr, max: number = MAX_EXPR_DEPTH): void {
  const depth = exprDepth(expr);
  if (depth > max) {
    throw new ExprDepthError(depth, max);
  }
}
