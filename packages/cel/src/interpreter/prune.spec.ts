import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { type AST, ast, ExprKind } from "../common/ast/index.js";
import { defaultContainer } from "../common/containers.js";
import { func, overload } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { standardFunctions } from "../common/stdlib.js";
import {
  DynType,
  Int,
  ListType,
  OptionalNone,
  OptionalType,
  optionalOf,
  registry,
  type Val,
} from "../common/types/index.js";
import { TestAllTypesSchema } from "../gen/test/proto3pb/test_all_types_pb.js";
import { parse } from "../parser/parser.js";
import { unparse } from "../parser/unparser.js";
import { type Activation, activation, emptyActivation, partialActivation } from "./activation.js";
import {
  type AttributePattern,
  attributePattern,
  partialAttributeFactory,
} from "./attribute-patterns.js";
import { dispatcher } from "./dispatcher.js";
import { evalState } from "./eval-state.js";
import { evalStateObserverConfig, interpreter } from "./interpreter.js";
import { pruneAst } from "./prune.js";

/**
 * SyncedPruneCase mirrors one serialized row from cel-go's prune test table.
 */
interface SyncedPruneCase {
  /** expr is the CEL source expression to evaluate and prune. */
  expr: string;
  /** in contains the activation or serialized activation helper expression. */
  in?: unknown;
  /** out is the expected residual CEL expression. */
  out: string;
  /** iterRange is the expected residual comprehension iteration range, when specified. */
  iterRange?: string;
}

/**
 * GoToken is one token from the small Go composite-literal grammar used by synced activations.
 */
interface GoToken {
  /** kind identifies the token category. */
  kind: "identifier" | "number" | "string" | "punctuation";
  /** value contains the decoded token text. */
  value: string;
}

/**
 * GoValueParser decodes the Go map, slice, and protobuf composite literals emitted by test sync.
 */
class GoValueParser {
  /** index tracks the next unread token. */
  private index = 0;

  /** constructor stores the token stream to decode. */
  constructor(private readonly tokens: GoToken[]) {}

  /** parseValue decodes one supported Go value expression. */
  public parseValue(): unknown {
    const token = this.peek();
    if (!token) {
      throw new Error("unexpected end of Go value expression");
    }
    if (token.kind === "string") {
      this.index += 1;
      return token.value;
    }
    if (token.kind === "number") {
      this.index += 1;
      return Number(token.value);
    }
    if (token.value === "true" || token.value === "false") {
      this.index += 1;
      return token.value === "true";
    }
    if (token.value === "nil") {
      this.index += 1;
      return null;
    }
    if (token.value === "map") {
      return this.parseMap();
    }
    if (token.value === "[") {
      return this.parseSlice();
    }
    if (token.value === "&") {
      this.take("&");
      return this.parseStruct();
    }
    if (token.value === "{") {
      return this.parseInferredMap();
    }
    throw new Error(`unsupported Go value token: ${token.value}`);
  }

  /** parseMap decodes a map whose synced keys are strings. */
  private parseMap(): Record<string, unknown> {
    this.take("map");
    this.take("[");
    this.take("string");
    this.take("]");
    this.skipType();
    this.take("{");
    const result: Record<string, unknown> = {};
    while (this.peek()?.value !== "}") {
      const key = this.next();
      if (key.kind !== "string") {
        throw new Error(`unsupported Go map key: ${key.value}`);
      }
      this.take(":");
      result[key.value] = this.parseValue();
      this.consume(",");
    }
    this.take("}");
    return result;
  }

  /** parseSlice decodes a supported Go slice literal. */
  private parseSlice(): unknown[] {
    this.take("[");
    this.take("]");
    this.skipType();
    this.take("{");
    const result: unknown[] = [];
    while (this.peek()?.value !== "}") {
      result.push(this.parseValue());
      this.consume(",");
    }
    this.take("}");
    return result;
  }

  /** parseStruct decodes the protobuf message literal used by the upstream prune table. */
  private parseStruct(): Record<string, unknown> {
    const typeParts: string[] = [];
    while (this.peek()?.value !== "{") {
      typeParts.push(this.next().value);
    }
    this.take("{");
    const fields: Record<string, unknown> = {};
    while (this.peek()?.value !== "}") {
      const field = this.next().value;
      this.take(":");
      fields[field] = this.parseValue();
      this.consume(",");
    }
    this.take("}");
    if (typeParts.join("") !== "proto3pb.TestAllTypes") {
      throw new Error(`unsupported Go struct type: ${typeParts.join("")}`);
    }
    return {
      $typeName: TestAllTypesSchema.typeName,
      singleInt32: fields.SingleInt32,
      singleInt64: BigInt(fields.SingleInt64 as number),
    };
  }

  /** parseInferredMap decodes an elided map element type inside a typed Go slice literal. */
  private parseInferredMap(): Record<string, unknown> {
    this.take("{");
    const result: Record<string, unknown> = {};
    while (this.peek()?.value !== "}") {
      const key = this.next();
      if (key.kind !== "string") {
        throw new Error(`unsupported inferred Go map key: ${key.value}`);
      }
      this.take(":");
      result[key.value] = this.parseValue();
      this.consume(",");
    }
    this.take("}");
    return result;
  }

  /** skipType consumes a nested Go type expression before a composite literal body. */
  private skipType(): void {
    let depth = 0;
    while (this.peek()) {
      if (this.peek()?.value === "{" && depth === 0) {
        return;
      }
      const value = this.next().value;
      if (value === "[" || value === "(") {
        depth += 1;
      } else if (value === "]" || value === ")") {
        depth -= 1;
      }
    }
  }

  /** consume advances past the token when it matches the requested value. */
  private consume(value: string): boolean {
    if (this.peek()?.value !== value) {
      return false;
    }
    this.index += 1;
    return true;
  }

  /** take returns the next token after verifying its value. */
  private take(value: string): GoToken {
    const token = this.next();
    if (token.value !== value) {
      throw new Error(`wanted Go token ${value}, got ${token.value}`);
    }
    return token;
  }

  /** next returns and consumes the next token. */
  private next(): GoToken {
    const token = this.tokens[this.index];
    if (!token) {
      throw new Error("unexpected end of Go value expression");
    }
    this.index += 1;
    return token;
  }

  /** peek returns the next token without consuming it. */
  private peek(): GoToken | undefined {
    return this.tokens[this.index];
  }
}

/**
 * tokenizeGoValue tokenizes the composite-literal subset present in synced prune activations.
 */
function tokenizeGoValue(source: string): GoToken[] {
  const tokens: GoToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '"') {
      let stop = index + 1;
      while (stop < source.length && (source[stop] !== '"' || source[stop - 1] === "\\")) {
        stop += 1;
      }
      tokens.push({
        kind: "string",
        value: JSON.parse(source.slice(index, stop + 1)) as string,
      });
      index = stop + 1;
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index));
    if (identifier) {
      tokens.push({ kind: "identifier", value: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    const number = /^-?[0-9]+/.exec(source.slice(index));
    if (number) {
      tokens.push({ kind: "number", value: number[0] });
      index += number[0].length;
      continue;
    }
    tokens.push({ kind: "punctuation", value: char });
    index += 1;
  }
  return tokens;
}

/**
 * splitTopLevelArgs splits a Go call argument list without splitting nested composite values.
 */
function splitTopLevelArgs(source: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (char === '"' && source[index - 1] !== "\\") {
      quoted = !quoted;
    } else if (!quoted && ["(", "[", "{"].includes(char)) {
      depth += 1;
    } else if (!quoted && [")", "]", "}"].includes(char)) {
      depth -= 1;
    } else if (!quoted && depth === 0 && char === ",") {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts.filter(Boolean);
}

/**
 * decodePattern decodes a string or chained AttributePattern expression.
 */
function decodePattern(source: string): AttributePattern {
  if (source.startsWith('"')) {
    return attributePattern(JSON.parse(source) as string);
  }
  const root = /^NewAttributePattern\(("(?:[^"\\]|\\.)*")\)/.exec(source);
  if (!root) {
    throw new Error(`unsupported attribute pattern: ${source}`);
  }
  const pattern = attributePattern(JSON.parse(root[1]!) as string);
  const operations = /\.([A-Za-z]+)\(([^()]*)\)/g;
  let operation: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: advancing RegExp.exec is the loop condition.
  while ((operation = operations.exec(source)) !== null) {
    if (operation[1] === "QualString") {
      pattern.qualString(JSON.parse(operation[2]!) as string);
    } else if (operation[1] === "Wildcard") {
      pattern.wildcard();
    } else {
      throw new Error(`unsupported attribute pattern operation: ${operation[1]}`);
    }
  }
  return pattern;
}

/**
 * decodeActivation reconstructs the activation encoded in a synced prune row.
 */
function decodeActivation(input: unknown): Activation {
  if (input === undefined || input === null) {
    return emptyActivation();
  }
  if (typeof input === "object" && !("$expr" in input)) {
    return activation({ bindings: input });
  }
  const source = (input as { $expr: string }).$expr.trim();
  if (source.startsWith("unknownActivation(")) {
    const args = splitTopLevelArgs(source.slice("unknownActivation(".length, -1));
    return partialActivation({
      bindings: {},
      unknowns: args.map((arg) => attributePattern(JSON.parse(arg) as string)),
    });
  }
  if (!source.startsWith("partialActivation(")) {
    throw new Error(`unsupported activation expression: ${source}`);
  }
  const args = splitTopLevelArgs(source.slice("partialActivation(".length, -1));
  const bindings = new GoValueParser(tokenizeGoValue(args[0]!)).parseValue();
  return partialActivation({
    bindings,
    unknowns: args.slice(1).map(decodePattern),
  });
}

/**
 * runtimeDispatcher builds a dispatcher containing the standard and prune-test optional bindings.
 */
function runtimeDispatcher() {
  const runtime = dispatcher();
  const optionalFunctions = [
    func("optional.none", {
      overloads: [overload("optional_none", [], OptionalType)],
      singletonBinding: { func: () => OptionalNone },
    }),
    func("optional.of", {
      overloads: [overload("optional_of_value", [DynType], OptionalType)],
      singletonBinding: { unary: (value) => optionalOf(value) },
    }),
    func("last", {
      overloads: [overload("list_last", [ListType], OptionalType)],
      singletonBinding: {
        unary: (value) => {
          const list = value as Val & { size(): Val; get(index: Val): Val };
          const size = Number((list.size() as Int).value());
          return size === 0 ? OptionalNone : optionalOf(list.get(new Int(BigInt(size - 1))));
        },
      },
    }),
  ];
  for (const fn of [...standardFunctions(), ...optionalFunctions]) {
    const bindings = fn.bindings();
    if (bindings.length > 0) {
      runtime.add({ overloads: bindings });
    }
  }
  return runtime;
}

/**
 * evaluateForState evaluates the parsed expression while recording all values used by pruning.
 */
function evaluateForState(exprAst: AST, vars: Activation) {
  const state = evalState();
  const reg = registry([
    create(TestAllTypesSchema, {
      singleInt32: 0,
      singleInt64: 0n,
    }),
    TestAllTypesSchema,
  ]);
  const runtimeInterpreter = interpreter({
    dispatcher: runtimeDispatcher(),
    container: defaultContainer,
    provider: reg,
    adapter: reg,
    attrFactory: partialAttributeFactory({
      containerValue: defaultContainer,
      adapter: reg,
      provider: reg,
    }),
  });
  const evaluate = (candidate: AST) => {
    runtimeInterpreter
      .interpretable({
        exprAst: candidate,
        plannerConfig: evalStateObserverConfig({ factory: () => state }),
      })
      .eval(vars);
  };
  evaluate(exprAst);

  // Exhaustive evaluation observes both conditional branches so each can be residualized safely.
  const expressions = [exprAst.expr()];
  while (expressions.length > 0) {
    const expression = expressions.shift()!;
    const call = expression.asCall();
    if (
      expression.kind() === ExprKind.Call &&
      call?.functionName() === "_?_:_" &&
      call.args().length === 3
    ) {
      evaluate(ast(call.args()[1]!, exprAst.sourceInfo()));
      evaluate(ast(call.args()[2]!, exprAst.sourceInfo()));
    }
    if (expression.kind() !== ExprKind.Comprehension) {
      expressions.push(...expression.children());
    }
  }

  return state;
}

/**
 * canonicalSource parses and unparses CEL source so formatting differences do not affect comparisons.
 */
function canonicalSource(source: string): string {
  return unparse(parse(source, { enableOptionalSyntax: true, populateMacroCalls: true }));
}

/**
 * prune_test.go coverage tracks the upstream prune tests.
 */
describe("interpreter/prune_test.go", () => {
  /**
   * TestPrune tracks the upstream prune coverage.
   */
  describe("interpreter/prune_test.go/TestPrune", () => {
    const cases = syncedCases<SyncedPruneCase>("interpreter/prune_test.go/TestPrune");
    for (const [index, testCase] of cases.entries()) {
      it(`case ${index}: ${testCase.expr}`, () => {
        const parsed = parse(testCase.expr, {
          enableOptionalSyntax: true,
          populateMacroCalls: true,
        });
        const state = evaluateForState(parsed, decodeActivation(testCase.in));
        const pruned = pruneAst({
          expr: parsed.expr(),
          macroCalls: parsed.sourceInfo().macroCalls(),
          state,
        });

        if (testCase.iterRange !== undefined) {
          expect(pruned.expr().asComprehension()).toBeDefined();
          expect(canonicalSource(unparse(pruned.expr().asComprehension()!.iterRange()))).toBe(
            canonicalSource(testCase.iterRange),
          );
        }
        expect(canonicalSource(unparse(pruned))).toBe(canonicalSource(testCase.out));
      });
    }
  });
});
