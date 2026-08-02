import {
  type AST,
  ast,
  type EntryExpr,
  type Expr,
  type ExprFactory,
  ExprKind,
  exprFactory,
  sourceInfo,
} from "../common/ast/index.js";
import * as operators from "../common/operators.js";
import * as overloads from "../common/overloads.js";
import {
  Bool,
  Bytes,
  String as CelString,
  Double,
  Duration,
  False,
  Int,
  type Iterator,
  isUnknownOrError,
  type Lister,
  type Mapper,
  Null,
  Optional,
  type Sizer,
  StringType,
  Timestamp,
  True,
  Uint,
  type Val,
} from "../common/types/index.js";
import type { Constant } from "../gen/cel/expr/syntax_pb.js";
import type { EvalState } from "./eval-state.js";
import { evalState } from "./eval-state.js";

/**
 * PruneAstOptions configures AST pruning from observed evaluation state.
 */
export interface PruneAstOptions {
  /** expr is the expression tree to prune. */
  expr: Expr;
  /** macroCalls maps expanded expression ids to their original macro calls. */
  macroCalls: Map<number, Expr>;
  /** state contains values observed while evaluating the expression. */
  state: EvalState;
}

/**
 * PruneResult contains a rewritten expression and whether pruning changed it.
 */
interface PruneResult {
  /** expr is the original or rewritten expression. */
  expr: Expr;
  /** pruned reports whether the expression was rewritten. */
  pruned: boolean;
}

/**
 * LiteralResult contains a literal-compatible expression and whether conversion succeeded.
 */
interface LiteralResult {
  /** expr is the constructed expression when conversion succeeded. */
  expr?: Expr;
  /** created reports whether the runtime value could be represented in the AST. */
  created: boolean;
}

/**
 * ValueResult contains an observed runtime value and whether it is usable for pruning.
 */
interface ValueResult {
  /** value is the observed runtime value when one was found. */
  value?: Val;
  /** found reports whether a suitable value was found. */
  found: boolean;
}

/**
 * AstPruner performs copy-on-write AST pruning from a stable snapshot of evaluation state.
 */
class AstPruner {
  /** factory creates rewritten AST nodes. */
  private readonly factory: ExprFactory;

  /** expr is the root expression being pruned. */
  private readonly expr: Expr;

  /** macroCalls stores macro calls that remain valid after pruning. */
  private readonly macroCalls: Map<number, Expr>;

  /** state is the copied evaluation state used during pruning. */
  private readonly state: EvalState;

  /** nextExprId is the next unused id for synthesized literal children. */
  private nextExprId: number;

  /** constructor initializes the pruning state. */
  constructor(options: {
    expr: Expr;
    macroCalls: Map<number, Expr>;
    state: EvalState;
  }) {
    this.factory = exprFactory();
    this.expr = options.expr;
    this.macroCalls = new Map(options.macroCalls);
    this.state = options.state;
    this.nextExprId = getMaxId(options.expr);
  }

  /** root returns the expression supplied to the pruner. */
  public root(): Expr {
    return this.expr;
  }

  /** remainingMacroCalls returns the macro calls retained by pruning. */
  public remainingMacroCalls(): Map<number, Expr> {
    return new Map(this.macroCalls);
  }

  /** maybePrune prunes an expression when observed values make a safe rewrite possible. */
  public maybePrune(node: Expr): PruneResult {
    return this.prune(node);
  }

  /** maybeCreateLiteral converts a supported runtime value into an AST expression. */
  private maybeCreateLiteral(id: number, value: Val): LiteralResult {
    if (value instanceof Optional) {
      this.state.setValue({ exprId: id, value });
      if (!value.hasValue()) {
        return {
          expr: this.factory.call(id, "optional.none"),
          created: true,
        };
      }
      const inner = this.maybeCreateLiteral(this.nextId(), value.getValue());
      if (!inner.created || !inner.expr) {
        return { created: false };
      }
      return {
        expr: this.factory.call(id, "optional.of", inner.expr),
        created: true,
      };
    }
    const primitive = primitiveLiteral(value);
    if (primitive !== undefined) {
      this.state.setValue({ exprId: id, value });
      return {
        expr: this.factory.literal(id, primitive),
        created: true,
      };
    }
    if (value instanceof Duration) {
      this.state.setValue({ exprId: id, value });
      const durationString = value.convertToType(StringType) as CelString;
      return {
        expr: this.factory.call(
          id,
          overloads.TypeConvertDuration,
          this.factory.literal(this.nextId(), durationString.value()),
        ),
        created: true,
      };
    }
    if (value instanceof Timestamp) {
      const timestampString = value.convertToType(StringType) as CelString;
      return {
        expr: this.factory.call(
          id,
          overloads.TypeConvertTimestamp,
          this.factory.literal(this.nextId(), timestampString.value()),
        ),
        created: true,
      };
    }

    // Create a map literal if possible.
    if (isMapper(value)) {
      const entries: EntryExpr[] = [];
      const iterator = value.iterator();
      while (iterator.hasNext() !== False) {
        const key = iterator.next();
        const mapValue = value.get(key);
        if (isUnknownOrError(key) || isUnknownOrError(mapValue)) {
          return { created: false };
        }
        const keyExpr = this.maybeCreateLiteral(this.nextId(), key);
        if (!keyExpr.created || !keyExpr.expr) {
          return { created: false };
        }
        const valueExpr = this.maybeCreateLiteral(this.nextId(), mapValue);
        if (!valueExpr.created || !valueExpr.expr) {
          return { created: false };
        }
        entries.push(this.factory.mapEntry(this.nextId(), keyExpr.expr, valueExpr.expr, false));
      }
      this.state.setValue({ exprId: id, value });
      return {
        expr: this.factory.map(id, entries),
        created: true,
      };
    }

    // Attempt to build a list literal after excluding maps, whose runtime traits overlap in TypeScript.
    if (isLister(value)) {
      const size = Number((value.size() as Int).value());
      const elements: Expr[] = [];
      for (let index = 0; index < size; index += 1) {
        const element = value.get(new Int(BigInt(index)));
        if (isUnknownOrError(element)) {
          return { created: false };
        }
        const elementExpr = this.maybeCreateLiteral(this.nextId(), element);
        if (!elementExpr.created || !elementExpr.expr) {
          return { created: false };
        }
        elements.push(elementExpr.expr);
      }
      this.state.setValue({ exprId: id, value });
      return {
        expr: this.factory.list(id, elements, []),
        created: true,
      };
    }

    return { created: false };
  }

  /** maybePruneOptional removes empty optional elements or unwraps known present values. */
  private maybePruneOptional(element: Expr): PruneResult | undefined {
    const observed = this.value(element.id());
    if (observed.found && observed.value instanceof Optional) {
      if (!observed.value.hasValue()) {
        return {
          expr: element,
          pruned: true,
        };
      }
      const literal = this.maybeCreateLiteral(element.id(), observed.value.getValue());
      if (literal.created && literal.expr) {
        return {
          expr: literal.expr,
          pruned: true,
        };
      }
    }
    return undefined;
  }

  /** maybePruneIn reduces membership in a known empty container to false. */
  private maybePruneIn(node: Expr): PruneResult | undefined {
    const call = node.asCall()!;
    const observed = this.maybeValue(call.args()[1]!.id());
    if (!observed.found || !observed.value || !isSizer(observed.value)) {
      return undefined;
    }
    if ((observed.value.size() as Int).value() === 0n) {
      return this.literalPruneResult(node.id(), False);
    }
    return undefined;
  }

  /** maybePruneLogicalNot negates a known boolean argument. */
  private maybePruneLogicalNot(node: Expr): PruneResult | undefined {
    const argument = node.asCall()!.args()[0]!;
    const observed = this.maybeValue(argument.id());
    if (!observed.found || !(observed.value instanceof Bool)) {
      return undefined;
    }
    return this.literalPruneResult(node.id(), observed.value.value() ? False : True);
  }

  /** maybePruneOr removes a known non-dominating operand or folds a known true operand. */
  private maybePruneOr(node: Expr): PruneResult | undefined {
    const args = node.asCall()!.args();
    // The result is unknown, so at least one argument is unknown. A known side can be discarded.
    const left = this.maybeValue(args[0]!.id());
    if (left.found) {
      if (left.value === True) {
        return this.literalPruneResult(node.id(), True);
      }
      return { expr: args[1]!, pruned: true };
    }
    const right = this.maybeValue(args[1]!.id());
    if (right.found) {
      if (right.value === True) {
        return this.literalPruneResult(node.id(), True);
      }
      return { expr: args[0]!, pruned: true };
    }
    return undefined;
  }

  /** maybePruneAnd removes a known non-dominating operand or folds a known false operand. */
  private maybePruneAnd(node: Expr): PruneResult | undefined {
    const args = node.asCall()!.args();
    // The result is unknown, so at least one argument is unknown. A known side can be discarded.
    const left = this.maybeValue(args[0]!.id());
    if (left.found) {
      if (left.value === False) {
        return this.literalPruneResult(node.id(), False);
      }
      return { expr: args[1]!, pruned: true };
    }
    const right = this.maybeValue(args[1]!.id());
    if (right.found) {
      if (right.value === False) {
        return this.literalPruneResult(node.id(), False);
      }
      return { expr: args[0]!, pruned: true };
    }
    return undefined;
  }

  /** maybePruneConditional selects the known conditional branch. */
  private maybePruneConditional(node: Expr): PruneResult | undefined {
    const args = node.asCall()!.args();
    const condition = this.maybeValue(args[0]!.id());
    if (!condition.found || !(condition.value instanceof Bool)) {
      return undefined;
    }
    return {
      expr: condition.value.value() ? args[1]! : args[2]!,
      pruned: true,
    };
  }

  /** maybePruneFunction applies operator-specific residualization rules to an evaluated call. */
  private maybePruneFunction(node: Expr): PruneResult | undefined {
    if (!this.value(node.id()).found) {
      return undefined;
    }
    switch (node.asCall()!.functionName()) {
      case operators.LogicalOr:
        return this.maybePruneOr(node);
      case operators.LogicalAnd:
        return this.maybePruneAnd(node);
      case operators.Conditional:
        return this.maybePruneConditional(node);
      case operators.In:
        return this.maybePruneIn(node);
      case operators.LogicalNot:
        return this.maybePruneLogicalNot(node);
      default:
        return undefined;
    }
  }

  /** prune recursively rewrites a node using observed values and copy-on-write construction. */
  private prune(node: Expr): PruneResult {
    const observed = this.maybeValue(node.id());
    if (observed.found && observed.value) {
      const literal = this.maybeCreateLiteral(node.id(), observed.value);
      if (literal.created && literal.expr) {
        this.macroCalls.delete(node.id());
        return { expr: literal.expr, pruned: true };
      }
    }

    const macro = this.macroCalls.get(node.id());
    if (macro) {
      // Ensure that intermediate values for the comprehension are cleared during pruning.
      let pruneMacroCall = node.kind() !== ExprKind.Unspecified;
      if (node.kind() === ExprKind.Comprehension) {
        // Only prune cel.bind() calls since comprehension variables are visible to the user, which
        // prevents intermediate computations from being mistaken for stable residual values.
        pruneMacroCall = isCelBindMacro(macro);
      }
      if (pruneMacroCall) {
        // Prune in terms of the macro call rather than its expanded form when tracking macro calls.
        const prunedMacro = this.prune(macro);
        if (prunedMacro.pruned) {
          this.macroCalls.set(node.id(), prunedMacro.expr);
        }
      } else {
        // Otherwise prune only the macro target, matching comprehension pruning later in the walk.
        const macroCall = macro.asCall()!;
        if (macroCall.isMemberFunction()) {
          const target = this.prune(macroCall.target());
          if (target.pruned) {
            this.macroCalls.set(
              node.id(),
              this.factory.memberCall(
                macro.id(),
                macroCall.functionName(),
                target.expr,
                ...macroCall.args(),
              ),
            );
          }
        }
      }
    }

    // The value is unknown, an error, unsupported, or unevaluated. Drill into safe children.
    switch (node.kind()) {
      case ExprKind.Select:
        return this.pruneSelect(node);
      case ExprKind.Call:
        return this.pruneCall(node);
      case ExprKind.List:
        return this.pruneList(node);
      case ExprKind.Map:
        return this.pruneMap(node);
      case ExprKind.Struct:
        return this.pruneStruct(node);
      case ExprKind.Comprehension:
        return this.pruneComprehension(node);
      default:
        return { expr: node, pruned: false };
    }
  }

  /** pruneSelect rewrites a select when its operand changes. */
  private pruneSelect(node: Expr): PruneResult {
    const select = node.asSelect()!;
    const operand = this.maybePrune(select.operand());
    if (!operand.pruned) {
      return { expr: node, pruned: false };
    }
    return {
      expr: select.isTestOnly()
        ? this.factory.presenceTest(node.id(), operand.expr, select.fieldName())
        : this.factory.select(node.id(), operand.expr, select.fieldName()),
      pruned: true,
    };
  }

  /** pruneCall rewrites call arguments, targets, and recognized logical operators. */
  private pruneCall(node: Expr): PruneResult {
    const call = node.asCall()!;
    let argsPruned = false;
    const args = call.args().map((argument) => {
      const result = this.maybePrune(argument);
      argsPruned ||= result.pruned;
      return result.expr;
    });
    if (!call.isMemberFunction()) {
      const rewritten = this.factory.call(node.id(), call.functionName(), ...args);
      return (
        this.maybePruneFunction(rewritten) ?? {
          expr: rewritten,
          pruned: argsPruned,
        }
      );
    }
    const target = this.maybePrune(call.target());
    const rewritten = this.factory.memberCall(node.id(), call.functionName(), target.expr, ...args);
    return (
      this.maybePruneFunction(rewritten) ?? {
        expr: rewritten,
        pruned: target.pruned || argsPruned,
      }
    );
  }

  /** pruneList rewrites elements and updates optional indices after empty values are removed. */
  private pruneList(node: Expr): PruneResult {
    const list = node.asList()!;
    const optionalIndices = new Set(list.optionalIndices());
    const rewrittenOptionalIndices: number[] = [];
    const elements: Expr[] = [];
    let listPruned = false;
    for (const [index, element] of list.elements().entries()) {
      if (optionalIndices.has(index)) {
        const optional = this.maybePruneOptional(element);
        if (optional?.pruned) {
          listPruned = true;
          if (optional.expr !== element) {
            elements.push(optional.expr);
          }
          continue;
        }
        rewrittenOptionalIndices.push(elements.length);
      }
      const rewritten = this.maybePrune(element);
      elements.push(rewritten.expr);
      listPruned ||= rewritten.pruned;
    }
    return listPruned
      ? {
          expr: this.factory.list(node.id(), elements, rewrittenOptionalIndices),
          pruned: true,
        }
      : { expr: node, pruned: false };
  }

  /** pruneMap rewrites map keys and values while preserving entry optionality. */
  private pruneMap(node: Expr): PruneResult {
    let mapPruned = false;
    const entries = node
      .asMap()!
      .entries()
      .map((entry) => {
        const mapEntry = entry.asMapEntry()!;
        const key = this.maybePrune(mapEntry.key());
        const value = this.maybePrune(mapEntry.value());
        if (!key.pruned && !value.pruned) {
          return entry;
        }
        mapPruned = true;
        return this.factory.mapEntry(entry.id(), key.expr, value.expr, mapEntry.isOptional());
      });
    return mapPruned
      ? { expr: this.factory.map(node.id(), entries), pruned: true }
      : { expr: node, pruned: false };
  }

  /** pruneStruct rewrites struct field values while preserving entry optionality. */
  private pruneStruct(node: Expr): PruneResult {
    const struct = node.asStruct()!;
    let structPruned = false;
    const fields = struct.fields().map((entry) => {
      const field = entry.asStructField()!;
      const value = this.maybePrune(field.value());
      if (!value.pruned) {
        return entry;
      }
      structPruned = true;
      return this.factory.structField(entry.id(), field.name(), value.expr, field.isOptional());
    });
    return structPruned
      ? {
          expr: this.factory.struct(node.id(), struct.typeName(), fields),
          pruned: true,
        }
      : { expr: node, pruned: false };
  }

  /** pruneComprehension rewrites only the iteration range because state tracks only the last loop step. */
  private pruneComprehension(node: Expr): PruneResult {
    const comprehension = node.asComprehension()!;
    // Only the range is safe: values observed for other children represent the final iteration.
    const iterRange = this.maybePrune(comprehension.iterRange());
    if (!iterRange.pruned) {
      return { expr: node, pruned: false };
    }
    const expr =
      comprehension.iterVar2() !== ""
        ? this.factory.comprehensionTwoVar(
            node.id(),
            iterRange.expr,
            comprehension.iterVar(),
            comprehension.iterVar2(),
            comprehension.accuVar(),
            comprehension.accuInit(),
            comprehension.loopCondition(),
            comprehension.loopStep(),
            comprehension.result(),
          )
        : this.factory.comprehension(
            node.id(),
            iterRange.expr,
            comprehension.iterVar(),
            comprehension.accuVar(),
            comprehension.accuInit(),
            comprehension.loopCondition(),
            comprehension.loopStep(),
            comprehension.result(),
          );
    return { expr, pruned: true };
  }

  /** value returns any non-undefined value recorded for an expression id. */
  private value(id: number): ValueResult {
    const value = this.state.value(id);
    return {
      value,
      found: value !== undefined,
    };
  }

  /** maybeValue returns an observed value unless it is unknown or an error. */
  private maybeValue(id: number): ValueResult {
    const result = this.value(id);
    if (!result.found || !result.value || isUnknownOrError(result.value)) {
      return { found: false };
    }
    return result;
  }

  /** literalPruneResult creates a successful prune result for a runtime literal. */
  private literalPruneResult(id: number, value: Val): PruneResult | undefined {
    const literal = this.maybeCreateLiteral(id, value);
    return literal.created && literal.expr ? { expr: literal.expr, pruned: true } : undefined;
  }

  /** nextId returns an unused expression id and advances the sequence. */
  private nextId(): number {
    const next = this.nextExprId;
    this.nextExprId += 1;
    return next;
  }
}

/**
 * pruneAst prunes the given AST based on EvalState and returns a copy-on-write residual AST.
 *
 * Typical uses include repeatedly evaluating an expression with unknowns while caching known
 * function results, or constant-folding a compiled expression before storing it in a cache.
 */
export function pruneAst(options: PruneAstOptions): AST {
  const pruneState = evalState();
  for (const id of options.state.ids()) {
    const value = options.state.value(id);
    pruneState.setValue({ exprId: id, value });
  }
  const pruner = new AstPruner({
    expr: options.expr,
    macroCalls: options.macroCalls,
    state: pruneState,
  });
  const result = pruner.maybePrune(pruner.root());
  const info = sourceInfo();
  for (const [id, call] of pruner.remainingMacroCalls()) {
    info.setMacroCall(id, call);
  }
  return ast(result.expr, info);
}

/**
 * primitiveLiteral converts CEL scalar values into this AST implementation's constant representation.
 */
function primitiveLiteral(
  value: Val,
): null | boolean | bigint | number | string | Uint8Array | Constant | undefined {
  if (value instanceof Bool) {
    return value.value();
  }
  if (value instanceof Bytes) {
    return value.value();
  }
  if (value instanceof Double) {
    return value.value();
  }
  if (value instanceof Int) {
    return value.value();
  }
  if (value instanceof Null) {
    return null;
  }
  if (value instanceof CelString) {
    return value.value();
  }
  if (value instanceof Uint) {
    return {
      $typeName: "cel.expr.Constant",
      constantKind: { case: "uint64Value", value: value.value() },
    };
  }
  return undefined;
}

/**
 * getMaxId returns one greater than the maximum expression or entry id in an expression tree.
 */
function getMaxId(expr: Expr): number {
  let maximum = 1;
  const expressions = [expr];
  while (expressions.length > 0) {
    const current = expressions.shift()!;
    maximum = Math.max(maximum, current.id() + 1);
    switch (current.kind()) {
      case ExprKind.Select:
        expressions.push(current.asSelect()!.operand());
        break;
      case ExprKind.Call: {
        const call = current.asCall()!;
        if (call.isMemberFunction()) {
          expressions.push(call.target());
        }
        expressions.push(...call.args());
        break;
      }
      case ExprKind.Comprehension: {
        const comprehension = current.asComprehension()!;
        expressions.push(
          comprehension.iterRange(),
          comprehension.accuInit(),
          comprehension.loopCondition(),
          comprehension.loopStep(),
          comprehension.result(),
        );
        break;
      }
      case ExprKind.List:
        expressions.push(...current.asList()!.elements());
        break;
      case ExprKind.Map:
        for (const entry of current.asMap()!.entries()) {
          maximum = Math.max(maximum, entry.id() + 1);
          expressions.push(entry.asMapEntry()!.key(), entry.asMapEntry()!.value());
        }
        break;
      case ExprKind.Struct:
        for (const entry of current.asStruct()!.fields()) {
          maximum = Math.max(maximum, entry.id() + 1);
          expressions.push(entry.asStructField()!.value());
        }
        break;
    }
  }
  return maximum;
}

/**
 * isCelBindMacro reports whether an expression is a cel.bind() macro call.
 */
function isCelBindMacro(macro: Expr): boolean {
  if (macro.kind() !== ExprKind.Call) {
    return false;
  }
  const call = macro.asCall()!;
  return (
    call.functionName() === "bind" &&
    call.isMemberFunction() &&
    call.target().kind() === ExprKind.Ident &&
    call.target().asIdent() === "cel"
  );
}

/**
 * isLister reports whether a runtime value provides CEL list operations.
 */
function isLister(value: Val): value is Lister {
  return hasMethods(value, ["get", "size", "iterator"]);
}

/**
 * isMapper reports whether a runtime value provides CEL map operations.
 */
function isMapper(value: Val): value is Mapper {
  return hasMethods(value, ["get", "find", "size", "iterator"]);
}

/**
 * isSizer reports whether a runtime value provides CEL size operations.
 */
function isSizer(value: Val): value is Val & Sizer {
  return hasMethods(value, ["size"]);
}

/**
 * hasMethods reports whether an object provides all requested callable properties.
 */
function hasMethods(
  value: object,
  methods: Array<keyof Lister | keyof Mapper | keyof Sizer | keyof Iterator>,
): boolean {
  return methods.every(
    (method) =>
      method in value &&
      typeof (value as unknown as Record<PropertyKey, unknown>)[method] === "function",
  );
}
