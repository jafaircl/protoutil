import {
  overload as declarationOverload,
  excludeOverloads,
  type FunctionDecl,
  func,
  includeOverloads,
  memberOverload,
  type OverloadDecl,
  type VariableDecl,
  variable,
  variableWithDoc,
} from "../decls.js";
import type { Provider as TypeProvider } from "../types/provider.js";
import {
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  IntType,
  Kind,
  listType,
  mapType,
  NullType,
  nullableType,
  objectType,
  opaqueType,
  optionalType,
  StringType,
  TimestampType,
  Type,
  TypeType,
  typeParamType,
  typeTypeWithParam,
  UintType,
} from "../types/types.js";

function joinErrors(errors: Array<Error | undefined>): Error | undefined {
  const filtered = errors.filter((err): err is Error => err !== undefined);
  if (filtered.length === 0) {
    return undefined;
  }
  if (filtered.length === 1) {
    return filtered[0];
  }
  return new Error(filtered.map((err) => err.message).join("\n"));
}

/**
 * Config represents a serializable form of the CEL environment configuration.
 *
 * Note: custom validations, feature flags, and performance tuning parameters are not (yet)
 * considered part of the core CEL environment configuration and should be managed separately
 * until a common convention for such settings is developed.
 */
export class Config {
  public description = "";
  public container = "";
  public imports: Import[] = [];
  public stdlib?: LibrarySubset;
  public extensions: Extension[] = [];
  public contextVariable?: ContextVariable;
  public variables: Variable[] = [];
  public functions: Function[] = [];
  public validators: Validator[] = [];
  public features: Feature[] = [];
  public limits: Limit[] = [];

  /** Constructor creates an instance of a YAML serializable CEL environment configuration. */
  constructor(public name: string) {}

  /** Validate validates the whole configuration is well-formed. */
  public validate(): Error | undefined {
    const errors: Error[] = [];
    for (const entry of this.imports) {
      const err = entry.validate();
      if (err) {
        errors.push(err);
      }
    }
    const stdlibErr = this.stdlib?.validate();
    if (stdlibErr) {
      errors.push(stdlibErr);
    }
    for (const extension of this.extensions) {
      const err = extension.validate();
      if (err) {
        errors.push(err);
      }
    }
    const contextErr = this.contextVariable?.validate();
    if (contextErr) {
      errors.push(contextErr);
    }
    if (this.contextVariable && this.variables.length !== 0) {
      errors.push(
        new Error("invalid config: either context variable or variables may be set, but not both"),
      );
    }
    for (const variable of this.variables) {
      const err = variable.validate();
      if (err) {
        errors.push(err);
      }
    }
    for (const fn of this.functions) {
      const err = fn.validate();
      if (err) {
        errors.push(err);
      }
    }
    for (const feature of this.features) {
      const err = feature.validate();
      if (err) {
        errors.push(err);
      }
    }
    for (const limit of this.limits) {
      const err = limit.validate();
      if (err) {
        errors.push(err);
      }
    }
    for (const validator of this.validators) {
      const err = validator.validate();
      if (err) {
        errors.push(err);
      }
    }
    return joinErrors(errors);
  }

  /** SetContainer configures the container name for this configuration. */
  public setContainer(container: string): this {
    this.container = container;
    return this;
  }

  /** AddVariableDecls adds one or more variables to the config, converting them to serializable values first. */
  public addVariableDecls(...vars: Array<VariableDecl | undefined>): this {
    const converted: Variable[] = [];
    for (const declaration of vars) {
      if (!declaration) {
        continue;
      }
      const serial = configVariable({
        name: declaration.name(),
        type: serializeTypeDesc(declaration.type()),
        description: declaration.description(),
      });
      converted.push(serial);
    }
    return this.addVariables(...converted);
  }

  /** AddVariables adds one or more variables to the config. */
  public addVariables(...vars: Array<Variable | undefined>): this {
    this.variables.push(...vars.filter((entry): entry is Variable => entry !== undefined));
    return this;
  }

  /** SetContextVariable configures the ContextVariable for this configuration. */
  public setContextVariable(ctx?: ContextVariable): this {
    this.contextVariable = ctx;
    return this;
  }

  /** AddFunctionDecls adds one or more functions to the config, converting them to serializable values first. */
  public addFunctionDecls(...funcs: Array<FunctionDecl | undefined>): this {
    const converted: Function[] = [];
    for (const fn of funcs) {
      if (!fn) {
        continue;
      }
      const overloads = fn.overloadDecls().map((entry) => {
        const argTypes = entry.argTypes().map((arg) => serializeTypeDesc(arg));
        const resultType = serializeTypeDesc(entry.resultType());
        const examples = entry.examples();
        if (entry.isMemberFunction()) {
          return configOverload({
            id: entry.id(),
            args: argTypes.slice(1),
            returnType: resultType,
            target: argTypes[0],
            examples,
          });
        }
        return configOverload({
          id: entry.id(),
          args: argTypes,
          returnType: resultType,
          examples,
        });
      });
      const serial = configFunc({
        name: fn.name(),
        overloads,
        description: fn.description(),
      });
      converted.push(serial);
    }
    return this.addFunctions(...converted);
  }

  /** AddFunctions adds one or more functions to the config. */
  public addFunctions(...funcs: Array<Function | undefined>): this {
    this.functions.push(...funcs.filter((entry): entry is Function => entry !== undefined));
    return this;
  }

  /** SetStdLib configures the LibrarySubset for the standard library. */
  public setStdLib(subset?: LibrarySubset): this {
    this.stdlib = subset;
    return this;
  }

  /** AddImports appends a set of imports to the config. */
  public addImports(...imports: Array<Import | undefined>): this {
    this.imports.push(...imports.filter((entry): entry is Import => entry !== undefined));
    return this;
  }

  /** AddExtensions appends a set of extensions to the config. */
  public addExtensions(...extensions: Array<Extension | undefined>): this {
    this.extensions.push(...extensions.filter((entry): entry is Extension => entry !== undefined));
    return this;
  }

  /** AddValidators appends one or more validators to the config. */
  public addValidators(...validators: Array<Validator | undefined>): this {
    this.validators.push(...validators.filter((entry): entry is Validator => entry !== undefined));
    return this;
  }

  /** AddFeatures appends one or more features to the config. */
  public addFeatures(...features: Array<Feature | undefined>): this {
    this.features.push(...features.filter((entry): entry is Feature => entry !== undefined));
    return this;
  }

  /** AddLimits appends one or more limits to the config. */
  public addLimits(...limits: Array<Limit | undefined>): this {
    this.limits.push(...limits.filter((entry): entry is Limit => entry !== undefined));
    return this;
  }
}

/**
 * Import represents a type name that will be abbreviated by its simple name using
 * the cel.Abbrevs() option.
 */
export class Import {
  /** Constructor returns a serializable import value from the qualified type name. */
  constructor(public name: string) {}

  /** Validate validates the import configuration is well-formed. */
  public validate(): Error | undefined {
    if (this.name === "") {
      return new Error("invalid import: missing type name");
    }
    return undefined;
  }
}

/**
 * Variable represents a typed variable declaration which will be published via the
 * cel.VariableDecls() option.
 */
export class Variable {
  public description = "";
  public type?: TypeDesc;

  /** Constructor returns a serializable variable from a name and type definition. */
  constructor(
    public name: string,
    public typeDesc?: TypeDesc,
  ) {}

  /** Validate validates the variable configuration is well-formed. */
  public validate(): Error | undefined {
    if (this.name === "") {
      return new Error("invalid variable: missing variable name");
    }
    const type = this.getType();
    if (!type) {
      return new Error(`invalid variable "${this.name}": invalid type: nil`);
    }
    const typeErr = type.validate();
    if (typeErr) {
      return new Error(`invalid variable "${this.name}": ${typeErr.message}`);
    }
    if (type.isTypeParam) {
      return new Error(`invalid variable "${this.name}": variables cannot be type parameters`);
    }
    return undefined;
  }

  /** GetType returns the variable type description. */
  public getType(): TypeDesc | undefined {
    return this.typeDesc ?? this.type;
  }

  /** AsCELVariable converts the serializable form of the Variable into a CEL environment declaration. */
  public asCELVariable(tp: TypeProvider): VariableDecl {
    const err = this.validate();
    if (err) {
      throw err;
    }
    const type = this.getType()!.asCELType(tp);
    return this.description.length === 0
      ? variable(this.name, type)
      : variableWithDoc(this.name, type, this.description);
  }
}

/**
 * ContextVariable represents a structured message whose fields are to be treated as the top-level
 * variable identifiers within CEL expressions.
 */
export class ContextVariable {
  /** Constructor creates a serializable context variable with a specific type name. */
  constructor(public typeName: string) {}

  /** Validate validates the context-variable configuration is well-formed. */
  public validate(): Error | undefined {
    if (this.typeName === "") {
      return new Error("invalid context variable: missing type name");
    }
    return undefined;
  }
}

/**
 * Function represents the serializable format of a function and its overloads.
 */
// biome-ignore lint/suspicious/noShadowRestrictedNames: cel-go parity
export class Function {
  public description = "";

  /** Constructor creates a serializable function and overload set. */
  constructor(
    public name: string,
    public overloads: Overload[] = [],
  ) {}

  /** Validate validates the function configuration is well-formed. */
  public validate(): Error | undefined {
    if (this.name === "") {
      return new Error("invalid function: missing function name");
    }
    if (this.overloads.length === 0) {
      return new Error(`invalid function "${this.name}": missing overloads`);
    }
    const errors: Error[] = [];
    for (const overloadConfig of this.overloads) {
      const err = overloadConfig.validate();
      if (err) {
        errors.push(new Error(`invalid function "${this.name}": ${err.message}`));
      }
    }
    return joinErrors(errors);
  }

  /** AsCELFunction converts the serializable form of the Function into a CEL environment declaration. */
  public asCELFunction(tp: TypeProvider): FunctionDecl {
    const err = this.validate();
    if (err) {
      throw err;
    }
    const overloads = this.overloads.map((overloadConfig) => overloadConfig.asFunctionOption(tp));
    return func(this.name, {
      doc: this.description.length === 0 ? undefined : this.description,
      overloads,
    });
  }
}

/**
 * Overload represents the serializable format of a function overload.
 */
export class Overload {
  public id: string;
  public args: TypeDesc[];
  public ["return"]?: TypeDesc;
  public target?: TypeDesc;
  public examples: string[];

  /** Constructor returns a new serializable representation of a global or member overload. */
  constructor(
    id: string,
    args: TypeDesc[] = [],
    returnType?: TypeDesc,
    target?: TypeDesc,
    examples: string[] = [],
  ) {
    this.id = id;
    this.args = args;
    this["return"] = returnType;
    this.target = target;
    this.examples = examples;
  }

  /** Validate validates the overload configuration is well-formed. */
  public validate(): Error | undefined {
    if (this.id === "") {
      return new Error("invalid overload: missing overload id");
    }
    const errors: Error[] = [];
    if (this.target) {
      const targetErr = this.target.validate();
      if (targetErr) {
        errors.push(new Error(`invalid overload "${this.id}" target: ${targetErr.message}`));
      }
    }
    this.args.forEach((arg, index) => {
      const argErr = arg.validate();
      if (argErr) {
        errors.push(new Error(`invalid overload "${this.id}" arg[${index}]: ${argErr.message}`));
      }
    });
    const resultType = this["return"];
    if (!resultType) {
      errors.push(new Error(`invalid overload "${this.id}" return: invalid type: nil`));
    } else {
      const resultErr = resultType.validate();
      if (resultErr) {
        errors.push(new Error(`invalid overload "${this.id}" return: ${resultErr.message}`));
      }
    }
    return joinErrors(errors);
  }

  /** AsFunctionOption converts the serializable form of the Overload into a function declaration option. */
  public asFunctionOption(tp: TypeProvider): OverloadDecl {
    const err = this.validate();
    if (err) {
      throw err;
    }
    const argTypes = this.args.map((arg) => arg.asCELType(tp));
    const resultType = this["return"]!.asCELType(tp);
    const doc = this.examples.length === 0 ? undefined : this.examples;
    if (this.target) {
      const targetType = this.target.asCELType(tp);
      return memberOverload(this.id, [targetType, ...argTypes], resultType, { doc });
    }
    return declarationOverload(this.id, argTypes, resultType, { doc });
  }
}

/**
 * Extension represents a named and optionally versioned extension library configured in the environment.
 */
export class Extension {
  /** Constructor creates a serializable Extension from a name and version string. */
  constructor(
    public name: string,
    public version = "",
  ) {}

  /** Validate validates the extension configuration is well-formed. */
  public validate(): Error | undefined {
    try {
      this.versionNumber();
      return undefined;
    } catch (err) {
      return err as Error;
    }
  }

  /** VersionNumber returns the parsed version string, or throws if the version cannot be parsed. */
  public versionNumber(): number {
    if (this.name === "") {
      throw new Error("invalid extension: missing name");
    }
    if (this.version === "latest") {
      return 0xffffffff;
    }
    if (this.version === "") {
      return 0;
    }
    if (!/^\d+$/.test(this.version)) {
      throw new Error(`invalid extension "${this.name}" version: invalid syntax`);
    }
    return Number.parseInt(this.version, 10);
  }
}

/**
 * LibrarySubset indicates a subset of the macros and function supported by a subsettable library.
 */
export class LibrarySubset {
  public disabled = false;
  public disableMacros = false;
  public includeMacros: string[] = [];
  public excludeMacros: string[] = [];
  public includeFunctions: Function[] = [];
  public excludeFunctions: Function[] = [];

  /** Validate validates the library configuration is well-formed. */
  public validate(): Error | undefined {
    const errors: Error[] = [];
    if (this.includeMacros.length !== 0 && this.excludeMacros.length !== 0) {
      errors.push(new Error("invalid subset: cannot both include and exclude macros"));
    }
    if (this.includeFunctions.length !== 0 && this.excludeFunctions.length !== 0) {
      errors.push(new Error("invalid subset: cannot both include and exclude functions"));
    }
    return joinErrors(errors);
  }

  /** SubsetFunction produces a function declaration which matches the supported subset. */
  public subsetFunction(fn: FunctionDecl): [FunctionDecl | undefined, boolean] {
    if (this.disabled) {
      return [undefined, false];
    }
    if (this.includeFunctions.length !== 0) {
      for (const include of this.includeFunctions) {
        if (include.name !== fn.name()) {
          continue;
        }
        if (include.overloads.length === 0) {
          return [fn, true];
        }
        return [fn.subset(includeOverloads(...include.overloads.map((entry) => entry.id))), true];
      }
      return [undefined, false];
    }
    if (this.excludeFunctions.length !== 0) {
      for (const exclude of this.excludeFunctions) {
        if (exclude.name !== fn.name()) {
          continue;
        }
        if (exclude.overloads.length === 0) {
          return [undefined, false];
        }
        return [fn.subset(excludeOverloads(...exclude.overloads.map((entry) => entry.id))), true];
      }
    }
    return [fn, true];
  }

  /** SubsetMacro indicates whether the macro function should be included in the library subset. */
  public subsetMacro(macroFunction: string): boolean {
    if (this.disabled || this.disableMacros) {
      return false;
    }
    if (this.includeMacros.length !== 0) {
      return this.includeMacros.includes(macroFunction);
    }
    if (this.excludeMacros.length !== 0) {
      return !this.excludeMacros.includes(macroFunction);
    }
    return true;
  }

  /** SetDisabled disables or enables the library. */
  public setDisabled(value: boolean): this {
    this.disabled = value;
    return this;
  }

  /** SetDisableMacros disables the macros for the library. */
  public setDisableMacros(value: boolean): this {
    this.disableMacros = value;
    return this;
  }

  /** AddIncludedMacros allow-lists one or more macros by function name. */
  public addIncludedMacros(...macros: string[]): this {
    this.includeMacros.push(...macros);
    return this;
  }

  /** AddExcludedMacros deny-lists one or more macros by function name. */
  public addExcludedMacros(...macros: string[]): this {
    this.excludeMacros.push(...macros);
    return this;
  }

  /** AddIncludedFunctions allow-lists one or more functions from the subset. */
  public addIncludedFunctions(...funcs: Function[]): this {
    this.includeFunctions.push(...funcs);
    return this;
  }

  /** AddExcludedFunctions deny-lists one or more functions from the subset. */
  public addExcludedFunctions(...funcs: Function[]): this {
    this.excludeFunctions.push(...funcs);
    return this;
  }
}

/**
 * Validator represents a named validator with an optional map-based configuration object.
 */
export class Validator {
  public config: Record<string, unknown> = {};

  /** Constructor returns a named Validator instance. */
  constructor(public name: string) {}

  /** Validate validates the configuration of the validator object. */
  public validate(): Error | undefined {
    if (this.name === "") {
      return new Error("invalid validator: missing name");
    }
    return undefined;
  }

  /** SetConfig sets the set of map key-value pairs associated with this validator's configuration. */
  public setConfig(config: Record<string, unknown>): this {
    this.config = config;
    return this;
  }

  /** ConfigValue retrieves the value associated with the config key name, if one exists. */
  public configValue(name: string): [unknown, boolean] {
    if (!(name in this.config)) {
      return [undefined, false];
    }
    return [this.config[name], true];
  }
}

/**
 * Feature represents a named boolean feature flag supported by CEL.
 */
export class Feature {
  /** Constructor creates a new feature flag with a boolean enablement flag. */
  constructor(
    public name: string,
    public enabled: boolean,
  ) {}

  /** Validate validates whether the feature is well-configured. */
  public validate(): Error | undefined {
    if (this.name === "") {
      return new Error("invalid feature: missing name");
    }
    return undefined;
  }
}

/**
 * Limit represents a named limit in the CEL environment.
 */
export class Limit {
  /** Constructor creates a new limit. */
  constructor(
    public name: string,
    public value: number,
  ) {}

  /** Validate validates a limit. */
  public validate(): Error | undefined {
    if (this.name === "") {
      return new Error("invalid limit: missing name");
    }
    return undefined;
  }
}

/**
 * TypeDesc represents the serializable format of a CEL Type value.
 */
export class TypeDesc {
  /** Constructor describes a simple or complex type with parameters. */
  constructor(
    public typeName: string,
    public params: TypeDesc[] = [],
    public isTypeParam = false,
  ) {}
  public toString(): string {
    const formattedParams = this.params.map((entry) => entry.toString());
    return formattedParams.length === 0
      ? this.typeName
      : `${this.typeName}(${formattedParams.join(",")})`;
  }

  /** Validate validates the type configuration is well-formed. */
  public validate(): Error | undefined {
    if (this.typeName === "") {
      return new Error("invalid type: missing type name");
    }
    if (this.isTypeParam && this.params.length !== 0) {
      return new Error("invalid type: param type cannot have parameters");
    }
    switch (this.typeName) {
      case "list":
        if (this.params.length !== 1) {
          return new Error(`invalid type: list expects 1 parameter, got ${this.params.length}`);
        }
        break;
      case "map":
        if (this.params.length !== 2) {
          return new Error(`invalid type: map expects 2 parameters, got ${this.params.length}`);
        }
        break;
      case "optional_type":
        if (this.params.length !== 1) {
          return new Error(
            `invalid type: optional_type expects 1 parameter, got ${this.params.length}`,
          );
        }
        break;
      case "type":
        if (this.params.length > 1) {
          return new Error(
            `invalid type: type expects 0 or 1 parameters, got ${this.params.length}`,
          );
        }
        break;
      default:
        break;
    }
    for (const param of this.params) {
      const err = param.validate();
      if (err) {
        return err;
      }
    }
    return undefined;
  }

  /** SpecifierFormat returns the short text representation of the type. e.g. "map<string, int>". */
  public specifierFormat(): string {
    if (this.isTypeParam) {
      return `~${this.typeName}`;
    }
    if (this.params.length === 0) {
      return this.typeName;
    }
    return `${this.typeName}<${this.params.map((entry) => entry.specifierFormat()).join(", ")}>`;
  }

  /** AsCELType converts the serializable object to a CEL native Type value. */
  public asCELType(tp: TypeProvider): Type {
    const err = this.validate();
    if (err) {
      throw err;
    }
    switch (this.typeName) {
      case "dyn":
        return DynType;
      case "duration":
        return DurationType;
      case "timestamp":
        return TimestampType;
      case "any":
        return objectType("google.protobuf.Any");
      case "null":
      case "null_type":
        return NullType;
      case "bool":
        return BoolType;
      case "bytes":
        return BytesType;
      case "double":
        return DoubleType;
      case "int":
        return IntType;
      case "string":
        return StringType;
      case "uint":
        return UintType;
      case "bool_wrapper":
      case "google.protobuf.BoolValue":
        return nullableType(BoolType);
      case "bytes_wrapper":
      case "google.protobuf.BytesValue":
        return nullableType(BytesType);
      case "double_wrapper":
      case "google.protobuf.DoubleValue":
      case "google.protobuf.FloatValue":
        return nullableType(DoubleType);
      case "int_wrapper":
      case "google.protobuf.Int64Value":
      case "google.protobuf.Int32Value":
        return nullableType(IntType);
      case "uint_wrapper":
      case "google.protobuf.UInt64Value":
      case "google.protobuf.UInt32Value":
        return nullableType(UintType);
      case "string_wrapper":
      case "google.protobuf.StringValue":
        return nullableType(StringType);
      case "map":
        return mapType(this.params[0]!.asCELType(tp), this.params[1]!.asCELType(tp));
      case "list":
        return listType(this.params[0]!.asCELType(tp));
      case "optional_type":
        return optionalType(this.params[0]!.asCELType(tp));
      case "type":
        return this.params.length === 0
          ? TypeType
          : typeTypeWithParam(this.params[0]!.asCELType(tp));
      default:
        break;
    }
    if (this.isTypeParam) {
      return typeParamType(this.typeName);
    }
    const structType = tp.findStructType(this.typeName);
    if (structType) {
      // FindStructType returns `type(T)`. The first parameter is the type name.
      return structType.parameters()[0] ?? structType;
    }
    const ident = tp.findIdent(this.typeName);
    if (!(ident instanceof Type)) {
      throw new Error(`undefined type name: "${this.typeName}"`);
    }
    if (this.params.length === 0) {
      return ident;
    }
    return opaqueType(this.typeName, ...this.params.map((param) => param.asCELType(tp)));
  }
}

/** ConfigOptions configures a YAML-serializable CEL environment. */
export interface ConfigOptions {
  name: string;
  description?: string;
  container?: string;
  imports?: Import[];
  stdlib?: LibrarySubset;
  extensions?: Extension[];
  contextVariable?: ContextVariable;
  variables?: Variable[];
  functions?: Function[];
  validators?: Validator[];
  features?: Feature[];
  limits?: Limit[];
}

/** Config creates an instance of a YAML-serializable CEL environment configuration. */
export function config(options: ConfigOptions): Config {
  const value = new Config(options.name);
  value.description = options.description ?? "";
  value.container = options.container ?? "";
  value.imports = [...(options.imports ?? [])];
  value.stdlib = options.stdlib;
  value.extensions = [...(options.extensions ?? [])];
  value.contextVariable = options.contextVariable;
  value.variables = [...(options.variables ?? [])];
  value.functions = [...(options.functions ?? [])];
  value.validators = [...(options.validators ?? [])];
  value.features = [...(options.features ?? [])];
  value.limits = [...(options.limits ?? [])];
  return value;
}

/**
 * ConfigImportType returns a serializable import value from the qualified type name.
 *
 * The name avoids colliding with the JavaScript `import` keyword.
 */
export function configImportType(name: string): Import {
  return new Import(name);
}

/** VariableOptions configures a serializable typed variable declaration. */
export interface VariableOptions {
  name: string;
  type?: TypeDesc;
  description?: string;
}

/** ConfigVariable returns a serializable variable from a name and type definition. */
export function configVariable(options: VariableOptions): Variable {
  const value = new Variable(options.name, options.type);
  value.description = options.description ?? "";
  return value;
}

/** ConfigContextVariable creates a serializable context variable with a specific type name. */
export function configContextVariable(typeName: string): ContextVariable {
  return new ContextVariable(typeName);
}

/** FuncOptions configures a serializable function and its overload set. */
export interface FuncOptions {
  name: string;
  overloads?: Overload[];
  description?: string;
}

/** ConfigFunc creates a serializable function and overload set. */
export function configFunc(options: FuncOptions): Function {
  const value = new Function(options.name, [...(options.overloads ?? [])]);
  value.description = options.description ?? "";
  return value;
}

/** OverloadOptions configures a serializable global or member overload. */
export interface OverloadOptions {
  id: string;
  args?: TypeDesc[];
  returnType?: TypeDesc;
  target?: TypeDesc;
  examples?: string[];
}

/** ConfigOverload returns a serializable representation of a global or member overload. */
export function configOverload(options: OverloadOptions): Overload {
  return new Overload(options.id, [...(options.args ?? [])], options.returnType, options.target, [
    ...(options.examples ?? []),
  ]);
}

/** ConfigExtension creates a serializable extension from a name and version string. */
export function configExtension(name: string, version?: string): Extension {
  return new Extension(name, version);
}

/** LibrarySubsetOptions configures the macros and functions supported by a subsettable library. */
export interface LibrarySubsetOptions {
  disabled?: boolean;
  disableMacros?: boolean;
  includeMacros?: string[];
  excludeMacros?: string[];
  includeFunctions?: Function[];
  excludeFunctions?: Function[];
}

/** ConfigLibrarySubset creates a configurable subset of macros and functions. */
export function configLibrarySubset(options: LibrarySubsetOptions = {}): LibrarySubset {
  const value = new LibrarySubset();
  value.disabled = options.disabled ?? false;
  value.disableMacros = options.disableMacros ?? false;
  value.includeMacros = [...(options.includeMacros ?? [])];
  value.excludeMacros = [...(options.excludeMacros ?? [])];
  value.includeFunctions = [...(options.includeFunctions ?? [])];
  value.excludeFunctions = [...(options.excludeFunctions ?? [])];
  return value;
}

/** ConfigValidator returns a named validator instance. */
export function configValidator(name: string, config: Record<string, unknown> = {}): Validator {
  const value = new Validator(name);
  value.config = { ...config };
  return value;
}

/** ConfigFeature creates a feature flag with a boolean enablement flag. */
export function configFeature(name: string, enabled: boolean): Feature {
  return new Feature(name, enabled);
}

/** ConfigLimit creates a named CEL environment limit. */
export function configLimit(name: string, value: number): Limit {
  return new Limit(name, value);
}

/** TypeDescOptions configures a serializable CEL type description. */
export interface TypeDescOptions {
  typeName: string;
  params?: TypeDesc[];
  isTypeParam?: boolean;
}

/** ConfigTypeDesc describes a simple or complex type with parameters. */
export function configTypeDesc(options: TypeDescOptions): TypeDesc {
  return new TypeDesc(options.typeName, [...(options.params ?? [])], options.isTypeParam);
}

const wrapperTypeNames = new Map<Kind, string>([
  [Kind.Bool, "google.protobuf.BoolValue"],
  [Kind.Bytes, "google.protobuf.BytesValue"],
  [Kind.Double, "google.protobuf.DoubleValue"],
  [Kind.Int, "google.protobuf.Int64Value"],
  [Kind.String, "google.protobuf.StringValue"],
  [Kind.Uint, "google.protobuf.UInt64Value"],
]);

/** SerializeTypeDesc converts a CEL native Type to a serializable TypeDesc. */
export function serializeTypeDesc(t: Type): TypeDesc {
  if (t.kind() === Kind.TypeParam) {
    return configTypeDesc({ typeName: t.typeName(), isTypeParam: true });
  }
  let typeName = t.typeName();
  if (t !== NullType && t.isAssignableType(NullType)) {
    const wrapperType = wrapperTypeNames.get(t.kind());
    if (wrapperType) {
      return configTypeDesc({ typeName: wrapperType });
    }
  }
  const params = t.parameters().map((param) => serializeTypeDesc(param));
  switch (t.kind()) {
    case Kind.Error:
      typeName = "*error*";
      break;
    case Kind.Unknown:
      typeName = "*unknown*";
      break;
    case Kind.Unspecified:
      typeName = "*unspecified type*";
      break;
    default:
      break;
  }
  return configTypeDesc({ typeName, params });
}

type RawObject = Record<string, unknown>;

function isRecord(value: unknown): value is RawObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringValue(value: unknown): string {
  return value === undefined ? "" : String(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function typeDescFromRaw(value: unknown): TypeDesc | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return parseTypeDesc(value);
  }
  if (!isRecord(value)) {
    throw new Error("unsupported yaml for TypeDesc");
  }
  return configTypeDesc({
    typeName: toStringValue(value.type_name),
    params: Array.isArray(value.params) ? value.params.map((entry) => typeDescFromRaw(entry)!) : [],
    isTypeParam: Boolean(value.is_type_param),
  });
}

/** HydrateConfig converts parsed YAML/JSON data into a Config instance. */
export function hydrateConfig(raw: unknown): Config {
  if (!isRecord(raw)) {
    throw new Error("invalid config: expected object");
  }
  const configValue = config({
    name: toStringValue(raw.name),
    description: toStringValue(raw.description),
    container: toStringValue(raw.container),
    imports: Array.isArray(raw.imports)
      ? raw.imports.map((entry) => configImportType(toStringValue((entry as RawObject).name)))
      : [],
    stdlib: isRecord(raw.stdlib) ? hydrateLibrarySubset(raw.stdlib) : undefined,
    extensions: Array.isArray(raw.extensions)
      ? raw.extensions.map((entry) => {
          const obj = entry as RawObject;
          return configExtension(toStringValue(obj.name), toStringValue(obj.version));
        })
      : [],
    contextVariable: isRecord(raw.context_variable)
      ? configContextVariable(toStringValue((raw.context_variable as RawObject).type_name))
      : undefined,
    variables: Array.isArray(raw.variables)
      ? raw.variables.map((entry) => hydrateVariable(entry))
      : [],
    functions: Array.isArray(raw.functions)
      ? raw.functions.map((entry) => hydrateFunction(entry))
      : [],
    validators: Array.isArray(raw.validators)
      ? raw.validators.map((entry) => {
          const obj = entry as RawObject;
          return configValidator(
            toStringValue(obj.name),
            isRecord(obj.config) ? obj.config : undefined,
          );
        })
      : [],
    features: Array.isArray(raw.features)
      ? raw.features.map((entry) => {
          const obj = entry as RawObject;
          return configFeature(toStringValue(obj.name), Boolean(obj.enabled));
        })
      : [],
    limits: Array.isArray(raw.limits)
      ? raw.limits.map((entry) => {
          const obj = entry as RawObject;
          return configLimit(toStringValue(obj.name), Number(obj.value ?? 0));
        })
      : [],
  });
  return configValue;
}

function hydrateLibrarySubset(raw: RawObject): LibrarySubset {
  return configLibrarySubset({
    disabled: Boolean(raw.disabled),
    disableMacros: Boolean(raw.disable_macros),
    includeMacros: toStringArray(raw.include_macros),
    excludeMacros: toStringArray(raw.exclude_macros),
    includeFunctions: Array.isArray(raw.include_functions)
      ? raw.include_functions.map((entry) => hydrateFunction(entry))
      : [],
    excludeFunctions: Array.isArray(raw.exclude_functions)
      ? raw.exclude_functions.map((entry) => hydrateFunction(entry))
      : [],
  });
}

function hydrateVariable(raw: unknown): Variable {
  const obj = raw as RawObject;
  const variableValue = configVariable({
    name: toStringValue(obj.name),
    type:
      obj.type_name !== undefined || obj.params !== undefined || obj.is_type_param !== undefined
        ? typeDescFromRaw(obj)
        : typeDescFromRaw(obj.type),
    description: toStringValue(obj.description),
  });
  if (obj.type !== undefined && obj.type_name !== undefined) {
    variableValue.type = typeDescFromRaw(obj.type);
  }
  return variableValue;
}

function hydrateFunction(raw: unknown): Function {
  const obj = raw as RawObject;
  return configFunc({
    name: toStringValue(obj.name),
    overloads: Array.isArray(obj.overloads)
      ? obj.overloads.map((entry) => hydrateOverload(entry))
      : [],
    description: toStringValue(obj.description),
  });
}

function hydrateOverload(raw: unknown): Overload {
  const obj = raw as RawObject;
  return configOverload({
    id: toStringValue(obj.id),
    args: Array.isArray(obj.args) ? obj.args.map((entry) => typeDescFromRaw(entry)!) : [],
    returnType: typeDescFromRaw(obj.return),
    target: typeDescFromRaw(obj.target),
    examples: toStringArray(obj.examples),
  });
}

/** SerializeConfig converts a Config instance to a plain object for YAML/JSON output. */
export function serializeConfig(config: Config): RawObject {
  const out: RawObject = {};
  if (config.name !== "") {
    out.name = config.name;
  }
  if (config.description !== "") {
    out.description = config.description;
  }
  if (config.container !== "") {
    out.container = config.container;
  }
  if (config.imports.length !== 0) {
    out.imports = config.imports.map((entry) => ({ name: entry.name }));
  }
  if (config.stdlib) {
    out.stdlib = serializeLibrarySubset(config.stdlib);
  }
  if (config.extensions.length !== 0) {
    out.extensions = config.extensions.map((entry) => ({
      name: entry.name,
      ...(entry.version !== "" ? { version: entry.version } : {}),
    }));
  }
  if (config.contextVariable) {
    out.context_variable = { type_name: config.contextVariable.typeName };
  }
  if (config.variables.length !== 0) {
    out.variables = config.variables.map((entry) => serializeVariable(entry));
  }
  if (config.functions.length !== 0) {
    out.functions = config.functions.map((entry) => serializeFunction(entry));
  }
  if (config.validators.length !== 0) {
    out.validators = config.validators.map((entry) => ({
      name: entry.name,
      ...(Object.keys(entry.config).length !== 0 ? { config: entry.config } : {}),
    }));
  }
  if (config.features.length !== 0) {
    out.features = config.features.map((entry) => ({ name: entry.name, enabled: entry.enabled }));
  }
  if (config.limits.length !== 0) {
    out.limits = config.limits.map((entry) => ({ name: entry.name, value: entry.value }));
  }
  return out;
}

function serializeLibrarySubset(subset: LibrarySubset): RawObject {
  return {
    ...(subset.disabled ? { disabled: true } : {}),
    ...(subset.disableMacros ? { disable_macros: true } : {}),
    ...(subset.includeMacros.length !== 0 ? { include_macros: subset.includeMacros } : {}),
    ...(subset.excludeMacros.length !== 0 ? { exclude_macros: subset.excludeMacros } : {}),
    ...(subset.includeFunctions.length !== 0
      ? { include_functions: subset.includeFunctions.map((entry) => serializeFunction(entry)) }
      : {}),
    ...(subset.excludeFunctions.length !== 0
      ? { exclude_functions: subset.excludeFunctions.map((entry) => serializeFunction(entry)) }
      : {}),
  };
}

function serializeVariable(variable: Variable): RawObject {
  const type = variable.getType();
  return {
    name: variable.name,
    ...(variable.description !== "" ? { description: variable.description } : {}),
    ...(type ? serializeTypeDescObject(type) : {}),
  };
}

function serializeFunction(fn: Function): RawObject {
  return {
    name: fn.name,
    ...(fn.description !== "" ? { description: fn.description } : {}),
    ...(fn.overloads.length !== 0
      ? { overloads: fn.overloads.map((entry) => serializeOverload(entry)) }
      : {}),
  };
}

function serializeOverload(overloadConfig: Overload): RawObject {
  return {
    id: overloadConfig.id,
    ...(overloadConfig.examples.length !== 0 ? { examples: overloadConfig.examples } : {}),
    ...(overloadConfig.target ? { target: serializeTypeDescObject(overloadConfig.target) } : {}),
    ...(overloadConfig.args.length !== 0
      ? { args: overloadConfig.args.map((entry) => serializeTypeDescObject(entry)) }
      : {}),
    ...(overloadConfig["return"]
      ? { return: serializeTypeDescObject(overloadConfig["return"]) }
      : {}),
  };
}

function serializeTypeDescObject(type: TypeDesc): RawObject {
  return {
    type_name: type.typeName,
    ...(type.params.length !== 0
      ? { params: type.params.map((entry) => serializeTypeDescObject(entry)) }
      : {}),
    ...(type.isTypeParam ? { is_type_param: true } : {}),
  };
}

/** ParseTypeDesc parses a TypeDesc from the type specifier format: "map<string, int>". */
export function parseTypeDesc(text: string): TypeDesc {
  const parser = new TypeDescParser(text);
  const result = parser.parseTypeElem();
  parser.skipWhitespace();
  if (!parser.eof()) {
    throw new Error(
      `unexpected character "${parser.current()}" at position ${parser.pos} in "${text}"`,
    );
  }
  return result;
}

class TypeDescParser {
  public pos = 0;

  constructor(private readonly text: string) {}

  public eof(): boolean {
    return this.pos >= this.text.length;
  }

  public current(): string {
    return this.text[this.pos] ?? "";
  }

  public skipWhitespace(): void {
    while (isWhitespace(this.current())) {
      this.pos += 1;
    }
  }

  public parseTypeElem(): TypeDesc {
    this.skipWhitespace();
    if (this.current() === "~") {
      this.pos += 1;
      return configTypeDesc({ typeName: this.parseTypeParamIdent(), isTypeParam: true });
    }
    return this.parseConcreteType();
  }

  private parseConcreteType(): TypeDesc {
    const id = this.parseNamespaceIdentifier();
    if (this.current() !== "<") {
      return configTypeDesc({ typeName: id });
    }
    this.pos += 1;
    const params: TypeDesc[] = [];
    for (;;) {
      this.skipWhitespace();
      params.push(this.parseTypeElem());
      this.skipWhitespace();
      if (this.current() === ",") {
        this.pos += 1;
        continue;
      }
      if (this.current() === ">") {
        this.pos += 1;
        break;
      }
      throw new Error(`expected ',' or '>' at position ${this.pos}`);
    }
    return configTypeDesc({ typeName: id, params });
  }

  private parseNamespaceIdentifier(): string {
    this.skipWhitespace();
    let id = "";
    while (!this.eof() && this.current() !== "<") {
      if (this.current() === ".") {
        id += ".";
        this.pos += 1;
      }
      id += this.parseIdentifier();
      this.skipWhitespace();
      if (this.current() !== ".") {
        break;
      }
    }
    if (id === "") {
      throw new Error(`missing identifier at position ${this.pos}`);
    }
    return id;
  }

  private parseIdentifier(): string {
    this.skipWhitespace();
    if (this.eof()) {
      throw new Error("unexpected end of input");
    }
    const start = this.pos;
    const first = this.current();
    if (!isAlpha(first) && first !== "_") {
      throw new Error(`identifier is expected, but "${first}" was found at position ${this.pos}`);
    }
    this.pos += 1;
    while (!this.eof()) {
      const char = this.current();
      if (!isAlphaNumeric(char) && char !== "_") {
        break;
      }
      this.pos += 1;
    }
    return this.text.slice(start, this.pos);
  }

  private parseTypeParamIdent(): string {
    this.skipWhitespace();
    if (this.eof()) {
      throw new Error("unexpected end of input");
    }
    const char = this.current();
    if (!isAlpha(char)) {
      throw new Error(
        `invalid type parameter identifier "${char}" at position ${this.pos}, must be a single character from A-Z`,
      );
    }
    this.pos += 1;
    if (!this.eof() && isAlpha(this.current())) {
      throw new Error(
        `invalid type param, must have a single alphabetic character at position ${this.pos}`,
      );
    }
    return char;
  }
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function isAlpha(char: string): boolean {
  return /^[A-Za-z]$/.test(char);
}

function isAlphaNumeric(char: string): boolean {
  return /^[A-Za-z0-9]$/.test(char);
}
