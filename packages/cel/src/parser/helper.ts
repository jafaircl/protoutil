import {
  type ConstantValue,
  type EntryExpr,
  type Expr,
  type ExprFactory,
  ExprKind,
  exprFactoryWithAccumulator,
  type OffsetRange,
  type SourceInfo,
  sourceInfo,
} from "../common/ast/index.js";
import { type Location, SourceLocation } from "../common/location.js";
import type { Source } from "../common/source.js";

/**
 * ParserHelper owns parser-side id allocation and AST/source-info construction.
 */
export class ParserHelper {
  public readonly exprFactory: ExprFactory;
  public readonly sourceInfo: SourceInfo;
  private readonly baseOffset: number;
  private nextValueId = 1;

  /**
   * constructor binds the helper to a source and accumulator identifier.
   */
  constructor(
    private readonly source: Source,
    accumulatorName: string,
  ) {
    this.exprFactory = exprFactoryWithAccumulator(accumulatorName);
    this.sourceInfo = sourceInfo(source);
    const [location, found] = source.offsetLocation(0);
    const [offset, hasOffset] = found ? source.locationOffset(location) : [-1, false];
    this.baseOffset = hasOffset ? offset : 0;
  }

  /**
   * nextId allocates a fresh expression id and optionally records its source range.
   */
  public nextId(range?: OffsetRange): number {
    const id = this.nextValueId++;
    if (range) {
      this.sourceInfo.setOffsetRange(id, this.shiftRange(range));
    }
    return id;
  }

  /**
   * id allocates a fresh expression id for a known source range.
   */
  public id(range: OffsetRange): number {
    return this.nextId(range);
  }

  /**
   * exactId allocates a fresh expression id for an already-shifted stored source range.
   */
  public exactId(range: OffsetRange): number {
    const id = this.nextValueId++;
    this.sourceInfo.setOffsetRange(id, range);
    return id;
  }

  /**
   * assignIdRange updates an existing expression id to use the provided source range.
   */
  public assignIdRange(id: number, range: OffsetRange): void {
    this.sourceInfo.setOffsetRange(id, this.shiftRange(range));
  }

  /**
   * deleteId removes a stored source range and rewinds the counter when the id was most recent.
   */
  public deleteId(id: number): void {
    this.sourceInfo.clearOffsetRange(id);
    if (id === this.nextValueId - 1) {
      this.nextValueId -= 1;
    }
  }

  /**
   * locationForRange maps a source offset range to a human-readable source location.
   */
  public locationForRange(range: OffsetRange): Location {
    const [location, found] = this.source.offsetLocation(range.start - this.baseOffset);
    return found ? location : new SourceLocation(-1, -1);
  }

  /**
   * locationForId maps an expression id to its starting location when available.
   */
  public locationForId(id: number): Location {
    return this.sourceInfo.getStartLocation(id);
  }

  /**
   * locationForIdEnd maps an expression id to the end of its stored source range when available.
   */
  public locationForIdEnd(id: number): Location {
    const [range, found] = this.sourceInfo.getOffsetRange(id);
    if (!found || !range) {
      return new SourceLocation(-1, -1);
    }
    const [location, hasLocation] = this.source.offsetLocation(range.stop - this.baseOffset);
    return hasLocation ? location : new SourceLocation(-1, -1);
  }

  /**
   * locationForIdStopChar maps an expression id to the last character covered by its source range.
   */
  public locationForIdStopChar(id: number): Location {
    const [range, found] = this.sourceInfo.getOffsetRange(id);
    if (!found || !range) {
      return new SourceLocation(-1, -1);
    }
    const stop = Math.max(range.start, range.stop - 1);
    const [location, hasLocation] = this.source.offsetLocation(stop - this.baseOffset);
    return hasLocation ? location : new SourceLocation(-1, -1);
  }

  /**
   * rangeForId returns the stored source range for an expression id when one exists.
   */
  public rangeForId(id: number): OffsetRange | undefined {
    const [range, found] = this.sourceInfo.getOffsetRange(id);
    return found ? range : undefined;
  }

  /**
   * shiftRange translates local token offsets into source-info offsets for embedded sources.
   */
  private shiftRange(range: OffsetRange): OffsetRange {
    return {
      start: range.start + this.baseOffset,
      stop: range.stop + this.baseOffset,
    };
  }

  /**
   * literalExpr creates a literal expression.
   */
  public literalExpr(range: OffsetRange, value: ConstantValue): Expr {
    return this.exprFactory.literal(this.nextId(range), value);
  }

  /**
   * identExpr creates an identifier expression.
   */
  public identExpr(range: OffsetRange, name: string): Expr {
    return this.exprFactory.ident(this.nextId(range), name);
  }

  /**
   * selectExpr creates a field-selection expression.
   */
  public selectExpr(range: OffsetRange, operand: Expr, field: string): Expr {
    return this.exprFactory.select(this.nextId(range), operand, field);
  }

  /**
   * presenceTestExpr creates a test-only select used by `has()` macro expansion.
   */
  public presenceTestExpr(range: OffsetRange, operand: Expr, field: string): Expr {
    return this.exprFactory.presenceTest(this.nextId(range), operand, field);
  }

  /**
   * globalCallExpr creates a global call expression.
   */
  public globalCallExpr(range: OffsetRange, fn: string, ...args: Expr[]): Expr {
    return this.exprFactory.call(this.nextId(range), fn, ...args);
  }

  /**
   * receiverCallExpr creates a receiver-style call expression.
   */
  public receiverCallExpr(range: OffsetRange, fn: string, target: Expr, ...args: Expr[]): Expr {
    return this.exprFactory.memberCall(this.nextId(range), fn, target, ...args);
  }

  /**
   * listExpr creates a list literal expression.
   */
  public listExpr(range: OffsetRange, elements: Expr[], optionalIndices: number[] = []): Expr {
    return this.exprFactory.list(this.nextId(range), elements, optionalIndices);
  }

  /**
   * mapExpr creates a map literal expression.
   */
  public mapExpr(range: OffsetRange, entries: EntryExpr[]): Expr {
    return this.exprFactory.map(this.nextId(range), entries);
  }

  /**
   * mapEntryExpr creates a single map entry.
   */
  public mapEntryExpr(range: OffsetRange, key: Expr, value: Expr, optional: boolean): EntryExpr {
    return this.exprFactory.mapEntry(this.nextId(range), key, value, optional);
  }

  /**
   * structExpr creates a struct or message literal expression.
   */
  public structExpr(range: OffsetRange, typeName: string, fields: EntryExpr[]): Expr {
    return this.exprFactory.struct(this.nextId(range), typeName, fields);
  }

  /**
   * structFieldExpr creates a single struct field initializer.
   */
  public structFieldExpr(
    range: OffsetRange,
    name: string,
    value: Expr,
    optional: boolean,
  ): EntryExpr {
    return this.exprFactory.structField(this.nextId(range), name, value, optional);
  }

  /**
   * comprehensionExpr creates a comprehension expression.
   */
  public comprehensionExpr(
    range: OffsetRange,
    iterRange: Expr,
    iterVar: string,
    accuVar: string,
    accuInit: Expr,
    condition: Expr,
    step: Expr,
    result: Expr,
  ): Expr {
    return this.exprFactory.comprehension(
      this.nextId(range),
      iterRange,
      iterVar,
      accuVar,
      accuInit,
      condition,
      step,
      result,
    );
  }

  /**
   * macroHelper creates a macro expansion helper aligned with cel-go's exprHelper behavior.
   */
  public macroHelper(id: number): MacroExprHelper {
    return new MacroExprHelper(this, id);
  }

  /**
   * buildMacroCallArg replaces nested macro expansions with unspecified placeholders for source info.
   *
   * cel-go records the original macro call shape in source info without recursively embedding other
   * expanded macro payloads. This keeps macro call tracking stable and prevents source-info trees
   * from growing with already-expanded descendants.
   */
  public buildMacroCallArg(expr: Expr): Expr {
    const [, found] = this.sourceInfo.getMacroCall(expr.id());
    if (found) {
      return this.exprFactory.unspecified(expr.id());
    }
    switch (expr.kind()) {
      case ExprKind.Call: {
        const call = expr.asCall()!;
        const macroArgs = call.args().map((arg) => this.buildMacroCallArg(arg));
        if (!call.isMemberFunction()) {
          return this.exprFactory.call(expr.id(), call.functionName(), ...macroArgs);
        }
        return this.exprFactory.memberCall(
          expr.id(),
          call.functionName(),
          this.buildMacroCallArg(call.target()),
          ...macroArgs,
        );
      }
      case ExprKind.List: {
        const list = expr.asList()!;
        return this.exprFactory.list(
          expr.id(),
          list.elements().map((element) => this.buildMacroCallArg(element)),
          list.optionalIndices(),
        );
      }
      default:
        return expr;
    }
  }

  /**
   * addMacroCall stores the original matched call shape in source info.
   */
  public addMacroCall(
    exprId: number,
    functionName: string,
    target: Expr | undefined,
    args: Expr[],
  ): void {
    // Macro source-info snapshots should reflect the matched call surface, not the rewritten
    // expansion result, so we rebuild a lightweight call tree here.
    const macroArgs = args.map((arg) => this.buildMacroCallArg(arg));
    if (!target) {
      this.sourceInfo.setMacroCall(exprId, this.exprFactory.call(0, functionName, ...macroArgs));
      return;
    }
    const [, found] = this.sourceInfo.getMacroCall(target.id());
    const macroTarget = found
      ? this.exprFactory.unspecified(target.id())
      : this.buildMacroCallArg(target);
    this.sourceInfo.setMacroCall(
      exprId,
      this.exprFactory.memberCall(0, functionName, macroTarget, ...macroArgs),
    );
  }
}

/**
 * MacroExprHelper mirrors cel-go's exprHelper used during macro expansion.
 */
export class MacroExprHelper {
  /**
   * constructor binds the macro helper to the parser helper and matched macro call id.
   */
  constructor(
    private readonly parserHelper: ParserHelper,
    private readonly id: number,
  ) {}

  /**
   * nextMacroId allocates a fresh id at the macro call's source range.
   */
  public nextMacroId(): number {
    const range = this.parserHelper.rangeForId(this.id);
    return range ? this.parserHelper.exactId(range) : this.parserHelper.nextId();
  }

  /**
   * copy clones an expression and assigns fresh ids using cel-go's recursive copy order.
   */
  public copy(expr: Expr): Expr {
    const sourceRange = this.parserHelper.rangeForId(expr.id());
    const copyId = sourceRange
      ? this.parserHelper.exactId(sourceRange)
      : this.parserHelper.nextId();
    switch (expr.kind()) {
      case ExprKind.Literal:
        return this.parserHelper.exprFactory.literal(copyId, expr.asLiteral() ?? null);
      case ExprKind.Ident:
        return this.parserHelper.exprFactory.ident(copyId, expr.asIdent() ?? "");
      case ExprKind.Select: {
        const select = expr.asSelect()!;
        const operand = this.copy(select.operand());
        return select.isTestOnly()
          ? this.parserHelper.exprFactory.presenceTest(copyId, operand, select.fieldName())
          : this.parserHelper.exprFactory.select(copyId, operand, select.fieldName());
      }
      case ExprKind.Call: {
        const call = expr.asCall()!;
        const args = call.args().map((arg) => this.copy(arg));
        if (!call.isMemberFunction()) {
          return this.parserHelper.exprFactory.call(copyId, call.functionName(), ...args);
        }
        return this.parserHelper.exprFactory.memberCall(
          copyId,
          call.functionName(),
          this.copy(call.target()),
          ...args,
        );
      }
      case ExprKind.List: {
        const list = expr.asList()!;
        return this.parserHelper.exprFactory.list(
          copyId,
          list.elements().map((element) => this.copy(element)),
          list.optionalIndices(),
        );
      }
      case ExprKind.Map: {
        const map = expr.asMap()!;
        const entries = map.entries().map((entry) => {
          const mapEntry = entry.asMapEntry()!;
          return this.parserHelper.exprFactory.mapEntry(
            this.nextMacroId(),
            this.copy(mapEntry.key()),
            this.copy(mapEntry.value()),
            mapEntry.isOptional(),
          );
        });
        return this.parserHelper.exprFactory.map(copyId, entries);
      }
      case ExprKind.Struct: {
        const struct = expr.asStruct()!;
        const fields = struct.fields().map((entry) => {
          const field = entry.asStructField()!;
          return this.parserHelper.exprFactory.structField(
            this.nextMacroId(),
            field.name(),
            this.copy(field.value()),
            field.isOptional(),
          );
        });
        return this.parserHelper.exprFactory.struct(copyId, struct.typeName(), fields);
      }
      case ExprKind.Comprehension: {
        const comprehension = expr.asComprehension()!;
        return this.parserHelper.exprFactory.comprehensionTwoVar(
          copyId,
          this.copy(comprehension.iterRange()),
          comprehension.iterVar(),
          comprehension.iterVar2(),
          comprehension.accuVar(),
          this.copy(comprehension.accuInit()),
          this.copy(comprehension.loopCondition()),
          this.copy(comprehension.loopStep()),
          this.copy(comprehension.result()),
        );
      }
      default:
        return this.parserHelper.exprFactory.unspecified(copyId);
    }
  }
}
