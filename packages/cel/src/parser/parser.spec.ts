import { describe, expect, it } from "vitest";
import { type AST, type EntryExpr, type Expr, ExprKind, exprFactory } from "../common/ast/index.js";
import { type Adorner, toAdornedDebugString } from "../common/debug.js";
import type { Location } from "../common/location.js";
import { SourceLocation } from "../common/location.js";
import { type Source, stringSource } from "../common/source.js";
import { syncedCases } from "../common/spec-helpers.js";
import type { Constant } from "../gen/cel/expr/syntax_pb.js";
import { globalVarArgMacro, macroMap, type ParserConfig, parser } from "./index.js";

type ParseCase = {
  I: string;
  P?: string;
  L?: string;
  M?: string;
  E?: string | { $expr?: string };
  Opts?: { $expr?: string }[];
};

/**
 * RelativeSource represents an embedded source element within a larger source.
 */
class RelativeSource implements Source {
  /**
   * constructor binds the relative snippet to an absolute backing source and start location.
   */
  constructor(
    private readonly sourceValue: Source,
    private readonly localSource: Source,
    private readonly absLoc: Location,
  ) {}

  /**
   * content returns the embedded source snippet.
   */
  public content(): string {
    return this.localSource.content();
  }

  /**
   * description returns the embedded source description.
   */
  public description(): string {
    return this.localSource.description();
  }

  /**
   * lineOffsets returns the local snippet line offsets.
   */
  public lineOffsets(): number[] {
    return this.localSource.lineOffsets();
  }

  /**
   * locationOffset translates a relative location to a local snippet offset.
   */
  public locationOffset(location: Location): [number, boolean] {
    const absolute = this.sourceValue.locationOffset(location);
    if (absolute[1]) {
      return absolute;
    }
    return this.localSource.locationOffset(location);
  }

  /**
   * offsetLocation translates a local offset into the absolute backing source location.
   */
  public offsetLocation(offset: number): [Location, boolean] {
    const [absOffset, found] = this.sourceValue.locationOffset(this.absLoc);
    if (!found) {
      return [new SourceLocation(-1, -1), false];
    }
    return this.sourceValue.offsetLocation(absOffset + offset);
  }

  /**
   * location returns a local source location.
   */
  public location(line: number, column: number): Location {
    return this.localSource.location(line, column);
  }

  /**
   * snippet returns the local line snippet.
   */
  public snippet(line: number): [string, boolean] {
    return this.localSource.snippet(line);
  }
}

describe("parser/parser_test.go", () => {
  describe("TestParse", () => {
    const rows = syncedCases<ParseCase>("parser/parser_test.go/TestParse");
    for (const [index, row] of rows.entries()) {
      it(`${index} ${row.I}`, () => {
        const celParser = buildParser(row.Opts ?? []);
        const src = stringSource(row.I, "<input>");
        const parsed = celParser.tryParseSource(src);
        const errs = parsed.errors;
        const actualErr = errs?.toDisplayString() ?? "";
        if ((errs?.getErrors().length ?? 0) > 0) {
          if (!row.E) {
            throw new Error(`Unexpected errors: ${actualErr}`);
          }
          expect(stripWhitespace(actualErr)).toBe(stripWhitespace(expectedError(row.E)));
          return;
        }
        if (row.E) {
          throw new Error(`Expected error not thrown: '${expectedError(row.E)}'`);
        }
        const actualWithKind = toAdornedDebugString(parsed.ast.expr(), new KindAndIdAdorner());
        expect(stripWhitespace(actualWithKind)).toBe(stripWhitespace(row.P ?? ""));
        if (row.L) {
          const actualWithLocation = toAdornedDebugString(
            parsed.ast.expr(),
            new LocationAdorner(parsed.ast),
          );
          expect(stripWhitespace(actualWithLocation)).toBe(stripWhitespace(row.L));
        }
        if (row.M) {
          const actualMacroCalls = convertMacroCallsToString(parsed.ast);
          expect(stripWhitespace(actualMacroCalls)).toBe(stripWhitespace(row.M));
        }
        expect(unusedSourceInfoIds(parsed.ast)).toEqual([]);
        verifyRelativeSourceOffsets(celParser, src, parsed.ast);
      });
    }
  });

  describe("TestExpressionSizeCodePointLimit", () => {
    it("parser/parser_test.go/TestExpressionSizeCodePointLimit", () => {
      const celParser = parser({ expressionSizeCodePointLimit: 2 });
      const errs = celParser.tryParseSource(stringSource("foo", "<input>")).errors;
      expect(errs).toBeDefined();
      expect(errs!.getErrors()).toHaveLength(1);
      expect(errs!.getErrors()[0]?.message).toBe(
        "expression code point size exceeds limit: size: 3, limit 2",
      );
    });
  });

  describe("TestParserOptionErrors", () => {
    it("parser/parser_test.go/TestParserOptionErrors max recursion depth", () => {
      expect(() => parser({ maxRecursionDepth: -2 })).toThrow(
        "max recursion depth must be greater than or equal to -1: -2",
      );
    });

    it("parser/parser_test.go/TestParserOptionErrors error recovery limit", () => {
      expect(() => parser({ errorRecoveryLimit: -2 })).toThrow(
        "error recovery limit must be greater than or equal to -1: -2",
      );
    });

    it("parser/parser_test.go/TestParserOptionErrors error recovery lookahead token limit", () => {
      expect(() => parser({ errorRecoveryTokenLookaheadLimit: 0 })).toThrow(
        "error recovery lookahead token limit must be at least 1: 0",
      );
    });

    it("parser/parser_test.go/TestParserOptionErrors error reporting limit", () => {
      expect(() => parser({ errorReportingLimit: 0 })).toThrow(
        "error reporting limit must be greater than 0: 0",
      );
    });

    it("parser/parser_test.go/TestParserOptionErrors expression size code point limit", () => {
      expect(() => parser({ expressionSizeCodePointLimit: -2 })).toThrow(
        "expression size code point limit must be greater than or equal to -1: -2",
      );
    });
  });

  describe("TestParseErrorData", () => {
    it("parser/parser_test.go/TestParseErrorData", () => {
      const celParser = buildParser([]);
      const errs = celParser.tryParseSource(stringSource("a.?b", "<input>")).errors;
      expect(errs).toBeDefined();
      expect(errs!.getErrors()).toHaveLength(1);
      expect(errs!.getErrors()[0]?.exprId).toBe(2);
      expect(errs!.getErrors()[0]?.message).toContain("unsupported syntax");
    });
  });
});

function buildParser(options: { $expr?: string }[]) {
  const parsedOptions: ParserConfig = {
    maxRecursionDepth: 32,
    errorRecoveryLimit: 4,
    errorRecoveryTokenLookaheadLimit: 4,
    populateMacroCalls: true,
  };
  for (const option of options) {
    switch (option.$expr) {
      case "EnableOptionalSyntax(true)":
        parsedOptions.enableOptionalSyntax = true;
        break;
      case "EnableOptionalSyntax(false)":
        parsedOptions.enableOptionalSyntax = false;
        break;
      case "EnableIdentEscapeSyntax(true)":
        parsedOptions.enableIdentEscapeSyntax = true;
        break;
      case "EnableIdentEscapeSyntax(false)":
        parsedOptions.enableIdentEscapeSyntax = false;
        break;
      case "EnableHiddenAccumulatorName(false)":
        parsedOptions.enableHiddenAccumulatorName = false;
        break;
      case "PopulateMacroCalls(true)":
        parsedOptions.populateMacroCalls = true;
        break;
      case "ErrorRecoveryLimit(10)":
        parsedOptions.errorRecoveryLimit = 10;
        break;
      case "ErrorRecoveryLookaheadTokenLimit(10)":
        parsedOptions.errorRecoveryTokenLookaheadLimit = 10;
        break;
      case "ErrorReportingLimit(2)":
        parsedOptions.errorReportingLimit = 2;
        break;
      default:
        if (option.$expr?.startsWith('Macros(NewGlobalVarArgMacro("noop_macro"')) {
          parsedOptions.macros = macroMap([globalVarArgMacro("noop_macro", () => undefined)]);
        }
        break;
    }
  }
  return parser(parsedOptions);
}

/**
 * KindAndIdAdorner mirrors cel-go's parser test adorner for structure assertions.
 */
class KindAndIdAdorner implements Adorner {
  /**
   * getMetadata appends upstream-style id and kind metadata for expressions and entries.
   */
  public getMetadata(elem: unknown): string {
    if (isEntryExpr(elem)) {
      return `^#${elem.id()}:*expr.Expr_CreateStruct_Entry#`;
    }
    if (isExpr(elem)) {
      return `^#${elem.id()}:${exprMetadata(elem)}#`;
    }
    return "";
  }
}

/**
 * MacroCallAdorner mirrors the upstream macro-call display for source-info assertions.
 */
class MacroCallAdorner implements Adorner {
  /**
   * constructor binds the adorner to the parsed source-info metadata.
   */
  constructor(private readonly parsed: { sourceInfo(): { macroCalls(): Map<number, Expr> } }) {}

  /**
   * getMetadata appends macro names for expanded call ids and kind metadata elsewhere.
   */
  public getMetadata(elem: unknown): string {
    if (isEntryExpr(elem)) {
      return `^#${elem.id()}:*expr.Expr_CreateStruct_Entry#`;
    }
    if (!isExpr(elem)) {
      return "";
    }
    const macroCall = this.parsed.sourceInfo().macroCalls().get(elem.id());
    if (macroCall) {
      return `^#${elem.id()}:${macroCall.asCall()?.functionName() ?? ""}#`;
    }
    return `^#${elem.id()}:${exprMetadata(elem)}#`;
  }
}

/**
 * LocationAdorner mirrors cel-go's parser test location adorner.
 */
class LocationAdorner implements Adorner {
  /**
   * constructor binds the adorner to the parsed source-info metadata.
   */
  constructor(private readonly parsed: AST) {}

  /**
   * getMetadata appends upstream-style id and source-location metadata.
   */
  public getMetadata(elem: unknown): string {
    if (!isEntryExpr(elem) && !isExpr(elem)) {
      return "";
    }
    const location = this.parsed.sourceInfo().getStartLocation(elem.id());
    return `^#${elem.id()}[${location.line()},${location.column()}]#`;
  }
}

function isExpr(value: unknown): value is Expr {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "kind" in value &&
    "toProto" in value
  );
}

function isEntryExpr(value: unknown): value is EntryExpr {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "asMapEntry" in value &&
    "asStructField" in value
  );
}

function exprMetadata(expr: Expr): string {
  switch (expr.kind()) {
    case ExprKind.Call:
      return "*expr.Expr_CallExpr";
    case ExprKind.Comprehension:
      return "*expr.Expr_ComprehensionExpr";
    case ExprKind.Ident:
      return "*expr.Expr_IdentExpr";
    case ExprKind.Literal:
      return literalMetadata(expr.asLiteral());
    case ExprKind.List:
      return "*expr.Expr_ListExpr";
    case ExprKind.Map:
    case ExprKind.Struct:
      return "*expr.Expr_StructExpr";
    case ExprKind.Select:
      return "*expr.Expr_SelectExpr";
    default:
      return "*expr.Expr";
  }
}

function literalMetadata(value: Expr["asLiteral"] extends () => infer T ? T : never): string {
  if (value === null) {
    return "*expr.Constant_NullValue";
  }
  if (typeof value === "boolean") {
    return "*expr.Constant_BoolValue";
  }
  if (typeof value === "bigint") {
    return "*expr.Constant_Int64Value";
  }
  if (typeof value === "number") {
    return "*expr.Constant_DoubleValue";
  }
  if (typeof value === "string") {
    return "*expr.Constant_StringValue";
  }
  if (value instanceof Uint8Array) {
    return "*expr.Constant_BytesValue";
  }
  if (isProtoConstant(value)) {
    switch (value.constantKind.case) {
      case "boolValue":
        return "*expr.Constant_BoolValue";
      case "bytesValue":
        return "*expr.Constant_BytesValue";
      case "doubleValue":
        return "*expr.Constant_DoubleValue";
      case "int64Value":
        return "*expr.Constant_Int64Value";
      case "nullValue":
        return "*expr.Constant_NullValue";
      case "stringValue":
        return "*expr.Constant_StringValue";
      case "uint64Value":
        return "*expr.Constant_Uint64Value";
      default:
        return "*expr.Constant";
    }
  }
  return "*expr.Constant";
}

function isProtoConstant(value: unknown): value is Constant {
  return typeof value === "object" && value !== null && "$typeName" in value;
}

function expectedError(value: string | { $expr?: string }): string {
  return typeof value === "string" ? value : resolveGoStringExpr(value.$expr ?? "");
}

function stripWhitespace(value: string): string {
  return value.replace(/[ \n\t\r]/g, "");
}

function resolveGoStringExpr(expr: string): string {
  if (!expr.includes('"') && !expr.includes("`")) {
    return expr;
  }
  let index = 0;
  let out = "";
  while (index < expr.length) {
    const char = expr[index];
    if (char === '"' || char === "`") {
      const [value, nextIndex] = parseGoStringLiteral(expr, index);
      out += value;
      index = nextIndex;
      continue;
    }
    index += 1;
  }
  return out.length > 0 ? out : expr;
}

function parseGoStringLiteral(expr: string, start: number): [string, number] {
  const quote = expr[start]!;
  let index = start + 1;
  let value = "";
  while (index < expr.length) {
    const char = expr[index]!;
    if (quote === "`") {
      if (char === "`") {
        return [value, index + 1];
      }
      value += char;
      index += 1;
      continue;
    }
    if (char === '"' && expr[index - 1] !== "\\") {
      return [JSON.parse(`"${value}"`) as string, index + 1];
    }
    value += char;
    index += 1;
  }
  return [expr.slice(start), expr.length];
}

function convertMacroCallsToString(parsed: AST): string {
  const factory = exprFactory();
  const keys = [...parsed.sourceInfo().macroCalls().keys()].sort((left, right) => right - left);
  const adornedStrings: string[] = [];
  for (const key of keys) {
    const call = parsed.sourceInfo().macroCalls().get(key)?.asCall();
    if (!call) {
      continue;
    }
    const expr = call.isMemberFunction()
      ? factory.memberCall(key, call.functionName(), call.target(), ...call.args())
      : factory.call(key, call.functionName(), ...call.args());
    adornedStrings.push(toAdornedDebugString(expr, new MacroCallAdorner(parsed)));
  }
  return adornedStrings.join(",\n");
}

function unusedSourceInfoIds(parsed: AST): number[] {
  const astIds = parsed.ids();
  return [...parsed.sourceInfo().offsetRanges().keys()].filter((id) => !astIds.has(id));
}

function verifyRelativeSourceOffsets(
  celParser: ReturnType<typeof parser>,
  src: Source,
  parsed: AST,
): void {
  const padding = "         \n".repeat(10);
  const padSrc = new RelativeSource(
    stringSource(padding + src.content(), src.description()),
    src,
    new SourceLocation(11, 0),
  );
  const padded = celParser.tryParseSource(padSrc);
  expect(padded.errors).toBeUndefined();
  for (const [id, origRange] of parsed.sourceInfo().offsetRanges()) {
    const [padRange, found] = padded.ast.sourceInfo().getOffsetRange(id);
    expect(found).toBe(true);
    expect(padRange).toEqual({ start: origRange.start + 100, stop: origRange.stop + 100 });
  }
}
