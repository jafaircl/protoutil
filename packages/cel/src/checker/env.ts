import type { Container } from "../common/containers.js";
import { constant, type FunctionDecl, type VariableDecl, variable } from "../common/decls.js";
import * as overloads from "../common/overloads.js";
import { IntType } from "../common/types/index.js";
import type { Registry } from "../common/types/provider.js";
import type { Type } from "../common/types/types.js";
import { typeTypeWithParam } from "../common/types/types.js";
import { AllMacros } from "../parser/macro.js";
import type { CheckerOptions } from "./options.js";
import { type Scopes, scopes } from "./scopes.js";

const DYN_ELEMENT_TYPE = 0;
const HOMOGENOUS_ELEMENT_TYPE = 2;

const crossTypeNumericComparisonOverloads = new Set<string>([
  overloads.LessDoubleInt64,
  overloads.LessDoubleUint64,
  overloads.LessEqualsDoubleInt64,
  overloads.LessEqualsDoubleUint64,
  overloads.GreaterDoubleInt64,
  overloads.GreaterDoubleUint64,
  overloads.GreaterEqualsDoubleInt64,
  overloads.GreaterEqualsDoubleUint64,
  overloads.LessInt64Double,
  overloads.LessInt64Uint64,
  overloads.LessEqualsInt64Double,
  overloads.LessEqualsInt64Uint64,
  overloads.GreaterInt64Double,
  overloads.GreaterInt64Uint64,
  overloads.GreaterEqualsInt64Double,
  overloads.GreaterEqualsInt64Uint64,
  overloads.LessUint64Double,
  overloads.LessUint64Int64,
  overloads.LessEqualsUint64Double,
  overloads.LessEqualsUint64Int64,
  overloads.GreaterUint64Double,
  overloads.GreaterUint64Int64,
  overloads.GreaterEqualsUint64Double,
  overloads.GreaterEqualsUint64Int64,
]);

/**
 * attributeResolution records a resolved identifier plus whether dot disambiguation is required.
 */
export class attributeResolution {
  constructor(
    public readonly variableDecl: VariableDecl,
    public readonly requiresDisambiguation: boolean,
  ) {}
}

/**
 * Env is the declaration and type environment used by the checker.
 */
export class Env {
  public readonly declarations: Scopes;
  public readonly aggLitElemType: number;
  public readonly filteredOverloadIds: Set<string>;
  public readonly jsonFieldNames: boolean;

  constructor(
    public readonly container: Container,
    public readonly provider: Registry,
    options: CheckerOptions = {},
    declarations: Scopes = options.validatedDeclarations?.copy() ?? scopes(),
  ) {
    this.declarations = declarations;
    this.aggLitElemType = options.homogeneousAggregateLiterals
      ? HOMOGENOUS_ELEMENT_TYPE
      : DYN_ELEMENT_TYPE;
    this.filteredOverloadIds = options.crossTypeNumericComparisons
      ? new Set()
      : new Set(crossTypeNumericComparisonOverloads);
    this.jsonFieldNames = options.jsonFieldNames ?? false;
  }

  /**
   * addIdents adds variable declarations into the current scope.
   */
  public addIdents(...declarations: VariableDecl[]): void {
    const errors: string[] = [];
    for (const declaration of declarations) {
      const err = this.addIdent(declaration);
      if (err) {
        errors.push(err);
      }
    }
    if (errors.length !== 0) {
      throw new Error(errors.join("\n"));
    }
  }

  /**
   * addFunctions adds function declarations into the current scope.
   */
  public addFunctions(...declarations: FunctionDecl[]): void {
    const errors: string[] = [];
    for (const declaration of declarations) {
      errors.push(...this.setFunction(declaration));
    }
    const filtered = errors.filter((error) => error.length !== 0);
    if (filtered.length !== 0) {
      throw new Error(filtered.join("\n"));
    }
  }

  /**
   * resolveSimpleIdent resolves an unqualified identifier against local and container scopes.
   */
  public resolveSimpleIdent(name: string): attributeResolution | undefined {
    const local = this.lookupLocalIdent(name);
    if (local && !name.startsWith(".")) {
      return new attributeResolution(local, false);
    }
    for (const candidate of this.container.resolveCandidateNames(name)) {
      const ident = this.lookupGlobalIdent(candidate);
      if (ident) {
        return new attributeResolution(ident, local !== undefined);
      }
    }
    return undefined;
  }

  /**
   * resolveQualifiedIdent resolves a select-chain as a qualified identifier when possible.
   */
  public resolveQualifiedIdent(...qualifiers: string[]): attributeResolution | undefined {
    if (qualifiers.length === 1) {
      return this.resolveSimpleIdent(qualifiers[0]!);
    }
    const local = this.lookupLocalIdent(qualifiers[0]!);
    if (local && !qualifiers[0]!.startsWith(".")) {
      return undefined;
    }
    const variableName = qualifiers.join(".");
    for (const candidate of this.container.resolveCandidateNames(variableName)) {
      const ident = this.lookupGlobalIdent(candidate);
      if (ident) {
        return new attributeResolution(ident, local !== undefined);
      }
    }
    return undefined;
  }

  /**
   * resolveTypeIdent resolves a type name as an identifier-like declaration.
   */
  public resolveTypeIdent(name: string): VariableDecl | undefined {
    for (const candidate of this.container.resolveCandidateNames(name)) {
      const ident = this.provider.findIdent(candidate);
      if (ident && typeof ident === "object" && "kind" in ident) {
        return variable(candidate, typeTypeWithParam(ident as Type));
      }
      const structType = this.provider.findStructType(candidate);
      if (structType) {
        return variable(candidate, structType);
      }
    }
    return undefined;
  }

  /**
   * lookupFunction finds a function by container resolution order.
   */
  public lookupFunction(name: string): FunctionDecl | undefined {
    for (const candidate of this.container.resolveCandidateNames(name)) {
      const fn = this.declarations.findFunction(candidate);
      if (fn) {
        return fn;
      }
    }
    return undefined;
  }

  /**
   * isOverloadDisabled reports whether an overload is filtered by environment policy.
   */
  public isOverloadDisabled(overloadId: string): boolean {
    return this.filteredOverloadIds.has(overloadId);
  }

  /**
   * validatedDeclarations returns the declaration stack for reuse in a new environment.
   */
  public validatedDeclarations(): Scopes {
    return this.declarations;
  }

  /**
   * enterScope creates a child environment with a fresh innermost scope.
   */
  public enterScope(): Env {
    return new Env(
      this.container,
      this.provider,
      {
        crossTypeNumericComparisons: this.filteredOverloadIds.size === 0,
        homogeneousAggregateLiterals: this.aggLitElemType === HOMOGENOUS_ELEMENT_TYPE,
        jsonFieldNames: this.jsonFieldNames,
      },
      this.declarations.push(),
    );
  }

  /**
   * exitScope restores the parent declaration scope.
   */
  public exitScope(): Env {
    return new Env(
      this.container,
      this.provider,
      {
        crossTypeNumericComparisons: this.filteredOverloadIds.size === 0,
        homogeneousAggregateLiterals: this.aggLitElemType === HOMOGENOUS_ELEMENT_TYPE,
        jsonFieldNames: this.jsonFieldNames,
      },
      this.declarations.pop(),
    );
  }

  private lookupLocalIdent(candidate: string): VariableDecl | undefined {
    return this.declarations.findLocalIdent(candidate);
  }

  private lookupGlobalIdent(candidate: string): VariableDecl | undefined {
    const ident = this.declarations.findGlobalIdent(candidate);
    if (ident) {
      return ident;
    }
    const foundIdent = this.provider.findIdent(candidate);
    if (foundIdent && typeof foundIdent === "object" && "kind" in foundIdent) {
      return variable(candidate, typeTypeWithParam(foundIdent as Type));
    }
    const structType = this.provider.findStructType(candidate);
    if (structType) {
      return variable(candidate, structType);
    }
    const enumValue = this.provider.findEnumValue(candidate);
    if (enumValue !== undefined) {
      return constant(
        candidate,
        "kind" in (enumValue.type() as object) ? (enumValue.type() as Type) : IntType,
        enumValue,
      );
    }
    return undefined;
  }

  private setFunction(fn: FunctionDecl): string[] {
    let current = this.declarations.findFunction(fn.name());
    try {
      current = current ? current.merge(fn) : fn;
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
    for (const overload of current.overloadDecls()) {
      for (const macro of AllMacros) {
        if (
          macro.function === current.name() &&
          macro.receiverStyle === overload.isMemberFunction() &&
          macro.argCount === overload.argTypes().length
        ) {
          return [
            `overlapping macro for name '${current.name()}' with ${overload.argTypes().length} args`,
          ];
        }
      }
    }
    this.declarations.setFunction(current);
    return [];
  }

  private addIdent(decl: VariableDecl): string {
    const current = this.declarations.findIdentInScope(decl.name());
    if (!current) {
      this.declarations.addIdent(decl);
      return "";
    }
    if (current.declarationIsEquivalent(decl)) {
      const incomingValue = decl.value();
      const currentValue = current.value();
      if (incomingValue !== undefined) {
        if (currentValue === undefined) {
          // A constant declaration refines an otherwise equivalent variable declaration.
          this.declarations.addIdent(decl);
          return "";
        }
        const equal = currentValue.equal(incomingValue).value();
        if (equal !== true) {
          return `conflicting constant definitions for name '${decl.name()}'`;
        }
      }
      this.declarations.addIdent(current);
      return "";
    }
    return `overlapping identifier for name '${decl.name()}'`;
  }
}

/**
 * env creates a checker environment.
 */
export function env(container: Container, provider: Registry, options: CheckerOptions = {}): Env {
  return new Env(container, provider, options);
}
