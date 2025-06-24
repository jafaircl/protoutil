/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { AST, copyAST, copyExpr, copySourceInfo, maxID, SourceInfo } from '../common/ast/ast.js';
import { IDGenerator, renumberIDs, setExprKindCase } from '../common/ast/expr.js';
import { newExprVisitor, postOrderVisit } from '../common/ast/navigable.js';
import { Errors } from '../common/errors.js';
import {
  TYPE_CONVERT_DURATION_OVERLOAD,
  TYPE_CONVERT_TIMESTAMP_OVERLOAD,
} from '../common/overloads.js';
import {
  newBoolProtoExpr,
  newComprehensionProtoExpr,
  newConstantProtoExpr,
  newGlobalCallProtoExpr,
  newIdentProtoExpr,
  newListProtoExpr,
  newMapEntryProtoExpr,
  newMapProtoExpr,
  newMessageFieldProtoExpr,
  newMessageProtoExpr,
  newReceiverCallProtoExpr,
  newSelectProtoExpr,
  newStringProtoExpr,
  newTestOnlySelectProtoExpr,
  unwrapSelectProtoExpr,
} from '../common/pb/expressions.js';
import { BoolRefVal } from '../common/types/bool.js';
import { BytesRefVal } from '../common/types/bytes.js';
import { DoubleRefVal } from '../common/types/double.js';
import { DurationRefVal } from '../common/types/duration.js';
import { IntRefVal } from '../common/types/int.js';
import { reflectNativeType } from '../common/types/native.js';
import { NullRefVal } from '../common/types/null.js';
import { OptionalRefVal } from '../common/types/optional.js';
import { StringRefVal } from '../common/types/string.js';
import { TimestampRefVal } from '../common/types/timestamp.js';
import { UintRefVal } from '../common/types/uint.js';
import { isNil } from '../common/utils.js';
import { Expr, Expr_CreateStruct_Entry } from '../protogen-exports/index.js';
import { RefVal, refValToProtoConstant } from './cel.js';
import { StringType } from './decls.js';
import { Ast, Env, Issues } from './env.js';
import { EnvOption } from './options.js';

/**
 * StaticOptimizer contains a sequence of ASTOptimizer instances which will be applied in order.
 *
 * The static optimizer normalizes expression ids and type-checking run between optimization
 * passes to ensure that the final optimized output is a valid expression with metadata consistent
 * with what would have been generated from a parsed and checked expression.
 *
 * Note: source position information is best-effort and likely wrong, but optimized expressions
 * should be suitable for calls to parser.Unparse.
 */
export class StaticOptimizer {
  optimizers: ASTOptimizer[];

  constructor(...optimizers: ASTOptimizer[]) {
    this.optimizers = optimizers;
  }

  /**
   * Optimize applies a sequence of optimizations to an Ast within a given environment.
   *
   * If issues are encountered, the Issues.Err() return value will be non-nil.
   */
  optimize(env: Env, a: Ast): Ast | Issues {
    // Make a copy of the AST to be optimized.
    let optimized = copyAST(a.nativeRep());
    const ids = new idGenerator(maxID(a.nativeRep()));

    // Create the optimizer context, could be pooled in the future.
    const issues = new Issues(new Errors(a.source()));
    const exprFac = new optimizerExprFactory(ids, optimized.sourceInfo());
    const ctx = new OptimizerContext(env, issues, exprFac);

    // Apply the optimizations sequentially.
    for (const o of this.optimizers) {
      optimized = o.optimize(ctx, optimized);
      if (!isNil(issues.err())) {
        return issues;
      }
      // Normalize expression id metadata including coordination with macro call metadata.
      const freshIDGen = new idGenerator(0n);
      const info = optimized.sourceInfo();
      const expr = optimized.expr();
      normalizeIDs(freshIDGen.renumberStable.bind(freshIDGen), expr, info);
      cleanupMacroRefs(expr, info);

      // Recheck the updated expression for any possible type-agreement or validation errors.
      const parsed = new Ast(a.source(), new AST(expr, info));
      const checked = ctx.env.check(parsed);
      if (checked instanceof Issues) {
        return checked;
      }
      optimized = checked.nativeRep();
    }

    // Return the optimized result.
    return new Ast(a.source(), optimized);
  }
}

/**
 * normalizeIDs ensures that the metadata present with an AST is reset in a manner such
 * that the ids within the expression correspond to the ids within macros.
 */
function normalizeIDs(idGen: IDGenerator, optimized: Expr, info: SourceInfo) {
  renumberIDs(optimized, idGen);
  if (info.macroCalls().size === 0) {
    return;
  }

  // Sort the macro ids to make sure that the renumbering of macro-specific variables
  // is stable across normalization calls.
  const sortedMacroIDs: bigint[] = [];
  for (const [id] of info.macroCalls()) {
    sortedMacroIDs.push(id);
  }
  sortedMacroIDs.sort((a, b) => Number(a - b));

  // First, update the macro call ids themselves.
  const callIDMap = new Map<bigint, bigint>();
  for (const id of sortedMacroIDs) {
    callIDMap.set(id, idGen(id));
  }
  // Then update the macro call definitions which refer to these ids, but
  // ensure that the updates don't collide and remove macro entries which haven't
  // been visited / updated yet.
  interface macroUpdate {
    id: bigint;
    call: Expr;
  }
  const macroUpdates: macroUpdate[] = [];
  for (const oldID of sortedMacroIDs) {
    const newID = callIDMap.get(oldID)!;
    const call = info.getMacroCall(oldID);
    if (isNil(call)) {
      continue;
    }
    renumberIDs(call, idGen);
    macroUpdates.push({ id: newID, call });
    info.clearMacroCall(oldID);
  }
  for (const u of macroUpdates) {
    info.setMacroCall(u.id, u.call);
  }
}

function cleanupMacroRefs(expr: Expr, info: SourceInfo) {
  if (info.macroCalls().size === 0) {
    return;
  }

  // Sanitize the macro call references once the optimized expression has been computed
  // and the ids normalized between the expression and the macros.
  const exprRefMap = new Set<bigint>();
  postOrderVisit(
    expr,
    newExprVisitor((e) => {
      if (e.id === 0n) {
        return;
      }
      exprRefMap.add(e.id);
    })
  );
  // Update the macro call id references to ensure that macro pointers are
  // updated consistently across macros.
  for (const [, call] of info.macroCalls()) {
    postOrderVisit(
      call,
      newExprVisitor((e) => {
        if (e.id === 0n) {
          return;
        }
        exprRefMap.add(e.id);
      })
    );
  }
  for (const [id] of info.macroCalls()) {
    if (!exprRefMap.has(id)) {
      info.clearMacroCall(id);
    }
  }
}

/**
 * IDGenerator ensures that new ids are only created the first time they are encountered.
 */
class idGenerator {
  idMap = new Map<bigint, bigint>();

  constructor(public seed: bigint) {}

  nextID() {
    this.seed += 1n;
    return this.seed;
  }

  renumberStable(id: bigint): bigint {
    if (id === 0n) {
      return 0n;
    }
    if (this.idMap.has(id)) {
      return this.idMap.get(id)!;
    }
    const nextID = this.nextID();
    this.idMap.set(id, nextID);
    return nextID;
  }
}

/**
 * OptimizerContext embeds Env and Issues instances to make it easy to type-check and evaluate
 * subexpressions and report any errors encountered along the way. The context also embeds the
 * optimizerExprFactory which can be used to generate new sub-expressions with expression ids
 * consistent with the expectations of a parsed expression.
 */
export class OptimizerContext {
  constructor(
    public env: Env,
    public issues: Issues,
    public optimizerExprFactory: optimizerExprFactory
  ) {}

  /**
   * ExtendEnv auguments the context's environment with the additional options.
   */
  extendEnv(...opts: EnvOption[]): void {
    const e = this.env.extend(...opts);
    this.env = e;
  }
}

/**
 * ASTOptimizer applies an optimization over an AST and returns the optimized result.
 */
export interface ASTOptimizer {
  /**
   * Optimize optimizes a type-checked AST within an Environment and accumulates any issues.
   */
  optimize(ctx: OptimizerContext, ast: AST): AST;
}

class optimizerExprFactory {
  constructor(public idGen: idGenerator, public sourceInfo: SourceInfo) {}

  /**
   * NewAST creates an AST from the current expression using the tracked source info which
   * is modified and managed by the OptimizerContext.
   */
  newAST(expr: Expr): AST {
    return new AST(expr, this.sourceInfo);
  }

  /**
   * CopyAST creates a renumbered copy of `Expr` and `SourceInfo` values of the input AST, where the
   * renumbering uses the same scheme as the core optimizer logic ensuring there are no collisions
   * between copies.
   *
   * Use this method before attempting to merge the expression from AST into another.
   */
  copyAST(a: AST): [Expr, SourceInfo] {
    const idGen = new idGenerator(this.idGen.nextID());
    const copiedExpr = copyExpr(a.expr());
    const copiedInfo = copySourceInfo(a.sourceInfo());
    normalizeIDs(idGen.renumberStable.bind(idGen), copiedExpr, copiedInfo);
    this.idGen.seed = idGen.nextID();
    return [copiedExpr, copiedInfo];
  }

  /**
   * CopyASTAndMetadata copies the input AST and propagates the macro metadata into the AST being
   * optimized.
   */
  copyASTAndMetadata(a: AST): Expr {
    const [copyExpr, copyInfo] = this.copyAST(a);
    for (const [macroID, call] of copyInfo.macroCalls()) {
      this.setMacroCall(macroID, call);
    }
    return copyExpr;
  }

  /**
   * ClearMacroCall clears the macro at the given expression id.
   */
  clearMacroCall(id: bigint) {
    this.sourceInfo.clearMacroCall(id);
  }

  /**
   * SetMacroCall sets the macro call metadata for the given macro id within the tracked source info
   * metadata.
   */
  setMacroCall(id: bigint, expr: Expr) {
    this.sourceInfo.setMacroCall(id, expr);
  }

  /**
   * MacroCalls returns the map of macro calls currently in the context.
   */
  macroCalls() {
    return this.sourceInfo.macroCalls();
  }

  /**
   * NewBindMacro creates an AST expression representing the expanded bind() macro, and a macro expression
   * representing the unexpanded call signature to be inserted into the source info macro call metadata.
   */
  newBindMacro(macroID: bigint, varName: string, varInit: Expr, remaining: Expr): [Expr, Expr] {
    const varID = this.idGen.nextID();
    const remainingID = this.idGen.nextID();
    remaining = copyExpr(remaining);
    renumberIDs(remaining, (id) => {
      if (id === macroID) {
        return remainingID;
      }
      return id;
    });
    const call = this.sourceInfo.getMacroCall(macroID);
    if (!isNil(call)) {
      this.setMacroCall(remainingID, copyExpr(call));
    }

    const astExpr = newComprehensionProtoExpr(macroID, {
      iterRange: newListProtoExpr(this.idGen.nextID(), [], []),
      iterVar: '#unused',
      accuVar: varName,
      accuInit: copyExpr(varInit),
      loopCondition: newBoolProtoExpr(this.idGen.nextID(), false),
      loopStep: newIdentProtoExpr(varID, varName),
      result: remaining,
    });
    const macroExpr = newReceiverCallProtoExpr(
      0n,
      'bind',
      newIdentProtoExpr(this.idGen.nextID(), 'cel'),
      [newIdentProtoExpr(varID, varName), copyExpr(varInit), copyExpr(remaining)]
    );
    this.sanitizeMacro(macroID, macroExpr);
    return [astExpr, macroExpr];
  }

  /**
   * NewCall creates a global function call invocation expression.
   *
   * Example:
   *
   * countByField(list, fieldName)
   * - function: countByField
   * - args: [list, fieldName]
   */
  newCall(fn: string, args: Expr[]): Expr {
    return newGlobalCallProtoExpr(this.idGen.nextID(), fn, args);
  }

  /**
   * NewMemberCall creates a member function call invocation expression where 'target' is the receiver of the call.
   *
   * Example:
   *
   * list.countByField(fieldName)
   * - function: countByField
   * - target: list
   * - args: [fieldName]
   */
  newMemberCall(fn: string, target: Expr, args: Expr[]): Expr {
    return newReceiverCallProtoExpr(this.idGen.nextID(), fn, target, args);
  }

  /**
   * NewIdent creates a new identifier expression.
   *
   * Examples:
   *
   * - simple_var_name
   * - qualified.subpackage.var_name
   */
  newIdent(name: string): Expr {
    return newIdentProtoExpr(this.idGen.nextID(), name);
  }

  /**
   * NewLiteral creates a new literal expression value.
   *
   * The range of valid values for a literal generated during optimization is different than for expressions
   * generated via parsing / type-checking, as the ref.Val may be _any_ CEL value so long as the value can
   * be converted back to a literal-like form.
   */
  newLiteral(val: RefVal): Expr {
    const type = reflectNativeType(val);
    switch (type) {
      case BoolRefVal:
      case BytesRefVal:
      case DoubleRefVal:
      case IntRefVal:
      case NullRefVal:
      case StringRefVal:
      case UintRefVal:
      case OptionalRefVal:
        return newConstantProtoExpr(this.idGen.nextID(), refValToProtoConstant(val));
      case DurationRefVal:
        const durationString = val.convertToType(StringType);
        return newGlobalCallProtoExpr(this.idGen.nextID(), TYPE_CONVERT_DURATION_OVERLOAD, [
          newStringProtoExpr(this.idGen.nextID(), durationString.value()),
        ]);
      case TimestampRefVal:
        const timestampString = val.convertToType(StringType);
        return newGlobalCallProtoExpr(this.idGen.nextID(), TYPE_CONVERT_TIMESTAMP_OVERLOAD, [
          newStringProtoExpr(this.idGen.nextID(), timestampString.value()),
        ]);
      default:
        throw new Error('Unsupported literal type: ' + val.type().typeName());
    }
  }

  /**
   * NewList creates a list expression with a set of optional indices.
   *
   * Examples:
   *
   * [a, b]
   * - elems: [a, b]
   * - optIndices: []
   *
   * [a, ?b, ?c]
   * - elems: [a, b, c]
   * - optIndices: [1, 2]
   */
  newList(elems: Expr[], optIndices: number[] = []): Expr {
    return newListProtoExpr(this.idGen.nextID(), elems, optIndices);
  }

  /**
   * NewMap creates a map from a set of entry expressions which contain a key and value expression.
   */
  newMap(entries: Expr_CreateStruct_Entry[]): Expr {
    return newMapProtoExpr(this.idGen.nextID(), entries);
  }

  /**
   * NewMapEntry creates a map entry with a key and value expression and a flag to indicate whether the
   * entry is optional.
   *
   * Examples:
   *
   * {a: b}
   * - key: a
   * - value: b
   * - optional: false
   *
   * {?a: ?b}
   * - key: a
   * - value: b
   * - optional: true
   */
  newMapEntry(key: Expr, value: Expr, isOptional?: boolean): Expr_CreateStruct_Entry {
    return newMapEntryProtoExpr(this.idGen.nextID(), key, value, isOptional);
  }

  /**
   * NewHasMacro generates a test-only select expression to be included within an AST and an unexpanded
   * has() macro call signature to be inserted into the source info macro call metadata.
   */
  newHasMacro(macroID: bigint, s: Expr): [Expr, Expr] {
    const sel = unwrapSelectProtoExpr(s);
    if (!sel) {
      throw new Error(`Expected select expression, got: ${s}`);
    }
    if (!sel.operand) {
      throw new Error(`Expected select expression with operand, got: ${s}`);
    }
    const astExpr = newTestOnlySelectProtoExpr(macroID, sel.operand, sel.field);
    const macroExpr = newGlobalCallProtoExpr(0n, 'has', [
      this.newSelect(copyExpr(sel.operand), sel.field),
    ]);
    this.sanitizeMacro(macroID, macroExpr);
    return [astExpr, macroExpr];
  }

  /**
   * NewSelect creates a select expression where a field value is selected from an operand.
   *
   * Example:
   *
   * msg.field_name
   * - operand: msg
   * - field: field_name
   */
  newSelect(operand: Expr, field: string): Expr {
    return newSelectProtoExpr(this.idGen.nextID(), operand, field);
  }

  /**
   * NewStruct creates a new typed struct value with an set of field initializations.
   *
   * Example:
   *
   * pkg.TypeName{field: value}
   * - typeName: pkg.TypeName
   * - fields: [{field: value}]
   */
  newStruct(typeName: string, fields: Expr_CreateStruct_Entry[]): Expr {
    return newMessageProtoExpr(this.idGen.nextID(), typeName, fields);
  }

  /**
   * NewStructField creates a struct field initialization.
   *
   * Examples:
   *
   * {count: 3u}
   * - field: count
   * - value: 3u
   * - optional: false
   *
   * {?count: x}
   * - field: count
   * - value: x
   * - optional: true
   */
  newStructField(field: string, value: Expr, isOptional?: boolean): Expr_CreateStruct_Entry {
    return newMessageFieldProtoExpr(this.idGen.nextID(), field, value, isOptional);
  }

  /**
   * UpdateExpr updates the target expression with the updated content while preserving macro metadata.
   *
   * There are four scenarios during the update to consider:
   * 1. target is not macro, updated is not macro
   * 2. target is macro, updated is not macro
   * 3. target is macro, updated is macro
   * 4. target is not macro, updated is macro
   *
   * When the target is a macro already, it may either be updated to a new macro function
   * body if the update is also a macro, or it may be removed altogether if the update is
   * a macro.
   *
   * When the update is a macro, then the target references within other macros must be
   * updated to point to the new updated macro. Otherwise, other macros which pointed to
   * the target body must be replaced with copies of the updated expression body.
   */
  updateExpr(target: Expr, updated: Expr) {
    // Update the expression
    setExprKindCase(target, updated);

    // Early return if there's no macros present sa the source info reflects the
    // macro set from the target and updated expressions.
    if (this.sourceInfo.macroCalls().size === 0) {
      return;
    }
    // Determine whether the target expression was a macro.
    const targetIsMacro = !isNil(this.sourceInfo.getMacroCall(target.id));

    // Determine whether the updated expression was a macro.
    const updatedMacro = this.sourceInfo.getMacroCall(updated.id);
    const updatedIsMacro = !isNil(updatedMacro);

    if (updatedIsMacro) {
      // If the updated call was a macro, then updated id maps to target id,
      // and the updated macro moves into the target id slot.
      this.sourceInfo.clearMacroCall(updated.id);
      this.sourceInfo.setMacroCall(target.id, updatedMacro);
    } else if (targetIsMacro) {
      // Otherwise if the target expr was a macro, but is no longer, clear
      // the macro reference.
      this.sourceInfo.clearMacroCall(target.id);
    }

    // Punch holes in the updated value where macros references exist.
    const macroExpr = copyExpr(target);
    const macroRefVisitor = newExprVisitor((e) => {
      const call = this.sourceInfo.getMacroCall(e.id);
      if (!isNil(call)) {
        setExprKindCase(e, undefined);
      }
    });
    postOrderVisit(macroExpr, macroRefVisitor);

    // Update any references to the expression within a macro
    const macroVisitor = newExprVisitor((call) => {
      // Update the target expression to point to the macro expression which
      // will be empty if the updated expression was a macro.
      if (call.id === target.id) {
        setExprKindCase(call, copyExpr(macroExpr));
      }
      // Update the macro call expression if it refers to the updated expression
      // id which has since been remapped to the target id.
      if (call.id === updated.id) {
        // Either ensure the expression is a macro reference or a populated with
        // the relevant sub-expression if the updated expr was not a macro.
        if (updatedIsMacro) {
          setExprKindCase(call, undefined);
        } else {
          setExprKindCase(call, copyExpr(macroExpr));
        }
        // Since SetKindCase does not renumber the id, ensure the references to
        // the old 'updated' id are mapped to the target id.
        renumberIDs(call, (id) => {
          if (id === updated.id) {
            return target.id;
          }
          return id;
        });
      }
    });
    for (const [, call] of this.sourceInfo.macroCalls()) {
      postOrderVisit(call, macroVisitor);
    }
  }

  sanitizeMacro(macroID: bigint, macroExpr: Expr) {
    const macroRefVisitor = newExprVisitor((e) => {
      const call = this.sourceInfo.getMacroCall(e.id);
      if (!isNil(call) && e.id !== macroID) {
        setExprKindCase(e, undefined);
      }
    });
    postOrderVisit(macroExpr, macroRefVisitor);
  }
}
