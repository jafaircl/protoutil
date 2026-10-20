import type { DescMessage } from "@bufbuild/protobuf";
import {
  type Env,
  type EnvState,
  env,
  envInheritance,
  envState,
  type LibraryKey,
  mergeFunctionDeclarations,
  type ProgramOptions,
  type StandardLibraryOptions,
} from "../cel/env.js";
import type { AST, Expr } from "../common/ast/index.js";
import { ExprKind } from "../common/ast/index.js";
import { type Container, type ContainerAlias, defaultContainer } from "../common/containers.js";
import type { FunctionDecl } from "../common/decls.js";
import { exprTypeToType, Kind, type Type } from "../common/types/types.js";
import { type Macro, macroKey, type ParserConfig, parserOptions } from "../parser/options.js";

/**
 * composeEnvironments folds each environment onto the first, in order. The declaration, overload,
 * type, and registry rules the environment already applies when it is constructed remain the single
 * source of truth for what is compatible, so a conflict surfaces before composeEnvironments returns
 * rather than on a later check. No input environment is modified, and the result is usable
 * independently of them.
 */
export function composeEnvironments(...environments: Env[]): Env {
  if (environments.length === 0) {
    throw new Error("composeEnvironments requires at least one environment");
  }
  let result = environments[0]!;
  for (const source of environments.slice(1)) {
    result = extendEnvironment(result, source);
  }
  return result;
}

/**
 * extendEnvironment builds one environment out of the effective state of two.
 *
 * Declarations, types, macros, validators, and library program options are combined; the settings
 * that change how an already-checked expression evaluates -- JSON field names, the default time
 * zone, presence-test error behavior, and the program options that change evaluation results --
 * must agree, because a composed environment cannot honour two of them at once.
 *
 * Parser and checker settings are combined rather than compared. They govern which source text is
 * admitted, not how a checked expression evaluates, so the composed environment admits at least
 * what each input admitted. Libraries are carried by name together with the program options they
 * resolved to, not replayed: their compile-time contributions are already materialized in the
 * declarations, macros, and parser settings being combined here.
 */
function extendEnvironment(target: Env, source: Env): Env {
  const base = target[envState]();
  const incoming = source[envState]();
  requireEqual("jsonFieldNames configuration", base.jsonFieldNames, incoming.jsonFieldNames);
  requireEqual(
    "defaultUTCTimeZone configuration",
    base.defaultUTCTimeZone,
    incoming.defaultUTCTimeZone,
  );
  requireEqual(
    "errorOnBadPresenceTest configuration",
    base.errorOnBadPresenceTest,
    incoming.errorOnBadPresenceTest,
  );
  const baseSemantics = programSemantics(base);
  const incomingSemantics = programSemantics(incoming);
  requireEqual(
    "exhaustiveEval program option",
    baseSemantics.exhaustiveEval,
    incomingSemantics.exhaustiveEval,
  );
  requireEqual(
    "partialEval program option",
    baseSemantics.partialEval,
    incomingSemantics.partialEval,
  );

  return env({
    checker: {
      crossTypeNumericComparisons:
        base.checker.crossTypeNumericComparisons === true ||
        incoming.checker.crossTypeNumericComparisons === true,
      homogeneousAggregateLiterals:
        base.checker.homogeneousAggregateLiterals === true &&
        incoming.checker.homogeneousAggregateLiterals === true,
    },
    container: mergeContainers(base.container, incoming.container),
    contextProto: mergeContextProtos(base.contextProto, incoming.contextProto),
    // Cost settings only estimate the cost of checking an expression, so where the inputs disagree
    // the first environment's estimate is kept instead of failing the composition.
    cost: {
      ...incoming.cost,
      ...base.cost,
      overloadCostEstimates: {
        ...incoming.cost.overloadCostEstimates,
        ...base.cost.overloadCostEstimates,
      },
    },
    defaultUTCTimeZone: base.defaultUTCTimeZone,
    errorOnBadPresenceTest: base.errorOnBadPresenceTest,
    functions: mergeFunctionDeclarations([...base.customFunctions, ...incoming.customFunctions]),
    jsonFieldNames: base.jsonFieldNames,
    maxAstDepth: widestLimit(base.maxAstDepth, incoming.maxAstDepth),
    parser: mergeParserConfigs(base, incoming),
    regexProgramSizeLimit: widestLimit(base.regexProgramSizeLimit, incoming.regexProgramSizeLimit),
    registry: base.registry.extend(incoming.registry),
    standardLibrary: mergeStandardLibraries(base.standardLibrary, incoming.standardLibrary),
    types: mergeTypes(base.types, incoming.types),
    validators: mergeByKey([...target.validators(), ...source.validators()], (validator) =>
      validator.name(),
    ),
    variables: [...target.variables(), ...source.variables()],
    [envInheritance]: {
      libraryNames: [...new Set([...target.libraries(), ...source.libraries()])],
      programOptions: mergeLibraryProgramOptions(
        base.libraryProgramOptions,
        incoming.libraryProgramOptions,
      ),
    },
  });
}

function requireEqual<T>(label: string, baseValue: T, incomingValue: T): void {
  if (baseValue !== incomingValue) {
    throw new Error(`conflicting ${label} between composed environments`);
  }
}

/**
 * mergeContainers keeps the one container name both environments can resolve names against. A
 * container only resolves names while parsing and checking source text, so an environment without
 * one adopts the other's; two different names cannot both apply.
 */
function mergeContainers(base: Container, incoming: Container): Container {
  if (base.name() !== "" && incoming.name() !== "" && base.name() !== incoming.name()) {
    throw new Error(`conflicting containers: "${base.name()}" and "${incoming.name()}"`);
  }
  const [primary, secondary] = base.name() === "" ? [incoming, base] : [base, incoming];
  const existing = primary.aliasSet();
  const additions: ContainerAlias[] = [];
  for (const [alias, qualifiedName] of secondary.aliasSet()) {
    if (existing.get(alias) === qualifiedName) {
      continue;
    }
    additions.push({ alias, qualifiedName });
  }
  if (additions.length === 0) {
    return primary;
  }
  return primary.extend({ aliases: additions });
}

function mergeContextProtos(
  base: DescMessage | undefined,
  incoming: DescMessage | undefined,
): DescMessage | undefined {
  if (base === undefined || incoming === undefined) {
    return base ?? incoming;
  }
  if (base.typeName !== incoming.typeName) {
    throw new Error(
      `conflicting context types: "${base.typeName}" and "${incoming.typeName}" between composed environments`,
    );
  }
  return base;
}

/**
 * mergeParserConfigs combines two parser configurations so the result admits at least the source
 * text either input admitted: every syntax feature either input enabled stays enabled, and every
 * limit widens to the more permissive of the two. None of these settings changes how an
 * already-checked expression evaluates, so none of them can conflict.
 */
function mergeParserConfigs(base: EnvState, incoming: EnvState): ParserConfig {
  const left = parserOptions(base.parser);
  const right = parserOptions(incoming.parser);
  return {
    enableHiddenAccumulatorName:
      left.enableHiddenAccumulatorName || right.enableHiddenAccumulatorName,
    enableIdentEscapeSyntax: left.enableIdentEscapeSyntax || right.enableIdentEscapeSyntax,
    enableOptionalSyntax: left.enableOptionalSyntax || right.enableOptionalSyntax,
    enableStandardMacros: left.enableStandardMacros || right.enableStandardMacros,
    enableVariadicOperatorASTs: left.enableVariadicOperatorASTs || right.enableVariadicOperatorASTs,
    errorRecoveryLimit: Math.max(left.errorRecoveryLimit, right.errorRecoveryLimit),
    errorRecoveryTokenLookaheadLimit: Math.max(
      left.errorRecoveryTokenLookaheadLimit,
      right.errorRecoveryTokenLookaheadLimit,
    ),
    errorReportingLimit: Math.max(left.errorReportingLimit, right.errorReportingLimit),
    expressionSizeCodePointLimit: Math.max(
      left.expressionSizeCodePointLimit,
      right.expressionSizeCodePointLimit,
    ),
    macros: mergeMacros(base.macros, incoming.macros),
    maxExpressionNodeCount: Math.max(left.maxExpressionNodeCount, right.maxExpressionNodeCount),
    maxRecursionDepth: Math.max(left.maxRecursionDepth, right.maxRecursionDepth),
    populateMacroCalls: left.populateMacroCalls || right.populateMacroCalls,
  };
}

/**
 * mergeMacros combines two macro sets. A macro signature identifies one macro definition, so a
 * signature both environments declare is kept once, from the first environment: comparing the two
 * expanders is not possible and not meaningful.
 */
function mergeMacros(base: Map<string, Macro>, incoming: Map<string, Macro>): Map<string, Macro> {
  const merged = new Map(base);
  for (const [key, macro] of incoming) {
    if (!merged.has(key)) {
      merged.set(key, macro);
    }
  }
  return merged;
}

/**
 * mergeByKey keeps the first value declared for each identity.
 */
function mergeByKey<T>(values: T[], key: (value: T) => string): T[] {
  const merged = new Map<string, T>();
  for (const value of values) {
    if (!merged.has(key(value))) {
      merged.set(key(value), value);
    }
  }
  return [...merged.values()];
}

/**
 * mergeTypes keeps one registration per type name. The composed registry has already rejected two
 * incompatible types registered under one name, so the surviving registrations are interchangeable.
 */
function mergeTypes(base: Type[], incoming: Type[]): Type[] {
  return mergeByKey([...base, ...incoming], (type) => type.typeName());
}

/**
 * mergeStandardLibraries combines the standard declarations of both environments.
 *
 * Standard declarations are additive: an environment which excluded some of them, or all of them,
 * can still evaluate every expression it checked once the excluded declarations are added back. The
 * merged result therefore carries no subset filter -- the union of two subsets is expressed by the
 * declarations themselves.
 */
function mergeStandardLibraries(
  base: StandardLibraryOptions | false,
  incoming: StandardLibraryOptions | false,
): StandardLibraryOptions | false {
  if (base === false) {
    return incoming === false ? false : { ...incoming };
  }
  if (incoming === false) {
    return { ...base };
  }
  return {
    functions: mergeFunctionDeclarations([
      ...(base.functions ?? []),
      ...(incoming.functions ?? []),
    ]),
    types: mergeByKey([...(base.types ?? []), ...(incoming.types ?? [])], (type) => type.name()),
  };
}

/**
 * widestLimit combines two resource limits into the one that rejects the least. An unset limit is
 * unlimited, so it absorbs any configured limit: a composed environment must not reject an
 * expression that an input environment could plan and evaluate.
 */
function widestLimit(base: number | undefined, incoming: number | undefined): number | undefined {
  if (base === undefined || incoming === undefined) {
    return undefined;
  }
  return Math.max(base, incoming);
}

/**
 * exclusiveProgramOptions names the program options which have one effective value per program and
 * change how it is planned or observed. Two environments may each leave one unset, but they may not
 * disagree about it.
 */
const exclusiveProgramOptions = [
  "asyncMaxConcurrency",
  "asyncObserver",
  "globals",
  "interruptCheckFrequency",
  "optimize",
  "trackState",
] as const;

/**
 * mergeLibraryProgramOptions combines the program options both environments inherited from their
 * libraries. Options are keyed by library, so a library installed in both environments contributes
 * its options once.
 */
function mergeLibraryProgramOptions(
  base: ReadonlyMap<LibraryKey, ProgramOptions>,
  incoming: ReadonlyMap<LibraryKey, ProgramOptions>,
): Map<LibraryKey, ProgramOptions> {
  const merged = new Map(base);
  for (const [key, options] of incoming) {
    if (!merged.has(key)) {
      merged.set(key, options);
    }
  }
  const claimed = new Map<string, unknown>();
  for (const options of merged.values()) {
    for (const name of exclusiveProgramOptions) {
      const value = options[name];
      if (value === undefined) {
        continue;
      }
      const existing = claimed.get(name);
      if (existing !== undefined && existing !== value) {
        throw new Error(`conflicting ${name} program option between composed environments`);
      }
      claimed.set(name, value);
    }
  }
  return merged;
}

/**
 * ProgramSemantics contains the program options which change what an already-checked expression
 * evaluates to, rather than how the evaluation is planned or observed.
 */
interface ProgramSemantics {
  /** exhaustiveEval reports whether short-circuiting is disabled. */
  exhaustiveEval: boolean;
  /** partialEval reports whether unknown attributes are resolved instead of failing. */
  partialEval: boolean;
}

function programSemantics(state: EnvState): ProgramSemantics {
  const semantics: ProgramSemantics = { exhaustiveEval: false, partialEval: false };
  for (const options of state.libraryProgramOptions.values()) {
    semantics.exhaustiveEval = options.exhaustiveEval ?? semantics.exhaustiveEval;
    semantics.partialEval = options.partialEval ?? semantics.partialEval;
  }
  return semantics;
}

/**
 * equalEnvironments reports whether two environments have equivalent effective behavior: each can
 * plan and evaluate every checked expression the other produces, and the state assignability does
 * not cover -- container, macros, and validators -- also matches.
 */
export function equalEnvironments(a: Env, b: Env): boolean {
  return (
    assignableEnvironment(a, b) && assignableEnvironment(b, a) && equalNonAssignableState(a, b)
  );
}

/**
 * equalNonAssignableState compares the state that two environments can differ in while remaining
 * assignable to each other, because it governs which source text they admit rather than what a
 * checked expression evaluates to.
 */
function equalNonAssignableState(a: Env, b: Env): boolean {
  if (!containersEqual(a[envState]().container, b[envState]().container)) {
    return false;
  }
  const macroKeys = (source: Env) =>
    new Set(
      source.macros().map((macro) => macroKey(macro.function, macro.argCount, macro.receiverStyle)),
    );
  if (!setsEqual(macroKeys(a), macroKeys(b))) {
    return false;
  }
  const validatorNames = (source: Env) => new Set(source.validators().map((v) => v.name()));
  return setsEqual(validatorNames(a), validatorNames(b));
}

function containersEqual(a: Container, b: Container): boolean {
  if (a === b) {
    return true;
  }
  if (a === defaultContainer || b === defaultContainer) {
    return a === defaultContainer && b === defaultContainer;
  }
  return a.name() === b.name();
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

/**
 * assignableEnvironment reports whether every checked expression `source` can produce can be
 * planned and evaluated by `target` without being checked again.
 *
 * `target` qualifies when it declares every variable with an assignable type, every overload id
 * with the same signature and a runtime binding wherever `source` has one, every struct type the
 * declarations reach, the same context type, every library `source` applied, a resource limit no
 * tighter than `source`'s, and the same evaluation semantics.
 *
 * The container is not part of this: it resolves names while checking source text, and a checked
 * expression's names are already resolved. Neither are the checker and parser settings or the
 * cost-estimation settings, which change what a later expression checks to rather than what an
 * already-checked expression evaluates to.
 */
export function assignableEnvironment(source: Env, target: Env): boolean {
  const sourceState = source[envState]();
  const targetState = target[envState]();
  const requiredTypeNames = new Set<string>();

  const targetVariables = new Map(target.variables().map((v) => [v.name(), v]));
  for (const sourceVariable of source.variables()) {
    const targetVariable = targetVariables.get(sourceVariable.name());
    if (
      targetVariable === undefined ||
      !targetVariable.type().isAssignableType(sourceVariable.type())
    ) {
      return false;
    }
    collectStructTypeNames(sourceVariable.type(), requiredTypeNames);
  }

  const targetFunctions = target.functions();
  for (const [name, sourceFunction] of source.functions()) {
    const targetFunction = targetFunctions.get(name);
    if (targetFunction === undefined) {
      return false;
    }
    const targetOverloads = targetFunction.overloadDecls();
    for (const sourceOverload of sourceFunction.overloadDecls()) {
      const match = targetOverloads.find((candidate) => candidate.id() === sourceOverload.id());
      if (match === undefined || !match.signatureEquals(sourceOverload)) {
        return false;
      }
      if (
        hasRuntimeBinding(sourceFunction, sourceOverload.id()) &&
        !hasRuntimeBinding(targetFunction, sourceOverload.id())
      ) {
        return false;
      }
      for (const argType of sourceOverload.argTypes()) {
        collectStructTypeNames(argType, requiredTypeNames);
      }
      collectStructTypeNames(sourceOverload.resultType(), requiredTypeNames);
    }
  }

  for (const libraryName of source.libraries()) {
    if (!target.hasLibrary(libraryName)) {
      return false;
    }
  }

  for (const type of sourceState.types) {
    collectStructTypeNames(type, requiredTypeNames);
  }
  for (const typeName of requiredTypeNames) {
    if (target.typeProvider().findStructType(typeName) === undefined) {
      return false;
    }
  }

  if (
    sourceState.contextProto !== undefined &&
    targetState.contextProto?.typeName !== sourceState.contextProto.typeName
  ) {
    return false;
  }

  if (
    targetState.regexProgramSizeLimit !== undefined &&
    (sourceState.regexProgramSizeLimit === undefined ||
      targetState.regexProgramSizeLimit < sourceState.regexProgramSizeLimit)
  ) {
    return false;
  }

  const sourceSemantics = programSemantics(sourceState);
  const targetSemantics = programSemantics(targetState);
  return (
    targetState.jsonFieldNames === sourceState.jsonFieldNames &&
    targetState.defaultUTCTimeZone === sourceState.defaultUTCTimeZone &&
    targetState.errorOnBadPresenceTest === sourceState.errorOnBadPresenceTest &&
    targetSemantics.exhaustiveEval === sourceSemantics.exhaustiveEval &&
    targetSemantics.partialEval === sourceSemantics.partialEval
  );
}

/**
 * collectStructTypeNames records every message type a declaration reaches, including the element
 * and value types of the lists and maps it is built from.
 */
function collectStructTypeNames(type: Type, names: Set<string>): void {
  if (type.kind() === Kind.Struct) {
    names.add(type.typeName());
  }
  for (const parameter of type.parameters()) {
    collectStructTypeNames(parameter, names);
  }
}

/**
 * hasRuntimeBinding reports whether calling one overload of a declaration dispatches to an
 * implementation. A late binding counts: the implementation is supplied when the program runs.
 */
function hasRuntimeBinding(declaration: FunctionDecl, overloadId: string): boolean {
  if (declaration.hasSingletonBinding()) {
    return true;
  }
  const overload = declaration.overloadDecls().find((candidate) => candidate.id() === overloadId);
  return overload !== undefined && (overload.hasBinding() || overload.hasLateBinding());
}

/**
 * canEvaluate reports whether one particular checked expression can be planned and evaluated by
 * `target`. It walks the expression's checked metadata and confirms `target` declares, and can
 * dispatch, every variable, overload, struct type, and field the expression references.
 *
 * canEvaluate never reparses or rechecks the expression, resolves names, selects overloads, or runs
 * validators: it treats the expression as already resolved and only asks whether `target` provides
 * what it resolved to. It is the check to use for a checked expression whose originating
 * environment is unknown; when that environment is known to be assignable to `target`, assignability
 * has already answered the question.
 */
export function canEvaluate(target: Env, expression: AST): boolean {
  if (!expression.isChecked()) {
    return false;
  }
  const targetVariableNames = new Set(target.variables().map((v) => v.name()));
  const targetFunctions = target.functions();
  const provider = target.typeProvider();
  let evaluable = true;

  const visit = (expr: Expr, bound: ReadonlySet<string>): void => {
    if (!evaluable) {
      return;
    }
    switch (expr.kind()) {
      case ExprKind.Ident: {
        const reference = expression.referenceMap().get(expr.id());
        if (reference?.value !== undefined) {
          break; // resolved to a compile-time constant; no runtime binding required.
        }
        const name = reference?.name ?? expr.asIdent() ?? "";
        if (!bound.has(name) && !targetVariableNames.has(name)) {
          evaluable = false;
        }
        break;
      }
      case ExprKind.Call: {
        const call = expr.asCall()!;
        const overloadIds = expression.getOverloadIds(expr.id());
        const targetFunction = targetFunctions.get(call.functionName());
        if (overloadIds.length === 0 || targetFunction === undefined) {
          evaluable = false;
          break;
        }
        const availableOverloads = new Set(targetFunction.overloadDecls().map((o) => o.id()));
        if (
          !overloadIds.every(
            (id) => availableOverloads.has(id) && hasRuntimeBinding(targetFunction, id),
          )
        ) {
          evaluable = false;
        }
        break;
      }
      case ExprKind.Struct: {
        const typeName = expr.asStruct()!.typeName();
        if (typeName.length > 0) {
          if (provider.findStructType(typeName) === undefined) {
            evaluable = false;
            break;
          }
          for (const field of expr.asStruct()!.fields()) {
            const structField = field.asStructField();
            if (
              structField !== undefined &&
              provider.findStructFieldType(typeName, structField.name()) === undefined
            ) {
              evaluable = false;
            }
          }
        }
        break;
      }
      case ExprKind.Select: {
        const select = expr.asSelect()!;
        const operandType = expression.getType(select.operand().id());
        if (operandType !== undefined) {
          const resolved = exprTypeToType(operandType);
          if (resolved.kind() === Kind.Struct) {
            const typeName = resolved.typeName();
            if (
              provider.findStructType(typeName) === undefined ||
              provider.findStructFieldType(typeName, select.fieldName()) === undefined
            ) {
              evaluable = false;
            }
          }
        }
        break;
      }
      case ExprKind.Comprehension: {
        // The comprehension's own iteration and accumulator variables are only in scope for its
        // loop condition, loop step, and result -- not for the range or initializer expressions,
        // which are evaluated before the variables exist.
        const comprehension = expr.asComprehension()!;
        visit(comprehension.iterRange(), bound);
        visit(comprehension.accuInit(), bound);
        const innerBound = new Set(bound);
        innerBound.add(comprehension.iterVar());
        if (comprehension.iterVar2().length > 0) {
          innerBound.add(comprehension.iterVar2());
        }
        innerBound.add(comprehension.accuVar());
        visit(comprehension.loopCondition(), innerBound);
        visit(comprehension.loopStep(), innerBound);
        visit(comprehension.result(), innerBound);
        return;
      }
      default:
        break;
    }
    for (const child of expr.children()) {
      visit(child, bound);
    }
  };

  visit(expression.expr(), new Set());
  return evaluable;
}
