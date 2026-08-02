import * as checkerDecls from "../checker/decls.js";
import type { Decl, Decl_FunctionDecl_Overload } from "../gen/cel/expr/checked_pb.js";
import {
  type Doc,
  exampleDoc,
  functionDoc,
  multilineDescription,
  overloadDoc,
  parseDescriptions,
  variableDoc,
} from "./doc.js";
import type {
  AsyncOp,
  BinaryOp,
  FunctionOp,
  Overload as RuntimeOverload,
  UnaryOp,
} from "./functions.js";
import * as operators from "./operators.js";
import { isError, err as newErr } from "./types/err.js";
import type { Val } from "./types/ref/reference.js";
import { Kind, type Type, typeToExprType, typeTypeWithParam } from "./types/types.js";
import { isUnknown, mergeUnknowns, type Unknown } from "./types/unknown.js";

type DeclarationState = "unset" | "disabled" | "enabled";

/**
 * FunctionSubsetter subsets a function declaration or returns undefined when the subset would be empty.
 */
export type FunctionSubsetter = (fn: FunctionDecl) => [FunctionDecl | undefined, boolean];

/**
 * OverloadSelector selects an overload associated with a given function.
 */
export type OverloadSelector = (overload: OverloadDecl) => boolean;

/**
 * SingletonBinding configures a singleton function definition to be used for all function overloads.
 */
export interface SingletonBinding {
  /** async provides one asynchronous implementation for every overload. */
  async?: AsyncOp;
  unary?: UnaryOp;
  binary?: BinaryOp;
  func?: FunctionOp;
  trait?: number;
}

/**
 * FunctionDeclOptions configure a FunctionDecl using plain option objects.
 */
export interface FunctionDeclOptions {
  name?: string;
  doc?: string | string[];
  disableTypeGuards?: boolean;
  disableDeclaration?: boolean;
  singletonBinding?: SingletonBinding;
  overloads?: OverloadDecl[];
}

/**
 * OverloadDeclOptions configure an OverloadDecl using plain option objects.
 */
export interface OverloadDeclOptions {
  id?: string;
  argTypes?: Type[];
  resultType?: Type;
  memberFunction?: boolean;
  doc?: string | string[];
  unaryBinding?: UnaryOp;
  binaryBinding?: BinaryOp;
  functionBinding?: FunctionOp;
  /** asyncBinding provides a promise-returning implementation resolved by concurrent evaluation. */
  asyncBinding?: AsyncOp;
  lateBinding?: boolean;
  nonStrict?: boolean;
  operandTrait?: number;
}

/**
 * FunctionDecl defines a function name, overload set, and optionally a singleton definition for all overload instances.
 */
export class FunctionDecl {
  // overloads associated with the function name.
  private readonly overloads = new Map<string, OverloadDecl>();

  // overloadOrdinals indicates the order in which the overload was declared.
  private readonly overloadOrdinals: string[] = [];

  // singleton implementation of the function for all overloads.
  //
  // If this option is set, an error will occur if any overloads specify a per-overload implementation
  // or if another function with the same name attempts to redefine the singleton.
  private singleton?: RuntimeOverload;

  // disableTypeGuards is a performance optimization to disable detailed runtime type checks which could
  // add overhead on common operations. Setting this option true leaves error checks and argument checks
  // intact.
  private disableTypeGuardsValue = false;

  // state indicates that the binding should be provided as a declaration, as a runtime binding, or both.
  private state: DeclarationState = "unset";
  private docValue = "";

  /** Constructor accepts the function name and plain TypeScript option-object configuration. */
  constructor(
    private readonly nameValue: string,
    options: FunctionDeclOptions = {},
  ) {
    if (options.doc !== undefined) {
      this.docValue =
        typeof options.doc === "string" ? options.doc : multilineDescription(...options.doc);
    }
    if (options.disableTypeGuards !== undefined) {
      this.disableTypeGuardsValue = options.disableTypeGuards;
    }
    if (options.disableDeclaration !== undefined) {
      this.state = options.disableDeclaration ? "disabled" : "enabled";
    }
    if (options.singletonBinding) {
      this.singleton = runtimeSingletonOverload(this.name(), options.singletonBinding);
    }
    for (const overloadDecl of options.overloads ?? []) {
      this.addOverload(overloadDecl);
    }
  }

  /** Documentation generates documentation about the Function and its overloads as a common.Doc object. */
  public documentation(): Doc {
    const children = this.overloadDecls().map((overload) =>
      overloadDoc(
        overload.id(),
        formatSignature(this.name(), overload),
        ...overload.examples().map((example) => exampleDoc(example)),
      ),
    );
    return functionDoc(this.name(), this.description(), ...children);
  }

  /** Name returns the function name in human-readable terms, e.g. 'contains' of 'math.least' */
  public name(): string {
    return this.nameValue;
  }

  /**
   * Description provides an overview of the function's purpose.
   *
   * Usage examples should be included on specific overloads.
   */
  public description(): string {
    return this.docValue;
  }

  /** IsDeclarationDisabled indicates that the function declaration should not be exposed for expressions. */
  public isDeclarationDisabled(): boolean {
    return this.state === "disabled";
  }

  /**
   * Merge combines an existing function declaration with another.
   *
   * If a function is extended, by say adding new overloads to an existing function, then it is merged with the
   * prior definition of the function at which point its overloads must not collide with pre-existing overloads
   * and its bindings (singleton, or per-overload) must not conflict with previous definitions either.
   */
  public merge(other: FunctionDecl): FunctionDecl {
    if (this === other) {
      return this;
    }
    if (this.name() !== other.name()) {
      throw new Error(`cannot merge unrelated functions. "${this.name()}" and "${other.name()}"`);
    }
    const merged = new FunctionDecl(this.name());
    merged.singleton = this.singleton;
    merged.disableTypeGuardsValue = this.disableTypeGuardsValue && other.disableTypeGuardsValue;
    merged.state = this.state;
    merged.docValue = this.docValue;
    if (other.state !== "unset") {
      merged.state = other.state;
    }
    if (other.docValue.length !== 0 && other.docValue !== this.docValue) {
      merged.docValue = other.docValue;
    }
    for (const overloadId of this.overloadOrdinals) {
      merged.overloadOrdinals.push(overloadId);
      merged.overloads.set(overloadId, this.overloads.get(overloadId)!);
    }
    for (const overloadId of other.overloadOrdinals) {
      try {
        merged.addOverload(other.overloads.get(overloadId)!);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`function declaration merge failed: ${message}`);
      }
    }
    if (other.singleton) {
      if (
        merged.singleton &&
        !singletonBindingsEqual(merged.singleton, other.singleton) &&
        !sameSingletonOverloadSet(this, other)
      ) {
        throw new Error(`function already has a singleton binding: ${this.name()}`);
      }
      merged.singleton = other.singleton;
    }
    return merged;
  }

  /**
   * Subset returns a new function declaration which contains only the overloads with the specified IDs.
   * If the subset function contains no overloads, then undefined is returned to indicate the function is not
   * functional.
   */
  public subset(selector: OverloadSelector): FunctionDecl | undefined {
    const subset = new FunctionDecl(this.name());
    subset.docValue = this.docValue;
    subset.singleton = this.singleton;
    subset.disableTypeGuardsValue = this.disableTypeGuardsValue;
    subset.state = this.state;
    for (const overloadId of this.overloadOrdinals) {
      const overload = this.overloads.get(overloadId)!;
      if (!selector(overload)) {
        continue;
      }
      subset.overloadOrdinals.push(overloadId);
      subset.overloads.set(overloadId, overload);
    }
    return subset.overloads.size === 0 ? undefined : subset;
  }

  /**
   * AddOverload ensures that the new overload does not collide with an existing overload signature;
   * however, if the function signatures are identical, the implementation may be rewritten as its
   * difficult to compare functions by object identity.
   */
  public addOverload(overload: OverloadDecl): void {
    for (const [overloadId, existing] of this.overloads) {
      if (overloadId !== overload.id() && existing.signatureOverlaps(overload)) {
        throw new Error(
          `overload signature collision in function ${this.name()}: ${overloadId} collides with ${overload.id()}`,
        );
      }
      if (overloadId === overload.id()) {
        if (
          existing.signatureEquals(overload) &&
          existing.isNonStrict() === overload.isNonStrict()
        ) {
          if (overload.hasBinding()) {
            this.overloads.set(overloadId, overload);
          }
          if (overload.doc().length !== 0 && existing.doc() !== overload.doc()) {
            existing.setDoc(overload.doc());
          }
          return;
        }
        throw new Error(
          `overload redefinition in function. ${this.name()}: ${overloadId} has multiple definitions`,
        );
      }
      if (overload.hasLateBinding() !== existing.hasLateBinding()) {
        throw new Error(
          `overload with late binding cannot be added to function ${this.name()}: cannot mix late and non-late bindings`,
        );
      }
    }
    this.overloadOrdinals.push(overload.id());
    this.overloads.set(overload.id(), overload);
  }

  /** OverloadDecls returns the overload declarations in declaration order. */
  public overloadDecls(): OverloadDecl[] {
    return this.overloadOrdinals.map((overloadId) => this.overloads.get(overloadId)!);
  }

  /** HasSingletonBinding indicates whether the function has a singleton binding definition. */
  public hasSingletonBinding(): boolean {
    return this.singleton !== undefined;
  }

  /** HasLateBinding returns true if the function has late bindings. A function cannot mix late bindings with other bindings. */
  public hasLateBinding(): boolean {
    return (
      this.singleton?.async !== undefined ||
      this.overloadOrdinals.some((overloadId) => this.overloads.get(overloadId)!.hasLateBinding())
    );
  }

  /** Bindings produces a set of function bindings, if any are defined. */
  public bindings(): RuntimeOverload[] {
    let nonStrict = false;
    let hasLateBinding = false;
    const overloads: RuntimeOverload[] = [];
    for (const overloadId of this.overloadOrdinals) {
      const overload = this.overloads.get(overloadId)!;
      hasLateBinding = hasLateBinding || overload.hasLateBinding();
      if (!overload.hasBinding()) {
        continue;
      }
      overloads.push({
        operator: overload.id(),
        unary: overload.guardedUnaryOp(this.name(), this.disableTypeGuardsValue),
        binary: overload.guardedBinaryOp(this.name(), this.disableTypeGuardsValue),
        func: overload.guardedFunctionOp(this.name(), this.disableTypeGuardsValue),
        async: overload.guardedAsyncOp(this.name(), this.disableTypeGuardsValue),
        operandTrait: overload.operandTrait(),
        nonStrict: overload.isNonStrict(),
      });
      nonStrict = nonStrict || overload.isNonStrict();
    }
    if (this.singleton) {
      if (overloads.length !== 0) {
        throw new Error(
          `singleton function incompatible with specialized overloads: ${this.name()}`,
        );
      }
      if (hasLateBinding) {
        throw new Error(`singleton function incompatible with late bindings: ${this.name()}`);
      }
      overloads.push({
        operator: this.name(),
        unary: this.singleton.unary,
        binary: this.singleton.binary,
        func: this.singleton.func,
        async: this.singleton.async,
        operandTrait: this.singleton.operandTrait,
        nonStrict: this.singleton.nonStrict,
      });
    }
    if (overloads.length <= 1) {
      if (overloads.length === 1 && overloads[0]!.operator !== this.name()) {
        overloads.push({
          operator: this.name(),
          unary: overloads[0]!.unary,
          binary: overloads[0]!.binary,
          func: overloads[0]!.func,
          async: overloads[0]!.async,
          operandTrait: overloads[0]!.operandTrait,
          nonStrict: overloads[0]!.nonStrict,
        });
      }
      return overloads;
    }
    const func: FunctionOp = (...args) => {
      for (const overloadId of this.overloadOrdinals) {
        const overload = this.overloads.get(overloadId)!;
        switch (args.length) {
          case 1:
            if (
              overload.unaryOpValue() &&
              overload.matchesRuntimeSignature(this.disableTypeGuardsValue, ...args)
            ) {
              return overload.unaryOpValue()!(args[0]!);
            }
            break;
          case 2:
            if (
              overload.binaryOpValue() &&
              overload.matchesRuntimeSignature(this.disableTypeGuardsValue, ...args)
            ) {
              return overload.binaryOpValue()!(args[0]!, args[1]!);
            }
            break;
          default:
            break;
        }
        if (
          overload.functionOpValue() &&
          overload.matchesRuntimeSignature(this.disableTypeGuardsValue, ...args)
        ) {
          return overload.functionOpValue()!(...args);
        }
      }
      return maybeNoSuchOverload(this.name(), ...args);
    };
    return [...overloads, { operator: this.name(), func, operandTrait: 0, nonStrict }];
  }
}

/**
 * OverloadDecl contains the definition of a single overload id with a specific signature, and an optional implementation.
 */
export class OverloadDecl {
  private docValue = "";
  // hasLateBinding indicates that the function has a binding which is not known at compile time.
  // This is useful for functions which have side-effects or are not deterministically computable.
  private hasLateBindingValue = false;
  // nonStrict indicates that the function will accept error and unknown arguments as inputs.
  private nonStrictValue = false;
  // operandTrait indicates whether the member argument should have a specific type-trait.
  //
  // This is useful for creating overloads which operate on a type-interface rather than a concrete type.
  private operandTraitValue = 0;
  // Function implementation options. Optional, but encouraged.
  // unaryOp is a function binding that takes a single argument.
  private unaryOp?: UnaryOp;
  // binaryOp is a function binding that takes two arguments.
  private binaryOp?: BinaryOp;
  // functionOp is a catch-all for zero-arity and three-plus arity functions.
  private functionOp?: FunctionOp;
  // asyncOp is an asynchronous function binding evaluated by concurrent program execution.
  private asyncOp?: AsyncOp;

  /** Constructor accepts the explicit overload seam plus plain TypeScript option-object configuration. */
  constructor(
    private readonly idValue: string,
    private readonly argTypesValue: Type[],
    private readonly resultTypeValue: Type,
    private readonly memberFunction: boolean,
    options: OverloadDeclOptions = {},
  ) {
    if (options.doc !== undefined) {
      this.docValue =
        typeof options.doc === "string" ? options.doc : multilineDescription(...options.doc);
    }
    if (options.lateBinding) {
      this.setLateBinding();
    }
    if (options.unaryBinding) {
      this.setUnaryBinding(options.unaryBinding);
    }
    if (options.binaryBinding) {
      this.setBinaryBinding(options.binaryBinding);
    }
    if (options.functionBinding) {
      this.setFunctionBinding(options.functionBinding);
    }
    if (options.asyncBinding) {
      this.setAsyncBinding(options.asyncBinding);
    }
    if (options.nonStrict) {
      this.setNonStrict();
    }
    if (options.operandTrait !== undefined) {
      this.setOperandTrait(options.operandTrait);
    }
  }

  /** Examples returns a list of string examples for the overload. */
  public examples(): string[] {
    return this.docValue.length === 0 ? [] : parseDescriptions(this.docValue);
  }

  /**
   * ID mirrors the overload signature and provides a unique id which may be referenced within the type-checker
   * and interpreter to optimize performance.
   *
   * The ID format is usually one of two styles:
   * global: <functionName>_<argType>_<argTypeN>
   * member: <memberType>_<functionName>_<argType>_<argTypeN>
   */
  public id(): string {
    return this.idValue;
  }

  /**
   * ArgTypes contains the set of argument types expected by the overload.
   *
   * For member functions ArgTypes[0] represents the member operand type.
   */
  public argTypes(): Type[] {
    return this.argTypesValue;
  }

  /** IsMemberFunction indicates whether the overload is a member function */
  public isMemberFunction(): boolean {
    return this.memberFunction;
  }

  /** IsNonStrict returns whether the overload accepts errors and unknown values as arguments. */
  public isNonStrict(): boolean {
    return this.nonStrictValue;
  }

  /** HasLateBinding returns whether the overload has a binding which is not known at compile time. */
  public hasLateBinding(): boolean {
    return this.hasLateBindingValue || this.asyncOp !== undefined;
  }

  /**
   * OperandTrait returns the trait mask of the first operand to the overload call, e.g.
   * `traits.Indexer`
   */
  public operandTrait(): number {
    return this.operandTraitValue;
  }

  /** ResultType indicates the output type from calling the function. */
  public resultType(): Type {
    return this.resultTypeValue;
  }

  /** TypeParams returns the type parameter names associated with the overload. */
  public typeParams(): string[] {
    const paramNames = new Set<string>();
    collectParamNames(paramNames, this.resultType());
    for (const arg of this.argTypes()) {
      collectParamNames(paramNames, arg);
    }
    return [...paramNames];
  }

  /**
   * SignatureEquals determines whether the incoming overload declaration signature is equal to the current signature.
   *
   * Result type, operand trait, and strict-ness are not considered as part of signature equality.
   */
  public signatureEquals(other: OverloadDecl): boolean {
    if (this === other) {
      return true;
    }
    if (
      this.id() !== other.id() ||
      this.isMemberFunction() !== other.isMemberFunction() ||
      this.argTypes().length !== other.argTypes().length
    ) {
      return false;
    }
    return (
      this.argTypes().every((argType, index) =>
        argType.isEquivalentType(other.argTypes()[index]!),
      ) && this.resultType().isEquivalentType(other.resultType())
    );
  }

  /**
   * SignatureOverlaps indicates whether two functions have non-equal, but overloapping function signatures.
   *
   * For example, list(dyn) collides with list(string) since the 'dyn' type can contain a 'string' type.
   */
  public signatureOverlaps(other: OverloadDecl): boolean {
    if (
      this.isMemberFunction() !== other.isMemberFunction() ||
      this.argTypes().length !== other.argTypes().length
    ) {
      return false;
    }
    return this.argTypes().every((argType, index) => {
      const otherArgType = other.argTypes()[index]!;
      return argType.isAssignableType(otherArgType) || otherArgType.isAssignableType(argType);
    });
  }

  /** HasBinding indicates whether the overload already has a definition. */
  public hasBinding(): boolean {
    return (
      this.unaryOp !== undefined ||
      this.binaryOp !== undefined ||
      this.functionOp !== undefined ||
      this.asyncOp !== undefined
    );
  }

  /** guardedUnaryOp creates an invocation guard around the provided unary operator, if one is defined. */
  public guardedUnaryOp(funcName: string, disableTypeGuards: boolean): UnaryOp | undefined {
    if (!this.unaryOp) {
      return undefined;
    }
    return (arg) => {
      if (!this.matchesRuntimeUnarySignature(disableTypeGuards, arg)) {
        return maybeNoSuchOverload(funcName, arg);
      }
      return this.unaryOp!(arg);
    };
  }

  /** guardedBinaryOp creates an invocation guard around the provided binary operator, if one is defined. */
  public guardedBinaryOp(funcName: string, disableTypeGuards: boolean): BinaryOp | undefined {
    if (!this.binaryOp) {
      return undefined;
    }
    return (arg1, arg2) => {
      if (!this.matchesRuntimeBinarySignature(disableTypeGuards, arg1, arg2)) {
        return maybeNoSuchOverload(funcName, arg1, arg2);
      }
      return this.binaryOp!(arg1, arg2);
    };
  }

  /** guardedFunctionOp creates an invocation guard around the provided variadic function binding, if one is provided. */
  public guardedFunctionOp(funcName: string, disableTypeGuards: boolean): FunctionOp | undefined {
    if (!this.functionOp) {
      return undefined;
    }
    return (...args) => {
      if (!this.matchesRuntimeSignature(disableTypeGuards, ...args)) {
        return maybeNoSuchOverload(funcName, ...args);
      }
      return this.functionOp!(...args);
    };
  }

  /** guardedAsyncOp creates a runtime type guard around an asynchronous binding. */
  public guardedAsyncOp(funcName: string, disableTypeGuards: boolean): AsyncOp | undefined {
    if (this.asyncOp === undefined) {
      return undefined;
    }
    return async (signal, ...args) => {
      if (!this.matchesRuntimeSignature(disableTypeGuards, ...args)) {
        return maybeNoSuchOverload(funcName, ...args);
      }
      return this.asyncOp!(signal, ...args);
    };
  }

  /** matchesRuntimeUnarySignature indicates whether the argument type is runtime assiganble to the overload's expected argument. */
  public matchesRuntimeUnarySignature(disableTypeGuards: boolean, arg: Val): boolean {
    return (
      matchRuntimeArgType(this.isNonStrict(), disableTypeGuards, this.argTypes()[0]!, arg) &&
      matchOperandTrait(this.operandTrait(), arg)
    );
  }

  /** matchesRuntimeBinarySignature indicates whether the argument types are runtime assiganble to the overload's expected arguments. */
  public matchesRuntimeBinarySignature(disableTypeGuards: boolean, arg1: Val, arg2: Val): boolean {
    return (
      matchRuntimeArgType(this.isNonStrict(), disableTypeGuards, this.argTypes()[0]!, arg1) &&
      matchRuntimeArgType(this.isNonStrict(), disableTypeGuards, this.argTypes()[1]!, arg2) &&
      matchOperandTrait(this.operandTrait(), arg1)
    );
  }

  /** matchesRuntimeSignature indicates whether the argument types are runtime assiganble to the overload's expected arguments. */
  public matchesRuntimeSignature(disableTypeGuards: boolean, ...args: Val[]): boolean {
    if (args.length !== this.argTypes().length) {
      return false;
    }
    if (args.length === 0) {
      return true;
    }
    return (
      args.every((arg, index) =>
        matchRuntimeArgType(this.isNonStrict(), disableTypeGuards, this.argTypes()[index]!, arg),
      ) && matchOperandTrait(this.operandTrait(), args[0]!)
    );
  }

  public setDoc(doc: string): void {
    this.docValue = doc;
  }

  public doc(): string {
    return this.docValue;
  }

  /**
   * setUnaryBinding provides the implementation of a unary overload. The provided function is protected by a runtime
   * type-guard which ensures runtime type agreement between the overload signature and runtime argument types.
   */
  private setUnaryBinding(binding: UnaryOp): void {
    if (this.hasBinding()) {
      throw new Error(`overload already has a binding: ${this.id()}`);
    }
    if (this.argTypes().length !== 1) {
      throw new Error(`unary function bound to non-unary overload: ${this.id()}`);
    }
    if (this.hasLateBindingValue) {
      throw new Error(`overload already has a late binding: ${this.id()}`);
    }
    this.unaryOp = binding;
  }

  /**
   * setBinaryBinding provides the implementation of a binary overload. The provided function is protected by a runtime
   * type-guard which ensures runtime type agreement between the overload signature and runtime argument types.
   */
  private setBinaryBinding(binding: BinaryOp): void {
    if (this.hasBinding()) {
      throw new Error(`overload already has a binding: ${this.id()}`);
    }
    if (this.argTypes().length !== 2) {
      throw new Error(`binary function bound to non-binary overload: ${this.id()}`);
    }
    if (this.hasLateBindingValue) {
      throw new Error(`overload already has a late binding: ${this.id()}`);
    }
    this.binaryOp = binding;
  }

  /**
   * setFunctionBinding provides the implementation of a variadic overload. The provided function is protected by a runtime
   * type-guard which ensures runtime type agreement between the overload signature and runtime argument types.
   */
  private setFunctionBinding(binding: FunctionOp): void {
    if (this.hasBinding()) {
      throw new Error(`overload already has a binding: ${this.id()}`);
    }
    if (this.hasLateBindingValue) {
      throw new Error(`overload already has a late binding: ${this.id()}`);
    }
    this.functionOp = binding;
  }

  /**
   * setAsyncBinding provides an asynchronous implementation for this overload.
   */
  private setAsyncBinding(binding: AsyncOp): void {
    if (this.hasBinding()) {
      throw new Error(`overload already has a binding: ${this.id()}`);
    }
    if (this.hasLateBindingValue) {
      throw new Error(`overload already has a late binding: ${this.id()}`);
    }
    this.asyncOp = binding;
  }

  /**
   * setLateBinding indicates that the function has a binding which is not known at compile time.
   * This is useful for functions which have side-effects or are not deterministically computable.
   */
  private setLateBinding(): void {
    if (this.hasBinding()) {
      throw new Error(`overload already has a binding: ${this.id()}`);
    }
    this.hasLateBindingValue = true;
  }

  /**
   * setNonStrict enables the function to be called with error and unknown argument values.
   *
   * Note: do not use this option unless absoluately necessary as it should be an uncommon feature.
   */
  private setNonStrict(): void {
    this.nonStrictValue = true;
  }

  /**
   * setOperandTrait configures a set of traits which the first argument to the overload must implement in order to be
   * successfully invoked.
   */
  private setOperandTrait(trait: number): void {
    this.operandTraitValue = trait;
  }

  public unaryOpValue(): UnaryOp | undefined {
    return this.unaryOp;
  }

  public binaryOpValue(): BinaryOp | undefined {
    return this.binaryOp;
  }

  public functionOpValue(): FunctionOp | undefined {
    return this.functionOp;
  }

  /** asyncOpValue returns the asynchronous implementation, if one is configured. */
  public asyncOpValue(): AsyncOp | undefined {
    return this.asyncOp;
  }
}

/**
 * VariableDecl defines a variable declaration which may optionally have a constant value.
 */
export class VariableDecl {
  /** Constructor accepts the variable name, type, optional constant value, and optional usage documentation. */
  constructor(
    private readonly nameValue: string,
    private readonly varTypeValue: Type,
    private readonly valueValue?: Val,
    private readonly docValue = "",
  ) {}

  /** Documentation returns name, type, and description for the variable. */
  public documentation(): Doc {
    return variableDoc(this.name(), describeCelType(this.type()), this.description());
  }

  /** Name returns the fully-qualified variable name */
  public name(): string {
    return this.nameValue;
  }

  /**
   * Description returns the usage documentation for the variable, if set.
   *
   * Good usage instructions provide information about the valid formats, ranges, sizes for the variable type.
   */
  public description(): string {
    return this.docValue;
  }

  /** Type returns the types.Type value associated with the variable. */
  public type(): Type {
    return this.varTypeValue;
  }

  /** Value returns the constant value associated with the declaration. */
  public value(): Val | undefined {
    return this.valueValue;
  }

  /** DeclarationIsEquivalent returns true if one variable declaration has the same name and same type as the input. */
  public declarationIsEquivalent(other: VariableDecl): boolean {
    return this.name() === other.name() && this.type().isEquivalentType(other.type());
  }
}

/**
 * func creates a new function declaration with a set of TypeScript option objects to configure overloads
 * and function definitions (implementations).
 *
 * Functions are checked for name collisions and singleton redefinition.
 */
export function func(name: string, options: FunctionDeclOptions = {}): FunctionDecl {
  const fn = new FunctionDecl(name, options);
  if (fn.overloadDecls().length === 0) {
    throw new Error(`function ${name} must have at least one overload`);
  }
  return fn;
}

/** IncludeOverloads defines an OverloadSelector which allow-lists a set of overloads by their ids. */
export function includeOverloads(...overloadIds: string[]): OverloadSelector {
  return (overload) => overloadIds.includes(overload.id());
}

/** ExcludeOverloads defines an OverloadSelector which deny-lists a set of overloads by their ids. */
export function excludeOverloads(...overloadIds: string[]): OverloadSelector {
  return (overload) => !overloadIds.includes(overload.id());
}

/**
 * maybeNoSuchOverload determines whether to propagate an error if one is provided as an argument, or
 * to return an unknown set, or to produce a new error for a missing function signature.
 */
export function maybeNoSuchOverload(funcName: string, ...args: Val[]): Val {
  const argTypes: string[] = [];
  let unknownSet: Unknown | undefined;
  for (const arg of args) {
    if (isError(arg)) {
      return arg;
    }
    if (isUnknown(arg)) {
      unknownSet = mergeUnknowns(arg as Unknown, unknownSet);
    }
    argTypes.push(arg.type().typeName());
  }
  if (unknownSet) {
    return unknownSet;
  }
  return newErr("no such overload: %s(%s)", funcName, argTypes.join(", "));
}

/**
 * overload defines a new global overload with an overload id, argument types, and result type.
 *
 * Note: function bindings should be commonly configured with overload instances whereas operand traits and
 * strict-ness should be rare occurrences.
 */
export function overload(
  overloadId: string,
  argTypes: Type[],
  resultType: Type,
  options: OverloadDeclOptions = {},
): OverloadDecl {
  return new OverloadDecl(overloadId, argTypes, resultType, false, options);
}

/**
 * memberOverload defines a new receiver-style overload (or member function) with an overload id, argument types,
 * and result type.
 *
 * Note: function bindings should be commonly configured with memberOverload instances whereas operand traits and
 * strict-ness should be rare occurrences.
 */
export function memberOverload(
  overloadId: string,
  argTypes: Type[],
  resultType: Type,
  options: OverloadDeclOptions = {},
): OverloadDecl {
  return new OverloadDecl(overloadId, argTypes, resultType, true, options);
}

/** constant creates a new constant declaration. */
export function constant(name: string, type: Type, value: Val): VariableDecl {
  return new VariableDecl(name, type, value);
}

/** variable creates a new variable declaration. */
export function variable(name: string, type: Type): VariableDecl {
  return new VariableDecl(name, type);
}

/** variableWithDoc creates a new variable declaration with usage documentation. */
export function variableWithDoc(name: string, type: Type, doc: string): VariableDecl {
  return new VariableDecl(name, type, undefined, doc);
}

/** typeVariable creates a new type identifier for use within a types.Provider */
export function typeVariable(type: Type): VariableDecl {
  return variable(type.typeName(), typeTypeWithParam(type));
}

/** variableDeclToExprDecl converts a CEL-native variable declaration into a protobuf-typed variable declaration. */
export function variableDeclToExprDecl(variable: VariableDecl): Decl {
  return checkerDecls.varDeclWithDoc(
    variable.name(),
    typeToExprType(variable.type()),
    variable.description(),
  );
}

/** functionDeclToExprDecl converts a CEL-native function declaration into a protobuf-typed function declaration. */
export function functionDeclToExprDecl(fn: FunctionDecl): Decl {
  const overloads = fn.overloadDecls().map<Decl_FunctionDecl_Overload>((overload) => {
    const paramNames = new Set<string>();
    const argTypes = overload.argTypes().map((argType) => {
      collectParamNames(paramNames, argType);
      return typeToExprType(argType);
    });
    collectParamNames(paramNames, overload.resultType());
    const resultType = typeToExprType(overload.resultType());
    const typeParams = [...paramNames];
    const exprOverload =
      typeParams.length === 0
        ? overload.isMemberFunction()
          ? checkerDecls.instanceOverload(overload.id(), argTypes, resultType)
          : checkerDecls.overloadDecl(overload.id(), argTypes, resultType)
        : overload.isMemberFunction()
          ? checkerDecls.parameterizedInstanceOverload(
              overload.id(),
              argTypes,
              resultType,
              typeParams,
            )
          : checkerDecls.parameterizedOverload(overload.id(), argTypes, resultType, typeParams);
    exprOverload.doc = multilineDescription(...overload.examples());
    return exprOverload;
  });
  return checkerDecls.functionDeclWithDoc(fn.name(), fn.description(), ...overloads);
}

function runtimeSingletonOverload(
  functionName: string,
  binding: SingletonBinding,
): RuntimeOverload {
  const bindingCount =
    Number(binding.unary !== undefined) +
    Number(binding.binary !== undefined) +
    Number(binding.func !== undefined) +
    Number(binding.async !== undefined);
  if (bindingCount !== 1) {
    throw new Error(
      `function singleton binding must define exactly one implementation: ${functionName}`,
    );
  }
  return {
    operator: functionName,
    unary: binding.unary,
    binary: binding.binary,
    func: binding.func,
    async: binding.async,
    operandTrait: binding.trait ?? 0,
    nonStrict: false,
  };
}

/**
 * singletonBindingsEqual compares singleton bindings structurally.
 *
 * cel-go relies on pointer identity for singleton overload equality, but the
 * TypeScript port recreates equivalent binding objects across calls to the
 * standard library declaration helpers.
 */
function singletonBindingsEqual(left: RuntimeOverload, right: RuntimeOverload): boolean {
  return (
    left.operator === right.operator &&
    left.unary === right.unary &&
    left.binary === right.binary &&
    left.func === right.func &&
    left.async === right.async &&
    left.operandTrait === right.operandTrait &&
    left.nonStrict === right.nonStrict
  );
}

/**
 * sameSingletonOverloadSet reports whether two function declarations declare the
 * same overload set even if their singleton binding wrappers were recreated.
 */
function sameSingletonOverloadSet(left: FunctionDecl, right: FunctionDecl): boolean {
  const leftOverloads = left.overloadDecls();
  const rightOverloads = right.overloadDecls();
  if (leftOverloads.length !== rightOverloads.length) {
    return false;
  }
  return leftOverloads.every((leftOverload, index) => {
    const rightOverload = rightOverloads[index];
    return (
      rightOverload !== undefined &&
      leftOverload.id() === rightOverload.id() &&
      leftOverload.signatureEquals(rightOverload) &&
      leftOverload.isNonStrict() === rightOverload.isNonStrict() &&
      leftOverload.isMemberFunction() === rightOverload.isMemberFunction()
    );
  });
}

function matchRuntimeArgType(
  nonStrict: boolean,
  disableTypeGuards: boolean,
  argType: Type,
  arg: Val,
): boolean {
  if (nonStrict && (disableTypeGuards || isUnknown(arg) || isError(arg))) {
    return true;
  }
  if (isUnknown(arg) || isError(arg)) {
    return false;
  }
  return disableTypeGuards || argType.isAssignableRuntimeType(arg);
}

function matchOperandTrait(trait: number, arg: Val): boolean {
  return trait === 0 || arg.type().hasTrait(trait) || isUnknown(arg) || isError(arg);
}

function collectParamNames(paramNames: Set<string>, type: Type): void {
  if (type.kind() === Kind.TypeParam) {
    paramNames.add(type.typeName());
  }
  for (const param of type.parameters()) {
    collectParamNames(paramNames, param);
  }
}

function formatSignature(functionName: string, overload: OverloadDecl): string {
  const [operatorName, isOperator] = operators.findReverse(functionName);
  if (isOperator) {
    return formatOperator(operatorName || functionName, overload);
  }
  return formatCall(functionName, overload);
}

function formatOperator(operatorName: string, overload: OverloadDecl): string {
  const argTypes = overload.argTypes().map((argType) => describeCelType(argType));
  const result = describeCelType(overload.resultType());
  switch (argTypes.length) {
    case 1:
      return `${operatorName}${argTypes[0]} -> ${result}`;
    case 2:
      if (operatorName === operators.Index) {
        return `${argTypes[0]}[${argTypes[1]}] -> ${result}`;
      }
      return `${argTypes[0]} ${operatorName} ${argTypes[1]} -> ${result}`;
    default:
      if (operatorName === operators.Conditional) {
        return "bool ? <T> : <T> -> <T>";
      }
      return formatCall(operatorName, overload);
  }
}

function formatCall(functionName: string, overload: OverloadDecl): string {
  const args = overload.argTypes().map((argType) => describeCelType(argType));
  const result = describeCelType(overload.resultType());
  if (overload.isMemberFunction()) {
    const [target = "", ...params] = args;
    return `${target}.${functionName}(${params.join(", ")}) -> ${result}`;
  }
  return `${functionName}(${args.join(", ")}) -> ${result}`;
}

function describeCelType(type: Type): string {
  if (type.kind() === Kind.Type) {
    return "type";
  }
  return type.toString();
}
