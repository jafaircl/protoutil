import type { Expr } from "./gen/cel/expr/syntax_pb.js";

/** The array path and constant in a canonical equality-based CEL `exists` lowering. */
export interface ArrayEqualityExists {
  readonly array: Expr;
  readonly constant: Expr;
}

/**
 * Recognizes only CEL's canonical one-variable `exists` lowering where the
 * iteration variable is equal to one constant. Target profiles choose how to
 * execute the resulting native-array membership test.
 */
export function arrayEqualityExists(
  expression: Expr,
  overloadId: (expression: Expr) => string,
): ArrayEqualityExists | undefined {
  if (expression.exprKind.case !== "comprehensionExpr") return undefined;
  const comprehension = expression.exprKind.value;
  if (
    comprehension.iterRange === undefined ||
    comprehension.iterVar2.length > 0 ||
    comprehension.iterVar === comprehension.accuVar ||
    !isBooleanConstant(comprehension.accuInit, false) ||
    !isExistsCondition(comprehension.loopCondition, comprehension.accuVar, overloadId) ||
    !isIdent(comprehension.result, comprehension.accuVar) ||
    comprehension.loopStep?.exprKind.case !== "callExpr" ||
    overloadId(comprehension.loopStep) !== "logical_or"
  ) {
    return undefined;
  }
  const step = comprehension.loopStep.exprKind.value.args;
  const predicate = step[1];
  if (
    step.length !== 2 ||
    !isIdent(step[0], comprehension.accuVar) ||
    predicate?.exprKind.case !== "callExpr" ||
    overloadId(predicate) !== "equals"
  ) {
    return undefined;
  }
  const operands = predicate.exprKind.value.args;
  if (operands.length !== 2) return undefined;
  if (isIdent(operands[0], comprehension.iterVar) && operands[1]?.exprKind.case === "constExpr") {
    return { array: comprehension.iterRange, constant: operands[1] };
  }
  if (isIdent(operands[1], comprehension.iterVar) && operands[0]?.exprKind.case === "constExpr") {
    return { array: comprehension.iterRange, constant: operands[0] };
  }
  return undefined;
}

function isExistsCondition(
  expression: Expr | undefined,
  accumulator: string,
  overloadId: (expression: Expr) => string,
): boolean {
  if (expression?.exprKind.case !== "callExpr" || overloadId(expression) !== "not_strictly_false") {
    return false;
  }
  const negation = expression.exprKind.value.args[0];
  return (
    expression.exprKind.value.args.length === 1 &&
    negation?.exprKind.case === "callExpr" &&
    overloadId(negation) === "logical_not" &&
    negation.exprKind.value.args.length === 1 &&
    isIdent(negation.exprKind.value.args[0], accumulator)
  );
}

function isBooleanConstant(expression: Expr | undefined, value: boolean): boolean {
  return (
    expression?.exprKind.case === "constExpr" &&
    expression.exprKind.value.constantKind.case === "boolValue" &&
    expression.exprKind.value.constantKind.value === value
  );
}

function isIdent(expression: Expr | undefined, name: string): boolean {
  return expression?.exprKind.case === "identExpr" && expression.exprKind.value.name === name;
}
