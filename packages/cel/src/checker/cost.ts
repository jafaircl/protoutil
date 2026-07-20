import { type AST, type Expr, ExprKind } from "../common/ast/index.js";
import {
  ConstCost,
  ListCreateBaseCost,
  MapCreateBaseCost,
  RegexStringLengthCostFactor,
  SelectAndIdentCost,
  StringTraversalCostFactor,
  StructCreateBaseCost,
} from "../common/cost.js";
import * as overloads from "../common/overloads.js";
import { exprTypeToType, Kind, type Type } from "../common/types/index.js";
import { AccumulatorName, HiddenAccumulatorName } from "../parser/macro.js";

const UINT64_MAX = (1n << 64n) - 1n;
const DOUBLE_TWO_TO_64 = 2 ** 64;

/**
 * AstNode represents an AST node for the purpose of cost estimation.
 */
export interface AstNode {
  /**
   * path returns a field path through the provided type declarations to the type of the node.
   */
  path(): string[] | undefined;

  /**
   * type returns the deduced CEL type of the node.
   */
  type(): Type;

  /**
   * expr returns the underlying expression when one exists.
   */
  expr(): Expr | undefined;

  /**
   * computedSize returns the size known from the expression itself, if one exists.
   */
  computedSize(): SizeEstimate | undefined;
}

/**
 * CostEstimator estimates variable sizes and custom call costs.
 */
export interface CostEstimator {
  /**
   * estimateSize returns a size hint for a variable-width value when one is available.
   */
  estimateSize(element: AstNode): SizeEstimate | undefined;

  /**
   * estimateCallCost returns a custom cost estimate for a function call when one is available.
   */
  estimateCallCost(
    functionName: string,
    overloadId: string,
    target: AstNode | undefined,
    args: AstNode[],
  ): CallEstimate | undefined;
}

/**
 * FunctionEstimator provides a call estimate for a specific overload.
 */
export type FunctionEstimator = (
  estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
) => CallEstimate | undefined;

/**
 * CostOptions configures checker cost computation.
 */
export interface CostOptions {
  /**
   * presenceTestHasCost determines whether `has()` contributes one unit of cost.
   *
   * Defaults to `true`.
   */
  presenceTestHasCost?: boolean;

  /**
   * overloadCostEstimates overrides the estimate for specific overload ids.
   */
  overloadCostEstimates?: Record<string, FunctionEstimator>;
}

/**
 * SizeEstimate represents the estimated size range of a string, bytes, list, or map.
 */
export class SizeEstimate {
  constructor(
    public readonly Min: bigint,
    public readonly Max: bigint,
  ) {}

  /**
   * add returns the sum of two size estimates with uint64 overflow protection.
   */
  public add(other: SizeEstimate): SizeEstimate {
    return new SizeEstimate(
      addUint64NoOverflow(this.Min, other.Min),
      addUint64NoOverflow(this.Max, other.Max),
    );
  }

  /**
   * multiply returns the product of two size estimates with uint64 overflow protection.
   */
  public multiply(other: SizeEstimate): SizeEstimate {
    return new SizeEstimate(
      multiplyUint64NoOverflow(this.Min, other.Min),
      multiplyUint64NoOverflow(this.Max, other.Max),
    );
  }

  /**
   * multiplyByCostFactor converts the size range into a cost range using the provided factor.
   */
  public multiplyByCostFactor(costPerUnit: number): CostEstimate {
    return new CostEstimate(
      multiplyByCostFactor(this.Min, costPerUnit),
      multiplyByCostFactor(this.Max, costPerUnit),
    );
  }

  /**
   * multiplyByCost returns the product of a size range and a cost range.
   */
  public multiplyByCost(cost: CostEstimate): CostEstimate {
    return new CostEstimate(
      multiplyUint64NoOverflow(this.Min, cost.Min),
      multiplyUint64NoOverflow(this.Max, cost.Max),
    );
  }

  /**
   * union returns the smallest estimate that covers both ranges.
   */
  public union(other: SizeEstimate): SizeEstimate {
    return new SizeEstimate(
      other.Min < this.Min ? other.Min : this.Min,
      other.Max > this.Max ? other.Max : this.Max,
    );
  }

  /**
   * asCost converts a size range into an equivalent cost range.
   */
  public asCost(): CostEstimate {
    return this.multiplyByCostFactor(1);
  }
}

/**
 * CostEstimate represents a cost range with overflow-safe arithmetic helpers.
 */
export class CostEstimate {
  constructor(
    public readonly Min: bigint,
    public readonly Max: bigint,
  ) {}

  /**
   * add returns the sum of two cost ranges with uint64 overflow protection.
   */
  public add(other: CostEstimate): CostEstimate {
    return new CostEstimate(
      addUint64NoOverflow(this.Min, other.Min),
      addUint64NoOverflow(this.Max, other.Max),
    );
  }

  /**
   * multiply returns the product of two cost ranges with uint64 overflow protection.
   */
  public multiply(other: CostEstimate): CostEstimate {
    return new CostEstimate(
      multiplyUint64NoOverflow(this.Min, other.Min),
      multiplyUint64NoOverflow(this.Max, other.Max),
    );
  }

  /**
   * multiplyByCostFactor scales a cost range and rounds each bound up.
   */
  public multiplyByCostFactor(costPerUnit: number): CostEstimate {
    return new CostEstimate(
      multiplyByCostFactor(this.Min, costPerUnit),
      multiplyByCostFactor(this.Max, costPerUnit),
    );
  }

  /**
   * union returns the smallest estimate that covers both ranges.
   */
  public union(other: CostEstimate): CostEstimate {
    return new CostEstimate(
      other.Min < this.Min ? other.Min : this.Min,
      other.Max > this.Max ? other.Max : this.Max,
    );
  }
}

/**
 * CallEstimate includes both the call cost and the optional size of the call result.
 */
export class CallEstimate extends CostEstimate {
  constructor(
    min: bigint,
    max: bigint,
    public readonly ResultSize?: SizeEstimate,
  ) {
    super(min, max);
  }
}

/**
 * fixedSizeEstimate returns a size estimate with identical min/max bounds.
 */
export function fixedSizeEstimate(size: bigint | number): SizeEstimate {
  return new SizeEstimate(toUint64(size), toUint64(size));
}

/**
 * unknownSizeEstimate returns the broadest possible size estimate.
 */
export function unknownSizeEstimate(): SizeEstimate {
  return new SizeEstimate(0n, UINT64_MAX);
}

/**
 * fixedCostEstimate returns a cost estimate with identical min/max bounds.
 */
export function fixedCostEstimate(cost: bigint | number): CostEstimate {
  return new CostEstimate(toUint64(cost), toUint64(cost));
}

/**
 * unknownCostEstimate returns the broadest possible cost estimate.
 */
export function unknownCostEstimate(): CostEstimate {
  return unknownSizeEstimate().multiplyByCostFactor(1);
}

const noopEstimator: CostEstimator = {
  estimateSize: () => undefined,
  estimateCallCost: () => undefined,
};

/**
 * cost estimates the cost of a checked CEL expression.
 */
export function cost(
  checked: AST,
  estimator: CostEstimator = noopEstimator,
  options: CostOptions = {},
): CostEstimate {
  const c = new coster(checked, estimator, options);
  return c.cost(checked.expr());
}

type localVar = {
  exprId: number;
  path?: string[];
  size?: SizeEstimate;
  entrySize?: entrySizeEstimate;
};

/**
 * astNode adapts the local AST and type metadata to the estimator interface.
 */
class astNode implements AstNode {
  constructor(
    private readonly pathValue: string[] | undefined,
    private readonly typeValue: Type,
    private readonly exprValue?: Expr,
    private readonly derivedSize?: SizeEstimate,
  ) {}

  public path(): string[] | undefined {
    return this.pathValue ? [...this.pathValue] : undefined;
  }

  public type(): Type {
    return this.typeValue;
  }

  public expr(): Expr | undefined {
    return this.exprValue;
  }

  public computedSize(): SizeEstimate | undefined {
    return this.derivedSize;
  }
}

/**
 * entrySizeEstimate captures the key/index and value sizes for container elements.
 */
class entrySizeEstimate {
  constructor(
    private readonly containerKindValue: Kind,
    private readonly key: SizeEstimate,
    private readonly value: SizeEstimate,
  ) {}

  public container(): Kind {
    return this.containerKindValue;
  }

  public keySize(): SizeEstimate {
    return this.key;
  }

  public valSize(): SizeEstimate {
    return this.value;
  }

  public union(other: entrySizeEstimate | undefined): entrySizeEstimate | undefined {
    if (!other) {
      return undefined;
    }
    return new entrySizeEstimate(
      this.containerKindValue,
      this.key.union(other.key),
      this.value.union(other.value),
    );
  }
}

/**
 * coster carries the mutable state for a single cost pass.
 */
class coster {
  private readonly exprPaths = new Map<number, string[]>();
  private readonly localVars = new Map<string, localVar[]>();
  private readonly computedSizes = new Map<number, SizeEstimate>();
  private readonly computedEntrySizes = new Map<number, entrySizeEstimate>();
  private readonly overloadEstimators: Record<string, FunctionEstimator>;
  private readonly presenceTestCost: CostEstimate;

  constructor(
    private readonly checkedAst: AST,
    private readonly estimator: CostEstimator,
    options: CostOptions,
  ) {
    this.overloadEstimators = { ...(options.overloadCostEstimates ?? {}) };
    this.presenceTestCost =
      options.presenceTestHasCost === false
        ? fixedCostEstimate(0)
        : fixedCostEstimate(SelectAndIdentCost);
  }

  /**
   * cost computes the cost of the given expression subtree.
   */
  public cost(expr: Expr | undefined): CostEstimate {
    if (!expr) {
      return fixedCostEstimate(0);
    }
    switch (expr.kind()) {
      case ExprKind.Literal:
        return constCost;
      case ExprKind.Ident:
        return this.costIdent(expr);
      case ExprKind.Select:
        return this.costSelect(expr);
      case ExprKind.Call:
        return this.costCall(expr);
      case ExprKind.List:
        return this.costCreateList(expr);
      case ExprKind.Map:
        return this.costCreateMap(expr);
      case ExprKind.Struct:
        return this.costCreateStruct(expr);
      case ExprKind.Comprehension:
        return this.isBind(expr) ? this.costBind(expr) : this.costComprehension(expr);
      default:
        return fixedCostEstimate(0);
    }
  }

  /**
   * costIdent assigns path metadata for identifiers and charges the select/ident base cost.
   */
  private costIdent(expr: Expr): CostEstimate {
    const identName = expr.asIdent();
    if (!identName) {
      return fixedCostEstimate(0);
    }
    const local = this.peekLocalVar(identName);
    this.addPath(expr, local?.path ?? [identName]);
    return selectAndIdentCost;
  }

  /**
   * costSelect charges the operand plus field-selection cost where appropriate.
   */
  private costSelect(expr: Expr): CostEstimate {
    const select = expr.asSelect();
    if (!select) {
      return fixedCostEstimate(0);
    }
    let sum = fixedCostEstimate(0);
    if (select.isTestOnly()) {
      sum = sum.add(this.presenceTestCost);
      return sum.add(this.cost(select.operand()));
    }
    sum = sum.add(this.cost(select.operand()));
    const targetType = this.getType(select.operand());
    switch (targetType.kind()) {
      case Kind.Map:
      case Kind.Struct:
      case Kind.TypeParam:
        sum = sum.add(selectAndIdentCost);
        break;
    }
    this.addPath(expr, [...(this.getPath(select.operand()) ?? []), select.fieldName()]);
    return sum;
  }

  /**
   * costCall charges the target, arguments, and resolved overload behavior.
   */
  private costCall(expr: Expr): CostEstimate {
    const dynEstimate = this.maybeUnwrapDynCall(expr);
    if (dynEstimate) {
      return dynEstimate;
    }

    const call = expr.asCall();
    if (!call) {
      return fixedCostEstimate(0);
    }
    const args = call.args();
    let sum = fixedCostEstimate(0);

    const argCosts = args.map((arg) => this.cost(arg));
    const argNodes = args.map((arg) => this.createAstNode(arg));

    const overloadIds = this.checkedAst.getOverloadIds(expr.id());
    if (overloadIds.length === 0) {
      return fixedCostEstimate(0);
    }

    let targetNode: AstNode | undefined;
    if (call.isMemberFunction()) {
      sum = sum.add(this.cost(call.target()));
      targetNode = this.createAstNode(call.target());
    }

    let functionCost = new CostEstimate(UINT64_MAX, 0n);
    let resultSize: SizeEstimate | undefined;
    for (const overloadId of overloadIds) {
      const overloadCost = this.functionCost(
        expr,
        call.functionName(),
        overloadId,
        targetNode,
        argNodes,
        argCosts,
      );
      functionCost = functionCost.union(overloadCost);
      if (overloadCost.ResultSize) {
        resultSize = resultSize
          ? resultSize.union(overloadCost.ResultSize)
          : overloadCost.ResultSize;
      }
      switch (overloadId) {
        case overloads.IndexList:
          if (args.length > 0) {
            resultSize = this.computeEntrySize(args[0])?.valSize();
            this.addPath(expr, [...(this.getPath(args[0]) ?? []), "@items"]);
          }
          break;
        case overloads.IndexMap:
          if (args.length > 0) {
            resultSize = this.computeEntrySize(args[0])?.valSize();
            this.addPath(expr, [...(this.getPath(args[0]) ?? []), "@values"]);
          }
          break;
      }
    }
    this.setSize(expr, resultSize ?? this.computeSize(expr));
    return sum.add(functionCost);
  }

  /**
   * maybeUnwrapDynCall preserves cel-go's special-case handling for `dyn(x)`.
   */
  private maybeUnwrapDynCall(expr: Expr): CostEstimate | undefined {
    const call = expr.asCall();
    if (!call || call.functionName() !== "dyn" || call.args().length === 0) {
      return undefined;
    }
    const arg = call.args()[0]!;
    const argCost = this.cost(arg);
    this.copySizeEstimates(expr, arg);
    return fixedCostEstimate(1).add(argCost);
  }

  /**
   * costCreateList charges element costs and tracks element-size metadata.
   */
  private costCreateList(expr: Expr): CostEstimate {
    const list = expr.asList();
    if (!list) {
      return fixedCostEstimate(0);
    }
    let sum = fixedCostEstimate(0);
    let itemSize = new SizeEstimate(UINT64_MAX, 0n);
    if (list.size() === 0) {
      itemSize = new SizeEstimate(0n, 0n);
    }
    for (const element of list.elements()) {
      sum = sum.add(this.cost(element));
      itemSize = itemSize.union(this.sizeOrUnknown(element));
    }
    this.setEntrySize(expr, new entrySizeEstimate(Kind.List, fixedSizeEstimate(1), itemSize));
    return sum.add(createListBaseCost);
  }

  /**
   * costCreateMap charges entry costs and tracks key/value size metadata.
   */
  private costCreateMap(expr: Expr): CostEstimate {
    const mapExpr = expr.asMap();
    if (!mapExpr) {
      return fixedCostEstimate(0);
    }
    let sum = fixedCostEstimate(0);
    let keySize = new SizeEstimate(UINT64_MAX, 0n);
    let valSize = new SizeEstimate(UINT64_MAX, 0n);
    if (mapExpr.size() === 0) {
      keySize = new SizeEstimate(0n, 0n);
      valSize = new SizeEstimate(0n, 0n);
    }
    for (const entryExpr of mapExpr.entries()) {
      const entry = entryExpr.asMapEntry();
      if (!entry) {
        continue;
      }
      sum = sum.add(this.cost(entry.key()));
      sum = sum.add(this.cost(entry.value()));
      keySize = keySize.union(this.sizeOrUnknown(entry.key()));
      valSize = valSize.union(this.sizeOrUnknown(entry.value()));
    }
    this.setEntrySize(expr, new entrySizeEstimate(Kind.Map, keySize, valSize));
    return sum.add(createMapBaseCost);
  }

  /**
   * costCreateStruct charges struct field value costs plus the fixed struct construction cost.
   */
  private costCreateStruct(expr: Expr): CostEstimate {
    const structExpr = expr.asStruct();
    if (!structExpr) {
      return fixedCostEstimate(0);
    }
    let sum = fixedCostEstimate(0);
    for (const fieldExpr of structExpr.fields()) {
      const field = fieldExpr.asStructField();
      if (field) {
        sum = sum.add(this.cost(field.value()));
      }
    }
    return sum.add(createMessageBaseCost);
  }

  /**
   * costComprehension propagates local-variable size metadata and estimates loop cost.
   */
  private costComprehension(expr: Expr): CostEstimate {
    const comp = expr.asComprehension();
    if (!comp) {
      return fixedCostEstimate(0);
    }
    let sum = fixedCostEstimate(0);
    sum = sum.add(this.cost(comp.iterRange()));
    sum = sum.add(this.cost(comp.accuInit()));
    this.pushLocalVar(comp.accuVar(), comp.accuInit());

    if (comp.iterVar2() !== "") {
      this.pushIterKey(comp.iterVar(), comp.iterRange());
      this.pushIterValue(comp.iterVar2(), comp.iterRange());
    } else {
      this.pushIterSingle(comp.iterVar(), comp.iterRange());
    }

    const loopCost = this.cost(comp.loopCondition());
    const stepCost = this.cost(comp.loopStep());

    this.popLocalVar(comp.iterVar());
    if (comp.iterVar2() !== "") {
      this.popLocalVar(comp.iterVar2());
    }

    sum = sum.add(this.cost(comp.result()));
    this.popLocalVar(comp.accuVar());

    const rangeCount = this.sizeOrUnknown(comp.iterRange());
    sum = sum.add(rangeCount.multiplyByCost(stepCost.add(loopCost)));

    switch (comp.accuInit().kind()) {
      case ExprKind.Literal:
        this.setSize(expr, this.computeSize(comp.accuInit()));
        break;
      case ExprKind.List:
      case ExprKind.Map:
        this.setSize(expr, rangeCount);
        this.setEntrySize(expr, this.computeEntrySize(comp.loopStep()));
        break;
    }
    return sum;
  }

  /**
   * isBind detects the special empty-range comprehension form used for `cel.bind`.
   */
  private isBind(expr: Expr): boolean {
    const comp = expr.asComprehension();
    const iterRange = comp?.iterRange();
    const loopCondition = comp?.loopCondition();
    return Boolean(
      comp &&
        iterRange?.kind() === ExprKind.List &&
        iterRange.asList()?.size() === 0 &&
        loopCondition?.kind() === ExprKind.Literal &&
        loopCondition.asLiteral() === false &&
        comp.accuVar() !== AccumulatorName,
    );
  }

  /**
   * costBind preserves the lazy semantics of the bind macro expansion.
   */
  private costBind(expr: Expr): CostEstimate {
    const comp = expr.asComprehension();
    if (!comp) {
      return fixedCostEstimate(0);
    }
    let sum = fixedCostEstimate(0);
    sum = sum.add(this.cost(comp.iterRange()));
    sum = sum.add(this.cost(comp.accuInit()));
    this.pushLocalVar(comp.accuVar(), comp.accuInit());
    sum = sum.add(this.cost(comp.result()));
    this.popLocalVar(comp.accuVar());
    this.copySizeEstimates(expr, comp.result());
    return sum;
  }

  /**
   * functionCost mirrors cel-go's overload-specific cost table and result-size propagation.
   */
  private functionCost(
    expr: Expr,
    functionName: string,
    overloadId: string,
    target: AstNode | undefined,
    args: AstNode[],
    argCosts: CostEstimate[],
  ): CallEstimate {
    const argCostSum = (): CostEstimate =>
      argCosts.reduce((sum, cost) => sum.add(cost), fixedCostEstimate(0));

    const override = this.overloadEstimators[overloadId];
    if (override) {
      const estimate = override(this.estimator, target, args);
      if (estimate) {
        return new CallEstimate(
          estimate.add(argCostSum()).Min,
          estimate.add(argCostSum()).Max,
          estimate.ResultSize,
        );
      }
    }

    const estimated = this.estimator.estimateCallCost(functionName, overloadId, target, args);
    if (estimated) {
      return new CallEstimate(
        estimated.add(argCostSum()).Min,
        estimated.add(argCostSum()).Max,
        estimated.ResultSize,
      );
    }

    switch (overloadId) {
      case overloads.ExtFormatString:
        if (target) {
          return new CallEstimate(
            this.sizeOrUnknown(target)
              .multiplyByCostFactor(StringTraversalCostFactor)
              .add(argCostSum()).Min,
            this.sizeOrUnknown(target)
              .multiplyByCostFactor(StringTraversalCostFactor)
              .add(argCostSum()).Max,
          );
        }
        break;
      case overloads.StringToBytes:
        if (args.length === 1) {
          const size = this.sizeOrUnknown(args[0]!);
          const cost = size.multiplyByCostFactor(StringTraversalCostFactor).add(argCostSum());
          return new CallEstimate(cost.Min, cost.Max, new SizeEstimate(size.Min, size.Max * 4n));
        }
        break;
      case overloads.BytesToString:
        if (args.length === 1) {
          const size = this.sizeOrUnknown(args[0]!);
          const cost = size.multiplyByCostFactor(StringTraversalCostFactor).add(argCostSum());
          return new CallEstimate(cost.Min, cost.Max, new SizeEstimate(size.Min / 4n, size.Max));
        }
        break;
      case overloads.ExtQuoteString:
        if (args.length === 1) {
          const size = this.sizeOrUnknown(args[0]!);
          const cost = size.multiplyByCostFactor(StringTraversalCostFactor).add(argCostSum());
          return new CallEstimate(
            cost.Min,
            cost.Max,
            new SizeEstimate(size.Min + 2n, size.Max * 2n + 2n),
          );
        }
        break;
      case overloads.StartsWithString:
      case overloads.EndsWithString:
        if (args.length === 1) {
          const cost = this.sizeOrUnknown(args[0]!)
            .multiplyByCostFactor(StringTraversalCostFactor)
            .add(argCostSum());
          return new CallEstimate(cost.Min, cost.Max);
        }
        break;
      case overloads.InList:
        if (args.length === 2) {
          const cost = this.sizeOrUnknown(args[1]!).multiplyByCostFactor(1).add(argCostSum());
          return new CallEstimate(cost.Min, cost.Max);
        }
        break;
      case overloads.Matches:
      case overloads.MatchesString: {
        let stringNode: AstNode | undefined;
        let regexNode: AstNode | undefined;
        if (overloadId === overloads.MatchesString && target && args.length === 1) {
          stringNode = target;
          regexNode = args[0];
        } else if (overloadId === overloads.Matches && !target && args.length === 2) {
          stringNode = args[0];
          regexNode = args[1];
        }
        if (stringNode && regexNode) {
          const stringCost = this.sizeOrUnknown(stringNode)
            .add(fixedSizeEstimate(1))
            .multiplyByCostFactor(StringTraversalCostFactor);
          const regexCost = this.sizeOrUnknown(regexNode).multiplyByCostFactor(
            RegexStringLengthCostFactor,
          );
          const cost = stringCost.multiply(regexCost).add(argCostSum());
          return new CallEstimate(cost.Min, cost.Max);
        }
        break;
      }
      case overloads.ContainsString:
        if (target && args.length === 1) {
          const stringCost =
            this.sizeOrUnknown(target).multiplyByCostFactor(StringTraversalCostFactor);
          const substringCost = this.sizeOrUnknown(args[0]!).multiplyByCostFactor(
            StringTraversalCostFactor,
          );
          const cost = stringCost.multiply(substringCost).add(argCostSum());
          return new CallEstimate(cost.Min, cost.Max);
        }
        break;
      case overloads.LogicalOr:
      case overloads.LogicalAnd: {
        const lhs = argCosts[0]!;
        const rhs = argCosts[1]!;
        return new CallEstimate(lhs.Min, lhs.add(rhs).Max);
      }
      case overloads.Conditional: {
        const size = this.sizeOrUnknown(args[1]!).union(this.sizeOrUnknown(args[2]!));
        const resultEntrySize = this.computeEntrySize(args[1]!.expr()!)?.union(
          this.computeEntrySize(args[2]!.expr()!),
        );
        this.setEntrySize(expr, resultEntrySize);
        const cost = argCosts[0]!.add(argCosts[1]!.union(argCosts[2]!));
        return new CallEstimate(cost.Min, cost.Max, size);
      }
      case overloads.AddString:
      case overloads.AddBytes:
      case overloads.AddList:
        if (args.length === 2) {
          const lhsSize = this.sizeOrUnknown(args[0]!);
          const rhsSize = this.sizeOrUnknown(args[1]!);
          const resultSize = lhsSize.add(rhsSize);
          const rhsEntrySize = this.computeEntrySize(args[0]!.expr()!);
          const lhsEntrySize = this.computeEntrySize(args[1]!.expr()!);
          const resultEntrySize = rhsEntrySize?.union(lhsEntrySize);
          this.setEntrySize(expr, resultEntrySize);
          if (overloadId === overloads.AddList) {
            const cost = fixedCostEstimate(1).add(argCostSum());
            return new CallEstimate(cost.Min, cost.Max, resultSize);
          }
          const cost = resultSize.multiplyByCostFactor(StringTraversalCostFactor).add(argCostSum());
          return new CallEstimate(cost.Min, cost.Max, resultSize);
        }
        break;
      case overloads.LessString:
      case overloads.GreaterString:
      case overloads.LessEqualsString:
      case overloads.GreaterEqualsString:
      case overloads.LessBytes:
      case overloads.GreaterBytes:
      case overloads.LessEqualsBytes:
      case overloads.GreaterEqualsBytes:
      case overloads.Equals:
      case overloads.NotEquals: {
        const lhsCost = this.sizeOrUnknown(args[0]!);
        const rhsCost = this.sizeOrUnknown(args[1]!);
        let min = 0n;
        const smallestMax = rhsCost.Max < lhsCost.Max ? rhsCost.Max : lhsCost.Max;
        if (smallestMax > 0n) {
          min = 1n;
        }
        const cost = new CostEstimate(min, smallestMax)
          .multiplyByCostFactor(StringTraversalCostFactor)
          .add(argCostSum());
        return new CallEstimate(cost.Min, cost.Max);
      }
    }

    const cost = fixedCostEstimate(1).add(argCostSum());
    return new CallEstimate(cost.Min, cost.Max);
  }

  /**
   * getType returns the runtime CEL type associated with an expression.
   */
  private getType(expr: Expr): Type {
    return exprTypeToType(this.checkedAst.getType(expr.id())!);
  }

  /**
   * getPath returns the currently known field path for an expression.
   */
  private getPath(expr: Expr): string[] | undefined {
    if (expr.kind() === ExprKind.Ident) {
      const local = this.peekLocalVar(expr.asIdent()!);
      if (local?.path) {
        return [...local.path];
      }
    }
    const path = this.exprPaths.get(expr.id());
    return path ? [...path] : undefined;
  }

  /**
   * addPath stores the known field path for an expression id.
   */
  private addPath(expr: Expr, path: string[]): void {
    this.exprPaths.set(expr.id(), [...path]);
  }

  /**
   * createAstNode adapts an expression id, type, path, and computed size to the public estimator interface.
   */
  private createAstNode(expr: Expr): astNode {
    let path = this.getPath(expr);
    if (path && path.length > 0 && isAccumulatorVar(path[0]!)) {
      path = undefined;
    }
    return new astNode(path, this.getType(expr), expr, this.computeSize(expr));
  }

  /**
   * setSize stores a computed size for later reuse.
   */
  private setSize(expr: Expr, size: SizeEstimate | undefined): void {
    if (size) {
      this.computedSizes.set(expr.id(), size);
    }
  }

  /**
   * sizeOrUnknown returns either the computed size for an expression/node or an unknown size range.
   */
  private sizeOrUnknown(value: Expr | AstNode): SizeEstimate {
    if (isEstimatorNode(value)) {
      return value.computedSize() ?? unknownSizeEstimate();
    }
    return this.computeSize(value) ?? unknownSizeEstimate();
  }

  /**
   * copySizeEstimates copies both value-size and entry-size metadata across rewrites.
   */
  private copySizeEstimates(dst: Expr, src: Expr): void {
    this.setSize(dst, this.computeSize(src));
    this.setEntrySize(dst, this.computeEntrySize(src));
  }

  /**
   * computeSize resolves the size of an expression from computed values, literals, user hints, or scalar types.
   */
  private computeSize(expr: Expr): SizeEstimate | undefined {
    const computed = this.computedSizes.get(expr.id());
    if (computed) {
      return computed;
    }
    const literalSize = computeExprSize(expr);
    if (literalSize) {
      return literalSize;
    }
    const estimated = this.estimator.estimateSize(
      new astNode(this.getPath(expr), this.getType(expr), expr),
    );
    if (estimated) {
      this.computedSizes.set(expr.id(), estimated);
      return estimated;
    }
    const typeSize = computeTypeSize(this.getType(expr));
    if (typeSize) {
      return typeSize;
    }
    if (expr.kind() === ExprKind.Ident) {
      return this.peekLocalVar(expr.asIdent()!)?.size;
    }
    return undefined;
  }

  /**
   * setEntrySize stores computed container-entry metadata for later reuse.
   */
  private setEntrySize(expr: Expr, size: entrySizeEstimate | undefined): void {
    if (size) {
      this.computedEntrySizes.set(expr.id(), size);
    }
  }

  /**
   * computeEntrySize resolves the element/key/value size metadata for container expressions.
   */
  private computeEntrySize(expr: Expr): entrySizeEstimate | undefined {
    const computed = this.computedEntrySizes.get(expr.id());
    if (computed) {
      return computed;
    }
    if (expr.kind() === ExprKind.Ident) {
      return this.peekLocalVar(expr.asIdent()!)?.entrySize;
    }
    return undefined;
  }

  /**
   * pushIterKey propagates key/index size metadata to the first iterator variable.
   */
  private pushIterKey(varName: string, rangeExpr: Expr): void {
    const entrySize = this.computeEntrySize(rangeExpr);
    const containerKind = entrySize?.container() ?? this.getType(rangeExpr).kind();
    const subpath = containerKind === Kind.List ? "@indices" : "@keys";
    this.pushLocalVarRecord(varName, {
      exprId: rangeExpr.id(),
      path: [...(this.getPath(rangeExpr) ?? []), subpath],
      size: entrySize?.keySize(),
    });
  }

  /**
   * pushIterValue propagates value/item size metadata to the second iterator variable.
   */
  private pushIterValue(varName: string, rangeExpr: Expr): void {
    const entrySize = this.computeEntrySize(rangeExpr);
    const containerKind = entrySize?.container() ?? this.getType(rangeExpr).kind();
    const subpath = containerKind === Kind.List ? "@items" : "@values";
    this.pushLocalVarRecord(varName, {
      exprId: rangeExpr.id(),
      path: [...(this.getPath(rangeExpr) ?? []), subpath],
      size: entrySize?.valSize(),
    });
  }

  /**
   * pushIterSingle propagates element metadata for single-variable comprehensions.
   */
  private pushIterSingle(varName: string, rangeExpr: Expr): void {
    const entrySize = this.computeEntrySize(rangeExpr);
    const containerKind = entrySize?.container() ?? this.getType(rangeExpr).kind();
    const path = this.getPath(rangeExpr) ?? [];
    if (containerKind === Kind.List) {
      this.pushLocalVarRecord(varName, {
        exprId: rangeExpr.id(),
        path: [...path, "@items"],
        size: entrySize?.valSize(),
      });
      return;
    }
    this.pushLocalVarRecord(varName, {
      exprId: rangeExpr.id(),
      path: [...path, "@keys"],
      size: entrySize?.keySize(),
    });
  }

  /**
   * pushLocalVar propagates the size and entry-size metadata of a bound expression.
   */
  private pushLocalVar(varName: string, expr: Expr): void {
    this.pushLocalVarRecord(varName, {
      exprId: expr.id(),
      path: this.getPath(expr),
      size: this.computeSize(expr),
      entrySize: this.computeEntrySize(expr),
    });
  }

  /**
   * pushLocalVarRecord adds a scoped local-variable binding.
   */
  private pushLocalVarRecord(varName: string, value: localVar): void {
    const stack = this.localVars.get(varName) ?? [];
    stack.push(value);
    this.localVars.set(varName, stack);
  }

  /**
   * peekLocalVar returns the innermost scoped binding for a variable.
   */
  private peekLocalVar(varName: string): localVar | undefined {
    const stack = this.localVars.get(varName);
    return stack && stack.length > 0 ? stack[stack.length - 1] : undefined;
  }

  /**
   * popLocalVar removes the innermost scoped binding for a variable.
   */
  private popLocalVar(varName: string): void {
    const stack = this.localVars.get(varName);
    if (!stack || stack.length === 0) {
      return;
    }
    stack.pop();
    if (stack.length === 0) {
      this.localVars.delete(varName);
    }
  }
}

/**
 * computeExprSize computes the exact size of inline literal/list/map expressions when known.
 */
function computeExprSize(expr: Expr): SizeEstimate | undefined {
  switch (expr.kind()) {
    case ExprKind.Literal: {
      const literal = expr.asLiteral();
      if (typeof literal === "string") {
        return fixedSizeEstimate(BigInt([...literal].length));
      }
      if (literal instanceof Uint8Array) {
        return fixedSizeEstimate(BigInt(literal.length));
      }
      if (
        typeof literal === "boolean" ||
        typeof literal === "number" ||
        typeof literal === "bigint" ||
        literal === null
      ) {
        return fixedSizeEstimate(1);
      }
      return undefined;
    }
    case ExprKind.List:
      return fixedSizeEstimate(expr.asList()?.size() ?? 0);
    case ExprKind.Map:
      return fixedSizeEstimate(expr.asMap()?.size() ?? 0);
    default:
      return undefined;
  }
}

/**
 * computeTypeSize returns a fixed size for scalar types whose runtime width is known.
 */
function computeTypeSize(type: Type): SizeEstimate | undefined {
  return isScalar(type) ? fixedSizeEstimate(1) : undefined;
}

/**
 * isScalar reports whether the given type is known to have constant size at compile time.
 */
function isScalar(type: Type): boolean {
  switch (type.kind()) {
    case Kind.Bool:
    case Kind.Double:
    case Kind.Duration:
    case Kind.Int:
    case Kind.Timestamp:
    case Kind.Uint:
      return true;
    case Kind.Opaque:
      return type.typeName() === "optional_type" && isScalar(type.parameters()[0]!);
    default:
      return false;
  }
}

/**
 * isAccumulatorVar reports whether the name is reserved for macro accumulator plumbing.
 */
function isAccumulatorVar(name: string): boolean {
  return name === AccumulatorName || name === HiddenAccumulatorName;
}

function isEstimatorNode(value: Expr | AstNode): value is AstNode {
  return "computedSize" in value && typeof value.computedSize === "function";
}

function toUint64(value: bigint | number): bigint {
  const big = typeof value === "bigint" ? value : BigInt(Math.max(0, Math.trunc(value)));
  if (big < 0n) {
    return 0n;
  }
  if (big > UINT64_MAX) {
    return UINT64_MAX;
  }
  return big;
}

function addUint64NoOverflow(left: bigint, right: bigint): bigint {
  return right > 0n && left > UINT64_MAX - right ? UINT64_MAX : left + right;
}

function multiplyUint64NoOverflow(left: bigint, right: bigint): bigint {
  return right !== 0n && left > UINT64_MAX / right ? UINT64_MAX : left * right;
}

function multiplyByCostFactor(value: bigint, factor: number): bigint {
  const floatValue = Number(value);
  if (floatValue > 0 && factor > 0 && floatValue > Number(UINT64_MAX) / factor) {
    return UINT64_MAX;
  }
  const ceil = Math.ceil(floatValue * factor);
  if (ceil >= DOUBLE_TWO_TO_64) {
    return UINT64_MAX;
  }
  return toUint64(BigInt(ceil));
}

const selectAndIdentCost = fixedCostEstimate(SelectAndIdentCost);
const constCost = fixedCostEstimate(ConstCost);
const createListBaseCost = fixedCostEstimate(ListCreateBaseCost);
const createMapBaseCost = fixedCostEstimate(MapCreateBaseCost);
const createMessageBaseCost = fixedCostEstimate(StructCreateBaseCost);
