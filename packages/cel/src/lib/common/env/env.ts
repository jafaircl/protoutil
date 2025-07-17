/* eslint-disable no-case-declarations */
import { MAX_UINT32 } from '@protoutil/core';
import {
  excludeOverloads,
  FunctionDecl,
  functionDocs,
  FunctionOpt,
  includeOverloads,
  memberOverload,
  newFunction,
  overload,
  overloadExamples,
  VariableDecl,
} from '../decls.js';
import { Provider } from '../ref/provider.js';
import {
  DynType,
  isType,
  Kind,
  newListType,
  newMapType,
  newOpaqueType,
  newOptionalType,
  newTypeParamType,
  NullType,
  Type,
} from '../types/types.js';
import { isNil, safeParseInt } from '../utils.js';

const wrapperTypes: Map<Kind, string> = new Map([
  [Kind.BOOL, 'google.protobuf.BoolValue'],
  [Kind.BYTES, 'google.protobuf.BytesValue'],
  [Kind.DOUBLE, 'google.protobuf.DoubleValue'],
  [Kind.INT, 'google.protobuf.Int64Value'],
  [Kind.STRING, 'google.protobuf.StringValue'],
  [Kind.UINT, 'google.protobuf.UInt64Value'],
]);

/**
 * ImportJson represents the serializable JSON format of a CEL import.
 */
export interface ImportJson {
  name: string;
}

/**
 * Import represents a type name that will be appreviated by its simple name using
 * the cel.Abbrevs() option.
 */
export class Import {
  constructor(public readonly name: string) {}

  /**
   * Validate validates the import configuration is well-formed.
   */
  validate(): void | Error {
    if (!this.name) {
      return new Error('invalid import: missing type name');
    }
  }

  toJson(): ImportJson {
    return {
      name: this.name,
    };
  }

  static fromJson(json: ImportJson): Import {
    return new Import(json.name);
  }
}

/**
 * ContextVariableJson represents the serializable JSON format of a CEL context variable.
 */
export interface ContextVariableJson {
  /**
   * TypeName represents the fully qualified typename of the context variable.
   * Currently, only protobuf types are supported.
   */
  type_name: string;
}

/**
 * ContextVariable represents a structured message whose fields are to be treated as the top-level
 * variable identifiers within CEL expressions.
 */
export class ContextVariable {
  constructor(
    /**
     * TypeName represents the fully qualified typename of the context variable.
     * Currently, only protobuf types are supported.
     */
    public readonly typeName: string
  ) {}

  /**
   * Validate validates the context variable configuration is well-formed.
   */
  validate(): void | Error {
    if (!this.typeName) {
      return new Error('invalid context variable: missing type name');
    }
  }

  toJson(): ContextVariableJson {
    return {
      type_name: this.typeName,
    };
  }

  static fromJson(json: ContextVariableJson): ContextVariable {
    return new ContextVariable(json.type_name);
  }
}

/**
 * FunctionJson represents the serializable JSON format of a CEL function.
 */
export interface FunctionJson {
  name: string;
  description?: string;
  overloads?: OverloadJson[];
}

/**
 * Function represents the serializable format of a CEL function.
 */
export class Function {
  constructor(
    public readonly name: string,
    public description = '',
    public readonly overloads: Overload[] = []
  ) {}

  /**
   * Validate validates the function configuration is well-formed.
   */
  validate(): void | Error {
    if (!this.name) {
      return new Error('invalid function: missing function name');
    }
    if (this.overloads.length === 0) {
      return new Error(`invalid function ${this.name}: missing overloads`);
    }
    for (const o of this.overloads) {
      const err = o.validate();
      if (err) {
        return new Error(`invalid function ${this.name}: ${err.message}`);
      }
    }
  }

  /**
   * AsCELFunction converts the serializable form of the Function into CEL environment declaration.
   */
  asCELFunction(tp: Provider): FunctionDecl | Error {
    const err = this.validate();
    if (err) {
      return err;
    }
    const opts: FunctionOpt[] = [];
    for (const o of this.overloads) {
      const opt = o.asFunctionOption(tp);
      if (opt instanceof Error) {
        return new Error(`invalid function ${this.name} ${o.id}: ${opt.message}`);
      }
      opts.push(opt);
    }
    if (this.description) {
      opts.push(functionDocs(this.description));
    }
    return newFunction(this.name, ...opts);
  }

  toJson(): FunctionJson {
    return {
      name: this.name,
      description: this.description,
      overloads: arrOrUndefined(this.overloads.map((o) => o.toJson())),
    };
  }

  static fromJson(json: FunctionJson): Function {
    const overloads: Overload[] = [];
    for (const ov of json.overloads ?? []) {
      const o = Overload.fromJson(ov);
      overloads.push(o);
    }
    return new Function(json.name, json.description, overloads);
  }
}

/**
 * OverloadJson represents the serializable JSON format of a CEL function overload.
 */
export interface OverloadJson {
  id: string;
  examples?: string[];
  target?: TypeDescJson;
  args?: TypeDescJson[];
  return?: TypeDescJson;
}

/**
 * Overload represents the serializable format of a function overload.
 */
export class Overload {
  constructor(
    public readonly id: string,
    public examples: string[] = [],
    public readonly target?: TypeDesc,
    public readonly args: TypeDesc[] = [],
    public readonly returnType?: TypeDesc
  ) {}

  /**
   * Validate validates the overload configuration is well-formed.
   */
  validate(): void | Error {
    if (!this.id) {
      return new Error('invalid overload: missing overload id');
    }
    if (this.target) {
      const err = this.target.validate();
      if (err) {
        return new Error(`invalid overload ${this.id} target: ${err.message}`);
      }
    }
    const args = this.args ?? [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const err = arg.validate();
      if (err) {
        return new Error(`invalid overload ${this.id} arg[${i}]: ${err.message}`);
      }
    }
    if (this.returnType) {
      const err = this.returnType.validate();
      if (err) {
        return new Error(`invalid overload ${this.id} return: ${err.message}`);
      }
    }
  }

  /**
   * AsFunctionOption converts the serializable form of the Overload into a function declaration option.
   */
  asFunctionOption(tp: Provider): FunctionOpt | Error {
    const err = this.validate();
    if (err) {
      return err;
    }
    const args: Type[] = [];
    for (const arg of this.args ?? []) {
      const at = arg.asCelType(tp);
      if (at instanceof Error) {
        return at;
      }
      args.push(at);
    }
    const returnType = this.returnType ? this.returnType.asCelType(tp) : undefined;
    if (returnType instanceof Error) {
      return returnType;
    }
    if (!returnType) {
      return new Error(`invalid overload ${this.id} return: missing return type`);
    }
    const examples = this.examples ?? [];
    if (this.target) {
      const targetType = this.target.asCelType(tp);
      if (targetType instanceof Error) {
        return targetType;
      }
      return memberOverload(this.id, targetType, args, returnType, overloadExamples(...examples));
    }
    return overload(this.id, args, returnType, overloadExamples(...examples));
  }

  toJson(): OverloadJson {
    return {
      id: this.id,
      examples: arrOrUndefined(this.examples),
      target: this.target?.toJson(),
      args: arrOrUndefined(this.args?.map((a) => a.toJson())),
      return: this.returnType?.toJson(),
    };
  }

  static fromJson(json: OverloadJson): Overload {
    const target = json.target ? TypeDesc.fromJson(json.target) : undefined;
    const args: TypeDesc[] = [];
    for (const arg of json.args ?? []) {
      const a = TypeDesc.fromJson(arg);
      args.push(a);
    }
    const returnType = json.return ? TypeDesc.fromJson(json.return) : undefined;
    return new Overload(json.id, json.examples, target, args, returnType);
  }
}

/**
 * ExtensionJson represents the serializable JSON format of a CEL extension.
 */
export interface ExtensionJson {
  /**
   * Name is either the LibraryName() or some short-hand simple identifier which is understood by the config-handler.
   */
  name: string;
  /**
   * Version may either be an unsigned long value or the string 'latest'. If empty, the value is treated as '0'.
   */
  version?: string;
}

/**
 * Extension represents a named and optionally versioned extension library configured in the environment.
 */
export class Extension {
  constructor(public readonly name: string, public readonly version?: string) {
    if (version === MAX_UINT32.toString()) {
      this.version = 'latest';
    }
  }

  /**
   * Validate validates the extension configuration is well-formed.
   */
  validate(): void | Error {
    const err = this.versionNumber();
    if (err instanceof Error) {
      return err;
    }
  }

  /**
   * VersionNumber returns the parsed version string, or an error if the version cannot be parsed.
   */
  versionNumber(): number | Error {
    if (!this.name) {
      return new Error('invalid extension: missing name');
    }
    if (this.version === 'latest') {
      return MAX_UINT32;
    }
    if (!this.version) {
      return 0;
    }
    try {
      const ver = safeParseInt(this.version, 32, false);
      return Number(ver);
    } catch (e) {
      return new Error(`invalid extension ${this.name} version: ${(e as Error).message}`);
    }
  }

  toJson(): ExtensionJson {
    return {
      name: this.name,
      version: this.version,
    };
  }

  static fromJson(json: ExtensionJson): Extension {
    return new Extension(json.name, String(json.version));
  }
}

/**
 * LibrarySubsetJson represents the serializable JSON format of a subsettable CEL library.
 */
export interface LibrarySubsetJson {
  /**
   * Disabled indicates whether the library has been disabled, typically only used for
   * default-enabled libraries like stdlib.
   */
  disabled?: boolean;
  /**
   * DisableMacros disables macros for the given library.
   */
  disable_macros?: boolean;
  /**
   * IncludeMacros specifies a set of macro function names to include in the subset.
   */
  include_macros?: string[];
  /**
   * ExcludeMacros specifies a set of macro function names to exclude from the subset.
   * Note: if IncludeMacros is non-empty, then ExcludeFunctions is ignored.
   */
  exclude_macros?: string[];
  /**
   * IncludeFunctions specifies a set of functions to include in the subset.
   *
   * Note: the overloads specified in the subset need only specify their ID.
   * Note: if IncludeFunctions is non-empty, then ExcludeFunctions is ignored.
   */
  include_functions?: FunctionJson[];
  /**
   * ExcludeFunctions specifies the set of functions to exclude from the subset.
   *
   * Note: the overloads specified in the subset need only specify their ID.
   */
  exclude_functions?: FunctionJson[];
}

/**
 * LibrarySubset indicates a subset of the macros and function supported by a subsettable library.
 */
export class LibrarySubset {
  constructor(
    /**
     * Disabled indicates whether the library has been disabled, typically only used for
     * default-enabled libraries like stdlib.
     */
    public disabled = false,
    /**
     * DisableMacros disables macros for the given library.
     */
    public disableMacros = false,
    /**
     * IncludeMacros specifies a set of macro function names to include in the subset.
     */
    public readonly includeMacros: string[] = [],
    /**
     * ExcludeMacros specifies a set of macro function names to exclude from the subset.
     * Note: if IncludeMacros is non-empty, then ExcludeFunctions is ignored.
     */
    public readonly excludeMacros: string[] = [],
    /**
     * IncludeFunctions specifies a set of functions to include in the subset.
     *
     * Note: the overloads specified in the subset need only specify their ID.
     * Note: if IncludeFunctions is non-empty, then ExcludeFunctions is ignored.
     */
    public readonly includeFunctions: Function[] = [],
    /**
     * ExcludeFunctions specifies the set of functions to exclude from the subset.
     *
     * Note: the overloads specified in the subset need only specify their ID.
     */
    public readonly excludeFunctions: Function[] = []
  ) {}

  /**
   * Validate validates the library subset configuration is well-formed.
   */
  validate(): void | Error {
    if (this.includeMacros.length !== 0 && this.excludeMacros.length !== 0) {
      return new Error('invalid subset: cannot both include and exclude macros');
    }
    if (this.includeFunctions.length !== 0 && this.excludeFunctions.length !== 0) {
      return new Error('invalid subset: cannot both include and exclude functions');
    }
  }

  /**
   * SubsetFunction produces a function declaration which matches the supported subset, or nil
   * if the function is not supported by the LibrarySubset.
   *
   * For IncludeFunctions, if the function does not specify a set of overloads to include, the
   * whole function definition is included. If overloads are set, then a new function which
   * includes only the specified overloads is produced.
   *
   * For ExcludeFunctions, if the function does not specify a set of overloads to exclude, the
   * whole function definition is excluded. If overloads are set, then a new function which
   * includes only the permitted overloads is produced.
   */
  subsetFunction(fn: FunctionDecl): FunctionDecl | null {
    if (this.disabled) {
      return null;
    }
    if (this.includeFunctions.length !== 0) {
      for (const include of this.includeFunctions) {
        if (include.name !== fn.name()) {
          continue;
        }
        if (include.overloads.length === 0) {
          return fn;
        }
        const overloadIDs = include.overloads.map((o) => o.id);
        return fn.subset(includeOverloads(...overloadIDs));
      }
      return null;
    }
    if (this.excludeFunctions.length !== 0) {
      for (const exclude of this.excludeFunctions) {
        if (exclude.name !== fn.name()) {
          continue;
        }
        if (exclude.overloads.length === 0) {
          return null;
        }
        const overloadIDs = exclude.overloads.map((o) => o.id);

        return fn.subset(excludeOverloads(...overloadIDs));
      }
      return fn;
    }
    return fn;
  }

  /**
   * SubsetMacro indicates whether the macro function should be included in the library subset.
   */
  subsetMacro(macroFunction: string): boolean {
    if (this.disabled || this.disableMacros) {
      return false;
    }
    if (this.includeMacros.length !== 0) {
      for (const name of this.includeMacros) {
        if (name === macroFunction) {
          return true;
        }
      }
      return false;
    }
    if (this.excludeMacros.length !== 0) {
      for (const name of this.excludeMacros) {
        if (name === macroFunction) {
          return false;
        }
      }
      return true;
    }
    return true;
  }

  /**
   * SetDisabled disables or enables the library.
   */
  setDisabled(disabled: boolean): LibrarySubset {
    this.disabled = disabled;
    return this;
  }

  /**
   * SetDisableMacros disables the macros for the library.
   */
  setDisableMacros(disable: boolean): LibrarySubset {
    this.disableMacros = disable;
    return this;
  }

  /**
   * AddIncludedMacros allow-lists one or more macros by function name.
   *
   * Note, this option will override any excluded macros.
   */
  addIncludedMacros(...macros: string[]): LibrarySubset {
    for (const macro of macros) {
      if (!this.includeMacros.includes(macro)) {
        this.includeMacros.push(macro);
      }
    }
    return this;
  }

  /**
   * AddExcludedMacros deny-lists one or more macros by function name.
   */
  addExcludedMacros(...macros: string[]): LibrarySubset {
    for (const macro of macros) {
      if (!this.excludeMacros.includes(macro)) {
        this.excludeMacros.push(macro);
      }
    }
    return this;
  }

  /**
   * AddIncludedFunctions allow-lists one or more functions from the subset.
   *
   * Note, this option will override any excluded functions.
   */
  addIncludedFunctions(...functions: Function[]): LibrarySubset {
    for (const fn of functions) {
      this.includeFunctions.push(fn);
    }
    return this;
  }

  /**
   * AddExcludedFunctions deny-lists one or more functions from the subset.
   */
  addExcludedFunctions(...functions: Function[]): LibrarySubset {
    for (const fn of functions) {
      this.excludeFunctions.push(fn);
    }
    return this;
  }

  toJson(): LibrarySubsetJson {
    return {
      disabled: this.disabled ? this.disabled : undefined,
      disable_macros: this.disableMacros ? this.disableMacros : undefined,
      include_macros: arrOrUndefined(this.includeMacros),
      exclude_macros: arrOrUndefined(this.excludeMacros),
      include_functions: arrOrUndefined(this.includeFunctions.map((f) => f.toJson())),
      exclude_functions: arrOrUndefined(this.excludeFunctions.map((f) => f.toJson())),
    };
  }

  static fromJson(json: LibrarySubsetJson): LibrarySubset {
    const includeFunctions: Function[] = [];
    for (const f of json.include_functions ?? []) {
      const fn = Function.fromJson(f);
      includeFunctions.push(fn);
    }
    const excludeFunctions: Function[] = [];
    for (const f of json.exclude_functions ?? []) {
      const fn = Function.fromJson(f);
      excludeFunctions.push(fn);
    }
    return new LibrarySubset(
      json.disabled,
      json.disable_macros,
      json.include_macros,
      json.exclude_macros,
      includeFunctions,
      excludeFunctions
    );
  }
}

/**
 * ValidatorJson represents the serializable JSON format of a CEL validator.
 */
export interface ValidatorJson {
  name: string;
  config?: Record<string, unknown>;
}

/**
 * Validator represents a named validator with an optional map-based configuration object.
 *
 * Note: the map-keys must directly correspond to the internal representation of the original
 * validator, and should only use primitive scalar types as values at this time.
 */
export class Validator {
  constructor(public readonly name: string, public config?: Record<string, unknown>) {}

  /**
   * Validate validates the configuration of the validator object.
   */
  validate(): void | Error {
    if (!this.name) {
      return new Error('invalid validator: missing name');
    }
  }

  /**
   * SetConfig sets the set of map key-value pairs associated with this validator's configuration.
   */
  setConfig(config: Record<string, unknown>): Validator {
    this.config = config;
    return this;
  }

  /**
   * ConfigValue retrieves the value associated with the config key name, if one exists.
   */
  configValue(name: string): unknown | undefined {
    if (!this.config) {
      return undefined;
    }
    return this.config[name];
  }

  toJson(): ValidatorJson {
    return {
      name: this.name,
      config: !this.config ? undefined : this.config,
    };
  }

  static fromJson(json: ValidatorJson): Validator {
    return new Validator(json.name, json.config);
  }
}

/**
 * FeatureJson represents the serializable JSON format of a CEL feature flag.
 */
export interface FeatureJson {
  name: string;
  enabled: boolean;
}

/**
 * Feature represents a named boolean feature flag supported by CEL.
 */
export class Feature {
  constructor(public readonly name: string, public readonly enabled = false) {}

  /**
   * Validate validates the feature configuration is well-formed.
   */
  validate(): void | Error {
    if (!this.name) {
      return new Error('invalid feature: missing name');
    }
  }

  toJson(): FeatureJson {
    return {
      name: this.name,
      enabled: this.enabled,
    };
  }

  static fromJson(json: FeatureJson): Feature {
    return new Feature(json.name, json.enabled);
  }
}

/**
 * TypeDescJson represents the serializable JSON format of a CEL *types.Type value.
 */
export interface TypeDescJson {
  type_name: string;
  params?: TypeDescJson[];
  is_type_param?: boolean;
}

/**
 * TypeDesc represents the serializable format of a CEL *types.Type value.
 */
export class TypeDesc {
  constructor(
    public readonly typeName: string,
    public readonly params: TypeDesc[] = [],
    public readonly isTypeParam = false
  ) {}

  /**
   * Validate validates the type configuration is well-formed.
   */
  validate(): void | Error {
    if (!this.typeName) {
      return new Error('invalid type: missing type name');
    }
    if (this.isTypeParam && this.params.length !== 0) {
      return new Error('invalid type: param type cannot have parameters');
    }
    switch (this.typeName) {
      case 'list':
        if (this.params.length !== 1) {
          return new Error(`invalid type: list expects 1 parameter, got ${this.params.length}`);
        }
        return this.params[0].validate();
      case 'map':
        if (this.params.length !== 2) {
          return new Error(`invalid type: map expects 2 parameters, got ${this.params.length}`);
        }
        let err = this.params[0].validate();
        if (err) {
          return err;
        }
        err = this.params[1].validate();
        if (err) {
          return err;
        }
        break;
      case 'optional_type':
        if (this.params.length !== 1) {
          return new Error(
            `invalid type: optional_type expects 1 parameter, got ${this.params.length}`
          );
        }
        return this.params[0].validate();
      default:
        break;
    }
  }

  /**
   * AsCELType converts the serializable object to a *types.Type value.
   */
  asCelType(tp: Provider): Type | Error {
    const err = this.validate();
    if (err) {
      return err;
    }
    switch (this.typeName) {
      case 'dyn':
        return DynType;
      case 'map':
        const kt = this.params[0].asCelType(tp);
        if (kt instanceof Error) {
          return kt;
        }
        const vt = this.params[1].asCelType(tp);
        if (vt instanceof Error) {
          return vt;
        }
        return newMapType(kt, vt);
      case 'list':
        const et = this.params[0].asCelType(tp);
        if (et instanceof Error) {
          return et;
        }
        return newListType(et);
      case 'optional_type':
        const ot = this.params[0].asCelType(tp);
        if (ot instanceof Error) {
          return ot;
        }
        return newOptionalType(ot);
      default:
        if (this.isTypeParam) {
          return newTypeParamType(this.typeName);
        }
        const msgType = tp.findStructType(this.typeName);
        if (msgType) {
          // First parameter is the type name.
          return msgType.parameters()[0];
        }
        const t = tp.findIdent(this.typeName);
        if (!t) {
          return new Error(`undefined type name: ${this.typeName}`);
        }
        if (isType(t) && this.params.length === 0) {
          return t;
        }
        const params: Type[] = [];
        for (const p of this.params) {
          const pt = p.asCelType(tp);
          if (pt instanceof Error) {
            return pt;
          }
          params.push(pt);
        }
        return newOpaqueType(this.typeName, ...params);
    }
  }

  toString(): string {
    const ps: string[] = this.params.map((p) => p.toString());
    let typeName = this.typeName;
    if (ps.length > 0) {
      typeName = `${typeName}(${ps.join(',')})`;
    }
    return typeName;
  }

  toJson(): TypeDescJson {
    return {
      type_name: this.typeName,
      params: arrOrUndefined(this.params.map((p) => p.toJson())),
      is_type_param: this.isTypeParam,
    };
  }

  static fromJson(json: TypeDescJson): TypeDesc {
    const params: TypeDesc[] = [];
    for (const param of json.params ?? []) {
      const p = TypeDesc.fromJson(param);
      params.push(p);
    }
    const isTypeParam = isNil(json.is_type_param) ? false : Boolean(json.is_type_param);
    return new TypeDesc(json.type_name, params, isTypeParam);
  }
}

/**
 * TypeParamDesc describe a type-param type.
 */
export class TypeParamDesc extends TypeDesc {
  constructor(public readonly paramName: string) {
    super(paramName, [], true);
  }
}

/**
 * SerializeTypeDesc converts a CEL native *types.Type to a serializable TypeDesc.
 */
export function serializeTypeDesc(t: Type): TypeDesc {
  const typeName = t.typeName();
  if (t.kind() == Kind.TYPEPARAM) {
    return new TypeParamDesc(typeName);
  }
  if (t != NullType && t.isAssignableType(NullType)) {
    if (wrapperTypes.has(t.kind())) {
      return new TypeDesc(wrapperTypes.get(t.kind()) as string);
    }
  }
  const params: TypeDesc[] = [];
  for (const p of t.parameters()) {
    params.push(serializeTypeDesc(p));
  }
  return new TypeDesc(typeName, params);
}

/**
 * VariableJson represents the serializable JSON format of a CEL variable.
 */
export interface VariableJson extends TypeDescJson {
  name: string;
  description?: string;
}

/**
 * Variable represents a typed variable declaration which will be published via the
 * cel.VariableDecls() option.
 */
export class Variable extends TypeDesc {
  constructor(
    public readonly name: string,
    public override readonly typeName: string,
    public override readonly params: TypeDesc[] = [],
    public override readonly isTypeParam = false,
    public description = ''
  ) {
    super(typeName, params, isTypeParam);
  }

  /**
   * Validate validates the variable configuration is well-formed.
   */
  override validate(): void | Error {
    if (!this.name) {
      return new Error('invalid variable: missing name');
    }
    const err = super.validate();
    if (err) {
      return new Error(`invalid variable ${this.name}: ${err.message}`);
    }
  }

  /**
   * AsCELVariable converts the serializable form of the Variable into a CEL environment declaration.
   */
  asCELVariable(tp: Provider): VariableDecl | Error {
    const err = this.validate();
    if (err) {
      return err;
    }
    const type = super.asCelType(tp);
    if (type instanceof Error) {
      return new Error(`invalid variable ${this.name} type: ${type.message}`);
    }
    return new VariableDecl(this.name, type, undefined, this.description);
  }

  /**
   * GetType returns the variable type description.
   */
  getType(): TypeDesc | null {
    const err = this.validate();
    if (err) {
      return null;
    }
    return new TypeDesc(this.typeName, this.params, this.isTypeParam);
  }

  override toJson(): VariableJson {
    return {
      name: this.name,
      description: this.description,
      ...super.toJson(),
    };
  }

  static override fromJson(json: VariableJson): Variable {
    const type = TypeDesc.fromJson(json);
    return new Variable(json.name, type.typeName, type.params, type.isTypeParam, json.description);
  }
}

export interface ConfigJson {
  name?: string;
  description?: string;
  container?: string;
  imports?: ImportJson[];
  stdlib?: LibrarySubsetJson;
  extensions?: ExtensionJson[];
  context_variable?: ContextVariableJson;
  variables?: VariableJson[];
  functions?: FunctionJson[];
  validators?: ValidatorJson[];
  features?: FeatureJson[];
}

export class Config {
  constructor(
    public name?: string,
    public description?: string,
    public container = '',
    public imports: Import[] = [],
    public stdLib?: LibrarySubset,
    public extensions: Extension[] = [],
    public contextVariable?: ContextVariable,
    public variables: Variable[] = [],
    public functions: Function[] = [],
    public validators: Validator[] = [],
    public features: Feature[] = []
  ) {}

  /**
   * Validate validates the configuration is well-formed.
   */
  validate(): void | Error {
    for (const imp of this.imports) {
      const err = imp.validate();
      if (err) {
        return err;
      }
    }
    if (this.stdLib) {
      const err = this.stdLib.validate();
      if (err) {
        return err;
      }
    }
    for (const ext of this.extensions) {
      const err = ext.validate();
      if (err) {
        return err;
      }
    }
    if (this.contextVariable) {
      const err = this.contextVariable.validate();
      if (err) {
        return err;
      }
      if (this.variables.length !== 0) {
        return new Error(
          'invalid config: either context variable or variables may be set, but not both'
        );
      }
    }
    for (const v of this.variables) {
      const err = v.validate();
      if (err) {
        return err;
      }
    }
    for (const fn of this.functions) {
      const err = fn.validate();
      if (err) {
        return err;
      }
    }
    for (const feat of this.features) {
      const err = feat.validate();
      if (err) {
        return err;
      }
    }
    for (const val of this.validators) {
      const err = val.validate();
      if (err) {
        return err;
      }
    }
  }

  /**
   * SetContainer configures the container name for this configuration.
   */
  setContainer(container: string): Config {
    this.container = container;
    return this;
  }

  /**
   * AddVariableDecls adds one or more variables to the config, converting them to serializable values first.
   *
   * VariableDecl inputs are expected to be well-formed.
   */
  addVariableDecls(...vars: VariableDecl[]): Config {
    const convVars: Variable[] = [];
    for (const v of vars) {
      if (v == null) {
        continue;
      }
      const t = serializeTypeDesc(v.type());
      const cv = new Variable(v.name(), t.typeName, t.params, t.isTypeParam);
      cv.description = v.description();
      convVars.push(cv);
    }
    return this.addVariables(...convVars);
  }

  /**
   * AddVariables adds one or more vairables to the config.
   */
  addVariables(...variables: Variable[]): Config {
    for (const v of variables) {
      this.variables.push(v);
    }
    return this;
  }

  /**
   * SetContextVariable configures the ContextVariable for this configuration.
   */
  setContextVariable(ctx: ContextVariable): Config {
    this.contextVariable = ctx;
    return this;
  }

  /**
   * AddFunctionDecls adds one or more functions to the config, converting them to serializable values first.
   *
   * FunctionDecl inputs are expected to be well-formed.
   */
  addFunctionDecls(...funcs: FunctionDecl[]): Config {
    const convFuncs: Function[] = [];
    for (const fn of funcs) {
      if (!fn) {
        continue;
      }
      const overloads: Overload[] = [];
      for (const o of fn.overloadDecls()) {
        const overloadID = o.id();
        const args: TypeDesc[] = [];
        for (const a of o.argTypes()) {
          args.push(serializeTypeDesc(a));
        }
        const ret = serializeTypeDesc(o.resultType());
        let overload: Overload;
        if (o.isMemberFunction()) {
          overload = new Overload(overloadID, [], args[0], args.slice(1), ret);
        } else {
          overload = new Overload(overloadID, [], undefined, args, ret);
        }
        const exampleCount = o.examples().length;
        if (exampleCount > 0) {
          overload.examples = o.examples();
        }
        overloads.push(overload);
      }
      const cf = new Function(fn.name(), undefined, overloads);
      cf.description = fn.description();
      convFuncs.push(cf);
    }
    return this.addFunctions(...convFuncs);
  }

  /**
   * AddFunctions adds one or more functions to the config.
   */
  addFunctions(...funcs: Function[]): Config {
    for (const f of funcs) {
      this.functions.push(f);
    }
    return this;
  }

  /**
   * SetStdLib configures the LibrarySubset for the standard library.
   */
  setStdLib(stdLib: LibrarySubset): Config {
    this.stdLib = stdLib;
    return this;
  }

  /**
   * AddImports appends a set of imports to the config.
   */
  addImports(...imports: Import[]): Config {
    for (const imp of imports) {
      this.imports.push(imp);
    }
    return this;
  }

  /**
   * AddExtensions appends a set of extensions to the config.
   */
  addExtensions(...extensions: Extension[]): Config {
    for (const ext of extensions) {
      this.extensions.push(ext);
    }
    return this;
  }

  /**
   * AddValidators appends one or more validators to the config.
   */
  addValidators(...validators: Validator[]): Config {
    for (const val of validators) {
      this.validators.push(val);
    }
    return this;
  }

  /**
   * AddFeatures appends one or more features to the config.
   */
  addFeatures(...features: Feature[]): Config {
    for (const feat of features) {
      this.features.push(feat);
    }
    return this;
  }

  toJson(): ConfigJson {
    return {
      name: this.name,
      description: this.description,
      container: this.container,
      imports: arrOrUndefined(this.imports.map((i) => i.toJson())),
      stdlib: this.stdLib?.toJson(),
      extensions: arrOrUndefined(this.extensions.map((e) => e.toJson())),
      context_variable: this.contextVariable?.toJson(),
      variables: arrOrUndefined(this.variables.map((v) => v.toJson())),
      functions: arrOrUndefined(this.functions.map((f) => f.toJson())),
      validators: arrOrUndefined(this.validators.map((v) => v.toJson())),
      features: arrOrUndefined(this.features.map((f) => f.toJson())),
    };
  }

  static fromJson(json: ConfigJson): Config {
    const imports: Import[] = [];
    for (const i of json.imports ?? []) {
      const imp = Import.fromJson(i);
      imports.push(imp);
    }
    const extensions: Extension[] = [];
    for (const e of json.extensions ?? []) {
      const ext = Extension.fromJson(e);
      extensions.push(ext);
    }
    const variables: Variable[] = [];
    for (const v of json.variables ?? []) {
      const varDecl = Variable.fromJson(v);
      variables.push(varDecl);
    }
    const functions: Function[] = [];
    for (const f of json.functions ?? []) {
      const func = Function.fromJson(f);
      functions.push(func);
    }
    const validators: Validator[] = [];
    for (const v of json.validators ?? []) {
      const val = Validator.fromJson(v);
      validators.push(val);
    }
    const features: Feature[] = [];
    for (const f of json.features ?? []) {
      const feat = Feature.fromJson(f);
      features.push(feat);
    }
    return new Config(
      json.name,
      json.description,
      json.container,
      imports,
      json.stdlib ? LibrarySubset.fromJson(json.stdlib) : undefined,
      extensions,
      json.context_variable ? ContextVariable.fromJson(json.context_variable) : undefined,
      variables,
      functions,
      validators,
      features
    );
  }
}

function arrOrUndefined<T>(arr?: T[] | null): T[] | undefined {
  if (!arr || arr.length === 0) {
    return undefined;
  }
  return arr;
}
