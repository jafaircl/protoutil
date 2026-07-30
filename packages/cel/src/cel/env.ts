import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import { getField } from "@protoutil/core";
import { check as checkExpression, tryCheck as tryCheckExpression } from "../checker/checker.js";
import {
  type CostEstimate,
  type CostEstimator,
  type CostOptions,
  cost as estimateExpressionCost,
} from "../checker/cost.js";
import { type Env as CheckerEnv, env as checkerEnvironment } from "../checker/env.js";
import type { CheckerOptions } from "../checker/options.js";
import { AST, nodeCount, type SourceInfo } from "../common/ast/index.js";
import { type Container, container, defaultContainer } from "../common/containers.js";
import {
  type FunctionDecl,
  functionDecl,
  overload,
  typeVariable,
  type VariableDecl,
  variableDecl,
} from "../common/decls.js";
import {
  type Config,
  validator as configValidator,
  contextVariable,
  config as environmentConfig,
  extension,
  feature,
  importType,
  limit as configLimit,
  type LibrarySubset,
  librarySubset,
} from "../common/env/env.js";
import type { Error as CommonError } from "../common/error.js";
import { type Errors, errorsValue, noLocation } from "../common/errors.js";
import type { Source } from "../common/source.js";
import { textSource } from "../common/source.js";
import { standardFunctions, standardTypes } from "../common/stdlib.js";
import { type Adapter, type Provider, type Registry, registry } from "../common/types/provider.js";
import {
  ErrorType,
  exprTypeToType,
  IntType,
  objectType,
  StringType,
  type Type,
} from "../common/types/types.js";
import {
  type ActivationBindings,
  activation,
  type PartialActivation,
  partialActivation,
} from "../interpreter/activation.js";
import type { AsyncObserver } from "../interpreter/async.js";
import { attributePattern, partialAttributeFactory } from "../interpreter/attribute-patterns.js";
import { attributeFactory } from "../interpreter/attributes.js";
import type { InterpretableDecoratorV2 } from "../interpreter/decorators.js";
import { dispatcher } from "../interpreter/dispatcher.js";
import type { PlannerConfig } from "../interpreter/interpreter.js";
import {
  compileRegexConstantsConfig,
  evalStateObserverConfig,
  exhaustiveEvalConfig,
  interpreter,
  interruptableEvalConfig,
  optimizeConfig,
  regexProgramSizeLimitConfig,
} from "../interpreter/interpreter.js";
import { matchesRegexOptimization, type RegexOptimization } from "../interpreter/optimizations.js";
import { pruneAst } from "../interpreter/prune.js";
import {
  type CostTrackerOptions,
  costObserverConfig,
  costTracker,
} from "../interpreter/runtime-cost.js";
import { AllMacros } from "../parser/macro.js";
import { type Macro, macroKey, type ParserConfig, parserOptions } from "../parser/options.js";
import {
  parse as parseExpression,
  parseSource as parseExpressionSource,
  tryParse as tryParseExpression,
  tryParseSource as tryParseExpressionSource,
} from "../parser/parser.js";
import { astToString } from "./io.js";
import { type Library, legacyTimeFunctions, optionalTypes } from "./library.js";
import { type ASTOptimizer, staticOptimizer } from "./optimizer.js";
import {
  type EvalDetails,
  type Program,
  ProgramCostTrackerSink,
  ProgramEvalStateSink,
  program as programValue,
} from "./program.js";
import {
  type ASTValidator,
  extendedValidations,
  type ValidatorConfig,
  validateBindNestingLimit,
  validateComprehensionNestingLimit,
  validateRegexProgramSizeLimit,
  validatorConfig,
} from "./validator.js";

/**
 * envInheritance carries resolved library state between related environments without exposing it
 * as public configuration.
 */
const envInheritance = Symbol("cel.env.inheritance");

/**
 * EnvInheritanceOptions contains library state inherited without replaying compile options.
 */
interface EnvInheritanceOptions {
  /** LibraryNames contains singleton library identifiers already applied to the environment. */
  libraryNames: string[];
  /** ProgramOptions contains static runtime options contributed by inherited libraries. */
  programOptions: ProgramOptions;
}

/**
 * StandardLibraryOptions customizes declarations and macros in the standard CEL library.
 */
export interface StandardLibraryOptions {
  /**
   * functions replaces the standard function declarations and runtime bindings.
   */
  functions?: FunctionDecl[];

  /**
   * types replaces the standard type identifier declarations.
   */
  types?: VariableDecl[];

  /**
   * subset selects the standard function overloads and parser macros available to the environment.
   */
  subset?: LibrarySubset;
}

/**
 * MacroOptions configures the parser macros available in a CEL environment.
 */
export interface MacroOptions {
  /**
   * standard controls whether the standard CEL parser macros are available.
   */
  standard?: boolean;

  /**
   * custom contains additional or replacement macros keyed by their signatures.
   */
  custom?: Macro[];
}

/**
 * EnvOptions configures a CEL environment using plain TypeScript values.
 */
export interface EnvOptions {
  /**
   * container controls namespace resolution for identifiers and functions.
   */
  container?: Container;

  /**
   * registry supplies protobuf types and adapts native values into CEL values.
   */
  registry?: Registry;

  /**
   * configuration applies a serializable environment configuration and declarative option maps.
   */
  configuration?: EnvConfigurationOptions;

  /**
   * contextProto declares every field in a protobuf message as a top-level environment variable.
   */
  contextProto?: DescMessage;

  /**
   * jsonFieldNames enables protobuf JSON field names during checking, planning, and evaluation.
   */
  jsonFieldNames?: boolean;

  /**
   * variables declares the identifiers available while checking expressions.
   */
  variables?: VariableDecl[];

  /**
   * types registers CEL runtime types with both the checker and type provider.
   */
  types?: Type[];

  /**
   * functions declares custom function signatures and runtime bindings.
   */
  functions?: FunctionDecl[];

  /**
   * parser configures syntax features and parser resource limits.
   */
  parser?: ParserConfig;

  /**
   * regexProgramSizeLimit caps compiled regex instruction counts during validation and evaluation.
   */
  regexProgramSizeLimit?: number;

  /**
   * checker configures type-checking behavior.
   */
  checker?: CheckerOptions;

  /**
   * cost configures static checker cost estimation.
   */
  cost?: CostOptions;

  /**
   * defaultUTCTimeZone controls whether timestamp functions without an explicit timezone use UTC.
   *
   * When false, timestamp values which retain a native timezone use that location.
   */
  defaultUTCTimeZone?: boolean;

  /**
   * standardLibrary customizes the standard declarations, or disables them when false.
   */
  standardLibrary?: StandardLibraryOptions | false;

  /**
   * macros configures standard and custom parser macro availability.
   */
  macros?: MacroOptions;

  /**
   * maxAstDepth records the maximum nesting depth for externally loaded AST configuration.
   */
  maxAstDepth?: number;

  /**
   * libraries applies reusable compile and program configuration bundles.
   */
  libraries?: Library[];

  /**
   * validators inspects successfully checked ASTs and reports likely runtime errors.
   */
  validators?: ASTValidator[];

  /**
   * errorOnBadPresenceTest reports invalid presence traversals instead of treating them as absent.
   */
  errorOnBadPresenceTest?: boolean;

  /**
   * envInheritance carries internal state when extending an existing environment.
   */
  [envInheritance]?: EnvInheritanceOptions;
}

/**
 * EnvConfigurationOptions configures an environment from its serializable representation.
 */
export interface EnvConfigurationOptions {
  /** config contains the serializable CEL environment settings. */
  config: Config;

  /**
   * extensions maps extension names or `name@version` keys directly to environment options.
   */
  extensions?: Record<string, EnvOptions>;

  /**
   * validators maps custom validator names directly to environment options.
   */
  validators?: Record<string, EnvOptions>;
}

/**
 * ProgramOptions configures planning of a compiled CEL program.
 */
export interface ProgramOptions {
  /**
   * asyncMaxConcurrency limits simultaneously executing asynchronous function calls.
   */
  asyncMaxConcurrency?: number;

  /**
   * asyncObserver receives asynchronous function lifecycle events.
   */
  asyncObserver?: AsyncObserver;

  /**
   * costTracking enables actual runtime cost measurement and optional cost limits.
   */
  costTracking?: CostTrackerOptions;

  /**
   * decorators appends custom V2 interpreter decorators to the program.
   */
  decorators?: InterpretableDecoratorV2[];

  /**
   * globals contains program-scoped variables which evaluation-specific input may override.
   */
  globals?: ActivationBindings;

  /**
   * exhaustiveEval disables short-circuiting and records the value of every evaluated expression.
   */
  exhaustiveEval?: boolean;

  /**
   * interruptCheckFrequency controls how often interruptible comprehensions inspect a signal.
   */
  interruptCheckFrequency?: number;

  /**
   * partialEval enables qualifier-aware unknown attribute evaluation.
   */
  partialEval?: boolean;

  /**
   * optimize precomputes functions and operators with constant arguments at program creation time.
   *
   * Constant regular expression arguments passed to `matches` are also compiled at program
   * creation time and reused across evaluations.
   */
  optimize?: boolean;

  /**
   * regexOptimizations provides additional constant regular expression call optimizations.
   */
  regexOptimizations?: RegexOptimization[];

  /**
   * trackState records intermediate expression values for residual AST construction.
   */
  trackState?: boolean;
}

/**
 * CompileResult contains the parsed or checked AST and any diagnostics produced while compiling.
 */
export interface CompileResult {
  /** ast contains the parsed or checked expression. */
  ast: AST;

  /** errors contains environment diagnostics when parsing, checking, or validation fails. */
  errors?: Issues;
}

/**
 * ContextProtoVarsOptions configures activation bindings derived from a protobuf context message.
 */
export interface ContextProtoVarsOptions<Desc extends DescMessage = DescMessage> {
  /** jsonFieldNames uses each field's protobuf JSON name as its activation key. */
  jsonFieldNames?: boolean;

  /** message contains the protobuf context values exposed to CEL. */
  message: MessageShape<Desc>;

  /** schema describes the protobuf context message fields. */
  schema: Desc;
}

/**
 * contextProtoVars exposes protobuf message fields as top-level CEL activation bindings.
 */
export function contextProtoVars<Desc extends DescMessage>(
  options: ContextProtoVarsOptions<Desc>,
): Record<string, unknown> {
  if (options.message.$typeName !== options.schema.typeName) {
    throw new Error(
      `context proto type mismatch: got ${options.message.$typeName}, wanted ${options.schema.typeName}`,
    );
  }
  const bindings: Record<string, unknown> = {};
  for (const field of options.schema.fields) {
    bindings[options.jsonFieldNames ? field.jsonName : field.name] = getField(
      options.message,
      field,
    );
  }
  return bindings;
}

/**
 * IssuesOptions configures an environment issue set.
 */
export interface IssuesOptions {
  /** errors contains the lower-level diagnostics wrapped by the issue set. */
  errors?: Errors;

  /** sourceInfo maps expression identifiers to source locations for additional reports. */
  sourceInfo?: SourceInfo;
}

/**
 * ReportIssueOptions describes an error attached to an expression identifier.
 */
export interface ReportIssueOptions {
  /** id identifies the expression whose source location should be reported. */
  id: number;

  /** message contains the diagnostic format string. */
  message: string;

  /** args contains values substituted into the diagnostic format string. */
  args?: unknown[];
}

/**
 * Issues defines methods for inspecting the error details of environment parse and check calls.
 *
 * Non-fatal warnings and notices may be exposed through this class in the future.
 */
export class Issues {
  /** errorsValue contains the lower-level CEL diagnostics. */
  private readonly errorsValue: Errors;

  /** sourceInfoValue maps expression identifiers to diagnostic locations. */
  private readonly sourceInfoValue?: SourceInfo;

  /** Creates an issue set around existing CEL diagnostics. */
  constructor(options: IssuesOptions = {}) {
    this.errorsValue = options.errors ?? errorsValue();
    this.sourceInfoValue = options.sourceInfo;
  }

  /** err returns an Error when the issue set contains one or more diagnostics. */
  public err(): globalThis.Error | undefined {
    return this.errors().length === 0 ? undefined : new globalThis.Error(this.toString());
  }

  /** errors returns the collection of diagnostics in granular form. */
  public errors(): CommonError[] {
    return this.errorsValue.getErrors();
  }

  /** append combines another issue set into this one without duplicating itself. */
  public append(other?: Issues): Issues {
    if (other === undefined || other === this) {
      return this;
    }
    return new Issues({
      errors: this.errorsValue.append(other.errors()),
      sourceInfo: this.sourceInfoValue,
    });
  }

  /**
   * merge copies another issue set into this accumulator while preserving source locations.
   */
  public merge(other?: Issues): void {
    if (other === undefined || other === this) {
      return;
    }
    for (const error of other.errors()) {
      this.errorsValue.reportErrorAtId(error.exprId, error.location, "%s", error.message);
    }
  }

  /** reportErrorAtId attaches an error to an expression identifier when source metadata is present. */
  public reportErrorAtId(options: ReportIssueOptions): void {
    this.errorsValue.reportErrorAtId(
      options.id,
      this.sourceInfoValue?.getStartLocation(options.id) ?? noLocation,
      options.message,
      ...(options.args ?? []),
    );
  }

  /** getErrors exposes the underlying errors for compatibility with lower-level diagnostics. */
  public getErrors(): CommonError[] {
    return this.errors();
  }

  /** toDisplayString formats the issue set with source snippets and locations. */
  public toDisplayString(): string {
    return this.toString();
  }

  /** toString converts the issue set to a display-ready string. */
  public toString(): string {
    return this.errorsValue.toDisplayString();
  }
}

/**
 * issues creates an environment issue set from lower-level diagnostics and optional source info.
 */
export function issues(options: IssuesOptions = {}): Issues {
  return new Issues(options);
}

/**
 * errorAsIssues wraps an ordinary error in a CEL diagnostic issue set.
 *
 * This helper supports early returns from validation paths whose failure is unrelated to the
 * source expression being validated.
 */
export function errorAsIssues(error: globalThis.Error): Issues {
  const diagnostics = errorsValue(textSource(""));
  diagnostics.reportErrorString(noLocation, error.message);
  return issues({ errors: diagnostics });
}

/**
 * astOutputType returns the root output type, or ErrorType when the AST is absent.
 */
export function astOutputType(astValue?: AST): Type {
  if (astValue === undefined) {
    return ErrorType;
  }
  return exprTypeToType(astValue.getType(astValue.expr().id())!);
}

/**
 * Env is a program environment configured with the standard CEL library.
 *
 * The environment can parse and check CEL expressions which build upon the core
 * features documented in the CEL specification.
 */
export class Env {
  /**
   * containerValue stores the namespace resolver shared by checking and evaluation.
   */
  private readonly containerValue: Container;

  /**
   * registryValue stores the type provider and native-value adapter.
   */
  private readonly registryValue: Registry;

  /**
   * contextProtoValue stores the message descriptor whose fields are top-level variables.
   */
  private readonly contextProtoValue?: DescMessage;

  /**
   * contextProtoTypeNameValue stores context types restored from configuration without a schema handle.
   */
  private readonly contextProtoTypeNameValue?: string;

  /**
   * jsonFieldNamesValue records whether protobuf JSON names are enabled.
   */
  private readonly jsonFieldNamesValue: boolean;

  /**
   * checkerValue stores the declarations used to type-check expressions.
   */
  private readonly checkerValue: CheckerEnv;

  /**
   * functionsValue stores declarations whose bindings are installed into programs.
   */
  private readonly functionsValue: FunctionDecl[];

  /**
   * variablesValue stores caller-provided declarations for environment extension.
   */
  private readonly variablesValue: VariableDecl[];

  /**
   * typesValue stores caller-provided runtime types for environment extension.
   */
  private readonly typesValue: Type[];

  /**
   * customFunctionsValue stores caller-provided functions without standard-library declarations.
   */
  private readonly customFunctionsValue: FunctionDecl[];

  /**
   * checkerOptionsValue stores checker configuration inherited by extended environments.
   */
  private readonly checkerOptionsValue: CheckerOptions;

  /**
   * costOptionsValue stores checker cost-estimation configuration inherited by extensions.
   */
  private readonly costOptionsValue: CostOptions;

  /**
   * defaultUTCTimeZoneValue controls zero-argument timestamp function behavior.
   */
  private readonly defaultUTCTimeZoneValue: boolean;

  /**
   * parserConfigValue stores the parser configuration applied to each parse.
   */
  private readonly parserConfigValue: ParserConfig;

  /**
   * maxAstDepthValue stores the configured external AST nesting limit for serialization.
   */
  private readonly maxAstDepthValue?: number;

  /**
   * regexProgramSizeLimitValue stores the environment-wide regex instruction-count limit.
   */
  private readonly regexProgramSizeLimitValue?: number;

  /**
   * standardLibraryValue stores the resolved standard declarations inherited by extended environments.
   */
  private readonly standardLibraryValue: StandardLibraryOptions | false;

  /**
   * libraryNamesValue stores configured singleton library names.
   */
  private readonly libraryNamesValue: string[];

  /**
   * libraryProgramOptionsValue stores static program options supplied by libraries.
   */
  private readonly libraryProgramOptionsValue: ProgramOptions;

  /**
   * validatorsValue contains singleton AST validators in execution order.
   */
  private readonly validatorsValue: ASTValidator[];

  /**
   * librariesValue stores concrete libraries for configuration serialization.
   */
  private readonly librariesValue: Library[];

  /**
   * validatorConfigValue contains immutable configuration supplied to validator executions.
   */
  private readonly validatorConfigValue: ValidatorConfig;

  /**
   * errorOnBadPresenceTestValue controls whether invalid presence traversals produce errors.
   */
  private readonly errorOnBadPresenceTestValue: boolean;

  /**
   * constructor configures the standard library and caller-provided declarations.
   */
  constructor(optionsInput: EnvOptions = {}) {
    optionsInput = applyEnvironmentConfiguration(optionsInput);
    const libraryConfiguration = resolveLibraries({
      inheritance: optionsInput[envInheritance],
      options: optionsInput,
    });
    const options = libraryConfiguration.options;
    this.libraryNamesValue = libraryConfiguration.names;
    this.librariesValue = libraryConfiguration.libraries;
    this.libraryProgramOptionsValue = libraryConfiguration.programOptions;
    this.regexProgramSizeLimitValue = options.regexProgramSizeLimit;
    this.maxAstDepthValue = options.maxAstDepth;
    this.validatorsValue = uniqueValidators([
      ...(options.validators ?? []),
      ...(this.regexProgramSizeLimitValue !== undefined && this.regexProgramSizeLimitValue > 0
        ? [validateRegexProgramSizeLimit(this.regexProgramSizeLimitValue)]
        : []),
    ]);
    this.validatorConfigValue = validatorConfig();
    this.errorOnBadPresenceTestValue = options.errorOnBadPresenceTest ?? false;
    this.containerValue = options.container ?? defaultContainer;
    this.registryValue = options.registry ?? registry();
    this.jsonFieldNamesValue = options.jsonFieldNames ?? this.registryValue.jsonFieldNames();
    if (
      options.jsonFieldNames !== undefined &&
      this.registryValue.jsonFieldNames() !== options.jsonFieldNames
    ) {
      this.registryValue.withJSONFieldNames(options.jsonFieldNames);
    }
    this.contextProtoValue = options.contextProto;
    this.contextProtoTypeNameValue =
      this.contextProtoValue?.typeName ?? options.configuration?.config.contextVariable?.typeName;
    if (this.contextProtoValue !== undefined) {
      this.registryValue.registerDescriptor(this.contextProtoValue.file);
    }
    this.typesValue = [...(options.types ?? [])];
    this.registryValue.registerType(...this.typesValue);
    const standardLibrarySubset =
      options.standardLibrary === false ? undefined : options.standardLibrary?.subset;
    const subsetError = standardLibrarySubset?.validate();
    if (subsetError !== undefined) {
      throw subsetError;
    }
    if (standardLibrarySubset === undefined) {
      this.parserConfigValue = {
        ...(options.parser ?? {}),
        ...(options.macros === undefined
          ? {}
          : {
              enableStandardMacros: options.macros.standard ?? true,
              macros: new Map(
                (options.macros.custom ?? []).map((macro, index) => [String(index), macro]),
              ),
            }),
      };
    } else {
      // A standard-library subset is installed as an explicit macro set so excluded macros cannot
      // be restored by the parser's default macro registration.
      const subsetMacros =
        options.macros?.standard === false
          ? []
          : AllMacros.filter((macro) => standardLibrarySubset.subsetMacro(macro.function));
      const macros = new Map<string, Macro>();
      for (const macro of [
        ...subsetMacros,
        ...(options.parser?.macros?.values() ?? []),
        ...(options.macros?.custom ?? []),
      ]) {
        macros.set(macroKey(macro.function, macro.argCount, macro.receiverStyle), macro);
      }
      this.parserConfigValue = {
        ...(options.parser ?? {}),
        enableStandardMacros: false,
        macros,
      };
    }
    this.checkerOptionsValue = {
      ...(options.checker ?? {}),
      jsonFieldNames: this.jsonFieldNamesValue,
    };
    this.costOptionsValue = options.cost ?? {};
    this.defaultUTCTimeZoneValue = options.defaultUTCTimeZone ?? true;
    this.variablesValue = [
      ...contextVariableDeclarations({
        jsonFieldNames: this.jsonFieldNamesValue,
        provider: this.registryValue,
        schema: this.contextProtoValue,
        typeName: this.contextProtoTypeNameValue,
      }),
      ...(options.variables ?? []),
    ];
    this.customFunctionsValue = [...(options.functions ?? [])];
    const standardLibraryFunctions = [
      ...(options.standardLibrary === false
        ? []
        : (options.standardLibrary?.functions ?? standardFunctions())),
    ];
    const subsetFunctions =
      standardLibrarySubset === undefined
        ? standardLibraryFunctions
        : standardLibraryFunctions.flatMap((declaration) => {
            const [subset, included] = standardLibrarySubset.subsetFunction(declaration);
            return included && subset !== undefined ? [subset] : [];
          });
    this.standardLibraryValue =
      options.standardLibrary === false
        ? false
        : {
            functions: subsetFunctions,
            subset: standardLibrarySubset,
            types: [...(options.standardLibrary?.types ?? standardTypes())],
          };
    this.functionsValue = mergeFunctionDeclarations([
      ...(this.standardLibraryValue === false ? [] : (this.standardLibraryValue.functions ?? [])),
      ...strongEnumFunctions(this.registryValue),
      ...this.customFunctionsValue,
      ...(this.defaultUTCTimeZoneValue ? [] : legacyTimeFunctions()),
    ]);
    this.checkerValue = checkerEnvironment(
      this.containerValue,
      this.registryValue,
      this.checkerOptionsValue,
    );
    this.checkerValue.addIdents(
      ...(this.standardLibraryValue === false ? [] : (this.standardLibraryValue.types ?? [])),
      ...this.typesValue.map((type) => typeVariable(type)),
      ...this.variablesValue,
    );
    this.checkerValue.addFunctions(
      ...this.functionsValue.filter((declaration) => !declaration.isDeclarationDisabled()),
    );
  }

  /**
   * parse parses a CEL source string into an unchecked AST.
   */
  public parse(source: string): AST {
    return parseExpression(source, this.parserConfigValue);
  }

  /**
   * parseSource parses a lower-level CEL source while preserving its description and locations.
   */
  public parseSource(source: Source): AST {
    return parseExpressionSource(source, this.parserConfigValue);
  }

  /**
   * tryParse parses a CEL source string and returns structured diagnostics instead of throwing.
   */
  public tryParse(source: string): CompileResult {
    const result = tryParseExpression(source, this.parserConfigValue);
    return {
      ast: result.ast,
      errors:
        result.errors === undefined
          ? undefined
          : issues({ errors: result.errors, sourceInfo: result.ast.sourceInfo() }),
    };
  }

  /**
   * tryParseSource parses a lower-level CEL source and returns structured diagnostics.
   */
  public tryParseSource(source: Source): CompileResult {
    const result = tryParseExpressionSource(source, this.parserConfigValue);
    return {
      ast: result.ast,
      errors:
        result.errors === undefined
          ? undefined
          : issues({ errors: result.errors, sourceInfo: result.ast.sourceInfo() }),
    };
  }

  /**
   * check type-checks a parsed AST using its corresponding source.
   */
  public check(parsed: AST, source: Source): AST {
    this.assertExpressionNodeLimit(parsed);
    const checked = checkExpression(parsed, source, this.checkerValue);
    const validationErrors = this.validateAst(checked, source);
    if (validationErrors !== undefined) {
      throw new Error(validationErrors.toDisplayString());
    }
    return new AST(
      checked.expr(),
      checked.sourceInfo(),
      checked.typeMap(),
      checked.referenceMap(),
      source,
    );
  }

  /**
   * compile parses and checks a CEL source string.
   */
  public compile(source: string): AST {
    const result = this.tryCompile(source);
    if (result.errors !== undefined) {
      throw new Error(result.errors.toDisplayString());
    }
    return result.ast;
  }

  /**
   * compileSource parses and checks a lower-level CEL source while preserving source metadata.
   */
  public compileSource(source: Source): AST {
    const result = this.tryCompileSource(source);
    if (result.errors !== undefined) {
      throw new Error(result.errors.toDisplayString());
    }
    return result.ast;
  }

  /**
   * tryCompile parses and checks a CEL source string, returning diagnostics instead of throwing.
   */
  public tryCompile(source: string): CompileResult {
    const parsed = this.tryParse(source);
    if (parsed.errors) {
      return parsed;
    }
    const sourceValue = textSource(source);
    const nodeLimitErrors = this.expressionNodeLimitErrors(parsed.ast, sourceValue);
    if (nodeLimitErrors !== undefined) {
      return { ast: parsed.ast, errors: nodeLimitErrors };
    }
    const result = tryCheckExpression(parsed.ast, sourceValue, this.checkerValue);
    if (result.errors !== undefined) {
      return {
        ast: result.ast,
        errors: issues({ errors: result.errors, sourceInfo: result.ast.sourceInfo() }),
      };
    }
    const validationErrors = this.validateAst(result.ast, sourceValue);
    return {
      ast: result.ast,
      errors:
        validationErrors === undefined
          ? undefined
          : issues({ errors: validationErrors, sourceInfo: result.ast.sourceInfo() }),
    };
  }

  /**
   * tryCompileSource parses and checks a lower-level CEL source with structured diagnostics.
   */
  public tryCompileSource(source: Source): CompileResult {
    const parsed = this.tryParseSource(source);
    if (parsed.errors) {
      return parsed;
    }
    const nodeLimitErrors = this.expressionNodeLimitErrors(parsed.ast, source);
    if (nodeLimitErrors !== undefined) {
      return { ast: parsed.ast, errors: nodeLimitErrors };
    }
    const result = tryCheckExpression(parsed.ast, source, this.checkerValue);
    if (result.errors !== undefined) {
      return {
        ast: result.ast,
        errors: issues({ errors: result.errors, sourceInfo: result.ast.sourceInfo() }),
      };
    }
    const validationErrors = this.validateAst(result.ast, source);
    return {
      ast: new AST(
        result.ast.expr(),
        result.ast.sourceInfo(),
        result.ast.typeMap(),
        result.ast.referenceMap(),
        source,
      ),
      errors:
        validationErrors === undefined
          ? undefined
          : issues({ errors: validationErrors, sourceInfo: result.ast.sourceInfo() }),
    };
  }

  /**
   * estimateCost computes the static evaluation-cost range for a checked AST.
   */
  public estimateCost(astValue: AST, estimator?: CostEstimator): CostEstimate {
    return estimateExpressionCost(astValue, estimator, this.costOptionsValue);
  }

  /**
   * extend creates an isolated environment which inherits this environment's configuration.
   */
  public extend(options: EnvOptions = {}): Env {
    if (this.contextProtoValue !== undefined && options.contextProto !== undefined) {
      throw new Error(
        `overlapping identifier for context proto ${options.contextProto.typeName}: context protobuf already declared`,
      );
    }
    return new Env({
      configuration: options.configuration,
      container: options.container ?? this.containerValue,
      registry: options.registry ?? this.registryValue.copy(),
      contextProto: options.contextProto ?? this.contextProtoValue,
      jsonFieldNames: options.jsonFieldNames ?? this.jsonFieldNamesValue,
      types: [...this.typesValue, ...(options.types ?? [])],
      variables: [...this.variablesValue, ...(options.variables ?? [])],
      functions: [...this.customFunctionsValue, ...(options.functions ?? [])],
      parser: {
        ...this.parserConfigValue,
        ...options.parser,
      },
      maxAstDepth: options.maxAstDepth ?? this.maxAstDepthValue,
      regexProgramSizeLimit:
        options.regexProgramSizeLimit ?? this.regexProgramSizeLimitValue,
      macros:
        options.macros === undefined
          ? undefined
          : {
              standard:
                options.macros.standard ?? this.parserConfigValue.enableStandardMacros ?? true,
              custom: [
                ...(this.parserConfigValue.macros?.values() ?? []),
                ...(options.macros.custom ?? []),
              ],
            },
      libraries: options.libraries,
      validators: [...this.validatorsValue, ...(options.validators ?? [])],
      errorOnBadPresenceTest: options.errorOnBadPresenceTest ?? this.errorOnBadPresenceTestValue,
      cost: {
        ...this.costOptionsValue,
        ...options.cost,
        overloadCostEstimates: {
          ...this.costOptionsValue.overloadCostEstimates,
          ...options.cost?.overloadCostEstimates,
        },
      },
      defaultUTCTimeZone: options.defaultUTCTimeZone ?? this.defaultUTCTimeZoneValue,
      checker: {
        ...this.checkerOptionsValue,
        ...options.checker,
      },
      standardLibrary:
        options.standardLibrary === undefined
          ? this.copyStandardLibrary()
          : options.standardLibrary,
      [envInheritance]: {
        libraryNames: this.libraryNamesValue,
        programOptions: this.libraryProgramOptionsValue,
      },
    });
  }

  /**
   * toConfig produces a YAML-serializable configuration representing this environment.
   */
  public toConfig(name: string): Config {
    const config = environmentConfig({ name });
    if (this.containerValue !== defaultContainer) {
      config.setContainer(this.containerValue.name());
    }
    for (const qualifiedName of this.containerValue.aliasSet().values()) {
      config.addImports(importType(qualifiedName));
    }
    if (this.standardLibraryValue === false) {
      config.setStdLib(librarySubset({ disabled: true }));
    } else if (this.standardLibraryValue.subset !== undefined) {
      config.setStdLib(this.standardLibraryValue.subset);
    }
    for (const library of this.librariesValue) {
      if (!("libraryAlias" in library) || typeof library.libraryAlias !== "string") {
        continue;
      }
      const version =
        "libraryVersion" in library && typeof library.libraryVersion === "number"
          ? library.libraryVersion === 0xffffffff
            ? "latest"
            : String(library.libraryVersion)
          : "latest";
      config.addExtensions(extension(library.libraryAlias, version));
    }
    if (this.contextProtoTypeNameValue !== undefined) {
      config.setContextVariable(contextVariable(this.contextProtoTypeNameValue));
    }
    const contextNames = new Set(
      contextVariableDeclarations({
        jsonFieldNames: this.jsonFieldNamesValue,
        provider: this.registryValue,
        schema: this.contextProtoValue,
        typeName: this.contextProtoTypeNameValue,
      }).map((declaration) => declaration.name()),
    );
    config.addVariableDecls(
      ...this.variablesValue.filter((declaration) => !contextNames.has(declaration.name())),
    );
    config.addFunctionDecls(...this.customFunctionsValue);
    if (this.jsonFieldNamesValue) {
      config.addFeatures(feature("cel.feature.json_field_names", true));
    }
    if (this.parserConfigValue.populateMacroCalls) {
      config.addFeatures(feature("cel.feature.macro_call_tracking", true));
    }
    if (this.parserConfigValue.maxExpressionNodeCount !== undefined) {
      config.addLimits(
        configLimit(
          "cel.limit.expression_node_count",
          this.parserConfigValue.maxExpressionNodeCount,
        ),
      );
    }
    if (this.maxAstDepthValue !== undefined) {
      config.addLimits(configLimit("cel.limit.max_ast_depth", this.maxAstDepthValue));
    }
    if (this.regexProgramSizeLimitValue !== undefined) {
      config.addLimits(
        configLimit("cel.limit.regex_program_size", this.regexProgramSizeLimitValue),
      );
    }
    for (const validator of [...this.validatorsValue].sort((left, right) =>
      left.name().localeCompare(right.name()),
    )) {
      config.addValidators(configValidator(validator.name(), validator.config?.() ?? {}));
    }
    return config;
  }

  /**
   * variables returns a shallow copy of the caller-configured variable declarations.
   */
  public variables(): VariableDecl[] {
    return [...this.variablesValue];
  }

  /**
   * macros returns the parser macros configured for the environment.
   */
  public macros(): Macro[] {
    return [...parserOptions(this.parserConfigValue).macros.values()];
  }

  /**
   * hasValidator reports whether the environment contains a validator with the given name.
   */
  public hasValidator(name: string): boolean {
    return this.validatorsValue.some((validator) => validator.name() === name);
  }

  /**
   * validators returns the environment's validators in execution order.
   */
  public validators(): ASTValidator[] {
    return [...this.validatorsValue];
  }

  /**
   * functions returns the merged function declarations keyed by function name.
   */
  public functions(): Map<string, FunctionDecl> {
    return new Map(this.functionsValue.map((declaration) => [declaration.name(), declaration]));
  }

  /**
   * hasFunction reports whether the environment contains a function declaration.
   */
  public hasFunction(name: string): boolean {
    return this.functionsValue.some((declaration) => declaration.name() === name);
  }

  /**
   * hasLibrary reports whether a singleton library is configured.
   */
  public hasLibrary(name: string): boolean {
    return this.libraryNamesValue.includes(name);
  }

  /**
   * libraries returns the configured singleton library names.
   */
  public libraries(): string[] {
    return [...this.libraryNamesValue];
  }

  /**
   * typeAdapter returns the CEL adapter configured for the environment.
   */
  public typeAdapter(): Adapter {
    return this.registryValue;
  }

  /**
   * typeProvider returns the CEL type provider configured for the environment.
   */
  public typeProvider(): Provider {
    return this.registryValue;
  }

  /**
   * Runs configured validators and returns diagnostics when any validator reports an issue.
   */
  private validateAst(ast: AST, source: Source): ReturnType<typeof errorsValue> | undefined {
    const issues = errorsValue(source);
    for (const validator of this.validatorsValue) {
      validator.validate(this, this.validatorConfigValue, ast, issues);
    }
    return issues.getErrors().length === 0 ? undefined : issues;
  }

  /**
   * assertExpressionNodeLimit rejects externally supplied ASTs before recursive type checking.
   */
  private assertExpressionNodeLimit(astValue: AST): void {
    const limit = parserOptions(this.parserConfigValue).maxExpressionNodeCount;
    const count = nodeCount(astValue);
    if (count > limit) {
      throw new Error(`expression node count exceeds limit: count ${count}, limit ${limit}`);
    }
  }

  /**
   * expressionNodeLimitErrors reports an expression-count failure as structured compile issues.
   */
  private expressionNodeLimitErrors(astValue: AST, source: Source): Issues | undefined {
    const limit = parserOptions(this.parserConfigValue).maxExpressionNodeCount;
    const count = nodeCount(astValue);
    if (count <= limit) {
      return undefined;
    }
    const diagnostics = errorsValue(source);
    diagnostics.reportErrorString(
      noLocation,
      `expression node count exceeds limit: count ${count}, limit ${limit}`,
    );
    return issues({ errors: diagnostics, sourceInfo: astValue.sourceInfo() });
  }

  /**
   * unknownVars returns a partial activation which marks every declared environment variable unknown.
   *
   * The unknown patterns take effect when the program enables partial evaluation.
   */
  public unknownVars(): PartialActivation {
    return this.partialVars({});
  }

  /**
   * partialVars marks configured environment variables missing from the input activation as unknown.
   *
   * The input may be an Activation or any valid binding map accepted by activation.
   */
  public partialVars(bindings: unknown): PartialActivation {
    const vars = activation({ bindings });
    const unknowns = this.variablesValue
      .filter((declaration) => !vars.resolveName(declaration.name())[1])
      .map((declaration) => attributePattern(declaration.name()));
    return partialActivation({
      bindings: vars,
      unknowns,
    });
  }

  /**
   * residualAst produces an AST containing only attribute references which remain unknown.
   *
   * Residual expressions can optimize known evaluations away, support expression indexing and
   * pruning, and surface additional inputs required to complete an evaluation.
   */
  public residualAst(astValue?: AST, details?: EvalDetails): AST {
    if (astValue === undefined) {
      throw new Error("unsupported expr: undefined");
    }
    const state = details?.state();
    if (state === undefined) {
      throw new Error("unsupported expr: evaluation details do not contain state");
    }
    const pruned = pruneAst({
      expr: astValue.expr(),
      macroCalls: astValue.sourceInfo().macroCalls(),
      state,
    });
    const expression = astToString(pruned);
    const parsed = this.parse(expression);
    return astValue.isChecked() ? this.check(parsed, textSource(expression)) : parsed;
  }

  /**
   * Copies the resolved standard-library configuration for an isolated extended environment.
   */
  private copyStandardLibrary(): StandardLibraryOptions | false {
    if (this.standardLibraryValue === false) {
      return false;
    }
    return {
      functions: [...(this.standardLibraryValue.functions ?? [])],
      subset: this.standardLibraryValue.subset,
      types: [...(this.standardLibraryValue.types ?? [])],
    };
  }

  /**
   * program creates an evaluable program from a parsed or checked AST.
   */
  public program(ast: AST, options: ProgramOptions = {}): Program {
    if (ast === undefined || ast === null) {
      throw new Error(`unsupported expr: ${String(ast)}`);
    }
    const resolvedOptions = mergeProgramOptions({
      base: this.libraryProgramOptionsValue,
      override: options,
    });
    const functions = dispatcher();
    for (const declaration of this.functionsValue) {
      functions.add({ overloads: declaration.bindings() });
    }
    const runtime = interpreter({
      dispatcher: functions,
      container: this.containerValue,
      provider: this.registryValue,
      adapter: this.registryValue,
      attrFactory: resolvedOptions.partialEval
        ? partialAttributeFactory({
            containerValue: this.containerValue,
            provider: this.registryValue,
            adapter: this.registryValue,
            errorOnBadPresenceTest: this.errorOnBadPresenceTestValue,
          })
        : attributeFactory({
            containerValue: this.containerValue,
            provider: this.registryValue,
            adapter: this.registryValue,
            errorOnBadPresenceTest: this.errorOnBadPresenceTestValue,
          }),
    });
    let plannerConfig: PlannerConfig | undefined =
      resolvedOptions.decorators === undefined
        ? undefined
        : { decorators: [...resolvedOptions.decorators] };
    const stateSink =
      resolvedOptions.trackState || resolvedOptions.exhaustiveEval
        ? new ProgramEvalStateSink()
        : undefined;
    const costTrackerSink =
      resolvedOptions.costTracking === undefined ? undefined : new ProgramCostTrackerSink();
    if (resolvedOptions.interruptCheckFrequency !== undefined) {
      const interruptConfig = interruptableEvalConfig();
      // Interrupt checks are a planner decorator in the lower-level interpreter, so
      // preserve caller decorators and observers while enabling that execution seam.
      plannerConfig = {
        decorators: [...(plannerConfig?.decorators ?? []), ...(interruptConfig.decorators ?? [])],
        observers: [...(plannerConfig?.observers ?? []), ...(interruptConfig.observers ?? [])],
      };
    }
    if (resolvedOptions.optimize) {
      const optimizationConfig = optimizeConfig();
      plannerConfig = {
        decorators: [
          ...(plannerConfig?.decorators ?? []),
          ...(optimizationConfig.decorators ?? []),
        ],
        observers: [...(plannerConfig?.observers ?? []), ...(optimizationConfig.observers ?? [])],
      };
    }
    const regexOptimizations = [
      ...(resolvedOptions.optimize ? [matchesRegexOptimization] : []),
      ...(resolvedOptions.regexOptimizations ?? []),
    ];
    if (regexOptimizations.length !== 0) {
      const regexConfig = compileRegexConstantsConfig({
        optimizations: regexOptimizations,
      });
      plannerConfig = {
        decorators: [...(plannerConfig?.decorators ?? []), ...(regexConfig.decorators ?? [])],
        observers: [...(plannerConfig?.observers ?? []), ...(regexConfig.observers ?? [])],
      };
    }
    if (
      this.regexProgramSizeLimitValue !== undefined &&
      this.regexProgramSizeLimitValue > 0
    ) {
      const regexLimitConfig = regexProgramSizeLimitConfig({
        limit: this.regexProgramSizeLimitValue,
      });
      plannerConfig = {
        decorators: [
          ...(plannerConfig?.decorators ?? []),
          ...(regexLimitConfig.decorators ?? []),
        ],
        observers: [
          ...(plannerConfig?.observers ?? []),
          ...(regexLimitConfig.observers ?? []),
        ],
      };
    }
    if (resolvedOptions.exhaustiveEval) {
      const exhaustiveConfig = exhaustiveEvalConfig();
      plannerConfig = {
        decorators: [...(plannerConfig?.decorators ?? []), ...(exhaustiveConfig.decorators ?? [])],
        observers: [...(plannerConfig?.observers ?? []), ...(exhaustiveConfig.observers ?? [])],
      };
    }
    if (stateSink !== undefined) {
      const stateConfig = evalStateObserverConfig({ sink: stateSink });
      plannerConfig = {
        decorators: [...(plannerConfig?.decorators ?? []), ...(stateConfig.decorators ?? [])],
        observers: [...(plannerConfig?.observers ?? []), ...(stateConfig.observers ?? [])],
      };
    }
    if (costTrackerSink !== undefined) {
      const costConfig = costObserverConfig({
        trackerFactory: () => {
          const tracker = costTracker(resolvedOptions.costTracking);
          costTrackerSink.setCostTracker(tracker);
          return tracker;
        },
      });
      plannerConfig = {
        decorators: [...(plannerConfig?.decorators ?? []), ...(costConfig.decorators ?? [])],
        observers: [...(plannerConfig?.observers ?? []), ...(costConfig.observers ?? [])],
      };
    }
    return programValue(
      runtime.interpretable({
        exprAst: ast,
        plannerConfig,
      }),
      {
        asyncMaxConcurrency: resolvedOptions.asyncMaxConcurrency,
        asyncObserver: resolvedOptions.asyncObserver,
        costTrackerSink,
        globals:
          resolvedOptions.globals === undefined
            ? undefined
            : activation({ bindings: resolvedOptions.globals }),
        interruptCheckFrequency: resolvedOptions.interruptCheckFrequency,
        hasAsync: this.functionsValue.some((declaration) =>
          declaration.bindings().some((binding) => binding.async !== undefined),
        ),
        stateSink,
      },
    );
  }

  /**
   * optimize applies ordered optimization passes to a checked AST using this environment.
   */
  public optimize(ast: AST, ...passes: ASTOptimizer[]): AST {
    return staticOptimizer({ optimizers: passes }).optimize(this, ast);
  }
}

/**
 * ContextVariableDeclarationsOptions configures declarations derived from a protobuf message.
 */
interface ContextVariableDeclarationsOptions {
  /** jsonFieldNames selects JSON names instead of protobuf source names. */
  jsonFieldNames: boolean;

  /** provider resolves the CEL type of each protobuf field. */
  provider: Registry;

  /** schema optionally identifies the context message. */
  schema?: DescMessage;

  /** typeName identifies a configured context type when no schema handle is available. */
  typeName?: string;
}

/**
 * contextVariableDeclarations converts protobuf fields into top-level CEL variables.
 */
function contextVariableDeclarations(options: ContextVariableDeclarationsOptions): VariableDecl[] {
  if (options.schema === undefined) {
    if (options.typeName === undefined) {
      return [];
    }
    const [fieldNames, found] = options.provider.findStructFieldNames(options.typeName);
    if (!found) {
      throw new Error(`invalid context proto type: "${options.typeName}"`);
    }
    return fieldNames.map((name) => {
      const [fieldType, fieldFound] = options.provider.findStructFieldType(options.typeName!, name);
      if (!fieldFound || fieldType === undefined) {
        throw new Error(`context proto field type not found: ${options.typeName}.${name}`);
      }
      return variableDecl(name, fieldType.type);
    });
  }
  return options.schema.fields.map((field) => {
    const name = options.jsonFieldNames ? field.jsonName : field.name;
    const [fieldType, found] = options.provider.findStructFieldType(options.schema!.typeName, name);
    if (!found || fieldType === undefined) {
      throw new Error(`context proto field type not found: ${options.schema!.typeName}.${name}`);
    }
    return variableDecl(name, fieldType.type);
  });
}

/**
 * applyEnvironmentConfiguration translates a serializable Config into ordinary EnvOptions.
 */
function applyEnvironmentConfiguration(options: EnvOptions): EnvOptions {
  const configuration = options.configuration;
  if (configuration === undefined) {
    return options;
  }
  const config = configuration.config;
  const validationError = config.validate();
  if (validationError !== undefined) {
    throw validationError;
  }
  if (config.stdlib?.disableMacros && !config.stdlib.disabled) {
    throw new Error("invalid subset: macro disabling requires an explicitly configured stdlib");
  }
  const provider = options.registry ?? registry();
  let configured: EnvOptions = {
    configuration,
    container: container({
      abbrevs: config.imports.map((entry) => entry.name),
      name: config.container,
    }),
    functions: config.functions.map((fn) => {
      try {
        return fn.asCELFunction(provider);
      } catch (cause) {
        throw new Error(`invalid function "${fn.name}": ${(cause as Error).message}`);
      }
    }),
    libraries: [],
    registry: provider,
    standardLibrary:
      config.stdlib === undefined
        ? undefined
        : config.stdlib.disabled
          ? false
          : { subset: config.stdlib },
    variables: config.variables.map((variable) => {
      try {
        return variable.asCELVariable(provider);
      } catch (cause) {
        throw new Error(`invalid variable "${variable.name}": ${(cause as Error).message}`);
      }
    }),
  };
  for (const feature of config.features) {
    if (feature.name === "cel.feature.backtick_escape_syntax") {
      configured.parser = { ...configured.parser, enableIdentEscapeSyntax: feature.enabled };
    } else if (feature.name === "cel.feature.json_field_names") {
      configured.jsonFieldNames = feature.enabled;
    } else if (feature.name === "cel.feature.macro_call_tracking") {
      configured.parser = { ...configured.parser, populateMacroCalls: feature.enabled };
    }
  }
  for (const limit of config.limits) {
    if (limit.name === "cel.limit.expression_code_points") {
      configured.parser = { ...configured.parser, expressionSizeCodePointLimit: limit.value };
    } else if (limit.name === "cel.limit.parse_error_recovery") {
      configured.parser = { ...configured.parser, errorRecoveryLimit: limit.value };
    } else if (limit.name === "cel.limit.parse_recursion_depth") {
      configured.parser = { ...configured.parser, maxRecursionDepth: limit.value };
    } else if (limit.name === "cel.limit.expression_node_count") {
      configured.parser = { ...configured.parser, maxExpressionNodeCount: limit.value };
    } else if (limit.name === "cel.limit.max_ast_depth") {
      configured.maxAstDepth = limit.value;
    } else if (limit.name === "cel.limit.regex_program_size") {
      configured.regexProgramSizeLimit = limit.value;
    }
  }
  const validators: ASTValidator[] = [];
  for (const validator of config.validators) {
    if (
      validator.name === "cel.validator.comprehension_nesting_limit" ||
      validator.name === "cel.validator.bind_nesting_limit" ||
      validator.name === "cel.validator.regex_program_size_limit"
    ) {
      const limit = validatorIntegerConfig(validator.name, validator.config.limit);
      validators.push(
        validator.name === "cel.validator.bind_nesting_limit"
          ? validateBindNestingLimit(limit)
          : validator.name === "cel.validator.regex_program_size_limit"
            ? validateRegexProgramSizeLimit(limit)
            : validateComprehensionNestingLimit(limit),
      );
      continue;
    }
    const builtin = extendedValidations().find((candidate) => candidate.name() === validator.name);
    if (builtin !== undefined) {
      validators.push(builtin);
      continue;
    }
    const handled = configuration.validators?.[validator.name];
    if (handled !== undefined) {
      configured = mergeEnvOptions({ base: configured, override: handled });
    }
  }
  configured.validators = [...(configured.validators ?? []), ...validators];
  for (const extension of config.extensions) {
    if (extension.name === "optional") {
      configured.libraries = [
        ...(configured.libraries ?? []),
        optionalTypes({ version: extension.versionNumber() }),
      ];
      continue;
    }
    const handled =
      configuration.extensions?.[`${extension.name}@${extension.version}`] ??
      configuration.extensions?.[extension.name];
    if (handled === undefined) {
      throw new Error(`unrecognized extension: ${extension.name}`);
    }
    const extensionLibraries = [...(configured.libraries ?? []), ...(handled.libraries ?? [])];
    configured = mergeEnvOptions({ base: configured, override: handled });
    // Declarative extension mappings commonly contribute linked libraries. Preserve them here;
    // mergeEnvOptions otherwise clears library inputs for its separate library-flattening pass.
    configured.libraries = extensionLibraries;
  }
  const merged = mergeEnvOptions({
    base: configured,
    override: {
      ...options,
      configuration,
    },
  });
  merged.libraries = [...(configured.libraries ?? []), ...(options.libraries ?? [])];
  // Applying serialized configuration to an existing environment replaces validators with the
  // same singleton name, so configured validators must be merged after inherited validators.
  merged.validators = [...(options.validators ?? []), ...(configured.validators ?? [])];
  return merged;
}

/**
 * validatorIntegerConfig validates a whole-number validator configuration value.
 */
function validatorIntegerConfig(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`invalid validator: ${name}, unsupported limit type: ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`invalid validator: ${name}, limit value is not a whole number: ${value}`);
  }
  return value;
}

/**
 * env creates a CEL program environment with the standard library and provided options.
 */
export function env(options: EnvOptions = {}): Env {
  return new Env(options);
}

/**
 * strongEnumFunctions exposes registered protobuf enum types as checked conversion functions.
 */
function strongEnumFunctions(typeRegistry: Registry): FunctionDecl[] {
  if (!typeRegistry.strongEnumsEnabled()) {
    return [];
  }
  const constructors: FunctionDecl[] = [];
  const intConversions = [];
  for (const enumType of typeRegistry.enumTypes()) {
    const resultType = objectType(enumType.typeName);
    constructors.push(
      functionDecl(enumType.typeName, {
        doc: [`convert an int or declared symbolic name to ${enumType.typeName}`],
        overloads: [
          overload(`${enumType.typeName}_from_int`, [IntType], resultType, {
            unaryBinding: (value) =>
              typeRegistry.enumValueOf(enumType.typeName, value.value() as bigint),
          }),
          overload(`${enumType.typeName}_from_string`, [StringType], resultType, {
            unaryBinding: (value) =>
              typeRegistry.enumValueOf(enumType.typeName, value.value() as string),
          }),
        ],
      }),
    );
    intConversions.push(
      overload(`${enumType.typeName}_to_int`, [resultType], IntType, {
        unaryBinding: (value) => value.convertToType(IntType),
      }),
    );
  }
  if (intConversions.length !== 0) {
    constructors.push(
      functionDecl("int", {
        doc: ["convert a strongly typed protobuf enum to its signed numeric value"],
        overloads: intConversions,
      }),
    );
  }
  return constructors;
}

/**
 * compile creates an environment, compiles source, and returns an executable program.
 */
export function compile(source: string, options: EnvOptions = {}): Program {
  const environment = env(options);
  return environment.program(environment.compile(source));
}

/**
 * mergeFunctionDeclarations applies cel-go's declaration merge rules by function name.
 */
function mergeFunctionDeclarations(declarations: FunctionDecl[]): FunctionDecl[] {
  const merged = new Map<string, FunctionDecl>();
  for (const declaration of declarations) {
    const existing = merged.get(declaration.name());
    merged.set(
      declaration.name(),
      existing === undefined ? declaration : existing.merge(declaration),
    );
  }
  return [...merged.values()];
}

/**
 * ResolveLibrariesOptions supplies the initial environment options to library composition.
 */
interface ResolveLibrariesOptions {
  /** Inheritance contains singleton names and runtime options already applied by a parent. */
  inheritance?: EnvInheritanceOptions;
  /** Options contains caller-provided environment and library configuration. */
  options: EnvOptions;
}

/**
 * ResolveLibrariesResult contains flattened environment and program library configuration.
 */
interface ResolveLibrariesResult {
  /** Libraries contains concrete libraries applied during this resolution. */
  libraries: Library[];
  /** Names contains configured singleton library identifiers. */
  names: string[];
  /** Options contains compile options after applying every library. */
  options: EnvOptions;
  /** ProgramOptions contains static runtime options contributed by libraries. */
  programOptions: ProgramOptions;
}

/**
 * resolveLibraries applies linked libraries once and collects their static program options.
 */
function resolveLibraries(options: ResolveLibrariesOptions): ResolveLibrariesResult {
  let resolvedOptions: EnvOptions = {
    ...options.options,
    libraries: undefined,
  };
  let programOptions: ProgramOptions = options.inheritance?.programOptions ?? {};
  const names = new Set(options.inheritance?.libraryNames ?? []);
  const queue = [...(options.options.libraries ?? [])];
  const libraries: Library[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const library = queue[index]!;
    for (const required of library.requiredLibraries ?? []) {
      if (!names.has(required)) {
        const label =
          required === "cel.lib.optional" ? "optional library" : `library '${required}'`;
        throw new Error(
          `${"libraryAlias" in library ? String(library.libraryAlias) : "extension"} library requires the ${label}`,
        );
      }
    }
    const name =
      "libraryName" in library && typeof library.libraryName === "string"
        ? library.libraryName
        : undefined;
    if (name !== undefined && names.has(name)) {
      continue;
    }
    if (name !== undefined) {
      names.add(name);
    }
    libraries.push(library);
    const compileOptions = library.compileOptions;
    queue.push(...(compileOptions.libraries ?? []));
    resolvedOptions = mergeEnvOptions({
      base: resolvedOptions,
      override: compileOptions,
    });
    programOptions = mergeProgramOptions({
      base: programOptions,
      override: library.programOptions,
    });
  }

  if (resolvedOptions.standardLibrary !== false) {
    names.add("cel.lib.std");
  } else {
    names.delete("cel.lib.std");
  }
  return {
    libraries,
    names: [...names],
    options: resolvedOptions,
    programOptions,
  };
}

/**
 * MergeEnvOptions combines environment configuration contributed by a library.
 */
interface MergeEnvOptions {
  /** Base contains configuration accumulated so far. */
  base: EnvOptions;
  /** Override contains the next library configuration. */
  override: EnvOptions;
}

/**
 * mergeEnvOptions appends declarations and merges configuration objects.
 */
function mergeEnvOptions(options: MergeEnvOptions): EnvOptions {
  return {
    ...options.base,
    ...options.override,
    checker: {
      ...options.base.checker,
      ...options.override.checker,
    },
    cost: {
      ...options.base.cost,
      ...options.override.cost,
      overloadCostEstimates: {
        ...options.base.cost?.overloadCostEstimates,
        ...options.override.cost?.overloadCostEstimates,
      },
    },
    functions: [...(options.base.functions ?? []), ...(options.override.functions ?? [])],
    libraries: undefined,
    macros:
      options.base.macros === undefined && options.override.macros === undefined
        ? undefined
        : {
            standard: options.override.macros?.standard ?? options.base.macros?.standard,
            custom: [
              ...(options.base.macros?.custom ?? []),
              ...(options.override.macros?.custom ?? []),
            ],
          },
    parser: {
      ...options.base.parser,
      ...options.override.parser,
    },
    validators: [...(options.base.validators ?? []), ...(options.override.validators ?? [])],
    types: [...(options.base.types ?? []), ...(options.override.types ?? [])],
    variables: [...(options.base.variables ?? []), ...(options.override.variables ?? [])],
  };
}

/**
 * uniqueValidators preserves validator order while applying each singleton name at most once.
 */
function uniqueValidators(validators: ASTValidator[]): ASTValidator[] {
  const unique: ASTValidator[] = [];
  const indices = new Map<string, number>();
  for (const validator of validators) {
    const existing = indices.get(validator.name());
    if (existing !== undefined) {
      unique[existing] = validator;
      continue;
    }
    indices.set(validator.name(), unique.length);
    unique.push(validator);
  }
  return unique;
}

/**
 * MergeProgramOptions combines static library options with per-program overrides.
 */
interface MergeProgramOptions {
  /** Base contains program options accumulated so far. */
  base: ProgramOptions;
  /** Override contains options with higher precedence. */
  override: ProgramOptions;
}

/**
 * mergeProgramOptions combines planner hooks while allowing scalar overrides.
 */
function mergeProgramOptions(options: MergeProgramOptions): ProgramOptions {
  return {
    ...options.base,
    ...options.override,
    costTracking:
      options.base.costTracking === undefined && options.override.costTracking === undefined
        ? undefined
        : {
            ...options.base.costTracking,
            ...options.override.costTracking,
            overloadTrackers: {
              ...options.base.costTracking?.overloadTrackers,
              ...options.override.costTracking?.overloadTrackers,
            },
          },
    decorators: [...(options.base.decorators ?? []), ...(options.override.decorators ?? [])],
    regexOptimizations: [
      ...(options.base.regexOptimizations ?? []),
      ...(options.override.regexOptimizations ?? []),
    ],
  };
}
