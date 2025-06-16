/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-case-declarations */
import { AST, newSourceInfo } from '../common/ast.js';
import {
  CONDITIONAL_OPERATOR,
  IN_OPERATOR,
  LOGICAL_AND_OPERATOR,
  LOGICAL_NOT_OPERATOR,
  LOGICAL_OR_OPERATOR,
} from '../common/operators.js';
import {
  TYPE_CONVERT_DURATION_OVERLOAD,
  TYPE_CONVERT_TIMESTAMP_OVERLOAD,
} from '../common/overloads.js';
import { refValToProtoConstant } from '../common/pb/constants.js';
import {
  isCallProtoExpr,
  isIdentProtoExpr,
  isMapProtoExpr,
  newComprehensionProtoExpr,
  newConstantProtoExpr,
  newGlobalCallProtoExpr,
  newListProtoExpr,
  newMapEntryProtoExpr,
  newMapProtoExpr,
  newMessageFieldProtoExpr,
  newMessageProtoExpr,
  newReceiverCallProtoExpr,
  newSelectProtoExpr,
  newStringProtoExpr,
  newTestOnlySelectProtoExpr,
  unwrapCallProtoExpr,
  unwrapComprehensionProtoExpr,
  unwrapListProtoExpr,
  unwrapMapEntryProtoExpr,
  unwrapMapProtoExpr,
  unwrapMessageFieldProtoExpr,
  unwrapMessageProtoExpr,
  unwrapSelectProtoExpr,
} from '../common/pb/expressions.js';
import { RefVal } from '../common/ref/reference.js';
import { BoolRefVal, isBoolRefVal } from '../common/types/bool.js';
import { BytesRefVal } from '../common/types/bytes.js';
import { DoubleRefVal } from '../common/types/double.js';
import { DurationRefVal } from '../common/types/duration.js';
import { IntRefVal } from '../common/types/int.js';
import { reflectNativeType } from '../common/types/native.js';
import { NullRefVal } from '../common/types/null.js';
import { isOptionalRefVal, OptionalRefVal } from '../common/types/optional.js';
import { StringRefVal } from '../common/types/string.js';
import { TimestampRefVal } from '../common/types/timestamp.js';
import { isLister } from '../common/types/traits/lister.js';
import { isMapper } from '../common/types/traits/mapper.js';
import { isSizer } from '../common/types/traits/sizer.js';
import { StringType } from '../common/types/types.js';
import { UintRefVal } from '../common/types/uint.js';
import { isUnknownOrError } from '../common/types/utils.js';
import { isNil } from '../common/utils.js';
import { Expr, Expr_CreateStruct_Entry } from '../protogen-exports/index.js';
import { EvalState } from './evalstate.js';

export class AstPruner {
  private _nextExprID: bigint;

  constructor(
    public readonly expr: Expr,
    public readonly macroCalls: Map<bigint, Expr>,
    public readonly state: EvalState
  ) {
    this._nextExprID = getMaxID(this.expr);
    const _state = this.state;
    const pruneState = new EvalState();
    for (const id of _state.ids()) {
      const v = _state.value(id);
      pruneState.setValue(id, v!);
    }
    this.state = pruneState;
  }

  prune() {
    const newExpr = this._maybePrune(this.expr);
    const newInfo = newSourceInfo();
    for (const [id, call] of this.macroCalls) {
      newInfo.setMacroCall(id, call);
    }
    return new AST(newExpr ?? this.expr, newInfo);
  }

  private _maybeCreateLiteral(id: bigint, val: RefVal): Expr | null {
    const type = reflectNativeType(val);
    switch (type) {
      case BoolRefVal:
      case BytesRefVal:
      case DoubleRefVal:
      case IntRefVal:
      case NullRefVal:
      case StringRefVal:
      case UintRefVal:
      case OptionalRefVal:
        this.state.setValue(id, val);
        return newConstantProtoExpr(id, refValToProtoConstant(val));
      case DurationRefVal:
        this.state.setValue(id, val);
        const durationString = val.convertToType(StringType);
        return newGlobalCallProtoExpr(id, TYPE_CONVERT_DURATION_OVERLOAD, [
          newStringProtoExpr(this._nextID(), durationString.value()),
        ]);
      case TimestampRefVal:
        const timestampString = val.convertToType(StringType);
        return newGlobalCallProtoExpr(id, TYPE_CONVERT_TIMESTAMP_OVERLOAD, [
          newStringProtoExpr(this._nextID(), timestampString.value()),
        ]);
      default:
        break;
    }

    // Attempt to build a list literal.
    if (isLister(val)) {
      const sz = val.size();
      const elemExprs: Expr[] = [];
      for (let i = 0n; i < sz.value(); i++) {
        const elem = val.get(new IntRefVal(i));
        if (isUnknownOrError(elem)) {
          return null;
        }
        const elemExpr = this._maybeCreateLiteral(this._nextID(), elem);
        if (isNil(elemExpr)) {
          return null;
        }
        elemExprs.push(elemExpr);
      }
      this.state.setValue(id, val);
      return newListProtoExpr(id, elemExprs);
    }

    // Create a map literal if possible.
    if (isMapper(val)) {
      const it = val.iterator();
      const entries: Expr_CreateStruct_Entry[] = [];
      while (it.hasNext().value()) {
        const key = it.next()!;
        const v = val.get(key);
        if (isUnknownOrError(key) || isUnknownOrError(v)) {
          return null;
        }
        const keyExpr = this._maybeCreateLiteral(this._nextID(), key);
        if (isNil(keyExpr)) {
          return null;
        }
        const valExpr = this._maybeCreateLiteral(this._nextID(), v);
        if (isNil(valExpr)) {
          return null;
        }
        const entry = newMapEntryProtoExpr(this._nextID(), keyExpr, valExpr);
        entries.push(entry);
      }
      this.state.setValue(id, val);
      return newMapProtoExpr(id, entries);
    }

    // TODO(issues/377) To construct message literals, the type provider will need to support
    // the enumeration the fields for a given message.
    return null;
  }

  private _maybePruneOptional(elem: Expr): Expr | null {
    const elemVal = this._value(elem.id);
    if (isOptionalRefVal(elemVal)) {
      const opt = elemVal;
      if (!opt.hasValue()) {
        return null;
      }
      const newElem = this._maybeCreateLiteral(elem.id, opt.getValue());
      if (!isNil(newElem)) {
        return newElem;
      }
    }
    return elem;
  }

  private _maybePruneIn(node: Expr): Expr | null {
    if (!isCallProtoExpr(node)) {
      return null;
    }
    // elem in list
    const call = unwrapCallProtoExpr(node)!;
    const val = this._maybeValue(call.args[1]?.id);
    if (isNil(val)) {
      return null;
    }
    if (isSizer(val) && val.size().value() === 0n) {
      return this._maybeCreateLiteral(node.id, BoolRefVal.False);
    }
    return null;
  }

  private _maybePruneLogicalNot(node: Expr): Expr | null {
    if (!isCallProtoExpr(node)) {
      return null;
    }
    const call = unwrapCallProtoExpr(node)!;
    const arg = call.args[0];
    const val = this._maybeValue(arg.id);
    if (isNil(val)) {
      return null;
    }
    if (isBoolRefVal(val)) {
      return this._maybeCreateLiteral(node.id, val.negate());
    }
    return null;
  }

  private _maybePruneOr(node: Expr): Expr | null {
    if (!isCallProtoExpr(node)) {
      return null;
    }
    const call = unwrapCallProtoExpr(node)!;
    // We know result is unknown, so we have at least one unknown arg
    // and if one side is a known value, we know we can ignore it.
    let v = this._maybeValue(call.args[0].id);
    if (!isNil(v)) {
      if (isBoolRefVal(v) && v.value() === BoolRefVal.True.value()) {
        return this._maybeCreateLiteral(node.id, BoolRefVal.True);
      }
      return call.args[1];
    }
    v = this._maybeValue(call.args[1].id);
    if (!isNil(v)) {
      if (isBoolRefVal(v) && v.value() === BoolRefVal.True.value()) {
        return this._maybeCreateLiteral(node.id, BoolRefVal.True);
      }
      return call.args[0];
    }
    return null;
  }

  private _maybePruneAnd(node: Expr): Expr | null {
    if (!isCallProtoExpr(node)) {
      return null;
    }
    const call = unwrapCallProtoExpr(node)!;
    // We know result is unknown, so we have at least one unknown arg
    // and if one side is a known value, we know we can ignore it.
    let v = this._maybeValue(call.args[0]?.id);
    if (!isNil(v)) {
      if (isBoolRefVal(v) && v.value() === BoolRefVal.False.value()) {
        return this._maybeCreateLiteral(node.id, BoolRefVal.False);
      }
      return call.args[1];
    }
    v = this._maybeValue(call.args[1]?.id);
    if (!isNil(v)) {
      if (isBoolRefVal(v) && v.value() === BoolRefVal.False.value()) {
        return this._maybeCreateLiteral(node.id, BoolRefVal.False);
      }
      return call.args[0];
    }
    return null;
  }

  private _maybePruneConditional(node: Expr): Expr | null {
    if (!isCallProtoExpr(node)) {
      return null;
    }
    const call = unwrapCallProtoExpr(node)!;
    const cond = this._maybeValue(call.args[0]?.id);
    if (isNil(cond)) {
      return null;
    }
    if (cond.value() === true) {
      return call.args[1];
    }
    return call.args[2];
  }

  private _maybePruneFunction(node: Expr): Expr | null {
    if (isNil(this._value(node.id))) {
      return null;
    }
    if (!isCallProtoExpr(node)) {
      return null;
    }
    const call = unwrapCallProtoExpr(node)!;
    switch (call.function) {
      case LOGICAL_OR_OPERATOR:
        return this._maybePruneOr(node);
      case LOGICAL_AND_OPERATOR:
        return this._maybePruneAnd(node);
      case CONDITIONAL_OPERATOR:
        return this._maybePruneConditional(node);
      case IN_OPERATOR:
        return this._maybePruneIn(node);
      case LOGICAL_NOT_OPERATOR:
        return this._maybePruneLogicalNot(node);
      default:
        return null;
    }
  }

  private _maybePrune(node: Expr): Expr | null {
    return this._prune(node);
  }

  private _prune(node: Expr): Expr | null {
    if (isNil(node)) {
      return null;
    }
    const val = this._maybeValue(node.id);
    if (!isNil(val)) {
      const newNode = this._maybeCreateLiteral(node.id, val);
      if (!isNil(newNode)) {
        this.macroCalls.delete(node.id);
        return newNode;
      }
    }
    let macro = this.macroCalls.get(node.id);
    if (!isNil(macro)) {
      // Ensure that intermediate values for the comprehension are cleared during pruning
      let pruneMacroCall = (node.exprKind.case as string) !== '';
      if (node.exprKind.case === 'comprehensionExpr') {
        // Only prune cel.bind() calls since the variables of the comprehension are all
        // visible to the user, so there's no chance of an incorrect value being observed
        // as a result of looking at intermediate computations within a comprehension.
        pruneMacroCall = isCelBindMacro(macro);
      }
      if (pruneMacroCall) {
        // prune the expression in terms of the macro call instead of the expanded form when
        // dealing with macro call tracking references.
        const newMacro = this._prune(macro);
        if (!isNil(newMacro)) {
          this.macroCalls.set(node.id, newMacro);
        }
      } else {
        // Otherwise just prune the macro target in keeping with the pruning behavior of the
        // comprehensions later in the call graph.
        const macroCall = unwrapCallProtoExpr(macro)!;
        if (macroCall.target) {
          const newTarget = this._prune(macroCall.target);
          if (!isNil(newTarget)) {
            macro = newReceiverCallProtoExpr(
              macro.id,
              macroCall.function,
              newTarget,
              macroCall.args
            );
            this.macroCalls.set(node.id, macro);
          }
        }
      }
    }

    // We have either an unknown/error value, or something we don't want to
    // transform, or expression was not evaluated. If possible, drill down
    // more.
    switch (node.exprKind.case) {
      case 'selectExpr':
        const sel = unwrapSelectProtoExpr(node)!;
        const operand = this._maybePrune(sel.operand!);
        if (!isNil(operand)) {
          if (sel.testOnly === true) {
            return newTestOnlySelectProtoExpr(node.id, operand, sel.field);
          }
          return newSelectProtoExpr(node.id, operand, sel.field);
        }
        break;
      case 'callExpr':
        const call = unwrapCallProtoExpr(node)!;
        const args = call.args;
        const newArgs: Expr[] = [];
        for (const a of args) {
          const _prunedArg = this._maybePrune(a);
          if (!isNil(_prunedArg)) {
            newArgs.push(_prunedArg);
          } else {
            newArgs.push(a);
          }
        }
        if (!call.target) {
          const newCall = newGlobalCallProtoExpr(node.id, call.function, newArgs);
          const prunedCall = this._maybePruneFunction(newCall);
          if (!isNil(prunedCall)) {
            return prunedCall;
          }
          return newCall;
        }
        let newTarget = call.target;
        const prunedTarget = this._maybePrune(call.target);
        if (!isNil(prunedTarget)) {
          newTarget = prunedTarget;
        }
        const newCall = newReceiverCallProtoExpr(node.id, call.function, newTarget, newArgs);
        const prunedCall = this._maybePruneFunction(newCall);
        if (!isNil(prunedCall)) {
          return prunedCall;
        }
        return newCall;
      case 'listExpr':
        const l = unwrapListProtoExpr(node)!;
        const elems = l.elements;
        let optIndicies = l.optionalIndices;
        const optIndexMap = new Map<number, boolean>();
        for (let i = 0; i < optIndicies.length; i++) {
          optIndexMap.set(optIndicies[i], true);
        }
        const newOptIndexMap = new Map<number, boolean>();
        const newElems: Expr[] = [];
        let listPruned = false;
        let prunedIdx = 0;
        for (let i = 0; i < elems.length; i++) {
          const elem = elems[i];
          const isOpt = optIndexMap.has(i);
          if (isOpt) {
            const newElem = this._maybePruneOptional(elem);
            if (!isNil(newElem)) {
              listPruned = true;
              newElems.push(newElem);
              prunedIdx++;
              continue;
            }
            newOptIndexMap.set(prunedIdx, true);
          }
          const newElem = this._maybePrune(elem);
          if (!isNil(newElem)) {
            newElems.push(newElem);
            listPruned = true;
          } else {
            newElems.push(elem);
          }
          prunedIdx++;
        }
        optIndicies = [];
        for (const i of newOptIndexMap.keys()) {
          optIndicies.push(i);
        }
        if (listPruned) {
          return newListProtoExpr(node.id, newElems, optIndicies);
        }
        break;
      case 'structExpr':
        if (isMapProtoExpr(node)) {
          let mapPruned = false;
          const m = unwrapMapProtoExpr(node)!;
          const entries = m.entries;
          const newEntries: Expr_CreateStruct_Entry[] = [];
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            newEntries[i] = entry;
            const e = unwrapMapEntryProtoExpr(entry)!;
            const newKey = this._maybePrune(e.keyKind.value);
            const newValue = this._maybePrune(e.value!);
            if (isNil(newKey) && isNil(newValue)) {
              continue;
            }
            mapPruned = true;
            const newEntry = newMapEntryProtoExpr(entry.id, newKey!, newValue, e.optionalEntry);
            newEntries.push(newEntry);
          }
          if (mapPruned) {
            return newMapProtoExpr(node.id, newEntries);
          }
        } else {
          let structPruned = false;
          const obj = unwrapMessageProtoExpr(node)!;
          const fields = obj.entries;
          const newFields: Expr_CreateStruct_Entry[] = [];
          for (let i = 0; i < fields.length; i++) {
            const field = fields[i];
            newFields.push(field);
            const f = unwrapMessageFieldProtoExpr(field)!;
            const newValue = this._maybePrune(f.value!);
            if (isNil(newValue)) {
              continue;
            }
            structPruned = true;
            const newEntry = newMessageFieldProtoExpr(
              field.id,
              field.keyKind.value,
              newValue,
              f.optionalEntry
            );
            newFields.push(newEntry);
          }
          if (structPruned) {
            return newMessageProtoExpr(node.id, obj.messageName, newFields);
          }
        }
        break;
      case 'comprehensionExpr':
        const compre = unwrapComprehensionProtoExpr(node)!;
        // Only the range of the comprehension is pruned since the state tracking only records
        // the last iteration of the comprehension and not each step in the evaluation which
        // means that the any residuals computed in between might be inaccurate.
        const newRange = this._maybePrune(compre.iterRange!);
        if (!isNil(newRange)) {
          if (compre.iterVar2) {
            return newComprehensionProtoExpr(node.id, {
              iterRange: newRange,
              iterVar: compre.iterVar,
              iterVar2: compre.iterVar2,
              accuVar: compre.accuVar,
              accuInit: compre.accuInit,
              loopCondition: compre.loopCondition,
              loopStep: compre.loopStep,
              result: compre.result,
            });
          }
          return newComprehensionProtoExpr(node.id, {
            iterRange: newRange,
            iterVar: compre.iterVar,
            accuVar: compre.accuVar,
            accuInit: compre.accuInit,
            loopCondition: compre.loopCondition,
            loopStep: compre.loopStep,
            result: compre.result,
          });
        }
        break;
      default:
        break;
    }
    return node;
  }

  private _value(id: bigint): RefVal | null {
    return this.state.value(id);
  }

  private _maybeValue(id: bigint): RefVal | null {
    const val = this._value(id);
    if (isNil(val) || isUnknownOrError(val)) {
      return null;
    }
    return val;
  }

  private _nextID(): bigint {
    const next = this._nextExprID;
    this._nextExprID++;
    return next;
  }
}

interface AstVisitor {
  /**
   * visitEntry is called on every expr node, including those within a map/struct entry.
   */
  visitExpr(expr: Expr): void;

  /**
   * visitEntry is called before entering the key, value of a map/struct entry.
   */
  visitEntry(expr: Expr_CreateStruct_Entry): void;
}

class MaxIDVisitor implements AstVisitor {
  constructor(public maxID: bigint) {}

  visitExpr(expr: Expr): void {
    if (expr.id >= this.maxID) {
      this.maxID = expr.id + 1n;
    }
  }

  visitEntry(expr: Expr_CreateStruct_Entry) {
    if (expr.id >= this.maxID) {
      this.maxID = expr.id + 1n;
    }
  }
}

export function getMaxID(expr: Expr): bigint {
  const visitor = new MaxIDVisitor(1n);
  visit(expr, visitor);
  return visitor.maxID;
}

function visit(expr: Expr, visitor: AstVisitor) {
  let exprs = [expr];
  while (exprs.length > 0) {
    const e = exprs[0];
    if (!isNil(visitor.visitExpr)) {
      visitor.visitExpr(e);
    }
    exprs = exprs.slice(1);
    switch (e.exprKind.case) {
      case 'selectExpr':
        exprs.push(e.exprKind.value.operand!);
        break;
      case 'callExpr':
        const call = unwrapCallProtoExpr(e)!;
        if (call.target) {
          exprs.push(call.target);
        }
        for (const arg of call.args) {
          exprs.push(arg);
        }
        break;
      case 'comprehensionExpr':
        const compre = unwrapComprehensionProtoExpr(e)!;
        if (compre.iterRange) exprs.push(compre.iterRange);
        if (compre.accuInit) exprs.push(compre.accuInit);
        if (compre.loopCondition) exprs.push(compre.loopCondition);
        if (compre.loopStep) exprs.push(compre.loopStep);
        if (compre.result) exprs.push(compre.result);
        break;
      case 'listExpr':
        const listExpr = unwrapListProtoExpr(e)!;
        for (const item of listExpr.elements) {
          exprs.push(item);
        }
        break;
      case 'structExpr':
        if (isMapProtoExpr(e)) {
          for (const entry of e.exprKind.value.entries) {
            if (!isNil(visitor.visitEntry)) {
              visitor.visitEntry(entry);
            }
            exprs.push(entry.keyKind.value);
            if (entry.value) exprs.push(entry.value);
          }
        } else {
          for (const entry of e.exprKind.value.entries) {
            if (!isNil(visitor.visitEntry)) {
              visitor.visitEntry(entry);
            }
            if (entry.value) exprs.push(entry.value);
          }
        }
        break;
      default:
        break;
    }
  }
}

export function isCelBindMacro(expr: Expr) {
  if (!isCallProtoExpr(expr)) {
    return false;
  }
  const macroCall = unwrapCallProtoExpr(expr);
  const target = macroCall?.target;
  return (
    macroCall?.function === 'bind' &&
    !isNil(target) &&
    isIdentProtoExpr(target) &&
    target.exprKind.value.name === 'cel'
  );
}
