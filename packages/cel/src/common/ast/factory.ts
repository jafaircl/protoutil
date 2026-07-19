import type { ConstantValue, EntryExpr, Expr } from "./expr.js";
import {
  callExpr,
  comprehensionExpr,
  identExpr,
  listExpr,
  literalExpr,
  mapEntryExpr,
  mapExpr,
  selectExpr,
  structExpr,
  structFieldExpr,
  unspecifiedExpr,
} from "./expr.js";

/**
 * ExprFactory mirrors the cel-go construction seams for AST values.
 */
export interface ExprFactory {
  /** CopyExpr creates a deep copy of the input Expr value. */
  copyExpr(expr: Expr): Expr;
  /** CopyEntryExpr creates a deep copy of the input EntryExpr value. */
  copyEntryExpr(entry: EntryExpr): EntryExpr;
  /** Call creates an Expr value representing a global function call. */
  call(id: number, fn: string, ...args: Expr[]): Expr;
  /** Comprehension creates an Expr value representing a one-variable comprehension over a value range. */
  comprehension(
    id: number,
    iterRange: Expr,
    iterVar: string,
    accuVar: string,
    accuInit: Expr,
    loopCondition: Expr,
    loopStep: Expr,
    result: Expr,
  ): Expr;
  /** ComprehensionTwoVar creates an Expr value representing a two-variable comprehension over a value range. */
  comprehensionTwoVar(
    id: number,
    iterRange: Expr,
    iterVar: string,
    iterVar2: string,
    accuVar: string,
    accuInit: Expr,
    loopCondition: Expr,
    loopStep: Expr,
    result: Expr,
  ): Expr;
  /** MemberCall creates an Expr value representing a member function call. */
  memberCall(id: number, fn: string, receiver: Expr, ...args: Expr[]): Expr;
  /** Ident creates an Expr value representing an identifier. */
  ident(id: number, name: string): Expr;
  /** AccuIdent creates an Expr value representing an accumulator identifier within a comprehension. */
  accuIdent(id: number): Expr;
  /** AccuIdentName reports the accumulator variable name to be used within a comprehension. */
  accuIdentName(): string;
  /** Literal creates an Expr value representing a literal value, such as a string or integer. */
  literal(id: number, value: ConstantValue): Expr;
  /**
   * List creates an Expr value representing a list literal expression with optional indices.
   *
   * Optional indices will typically be empty unless CEL optional types are enabled.
   */
  list(id: number, elems: Expr[], optionalIndices: number[]): Expr;
  /** Map creates an Expr value representing a map literal expression. */
  map(id: number, entries: EntryExpr[]): Expr;
  /** MapEntry creates a MapEntry with a given key, value, and a flag indicating whether the key is optionally set. */
  mapEntry(id: number, key: Expr, value: Expr, optional: boolean): EntryExpr;
  /** PresenceTest creates an Expr representing a field presence test on an operand expression. */
  presenceTest(id: number, operand: Expr, field: string): Expr;
  /** Select creates an Expr representing a field selection on an operand expression. */
  select(id: number, operand: Expr, field: string): Expr;
  /** Struct creates an Expr value representing a struct literal with a given type name and a set of field initializers. */
  struct(id: number, typeName: string, fields: EntryExpr[]): Expr;
  /** StructField creates a StructField with a given field name, value, and a flag indicating whether the field is optionally set. */
  structField(id: number, field: string, value: Expr, optional: boolean): EntryExpr;
  /** Unspecified creates an empty expression node. */
  unspecified(id: number): Expr;
}

/**
 * BaseExprFactory provides the default expression factory implementation.
 */
class BaseExprFactory implements ExprFactory {
  constructor(private readonly accumulator = "@result") {}

  public copyExpr(expr: Expr): Expr {
    return expr.toProto() ? expr : unspecifiedExpr();
  }

  public copyEntryExpr(entry: EntryExpr): EntryExpr {
    if (entry.kind() === 1) {
      const mapEntry = entry.asMapEntry();
      return this.mapEntry(
        entry.id(),
        this.copyExpr(mapEntry?.key() ?? unspecifiedExpr()),
        this.copyExpr(mapEntry?.value() ?? unspecifiedExpr()),
        mapEntry?.isOptional() ?? false,
      );
    }
    const field = entry.asStructField();
    return this.structField(
      entry.id(),
      field?.name() ?? "",
      this.copyExpr(field?.value() ?? unspecifiedExpr()),
      field?.isOptional() ?? false,
    );
  }

  public call(id: number, fn: string, ...args: Expr[]): Expr {
    return callExpr(id, fn, args);
  }

  public comprehension(
    id: number,
    iterRange: Expr,
    iterVar: string,
    accuVar: string,
    accuInit: Expr,
    loopCondition: Expr,
    loopStep: Expr,
    result: Expr,
  ): Expr {
    return this.comprehensionTwoVar(
      id,
      iterRange,
      iterVar,
      "",
      accuVar,
      accuInit,
      loopCondition,
      loopStep,
      result,
    );
  }

  public comprehensionTwoVar(
    id: number,
    iterRange: Expr,
    iterVar: string,
    iterVar2: string,
    accuVar: string,
    accuInit: Expr,
    loopCondition: Expr,
    loopStep: Expr,
    result: Expr,
  ): Expr {
    return comprehensionExpr(
      id,
      iterRange,
      iterVar,
      iterVar2,
      accuVar,
      accuInit,
      loopCondition,
      loopStep,
      result,
    );
  }

  public memberCall(id: number, fn: string, receiver: Expr, ...args: Expr[]): Expr {
    return callExpr(id, fn, args, receiver);
  }

  public ident(id: number, name: string): Expr {
    return identExpr(id, name);
  }

  public accuIdent(id: number): Expr {
    return this.ident(id, this.accuIdentName());
  }

  public accuIdentName(): string {
    return this.accumulator;
  }

  public literal(id: number, value: ConstantValue): Expr {
    return literalExpr(id, value);
  }

  public list(id: number, elems: Expr[], optionalIndices: number[]): Expr {
    return listExpr(id, elems, optionalIndices);
  }

  public map(id: number, entries: EntryExpr[]): Expr {
    return mapExpr(id, entries);
  }

  public mapEntry(id: number, key: Expr, value: Expr, optional: boolean): EntryExpr {
    return mapEntryExpr(id, key, value, optional);
  }

  public presenceTest(id: number, operand: Expr, field: string): Expr {
    return selectExpr(id, operand, field, true);
  }

  public select(id: number, operand: Expr, field: string): Expr {
    return selectExpr(id, operand, field, false);
  }

  public struct(id: number, typeName: string, fields: EntryExpr[]): Expr {
    return structExpr(id, typeName, fields);
  }

  public structField(id: number, field: string, value: Expr, optional: boolean): EntryExpr {
    return structFieldExpr(id, field, value, optional);
  }

  public unspecified(id: number): Expr {
    return unspecifiedExpr(id);
  }
}

/**
 * ExprFactory creates an expression factory.
 */
export function exprFactory(): ExprFactory {
  return new BaseExprFactory();
}

/**
 * ExprFactoryWithAccumulator creates a factory with a custom accumulator identifier.
 */
export function exprFactoryWithAccumulator(name: string): ExprFactory {
  return new BaseExprFactory(name);
}
