import type { Env } from "../cel/env.js";
import { StableIdGenerator } from "../cel/optimizer.js";
import {
  AST,
  type Expr,
  ExprKind,
  exprFactory,
  functionReference,
  type ReferenceInfo,
} from "../common/ast/index.js";
import * as operators from "../common/operators.js";
import * as overloads from "../common/overloads.js";
import { Bool } from "../common/types/bool.js";
import { BoolType, exprTypeToType, Kind, typeToExprType } from "../common/types/types.js";
import type { Type as CheckedType } from "../gen/cel/expr/checked_pb.js";
import { canEvaluate } from "./environment.js";
import { type StructuralEqualityContext, structurallyEqual } from "./structural-equality.js";

/**
 * Composition builds checked Boolean CEL expressions out of other checked Boolean CEL
 * expressions. Every method returns the same checked-AST type produced by parsing and checking
 * ordinary source text, so the result can be planned, evaluated, or unparsed like any other
 * expression. None of the methods reparse, recheck, or re-resolve their operands — they only
 * rearrange and simplify already-resolved nodes.
 */
export interface Composition {
  /** and combines the operands with logical AND, preserving their order. */
  and(...operands: AST[]): AST;
  /** or combines the operands with logical OR, preserving their order. */
  or(...operands: AST[]): AST;
  /** not negates the operand. */
  not(operand: AST): AST;
}

/**
 * createComposition binds a reusable `Composition` to one target environment. It is safe to
 * create once and reuse, and it never inspects its operands to guess at an environment — the
 * target is always the one the caller supplied.
 */
export function createComposition(target: Env): Composition {
  if (target === undefined) {
    throw new Error("createComposition requires a target environment");
  }
  return new TargetComposition(target);
}

class TargetComposition implements Composition {
  constructor(private readonly target: Env) {}

  public and(...operands: AST[]): AST {
    return buildVariadicLogical(this.target, operands, {
      functionName: operators.LogicalAnd,
      overloadId: overloads.LogicalAnd,
      identity: true,
      absorbing: false,
    });
  }

  public or(...operands: AST[]): AST {
    return buildVariadicLogical(this.target, operands, {
      functionName: operators.LogicalOr,
      overloadId: overloads.LogicalOr,
      identity: false,
      absorbing: true,
    });
  }

  public not(operand: AST): AST {
    validateOperand(this.target, operand);
    const allocator = new StableIdGenerator(0);
    const remapped = remapOperand(operand, allocator);

    // Collapse double negation, but only when the operand is itself a call to the standard
    // logical-not overload -- a function that happens to be named "!_" but resolves to something
    // else is not the negation operator and must not be unwrapped.
    if (remapped.expr.kind() === ExprKind.Call) {
      const call = remapped.expr.asCall()!;
      if (
        !call.isMemberFunction() &&
        call.functionName() === operators.LogicalNot &&
        call.args().length === 1 &&
        isStandardLogicalOverload(remapped.refMap.get(remapped.expr.id()), overloads.LogicalNot)
      ) {
        return finalize(call.args()[0]!, remapped.typeMap, remapped.refMap);
      }
    }

    const literalValue = literalBooleanValue(remapped.expr);
    if (literalValue !== undefined) {
      const id = allocator.nextId();
      const typeMap = new Map(remapped.typeMap);
      typeMap.set(id, typeToExprType(BoolType));
      return finalize(exprFactory().literal(id, !literalValue), typeMap, remapped.refMap);
    }

    const id = allocator.nextId();
    const typeMap = new Map(remapped.typeMap);
    const refMap = new Map(remapped.refMap);
    typeMap.set(id, typeToExprType(BoolType));
    refMap.set(id, functionReference(overloads.LogicalNot));
    return finalize(exprFactory().call(id, operators.LogicalNot, remapped.expr), typeMap, refMap);
  }
}

interface RemappedOperand {
  expr: Expr;
  typeMap: Map<number, CheckedType>;
  refMap: Map<number, ReferenceInfo>;
}

/**
 * remapOperand deep-copies one operand's expression tree and assigns it fresh ids drawn from the
 * shared allocator, carrying its type and reference metadata over to the new ids.
 *
 * remapOperand remaps each operand with its own throwaway `StableIdGenerator`, seeded from the
 * shared allocator's current position. Two operands built independently can each have their own
 * node at id 1; reusing one generator's id-translation table across both would wrongly treat those
 * as the same node. remapOperand then fast-forwards the shared allocator past whatever ids the
 * operand consumed, so the next operand starts from a clean, higher range.
 */
function remapOperand(operand: AST, allocator: StableIdGenerator): RemappedOperand {
  const generator = new StableIdGenerator(allocator.currentSeed());
  const expr = exprFactory().copyExpr(operand.expr());
  expr.renumberIds((id) => generator.stableId(id));
  const typeMap = new Map<number, CheckedType>();
  for (const [id, type] of operand.typeMap()) {
    typeMap.set(generator.stableId(id), type);
  }
  const refMap = new Map<number, ReferenceInfo>();
  for (const [id, reference] of operand.referenceMap()) {
    refMap.set(generator.stableId(id), reference);
  }
  allocator.advanceTo(generator.currentSeed());
  return { expr, typeMap, refMap };
}

/**
 * finalize drops type and reference metadata that no longer corresponds to a live node (removed
 * by identity elimination, an absorbing constant, or duplicate elimination) and builds the result
 * AST. The result is synthetic, so it carries no source location: attributing it to one operand's
 * source position would misrepresent where it came from.
 */
function finalize(
  root: Expr,
  typeMap: Map<number, CheckedType>,
  refMap: Map<number, ReferenceInfo>,
): AST {
  const liveIds = new AST(root, undefined, typeMap, refMap).ids();
  const prunedTypes = new Map<number, CheckedType>();
  for (const [id, type] of typeMap) {
    if (liveIds.has(id)) {
      prunedTypes.set(id, type);
    }
  }
  const prunedRefs = new Map<number, ReferenceInfo>();
  for (const [id, reference] of refMap) {
    if (liveIds.has(id)) {
      prunedRefs.set(id, reference);
    }
  }
  return new AST(root, undefined, prunedTypes, prunedRefs);
}

interface VariadicLogicalOptions {
  /** functionName is the standard operator token, e.g. `_&&_` or `_||_`. */
  functionName: string;
  /** overloadId is the standard overload id the operator resolves to when checked. */
  overloadId: string;
  /** identity is the constant that is removed without changing the result (true for And). */
  identity: boolean;
  /** absorbing is the constant that short-circuits the result (false for And). */
  absorbing: boolean;
}

/**
 * buildVariadicLogical implements the shared shape of `and` and `or`: remap every operand into one
 * id space, inline nested calls to the same standard operator, drop the identity constant,
 * short-circuit on the absorbing constant, remove structural duplicates while keeping the first
 * occurrence and the original operand order, and build the result.
 */
function buildVariadicLogical(
  target: Env,
  operands: readonly AST[],
  options: VariadicLogicalOptions,
): AST {
  for (const operand of operands) {
    validateOperand(target, operand);
  }

  const allocator = new StableIdGenerator(0);
  const typeMap = new Map<number, CheckedType>();
  const refMap = new Map<number, ReferenceInfo>();
  const roots: Expr[] = [];
  for (const operand of operands) {
    const remapped = remapOperand(operand, allocator);
    for (const [id, type] of remapped.typeMap) {
      typeMap.set(id, type);
    }
    for (const [id, reference] of remapped.refMap) {
      refMap.set(id, reference);
    }
    roots.push(remapped.expr);
  }

  const context: StructuralEqualityContext = {
    getType: (id) => typeMap.get(id),
    getReference: (id) => refMap.get(id),
  };

  // Inline nested calls to the same standard operator (so and(a, and(b, c)) reads the same as
  // and(a, b, c)), but only when the call resolves to the standard overload -- a function that
  // happens to be named "_&&_"/"_||_" but resolves to something else is opaque to this pass and
  // must be kept as a single operand.
  const flattened: Expr[] = [];
  const flattenInto = (node: Expr): void => {
    const call = node.kind() === ExprKind.Call ? node.asCall() : undefined;
    if (
      call !== undefined &&
      !call.isMemberFunction() &&
      call.functionName() === options.functionName &&
      isStandardLogicalOverload(refMap.get(node.id()), options.overloadId)
    ) {
      for (const argument of call.args()) {
        flattenInto(argument);
      }
      return;
    }
    flattened.push(node);
  };
  for (const root of roots) {
    flattenInto(root);
  }

  // A literal identity operand (true for and, false for or) never changes the result, so it is
  // dropped; a literal absorbing operand (false for and, true for or) makes the whole result that
  // constant regardless of the remaining operands, so it short-circuits immediately.
  const survivors: Expr[] = [];
  for (const node of flattened) {
    const value = literalBooleanValue(node);
    if (value === options.identity) {
      continue;
    }
    if (value === options.absorbing) {
      const id = allocator.nextId();
      typeMap.set(id, typeToExprType(BoolType));
      return finalize(exprFactory().literal(id, options.absorbing), typeMap, refMap);
    }
    survivors.push(node);
  }

  // Remove structural duplicates, keeping the first occurrence to preserve operand order.
  const deduped: Expr[] = [];
  for (const node of survivors) {
    if (!deduped.some((existing) => structurallyEqual(node, existing, context))) {
      deduped.push(node);
    }
  }

  if (deduped.length === 0) {
    const id = allocator.nextId();
    typeMap.set(id, typeToExprType(BoolType));
    return finalize(exprFactory().literal(id, options.identity), typeMap, refMap);
  }
  if (deduped.length === 1) {
    return finalize(deduped[0]!, typeMap, refMap);
  }

  const rootId = allocator.nextId();
  const call = exprFactory().call(rootId, options.functionName, ...deduped);
  typeMap.set(rootId, typeToExprType(BoolType));
  refMap.set(rootId, functionReference(options.overloadId));
  return finalize(call, typeMap, refMap);
}

function isStandardLogicalOverload(
  reference: ReferenceInfo | undefined,
  expectedOverloadId: string,
): boolean {
  return reference?.overloadIds.includes(expectedOverloadId) ?? false;
}

/** literalBooleanValue mirrors the checker's literal-boolean recognition for pre-evaluation folding. */
function literalBooleanValue(expression: Expr): boolean | undefined {
  if (expression.kind() !== ExprKind.Literal) {
    return undefined;
  }
  const value = expression.asLiteral();
  return value instanceof Bool ? value.value() : typeof value === "boolean" ? value : undefined;
}

/**
 * validateOperand rejects an operand that isn't a checked Boolean expression the target
 * environment can evaluate, before composition does any work with it.
 */
function validateOperand(target: Env, operand: AST): void {
  if (operand === undefined) {
    throw new Error("composition requires a checked expression operand");
  }
  if (!operand.isChecked()) {
    throw new Error("composition operand must be a checked expression, not a parsed-only AST");
  }
  const rootType = operand.getType(operand.expr().id());
  if (rootType === undefined || exprTypeToType(rootType).kind() !== Kind.Bool) {
    throw new Error("composition operand must have a Boolean root type");
  }
  if (!canEvaluate(target, operand)) {
    throw new Error("composition operand is not evaluable by the target environment");
  }
}
