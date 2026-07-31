import { describe, expect, it } from "vitest";
import { variableDecl } from "../common/decls.js";
import { Config, Validator as ConfigValidator } from "../common/env/env.js";
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
  validateRegexProgramSizeLimit,
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
        testCase.iss.match(
          /(?:invalid|expected type|comprehension exceeds|regex program size)[^\n]*/,
        )?.[0],
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

describe("cel/validator_test.go/TestValidateRegexProgramSizeLimit", () => {
  it("rejects literal regular expressions whose programs exceed the limit", () => {
    expectValidationCases({
      cases: syncedCases("cel/validator_test.go/TestValidateRegexProgramSizeLimit"),
      environment: env({
        variables: [variableDecl("x", StringType)],
        validators: [validateRegexProgramSizeLimit(5)],
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

describe("cel/validator_test.go/TestValidateRegexProgramSizeLimitToConfig", () => {
  it("serializes the regex program-size validator name and limit", () => {
    const config = env({ validators: [validateRegexProgramSizeLimit(5)] }).toConfig("regex");
    expect(config.validators).toContainEqual(
      expect.objectContaining({
        name: "cel.validator.regex_program_size_limit",
        config: { limit: 5 },
      }),
    );
  });
});

describe("cel/validator_test.go/TestValidateRegexProgramSizeLimitFactory", () => {
  it("restores the regex program-size validator from environment configuration", () => {
    const config = new Config("regex").addValidators(
      new ConfigValidator("cel.validator.regex_program_size_limit").setConfig({ limit: 5 }),
    );
    const restored = env({ configuration: { config } });

    expect(restored.hasValidator("cel.validator.regex_program_size_limit")).toBe(true);
    expect(restored.tryCompile(`"input".matches("abcdef")`).errors?.toDisplayString()).toContain(
      "regex program size",
    );
  });
});

describe("cel/validator_test.go/TestOverrideValidator", () => {
  it("replaces a validator by name while leaving the base environment immutable", () => {
    const expression = "[1, 2, 3].map(i, [4, 5, 6].map(j, [7, 8, 9].map(k, i * j * k)))";
    const base = env({ validators: [validateComprehensionNestingLimit(2)] });
    expect(base.tryCompile(expression).errors).toBeDefined();

    const extended = base.extend({
      validators: [validateComprehensionNestingLimit(3)],
    });
    expect(extended.tryCompile(expression).errors).toBeUndefined();
    expect(base.tryCompile(expression).errors).toBeDefined();
  });
});

describe("cel/validator_test.go/TestOverrideValidatorFromConfig", () => {
  it("replaces a validator using serialized configuration", () => {
    const config = new Config("override-validator").addValidators(
      new ConfigValidator("cel.validator.comprehension_nesting_limit").setConfig({ limit: 3 }),
    );
    const base = env({ validators: [validateComprehensionNestingLimit(2)] });
    const extended = base.extend({ configuration: { config } });

    expect(
      extended.tryCompile("[1, 2, 3].map(i, [4, 5, 6].map(j, [7, 8, 9].map(k, i * j * k)))").errors,
    ).toBeUndefined();
  });
});

describe("cel/validator_test.go/TestOverrideValidatorPreservesOrder", () => {
  it("retains a replaced validator's position", () => {
    const first = env({
      validators: [
        validateDurationLiterals(),
        validateComprehensionNestingLimit(2),
        validateTimestampLiterals(),
      ],
    });
    const second = first.extend({
      validators: [validateComprehensionNestingLimit(5)],
    });

    expect(second.validators().map((validator) => validator.name())).toEqual([
      "cel.validator.duration",
      "cel.validator.comprehension_nesting_limit",
      "cel.validator.timestamp",
    ]);
    expect(second.validators()[1]?.config?.()).toEqual({ limit: 5 });
  });
});
