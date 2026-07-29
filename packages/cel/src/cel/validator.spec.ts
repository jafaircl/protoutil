import { describe, expect, it } from "vitest";
import { variableDecl } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { StringType } from "../common/types/types.js";
import { env } from "./env.js";
import { optionalTypes } from "./library.js";
import {
  extendedValidations,
  HomogeneousAggregateLiteralExemptFunctions,
  validateComprehensionNestingLimit,
  validateDurationLiterals,
  validateHomogeneousAggregateLiterals,
  validateRegexLiterals,
  validateTimestampLiterals,
  validatorConfig,
} from "./validator.js";

/**
 * ValidatorCase is a synced validator expression and its optional expected issue.
 */
interface ValidatorCase {
  /** Expr is the CEL source validated by the test. */
  expr: string;
  /** Iss is the expected upstream diagnostic when validation should fail. */
  iss?: string;
}

/**
 * ExpectValidationCases compiles synced cases and checks whether validators report an issue.
 */
function expectValidationCases(options: {
  /** Cases contains the synced upstream validator rows. */
  cases: ValidatorCase[];
  /** Environment compiles each expression with the validator under test. */
  environment: ReturnType<typeof env>;
}): void {
  for (const testCase of options.cases) {
    const result = options.environment.tryCompile(testCase.expr);
    if (testCase.iss === undefined) {
      expect(result.errors, testCase.expr).toBeUndefined();
    } else {
      expect(result.errors?.toDisplayString(), testCase.expr).toContain(
        testCase.iss.match(/(?:invalid|expected type|comprehension exceeds)[^\n]*/)?.[0],
      );
    }
  }
}

describe("cel/validator_test.go/TestValidateDurationLiterals", () => {
  it("validates constant duration arguments", () => {
    expectValidationCases({
      cases: syncedCases("cel/validator_test.go/TestValidateDurationLiterals"),
      environment: env({
        variables: [variableDecl("x", StringType)],
        validators: [validateDurationLiterals()],
      }),
    });
  });
});

describe("cel/validator_test.go/TestValidateTimestampLiterals", () => {
  it("validates constant timestamp arguments", () => {
    expectValidationCases({
      cases: syncedCases("cel/validator_test.go/TestValidateTimestampLiterals"),
      environment: env({
        variables: [variableDecl("x", StringType)],
        validators: [validateTimestampLiterals()],
      }),
    });
  });
});

describe("cel/validator_test.go/TestValidateRegexLiterals", () => {
  it("validates constant regular-expression arguments", () => {
    expectValidationCases({
      cases: syncedCases("cel/validator_test.go/TestValidateRegexLiterals"),
      environment: env({
        variables: [variableDecl("x", StringType)],
        validators: [validateRegexLiterals()],
      }),
    });
  });
});

describe("cel/validator_test.go/TestValidateHomogeneousAggregateLiterals", () => {
  it("rejects mixed list elements, map keys, and map values", () => {
    expectValidationCases({
      cases: syncedCases("cel/validator_test.go/TestValidateHomogeneousAggregateLiterals"),
      environment: env({
        variables: [variableDecl("name", StringType)],
        libraries: [optionalTypes()],
        validators: [validateHomogeneousAggregateLiterals()],
      }),
    });
  });
});

describe("cel/validator_test.go/TestValidateComprehensionNestingLimit", () => {
  it("rejects comprehensions nested beyond the configured limit", () => {
    expectValidationCases({
      cases: syncedCases("cel/validator_test.go/TestValidateComprehensionNestingLimit"),
      environment: env({
        validators: [validateComprehensionNestingLimit(2)],
      }),
    });
  });
});

describe("cel/validator_test.go/TestExtendedValidations", () => {
  it("applies all common AST validations", () => {
    expectValidationCases({
      cases: syncedCases("cel/validator_test.go/TestExtendedValidations"),
      environment: env({
        variables: [variableDecl("x", StringType)],
        validators: extendedValidations(),
      }),
    });
  });
});

describe("cel/validator_test.go/TestValidatorConfig", () => {
  it("preserves configuration value types", () => {
    const config = validatorConfig();
    expect(config.getOrDefault("ext.validate.custom", 2)).toBe(2);
    expect(config.getOrDefault(HomogeneousAggregateLiteralExemptFunctions, [])).toEqual([]);

    config.set(HomogeneousAggregateLiteralExemptFunctions, ["_==_"]);
    expect(() => config.set(HomogeneousAggregateLiteralExemptFunctions, { invalid: true })).toThrow(
      "incompatible configuration type",
    );
  });
});
