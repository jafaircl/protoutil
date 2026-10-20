import { describe, expect, it } from "vitest";
import { syncedCases } from "../spec-helpers.js";
import { compileRegexWithLimit, regexProgramSize } from "./regex.js";

/**
 * RegexProgramSizeCase mirrors a synchronized cel-go regex size row.
 */
interface RegexProgramSizeCase {
  /** hasError indicates that the pattern is invalid. */
  hasError?: boolean;
  /** minSize is the minimum instruction count expected for a valid pattern. */
  minSize: number;
  /** pattern is the RE2 expression under test. */
  pattern: string;
}

/**
 * CompileRegexWithLimitCase mirrors a synchronized cel-go limited compilation row.
 */
interface CompileRegexWithLimitCase {
  /** hasError indicates that compilation or size validation must fail. */
  hasError?: boolean;
  /** limit is the maximum permitted instruction count. */
  limit: number;
  /** pattern is the RE2 expression under test. */
  pattern: string;
}

describe("common/types/regex_test.go/TestRegexProgramSize", () => {
  it("reports synchronized RE2 instruction counts and syntax errors", () => {
    for (const testCase of syncedCases<RegexProgramSizeCase>(
      "common/types/regex_test.go/TestRegexProgramSize",
    )) {
      if (testCase.hasError) {
        expect(() => regexProgramSize(testCase.pattern)).toThrow();
      } else {
        expect(regexProgramSize(testCase.pattern)).toBeGreaterThanOrEqual(testCase.minSize);
      }
    }
  });
});

describe("common/types/regex_test.go/TestCompileRegexWithLimit", () => {
  it("enforces synchronized RE2 program-size limits", () => {
    for (const testCase of syncedCases<CompileRegexWithLimitCase>(
      "common/types/regex_test.go/TestCompileRegexWithLimit",
    )) {
      const compile = () => compileRegexWithLimit(testCase.pattern, testCase.limit);
      if (testCase.hasError) {
        expect(compile).toThrow();
      } else {
        expect(compile).not.toThrow();
      }
    }
  });
});
