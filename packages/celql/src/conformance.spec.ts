import { anyUnpack } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import {
  compileConformanceCase,
  conformanceRegistry,
  loadConformanceSuites,
} from "./conformance-fixtures.js";
import type { Expr } from "./gen/cel/expr/syntax_pb.js";
import {
  type ConformanceCase,
  ConformanceOperation,
  type ConformanceSuite,
  type ProfileExpectation,
} from "./gen/protoutil/celql/conformance/v1/conformance_pb.js";
import type { ProfileReference } from "./gen/protoutil/celql/v1/celql_pb.js";
import { TranslationErrorCode } from "./gen/protoutil/celql/v1/celql_pb.js";
import {
  AnsiSqlDialect,
  CelqlError,
  createTranslator,
  type DialectConstructor,
  PostgreSqlDialect,
  type TranslationOutcome,
} from "./index.js";

const ansiProfile = {
  name: "protoutil.celql.ansisql",
  majorVersion: 1,
} as const;
const availableDialects: DialectConstructor[] = [AnsiSqlDialect, PostgreSqlDialect];

interface Execution {
  name: string;
  suite: ConformanceSuite;
  testCase: ConformanceCase;
  profile?: ProfileReference;
  profileConfiguration?: ProfileExpectation["profileConfiguration"];
  expected: ProfileExpectation["expected"];
  limits?: ProfileExpectation["limits"];
}

type ExecutionResult =
  | { case: "success"; outcome?: TranslationOutcome }
  | { case: "error"; error: CelqlError };

function execute(execution: Execution) {
  const checkedExpression = compileConformanceCase(execution.suite, execution.testCase);
  try {
    const translator = createTranslator(resolveProfile(execution.profile));
    const request = {
      checkedExpression,
      limits: execution.limits,
      profileConfiguration: execution.profileConfiguration,
    };
    if (execution.testCase.operation === ConformanceOperation.VALIDATE) {
      translator.validate(request);
      return { checkedExpression, result: { case: "success" } as ExecutionResult };
    }
    return {
      checkedExpression,
      result: {
        case: "success",
        outcome: translator.translate(request),
      } as ExecutionResult,
    };
  } catch (error) {
    if (!(error instanceof CelqlError)) {
      throw error;
    }
    return { checkedExpression, result: { case: "error", error } as ExecutionResult };
  }
}

function assertExpected(execution: Execution): ExecutionResult {
  const { checkedExpression, result } = execute(execution);
  const expected = execution.expected;
  if (expected.case === "error") {
    expect(result).toMatchObject({ case: "error", error: { code: expected.value.code } });
    if (result.case === "error" && expected.value.expressionNodeId !== undefined) {
      expect(result.error.expressionNodeId).toBe(expected.value.expressionNodeId);
    }
    if (result.case === "error") {
      const diagnostics = [result.error.message, ...Object.values(result.error.details)].join("\n");
      for (const constant of sensitiveConstants(checkedExpression.expr)) {
        expect(diagnostics).not.toContain(constant);
      }
    }
    return result;
  }

  expect(expected.case).toBe("success");
  expect(result.case).toBe("success");
  if (result.case !== "success" || expected.case !== "success") {
    return result;
  }
  switch (expected.value.outcome.case) {
    case "valid":
      expect(execution.testCase.operation).toBe(ConformanceOperation.VALIDATE);
      break;
    case "matchAll":
      expect(result.outcome).toMatchObject({ case: "matchAll" });
      break;
    case "matchNone":
      expect(result.outcome).toMatchObject({ case: "matchNone" });
      break;
    case "predicateProduced":
      expect(result.outcome).toMatchObject({ case: "predicate" });
      break;
    case "exactPredicate": {
      expect(result.outcome).toMatchObject({ case: "predicate" });
      if (result.outcome?.case === "predicate") {
        expect(result.outcome.value).toEqual(
          anyUnpack(expected.value.outcome.value, conformanceRegistry),
        );
      }
      break;
    }
    default:
      throw new Error(`${execution.name} has no expected success outcome`);
  }
  if (result.outcome?.case === "predicate") {
    const capability = createTranslator(resolveProfile(execution.profile)).capability();
    expect(result.outcome.value.$typeName).toBe(capability.outputTypeName);
  }
  return result;
}

function resolveProfile(reference: ProfileReference | undefined): DialectConstructor {
  const requested = reference ?? ansiProfile;
  const profile = availableDialects.find(
    (candidate) => candidate.capability.profile?.name === requested.name,
  );
  if (profile === undefined) {
    throw new CelqlError(TranslationErrorCode.UNSUPPORTED_PROFILE, {
      message: `The profile ${requested.name} is not available to this conformance runner.`,
    });
  }
  if (requested.majorVersion !== profile.capability.profile?.majorVersion) {
    throw new CelqlError(TranslationErrorCode.UNSUPPORTED_PROFILE_VERSION, {
      message: `The profile version ${requested.majorVersion} is not available to this conformance runner.`,
    });
  }
  return profile;
}

function sensitiveConstants(root: Expr | undefined): string[] {
  const values: string[] = [];
  const stack = root === undefined ? [] : [root];
  while (stack.length > 0) {
    const expression = stack.pop()!;
    switch (expression.exprKind.case) {
      case "constExpr":
        if (expression.exprKind.value.constantKind.case === "stringValue") {
          values.push(expression.exprKind.value.constantKind.value);
        } else if (expression.exprKind.value.constantKind.case === "bytesValue") {
          values.push(Buffer.from(expression.exprKind.value.constantKind.value).toString("utf8"));
        }
        break;
      case "selectExpr":
        if (expression.exprKind.value.operand !== undefined) {
          stack.push(expression.exprKind.value.operand);
        }
        break;
      case "callExpr":
        stack.push(...expression.exprKind.value.args);
        if (expression.exprKind.value.target !== undefined) {
          stack.push(expression.exprKind.value.target);
        }
        break;
      case "listExpr":
        stack.push(...expression.exprKind.value.elements);
        break;
      case "structExpr":
        for (const entry of expression.exprKind.value.entries) {
          if (entry.value !== undefined) stack.push(entry.value);
          if (entry.keyKind.case === "mapKey") stack.push(entry.keyKind.value);
        }
        break;
      case "comprehensionExpr": {
        const comprehension = expression.exprKind.value;
        for (const child of [
          comprehension.iterRange,
          comprehension.accuInit,
          comprehension.loopCondition,
          comprehension.loopStep,
          comprehension.result,
        ]) {
          if (child !== undefined) stack.push(child);
        }
        break;
      }
    }
  }
  return values.filter((value) => value.length >= 8);
}

const suites = loadConformanceSuites();
const executions = suites.flatMap((suite) =>
  suite.cases.flatMap((testCase) =>
    testCase.expected.map((profileExpectation, expectationIndex) => ({
      name: `${suite.name}/${testCase.name}/${profileExpectation.profile?.name ?? "runner-selected"}/${expectationIndex}`,
      suite,
      testCase,
      ...profileExpectation,
    })),
  ),
);

describe("celql conformance", () => {
  it("loads the complete published corpus", () => {
    expect(suites.flatMap((suite) => suite.cases)).toHaveLength(149);
    expect(executions).toHaveLength(252);
  });

  it("executes every profile expectation attached to a shared input", () => {
    const expectationCount = suites.reduce(
      (count, suite) =>
        count +
        suite.cases.reduce((caseCount, testCase) => caseCount + testCase.expected.length, 0),
      0,
    );
    expect(executions).toHaveLength(expectationCount);
  });

  it("uses CEL source for every successful predicate expectation", () => {
    const violations = suites.flatMap((suite) =>
      suite.cases
        .filter(
          (testCase) =>
            testCase.input.case !== "celSource" &&
            testCase.expected.some(
              (profileExpectation) =>
                profileExpectation.expected.case === "success" &&
                profileExpectation.expected.value.outcome.case === "exactPredicate",
            ),
        )
        .map((testCase) => `${suite.name}/${testCase.name}`),
    );
    expect(violations).toEqual([]);
  });

  for (const execution of executions) {
    it(execution.name, () => {
      const first = assertExpected(execution);
      const second = assertExpected(execution);
      expect(second).toEqual(first);
    });
  }

  it("is independent of case order", () => {
    const forward = new Map(
      executions.map((execution) => [execution.name, assertExpected(execution)]),
    );
    const reverse = new Map(
      [...executions].reverse().map((execution) => [execution.name, assertExpected(execution)]),
    );
    expect(reverse).toEqual(forward);
  });

  it("rejects unsupported versions and reserved capability identifiers", () => {
    for (const dialect of availableDialects) {
      const capability = createTranslator(dialect).capability();
      expect(
        capability.operations.some((operation) =>
          operation.overloadId.startsWith("celql.reserved.unsupported."),
        ),
      ).toBe(false);
      expect(() =>
        resolveProfile({
          $typeName: "protoutil.celql.v1.ProfileReference",
          name: capability.profile!.name,
          majorVersion: capability.profile!.majorVersion + 10_000,
        }),
      ).toThrow(
        expect.objectContaining({ code: TranslationErrorCode.UNSUPPORTED_PROFILE_VERSION }),
      );
    }
  });
});
