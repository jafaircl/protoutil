import {
  type AST,
  astExtension,
  checkedAst,
  EntryExprKind,
  type Expr,
  ExprKind,
  type Extension,
  ExtensionComponent,
  exprFactory,
  extensionVersion,
  functionReference,
  identReference,
  type ReferenceInfo,
} from "../common/ast/index.js";
import { toQualifiedName } from "../common/containers.js";
import type { FunctionDecl } from "../common/decls.js";
import { variable } from "../common/decls.js";
import { type Errors, errorsValue } from "../common/errors.js";
import { SourceLocation } from "../common/location.js";
import type { Source } from "../common/source.js";
import {
  BoolType,
  BytesType,
  DoubleType,
  DynType,
  ErrorType,
  IntType,
  Kind,
  listType,
  mapType,
  NullType,
  opaqueType,
  optionalType,
  StringType,
  type Type,
  typeParamType,
  typeToExprType,
  UintType,
} from "../common/types/index.js";
import type { Env } from "./env.js";
import { typeErrors } from "./errors.js";
import { type mapping, mappingValue } from "./mapping.js";
import {
  isAssignable as checkAssignable,
  isAssignableList as checkAssignableList,
  isDyn,
  isDynOrError,
  maybeUnwrapOptional,
  mostGeneral,
  substitute,
} from "./types.js";

const jsonNameExtension: Extension = astExtension({
  id: "json_name",
  version: extensionVersion(1, 1),
  affectedComponents: [ExtensionComponent.TypeChecker],
});

/**
 * checker carries the mutable state for one check pass.
 */
class checker {
  public readonly ast: AST;
  public readonly errors: typeErrors;
  public mappings: mapping;

  private readonly factory = exprFactory();
  private readonly types = new Map<number, Type>();
  private freeTypeVarCounter = 0;

  constructor(
    parsed: AST,
    source: Source,
    public env: Env,
  ) {
    this.ast = checkedAst(parsed, new Map(), new Map());
    this.errors = new typeErrors(errorsValue(source));
    this.mappings = mappingValue();
  }

  /**
   * check walks the expression tree and records types and references.
   */
  public check(expr: Expr): void {
    switch (expr.kind()) {
      case ExprKind.Literal:
        this.checkLiteral(expr);
        return;
      case ExprKind.Ident:
        this.checkIdent(expr);
        return;
      case ExprKind.Select:
        this.checkSelect(expr);
        return;
      case ExprKind.Call:
        this.checkCall(expr);
        return;
      case ExprKind.List:
        this.checkCreateList(expr);
        return;
      case ExprKind.Map:
        this.checkCreateMap(expr);
        return;
      case ExprKind.Struct:
        this.checkCreateStruct(expr);
        return;
      case ExprKind.Comprehension:
        this.checkComprehension(expr);
        return;
      default:
        this.errors.unexpectedASTType(
          expr.id(),
          this.location(expr),
          "unspecified",
          String(expr.kind()),
        );
    }
  }

  /**
   * checkLiteral assigns the CEL type corresponding to a literal expression.
   */
  private checkLiteral(expr: Expr): void {
    const literal = expr.asLiteral();
    if (isUintLiteral(literal)) {
      this.recordType(expr, UintType);
      return;
    }
    if (typeof literal === "string") {
      this.recordType(expr, StringType);
      return;
    }
    if (typeof literal === "boolean") {
      this.recordType(expr, BoolType);
      return;
    }
    if (typeof literal === "bigint") {
      this.recordType(expr, IntType);
      return;
    }
    if (literal === null) {
      this.recordType(expr, NullType);
      return;
    }
    if (literal instanceof Uint8Array) {
      this.recordType(expr, BytesType);
      return;
    }
    if (typeof literal === "number") {
      this.recordType(expr, DoubleType);
      return;
    }
    this.errors.unexpectedASTType(expr.id(), this.location(expr), "literal", typeof literal);
  }

  /**
   * checkIdent resolves identifier declarations and rewrites them to their qualified form.
   */
  private checkIdent(expr: Expr): void {
    const identName = expr.asIdent();
    if (!identName) {
      return;
    }
    const ident = this.env.resolveSimpleIdent(identName);
    if (ident) {
      const name = ident.requiresDisambiguation
        ? `.${ident.variableDecl.name()}`
        : ident.variableDecl.name();
      this.recordType(expr, ident.variableDecl.type());
      this.recordReference(expr, identReference(name, ident.variableDecl.value()));
      expr.setKindCase(this.factory.ident(expr.id(), name));
      return;
    }
    this.recordType(expr, ErrorType);
    this.errors.undeclaredReference(
      expr.id(),
      this.location(expr),
      this.env.container.name(),
      identName,
    );
  }

  /**
   * checkSelect resolves qualified identifiers or performs field selection typing.
   */
  private checkSelect(expr: Expr): void {
    const select = expr.asSelect();
    if (!select) {
      return;
    }
    const [qualifiers, found] = this.computeQualifiers(expr);
    if (found) {
      const ident = this.env.resolveQualifiedIdent(...qualifiers);
      if (ident) {
        const name = ident.requiresDisambiguation
          ? `.${ident.variableDecl.name()}`
          : ident.variableDecl.name();
        this.recordType(expr, ident.variableDecl.type());
        this.recordReference(expr, identReference(name, ident.variableDecl.value()));
        expr.setKindCase(this.factory.ident(expr.id(), name));
        return;
      }
    }

    let resultType = this.checkSelectField(expr, select.operand(), select.fieldName(), false);
    if (select.isTestOnly()) {
      resultType = BoolType;
    }
    this.recordType(expr, substitute(this.mappings, resultType, false));
  }

  /**
   * computeQualifiers computes the qualified-name parts of a select expression.
   */
  private computeQualifiers(expr: Expr): [string[], boolean] {
    const qualifiers: string[] = [];
    let current = expr;
    while (current.kind() === ExprKind.Select) {
      const select = current.asSelect();
      if (!select || select.isTestOnly()) {
        return [qualifiers, false];
      }
      qualifiers.push(select.fieldName());
      current = select.operand();
      if (current.kind() === ExprKind.Ident) {
        qualifiers.push(current.asIdent() ?? "");
        qualifiers.reverse();
        return [qualifiers, true];
      }
    }
    return [qualifiers, false];
  }

  /**
   * checkOptSelect validates the parser-packaged optional-select helper call.
   */
  private checkOptSelect(expr: Expr): void {
    const call = expr.asCall();
    if (!call) {
      return;
    }
    if (call.args().length !== 2 || call.isMemberFunction()) {
      const callType = call.isMemberFunction() ? " member call with" : "";
      this.errors.notAnOptionalFieldSelectionCall(
        expr.id(),
        this.location(expr),
        `incorrect signature.${callType} argument count: ${call.args().length}`,
      );
      return;
    }

    const operand = call.args()[0]!;
    const field = call.args()[1]!;
    const [fieldName, isString] = maybeUnwrapString(field);
    if (!isString) {
      this.errors.notAnOptionalFieldSelection(field.id(), this.location(field), field);
      return;
    }

    const resultType = this.checkSelectField(expr, operand, fieldName, true);
    this.recordType(expr, substitute(this.mappings, resultType, false));
    this.recordReference(expr, functionReference("select_optional_field"));
  }

  /**
   * checkSelectField performs field-selection typing for maps, objects, and optionals.
   */
  private checkSelectField(expr: Expr, operand: Expr, field: string, optional: boolean): Type {
    this.check(operand);
    const operandType = substitute(this.mappings, this.getType(operand), false);
    const [targetType, isOptionalTarget] = maybeUnwrapOptional(operandType);

    let resultType = ErrorType;
    switch (targetType.kind()) {
      case Kind.Map:
        resultType = targetType.parameters()[1] ?? DynType;
        break;
      case Kind.Struct: {
        const [fieldType, found] = this.lookupFieldType(expr.id(), targetType.typeName(), field);
        if (found && fieldType) {
          resultType = fieldType;
        }
        break;
      }
      case Kind.TypeParam:
        this.isAssignable(DynType, targetType);
        resultType = DynType;
        break;
      default:
        if (!isDynOrError(targetType)) {
          this.errors.typeDoesNotSupportFieldSelection(expr.id(), this.location(expr), targetType);
        }
        resultType = DynType;
        break;
    }

    return isOptionalTarget || optional ? optionalType(resultType) : resultType;
  }

  /**
   * checkCall performs function resolution and overload matching.
   */
  private checkCall(expr: Expr): void {
    const call = expr.asCall();
    if (!call) {
      return;
    }
    const fnName = call.functionName();
    if (fnName === "_?._") {
      this.checkOptSelect(expr);
      return;
    }

    const args = call.args();
    for (const arg of args) {
      this.check(arg);
    }

    if (!call.isMemberFunction()) {
      const fn = this.env.lookupFunction(fnName);
      if (!fn) {
        this.recordType(expr, ErrorType);
        this.errors.undeclaredReference(
          expr.id(),
          this.location(expr),
          this.env.container.name(),
          fnName,
        );
        return;
      }
      expr.setKindCase(this.factory.call(expr.id(), fn.name(), ...args));
      this.resolveOverloadOrError(expr, fn, undefined, args);
      return;
    }

    const target = call.target();
    const [qualifiedPrefix, maybeQualified] = toQualifiedName(target);
    if (maybeQualified) {
      const fn = this.env.lookupFunction(`${qualifiedPrefix}.${fnName}`);
      if (fn) {
        expr.setKindCase(this.factory.call(expr.id(), fn.name(), ...args));
        this.resolveOverloadOrError(expr, fn, undefined, args);
        return;
      }
    }

    this.check(target);
    const fn = this.env.lookupFunction(fnName);
    if (fn) {
      this.resolveOverloadOrError(expr, fn, target, args);
      return;
    }

    this.recordType(expr, ErrorType);
    this.errors.undeclaredReference(
      expr.id(),
      this.location(expr),
      this.env.container.name(),
      fnName,
    );
  }

  /**
   * resolveOverloadOrError records either the resolved overload metadata or a type error.
   */
  private resolveOverloadOrError(
    expr: Expr,
    fn: FunctionDecl,
    target: Expr | undefined,
    args: Expr[],
  ): void {
    const resolution = this.resolveOverload(expr, fn, target, args);
    if (!resolution) {
      this.recordType(expr, ErrorType);
      return;
    }
    this.recordType(expr, resolution.type);
    this.recordReference(expr, resolution.reference);
  }

  /**
   * resolveOverload ports cel-go's overload resolution over the local declaration model.
   */
  private resolveOverload(
    call: Expr,
    fn: FunctionDecl,
    target: Expr | undefined,
    args: Expr[],
  ): overloadResolution | undefined {
    const argTypes = target
      ? [this.getType(target), ...args.map((arg) => this.getType(arg))]
      : args.map((arg) => this.getType(arg));

    let resultType: Type | undefined;
    let checkedRef: ReferenceInfo | undefined;

    for (const overload of fn.overloadDecls()) {
      if (this.env.isOverloadDisabled(overload.id())) {
        continue;
      }
      if ((!target && overload.isMemberFunction()) || (target && !overload.isMemberFunction())) {
        continue;
      }

      if (fn.name() === "_&&_" || fn.name() === "_||_") {
        checkedRef = functionReference(overload.id());
        let hasError = false;
        for (const [index, argType] of argTypes.entries()) {
          const argExpr = target ? [target, ...args][index] : args[index];
          if (!this.isAssignable(argType, BoolType)) {
            this.errors.typeMismatch(
              argExpr?.id() ?? call.id(),
              this.locationById(argExpr?.id() ?? call.id()),
              BoolType,
              argType,
            );
            hasError = true;
          }
        }
        if (!hasError) {
          return { type: BoolType, reference: checkedRef };
        }
        return undefined;
      }

      let overloadType = functionType(overload.resultType(), ...overload.argTypes());
      if (overload.typeParams().length !== 0) {
        const substitutions = mappingValue();
        for (const typeParam of overload.typeParams()) {
          substitutions.add(typeParamType(typeParam), this.newTypeVar());
        }
        overloadType = substitute(substitutions, overloadType, false);
      }

      const candidateArgTypes = overloadType.parameters().slice(1);
      if (this.isAssignableList(argTypes, candidateArgTypes)) {
        if (!checkedRef) {
          checkedRef = functionReference(overload.id());
        } else {
          checkedRef.addOverload(overload.id());
        }
        const fnResultType = substitute(this.mappings, overloadType.parameters()[0]!, false);
        if (!resultType) {
          resultType = fnResultType;
        } else if (!isDyn(resultType) && !fnResultType.isExactType(resultType)) {
          resultType = DynType;
        }
      }
    }

    if (!resultType) {
      const actualArgTypes = argTypes.map((argType) => substitute(this.mappings, argType, true));
      this.errors.noMatchingOverload(
        call.id(),
        this.location(call),
        fn.name(),
        actualArgTypes,
        target !== undefined,
      );
      return undefined;
    }

    return { type: resultType, reference: checkedRef ?? functionReference() };
  }

  /**
   * checkCreateList assigns list element types by joining each checked element type.
   */
  private checkCreateList(expr: Expr): void {
    const list = expr.asList();
    if (!list) {
      return;
    }
    let elemsType: Type | undefined;
    const optionalIndices = new Set(list.optionalIndices());
    for (const [index, element] of list.elements().entries()) {
      this.check(element);
      let elementType = this.getType(element);
      if (optionalIndices.has(index)) {
        const [unwrapped, isOptionalValue] = maybeUnwrapOptional(elementType);
        elementType = unwrapped;
        if (!isOptionalValue && !isDyn(elementType)) {
          this.errors.typeMismatch(
            element.id(),
            this.location(element),
            optionalType(elementType),
            elementType,
          );
        }
      }
      elemsType = this.joinTypes(element, elemsType, elementType);
    }
    this.recordType(expr, listType(elemsType ?? this.newTypeVar()));
  }

  /**
   * checkCreateMap assigns map key and value types by joining each entry's key and value.
   */
  private checkCreateMap(expr: Expr): void {
    const mapExpr = expr.asMap();
    if (!mapExpr) {
      return;
    }
    let keyType: Type | undefined;
    let valueType: Type | undefined;
    for (const entryExpr of mapExpr.entries()) {
      if (entryExpr.kind() !== EntryExprKind.MapEntry) {
        continue;
      }
      const entry = entryExpr.asMapEntry()!;
      this.check(entry.key());
      keyType = this.joinTypes(entry.key(), keyType, this.getType(entry.key()));

      this.check(entry.value());
      let currentValueType = this.getType(entry.value());
      if (entry.isOptional()) {
        const [unwrapped, isOptionalValue] = maybeUnwrapOptional(currentValueType);
        currentValueType = unwrapped;
        if (!isOptionalValue && !isDyn(currentValueType)) {
          this.errors.typeMismatch(
            entry.value().id(),
            this.location(entry.value()),
            optionalType(currentValueType),
            currentValueType,
          );
        }
      }
      valueType = this.joinTypes(entry.value(), valueType, currentValueType);
    }
    this.recordType(expr, mapType(keyType ?? this.newTypeVar(), valueType ?? this.newTypeVar()));
  }

  /**
   * checkCreateStruct resolves the target message type and checks each field initializer.
   */
  private checkCreateStruct(expr: Expr): void {
    let struct = expr.asStruct();
    if (!struct) {
      return;
    }

    let resultType = ErrorType;
    const ident = this.env.resolveTypeIdent(struct.typeName());
    if (!ident) {
      this.recordType(expr, ErrorType);
      this.errors.undeclaredReference(
        expr.id(),
        this.location(expr),
        this.env.container.name(),
        struct.typeName(),
      );
      return;
    }

    let typeName = ident.name();
    if (struct.typeName() !== typeName) {
      expr.setKindCase(this.factory.struct(expr.id(), typeName, struct.fields()));
      struct = expr.asStruct();
      if (!struct) {
        return;
      }
    }
    this.recordReference(expr, identReference(typeName));

    if (ident.type().kind() === Kind.Type) {
      resultType = ident.type().parameters()[0] ?? ErrorType;
      if (resultType.kind() !== Kind.Struct) {
        if (isWellKnownMessageType(typeName, resultType)) {
          typeName = wellKnownMessageTypeName(typeName, resultType);
        } else {
          this.errors.notAMessageType(
            expr.id(),
            this.location(expr),
            resultType.declaredTypeName(),
          );
          resultType = ErrorType;
        }
      } else {
        typeName = resultType.declaredTypeName();
      }
    } else if (ident.type().kind() === Kind.Struct) {
      resultType = ident.type();
      typeName = resultType.declaredTypeName();
    } else {
      this.errors.notAType(expr.id(), this.location(expr), ident.type().declaredTypeName());
    }
    this.recordType(expr, resultType);

    for (const fieldExpr of struct.fields()) {
      if (fieldExpr.kind() !== EntryExprKind.StructField) {
        continue;
      }
      const field = fieldExpr.asStructField()!;
      const value = field.value();
      this.check(value);

      let fieldType = ErrorType;
      const fieldLocation = this.structFieldLocation(value);
      const [resolvedFieldType, found] = this.lookupFieldType(
        value.id(),
        typeName,
        field.name(),
        fieldLocation,
      );
      if (found && resolvedFieldType) {
        fieldType = resolvedFieldType;
      }

      let valueType = this.getType(value);
      if (field.isOptional()) {
        const [unwrapped, isOptionalValue] = maybeUnwrapOptional(valueType);
        valueType = unwrapped;
        if (!isOptionalValue && !isDyn(valueType)) {
          this.errors.typeMismatch(
            value.id(),
            this.location(value),
            optionalType(valueType),
            valueType,
          );
        }
      }
      if (!this.isAssignable(fieldType, valueType)) {
        this.errors.fieldTypeMismatch(
          value.id(),
          fieldLocation,
          field.name(),
          fieldType,
          valueType,
        );
      }
    }
  }

  /**
   * checkComprehension creates nested scopes for the accumulator and iteration variables.
   */
  private checkComprehension(expr: Expr): void {
    const comp = expr.asComprehension();
    if (!comp) {
      return;
    }
    this.check(comp.iterRange());
    this.check(comp.accuInit());
    const rangeType = substitute(this.mappings, this.getType(comp.iterRange()), false);
    const accuType = this.getType(comp.accuInit());

    this.env = this.env.enterScope();
    this.env.addIdents(variable(comp.accuVar(), accuType));

    let varType: Type;
    let var2Type: Type | undefined;
    switch (rangeType.kind()) {
      case Kind.List:
        varType = rangeType.parameters()[0] ?? DynType;
        if (comp.iterVar2() !== "") {
          var2Type = varType;
          varType = IntType;
        }
        break;
      case Kind.Map:
        varType = rangeType.parameters()[0] ?? DynType;
        if (comp.iterVar2() !== "") {
          var2Type = rangeType.parameters()[1] ?? DynType;
        }
        break;
      case Kind.Dyn:
      case Kind.Error:
      case Kind.TypeParam:
        this.isAssignable(DynType, rangeType);
        varType = DynType;
        if (comp.iterVar2() !== "") {
          var2Type = DynType;
        }
        break;
      default:
        this.errors.notAComprehensionRange(
          comp.iterRange().id(),
          this.location(comp.iterRange()),
          rangeType,
        );
        varType = ErrorType;
        if (comp.iterVar2() !== "") {
          var2Type = ErrorType;
        }
        break;
    }

    this.env = this.env.enterScope();
    this.env.addIdents(variable(comp.iterVar(), varType));
    if (comp.iterVar2() !== "" && var2Type) {
      this.env.addIdents(variable(comp.iterVar2(), var2Type));
    }

    this.check(comp.loopCondition());
    this.assertType(comp.loopCondition(), BoolType);
    this.check(comp.loopStep());
    this.assertType(comp.loopStep(), accuType);

    this.env = this.env.exitScope();
    this.check(comp.result());
    this.env = this.env.exitScope();
    this.recordType(expr, substitute(this.mappings, this.getType(comp.result()), false));
  }

  /**
   * joinTypes checks compatibility of joined types and returns the most general common type.
   */
  private joinTypes(expr: Expr, previous: Type | undefined, current: Type): Type {
    if (!previous) {
      return current;
    }
    if (this.isAssignable(previous, current)) {
      return mostGeneral(previous, current);
    }
    if (this.env.aggLitElemType === 0) {
      return DynType;
    }
    this.errors.typeMismatch(expr.id(), this.location(expr), previous, current);
    return ErrorType;
  }

  /**
   * newTypeVar allocates a fresh type parameter for inference.
   */
  private newTypeVar(): Type {
    const id = this.freeTypeVarCounter;
    this.freeTypeVarCounter += 1;
    return typeParamType(`_var${id}`);
  }

  /**
   * isAssignable updates the checker substitution mapping when the assignment succeeds.
   */
  private isAssignable(left: Type, right: Type): boolean {
    const substitutions = checkAssignable(this.mappings, left, right);
    if (!substitutions) {
      return false;
    }
    this.mappings = substitutions;
    return true;
  }

  /**
   * isAssignableList updates the checker substitution mapping when every element assignment succeeds.
   */
  private isAssignableList(left: Type[], right: Type[]): boolean {
    const substitutions = checkAssignableList(this.mappings, left, right);
    if (!substitutions) {
      return false;
    }
    this.mappings = substitutions;
    return true;
  }

  /**
   * recordType stores runtime type metadata in the checked AST.
   */
  private recordType(expr: Expr, type: Type): void {
    const current = this.types.get(expr.id());
    if (current) {
      if (!current.isExactType(type) && !current.isEquivalentType(type)) {
        this.errors.incompatibleType(expr.id(), this.location(expr), expr, current, type);
        return;
      }
    }
    this.types.set(expr.id(), type);
  }

  /**
   * getType returns the runtime CEL type associated with an expression id.
   */
  private getType(expr: Expr): Type {
    return this.types.get(expr.id()) ?? DynType;
  }

  /**
   * finalizeTypes substitutes remaining type parameters and serializes native checker types into
   * the protobuf-backed checked AST exactly once.
   */
  public finalizeTypes(): void {
    for (const [id, checkedType] of this.types) {
      this.ast.setType(id, typeToExprType(substitute(this.mappings, checkedType, true)));
    }
  }

  /**
   * recordReference stores reference metadata in the checked AST.
   */
  private recordReference(expr: Expr, reference: ReferenceInfo): void {
    const current = this.ast.referenceMap().get(expr.id());
    if (current && !current.equals(reference)) {
      this.errors.referenceRedefinition(expr.id(), this.location(expr), expr, current, reference);
      return;
    }
    this.ast.setReference(expr.id(), reference);
  }

  /**
   * assertType reports a mismatch when the expression is not assignable to the expected type.
   */
  private assertType(expr: Expr, type: Type): void {
    if (!this.isAssignable(type, this.getType(expr))) {
      this.errors.typeMismatch(expr.id(), this.location(expr), type, this.getType(expr));
    }
  }

  /**
   * location returns the source start location for an expression.
   */
  private location(expr: Expr) {
    return this.locationById(expr.id());
  }

  /**
   * locationById returns the source start location associated with an expression id.
   */
  private locationById(id: number) {
    return this.ast.sourceInfo().getStartLocation(id);
  }

  /**
   * structFieldLocation matches cel-go's struct-field error anchoring.
   *
   * The local AST records field-value ids at the value token, so shift back to the
   * field entry anchor used by cel-go diagnostics.
   */
  private structFieldLocation(value: Expr) {
    const location = this.location(value);
    return new SourceLocation(location.line(), Math.max(0, location.column() - 2));
  }

  /**
   * lookupFieldType resolves a message field type or reports a checker resolution error.
   */
  private lookupFieldType(
    id: number,
    structType: string,
    fieldName: string,
    locationOverride = this.locationById(id),
  ): [Type | undefined, boolean] {
    if (this.env.provider.findStructType(structType) === undefined) {
      this.errors.unexpectedFailedResolution(id, locationOverride, structType);
      return [undefined, false];
    }
    const fieldType = this.env.provider.findStructFieldType(structType, fieldName);
    if (fieldType) {
      if (this.env.jsonFieldNames && !fieldType.isJSONField) {
        this.errors.undefinedField(id, locationOverride, fieldName);
      }
      return [fieldType.type, true];
    }
    this.errors.undefinedField(id, locationOverride, fieldName);
    return [undefined, false];
  }
}

type overloadResolution = {
  type: Type;
  reference: ReferenceInfo;
};

/**
 * CheckResult contains the checked AST and optional diagnostics produced during checking.
 */
export interface CheckResult {
  ast: AST;
  errors?: Errors;
}

/**
 * check performs type checking and returns a checked AST plus diagnostics.
 *
 * Diagnostics accompany the AST rather than being thrown, matching the parser and the environment
 * frontend: a type error in a user-supplied expression is an expected result.
 */
export function check(parsed: AST, source: Source, env: Env): CheckResult {
  const c = new checker(parsed, source, env);
  c.check(parsed.expr());

  c.finalizeTypes();
  c.ast.clearUnusedIds();
  if (env.jsonFieldNames) {
    c.ast.sourceInfo().addExtension(jsonNameExtension);
  }
  if (c.errors.errs.getErrors().length === 0) {
    return { ast: c.ast };
  }
  return { ast: c.ast, errors: c.errors.errs };
}

/**
 * functionType constructs the local runtime representation of a checker function type.
 */
function functionType(resultType: Type, ...argTypes: Type[]): Type {
  return opaqueType("function", resultType, ...argTypes);
}

/**
 * maybeUnwrapString extracts a literal string value when present.
 */
function maybeUnwrapString(expr: Expr): [string, boolean] {
  return expr.kind() === ExprKind.Literal && typeof expr.asLiteral() === "string"
    ? [expr.asLiteral() as string, true]
    : ["", false];
}

/**
 * isUintLiteral reports whether the constant originated from CEL's uint literal syntax.
 */
function isUintLiteral(literal: unknown): literal is { constantKind: { case: "uint64Value" } } {
  return (
    typeof literal === "object" &&
    literal !== null &&
    "constantKind" in literal &&
    typeof (literal as { constantKind?: unknown }).constantKind === "object" &&
    (literal as { constantKind?: { case?: string } }).constantKind?.case === "uint64Value"
  );
}

/**
 * isWellKnownMessageType preserves cel-go's protobuf well-known construction compatibility.
 */
function isWellKnownMessageType(typeName: string, resultType: Type): boolean {
  if (!typeName.startsWith("google.protobuf.")) {
    return false;
  }
  switch (resultType.kind()) {
    case Kind.Any:
    case Kind.Duration:
    case Kind.Dyn:
    case Kind.NullType:
    case Kind.Timestamp:
      return true;
    case Kind.Bool:
    case Kind.Bytes:
    case Kind.Double:
    case Kind.Int:
    case Kind.String:
    case Kind.Uint:
      return resultType.isAssignableType(NullType);
    case Kind.List:
      return resultType.parameters()[0] === DynType;
    case Kind.Map:
      return resultType.parameters()[0] === StringType && resultType.parameters()[1] === DynType;
    default:
      return false;
  }
}

/**
 * wellKnownMessageTypeName computes the field-lookup name for protobuf well-known constructions.
 */
function wellKnownMessageTypeName(typeName: string, resultType: Type): string {
  switch (resultType.kind()) {
    case Kind.Any:
      return "google.protobuf.Any";
    case Kind.Bool:
      return "google.protobuf.BoolValue";
    case Kind.Bytes:
      return "google.protobuf.BytesValue";
    case Kind.Double:
      return "google.protobuf.DoubleValue";
    case Kind.Duration:
      return "google.protobuf.Duration";
    case Kind.Dyn:
      return "google.protobuf.Value";
    case Kind.Int:
      return "google.protobuf.Int64Value";
    case Kind.List:
      return "google.protobuf.ListValue";
    case Kind.Map:
      return "google.protobuf.Struct";
    case Kind.NullType:
      return "google.protobuf.NullValue";
    case Kind.String:
      return "google.protobuf.StringValue";
    case Kind.Timestamp:
      return "google.protobuf.Timestamp";
    case Kind.Uint:
      return "google.protobuf.UInt64Value";
    default:
      return typeName;
  }
}
