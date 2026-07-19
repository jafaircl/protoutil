import type { CheckedExpr, Reference, Type } from "../../gen/cel/expr/checked_pb.js";
import type {
  Expr_CreateStruct_Entry,
  Expr as ProtoExpr,
  SourceInfo as ProtoSourceInfo,
} from "../../gen/cel/expr/syntax_pb.js";
import { type Location, NO_LOCATION, SourceLocation } from "../location.js";
import type { Source } from "../source.js";
import type { EntryExpr, Expr, IdGenerator } from "./expr.js";
import { constantToVal, entryExprToProto, protoToExpr, valToConstant } from "./expr.js";

/**
 * OffsetRange represents the source offset span for an expression id.
 */
export type OffsetRange = { start: number; stop: number };

/**
 * ExtensionComponent identifies the CEL subsystem affected by an extension.
 */
export enum ExtensionComponent {
  Parser = "parser",
  TypeChecker = "type_checker",
  Runtime = "runtime",
}

/**
 * ExtensionVersion describes an extension version.
 */
export type ExtensionVersion = {
  major: number;
  minor: number;
};

/**
 * Extension declares an enabled syntax extension.
 */
export type Extension = {
  id: string;
  version: ExtensionVersion;
  affectedComponents: ExtensionComponent[];
};

const DYN_TYPE: Type = {
  $typeName: "cel.expr.Type",
  typeKind: {
    case: "dyn",
    value: { $typeName: "google.protobuf.Empty" },
  },
};

function cloneTypeMap(typeMap: Map<number, Type>): Map<number, Type> {
  return new Map([...typeMap.entries()].map(([id, type]) => [id, structuredClone(type)]));
}

function normalizeConstant(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return [...value];
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

/**
 * ReferenceInfo records identifier and overload binding metadata.
 */
export class ReferenceInfo {
  public overloadIds: string[];

  constructor(
    public readonly name = "",
    public readonly value?: unknown,
    overloadIds: string[] = [],
  ) {
    this.overloadIds = [...new Set(overloadIds)].sort();
  }

  public equals(other?: ReferenceInfo): boolean {
    if (!other) {
      return false;
    }
    return (
      this.name === other.name &&
      JSON.stringify(normalizeConstant(this.value)) ===
        JSON.stringify(normalizeConstant(other.value)) &&
      JSON.stringify(this.overloadIds) === JSON.stringify(other.overloadIds)
    );
  }

  public addOverload(overloadId: string): ReferenceInfo {
    this.overloadIds = [...new Set([...this.overloadIds, overloadId])].sort();
    return this;
  }
}

/**
 * FunctionReference returns a reference for function overload resolution.
 */
export function functionReference(...overloadIds: string[]): ReferenceInfo {
  return new ReferenceInfo("", undefined, overloadIds);
}

/**
 * IdentReference returns a reference for an identifier binding.
 */
export function identReference(name: string, value?: unknown): ReferenceInfo {
  return new ReferenceInfo(name, value, []);
}

function protoExtensionComponent(component: ExtensionComponent): number {
  switch (component) {
    case ExtensionComponent.Parser:
      return 1;
    case ExtensionComponent.TypeChecker:
      return 2;
    case ExtensionComponent.Runtime:
      return 3;
  }
}

function fromProtoExtensionComponent(component: number): ExtensionComponent | undefined {
  switch (component) {
    case 1:
      return ExtensionComponent.Parser;
    case 2:
      return ExtensionComponent.TypeChecker;
    case 3:
      return ExtensionComponent.Runtime;
    default:
      return undefined;
  }
}

/**
 * SourceInfo collects source metadata for a parsed expression.
 */
export class SourceInfo {
  private readonly offsetRangesMap = new Map<number, OffsetRange>();
  private readonly macroCallsMap = new Map<number, Expr>();
  private readonly extensionsList: Extension[];

  constructor(
    private readonly syntax = "",
    private readonly desc = "",
    private readonly lines: number[] = [],
    private readonly baseLine = 0,
    private readonly baseCol = 0,
    extensions: Extension[] = [],
  ) {
    this.extensionsList = [...extensions];
  }

  /** SyntaxVersion returns the source syntax version. */
  public syntaxVersion(): string {
    return this.syntax;
  }

  /** Description returns the source description. */
  public description(): string {
    return this.desc;
  }

  /** LineOffsets returns the stored line offsets. */
  public lineOffsets(): number[] {
    return [...this.lines];
  }

  /** OffsetRanges returns the expression id to offset range map. */
  public offsetRanges(): Map<number, OffsetRange> {
    return new Map(this.offsetRangesMap);
  }

  /** MacroCalls returns the stored macro call expressions. */
  public macroCalls(): Map<number, Expr> {
    return new Map(this.macroCallsMap);
  }

  /** Extensions returns the enabled extension list. */
  public extensions(): Extension[] {
    return [...this.extensionsList];
  }

  /** SetOffsetRange stores the source offset range for an expression id. */
  public setOffsetRange(id: number, range: OffsetRange): void {
    this.offsetRangesMap.set(id, range);
  }

  /** GetOffsetRange looks up the source offset range for an expression id. */
  public getOffsetRange(id: number): [OffsetRange | undefined, boolean] {
    return [this.offsetRangesMap.get(id), this.offsetRangesMap.has(id)];
  }

  /** ClearOffsetRange removes the source offset range for an expression id. */
  public clearOffsetRange(id: number): void {
    this.offsetRangesMap.delete(id);
  }

  /** SetMacroCall stores the macro call for an expression id. */
  public setMacroCall(id: number, expr: Expr): void {
    this.macroCallsMap.set(id, expr);
  }

  /** GetMacroCall looks up the macro call for an expression id. */
  public getMacroCall(id: number): [Expr | undefined, boolean] {
    return [this.macroCallsMap.get(id), this.macroCallsMap.has(id)];
  }

  /** AddExtension appends an extension descriptor. */
  public addExtension(extension: Extension): void {
    this.extensionsList.push(extension);
  }

  /** HasExtension reports whether a compatible extension is enabled. */
  public hasExtension(id: string, version: ExtensionVersion): boolean {
    return this.extensionsList.some(
      (extension) =>
        extension.id === id &&
        (extension.version.major > version.major ||
          (extension.version.major === version.major && extension.version.minor >= version.minor)),
    );
  }

  /** ComputeOffset converts a line and column to an absolute source offset. */
  public computeOffset(line: number, column: number): number {
    if (line < 1) {
      return -1;
    }
    const absoluteLine = line + this.baseLine;
    const start = absoluteLine === 1 ? 0 : (this.lines[absoluteLine - 2] ?? -1);
    if (start < 0) {
      return absoluteLine === 1 ? column + this.baseCol : -1;
    }
    return start + this.baseCol + column;
  }

  /** GetStartLocation returns the start location for an expression id. */
  public getStartLocation(id: number): Location {
    const [range, found] = this.getOffsetRange(id);
    if (!found || !range) {
      return NO_LOCATION;
    }
    return this.offsetToLocation(range.start);
  }

  /** GetStopLocation returns the stop location for an expression id. */
  public getStopLocation(id: number): Location {
    const [range, found] = this.getOffsetRange(id);
    if (!found || !range) {
      return NO_LOCATION;
    }
    return this.offsetToLocation(range.stop);
  }

  /** RenumberIds rewrites stored ids using the provided generator. */
  public renumberIds(generator: IdGenerator): void {
    const ranges = [...this.offsetRangesMap.entries()];
    this.offsetRangesMap.clear();
    for (const [id, range] of ranges) {
      this.offsetRangesMap.set(generator(id), range);
    }
    const calls = [...this.macroCallsMap.entries()];
    this.macroCallsMap.clear();
    for (const [id, call] of calls) {
      call.renumberIds(generator);
      this.macroCallsMap.set(generator(id), call);
    }
  }

  private offsetToLocation(offset: number): Location {
    let line = 1;
    let start = 0;
    for (const next of this.lines) {
      if (next > offset) {
        break;
      }
      line += 1;
      start = next;
    }
    return new SourceLocation(
      line - this.baseLine,
      offset - start - (line - this.baseLine === 1 ? this.baseCol : 0),
    );
  }
}

/**
 * ExtensionVersion creates an extension version value.
 */
export function extensionVersion(major: number, minor: number): ExtensionVersion {
  return { major, minor };
}

/**
 * Extension creates an extension descriptor.
 */
export function extension(
  id: string,
  version: ExtensionVersion,
  ...affectedComponents: ExtensionComponent[]
): Extension {
  return { id, version, affectedComponents };
}

/**
 * SourceInfo creates source metadata from a Source.
 */
export function sourceInfo(source?: Source): SourceInfo {
  let baseLine = 0;
  let baseCol = 0;
  if (source) {
    const [location, found] = source.offsetLocation(0);
    if (found) {
      baseLine = location.line() - 1;
      baseCol = location.column();
    }
  }
  return new SourceInfo(
    "",
    source?.description() ?? "",
    source?.lineOffsets() ?? [],
    baseLine,
    baseCol,
  );
}

/**
 * CopySourceInfo deep-copies SourceInfo metadata.
 */
export function copySourceInfo(sourceInfo?: SourceInfo): SourceInfo | undefined {
  if (!sourceInfo) {
    return undefined;
  }
  const copy = new SourceInfo(
    sourceInfo.syntaxVersion(),
    sourceInfo.description(),
    sourceInfo.lineOffsets(),
    0,
    0,
    sourceInfo.extensions(),
  );
  for (const [id, range] of sourceInfo.offsetRanges()) {
    copy.setOffsetRange(id, range);
  }
  for (const [id, call] of sourceInfo.macroCalls()) {
    copy.setMacroCall(id, protoToExpr(call.toProto()));
  }
  return copy;
}

/**
 * ProtoToSourceInfo converts protobuf source info to the local representation.
 */
export function protoToSourceInfo(sourceInfo?: ProtoSourceInfo): SourceInfo {
  const info = new SourceInfo(
    sourceInfo?.syntaxVersion ?? "",
    sourceInfo?.location ?? "",
    [...(sourceInfo?.lineOffsets ?? [])],
    0,
    0,
    (sourceInfo?.extensions ?? []).map((sourceExtension) => {
      const components = sourceExtension.affectedComponents
        .map((component) => fromProtoExtensionComponent(component))
        .filter((component): component is ExtensionComponent => component !== undefined);
      return extension(
        sourceExtension.id,
        extensionVersion(
          Number(sourceExtension.version?.major ?? 0n),
          Number(sourceExtension.version?.minor ?? 0n),
        ),
        ...components,
      );
    }),
  );
  for (const [id, offset] of Object.entries(sourceInfo?.positions ?? {})) {
    info.setOffsetRange(Number(id), { start: offset, stop: offset });
  }
  for (const [id, expr] of Object.entries(sourceInfo?.macroCalls ?? {})) {
    info.setMacroCall(Number(id), protoToExpr(expr));
  }
  return info;
}

/**
 * SourceInfoToProto converts source metadata to protobuf form.
 */
export function sourceInfoToProto(sourceInfo?: SourceInfo): ProtoSourceInfo {
  const positions: Record<string, number> = {};
  for (const [id, range] of sourceInfo?.offsetRanges() ?? []) {
    positions[String(id)] = range.start;
  }
  const macroCalls: Record<string, ProtoExpr> = {};
  for (const [id, expr] of sourceInfo?.macroCalls() ?? []) {
    macroCalls[String(id)] = expr.toProto();
  }
  return {
    $typeName: "cel.expr.SourceInfo",
    syntaxVersion: sourceInfo?.syntaxVersion() ?? "",
    location: sourceInfo?.description() ?? "",
    lineOffsets: sourceInfo?.lineOffsets() ?? [],
    positions,
    macroCalls,
    extensions:
      sourceInfo?.extensions().map((extension) => ({
        $typeName: "cel.expr.SourceInfo.Extension",
        id: extension.id,
        affectedComponents: extension.affectedComponents.map(protoExtensionComponent),
        version: {
          $typeName: "cel.expr.SourceInfo.Extension.Version",
          major: BigInt(extension.version.major),
          minor: BigInt(extension.version.minor),
        },
      })) ?? [],
  };
}

/**
 * AST represents the parsed or checked expression graph plus metadata.
 */
export class AST {
  private readonly typeMapValue: Map<number, Type>;
  private readonly refMapValue: Map<number, ReferenceInfo>;

  constructor(
    private readonly exprValue: Expr,
    private readonly sourceInfoValue?: SourceInfo,
    typeMap: Map<number, Type> = new Map(),
    refMap: Map<number, ReferenceInfo> = new Map(),
  ) {
    this.typeMapValue = typeMap;
    this.refMapValue = refMap;
  }

  /** Expr returns the root expression. */
  public expr(): Expr {
    return this.exprValue;
  }

  /** SourceInfo returns the associated source metadata. */
  public sourceInfo(): SourceInfo {
    return this.sourceInfoValue ?? new SourceInfo();
  }

  /** GetType looks up the type for an expression id. */
  public getType(id: number): Type | undefined {
    return this.typeMapValue.get(id) ?? DYN_TYPE;
  }

  /** SetType records the type for an expression id. */
  public setType(id: number, type: Type): void {
    this.typeMapValue.set(id, type);
  }

  /** TypeMap returns a copy of the expression id to type map. */
  public typeMap(): Map<number, Type> {
    return cloneTypeMap(this.typeMapValue);
  }

  /** ReferenceMap returns a copy of the expression id to reference map. */
  public referenceMap(): Map<number, ReferenceInfo> {
    return new Map(this.refMapValue);
  }

  /** SetReference records the reference for an expression id. */
  public setReference(id: number, reference: ReferenceInfo): void {
    this.refMapValue.set(id, reference);
  }

  /** GetOverloadIds returns the overload ids for an expression id. */
  public getOverloadIds(id: number): string[] {
    return [...(this.refMapValue.get(id)?.overloadIds ?? [])];
  }

  /** IsChecked reports whether type-checking metadata is present. */
  public isChecked(): boolean {
    return this.typeMapValue.size > 0;
  }

  /** Ids returns the set of ids referenced by the AST and macro calls. */
  public ids(): Set<number> {
    const ids = new Set<number>();
    postOrderVisit(this.exprValue, (expr) => {
      ids.add(expr.id());
    });
    for (const [id, expr] of this.sourceInfo().macroCalls()) {
      ids.add(id);
      postOrderVisit(expr, (node) => ids.add(node.id()));
    }
    return ids;
  }

  /** ClearUnusedIds removes source offsets that do not correspond to live ids. */
  public clearUnusedIds(): void {
    const ids = this.ids();
    for (const id of this.sourceInfo().offsetRanges().keys()) {
      if (!ids.has(id)) {
        this.sourceInfo().clearOffsetRange(id);
      }
    }
  }
}

/**
 * AST creates an unchecked AST value.
 */
export function ast(expr?: Expr, sourceInfo?: SourceInfo): AST {
  return new AST(expr ?? protoToExpr(), sourceInfo);
}

/**
 * CheckedAST creates a checked AST value.
 */
export function checkedAst(
  parsed?: AST,
  typeMap?: Map<number, Type>,
  refMap?: Map<number, ReferenceInfo>,
): AST {
  return new AST(
    parsed?.expr() ?? protoToExpr(),
    parsed?.sourceInfo(),
    typeMap ?? new Map(),
    refMap ?? new Map(),
  );
}

/**
 * CopyAST deep-copies an AST.
 */
export function copyAst(ast?: AST): AST | undefined {
  if (!ast) {
    return undefined;
  }
  return new AST(
    protoToExpr(ast.expr().toProto()),
    copySourceInfo(ast.sourceInfo()),
    ast.typeMap(),
    ast.referenceMap(),
  );
}

/**
 * MaxID returns one greater than the maximum expression id.
 */
export function maxId(ast: AST): number {
  let currentMax = 1;
  postOrderVisit(ast.expr(), (expr) => {
    currentMax = Math.max(currentMax, expr.id());
  });
  for (const [id, call] of ast.sourceInfo().macroCalls()) {
    currentMax = Math.max(currentMax, id);
    postOrderVisit(call, (expr) => {
      currentMax = Math.max(currentMax, expr.id());
    });
  }
  return currentMax + 1;
}

/**
 * Heights computes the expression height for each expression id.
 */
export function heights(ast: AST): Map<number, number> {
  const result = new Map<number, number>();
  const visit = (expr: Expr): number => {
    const childHeights = expr.children().map((child) => visit(child));
    const height =
      childHeights.length === 0
        ? expr.kind() === 3 || expr.kind() === 5 || expr.kind() === 0
          ? 0
          : 1
        : Math.max(...childHeights) + 1;
    result.set(expr.id(), height);
    return height;
  };
  visit(ast.expr());
  return result;
}

/**
 * ReferenceInfoToProto converts a reference to protobuf form.
 */
export function referenceInfoToProto(reference: ReferenceInfo): Reference {
  return {
    $typeName: "cel.expr.Reference",
    name: reference.name,
    overloadId: reference.overloadIds,
    value: reference.value !== undefined ? valToConstant(reference.value as never) : undefined,
  };
}

/**
 * ProtoToReferenceInfo converts a protobuf reference to the local representation.
 */
export function protoToReferenceInfo(reference?: Reference): ReferenceInfo {
  if (!reference) {
    return new ReferenceInfo();
  }
  return new ReferenceInfo(
    reference.name,
    reference.value ? constantToVal(reference.value) : undefined,
    [...reference.overloadId],
  );
}

/**
 * ToProto converts the AST to a CheckedExpr protobuf value.
 */
export function toProto(ast: AST): CheckedExpr {
  const referenceMap: Record<string, Reference> = {};
  for (const [id, reference] of ast.referenceMap()) {
    referenceMap[String(id)] = referenceInfoToProto(reference);
  }
  const typeMap: Record<string, Type> = {};
  for (const [id, type] of ast.typeMap()) {
    typeMap[String(id)] = structuredClone(type);
  }
  return {
    $typeName: "cel.expr.CheckedExpr",
    expr: ast.expr().toProto(),
    sourceInfo: sourceInfoToProto(ast.sourceInfo()),
    referenceMap,
    typeMap,
    exprVersion: "",
  };
}

/**
 * ToAST converts a CheckedExpr protobuf value to an AST.
 */
export function toAst(checked: CheckedExpr): AST {
  const refMap = new Map<number, ReferenceInfo>();
  for (const [id, reference] of Object.entries(checked.referenceMap)) {
    refMap.set(Number(id), protoToReferenceInfo(reference));
  }
  const typeMap = new Map<number, Type>();
  for (const [id, type] of Object.entries(checked.typeMap)) {
    typeMap.set(Number(id), structuredClone(type));
  }
  return new AST(protoToExpr(checked.expr), protoToSourceInfo(checked.sourceInfo), typeMap, refMap);
}

export function exprToProto(expr: Expr): ProtoExpr {
  return expr.toProto();
}

export function postOrderVisit(expr: Expr, visitor: (expr: Expr) => void): void {
  for (const child of expr.children()) {
    postOrderVisit(child, visitor);
  }
  visitor(expr);
}

export function preOrderVisit(expr: Expr, visitor: (expr: Expr) => void): void {
  visitor(expr);
  for (const child of expr.children()) {
    preOrderVisit(child, visitor);
  }
}

export function entryExprToProtoValue(entry: EntryExpr): Expr_CreateStruct_Entry {
  return entryExprToProto(entry);
}
