/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  AstNode,
  CallEstimate,
  CostEstimate,
  CostEstimator,
  DurationType,
  isIdentProtoExpr,
  ListCreateBaseCost,
  ListType,
  SizeEstimate,
  StringType,
  TimestampType,
} from '@protoutil/cel';
import {
  ADD_OPERATOR,
  ALL_MACRO,
  CONDITIONAL_OPERATOR,
  DIVIDE_OPERATOR,
  EQUALS_OPERATOR,
  EXISTS_MACRO,
  EXISTS_ONE_MACRO,
  GREATER_EQUALS_OPERATOR,
  GREATER_OPERATOR,
  IN_OPERATOR,
  INDEX_OPERATOR,
  LESS_EQUALS_OPERATOR,
  LESS_OPERATOR,
  LOGICAL_AND_OPERATOR,
  LOGICAL_NOT_OPERATOR,
  LOGICAL_OR_OPERATOR,
  MODULO_OPERATOR,
  MULTIPLY_OPERATOR,
  NOT_EQUALS_OPERATOR,
  SUBTRACT_OPERATOR,
} from '../operators.js';
import {
  CONTAINS_OVERLOAD,
  CONTAINS_STRING_FLAG_OVERLOAD,
  CONTAINS_STRING_OVERLOAD,
  ENDS_WITH_OVERLOAD,
  ENDS_WITH_STRING_FLAG_OVERLOAD,
  ENDS_WITH_STRING_OVERLOAD,
  LIKE_OVERLOAD,
  LIKE_STRING_FLAG_OVERLOAD,
  LIKE_STRING_OVERLOAD,
  SIZE_LIST_INST_OVERLOAD,
  SIZE_LIST_OVERLOAD,
  SIZE_OVERLOAD,
  STARTS_WITH_OVERLOAD,
  STARTS_WITH_STRING_FLAG_OVERLOAD,
  STARTS_WITH_STRING_OVERLOAD,
  STRING_LOWER_OVERLOAD,
  STRING_TRIM_OVERLOAD,
  STRING_UPPER_OVERLOAD,
  TIME_GET_DATE_OVERLOAD,
  TIME_GET_DAY_OF_WEEK_OVERLOAD,
  TIME_GET_DAY_OF_YEAR_OVERLOAD,
  TIME_GET_FULL_YEAR_OVERLOAD,
  TIME_GET_HOURS_OVERLOAD,
  TIME_GET_MILLISECONDS_OVERLOAD,
  TIME_GET_MINUTES_OVERLOAD,
  TIME_GET_MONTH_OVERLOAD,
  TIME_GET_SECONDS_OVERLOAD,
  TYPE_CONVERT_BOOL_OVERLOAD,
  TYPE_CONVERT_BYTES_OVERLOAD,
  TYPE_CONVERT_DATE_OVERLOAD,
  TYPE_CONVERT_DOUBLE_OVERLOAD,
  TYPE_CONVERT_DURATION_OVERLOAD,
  TYPE_CONVERT_INT_OVERLOAD,
  TYPE_CONVERT_LIST_OVERLOAD,
  TYPE_CONVERT_STRING_OVERLOAD,
  TYPE_CONVERT_TIME_OVERLOAD,
  TYPE_CONVERT_TIMESTAMP_OVERLOAD,
  TYPE_CONVERT_UINT_OVERLOAD,
} from '../overloads.js';
import { DateType, TimeType } from '../types.js';

export class DefaultSizeEstimator {}

export class DefaultCostEstimator implements CostEstimator {
  constructor(private readonly hints: Map<string, bigint>) {}

  estimateSize(element: AstNode): SizeEstimate | null {
    const l = this.hints.get(element.path().join('.'));
    if (l) {
      return new SizeEstimate(0n, l);
    }
    if (element.computedSize()) {
      return element.computedSize();
    }
    switch (element.type().kind()) {
      case StringType.kind():
        // Strings are bounded by the length of the string which is generally 65,535 characters
        return new SizeEstimate(1n, 65_535n);
      case DurationType.kind():
      case TimestampType.kind():
        // Creating durations and timestamps incurs an extra cost
        return new SizeEstimate(5n, 5n);
      case ListType.kind():
        // List costs are bounded by the number of elements in the list, if the max column size
        // is 1GiB and each element must be at least 4 bytes, the maximum number of elements is
        // 268,435,456 elements
        return new SizeEstimate(BigInt(ListCreateBaseCost), BigInt(ListCreateBaseCost)).add(
          new SizeEstimate(1n, 268_435_456n)
        );
      default:
        switch (element.type().typeName()) {
          case DateType.typeName():
          case TimeType.typeName():
            // Creating Date and Time values incurs an extra cost
            return new SizeEstimate(5n, 5n);
          default:
            break;
        }
        return null;
    }
  }

  estimateCallCost(
    fn: string,
    overloadID: string,
    target: AstNode,
    args: AstNode[]
  ): CallEstimate | null {
    // TODO: Handle more overloads and provide better estimates
    switch (fn) {
      case CONDITIONAL_OPERATOR:
      case LOGICAL_OR_OPERATOR:
      case LOGICAL_AND_OPERATOR:
      case LOGICAL_NOT_OPERATOR:
        return this.estimateLogicalOperatorCost(fn, args);
      // Comparison operations
      case EQUALS_OPERATOR:
      case NOT_EQUALS_OPERATOR:
      case GREATER_OPERATOR:
      case GREATER_EQUALS_OPERATOR:
      case LESS_OPERATOR:
      case LESS_EQUALS_OPERATOR:
        return this.estimateComparisonCost(fn, args[0], args[1]);
      // Arithmetic operations
      case ADD_OPERATOR:
      case SUBTRACT_OPERATOR:
      case MULTIPLY_OPERATOR:
      case DIVIDE_OPERATOR:
      case MODULO_OPERATOR:
        return this.estimateArithmeticCost(fn, args[0], args[1]);
      // Generic operators
      case INDEX_OPERATOR:
      case IN_OPERATOR:
      case SIZE_OVERLOAD:
        return this.estimateGenericOperatorCost(fn, overloadID, target, args);
      // Type casting
      case TYPE_CONVERT_BOOL_OVERLOAD:
      case TYPE_CONVERT_BYTES_OVERLOAD:
      case TYPE_CONVERT_DOUBLE_OVERLOAD:
      case TYPE_CONVERT_INT_OVERLOAD:
      case TYPE_CONVERT_STRING_OVERLOAD:
      case TYPE_CONVERT_UINT_OVERLOAD:
        return this.estimateCastCost([target, ...args], 80n);
      case TYPE_CONVERT_LIST_OVERLOAD:
        return this.estimateCastCost([target, ...args], 200n);
      case TYPE_CONVERT_DURATION_OVERLOAD:
      case TYPE_CONVERT_TIMESTAMP_OVERLOAD:
        return this.estimateCastCost([target, ...args], 100n);
      case TYPE_CONVERT_DATE_OVERLOAD:
      case TYPE_CONVERT_TIME_OVERLOAD:
        // Date and Time conversions come out with very low estimates so we can use a constant
        // to push them up a bit
        return this.estimateCastCost([target, ...args], 1000n);
      // String functions
      case CONTAINS_OVERLOAD:
      case ENDS_WITH_OVERLOAD:
      case STARTS_WITH_OVERLOAD:
      case STRING_LOWER_OVERLOAD:
      case STRING_UPPER_OVERLOAD:
      case STRING_TRIM_OVERLOAD:
      case LIKE_OVERLOAD:
        return this.estimateStringFunctionCost(overloadID, target, args);
      // Macros
      case ALL_MACRO:
      case EXISTS_MACRO:
      case EXISTS_ONE_MACRO:
        return this.estimateMacroCost(fn, overloadID, target, args);
      // Time functions
      case TIME_GET_FULL_YEAR_OVERLOAD:
      case TIME_GET_MONTH_OVERLOAD:
      case TIME_GET_DATE_OVERLOAD:
      case TIME_GET_DAY_OF_WEEK_OVERLOAD:
      case TIME_GET_DAY_OF_YEAR_OVERLOAD:
      case TIME_GET_HOURS_OVERLOAD:
      case TIME_GET_MINUTES_OVERLOAD:
      case TIME_GET_SECONDS_OVERLOAD:
      case TIME_GET_MILLISECONDS_OVERLOAD:
        return this.estimateTimeFunctionCost(fn, overloadID, target, args);
      default:
        return null;
    }
  }

  estimateArithmeticCost(fn: string, lhs: AstNode, rhs: AstNode): CallEstimate | null {
    let cost = new CostEstimate(2n, 2n);
    if (lhs.computedSize()) {
      cost = cost.add(lhs.computedSize()!);
    } else if (isIdentProtoExpr(lhs.expr())) {
      // Comparisons involving column values in a where clause are expensive
      cost = cost.add(new CostEstimate(10n, 10n));
    }
    if (rhs.computedSize()) {
      cost = cost.add(rhs.computedSize()!);
    } else if (isIdentProtoExpr(rhs.expr())) {
      // Comparisons involving column values in a where clause are expensive
      cost = cost.add(new CostEstimate(10n, 10n));
    }
    return new CallEstimate(cost);
  }

  estimateComparisonCost(fn: string, lhs: AstNode, rhs: AstNode): CallEstimate | null {
    let cost = new CostEstimate(1n, 1n);
    if (lhs.computedSize()) {
      cost = cost.add(lhs.computedSize()!);
    } else if (isIdentProtoExpr(lhs.expr())) {
      // Comparisons involving column values in a where clause are expensive
      cost = cost.add(new CostEstimate(10n, 10n));
    }
    if (rhs.computedSize()) {
      cost = cost.add(rhs.computedSize()!);
    } else if (isIdentProtoExpr(rhs.expr())) {
      // Comparisons involving column values in a where clause are expensive
      cost = cost.add(new CostEstimate(10n, 10n));
    }
    // NotEquals is a special case, it requires an extra cost to compute
    if (fn === NOT_EQUALS_OPERATOR) {
      cost = cost.add(new CostEstimate(5n, 5n));
    }
    return new CallEstimate(cost);
  }

  estimateCastCost(args: (AstNode | null)[], identCastCost: bigint): CallEstimate | null {
    let cost = new CostEstimate(1n, 1n);
    for (const arg of args) {
      if (!arg) {
        continue;
      }
      const argSize = arg?.computedSize();
      if (argSize) {
        cost = cost.add(argSize);
      } else if (isIdentProtoExpr(arg.expr())) {
        // Casting a column value in a where clause is an expensive operation
        cost = cost.add(new CostEstimate(identCastCost, identCastCost));
      }
    }
    return new CallEstimate(cost);
  }

  estimateGenericOperatorCost(
    fn: string,
    overloadId: string,
    target: AstNode | null,
    args: AstNode[]
  ): CallEstimate | null {
    let cost = new CostEstimate(1n, 1n);
    if (target && target.computedSize()) {
      cost = cost.add(target.computedSize()!);
    } else if (target && isIdentProtoExpr(target.expr())) {
      cost = cost.add(new CostEstimate(10n, 10n));
    }
    for (const arg of args) {
      if (!arg) {
        continue;
      }
      const argSize = arg.computedSize();
      if (argSize) {
        cost = cost.add(argSize);
      } else if (isIdentProtoExpr(arg.expr())) {
        // Generic operations involving column values in a where clause are expensive
        cost = cost.add(new CostEstimate(10n, 10n));
      }
    }
    if (fn === IN_OPERATOR) {
      // IN operator is expensive as it requires a full scan of the target. Since a list column
      // could in theory be up to 1GiB in size, we need to account for that
      cost = cost.add(new CostEstimate(20n, 268_435_456n));
    }
    if (fn === SIZE_OVERLOAD) {
      // Size operation is relatively cheap, but still requires a full scan of the target
      cost = cost.add(new CostEstimate(10n, 10n));
      if (overloadId === SIZE_LIST_OVERLOAD || overloadId === SIZE_LIST_INST_OVERLOAD) {
        // Size of a list is more expensive as it requires iterating over the elements
        cost = cost.add(new CostEstimate(20n, 20n));
      }
    }
    return new CallEstimate(cost);
  }

  estimateLogicalOperatorCost(fn: string, args: AstNode[]): CallEstimate | null {
    let cost = new CostEstimate(1n, 1n);
    for (const arg of args) {
      if (!arg) {
        continue;
      }
      const argSize = arg.computedSize();
      if (argSize) {
        cost = cost.add(argSize);
      } else if (isIdentProtoExpr(arg.expr())) {
        // Logical operations involving column values in a where clause are expensive
        cost = cost.add(new CostEstimate(10n, 10n));
      }
    }
    return new CallEstimate(cost);
  }

  estimateMacroCost(
    fn: string,
    overloadId: string,
    target: AstNode,
    args: AstNode[]
  ): CallEstimate | null {
    let cost = new CostEstimate(20n, 20n);
    if (target.computedSize()) {
      cost = cost.add(target.computedSize()!);
    } else if (isIdentProtoExpr(target.expr())) {
      cost = cost.add(new CostEstimate(10n, 10n));
    }
    for (const arg of args) {
      if (!arg) {
        continue;
      }
      const argSize = arg.computedSize();
      if (argSize) {
        cost = cost.add(argSize);
      } else if (isIdentProtoExpr(arg.expr())) {
        // Macro operations involving column values in a where clause are expensive
        cost = cost.add(new CostEstimate(10n, 10n));
      }
    }
    return new CallEstimate(cost);
  }

  estimateStringFunctionCost(
    overloadId: string,
    target: AstNode | null,
    args: (AstNode | null)[]
  ): CallEstimate | null {
    let cost = new CostEstimate(10n, 10n);
    if (target && isIdentProtoExpr(target.expr())) {
      cost = cost.add(new CostEstimate(10n, 10n));
    }
    for (const arg of args) {
      if (arg && isIdentProtoExpr(arg.expr())) {
        cost = cost.add(new CostEstimate(10n, 10n));
      }
    }
    switch (overloadId) {
      case CONTAINS_STRING_OVERLOAD:
      case CONTAINS_STRING_FLAG_OVERLOAD:
      case ENDS_WITH_STRING_OVERLOAD:
      case ENDS_WITH_STRING_FLAG_OVERLOAD:
        // Forces full table scan, expensive string processing
        cost = cost.add(new CostEstimate(40n, 40n));
        break;
      case STARTS_WITH_STRING_OVERLOAD:
      case STARTS_WITH_STRING_FLAG_OVERLOAD:
        // StartsWith is a slightly cheaper operation than Contains and EndsWith
        cost = cost.add(new CostEstimate(20n, 20n));
        break;
      case STRING_LOWER_OVERLOAD:
      case STRING_UPPER_OVERLOAD:
      case STRING_TRIM_OVERLOAD:
        // Case conversion + full scan overhead
        cost = cost.add(new CostEstimate(10n, 10n));
        break;
      case LIKE_STRING_OVERLOAD:
        // Like operation is expensive due to pattern matching
        cost = cost.add(new CostEstimate(20n, 20n));
        break;
      case LIKE_STRING_FLAG_OVERLOAD:
        // Like with flags is more expensive due to additional processing
        cost = cost.add(new CostEstimate(30n, 30n));
        break;
      default:
        break;
    }
    return new CallEstimate(cost);
  }

  estimateTimeFunctionCost(
    fn: string,
    overloadId: string,
    target: AstNode,
    args: AstNode[]
  ): CallEstimate | null {
    let cost = new CostEstimate(20n, 20n);
    if (target.computedSize()) {
      cost = cost.add(target.computedSize()!);
    } else if (isIdentProtoExpr(target.expr())) {
      cost = cost.add(new CostEstimate(10n, 10n));
    }
    for (const arg of args) {
      if (!arg) {
        continue;
      }
      const argSize = arg.computedSize();
      if (argSize) {
        cost = cost.add(argSize);
      } else if (isIdentProtoExpr(arg.expr())) {
        // Time operations involving column values in a where clause are expensive
        cost = cost.add(new CostEstimate(10n, 10n));
      }
    }
    return new CallEstimate(cost);
  }
}
