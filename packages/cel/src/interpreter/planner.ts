import type { AST, Expr } from "../common/ast/index.js";
import type { Container } from "../common/containers.js";
import * as operators from "../common/operators.js";
import type { Provider } from "../common/types/index.js";
import { type Adapter, Double, exprTypeToType, Int, Uint } from "../common/types/index.js";
import { Type_PrimitiveType } from "../gen/cel/expr/checked_pb.js";
import { asyncCallInterpretable } from "./async.js";
import type { AttributeFactory } from "./attributes.js";
import type { InterpretableDecoratorV2 } from "./decorators.js";
import type { Dispatcher } from "./dispatcher.js";
import {
  attrInterpretable,
  callInterpretable,
  constantRuntimeValue,
  constValue,
  equalityInterpretable,
  foldInterpretable,
  type InterpretableAttribute,
  type InterpretableV2,
  listInterpretable,
  logicalAndInterpretable,
  logicalOrInterpretable,
  mapInterpretable,
  notEqualityInterpretable,
  objInterpretable,
  testOnlyInterpretable,
} from "./interpretable.js";

/**
 * PlannerState configures AST planning into runtime interpretables.
 */
export interface PlannerState {
  /**
   * dispatcher resolves runtime overload implementations.
   */
  dispatcher: Dispatcher;

  /**
   * provider resolves types and object constructors.
   */
  provider: Provider;

  /**
   * adapter adapts native values into CEL values.
   */
  adapter: Adapter;

  /**
   * attrFactory creates runtime attributes and qualifiers.
   */
  attrFactory: AttributeFactory;

  /**
   * container resolves candidate names for unchecked identifiers and functions.
   */
  container: Container;

  /**
   * decorators are applied to each planned interpretable node.
   */
  decorators: InterpretableDecoratorV2[];

  /**
   * observers are carried by the outer interpreter and do not affect node planning here.
   */
  observers: unknown[];
}

/**
 * planAst plans the root expression of an AST into an interpretable.
 */
export function planAst(options: { exprAst: AST; planner: PlannerState }): InterpretableV2 {
  const builder = new PlanBuilder(options.planner, options.exprAst);
  return builder.plan(options.exprAst.expr());
}

/**
 * PlanBuilder ports the core cel-go interpreter planning flow.
 */
class PlanBuilder {
  /**
   * refMapValue stores checked reference metadata keyed by expression id.
   */
  private readonly refMapValue: Map<
    number,
    { name: string; value?: unknown; overloadIds: string[] }
  >;

  /**
   * exprAstValue stores the checked AST so literal planning can inspect inferred types.
   */
  private readonly exprAstValue: AST;

  /**
   * localVarsValue tracks comprehension-local variable bindings.
   */
  private readonly localVarsValue = new Map<string, number>();

  /**
   * constructor initializes the planning context.
   */
  constructor(
    private readonly plannerValue: PlannerState,
    exprAst: AST,
  ) {
    this.exprAstValue = exprAst;
    this.refMapValue = exprAst.referenceMap();
  }

  /**
   * plan plans one expression node and decorates the resulting interpretable.
   */
  public plan(expr: Expr): InterpretableV2 {
    switch (expr.kind()) {
      case 1:
        return this.decorate(this.planCall(expr));
      case 3:
        return this.decorate(this.planIdent(expr));
      case 5:
        return this.decorate(this.planConst(expr));
      case 7:
        return this.decorate(this.planSelect(expr));
      case 4:
        return this.decorate(this.planCreateList(expr));
      case 6:
        return this.decorate(this.planCreateMap(expr));
      case 8:
        return this.decorate(this.planCreateStruct(expr));
      case 2:
        return this.decorate(this.planComprehension(expr));
      default:
        throw new Error(`unsupported expr: ${expr.kind()}`);
    }
  }

  /**
   * decorate applies planner decorators to the planned node.
   */
  private decorate(interpretable: InterpretableV2): InterpretableV2 {
    let current = interpretable;
    for (const decorator of this.plannerValue.decorators) {
      current = decorator(current);
    }
    return current;
  }

  /**
   * planIdent plans an identifier expression.
   */
  private planIdent(expr: Expr): InterpretableV2 {
    const ident = expr.asIdent() ?? "";
    const identRef = this.refMapValue.get(expr.id());
    if (identRef) {
      return this.planCheckedIdent(expr.id(), identRef, ident);
    }
    if (this.isLocalVar(ident)) {
      return attrInterpretable({
        adapter: this.plannerValue.adapter,
        attr: this.plannerValue.attrFactory.absoluteAttribute(expr.id(), ident),
      });
    }
    return attrInterpretable({
      adapter: this.plannerValue.adapter,
      attr: this.plannerValue.attrFactory.maybeAttribute(expr.id(), ident),
    });
  }

  /**
   * planCheckedIdent plans a checked identifier reference.
   */
  private planCheckedIdent(
    id: number,
    identRef: { name: string; value?: unknown; overloadIds: string[] },
    originalIdent?: string,
  ): InterpretableV2 {
    if (identRef.value !== undefined) {
      return constValue({
        id,
        value: this.plannerValue.adapter.nativeToValue(identRef.value),
      });
    }
    return attrInterpretable({
      adapter: this.plannerValue.adapter,
      attr: this.plannerValue.attrFactory.absoluteAttribute(
        id,
        originalIdent?.startsWith(".") ? originalIdent : identRef.name,
      ),
    });
  }

  /**
   * planSelect plans a field-selection expression.
   */
  private planSelect(expr: Expr): InterpretableV2 {
    const identRef = this.refMapValue.get(expr.id());
    if (identRef) {
      return this.planCheckedIdent(expr.id(), identRef);
    }
    const select = expr.asSelect()!;
    const operand = this.plan(select.operand());
    let attr = this.asAttribute(expr.id(), operand, false);
    const qualifier = this.plannerValue.attrFactory.qualifier({
      id: expr.id(),
      objectType: exprTypeToType(this.exprAstValue.getType(select.operand().id())!),
      value: select.fieldName(),
      optional: false,
    });
    if (select.isTestOnly()) {
      attr = testOnlyInterpretable({ id: expr.id(), attr });
    }
    attr.addQualifier(qualifier);
    return attr;
  }

  /**
   * planCall plans a function or operator call.
   */
  private planCall(expr: Expr): InterpretableV2 {
    const call = expr.asCall()!;
    const target = call.isMemberFunction() ? this.plan(call.target()) : undefined;
    const resolvedFunction = this.resolveFunction(expr);
    const args = [
      ...(target && !resolvedFunction.targetIsNamespace ? [target] : []),
      ...call.args().map((arg) => this.plan(arg)),
    ];
    const { functionName, overloadId } = resolvedFunction;
    switch (functionName) {
      case operators.LogicalAnd:
        return logicalAndInterpretable(expr.id(), args);
      case operators.LogicalOr:
        return logicalOrInterpretable(expr.id(), args);
      case operators.Equals:
        return equalityInterpretable(expr.id(), args[0]!, args[1]!);
      case operators.NotEquals:
        return notEqualityInterpretable(expr.id(), args[0]!, args[1]!);
      case operators.Conditional: {
        const truthy = args[1]!;
        const truthyAttr =
          "attr" in truthy && typeof (truthy as { attr?: unknown }).attr === "function"
            ? (truthy as InterpretableAttribute).attr()
            : this.plannerValue.attrFactory.relativeAttribute(truthy.id(), truthy);
        const falsy = args[2]!;
        const falsyAttr =
          "attr" in falsy && typeof (falsy as { attr?: unknown }).attr === "function"
            ? (falsy as InterpretableAttribute).attr()
            : this.plannerValue.attrFactory.relativeAttribute(falsy.id(), falsy);
        return attrInterpretable({
          adapter: this.plannerValue.adapter,
          attr: this.plannerValue.attrFactory.conditionalAttribute(
            expr.id(),
            args[0]!,
            truthyAttr,
            falsyAttr,
          ),
        });
      }
      case operators.Index:
      case operators.OptIndex:
      case operators.OptSelect: {
        const attr = this.asAttribute(expr.id(), args[0]!, functionName !== operators.Index);
        const indexArg = args[1]!;
        if ("value" in indexArg && typeof (indexArg as { value?: unknown }).value === "function") {
          attr.addQualifier(
            this.plannerValue.attrFactory.qualifier({
              id: expr.id(),
              value: (indexArg as { value: () => unknown }).value(),
              optional: functionName !== operators.Index,
            }),
          );
        } else if (
          "attr" in indexArg &&
          typeof (indexArg as { attr?: unknown }).attr === "function"
        ) {
          const dynamicAttribute = (indexArg as InterpretableAttribute).attr();
          attr.addQualifier(
            this.plannerValue.attrFactory.qualifier({
              id: expr.id(),
              value: dynamicAttribute,
              optional: functionName !== operators.Index,
            }),
          );
        } else {
          const qualifier = this.plannerValue.attrFactory.relativeAttribute(expr.id(), indexArg);
          if (
            functionName !== operators.Index &&
            "withOptional" in qualifier &&
            typeof (qualifier as { withOptional?: unknown }).withOptional === "function"
          ) {
            (qualifier as { withOptional(): unknown }).withOptional();
          }
          attr.addQualifier(qualifier);
        }
        return attr;
      }
      default:
        return this.planPlainCall(expr.id(), functionName, overloadId, args);
    }
  }

  /**
   * planPlainCall plans a runtime function call through dispatcher overload bindings.
   */
  private planPlainCall(
    id: number,
    functionName: string,
    overloadId: string,
    args: InterpretableV2[],
  ): InterpretableV2 {
    const [resolved] = (overloadId
      ? this.plannerValue.dispatcher.findOverload(overloadId)
      : [undefined, false]) ?? [undefined, false];
    const [fallback] = this.plannerValue.dispatcher.findOverload(functionName);
    const overload = resolved ?? fallback;
    if (overload?.async !== undefined) {
      return asyncCallInterpretable({
        id,
        functionName,
        overloadId,
        args,
        implementation: overload.async,
      });
    }
    return callInterpretable({
      id,
      functionName,
      overloadId,
      args,
      impl: overload?.func,
      unary: overload?.unary,
      binary: overload?.binary,
      nonStrict: overload?.nonStrict ?? false,
      operandTrait: overload?.operandTrait ?? 0,
    });
  }

  /**
   * planCreateList plans a list literal.
   */
  private planCreateList(expr: Expr): InterpretableV2 {
    const list = expr.asList()!;
    for (const optionalIndex of list.optionalIndices()) {
      if (optionalIndex < 0 || optionalIndex >= list.elements().length) {
        throw new Error(
          `optional list index ${optionalIndex} out of range for ${list.elements().length} elements`,
        );
      }
    }
    return listInterpretable({
      id: expr.id(),
      elements: list.elements().map((element) => this.plan(element)),
      optionalIndices: list.optionalIndices(),
    });
  }

  /**
   * planCreateMap plans a map literal.
   */
  private planCreateMap(expr: Expr): InterpretableV2 {
    const map = expr.asMap()!;
    return mapInterpretable({
      id: expr.id(),
      keys: map.entries().map((entry) => this.plan(entry.asMapEntry()!.key())),
      values: map.entries().map((entry) => this.plan(entry.asMapEntry()!.value())),
      optionalEntries: map.entries().map((entry) => entry.asMapEntry()!.isOptional()),
    });
  }

  /**
   * planCreateStruct plans an object literal.
   */
  private planCreateStruct(expr: Expr): InterpretableV2 {
    const struct = expr.asStruct()!;
    const typeName = this.resolveTypeName(struct.typeName()) ?? struct.typeName();
    const [, found] = this.plannerValue.provider.findStructType(typeName);
    if (!found) {
      throw new Error(`unknown type: ${typeName}`);
    }
    return objInterpretable({
      id: expr.id(),
      typeName,
      fields: struct.fields().map((field) => field.asStructField()!.name()),
      values: struct.fields().map((field) => this.plan(field.asStructField()!.value())),
      optionalFields: struct.fields().map((field) => field.asStructField()!.isOptional()),
      provider: this.plannerValue.provider,
    });
  }

  /**
   * planComprehension plans a comprehension fold.
   */
  private planComprehension(expr: Expr): InterpretableV2 {
    const fold = expr.asComprehension()!;
    const accuInit = this.plan(fold.accuInit());
    const iterRange = this.plan(fold.iterRange());
    this.pushLocalVars(fold.accuVar(), fold.iterVar(), fold.iterVar2());
    const condition = this.plan(fold.loopCondition());
    const step = this.plan(fold.loopStep());
    this.popLocalVars(fold.iterVar(), fold.iterVar2());
    const result = this.plan(fold.result());
    this.popLocalVars(fold.accuVar());
    return foldInterpretable({
      id: expr.id(),
      accuVar: fold.accuVar(),
      iterVar: fold.iterVar(),
      iterVar2: fold.iterVar2(),
      iterRange,
      accuInit,
      condition,
      step,
      result,
    });
  }

  /**
   * planConst plans a literal constant expression.
   */
  private planConst(expr: Expr): InterpretableV2 {
    const literal = expr.asLiteral();
    if (typeof literal === "number") {
      return constValue({
        id: expr.id(),
        value:
          this.checkedPrimitiveKind(expr.id()) === Type_PrimitiveType.DOUBLE
            ? new Double(literal)
            : this.plannerValue.adapter.nativeToValue(literal),
      });
    }
    if (typeof literal === "bigint") {
      return constValue({
        id: expr.id(),
        value:
          this.checkedPrimitiveKind(expr.id()) === Type_PrimitiveType.UINT64
            ? new Uint(literal)
            : new Int(literal),
      });
    }
    return constValue({
      id: expr.id(),
      value: constantRuntimeValue({ adapter: this.plannerValue.adapter, literal }),
    });
  }

  /**
   * asAttribute coerces an interpretable into an attribute interpretable.
   */
  private asAttribute(
    id: number,
    value: InterpretableV2,
    optional: boolean,
  ): InterpretableAttribute {
    if ("attr" in value && typeof (value as { attr?: unknown }).attr === "function") {
      if (
        optional &&
        "withOptional" in value &&
        typeof (value as { withOptional?: unknown }).withOptional === "function"
      ) {
        (value as { withOptional(): unknown }).withOptional();
      }
      return value as InterpretableAttribute;
    }
    return attrInterpretable({
      adapter: this.plannerValue.adapter,
      attr: this.plannerValue.attrFactory.relativeAttribute(id, value),
      optional,
    });
  }

  /**
   * resolveTypeName resolves a candidate struct type name through the provider and container.
   */
  private resolveTypeName(typeName: string): string | undefined {
    for (const candidate of this.plannerValue.container.resolveCandidateNames(typeName)) {
      if (this.plannerValue.provider.findStructType(candidate)[1]) {
        return candidate;
      }
    }
    return undefined;
  }

  /**
   * resolveFunction determines the normalized function and overload identifiers for a call.
   */
  private resolveFunction(expr: Expr): {
    /**
     * functionName is the normalized runtime function name.
     */
    functionName: string;

    /**
     * overloadId is the checked overload id when one is available.
     */
    overloadId: string;

    /**
     * targetIsNamespace reports whether a parsed member target was folded into the function name.
     */
    targetIsNamespace: boolean;
  } {
    const call = expr.asCall()!;
    const ref = this.refMapValue.get(expr.id());
    if (ref && ref.overloadIds.length === 1) {
      return {
        functionName: call.functionName(),
        overloadId: ref.overloadIds[0]!,
        targetIsNamespace: false,
      };
    }
    let functionName = call.functionName();
    if (!call.isMemberFunction()) {
      for (const candidate of this.plannerValue.container.resolveCandidateNames(functionName)) {
        if (this.plannerValue.dispatcher.findOverload(candidate)[1]) {
          functionName = candidate;
          break;
        }
      }
      return {
        functionName: functionName.replace(/^\./, ""),
        overloadId: "",
        targetIsNamespace: false,
      };
    }
    const qualified = this.toQualifiedName(call.target());
    if (qualified) {
      const combined = `${qualified}.${functionName}`;
      for (const candidate of this.plannerValue.container.resolveCandidateNames(combined)) {
        if (this.plannerValue.dispatcher.findOverload(candidate)[1]) {
          return {
            functionName: candidate,
            overloadId: "",
            targetIsNamespace: true,
          };
        }
      }
    }
    return {
      functionName,
      overloadId: "",
      targetIsNamespace: false,
    };
  }

  /**
   * toQualifiedName converts an identifier/select chain into a dot-qualified name when possible.
   */
  private toQualifiedName(expr: Expr): string | undefined {
    if (this.refMapValue.has(expr.id())) {
      return undefined;
    }
    if (expr.kind() === 3) {
      return expr.asIdent() ?? undefined;
    }
    if (expr.kind() === 7) {
      const select = expr.asSelect()!;
      if (select.isTestOnly()) {
        return undefined;
      }
      const operand = this.toQualifiedName(select.operand());
      return operand ? `${operand}.${select.fieldName()}` : undefined;
    }
    return undefined;
  }

  /**
   * pushLocalVars records one or more locally-scoped variable bindings.
   */
  private pushLocalVars(...names: string[]): void {
    for (const name of names) {
      if (name === "") {
        continue;
      }
      this.localVarsValue.set(name, (this.localVarsValue.get(name) ?? 0) + 1);
    }
  }

  /**
   * popLocalVars removes one or more locally-scoped variable bindings.
   */
  private popLocalVars(...names: string[]): void {
    for (const name of names) {
      if (name === "") {
        continue;
      }
      const count = this.localVarsValue.get(name) ?? 0;
      if (count <= 1) {
        this.localVarsValue.delete(name);
      } else {
        this.localVarsValue.set(name, count - 1);
      }
    }
  }

  /**
   * isLocalVar reports whether a variable name is currently bound in local comprehension scope.
   */
  private isLocalVar(name: string): boolean {
    return this.localVarsValue.has(name);
  }

  /**
   * checkedPrimitiveKind returns the checked primitive kind for an expression id when available.
   */
  private checkedPrimitiveKind(id: number): Type_PrimitiveType | undefined {
    const typeValue = this.exprAstValue.getType(id) as
      | { typeKind?: { case?: string; value?: unknown } }
      | undefined;
    if (typeValue?.typeKind?.case !== "primitive") {
      return undefined;
    }
    return typeof typeValue.typeKind.value === "number"
      ? (typeValue.typeKind.value as Type_PrimitiveType)
      : undefined;
  }
}
