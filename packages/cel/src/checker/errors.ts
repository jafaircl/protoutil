import type { Expr } from "../common/ast/index.js";
import type { Errors } from "../common/errors.js";
import type { Location } from "../common/location.js";
import type { Type } from "../common/types/types.js";
import { formatCELType, formatFunctionDeclType } from "./format.js";

/**
 * typeErrors provides checker-specific diagnostic formatting.
 */
export class typeErrors {
  constructor(public readonly errs: Errors) {}

  /**
   * fieldTypeMismatch reports an incompatible message field initializer type.
   */
  public fieldTypeMismatch(
    id: number,
    location: Location,
    name: string,
    field: Type,
    value: Type,
  ): void {
    this.errs.reportErrorAtId(
      id,
      location,
      "expected type of field '%s' is '%s' but provided type is '%s'",
      name,
      formatCELType(field),
      formatCELType(value),
    );
  }

  /**
   * incompatibleType reports conflicting type assignments for the same expression id.
   */
  public incompatibleType(
    id: number,
    location: Location,
    expr: Expr,
    previous: Type,
    next: Type,
  ): void {
    this.errs.reportErrorAtId(
      id,
      location,
      "incompatible type already exists for expression: %s(%s) old:%s, new:%s",
      String(expr),
      expr.id(),
      formatCELType(previous),
      formatCELType(next),
    );
  }

  /**
   * noMatchingOverload reports a failed overload resolution.
   */
  public noMatchingOverload(
    id: number,
    location: Location,
    name: string,
    args: Type[],
    isInstance: boolean,
  ): void {
    this.errs.reportErrorAtId(
      id,
      location,
      "found no matching overload for '%s' applied to '%s'",
      name,
      formatFunctionDeclType(undefined, args, isInstance),
    );
  }

  /**
   * notAComprehensionRange reports an invalid comprehension range type.
   */
  public notAComprehensionRange(id: number, location: Location, type: Type): void {
    this.errs.reportErrorAtId(
      id,
      location,
      "expression of type '%s' cannot be range of a comprehension (must be list, map, or dynamic)",
      formatCELType(type),
    );
  }

  /**
   * notAnOptionalFieldSelectionCall reports an invalid optional-select helper invocation.
   */
  public notAnOptionalFieldSelectionCall(id: number, location: Location, err: string): void {
    this.errs.reportErrorAtId(id, location, "unsupported optional field selection: %s", err);
  }

  /**
   * notAnOptionalFieldSelection reports an invalid optional-select field operand.
   */
  public notAnOptionalFieldSelection(id: number, location: Location, field: Expr): void {
    this.errs.reportErrorAtId(id, location, "unsupported optional field selection: %s", field);
  }

  /**
   * notAType reports a resolved identifier that does not refer to a CEL type.
   */
  public notAType(id: number, location: Location, typeName: string): void {
    this.errs.reportErrorAtId(id, location, "'%s' is not a type", typeName);
  }

  /**
   * notAMessageType reports a resolved type that cannot be instantiated as a message literal.
   */
  public notAMessageType(id: number, location: Location, typeName: string): void {
    this.errs.reportErrorAtId(id, location, "'%s' is not a message type", typeName);
  }

  /**
   * referenceRedefinition reports conflicting reference metadata for the same expression id.
   */
  public referenceRedefinition(
    id: number,
    location: Location,
    expr: Expr,
    previous: { name: string; overloadIds: string[] },
    next: { name: string; overloadIds: string[] },
  ): void {
    this.errs.reportErrorAtId(
      id,
      location,
      "reference already exists for expression: %s(%s) old:%s, new:%s",
      String(expr),
      expr.id(),
      JSON.stringify(previous),
      JSON.stringify(next),
    );
  }

  /**
   * typeDoesNotSupportFieldSelection reports an unsupported field selection target.
   */
  public typeDoesNotSupportFieldSelection(id: number, location: Location, type: Type): void {
    this.errs.reportErrorAtId(
      id,
      location,
      "type '%s' does not support field selection",
      formatCELType(type),
    );
  }

  /**
   * typeMismatch reports a mismatch between expected and actual types.
   */
  public typeMismatch(id: number, location: Location, expected: Type, actual: Type): void {
    this.errs.reportErrorAtId(
      id,
      location,
      "expected type '%s' but found '%s'",
      formatCELType(expected),
      formatCELType(actual),
    );
  }

  /**
   * undefinedField reports an unknown message field name.
   */
  public undefinedField(id: number, location: Location, field: string): void {
    this.errs.reportErrorAtId(id, location, "undefined field '%s'", field);
  }

  /**
   * undeclaredReference reports an unknown identifier.
   */
  public undeclaredReference(
    id: number,
    location: Location,
    container: string,
    name: string,
  ): void {
    this.errs.reportErrorAtId(
      id,
      location,
      "undeclared reference to '%s' (in container '%s')",
      name,
      container,
    );
  }

  /**
   * unexpectedFailedResolution reports an impossible provider resolution failure.
   */
  public unexpectedFailedResolution(id: number, location: Location, typeName: string): void {
    this.errs.reportErrorAtId(id, location, "unexpected failed resolution of '%s'", typeName);
  }

  /**
   * unexpectedASTType reports an invalid AST shape for the current checker step.
   */
  public unexpectedASTType(id: number, location: Location, kind: string, typeName: string): void {
    this.errs.reportErrorAtId(id, location, "unexpected %s type: %s", kind, typeName);
  }
}
