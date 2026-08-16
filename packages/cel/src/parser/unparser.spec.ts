import { NullValue } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { unwrapAst } from "../cel/env.js";
import { protoToExpr, type SourceInfo, sourceInfo } from "../common/ast/index.js";
import * as operators from "../common/operators.js";
import { syncedCases } from "../common/spec-helpers.js";
import type { Expr as ProtoExpr } from "../gen/cel/expr/syntax_pb.js";
import {
  type ParserConfig,
  parse,
  parser,
  tryUnparse,
  type UnparserConfig,
  unparse,
} from "./index.js";

type UnparseCase = {
  in: string;
  name: string;
  out?: string | { $expr?: string };
  requiresMacroCalls?: boolean;
  unparserOptions?: { $expr?: string }[];
};

type UnparseErrorCase = {
  in: { $expr?: string };
  name: string;
  err: { $expr?: string };
  unparserOptions?: { $expr?: string }[];
};

const UPSTREAM_OPERATOR_NAMES: Record<string, string> = {
  Add: operators.Add,
  Conditional: operators.Conditional,
  Divide: operators.Divide,
  Equals: operators.Equals,
  Greater: operators.Greater,
  GreaterEquals: operators.GreaterEquals,
  In: operators.In,
  Less: operators.Less,
  LessEquals: operators.LessEquals,
  LogicalAnd: operators.LogicalAnd,
  LogicalOr: operators.LogicalOr,
  Modulo: operators.Modulo,
  Multiply: operators.Multiply,
  Negate: operators.Negate,
  NotEquals: operators.NotEquals,
  Subtract: operators.Subtract,
};

describe("parser/unparser_test.go", () => {
  describe("TestUnparse", () => {
    const rows = syncedCases<UnparseCase>("parser/unparser_test.go/TestUnparse");
    for (const row of rows) {
      it(row.name, () => {
        const celParser = parser(parserConfigFor(row));
        const parsed = unwrapAst(celParser.parse(row.in));

        const output = unparse(parsed, unparserConfigFor(row.unparserOptions ?? []));
        expect(output).toBe(resolveExpectedUnparse(row.out, row.in));

        const roundTripped = unwrapAst(celParser.parse(output));
        expect(roundTripped.expr().toProto()).toEqual(parsed.expr().toProto());
      });
    }
  });

  describe("TestUnparseErrors", () => {
    const rows = syncedCases<UnparseErrorCase>("parser/unparser_test.go/TestUnparseErrors");
    for (const row of rows) {
      it(row.name, () => {
        expect(() => {
          unparse(
            protoToExpr(resolveProtoExprCase(row.in)),
            resolveSourceInfoCase(row.in),
            unparserConfigFor(row.unparserOptions ?? []),
          );
        }).toThrow(resolveExpectedError(row.err));
      });
    }
  });

  describe("parse / unparse convenience helpers", () => {
    it("exports idiomatic top-level parse and unparse helpers", () => {
      const parsed = unwrapAst(parse("a + b * c"));
      expect(parsed.toParsedExpr().expr).toBeDefined();
      expect(unparse(parsed)).toBe("a + b * c");
    });

    it("reports parse diagnostics from the top-level parse helper", () => {
      const parsed = parse("a + b * c");
      expect(parsed.errors).toBeUndefined();
      expect(parsed.ast.toParsedExpr().expr).toBeDefined();
    });

    it("exports a non-throwing top-level tryUnparse helper", () => {
      const parsed = unwrapAst(parse("a + b * c"));
      const result = tryUnparse(parsed);
      expect(result.error).toBeUndefined();
      expect(result.source).toBe("a + b * c");
    });
  });
});

/**
 * parserConfigFor matches the upstream parser settings used by cel-go unparser tests.
 */
function parserConfigFor(row: UnparseCase): ParserConfig {
  return {
    populateMacroCalls: row.requiresMacroCalls ?? false,
    enableOptionalSyntax: true,
    enableIdentEscapeSyntax: true,
  };
}

/**
 * unparserConfigFor resolves synced upstream option strings to local unparser config.
 */
function unparserConfigFor(options: { $expr?: string }[]): UnparserConfig {
  const config: UnparserConfig = {};
  for (const option of options) {
    applyUnparserOption(config, option.$expr);
  }
  return config;
}

/**
 * applyUnparserOption decodes one synced upstream unparser option expression.
 */
function applyUnparserOption(config: UnparserConfig, expr: string | undefined): void {
  if (!expr) {
    throw new Error("unsupported unparser option expr: undefined");
  }

  const wrapOnColumn = /^WrapOnColumn\((-?\d+)\)$/.exec(expr);
  if (wrapOnColumn) {
    config.wrapOnColumn = Number(wrapOnColumn[1]);
    return;
  }

  const wrapAfterColumnLimit = /^WrapAfterColumnLimit\((true|false)\)$/.exec(expr);
  if (wrapAfterColumnLimit) {
    config.wrapAfterColumnLimit = wrapAfterColumnLimit[1] === "true";
    return;
  }

  const wrapOnOperators = /^WrapOnOperators\(([\s\S]*)\)$/.exec(expr);
  if (wrapOnOperators) {
    config.operatorsToWrapOn = splitUnparserOptionArgs(wrapOnOperators[1]!).map(
      resolveOperatorExpr,
    );
    return;
  }

  throw new Error(`unsupported unparser option expr: ${expr}`);
}

/**
 * splitUnparserOptionArgs splits a simple comma-delimited upstream option arg list.
 */
function splitUnparserOptionArgs(source: string): string[] {
  return source
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * resolveOperatorExpr maps upstream option argument text to the local operator symbol.
 */
function resolveOperatorExpr(expr: string): string {
  if (expr.startsWith('"') && expr.endsWith('"')) {
    return expr.slice(1, -1);
  }
  const match = /^operators\.([A-Za-z]+)$/.exec(expr);
  if (!match) {
    throw new Error(`unsupported operator expr: ${expr}`);
  }
  const operator = UPSTREAM_OPERATOR_NAMES[match[1]!];
  if (!operator) {
    throw new Error(`unsupported operator expr: ${expr}`);
  }
  return operator;
}

/**
 * resolveExpectedUnparse evaluates the synced upstream expected-output encoding.
 */
function resolveExpectedUnparse(
  value: string | { $expr?: string } | undefined,
  fallback: string,
): string {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "string") {
    return value;
  }
  switch (value.$expr) {
    case '`"my-principal-group" in request.auth.claims &&` + "\\n" + `request.auth.claims.iat > now - duration("5m")`':
      return `"my-principal-group" in request.auth.claims &&\nrequest.auth.claims.iat > now - duration("5m")`;
    case '`"my-principal-group" in request.auth.claims` + "\\n" + `&& request.auth.claims.iat > now - duration("5m")`':
      return `"my-principal-group" in request.auth.claims\n&& request.auth.claims.iat > now - duration("5m")`;
    case `\`jwt.extra_claims.filter(c, c.startsWith("group")).all(c, jwt.extra_claims[c].all(g, g.endsWith("@acme.co"))) &&\` +\n\t\t\t\t"\\n" +\n\t\t\t\t\`jwt.extra_claims.exists(c, c.startsWith("group")) || request.auth.claims.group == "admin" ||\` +\n\t\t\t\t"\\n" +\n\t\t\t\t\`request.auth.principal == "user:me@acme.co"\``:
      return (
        'jwt.extra_claims.filter(c, c.startsWith("group")).all(c, jwt.extra_claims[c].all(g, g.endsWith("@acme.co"))) &&\n' +
        'jwt.extra_claims.exists(c, c.startsWith("group")) || request.auth.claims.group == "admin" ||\n' +
        'request.auth.principal == "user:me@acme.co"'
      );
    default:
      throw new Error(`unsupported unparse expectation expr: ${value.$expr}`);
  }
}

/**
 * resolveExpectedError decodes the upstream error literal into its message text.
 */
function resolveExpectedError(value: { $expr?: string }): string {
  if (
    value.$expr ===
    'errors.New("Invalid unparser option. Unary operators are unsupported: " + operators.Negate)'
  ) {
    return "Invalid unparser option. Unary operators are unsupported: -_";
  }
  const match = /^errors\.New\("([\s\S]*)"\)$/.exec(value.$expr ?? "");
  if (!match) {
    throw new Error(`unsupported error expr: ${value.$expr}`);
  }
  return match[1]!;
}

/**
 * resolveProtoExprCase builds the protobuf expressions used by the upstream error tests.
 */
function resolveProtoExprCase(value: { $expr?: string }): ProtoExpr | undefined {
  switch (value.$expr) {
    case "&exprpb.Expr{}":
      return undefined;
    case "validConstantExpression":
      return {
        $typeName: "cel.expr.Expr",
        id: 0n,
        exprKind: {
          case: "constExpr",
          value: {
            $typeName: "cel.expr.Constant",
            constantKind: { case: "nullValue", value: NullValue.NULL_VALUE },
          },
        },
      };
    default:
      if (value.$expr?.includes('Function: "_&&_"')) {
        return {
          $typeName: "cel.expr.Expr",
          id: 0n,
          exprKind: {
            case: "callExpr",
            value: {
              $typeName: "cel.expr.Expr.Call",
              function: "_&&_",
              args: [
                { $typeName: "cel.expr.Expr", id: 0n, exprKind: { case: undefined } },
                { $typeName: "cel.expr.Expr", id: 0n, exprKind: { case: undefined } },
              ],
            },
          },
        };
      }
      if (value.$expr?.includes('Function: "_[_]"')) {
        return {
          $typeName: "cel.expr.Expr",
          id: 0n,
          exprKind: {
            case: "callExpr",
            value: {
              $typeName: "cel.expr.Expr.Call",
              function: "_[_]",
              args: [
                { $typeName: "cel.expr.Expr", id: 0n, exprKind: { case: undefined } },
                { $typeName: "cel.expr.Expr", id: 0n, exprKind: { case: undefined } },
              ],
            },
          },
        };
      }
      if (value.$expr?.includes('MessageName: "Msg"')) {
        return {
          $typeName: "cel.expr.Expr",
          id: 0n,
          exprKind: {
            case: "structExpr",
            value: {
              $typeName: "cel.expr.Expr.CreateStruct",
              messageName: "Msg",
              entries: [
                {
                  $typeName: "cel.expr.Expr.CreateStruct.Entry",
                  id: 0n,
                  keyKind: { case: "fieldKey", value: "field" },
                  optionalEntry: false,
                },
              ],
            },
          },
        };
      }
      if (value.$expr?.includes("Entries: []*exprpb.Expr_CreateStruct_Entry")) {
        return {
          $typeName: "cel.expr.Expr",
          id: 0n,
          exprKind: {
            case: "structExpr",
            value: {
              $typeName: "cel.expr.Expr.CreateStruct",
              messageName: "",
              entries: [
                {
                  $typeName: "cel.expr.Expr.CreateStruct.Entry",
                  id: 0n,
                  keyKind: { case: "fieldKey", value: "field" },
                  optionalEntry: false,
                },
              ],
            },
          },
        };
      }
      throw new Error(`unsupported proto expr case: ${value.$expr}`);
  }
}

/**
 * resolveSourceInfoCase supplies source info for error tests that only need macro lookup defaults.
 */
function resolveSourceInfoCase(_value: { $expr?: string }): SourceInfo {
  return sourceInfo();
}
