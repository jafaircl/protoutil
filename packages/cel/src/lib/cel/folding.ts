/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-case-declarations */
import { equals } from '@bufbuild/protobuf';
import { AST, CheckedAST } from '../common/ast/ast.js';
import {
  constantValueMatcher,
  kindMatcher,
  matchDescendants,
  NavigableExpr,
  newNavigableExprVisitor,
  postOrderVisitNavigable,
  preOrderVisitNavigable,
} from '../common/ast/navigable.js';
import {
  CONDITIONAL_OPERATOR,
  IN_OPERATOR,
  LOGICAL_AND_OPERATOR,
  LOGICAL_OR_OPERATOR,
} from '../common/operators.js';
import {
  TYPE_CONVERT_DURATION_OVERLOAD,
  TYPE_CONVERT_TIMESTAMP_OVERLOAD,
} from '../common/overloads.js';
import { protoConstantExprToRefVal } from '../common/pb/constants.js';
import {
  isCallProtoExpr,
  isComprehensionProtoExpr,
  isConstantProtoExpr,
  isIdentProtoExpr,
  isListProtoExpr,
  isMapProtoExpr,
  unwrapBoolProtoExpr,
  unwrapCallProtoExpr,
  unwrapComprehensionProtoExpr,
  unwrapConstantProtoExpr,
  unwrapIdentProtoExpr,
  unwrapListProtoExpr,
  unwrapMapEntryProtoExpr,
  unwrapMapProtoExpr,
  unwrapMessageFieldProtoExpr,
  unwrapMessageProtoExpr,
  unwrapSelectProtoExpr,
} from '../common/pb/expressions.js';
import { RefVal } from '../common/ref/reference.js';
import { BoolRefVal } from '../common/types/bool.js';
import { ErrorRefVal } from '../common/types/error.js';
import { isOptionalRefVal, OptionalRefVal, OptionalType } from '../common/types/optional.js';
import { StringRefVal } from '../common/types/string.js';
import { isFieldTester } from '../common/types/traits/field-tester.js';
import { isIndexer } from '../common/types/traits/indexer.js';
import { isLister } from '../common/types/traits/lister.js';
import { isMapper } from '../common/types/traits/mapper.js';
import {
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  IntType,
  ListType,
  MapType,
  NullType,
  StringType,
  TimestampType,
  Type,
  TypeType,
  UintType,
} from '../common/types/types.js';
import { isNil } from '../common/utils.js';
import {
  Constant,
  ConstantSchema,
  Expr,
  Expr_CreateStruct_Entry,
} from '../protogen-exports/index.js';
import { Ast } from './env.js';
import { ASTOptimizer, OptimizerContext } from './optimizer.js';
import { Activation, noVars } from './program.js';

const DEFAULT_MAX_CONSTANT_FOLD_ITERATIONS = 100;

const constantMatcher = constantValueMatcher();

/**
 * ConstantFoldingOption defines a functional option for configuring constant folding.
 */
export type ConstantFoldingOption = (
  optimizer: ConstantFoldingOptimizer
) => ConstantFoldingOptimizer;

/**
 * MaxConstantFoldIterations limits the number of times literals may be folding during optimization.
 *
 * Defaults to 100 if not set.
 */
export function maxConstantFoldIterations(limit: number): ConstantFoldingOption {
  return (opt: ConstantFoldingOptimizer) => {
    opt.maxFoldIterations = limit;
    return opt;
  };
}

/**
 * Adds an Activation which provides known values for the folding evaluator
 *
 * Any values the activation provides will be used by the constant folder and turned into
 * literals in the AST.
 *
 * Defaults to the NoVars() Activation
 */
export function foldKnownValues(knownValues: Activation): ConstantFoldingOption {
  return (opt: ConstantFoldingOptimizer) => {
    if (!isNil(knownValues)) {
      opt.knownValues = knownValues;
    } else {
      opt.knownValues = noVars();
    }
    return opt;
  };
}

export class ConstantFoldingOptimizer implements ASTOptimizer {
  maxFoldIterations: number = DEFAULT_MAX_CONSTANT_FOLD_ITERATIONS;
  knownValues: Activation = noVars();

  constructor(...opts: ConstantFoldingOption[]) {
    for (const o of opts) {
      o(this);
    }
  }

  /**
   * Optimize queries the expression graph for scalar and aggregate literal expressions within call and
   * select statements and then evaluates them and replaces the call site with the literal result.
   *
   * Note: only values which can be represented as literals in CEL syntax are supported.
   */
  optimize(ctx: OptimizerContext, a: AST): AST {
    const root = new NavigableExpr(a);

    // Walk the list of foldable expression and continue to fold until there are no more folds left.
    // All of the fold candidates returned by the constantExprMatcher should succeed unless there's
    // a logic bug with the selection of expressions.
    const constantExprMatcherCapture = (e: NavigableExpr) => this.constantExprMatcher(ctx, a, e);
    let foldableExprs = matchDescendants(root, constantExprMatcherCapture);
    let foldCount = 0;
    while (foldableExprs.length !== 0 && foldCount < this.maxFoldIterations) {
      for (const fold of foldableExprs) {
        // If the expression could be folded because it's a non-strict call, and the
        // branches are pruned, continue to the next fold.
        if (fold.kind() === 'callExpr' && maybePruneBranches(ctx, fold)) {
          continue;
        }
        // Late-bound function calls cannot be folded.
        if (fold.kind() === 'callExpr' && isLateBoundFunctionCall(ctx, a, fold.expr())) {
          continue;
        }
        // Otherwise, assume all context is needed to evaluate the expression.
        const err = this.tryFold(ctx, a, fold.expr());
        // Ignore errors for identifiers, since there is no guarantee that the environment
        // has a value for them.
        if (!isNil(err) && fold.kind() !== 'identExpr') {
          const message = err instanceof ErrorRefVal ? err.value().message : err?.message;
          ctx.issues.reportErrorAtID(fold.id(), `constant-folding evaluation failed: ${message}`);
          return a;
        }
      }
      foldCount++;
      foldableExprs = matchDescendants(root, constantExprMatcherCapture);
    }
    // Once all of the constants have been folded, try to run through the remaining comprehensions
    // one last time. In this case, there's no guarantee they'll run, so we only update the
    // target comprehension node with the literal value if the evaluation succeeds.
    for (const compre of matchDescendants(root, kindMatcher('comprehensionExpr'))) {
      this.tryFold(ctx, a, compre.expr());
    }

    // If the output is a list, map, or struct which contains optional entries, then prune it
    // to make sure that the optionals, if resolved, do not surface in the output literal.
    pruneOptionalElements(ctx, root);

    // Ensure that all intermediate values in the folded expression can be represented as valid
    // CEL literals within the AST structure. Use `PostOrderVisit` rather than `MatchDescendents`
    // to avoid extra allocations during this final pass through the AST.
    postOrderVisitNavigable(
      root,
      newNavigableExprVisitor((_e) => {
        if (_e.kind() !== 'constExpr') {
          return;
        }
        const val = protoConstantExprToRefVal(_e.expr());
        const adapted = adaptLiteral(ctx, val);
        if (adapted instanceof Error) {
          ctx.issues.reportErrorAtID(
            root.id(),
            `constant-folding evaluation failed: ${adapted.message}`
          );
          return;
        }
        ctx.optimizerExprFactory.updateExpr(_e.expr(), adapted);
      })
    );

    return a;
  }

  /**
   * tryFold attempts to evaluate a sub-expression to a literal.
   *
   * If the evaluation succeeds, the input expr value will be modified to become a literal, otherwise
   * the method will return an error.
   */
  tryFold(ctx: OptimizerContext, a: AST, expr: Expr): void | Error | ErrorRefVal {
    // Assume all context is needed to evaluate the expression.
    const subAST = new Ast(
      a.sourceInfo().source(),
      new CheckedAST(new AST(expr, a.sourceInfo()), a.typeMap(), a.referenceMap())
    );
    const prg = ctx.env.program(subAST);
    if (prg instanceof Error) {
      return prg;
    }
    const activation = this.knownValues ?? noVars();
    const [out, , err] = prg.eval(activation);
    if (!isNil(err)) {
      return err;
    }
    // Update the fold expression to be a literal.
    ctx.optimizerExprFactory.updateExpr(expr, ctx.optimizerExprFactory.newLiteral(out!));
  }

  /**
   * constantExprMatcher matches calls, select statements, and comprehensions whose arguments
   * are all constant scalar or aggregate literal values.
   *
   *  Only comprehensions which are not nested are included as possible constant folds, and only
   * if all variables referenced in the comprehension stack exist are only iteration or
   * accumulation variables.
   */
  constantExprMatcher(ctx: OptimizerContext, a: AST, e: NavigableExpr) {
    switch (e.kind()) {
      case 'callExpr':
        return constantCallMatcher(e);
      case 'selectExpr':
        const sel = unwrapSelectProtoExpr(e.expr())!;
        return constantMatcher(new NavigableExpr(new AST(sel.operand!, a.sourceInfo()), e));
      case 'identExpr':
        return this.knownValues && !isNil(a.referenceMap().get(e.id()));
      case 'comprehensionExpr':
        if (isNestedComprehension(e)) {
          return false;
        }
        const vars = new Map<string, boolean>();
        let constantExprs = true;
        const visitor = newNavigableExprVisitor((_e) => {
          if (isComprehensionProtoExpr(_e.expr())) {
            const nested = unwrapComprehensionProtoExpr(_e.expr())!;
            vars.set(nested.accuVar, true);
            vars.set(nested.iterVar, true);
          }
          if (isIdentProtoExpr(_e.expr()) && !vars.has(unwrapIdentProtoExpr(_e.expr())!.name)) {
            constantExprs = false;
          }
          // Late-bound function calls cannot be folded.
          if (isCallProtoExpr(_e.expr()) && isLateBoundFunctionCall(ctx, a, _e.expr())) {
            constantExprs = false;
          }
        });
        preOrderVisitNavigable(e, visitor);
        return constantExprs;
      default:
        return false;
    }
  }
}

function isLateBoundFunctionCall(ctx: OptimizerContext, a: AST, expr: Expr): boolean {
  const call = unwrapCallProtoExpr(expr)!;
  const fn = ctx.env.functions.get(call.function);
  if (isNil(fn)) {
    return false;
  }
  return fn.hasLateBinding();
}

/**
 * maybePruneBranches inspects the non-strict call expression to determine whether
 * a branch can be removed. Evaluation will naturally prune logical and / or calls,
 * but conditional will not be pruned cleanly, so this is one small area where the
 * constant folding step reimplements a portion of the evaluator.
 */
function maybePruneBranches(ctx: OptimizerContext, expr: NavigableExpr): boolean {
  const call = unwrapCallProtoExpr(expr.expr())!;
  const args = call.args;
  switch (call.function) {
    case LOGICAL_AND_OPERATOR:
    case LOGICAL_OR_OPERATOR:
      return maybeShortcircuitLogic(ctx, call.function, args, expr);
    case CONDITIONAL_OPERATOR:
      const cond = args[0];
      const truthy = args[1];
      const falsy = args[2];
      if (!isConstantProtoExpr(cond)) {
        return false;
      }
      if (unwrapBoolProtoExpr(cond) === true) {
        ctx.optimizerExprFactory.updateExpr(expr.expr(), truthy);
      } else {
        ctx.optimizerExprFactory.updateExpr(expr.expr(), falsy);
      }
      return true;
    case IN_OPERATOR:
      const haystack = args[1];
      if (isListProtoExpr(haystack) && haystack.exprKind.value.elements.length === 0) {
        ctx.optimizerExprFactory.updateExpr(
          expr.expr(),
          ctx.optimizerExprFactory.newLiteral(BoolRefVal.False)
        );
        return true;
      }
      const needle = args[0];
      if (isConstantProtoExpr(needle) && isListProtoExpr(haystack)) {
        const needleValue = unwrapConstantProtoExpr(needle)!;
        const list = unwrapListProtoExpr(haystack)!;
        for (const e of list.elements) {
          if (
            isConstantProtoExpr(e) &&
            unwrapConstantProtoExpr(e)!.constantKind.value === needleValue.constantKind.value
          ) {
            ctx.optimizerExprFactory.updateExpr(
              expr.expr(),
              ctx.optimizerExprFactory.newLiteral(BoolRefVal.True)
            );
            return true;
          }
        }
      }
  }
  return false;
}

function maybeShortcircuitLogic(
  ctx: OptimizerContext,
  fn: string,
  args: Expr[],
  expr: NavigableExpr
): boolean {
  let shortcircuit = false;
  let skip = true;
  if (fn == LOGICAL_OR_OPERATOR) {
    shortcircuit = true;
    skip = false;
  }
  const newArgs: Expr[] = [];
  for (const arg of args) {
    if (!isConstantProtoExpr(arg)) {
      newArgs.push(arg);
      continue;
    }
    if (unwrapBoolProtoExpr(arg) === skip) {
      continue;
    }
    if (unwrapBoolProtoExpr(arg) === shortcircuit) {
      ctx.optimizerExprFactory.updateExpr(expr.expr(), arg);
      return true;
    }
  }
  if (newArgs.length === 0) {
    newArgs.push(args[0]);
    ctx.optimizerExprFactory.updateExpr(expr.expr(), newArgs[0]);
    return true;
  }
  if (newArgs.length === 1) {
    ctx.optimizerExprFactory.updateExpr(expr.expr(), newArgs[0]);
    return true;
  }
  ctx.optimizerExprFactory.updateExpr(expr.expr(), ctx.optimizerExprFactory.newCall(fn, newArgs));
  return true;
}

// pruneOptionalElements works from the bottom up to resolve optional elements within
// aggregate literals.
//
// Note, many aggregate literals will be resolved as arguments to functions or select
// statements, so this method exists to handle the case where the literal could not be
// fully resolved or exists outside of a call, select, or comprehension context.
function pruneOptionalElements(ctx: OptimizerContext, root: NavigableExpr) {
  const aggregateLiterals = matchDescendants(root, aggregateLiteralMatcher);
  for (const lit of aggregateLiterals) {
    switch (lit.kind()) {
      case 'listExpr':
        pruneOptionalListElements(ctx, lit.expr());
        break;
      case 'selectExpr':
        if (isMapProtoExpr(lit.expr())) {
          pruneOptionalMapEntries(ctx, lit.expr());
        } else {
          pruneOptionalStructFields(ctx, lit.expr());
        }
        break;
    }
  }
}

function pruneOptionalListElements(ctx: OptimizerContext, e: Expr) {
  const l = unwrapListProtoExpr(e)!;
  const elems = l.elements;
  const optIndices = l.optionalIndices;
  if (optIndices.length === 0) {
    return;
  }
  const updateElems: Expr[] = [];
  const updatedIndices: number[] = [];
  let newOptIndex = -1;
  for (const _e of elems) {
    newOptIndex++;
    if (!optIndices.includes(newOptIndex)) {
      updateElems.push(_e);
      continue;
    }
    if (!isConstantProtoExpr(_e)) {
      updateElems.push(_e);
      updatedIndices.push(newOptIndex);
      continue;
    }
    const optElemVal = new OptionalRefVal(protoConstantExprToRefVal(_e));
    if (!isOptionalRefVal(optElemVal)) {
      updateElems.push(_e);
      updatedIndices.push(newOptIndex);
      continue;
    }
    if (!optElemVal.hasValue()) {
      newOptIndex--; // Skipping causes the list to get smaller.
      continue;
    }
    ctx.optimizerExprFactory.updateExpr(
      _e,
      ctx.optimizerExprFactory.newLiteral(optElemVal.getValue())
    );
    updateElems.push(_e);
  }
  ctx.optimizerExprFactory.updateExpr(
    e,
    ctx.optimizerExprFactory.newList(updateElems, updatedIndices)
  );
}

function pruneOptionalMapEntries(ctx: OptimizerContext, e: Expr) {
  // TODO: if something is wrong take a look at this function
  const m = unwrapMapProtoExpr(e)!;
  const entries = m.entries;
  const updatedEntries: Expr_CreateStruct_Entry[] = [];
  let modified = false;
  for (const e of entries ?? []) {
    const entry = unwrapMapEntryProtoExpr(e)!;
    const key = entry.keyKind.value;
    const val = entry.value!;
    // If the entry is not optional, or the value-side of the optional hasn't
    // been resolved to a literal, then preserve the entry as-is.
    if (!entry.optionalEntry || !isConstantProtoExpr(val)) {
      updatedEntries.push(e);
      continue;
    }
    const optElemVal = new OptionalRefVal(protoConstantExprToRefVal(val));
    if (!isOptionalRefVal(optElemVal)) {
      updatedEntries.push(e);
      continue;
    }
    // When the key is not a literal, but the value is, then it needs to be
    // restored to an optional value.
    if (!isConstantProtoExpr(key)) {
      const undoOptVal = adaptLiteral(ctx, optElemVal);
      if (undoOptVal instanceof Error) {
        ctx.issues.reportErrorAtID(
          val.id,
          `invalid map value literal ${optElemVal.type().typeName()}: ${undoOptVal.message}`
        );
      }
      ctx.optimizerExprFactory.updateExpr(val, undoOptVal as Expr);
      updatedEntries.push(e);
      continue;
    }
    modified = true;
    if (!optElemVal.hasValue()) {
      continue;
    }
    ctx.optimizerExprFactory.updateExpr(
      val,
      ctx.optimizerExprFactory.newLiteral(optElemVal.getValue())
    );
    const updatedEntry = ctx.optimizerExprFactory.newMapEntry(key, val, false);
    updatedEntries.push(updatedEntry);
  }
  if (modified) {
    ctx.optimizerExprFactory.updateExpr(e, ctx.optimizerExprFactory.newMap(updatedEntries));
  }
}

function pruneOptionalStructFields(ctx: OptimizerContext, e: Expr) {
  // TODO: if something is wrong take a look at this function
  const s = unwrapMessageProtoExpr(e);
  const fields = s?.entries;
  const updatedFields: Expr_CreateStruct_Entry[] = [];
  let modified = false;
  for (const f of fields ?? []) {
    const field = unwrapMessageFieldProtoExpr(f)!;
    const val = field.value;
    if (!field.optionalEntry || !isConstantProtoExpr(val!)) {
      updatedFields.push(f);
      continue;
    }
    const optElemVal = new OptionalRefVal(protoConstantExprToRefVal(val));
    if (!isOptionalRefVal(optElemVal)) {
      updatedFields.push(f);
      continue;
    }
    modified = true;
    if (!optElemVal.hasValue()) {
      continue;
    }
    ctx.optimizerExprFactory.updateExpr(
      val,
      ctx.optimizerExprFactory.newLiteral(optElemVal.getValue())
    );
    const updatedField = ctx.optimizerExprFactory.newStructField(field.keyKind.value, val, false);
    updatedFields.push(updatedField);
  }
  if (modified) {
    ctx.optimizerExprFactory.updateExpr(
      e,
      ctx.optimizerExprFactory.newStruct(s!.messageName, updatedFields)
    );
  }
}

/**
 * adaptLiteral converts a runtime CEL value to its equivalent literal expression.
 *
 * For strongly typed values, the type-provider will be used to reconstruct the fields
 * which are present in the literal and their equivalent initialization values.
 */
function adaptLiteral(ctx: OptimizerContext, val: RefVal): Expr | Error {
  switch (val.type() as Type) {
    case BoolType:
    case BytesType:
    case DoubleType:
    case IntType:
    case NullType:
    case StringType:
    case UintType:
      return ctx.optimizerExprFactory.newLiteral(val);
    case DurationType:
      return ctx.optimizerExprFactory.newCall(TYPE_CONVERT_DURATION_OVERLOAD, [
        ctx.optimizerExprFactory.newLiteral(val.convertToType(StringType)),
      ]);
    case TimestampType:
      return ctx.optimizerExprFactory.newCall(TYPE_CONVERT_TIMESTAMP_OVERLOAD, [
        ctx.optimizerExprFactory.newLiteral(val.convertToType(StringType)),
      ]);
    case OptionalType:
      const opt = val as OptionalRefVal;
      if (!opt.hasValue()) {
        return ctx.optimizerExprFactory.newCall('optional.none', []);
      }
      const target = adaptLiteral(ctx, opt.getValue());
      if (target instanceof Error) {
        return target;
      }
      return ctx.optimizerExprFactory.newCall('optional.of', [target]);
    case TypeType:
      return ctx.optimizerExprFactory.newIdent(val.type().typeName());
    case ListType:
      if (!isLister(val)) {
        return new Error(`failed to adapt ${val.type().toString()} to literal`);
      }
      const elems: Expr[] = [];
      const listIterator = val.iterator();
      while (listIterator.hasNext().value() === true) {
        const elemVal = listIterator.next();
        const elemExpr = adaptLiteral(ctx, elemVal!);
        if (elemExpr instanceof Error) {
          return elemExpr;
        }
        elems.push(elemExpr);
      }
      return ctx.optimizerExprFactory.newList(elems);
    case MapType:
      if (!isMapper(val)) {
        return new Error(`failed to adapt ${val.type().toString()} to literal`);
      }
      const entries: Expr_CreateStruct_Entry[] = [];
      const it = val.iterator();
      while (it.hasNext().value() === true) {
        const keyVal = it.next();
        const keyExpr = adaptLiteral(ctx, keyVal!);
        if (keyExpr instanceof Error) {
          return keyExpr;
        }
        const valVal = val.get(keyVal!);
        const valExpr = adaptLiteral(ctx, valVal);
        if (valExpr instanceof Error) {
          return valExpr;
        }
        entries.push(ctx.optimizerExprFactory.newMapEntry(keyExpr, valExpr, false));
      }
      return ctx.optimizerExprFactory.newMap(entries);
    default:
      const provider = ctx.env.CELTypeProvider();
      const fields = provider.findStructFieldNames(val.type().typeName());
      if (!fields) {
        return new Error(`failed to adapt ${val.type().toString()} to literal`);
      }
      if (!isFieldTester(val) || !isIndexer(val)) {
        return new Error(`failed to adapt ${val.type().toString()} to literal: missing traits`);
      }
      const fieldInits: Expr_CreateStruct_Entry[] = [];
      for (const f of fields) {
        const field = new StringRefVal(f);
        if (val.isSet(field).value() !== true) {
          continue;
        }
        const fieldVal = val.get(field);
        const fieldExpr = adaptLiteral(ctx, fieldVal);
        if (fieldExpr instanceof Error) {
          return fieldExpr;
        }
        fieldInits.push(ctx.optimizerExprFactory.newStructField(f, fieldExpr, false));
      }
      return ctx.optimizerExprFactory.newStruct(val.type().typeName(), fieldInits);
  }
  return new Error(`failed to adapt ${val.type().toString()} to literal`);
}

/**
 * constantCallMatcher identifies strict and non-strict calls which can be folded.
 */
function constantCallMatcher(e: NavigableExpr): boolean {
  const call = unwrapCallProtoExpr(e.expr())!;
  const children = e.children();
  const fnName = call.function;
  if (fnName === LOGICAL_AND_OPERATOR) {
    for (const child of children) {
      if (child.kind() === 'constExpr') {
        return true;
      }
    }
  }
  if (fnName === LOGICAL_OR_OPERATOR) {
    for (const child of children) {
      if (child.kind() === 'constExpr') {
        return true;
      }
    }
  }
  if (fnName === CONDITIONAL_OPERATOR) {
    const cond = children[0];
    if (
      cond.kind() === 'constExpr' &&
      unwrapConstantProtoExpr(cond.expr())?.constantKind.case === 'boolValue'
    ) {
      return true;
    }
  }
  if (fnName === IN_OPERATOR) {
    const haystack = children[1];
    if (
      haystack.kind() === 'listExpr' &&
      unwrapListProtoExpr(haystack.expr())?.elements.length === 0
    ) {
      return true;
    }
    const needle = children[0];
    if (needle.kind() === 'constExpr' && isListProtoExpr(haystack.expr())) {
      const needleValue = unwrapConstantProtoExpr(needle.expr());
      const list = unwrapListProtoExpr(haystack.expr());
      for (const _e of list?.elements ?? []) {
        if (
          _e.exprKind.case === 'constExpr' &&
          equals(ConstantSchema, _e.exprKind.value, needleValue as Constant)
        ) {
          return true;
        }
      }
    }
  }
  // convert all other calls with constant arguments
  for (const child of children) {
    if (!constantMatcher(child)) {
      return false;
    }
  }
  return true;
}

function isNestedComprehension(e: NavigableExpr): boolean {
  let parent = e.parent();
  while (parent) {
    if (parent.kind() === 'comprehensionExpr') {
      return true;
    }
    parent = parent.parent();
  }
  return false;
}

function aggregateLiteralMatcher(e: NavigableExpr): boolean {
  return e.kind() === 'listExpr' || e.kind() === 'structExpr';
}
