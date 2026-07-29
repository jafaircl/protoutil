import type { ConstantValue } from "../common/ast/expr.js";
import {
  AST,
  ast as astValue,
  copySourceInfo,
  type EntryExpr,
  type Expr,
  type ExprFactory,
  exprFactory,
  postOrderVisit,
  type SourceInfo,
  sourceInfo,
} from "../common/ast/index.js";
import type { Source } from "../common/source.js";
import { False } from "../common/types/bool.js";
import type { Env, EnvOptions } from "./env.js";

/**
 * StaticOptimizerOptions configures a static optimizer without functional options.
 */
export interface StaticOptimizerOptions {
  /** optimizers contains the AST optimization passes applied in order. */
  optimizers?: ASTOptimizer[];

  /**
   * source overrides the source used by the optimizer.
   *
   * Setting this value discards the source info from the AST passed to `optimize`.
   */
  source?: Source;
}

/**
 * ASTOptimizer applies an optimization over an AST and returns the optimized result.
 */
export interface ASTOptimizer {
  /**
   * optimize optimizes a type-checked AST within an environment.
   */
  optimize(context: OptimizerContext, ast: AST): AST;
}

/**
 * StableIdGenerator ensures that fresh ids are only created the first time an id is encountered.
 */
class StableIdGenerator {
  /** idMap stores the stable mapping from old expression ids to fresh ids. */
  private readonly idMap = new Map<number, number>();

  /** constructor initializes the next-id sequence from a collision-free seed. */
  constructor(private seed: number) {}

  /** nextId returns the next unused expression id. */
  public nextId(): number {
    this.seed += 1;
    return this.seed;
  }

  /** stableId returns the same fresh id for every occurrence of an old id. */
  public stableId(id: number): number {
    if (id === 0) {
      return 0;
    }
    const existing = this.idMap.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const next = this.nextId();
    this.idMap.set(id, next);
    return next;
  }

  /** currentSeed returns the greatest id allocated by the generator. */
  public currentSeed(): number {
    return this.seed;
  }

  /** advanceTo reserves every id through the supplied seed. */
  public advanceTo(seed: number): void {
    this.seed = Math.max(this.seed, seed);
  }
}

/**
 * BindMacroOptions describes a `cel.bind` macro expression and expansion.
 */
export interface BindMacroOptions {
  /** macroId is the id assigned to the expanded comprehension. */
  macroId: number;
  /** variableName is the local variable introduced by the binding. */
  variableName: string;
  /** variableInitializer computes the local variable's value. */
  variableInitializer: Expr;
  /** remainingExpression is evaluated with the local variable in scope. */
  remainingExpression: Expr;
}

/**
 * MacroExpressionPair contains an expanded AST expression and its unexpanded macro call.
 */
export interface MacroExpressionPair {
  /** astExpr is the semantic expression inserted into the AST. */
  astExpr: Expr;
  /** macroExpr is the unexpanded call stored in source metadata. */
  macroExpr: Expr;
}

/**
 * CallOptions describes a global function call.
 */
export interface CallOptions {
  /** functionName names the CEL function being called. */
  functionName: string;
  /** arguments contains the positional call arguments. */
  arguments?: Expr[];
}

/**
 * MemberCallOptions describes a receiver-style function call.
 */
export interface MemberCallOptions extends CallOptions {
  /** target is the receiver of the member call. */
  target: Expr;
}

/**
 * ListOptions describes a list expression.
 */
export interface ListOptions {
  /** elements contains the list element expressions. */
  elements: Expr[];
  /** optionalIndices identifies elements guarded by optional syntax. */
  optionalIndices?: number[];
}

/**
 * MapEntryOptions describes a map entry expression.
 */
export interface MapEntryOptions {
  /** key is the map key expression. */
  key: Expr;
  /** value is the map value expression. */
  value: Expr;
  /** optional marks the entry as conditionally present. */
  optional?: boolean;
}

/**
 * HasMacroOptions describes a test-only select and its `has` macro call.
 */
export interface HasMacroOptions {
  /** macroId is the id assigned to the expanded presence test. */
  macroId: number;
  /** selection is the select expression tested for presence. */
  selection: Expr;
}

/**
 * SelectOptions describes a field selection expression.
 */
export interface SelectOptions {
  /** operand contains the value whose field is selected. */
  operand: Expr;
  /** field names the selected field. */
  field: string;
}

/**
 * StructOptions describes a typed struct expression.
 */
export interface StructOptions {
  /** typeName is the fully qualified message type name. */
  typeName: string;
  /** fields contains the struct field initializers. */
  fields: EntryExpr[];
}

/**
 * StructFieldOptions describes a struct field initializer.
 */
export interface StructFieldOptions {
  /** field names the initialized field. */
  field: string;
  /** value computes the initialized field value. */
  value: Expr;
  /** optional marks the field as conditionally present. */
  optional?: boolean;
}

/**
 * SetMacroCallOptions identifies macro metadata to store.
 */
export interface SetMacroCallOptions {
  /** id is the expression id associated with the macro call. */
  id: number;
  /** expr is the unexpanded macro expression. */
  expr: Expr;
}

/**
 * UpdateExprOptions identifies the target and replacement expression nodes.
 */
export interface UpdateExprOptions {
  /** target is the expression node mutated in place. */
  target: Expr;
  /** updated supplies the replacement expression kind and children. */
  updated: Expr;
}

/**
 * OptimizerContext embeds an environment and expression factory for type-safe AST rewrites.
 *
 * Generated subexpressions use ids consistent with parsed expressions, and copied macro metadata
 * is coordinated with the ids assigned to copied expression trees.
 */
export class OptimizerContext {
  /** factory constructs the concrete CEL expression node kinds. */
  private readonly factory: ExprFactory;

  /** ids allocates collision-free expression ids. */
  private readonly ids: StableIdGenerator;

  /** sourceInfoValue is the metadata shared by expressions produced by this context. */
  private readonly sourceInfoValue: SourceInfo;

  /** envValue is the environment used for rechecking optimized expressions. */
  private envValue: Env;

  /** constructor initializes a context for a single static optimization run. */
  constructor(options: {
    env: Env;
    idSeed: number;
    sourceInfo: SourceInfo;
  }) {
    this.envValue = options.env;
    this.ids = new StableIdGenerator(options.idSeed);
    this.factory = exprFactory();
    this.sourceInfoValue = options.sourceInfo;
  }

  /** env returns the environment currently associated with the optimizer context. */
  public env(): Env {
    return this.envValue;
  }

  /** extendEnv augments the context environment with additional option-object configuration. */
  public extendEnv(options: EnvOptions = {}): void {
    this.envValue = this.envValue.extend(options);
  }

  /**
   * ast creates an AST from an expression using source info managed by this context.
   */
  public ast(expr: Expr): AST {
    return astValue(expr, this.sourceInfoValue);
  }

  /**
   * copyAst creates a renumbered copy of an input AST's expression and source info.
   *
   * Use this method before merging an expression from one AST into another.
   */
  public copyAst(input: AST): { expr: Expr; sourceInfo: SourceInfo } {
    const copyIds = new StableIdGenerator(this.ids.nextId());
    const copyExpr = this.factory.copyExpr(input.expr());
    const copyInfo = copySourceInfo(input.sourceInfo()) ?? sourceInfo();
    normalizeIds(copyIds, copyExpr, copyInfo);
    // Reserve every id allocated while copying so subsequent generated nodes cannot collide.
    this.ids.advanceTo(copyIds.currentSeed());
    return { expr: copyExpr, sourceInfo: copyInfo };
  }

  /**
   * copyAstAndMetadata copies an AST and propagates its macro and offset metadata.
   */
  public copyAstAndMetadata(input: AST): Expr {
    const copied = this.copyAst(input);
    for (const [macroId, call] of copied.sourceInfo.macroCalls()) {
      this.setMacroCall({ id: macroId, expr: call });
    }
    for (const [id, range] of copied.sourceInfo.offsetRanges()) {
      this.sourceInfoValue.setOffsetRange(id, range);
    }
    return copied.expr;
  }

  /** clearMacroCall clears the macro at the given expression id. */
  public clearMacroCall(id: number): void {
    this.sourceInfoValue.clearMacroCall(id);
  }

  /** setMacroCall sets macro call metadata for the given expression id. */
  public setMacroCall(options: SetMacroCallOptions): void {
    this.sourceInfoValue.setMacroCall(options.id, options.expr);
  }

  /** macroCalls returns the macro calls currently tracked by the context. */
  public macroCalls(): Map<number, Expr> {
    return this.sourceInfoValue.macroCalls();
  }

  /**
   * bindMacro creates an expanded `cel.bind` expression and its unexpanded macro signature.
   */
  public bindMacro(options: BindMacroOptions): MacroExpressionPair {
    const variableId = this.ids.nextId();
    const remainingId = this.ids.nextId();
    const remaining = this.factory.copyExpr(options.remainingExpression);
    remaining.renumberIds((id) => (id === options.macroId ? remainingId : id));
    const [nestedMacro, found] = this.sourceInfoValue.getMacroCall(options.macroId);
    if (found && nestedMacro) {
      this.setMacroCall({ id: remainingId, expr: this.factory.copyExpr(nestedMacro) });
    }

    const astExpr = this.factory.comprehension(
      options.macroId,
      this.factory.list(this.ids.nextId(), [], []),
      "#unused",
      options.variableName,
      this.factory.copyExpr(options.variableInitializer),
      this.factory.literal(this.ids.nextId(), False.value() as boolean),
      this.factory.ident(variableId, options.variableName),
      remaining,
    );
    const macroExpr = this.factory.memberCall(
      0,
      "bind",
      this.factory.ident(this.ids.nextId(), "cel"),
      this.factory.ident(variableId, options.variableName),
      this.factory.copyExpr(options.variableInitializer),
      this.factory.copyExpr(remaining),
    );
    this.sanitizeMacro(options.macroId, macroExpr);
    return { astExpr, macroExpr };
  }

  /** call creates a global function call invocation expression. */
  public call(options: CallOptions): Expr {
    return this.factory.call(this.ids.nextId(), options.functionName, ...(options.arguments ?? []));
  }

  /** memberCall creates a receiver-style function call invocation expression. */
  public memberCall(options: MemberCallOptions): Expr {
    return this.factory.memberCall(
      this.ids.nextId(),
      options.functionName,
      options.target,
      ...(options.arguments ?? []),
    );
  }

  /** ident creates an identifier expression. */
  public ident(name: string): Expr {
    return this.factory.ident(this.ids.nextId(), name);
  }

  /** literal creates a CEL literal expression. */
  public literal(value: ConstantValue): Expr {
    return this.factory.literal(this.ids.nextId(), value);
  }

  /** list creates a list expression with optional element indices. */
  public list(options: ListOptions): Expr {
    return this.factory.list(this.ids.nextId(), options.elements, options.optionalIndices ?? []);
  }

  /** map creates a map from entry expressions. */
  public map(entries: EntryExpr[]): Expr {
    return this.factory.map(this.ids.nextId(), entries);
  }

  /** mapEntry creates a map entry expression. */
  public mapEntry(options: MapEntryOptions): EntryExpr {
    return this.factory.mapEntry(
      this.ids.nextId(),
      options.key,
      options.value,
      options.optional ?? false,
    );
  }

  /**
   * hasMacro creates a test-only select and an unexpanded `has` macro signature.
   */
  public hasMacro(options: HasMacroOptions): MacroExpressionPair {
    const select = options.selection.asSelect();
    if (!select) {
      throw new Error("has macro requires a select expression");
    }
    const astExpr = this.factory.presenceTest(
      options.macroId,
      select.operand(),
      select.fieldName(),
    );
    const macroExpr = this.factory.call(
      0,
      "has",
      this.select({
        operand: this.factory.copyExpr(select.operand()),
        field: select.fieldName(),
      }),
    );
    this.sanitizeMacro(options.macroId, macroExpr);
    return { astExpr, macroExpr };
  }

  /** select creates a field selection expression. */
  public select(options: SelectOptions): Expr {
    return this.factory.select(this.ids.nextId(), options.operand, options.field);
  }

  /** struct creates a typed struct expression. */
  public struct(options: StructOptions): Expr {
    return this.factory.struct(this.ids.nextId(), options.typeName, options.fields);
  }

  /** structField creates a struct field initializer. */
  public structField(options: StructFieldOptions): EntryExpr {
    return this.factory.structField(
      this.ids.nextId(),
      options.field,
      options.value,
      options.optional ?? false,
    );
  }

  /**
   * updateExpr updates a target expression while preserving macro metadata.
   *
   * The update handles every combination of macro and non-macro target and replacement nodes.
   */
  public updateExpr(options: UpdateExprOptions): void {
    const targetId = options.target.id();
    const updatedId = options.updated.id();
    const [, targetIsMacro] = this.sourceInfoValue.getMacroCall(targetId);
    const [updatedMacro, updatedIsMacro] = this.sourceInfoValue.getMacroCall(updatedId);

    // The local expression mutation seam replaces the complete protobuf node, so map the
    // replacement root back to the target id before installing its kind and children.
    const replacement = this.factory.copyExpr(options.updated);
    replacement.renumberIds((id) => (id === updatedId ? targetId : id));
    options.target.setKindCase(replacement);

    if (this.sourceInfoValue.macroCalls().size === 0) {
      return;
    }
    if (updatedIsMacro && updatedMacro) {
      this.sourceInfoValue.clearMacroCall(updatedId);
      this.sourceInfoValue.setMacroCall(targetId, updatedMacro);
    } else if (targetIsMacro) {
      this.sourceInfoValue.clearMacroCall(targetId);
    }

    // Punch holes in copied expression bodies where macro references already exist.
    const macroExpression = this.factory.copyExpr(options.target);
    postOrderVisit(macroExpression, (expr) => {
      const [, exists] = this.sourceInfoValue.getMacroCall(expr.id());
      if (exists) {
        expr.setKindCase();
      }
    });

    for (const call of this.sourceInfoValue.macroCalls().values()) {
      postOrderVisit(call, (expr) => {
        if (expr.id() === targetId) {
          expr.setKindCase(this.factory.copyExpr(macroExpression));
        }
        if (expr.id() !== updatedId) {
          return;
        }
        expr.setKindCase(updatedIsMacro ? undefined : this.factory.copyExpr(macroExpression));
        expr.renumberIds((id) => (id === updatedId ? targetId : id));
      });
    }
  }

  /** sanitizeMacro replaces nested macro bodies with reference holes in an unexpanded call. */
  private sanitizeMacro(macroId: number, macroExpr: Expr): void {
    postOrderVisit(macroExpr, (expr) => {
      const [, exists] = this.sourceInfoValue.getMacroCall(expr.id());
      if (exists && expr.id() !== macroId) {
        expr.setKindCase();
      }
    });
  }
}

/**
 * StaticOptimizer contains a sequence of AST optimizers which are applied in order.
 *
 * Expression ids and macro metadata are normalized between passes, and type-checking runs after
 * every pass so the final output is valid and consistent with a parsed and checked expression.
 *
 * Source position information is best-effort and incomplete, but optimized expressions are
 * suitable for calls to `astToString`.
 */
export class StaticOptimizer {
  /** optimizersValue stores the ordered optimization passes. */
  private readonly optimizersValue: ASTOptimizer[];

  /** sourceOverride replaces input source metadata when configured. */
  private readonly sourceOverride?: Source;

  /** constructor configures the optimizer from a plain option object. */
  constructor(options: StaticOptimizerOptions = {}) {
    this.optimizersValue = [...(options.optimizers ?? [])];
    this.sourceOverride = options.source;
  }

  /**
   * optimize applies the configured optimization passes to a checked AST.
   *
   * Optimization and recheck failures are reported as thrown errors, matching the other high-level
   * TypeScript environment methods.
   */
  public optimize(env: Env, input?: AST): AST {
    if (!input) {
      throw new Error("unexpected unspecified type");
    }
    const copiedExpression = exprFactory().copyExpr(input.expr());
    const copiedInfo = copySourceInfo(input.sourceInfo()) ?? sourceInfo();
    let optimized = new AST(
      copiedExpression,
      copiedInfo,
      input.typeMap(),
      input.referenceMap(),
      input.source(),
    );
    const source = this.sourceOverride ?? input.source();
    if (this.sourceOverride) {
      optimized = new AST(
        copiedExpression,
        sourceInfo(this.sourceOverride),
        input.typeMap(),
        input.referenceMap(),
        this.sourceOverride,
      );
    }

    const greatestInputId = Math.max(0, ...input.ids());
    const context = new OptimizerContext({
      env,
      idSeed: greatestInputId,
      sourceInfo: optimized.sourceInfo(),
    });

    for (const optimizer of this.optimizersValue) {
      optimized = optimizer.optimize(context, optimized);
      const passDuplicates = duplicateExpressionIds(optimized.expr());
      if (passDuplicates.length > 0) {
        throw new Error(
          `optimizer pass produced duplicate expression ids: ${passDuplicates.join(", ")}`,
        );
      }

      // Normalize ids and macro metadata between passes before type-checking the rewritten AST.
      const normalizedIds = new StableIdGenerator(0);
      normalizeIds(normalizedIds, optimized.expr(), optimized.sourceInfo());
      cleanupMacroRefs(optimized.expr(), optimized.sourceInfo());
      const duplicates = duplicateExpressionIds(optimized.expr());
      if (duplicates.length > 0) {
        throw new Error(`optimizer produced duplicate expression ids: ${duplicates.join(", ")}`);
      }
      optimized = context.env().check(astValue(optimized.expr(), optimized.sourceInfo()), source);
    }
    return optimized;
  }
}

/**
 * staticOptimizer creates an optimizer from an option object.
 */
export function staticOptimizer(options: StaticOptimizerOptions = {}): StaticOptimizer {
  return new StaticOptimizer(options);
}

/**
 * normalizeIds resets expression and source metadata ids in a stable order.
 */
function normalizeIds(ids: StableIdGenerator, expression: Expr, info: SourceInfo): void {
  expression.renumberIds((id) => ids.stableId(id));

  const offsets = [...info.offsetRanges()];
  for (const [id] of offsets) {
    info.clearOffsetRange(id);
  }
  for (const [id, range] of offsets) {
    info.setOffsetRange(ids.stableId(id), range);
  }
  if (info.macroCalls().size === 0) {
    return;
  }

  // Sort macro ids so macro-specific variables are stable across normalization calls.
  const macros = [...info.macroCalls()].sort(([left], [right]) => left - right);
  const callIds = new Map(macros.map(([id]) => [id, ids.stableId(id)]));
  for (const [id] of macros) {
    info.clearMacroCall(id);
  }
  for (const [oldId, call] of macros) {
    call.renumberIds((id) => ids.stableId(id));
    info.setMacroCall(callIds.get(oldId) ?? 0, call);
  }
}

/**
 * duplicateExpressionIds reports ids assigned to more than one node in an expression tree.
 */
function duplicateExpressionIds(expression: Expr): number[] {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  postOrderVisit(expression, (expr) => {
    if (seen.has(expr.id())) {
      duplicates.add(expr.id());
    }
    seen.add(expr.id());
  });
  return [...duplicates].sort((left, right) => left - right);
}

/**
 * cleanupMacroRefs removes macro metadata no longer referenced by the optimized expression.
 */
function cleanupMacroRefs(expression: Expr, info: SourceInfo): void {
  if (info.macroCalls().size === 0) {
    return;
  }
  const referencedIds = new Set<number>();
  postOrderVisit(expression, (expr) => {
    if (expr.id() !== 0) {
      referencedIds.add(expr.id());
    }
  });
  for (const call of info.macroCalls().values()) {
    postOrderVisit(call, (expr) => {
      if (expr.id() !== 0) {
        referencedIds.add(expr.id());
      }
    });
  }
  for (const id of info.macroCalls().keys()) {
    if (!referencedIds.has(id)) {
      info.clearMacroCall(id);
    }
  }
}
