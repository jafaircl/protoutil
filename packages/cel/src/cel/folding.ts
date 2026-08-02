import {
  AST,
  constantValueMatcher,
  type EntryExpr,
  type Expr,
  ExprKind,
  matchDescendants,
  type NavigableExpr,
  navigateAst,
  postOrderVisit,
  preOrderVisit,
} from "../common/ast/index.js";
import * as operators from "../common/operators.js";
import {
  Bool,
  BoolType,
  Bytes,
  BytesType,
  String as CelString,
  Double,
  DoubleType,
  DurationType,
  Err,
  exprTypeToType,
  type Indexer,
  Int,
  IntType,
  isUnknown,
  Kind,
  type Lister,
  ListType,
  type Mapper,
  MapType,
  NullType,
  Optional,
  OptionalType,
  StringType,
  TimestampType,
  type TraitFieldTester,
  True,
  Type,
  TypeType,
  Uint,
  UintType,
  type Val,
} from "../common/types/index.js";
import type { ASTOptimizer, OptimizerContext } from "./optimizer.js";

/**
 * ConstantFoldingOptimizerOptions configures constant folding without functional options.
 */
export interface ConstantFoldingOptimizerOptions {
  /**
   * maxIterations limits the number of times literals may be folded during optimization.
   *
   * Defaults to 100 if not set.
   */
  maxIterations?: number;

  /**
   * knownValues provides values which the folding evaluator turns into literals in the AST.
   *
   * When omitted, identifiers are not selected as fold candidates.
   */
  knownValues?: Record<string, unknown>;
}

/**
 * defaultMaxConstantFoldIterations is the default number of bottom-up folding passes.
 */
const defaultMaxConstantFoldIterations = 100;

/**
 * ConstantFoldingOptimizer inlines constant scalar and aggregate literal values within function
 * calls and select statements with their evaluated result.
 */
export class ConstantFoldingOptimizer implements ASTOptimizer {
  /** maxFoldIterations limits bottom-up folding passes. */
  private readonly maxFoldIterations: number;

  /** knownValues provides compile-time identifier bindings. */
  private readonly knownValues?: Record<string, unknown>;

  /** constructor configures constant folding from a plain option object. */
  constructor(options: ConstantFoldingOptimizerOptions = {}) {
    this.maxFoldIterations = options.maxIterations ?? defaultMaxConstantFoldIterations;
    this.knownValues = options.knownValues;
  }

  /**
   * optimize queries the expression graph for scalar and aggregate literal expressions within
   * call and select statements, evaluates them, and replaces each call site with its result.
   *
   * Only values which can be represented as literals in CEL syntax are supported.
   */
  public optimize(context: OptimizerContext, ast: AST): AST {
    let root = navigateAst(ast);
    const matcher = (expression: ReturnType<typeof navigateAst>): boolean =>
      this.constantExprMatcher(context, ast, expression);
    let foldableExpressions = matchDescendants(root, matcher);
    let foldCount = 0;

    // Walk foldable expressions bottom-up until no candidates remain or the configured limit wins.
    while (foldableExpressions.length !== 0 && foldCount < this.maxFoldIterations) {
      for (const fold of foldableExpressions) {
        if (fold.kind() === ExprKind.Call && maybePruneBranches(context, ast, fold)) {
          continue;
        }
        if (fold.kind() === ExprKind.Call && isLateBoundFunctionCall(context, fold)) {
          continue;
        }
        try {
          this.tryFold(context, ast, fold);
        } catch (error) {
          // Identifier bindings and subexpressions which cannot be evaluated at optimization time
          // are optional even when a known-value activation was supplied.
          if (fold.kind() !== ExprKind.Ident) {
            throw new Error(`constant-folding evaluation failed: ${(error as Error).message}`);
          }
        }
      }
      foldCount += 1;
      root = navigateAst(ast);
      foldableExpressions = matchDescendants(root, matcher);
    }

    // Remaining comprehensions may become evaluable only after their descendants have folded.
    for (const comprehension of matchDescendants(
      root,
      (expression) => expression.kind() === ExprKind.Comprehension,
    )) {
      try {
        this.tryFold(context, ast, comprehension);
      } catch {
        // A remaining comprehension may legitimately depend on runtime input.
      }
    }

    const optionalsPruned = pruneOptionalElements(context, root);
    root = navigateAst(ast);

    // Resolving optional aggregate entries can expose a surrounding index, select, or call whose
    // operands are now constant. Fold those newly exposed expressions before final adaptation.
    foldableExpressions = optionalsPruned ? matchDescendants(root, matcher) : [];
    let postPruneFoldCount = 0;
    while (foldableExpressions.length !== 0 && postPruneFoldCount < this.maxFoldIterations) {
      for (const fold of foldableExpressions) {
        if (fold.kind() === ExprKind.Call && maybePruneBranches(context, ast, fold)) {
          continue;
        }
        if (fold.kind() === ExprKind.Call && isLateBoundFunctionCall(context, fold)) {
          continue;
        }
        try {
          this.tryFold(context, ast, fold);
        } catch (error) {
          if (fold.kind() !== ExprKind.Ident) {
            throw new Error(`constant-folding evaluation failed: ${(error as Error).message}`);
          }
        }
      }
      postPruneFoldCount++;
      root = navigateAst(ast);
      foldableExpressions = matchDescendants(root, matcher);
    }

    // Runtime values temporarily stored in literal nodes must become valid CEL syntax expressions.
    postOrderVisit(root, (expression) => {
      if (expression.kind() !== ExprKind.Literal) {
        return;
      }
      const value = expression.asLiteral();
      if (!isRuntimeValue(value)) {
        return;
      }
      context.updateExpr({
        target: expression,
        updated: adaptLiteral(context, value),
      });
    });
    return ast;
  }

  /**
   * tryFold evaluates a sub-expression and replaces it with the resulting runtime value.
   */
  private tryFold(context: OptimizerContext, ast: AST, expression: Expr): void {
    const referenceValue = ast.referenceMap().get(expression.id())?.value;
    if (
      (expression.kind() === ExprKind.Ident || expression.kind() === ExprKind.Select) &&
      referenceValue !== undefined
    ) {
      const adaptedReference = isRuntimeValue(referenceValue)
        ? referenceValue
        : context.env().typeAdapter().nativeToValue(referenceValue);
      context.updateExpr({
        target: expression,
        updated: adaptLiteral(context, adaptedReference),
      });
      return;
    }
    const subAst = new AST(
      expression,
      ast.sourceInfo(),
      ast.typeMap(),
      ast.referenceMap(),
      ast.source(),
    );
    const result = context
      .env()
      .program(subAst)
      .eval(this.knownValues ?? {});
    if (result instanceof Err) {
      return;
    }
    if (isUnknown(result)) {
      return;
    }
    context.updateExpr({
      target: expression,
      updated: adaptLiteral(context, result),
    });
  }

  /**
   * constantExprMatcher matches calls, selects, identifiers, and comprehensions whose referenced
   * values are constant.
   *
   * Only comprehensions which are not nested are included, and only when every referenced
   * identifier belongs to the comprehension stack.
   */
  private constantExprMatcher(
    context: OptimizerContext,
    ast: AST,
    expression: ReturnType<typeof navigateAst>,
  ): boolean {
    switch (expression.kind()) {
      case ExprKind.Call:
        return constantCallMatcher(expression);
      case ExprKind.Select:
        return (
          (this.knownValues !== undefined && ast.referenceMap().has(expression.id())) ||
          constantExpressionMatcher(expression.asSelect()!.operand())
        );
      case ExprKind.Ident:
        return (
          this.knownValues !== undefined &&
          ast.referenceMap().has(expression.id()) &&
          (ast.referenceMap().get(expression.id())?.value !== undefined ||
            this.isKnownIdentifier(expression))
        );
      case ExprKind.Comprehension: {
        if (isNestedComprehension(expression)) {
          return false;
        }
        const variables = new Set<string>();
        let constantExpressions = true;
        preOrderVisit(expression, (descendant) => {
          if (descendant.kind() === ExprKind.Comprehension) {
            const comprehension = descendant.asComprehension()!;
            variables.add(comprehension.accuVar());
            variables.add(comprehension.iterVar());
            if (comprehension.iterVar2()) {
              variables.add(comprehension.iterVar2());
            }
          }
          if (descendant.kind() === ExprKind.Ident && !variables.has(descendant.asIdent()!)) {
            constantExpressions = false;
          }
          if (descendant.kind() === ExprKind.Call && isLateBoundFunctionCall(context, descendant)) {
            constantExpressions = false;
          }
        });
        return constantExpressions;
      }
      default:
        return false;
    }
  }

  /**
   * isKnownIdentifier reports whether an identifier has a supplied value and is not shadowed by
   * a surrounding comprehension variable.
   */
  private isKnownIdentifier(expression: NavigableExpr): boolean {
    if (this.knownValues === undefined) {
      return false;
    }
    const identifier = expression.asIdent()!;
    const absolute = identifier.startsWith(".");
    const name = absolute ? identifier.slice(1) : identifier;
    if (!Object.hasOwn(this.knownValues, name)) {
      return false;
    }
    if (absolute) {
      return true;
    }
    let [ancestor] = expression.parent();
    while (ancestor !== undefined) {
      if (ancestor.kind() === ExprKind.Comprehension) {
        const comprehension = ancestor.asComprehension()!;
        if (
          comprehension.accuVar() === name ||
          comprehension.iterVar() === name ||
          comprehension.iterVar2() === name
        ) {
          return false;
        }
      }
      [ancestor] = ancestor.parent();
    }
    return true;
  }
}

/**
 * constantFoldingOptimizer creates a constant-folding optimizer from an option object.
 */
export function constantFoldingOptimizer(
  options: ConstantFoldingOptimizerOptions = {},
): ConstantFoldingOptimizer {
  return new ConstantFoldingOptimizer(options);
}

/**
 * FoldValues maps identifiers to values known during constant folding.
 */
export type FoldValues = Record<string, unknown>;

/**
 * fold creates a constant-folding optimizer which replaces known identifiers with values.
 */
export function fold(knownValues: FoldValues = {}): ASTOptimizer {
  return constantFoldingOptimizer({ knownValues });
}

/**
 * isLateBoundFunctionCall reports whether a call's declaration uses runtime binding.
 */
function isLateBoundFunctionCall(context: OptimizerContext, expression: Expr): boolean {
  const functionName = expression.asCall()?.functionName();
  return (
    functionName !== undefined &&
    (context.env().functions().get(functionName)?.hasLateBinding() ?? false)
  );
}

/**
 * maybePruneBranches applies constant short-circuit behavior to non-strict calls.
 */
function maybePruneBranches(
  context: OptimizerContext,
  ast: AST,
  expression: NavigableExpr,
): boolean {
  const call = expression.asCall()!;
  // Preserve the navigable wrappers so type-sensitive pruning can inspect checked types.
  const argumentsValue = expression.children();
  switch (call.functionName()) {
    case operators.LogicalAnd:
    case operators.LogicalOr:
      return maybeShortCircuitLogic(context, ast, call.functionName(), argumentsValue, expression);
    case operators.Conditional: {
      const condition = argumentsValue[0]!;
      if (condition.kind() !== ExprKind.Literal) {
        return false;
      }
      const selected = literalBoolean(condition) === true ? argumentsValue[1]! : argumentsValue[2]!;
      context.updateExpr({ target: expression, updated: selected });
      return true;
    }
    case operators.In: {
      const needle = argumentsValue[0]!;
      const haystack = argumentsValue[1]!;
      if (haystack.kind() === ExprKind.List && haystack.asList()!.size() === 0) {
        context.updateExpr({
          target: expression,
          updated: context.literal(false),
        });
        return true;
      }
      if (
        (needle.kind() === ExprKind.Literal || isSelfEqualIdent(needle)) &&
        haystack.kind() === ExprKind.List
      ) {
        for (const element of haystack.asList()!.elements()) {
          const matched =
            needle.kind() === ExprKind.Literal
              ? element.kind() === ExprKind.Literal &&
                literalEquals(needle.asLiteral(), element.asLiteral())
              : element.kind() === ExprKind.Ident && element.asIdent() === needle.asIdent();
          if (matched) {
            context.updateExpr({
              target: expression,
              updated: context.literal(true),
            });
            return true;
          }
        }
      }
      return false;
    }
    case operators.Add: {
      const left = argumentsValue[0];
      const right = argumentsValue[1];
      if (left?.kind() !== ExprKind.List || right?.kind() !== ExprKind.List) {
        return false;
      }
      const leftList = left.asList()!;
      const rightList = right.asList()!;
      const offset = leftList.size();
      context.updateExpr({
        target: expression,
        updated: context.list({
          elements: [...leftList.elements(), ...rightList.elements()],
          optionalIndices: [
            ...leftList.optionalIndices(),
            ...rightList.optionalIndices().map((index) => index + offset),
          ],
        }),
      });
      return true;
    }
    default:
      return false;
  }
}

/**
 * maybeShortCircuitLogic prunes resolved operands from logical and/or calls.
 */
function maybeShortCircuitLogic(
  context: OptimizerContext,
  ast: AST,
  functionName: string,
  argumentsValue: Expr[],
  expression: Expr,
): boolean {
  const shortCircuit = functionName === operators.LogicalOr;
  const skip = !shortCircuit;
  const remaining: Expr[] = [];
  for (const argument of argumentsValue) {
    const value = literalBoolean(argument);
    if (value === undefined) {
      remaining.push(argument);
      continue;
    }
    if (value === skip) {
      continue;
    }
    if (value === shortCircuit) {
      context.updateExpr({ target: expression, updated: argument });
      return true;
    }
  }
  if (remaining.length === 0) {
    remaining.push(argumentsValue[0]!);
  }
  if (remaining.length === argumentsValue.length) {
    return false;
  }
  if (remaining.length === 1) {
    if (!isBoolType(ast, remaining[0]!)) {
      return false;
    }
    context.updateExpr({ target: expression, updated: remaining[0]! });
    return true;
  }
  context.updateExpr({
    target: expression,
    updated: context.call({
      functionName,
      arguments: remaining,
    }),
  });
  return true;
}

/**
 * isBoolType reports whether an expression's checked or literal type is CEL bool.
 */
function isBoolType(ast: AST, expression: Expr): boolean {
  const checkedType = ast.getType(expression.id());
  if (checkedType !== undefined && exprTypeToType(checkedType) === BoolType) {
    return true;
  }
  return expression.kind() === ExprKind.Literal && typeof expression.asLiteral() === "boolean";
}

/**
 * pruneOptionalElements resolves optional entries within aggregate literals from the bottom up.
 */
function pruneOptionalElements(
  context: OptimizerContext,
  root: ReturnType<typeof navigateAst>,
): boolean {
  let pruned = false;
  for (const literal of matchDescendants(
    root,
    (expression) =>
      expression.kind() === ExprKind.List ||
      expression.kind() === ExprKind.Map ||
      expression.kind() === ExprKind.Struct,
  )) {
    switch (literal.kind()) {
      case ExprKind.List:
        pruned = pruneOptionalListElements(context, literal) || pruned;
        break;
      case ExprKind.Map:
        pruned = pruneOptionalMapEntries(context, literal) || pruned;
        break;
      case ExprKind.Struct:
        pruned = pruneOptionalStructFields(context, literal) || pruned;
        break;
    }
  }
  return pruned;
}

/**
 * pruneOptionalListElements removes empty optionals and unwraps resolved optional elements.
 */
function pruneOptionalListElements(context: OptimizerContext, expression: Expr): boolean {
  const list = expression.asList()!;
  if (list.optionalIndices().length === 0) {
    return false;
  }
  const elements: Expr[] = [];
  const optionalIndices: number[] = [];
  for (const [index, element] of list.elements().entries()) {
    if (!list.isOptional(index)) {
      elements.push(element);
      continue;
    }
    const value = optionalExpressionValue(context, element);
    if (!value) {
      optionalIndices.push(elements.length);
      elements.push(element);
      continue;
    }
    if (!value.hasValue) {
      continue;
    }
    context.updateExpr({
      target: element,
      updated: value.value!,
    });
    elements.push(element);
  }
  context.updateExpr({
    target: expression,
    updated: context.list({ elements, optionalIndices }),
  });
  return true;
}

/**
 * pruneOptionalMapEntries resolves optional map entries whose values are known.
 */
function pruneOptionalMapEntries(context: OptimizerContext, expression: Expr): boolean {
  const entries: EntryExpr[] = [];
  let modified = false;
  for (const entryExpression of expression.asMap()!.entries()) {
    const entry = entryExpression.asMapEntry()!;
    const value = optionalExpressionValue(context, entry.value());
    if (!entry.isOptional() || !value) {
      entries.push(entryExpression);
      continue;
    }
    if (entry.key().kind() !== ExprKind.Literal) {
      context.updateExpr({
        target: entry.value(),
        updated: entry.value(),
      });
      entries.push(entryExpression);
      continue;
    }
    modified = true;
    if (!value.hasValue) {
      continue;
    }
    context.updateExpr({
      target: entry.value(),
      updated: value.value!,
    });
    entries.push(
      context.mapEntry({
        key: entry.key(),
        value: entry.value(),
      }),
    );
  }
  if (modified) {
    context.updateExpr({ target: expression, updated: context.map(entries) });
  }
  return modified;
}

/**
 * pruneOptionalStructFields resolves optional message fields whose values are known.
 */
function pruneOptionalStructFields(context: OptimizerContext, expression: Expr): boolean {
  const structure = expression.asStruct()!;
  const fields: EntryExpr[] = [];
  let modified = false;
  for (const fieldExpression of structure.fields()) {
    const field = fieldExpression.asStructField()!;
    const value = optionalExpressionValue(context, field.value());
    if (!field.isOptional() || !value) {
      fields.push(fieldExpression);
      continue;
    }
    modified = true;
    if (!value.hasValue) {
      continue;
    }
    context.updateExpr({
      target: field.value(),
      updated: value.value!,
    });
    fields.push(
      context.structField({
        field: field.name(),
        value: field.value(),
      }),
    );
  }
  if (modified) {
    context.updateExpr({
      target: expression,
      updated: context.struct({ typeName: structure.typeName(), fields }),
    });
  }
  return modified;
}

/**
 * adaptLiteral converts a runtime CEL value to its equivalent literal expression.
 *
 * For strongly typed values, the type provider reconstructs fields which are present and their
 * equivalent initialization values.
 */
function adaptLiteral(context: OptimizerContext, value: Val): Expr {
  const type = value.type();
  if (
    type === BoolType ||
    type === BytesType ||
    type === DoubleType ||
    type === IntType ||
    type === NullType ||
    type === StringType ||
    type === UintType
  ) {
    return context.literal(runtimeScalar(value));
  }
  if (type === DurationType) {
    return context.call({
      functionName: "duration",
      arguments: [context.literal(runtimeString(value))],
    });
  }
  if (type === TimestampType) {
    return context.call({
      functionName: "timestamp",
      arguments: [context.literal(runtimeString(value))],
    });
  }
  if (type === OptionalType && value instanceof Optional) {
    if (!value.hasValue()) {
      return context.call({ functionName: "optional.none" });
    }
    return context.call({
      functionName: "optional.of",
      arguments: [adaptLiteral(context, value.getValue())],
    });
  }
  if (type === TypeType && value instanceof Type) {
    return context.ident(value.typeName());
  }
  if (type.typeName() === ListType.typeName()) {
    const list = value as Lister;
    const elements: Expr[] = [];
    const iterator = list.iterator();
    while ((iterator.hasNext() as Bool).value()) {
      elements.push(adaptLiteral(context, iterator.next()));
    }
    return context.list({ elements });
  }
  if (type.typeName() === MapType.typeName()) {
    const map = value as Mapper;
    const entries: EntryExpr[] = [];
    const iterator = map.iterator();
    while ((iterator.hasNext() as Bool).value()) {
      const key = iterator.next();
      entries.push(
        context.mapEntry({
          key: adaptLiteral(context, key),
          value: adaptLiteral(context, map.get(key)),
        }),
      );
    }
    return context.map(entries);
  }

  const fieldNames = context.env().typeProvider().findStructFieldNames(type.typeName());
  if (fieldNames === undefined) {
    throw new Error(`failed to adapt ${String(value.value())} to literal`);
  }
  const tester = value as unknown as TraitFieldTester;
  const indexer = value as unknown as Indexer;
  const fields: EntryExpr[] = [];
  for (const fieldName of fieldNames) {
    const field = new CelString(fieldName);
    const isSet = tester.isSet(field) as Bool;
    if (isSet !== True && !isSet.value()) {
      continue;
    }
    fields.push(
      context.structField({
        field: fieldName,
        value: adaptLiteral(context, indexer.get(field)),
      }),
    );
  }
  return context.struct({ typeName: type.typeName(), fields });
}

/**
 * constantCallMatcher identifies strict and non-strict calls which can be folded.
 */
function constantCallMatcher(expression: ReturnType<typeof navigateAst>): boolean {
  const call = expression.asCall()!;
  const children = expression.children();
  const functionName = call.functionName();
  if (
    ((functionName === "duration" && isCanonicalDurationCall(call.args())) ||
      functionName === "timestamp" ||
      functionName === "optional.none" ||
      functionName === "optional.of") &&
    children.every((child) => constantExpressionMatcher(child))
  ) {
    // These calls are the syntax representation of runtime values produced by adaptation.
    return false;
  }
  if (
    (functionName === operators.LogicalAnd || functionName === operators.LogicalOr) &&
    children.some((child) => child.kind() === ExprKind.Literal)
  ) {
    return true;
  }
  if (functionName === operators.Conditional && literalBoolean(children[0]!) !== undefined) {
    return true;
  }
  if (functionName === operators.In) {
    const needle = children[0]!;
    const haystack = children[1]!;
    if (haystack.kind() === ExprKind.List && haystack.asList()!.size() === 0) {
      return true;
    }
    if (
      (needle.kind() === ExprKind.Literal || isSelfEqualIdent(needle)) &&
      haystack.kind() === ExprKind.List
    ) {
      for (const element of haystack.asList()!.elements()) {
        if (
          (needle.kind() === ExprKind.Literal &&
            element.kind() === ExprKind.Literal &&
            literalEquals(needle.asLiteral(), element.asLiteral())) ||
          (needle.kind() === ExprKind.Ident &&
            element.kind() === ExprKind.Ident &&
            element.asIdent() === needle.asIdent())
        ) {
          return true;
        }
      }
    }
  }
  return children.every((child) => constantExpressionMatcher(child));
}

/**
 * isSelfEqualIdent reports whether an identifier's static type guarantees self-equality.
 *
 * Double, dynamic, abstract, and struct values can contain NaN, so name equality only proves list
 * membership for scalar types without NaN and aggregates whose parameters are also self-equal.
 */
function isSelfEqualIdent(expression: Expr): boolean {
  if (expression.kind() !== ExprKind.Ident) {
    return false;
  }
  const checkedType = (expression as Partial<NavigableExpr>).type?.();
  return checkedType !== undefined && isSelfEqualType(exprTypeToType(checkedType));
}

/**
 * isSelfEqualType reports whether every runtime value of a type equals itself.
 */
function isSelfEqualType(type: Type): boolean {
  switch (type.kind()) {
    case Kind.Bool:
    case Kind.Bytes:
    case Kind.Duration:
    case Kind.Int:
    case Kind.NullType:
    case Kind.String:
    case Kind.Timestamp:
    case Kind.Type:
    case Kind.Uint:
      return true;
    case Kind.List:
    case Kind.Map:
      return type.parameters().every((parameter) => isSelfEqualType(parameter));
    default:
      return false;
  }
}

/**
 * isCanonicalDurationCall reports whether duration syntax already uses CEL's normalized seconds form.
 */
function isCanonicalDurationCall(argumentsValue: Expr[]): boolean {
  const value = argumentsValue[0]?.asLiteral();
  return typeof value === "string" && /^-?\d+(?:\.\d+)?s$/.test(value);
}

/**
 * constantExpressionMatcher recognizes literal aggregates and adapted literal call syntax.
 */
function constantExpressionMatcher(expression: Expr): boolean {
  if (constantValueMatcher()(expression as never)) {
    return true;
  }
  if (expression.kind() !== ExprKind.Call) {
    return false;
  }
  const functionName = expression.asCall()!.functionName();
  if (
    functionName !== "duration" &&
    functionName !== "timestamp" &&
    functionName !== "optional.none" &&
    functionName !== "optional.of"
  ) {
    return false;
  }
  return expression.children().every((child) => constantExpressionMatcher(child));
}

/**
 * isNestedComprehension reports whether an expression has a comprehension ancestor.
 */
function isNestedComprehension(expression: ReturnType<typeof navigateAst>): boolean {
  let [parent, found] = expression.parent();
  while (found && parent) {
    if (parent.kind() === ExprKind.Comprehension) {
      return true;
    }
    [parent, found] = parent.parent();
  }
  return false;
}

/**
 * runtimeLiteral returns a runtime CEL value stored in a literal node.
 */
function runtimeLiteral(expression: Expr): Val | undefined {
  const value = expression.asLiteral();
  return isRuntimeValue(value) ? value : undefined;
}

/**
 * OptionalExpressionValue describes an optional value represented either at runtime or in syntax.
 */
interface OptionalExpressionValue {
  /** hasValue indicates whether the optional contains a value. */
  hasValue: boolean;
  /** value is the syntax expression contained by a populated optional. */
  value?: Expr;
}

/**
 * optionalExpressionValue decodes runtime optionals and their adapted call representation.
 */
function optionalExpressionValue(
  context: OptimizerContext,
  expression: Expr,
): OptionalExpressionValue | undefined {
  const runtime = runtimeLiteral(expression);
  if (runtime instanceof Optional) {
    return runtime.hasValue()
      ? {
          hasValue: true,
          value: adaptLiteral(context, runtime.getValue()),
        }
      : { hasValue: false };
  }
  if (expression.kind() !== ExprKind.Call) {
    return undefined;
  }
  const call = expression.asCall()!;
  if (call.functionName() === "optional.none") {
    return { hasValue: false };
  }
  if (
    call.functionName() === "optional.of" &&
    call.args()[0] &&
    constantExpressionMatcher(call.args()[0]!)
  ) {
    return { hasValue: true, value: call.args()[0] };
  }
  return undefined;
}

/**
 * isRuntimeValue reports whether an unknown value implements the CEL value contract.
 */
function isRuntimeValue(value: unknown): value is Val {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "function" &&
    "value" in value &&
    typeof value.value === "function"
  );
}

/**
 * runtimeScalar converts a scalar CEL runtime value to AST literal data.
 */
function runtimeScalar(value: Val):
  | null
  | boolean
  | bigint
  | number
  | string
  | Uint8Array
  | {
      $typeName: "cel.expr.Constant";
      constantKind: { case: "uint64Value"; value: bigint };
    } {
  if (value instanceof Uint) {
    return {
      $typeName: "cel.expr.Constant",
      constantKind: { case: "uint64Value", value: value.value() },
    };
  }
  if (
    value instanceof Bool ||
    value instanceof Bytes ||
    value instanceof Double ||
    value instanceof Int ||
    value instanceof CelString
  ) {
    return value.value();
  }
  if (value.type() === NullType) {
    return null;
  }
  throw new Error(`failed to adapt ${String(value.value())} to literal`);
}

/**
 * runtimeString converts a runtime value through CEL's canonical string conversion.
 */
function runtimeString(value: Val): string {
  const converted = value.convertToType(StringType);
  if (converted instanceof Err) {
    throw converted;
  }
  return (converted as CelString).value();
}

/**
 * literalBoolean returns the boolean value of a literal expression when one exists.
 */
function literalBoolean(expression: Expr): boolean | undefined {
  if (expression.kind() !== ExprKind.Literal) {
    return undefined;
  }
  const value = expression.asLiteral();
  return value instanceof Bool ? value.value() : typeof value === "boolean" ? value : undefined;
}

/**
 * literalEquals compares two scalar AST literal values using CEL equality when necessary.
 */
function literalEquals(left: unknown, right: unknown): boolean {
  if (isRuntimeValue(left) && isRuntimeValue(right)) {
    const equal = left.equal(right);
    return equal instanceof Bool && equal.value();
  }
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}
