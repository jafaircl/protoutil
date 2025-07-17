/* eslint-disable @typescript-eslint/no-explicit-any */
import { DescEnum, DescField, DescMessage, Message } from '@bufbuild/protobuf';
import { reflect } from '@bufbuild/protobuf/reflect';
import { CostOption } from '../checker/cost.js';
import { abbrevs as containerAbbrevs, name as containerName } from '../common/container.js';
import { FunctionDecl, VariableDecl } from '../common/decls.js';
import { Config } from '../common/env/env.js';
import { Adapter, isRegistry, Provider } from '../common/ref/provider.js';
import { isObjectRefVal } from '../common/types/object.js';
import { fieldDescToCELType } from '../common/types/provider.js';
import { isType } from '../common/types/types.js';
import { isNil } from '../common/utils.js';
import {
  Activation,
  EmptyActivation,
  HierarchicalActivation,
  MapActivation,
  newActivation,
} from '../interpreter/activation.js';
import { InterpretableDecorator } from '../interpreter/decorators.js';
import { customDecorator as interpreterCustomDecorator } from '../interpreter/interpreter.js';
import { Macro } from '../parser/macro.js';
import { enableOptionalSyntax as parserEnableOptionalSyntax } from '../parser/parser.js';
import { Declaration, maybeUnwrapDeclaration, Type, variable } from './decls.js';
import { EnvBase } from './env.js';
import { Feature, featureIDByName, StdLib, stdLibSubset } from './library.js';
import { prog } from './program.js';

export type EnvOption = (e: EnvBase) => EnvBase;

/**
 * EnableOptionalSyntax enables the optional syntax for CEL expressions.
 */
export function enableOptionalSyntax(flag: boolean): EnvOption {
  return (e) => {
    e.prsrOpts.push(parserEnableOptionalSyntax(flag));
    return e;
  };
}

/**
 * ClearMacros options clears all parser macros.
 *
 * Clearing macros will ensure CEL expressions can only contain linear
 * evaluation paths, as comprehensions such as `all` and `exists` are enabled
 * only via macros.
 */
export function clearMacros(): EnvOption {
  return (e) => {
    e.macros = [];
    return e;
  };
}

/**
 * CustomTypeAdapter swaps the default types.Adapter implementation with a
 * custom one.
 *
 * Note: This option must be specified before the Types and TypeDescs options
 * when used together.
 */
export function customTypeAdapter(a: Adapter): EnvOption {
  return (e) => {
    e.adapter = a;
    return e;
  };
}

/**
 * CustomTypeProvider replaces the types.Provider implementation with a custom
 * one.
 *
 * The `provider` variable type may either be types.Provider or ref
 * TypeProvider (deprecated)
 *
 * Note: This option must be specified before the Types and TypeDescs options
 * when used together.
 */
export function customTypeProvider(p: Provider): EnvOption {
  return (e) => {
    e.provider = p;
    return e;
  };
}

/**
 * Declarations option extends the declaration set configured in the
 * environment.
 *
 * Note: Declarations will by default be appended to the pre-existing
 * declaration set configured for the environment. The NewEnv call builds on
 * top of the standard CEL declarations. For a purely custom set of
 * declarations use NewCustomEnv.
 */
export function declarations(...declarations: Declaration[]): EnvOption {
  return (e) => {
    for (const decl of declarations) {
      const d = maybeUnwrapDeclaration(decl);
      if (d instanceof VariableDecl) {
        e.variables.push(d);
      }
      if (d instanceof FunctionDecl) {
        e.functions.set(d.name(), d);
      }
    }
    return e;
  };
}

/**
 * EagerlyValidateDeclarations ensures that any collisions between configured
 * declarations are caught at the time of the `NewEnv` call.
 *
 * Eagerly validating declarations is also useful for bootstrapping a base
 * `cel.Env` value. Calls to base `Env.Extend()` will be significantly faster
 * when declarations are eagerly validated as declarations will be
 * collision-checked at most once and only incrementally by way of `Extend`
 *
 * Disabled by default as not all environments are used for type-checking.
 */
export function eagerlyValidateDeclarations(enabled: boolean): EnvOption {
  return features(Feature.EagerlyValidateDeclarations, enabled);
}

/**
 * HomogeneousAggregateLiterals disables mixed type list and map literal values.
 *
 * Note, it is still possible to have heterogeneous aggregates when provided as
 * variables to the expression, as well as via conversion of well-known dynamic
 * types, or with unchecked expressions.
 */
export function homogeneousAggregateLiterals(): EnvOption {
  throw new Error('not implemented');
}

/**
 * VariadicLogicalOperatorASTs flatten like-operator chained logical expressions into a single variadic call with N-terms. This behavior is useful when serializing to a protocol buffer as it will reduce the number of recursive calls needed to deserialize the AST later.
 *
 * For example, given the following expression the call graph will be rendered accordingly:
 * ```
 * expression: a && b && c && (d || e)
 * ast: call(_&&_, [a, b, c, call(_||_, [d, e])])
 * ```
 */
export function variadicLogicalOperatorASTs(): EnvOption {
  return features(Feature.VariadicLogicalASTs, true);
}

/**
 * Macros option extends the macro set configured in the environment.
 *
 * Note: This option must be specified after ClearMacros if used together.
 */
export function macros(...macros: Macro[]): EnvOption {
  return (e) => {
    e.macros.push(...macros);
    return e;
  };
}

/**
 * Container sets the container for resolving variable names. Defaults to an
 * empty container.
 *
 * If all references within an expression are relative to a protocol buffer
 * package, then specifying a container of `google.type` would make it possible
 * to write expressions such as `Expr{expression: 'a < b'}` instead of having
 * to write `google.type.Expr{...}`.
 */
export function container(name: string): EnvOption {
  return (e) => {
    const cont = e.container.extend(containerName(name));
    e.container = cont;
    return e;
  };
}

/**
 * Abbrevs configures a set of simple names as abbreviations for
 * fully-qualified names.
 *
 *  An abbreviation (abbrev for short) is a simple name that expands to a
 * fully-qualified name. Abbreviations can be useful when working with
 * variables, functions, and especially types from multiple namespaces:
 * ```
 * // CEL object construction
 * qual.pkg.version.ObjTypeName{
 *   field: alt.container.ver.FieldTypeName{value: ...}
 * }
 * ```
 *
 * Only one the qualified names above may be used as the CEL container, so at
 * least one of these references must be a long qualified name within an
 * otherwise short CEL program. Using the following abbreviations, the program
 * becomes much simpler:
 * ```
 * // CEL Go option
 * Abbrevs("qual.pkg.version.ObjTypeName", "alt.container.ver.FieldTypeName")
 * // Simplified Object construction
 * ObjTypeName{field: FieldTypeName{value: ...}}
 * ```
 *
 * There are a few rules for the qualified names and the simple abbreviations
 * generated from them:
 * - Qualified names must be dot-delimited, e.g. `package.subpkg.name`.
 * - The last element in the qualified name is the abbreviation.
 * - Abbreviations must not collide with each other.
 * - The abbreviation must not collide with unqualified names in use.
 *
 * Abbreviations are distinct from container-based references in the following
 * important ways:
 * - Abbreviations must expand to a fully-qualified name.
 * - Expanded abbreviations do not participate in namespace resolution.
 * - Abbreviation expansion is done instead of the container search for a
 * matching identifier.
 * - Containers follow C++ namespace resolution rules with searches from the
 * most qualified name to the least qualified name.
 * - Container references within the CEL program may be relative, and are
 * resolved to fully qualified names at either type-check time or program plan
 * time, whichever comes first.
 *
 * If there is ever a case where an identifier could be in both the container
 * and as an abbreviation, the abbreviation wins as this will ensure that the
 * meaning of a program is preserved between compilations even as the container
 * evolves.
 */
export function abbrevs(...qualifiedNames: string[]): EnvOption {
  return (e) => {
    const cont = e.container.extend(containerAbbrevs(...qualifiedNames));
    e.container = cont;
    return e;
  };
}

/**
 * Types adds one or more type declarations to the environment, allowing for
 * construction of type-literals whose definitions are included in the common
 * expression built-in set.
 *
 * The input types may either be instances of `proto.Message` or `ref.Type`.
 * Any other type provided to this option will result in an error.
 *
 * Well-known protobuf types within the `google.protobuf.*` package are
 * included in the standard environment by default.
 *
 * Note: This option must be specified after the CustomTypeProvider option
 * when used together.
 */
export function types(...types: (DescMessage | DescEnum | Type)[]): EnvOption {
  return (e) => {
    const provider = e.provider;
    if (!isRegistry(provider)) {
      throw new Error(`custom types not supported by provider: ${provider}`);
    }
    for (const t of types) {
      if (isType(t)) {
        provider.registerType(t);
      } else {
        provider.registerDescriptor(t);
      }
    }
    return e;
  };
}

/**
 * ProgramOption is a functional interface for configuring evaluation bindings
 * and behaviors.
 */
export type ProgramOption = (p: prog) => prog;

/**
 * CustomDecorator appends an InterpreterDecorator to the program.
 *
 * InterpretableDecorators can be used to inspect, alter, or replace the
 * Program plan.
 */
export function customDecorator(dec: InterpretableDecorator): ProgramOption {
  return (p) => {
    p.plannerOptions.push(interpreterCustomDecorator(dec));
    return p;
  };
}

/**
 * Globals sets the global variable values for a given program. These values
 * may be shadowed by variables with the same name provided to the Eval() call.
 * If Globals is used in a Library with a Lib EnvOption, vars may shadow
 * variables provided by previously added libraries.
 *
 * The vars value may either be an `interpreter.Activation` instance or a
 * `map[string]any`.
 */
export function globals(vars: Activation | Record<string, any> | Map<string, any>): ProgramOption {
  return (p) => {
    let defaultVars = newActivation(vars);
    if (!isNil(p.defaultVars)) {
      defaultVars = new HierarchicalActivation(p.defaultVars, defaultVars);
    }
    p.defaultVars = defaultVars;
    return p;
  };
}

// TODO: optimizeregex

/**
 * EvalOption indicates an evaluation option that may affect the evaluation
 * behavior or information in the output result.
 */
export enum EvalOption {
  /**
   * TrackState will cause the runtime to return an immutable EvalState value
   * in the Result.
   */
  TrackState,

  /**
   * ExhaustiveEval causes the runtime to disable short-circuits and track
   * state.
   */
  ExhaustiveEval,

  /**
   * Optimize precomputes functions and operators with constants as arguments
   * at program creation time. It also pre-compiles regex pattern constants
   * passed to 'matches', reports any compilation errors at program creation
   * and uses the compiled regex pattern for all 'matches' function
   * invocations. This flag is useful when the expression will be evaluated
   * repeatedly against a series of different inputs.
   */
  Optimize,

  /**
   * PartialEval enables the evaluation of a partial state where the input data
   * that may be known to be missing, either as top-level variables, or
   * somewhere within a variable's object member graph.
   *
   * By itself, OptPartialEval does not change evaluation behavior unless the
   * input to the Program Eval() call is created via PartialVars().
   */
  PartialEval,

  /**
   * TrackCost enables the runtime cost calculation while validation and return
   * cost within evalDetails cost calculation is available via func ActualCost()
   */
  TrackCost,
}

/**
 * EvalOptions sets one or more evaluation options which may affect the evaluation or Result.
 */
export function evalOptions(...opts: EvalOption[]): ProgramOption {
  return (p) => {
    p.evalOpts.push(...opts);
    return p;
  };
}

/**
 * CostEstimatorOptions configure type-check time options for estimating
 * expression cost.
 */
export function costEstimatorOptions(...costOpts: CostOption[]): EnvOption {
  return (e) => {
    e.costOptions.push(...costOpts);
    return e;
  };
}

/**
 * DeclareContextProto returns an option to extend CEL environment with
 * declarations from the given context proto. Each field of the proto defines a
 * variable of the same name in the environment.  https://github.com/google/cel-spec/blob/master/doc/langdef.md#evaluation-environment
 */
export function declareContextProto(proto: DescMessage): EnvOption {
  return (e) => {
    e.contextProto = proto;
    for (const field of proto.fields) {
      const _variable = fieldToVariable(field);
      e = _variable(e);
    }
    return types(proto)(e);
  };
}

/**
 * ContextProtoVars uses the fields of the input proto.Messages as top-level
 * variables within an Activation.
 *
 * Consider using with `DeclareContextProto` to simplify variable type
 * declarations and publishing when using protocol buffers.
 */
export function contextProtoVars(schema: DescMessage, ctx: Message): Activation {
  if (isNil(ctx)) {
    return new EmptyActivation();
  }
  const ref = reflect(schema, ctx, false);
  const vars = new Map<string, any>();
  for (const field of schema.fields) {
    const val = ref.get(field);
    vars.set(field.name, val);
  }
  return new MapActivation(vars);
}

/**
 * FieldToVariable converts a protobuf field descriptor to a CEL variable
 * declaration.
 */
function fieldToVariable(field: DescField) {
  const type = fieldDescToCELType(field);
  if (isNil(type)) {
    throw new Error(`field ${field.name} type ${field.fieldKind} not implemented`);
  }
  return variable(field.name, type);
}

/**
 * EnableMacroCallTracking ensures that call expressions which are replaced by
 * macros are tracked in the `SourceInfo` of parsed and checked expressions.
 */
export function enableMacroCallTracking(): EnvOption {
  return features(Feature.EnableMacroCallTracking, true);
}

/**
 * EnableIdentifierEscapeSyntax enables identifier escaping (`) syntax for
 * fields.
 */
export function enableIdentifierEscapeSyntax(): EnvOption {
  return features(Feature.IdentEscapeSyntax, true);
}

/**
 * CrossTypeNumericComparisons makes it possible to compare across numeric
 * types, e.g. double < int
 */
export function crossTypeNumericComparisons(enabled: boolean): EnvOption {
  return features(Feature.CrossTypeNumericComparisions, enabled);
}

/**
 * DefaultUTCTimeZone ensures that time-based operations use the UTC timezone
 * rather than the input time's local timezone.
 */
export function defaultUTCTimeZone(enabled: boolean): EnvOption {
  return features(Feature.DefaultUTCTimeZone, enabled);
}

/**
 * features sets the given feature flags.  See list of Feature constants above.
 */
function features(flag: Feature, enabled: boolean): EnvOption {
  return (e) => {
    e.features.set(flag, enabled);
    return e;
  };
}

/**
 * ConfigOptionFactory declares a signature which accepts a configuration element, e.g. env.Extension
 * and optionally produces an EnvOption in response.
 *
 * If there are multiple ConfigOptionFactory values which could apply to the same configuration node
 * the first one that returns an EnvOption and a `true` response will be used, and the config node
 * will not be passed along to any other option factory.
 *
 * Only the *env.Extension type is provided at this time, but validators, optimizers, and other tuning
 * parameters may be supported in the future.
 */
export type ConfigOptionFactory = (...args: any[]) => EnvOption | null;

/**
 * FromConfig produces and applies a set of EnvOption values derived from an env.Config object.
 *
 * For configuration elements which refer to features outside of the `cel` package, an optional set of
 * ConfigOptionFactory values may be passed in to support the conversion from static configuration to
 * configured cel.Env value.
 *
 * Note: disabling the standard library will clear the EnvOptions values previously set for the
 * environment with the exception of propagating types and adapters over to the new environment.
 *
 * Note: to support custom types referenced in the configuration file, you must ensure that one of
 * the following options appears before the FromConfig option: Types, TypeDescs, or CustomTypeProvider
 * as the type provider configured at the time when the config is processed is the one used to derive
 * type references from the configuration.
 */
export function fromConfig(config: Config, ...optFactories: ConfigOptionFactory[]): EnvOption {
  return (e) => {
    const err = config.validate();
    if (err) {
      throw new Error(`invalid config: ${err.message}`);
    }
    const opts = configToEnvOptions(config, e.CELTypeProvider(), optFactories);
    for (const o of opts) {
      e = o(e);
    }
    return e;
  };
}

/**
 * configToEnvOptions generates a set of EnvOption values (or error) based on a config, a type provider,
 * and an optional set of environment options.
 */
function configToEnvOptions(
  config: Config,
  provider: Provider,
  optFactories: ConfigOptionFactory[]
): EnvOption[] {
  const envOpts: EnvOption[] = [];
  // Configure the standard lib subset.
  if (config.stdLib) {
    envOpts.push((e) => {
      if (e.hasLibrary('cel.lib.std')) {
        throw new Error('invalid subset of stdlib: create a custom env');
      }
      return e;
    });
    if (!config.stdLib.disabled) {
      envOpts.push(StdLib(stdLibSubset(config.stdLib)));
    }
  } else {
    envOpts.push(StdLib());
  }

  // Configure the container
  if (config.container) {
    envOpts.push(container(config.container));
  }

  // Configure abbreviations
  for (const imp of config.imports) {
    envOpts.push(abbrevs(imp.name));
  }

  // Configure the context variable declaration
  if (config.contextVariable) {
    const typeName = config.contextVariable.typeName;
    const found = provider.findStructType(typeName);
    if (!found) {
      throw new Error(`invalid context proto type: ${typeName}`);
    }
    // Attempt to instantiate the proto in order to reflect to its descriptor
    const msg = provider.newValue(typeName, new Map());
    if (!isObjectRefVal(msg) || !msg.value()) {
      throw new Error(`unsupported context type: ${typeName}`);
    }
    envOpts.push(declareContextProto(msg.typeDesc));
  }

  // Configure variables
  if (config.variables.length !== 0) {
    const vars: VariableDecl[] = [];
    for (const v of config.variables) {
      const vDef = v.asCELVariable(provider);
      if (vDef instanceof Error) {
        throw vDef;
      }
      vars.push(vDef);
    }
    envOpts.push(declarations(...vars));
  }

  // Configure functions
  if (config.functions.length !== 0) {
    const funcs: FunctionDecl[] = [];
    for (const f of config.functions) {
      const fnDef = f.asCELFunction(provider);
      if (fnDef instanceof Error) {
        throw fnDef;
      }
      funcs.push(fnDef);
    }
    envOpts.push(declarations(...funcs));
  }

  // Configure features
  for (const feat of config.features) {
    // Note, if a feature is not found, it is skipped as it is possible the feature
    // is not intended to be supported publicly. In the future, a refinement of
    // to this strategy to report unrecognized features and validators should probably
    // be covered as a standard ConfigOptionFactory
    const id = featureIDByName(feat.name);
    if (id) {
      envOpts.push(features(id, feat.enabled));
    }
  }

  // TODO: validators
  // // Configure validators
  // for _, val := range config.Validators {
  // 	if fac, found := astValidatorFactories[val.Name]; found {
  // 		envOpts = append(envOpts, func(e *Env) (*Env, error) {
  // 			validator, err := fac(val)
  // 			if err != nil {
  // 				return nil, fmt.Errorf("%w", err)
  // 			}
  // 			return ASTValidators(validator)(e)
  // 		})
  // 	} else if opt, handled := handleExtendedConfigOption(val, optFactories); handled {
  // 		envOpts = append(envOpts, opt)
  // 	}
  // 	// we don't error when the validator isn't found as it may be part
  // 	// of an extension library and enabled implicitly.
  // }

  // Configure extensions
  for (const ext of config.extensions) {
    // version number has been validated by the call to `Validate`
    const ver = ext.versionNumber();
    if (ext.name === 'optional') {
      envOpts.push(enableOptionalSyntax(true));
      // TODO: OptionalTypes
      // envOpts = append(envOpts, OptionalTypes(OptionalTypesVersion(ver)))
    } else {
      const opt = handleExtendedConfigOption(ext, optFactories);
      if (isNil(opt)) {
        throw new Error('unrecognized extension: ' + ext.name);
      }
      envOpts.push(opt);
    }
  }

  return envOpts;
}

function handleExtendedConfigOption(
  conf: any,
  optFactories: ConfigOptionFactory[]
): EnvOption | null {
  for (const optFac of optFactories) {
    const opt = optFac(conf);
    if (opt) {
      return opt;
    }
  }
  return null;
}

// TODO: make parser options functional so we can add ParserExpressionSizeLimit & ParserRecursionLimit
