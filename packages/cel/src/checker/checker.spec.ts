import { create } from "@bufbuild/protobuf";
import { TestAllTypesSchema as Proto3TestAllTypesSchema } from "@protoutil/testing/cel/proto3";
import { describe, expect, it } from "vitest";
import { AST, exprFactory, protoToExpr, sourceInfo } from "../common/ast/index.js";
import { defaultContainer } from "../common/containers.js";
import { func, overload } from "../common/decls.js";
import { textSource } from "../common/source.js";
import { syncedCases } from "../common/spec-helpers.js";
import { standardFunctions } from "../common/stdlib.js";
import { exprTypeToType, IntType, mapType, registry, StringType } from "../common/types/index.js";
import { parse } from "../parser/parser.js";
import { tryCheck } from "./checker.js";
import { env } from "./env.js";
import { print } from "./printer.js";
import {
  checkerContainer,
  checkerRegistry,
  normalizeComparisonString,
  resolveCheckerCase,
  type SyncedCheckerCase,
} from "./spec-helpers.js";

function testRegistry() {
  return registry([create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema]);
}

function standardEnv(sourceContainer = defaultContainer) {
  const checkerEnv = env(sourceContainer, testRegistry(), {
    crossTypeNumericComparisons: true,
  });
  checkerEnv.addFunctions(...standardFunctions());
  return checkerEnv;
}

describe("checker/checker", () => {
  const syncedCheckCases = syncedCases<SyncedCheckerCase>("checker/checker_test.go/TestCheck");
  for (const [index, testCase] of syncedCheckCases.entries()) {
    const name = `checker/checker_test.go/TestCheck/${index} ${testCase.in}`;
    it(name, () => {
      const resolved = resolveCheckerCase(testCase);
      const parsed = parse(resolved.input, resolved.parserConfig);
      const source = textSource(resolved.input);
      const checkerEnv = env(
        checkerContainer(resolved.sourceContainerName),
        checkerRegistry(
          resolved.checkerOptions.jsonFieldNames,
          resolved.parserConfig.enableOptionalSyntax,
        ),
        resolved.checkerOptions,
      );
      if (!resolved.disableStdEnv) {
        checkerEnv.addFunctions(...standardFunctions());
      }
      if (resolved.idents.length !== 0) {
        checkerEnv.addIdents(...resolved.idents);
      }
      if (resolved.functions.length !== 0) {
        checkerEnv.addFunctions(...resolved.functions);
      }

      const result = tryCheck(parsed, source, checkerEnv);
      const errorString = result.errors?.toDisplayString();
      if (resolved.expectedError) {
        expect(normalizeComparisonString(errorString ?? "")).toBe(
          normalizeComparisonString(resolved.expectedError),
        );
      } else {
        expect(errorString).toBeUndefined();
      }

      const actualType = result.ast.getType(parsed.expr().id());
      if (!resolved.expectedError && resolved.outputType) {
        expect(actualType).toBeDefined();
        expect(
          actualType ? exprTypeToType(actualType).isEquivalentType(resolved.outputType) : false,
        ).toBe(true);
      }

      if (resolved.output) {
        expect(normalizeComparisonString(print(result.ast.expr(), result.ast))).toBe(
          normalizeComparisonString(resolved.output),
        );
      }
    });
  }

  it("checker/checker_test.go/TestAddDuplicateDeclarations", () => {
    const checkerEnv = env(defaultContainer, testRegistry(), {
      crossTypeNumericComparisons: true,
    });
    checkerEnv.addFunctions(...standardFunctions());
    expect(() => checkerEnv.addFunctions(...standardFunctions())).not.toThrow();
  });

  it("checker/checker_test.go/TestAddEquivalentDeclarations", () => {
    const checkerEnv = standardEnv();
    const optIndex = func("optional_index", {
      overloads: [
        overload("optional_map_key_value", [mapType(IntType, StringType), IntType], StringType),
      ],
    });
    const optIndexEquiv = func("optional_index", {
      overloads: [
        overload("optional_map_key_value", [mapType(IntType, StringType), IntType], StringType),
      ],
    });
    expect(() => checkerEnv.addFunctions(optIndex)).not.toThrow();
    expect(() => checkerEnv.addFunctions(optIndexEquiv)).not.toThrow();
  });

  it("checker/checker_test.go/TestCheckErrorData", () => {
    const source = textSource("a || true");
    const parsed = parse(source.content(), { enableOptionalSyntax: true });
    const result = tryCheck(parsed, source, standardEnv());
    const errors = result.errors?.getErrors() ?? [];
    expect(errors).toHaveLength(1);
    expect(errors[0]?.exprId).toBe(1);
    expect(errors[0]?.message).toContain("undeclared reference");
  });

  it("checker/checker_test.go/TestCheckInvalidOptSelectMember", () => {
    const factory = exprFactory();
    const target = factory.struct(1, "Foo", []);
    const arg1 = factory.struct(2, "Foo", []);
    const arg2 = factory.literal(3, "field");
    const call = factory.memberCall(4, "_?._", target, arg1, arg2);
    const source = textSource("Foo{}._?._(Foo{}, 'field')");
    const parsed = new AST(call, undefined);
    const result = tryCheck(parsed, source, env(defaultContainer, registry()));
    expect(result.errors?.toDisplayString()).toContain("incorrect signature. member call");
  });

  it("checker/checker_test.go/TestCheckInvalidOptSelectMissingArg", () => {
    const factory = exprFactory();
    const arg1 = factory.struct(1, "Foo", []);
    const call = factory.call(2, "_?._", arg1);
    const source = textSource("_?._(Foo{})");
    const parsed = new AST(call, undefined);
    const result = tryCheck(parsed, source, env(defaultContainer, registry()));
    expect(result.errors?.toDisplayString()).toContain("incorrect signature. argument count: 1");
  });

  it("checker/checker_test.go/TestCheckInvalidLiteral", () => {
    const invalidDurationLiteral = protoToExpr({
      $typeName: "cel.expr.Expr",
      id: 1n,
      exprKind: {
        case: "constExpr",
        value: {
          $typeName: "cel.expr.Constant",
          constantKind: {
            case: "durationValue",
            value: { $typeName: "google.protobuf.Duration", seconds: 1n, nanos: 0 },
          },
        },
      },
    });
    const source = textSource("1s");
    const parsed = new AST(invalidDurationLiteral, sourceInfo(source));
    const result = tryCheck(parsed, source, env(defaultContainer, registry()));
    expect(result.errors?.toDisplayString()).toContain("unexpected literal type");
  });
});
