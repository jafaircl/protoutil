import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { optionalTypes } from "../cel/library.js";
import { variableDecl } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { StringType } from "../common/types/types.js";
import { regex } from "./regex.js";

/** RegexCase describes a synchronized regular-expression expression. */
interface RegexCase {
  /** err contains the expected compile-time or runtime error fragment. */
  err?: string;
  /** expr contains the CEL expression under test. */
  expr: string;
}

describe("ext/regex_test.go/TestRegex", () => {
  it("evaluates every synchronized regular-expression case", () => {
    const celEnv = regexEnv();
    for (const testCase of syncedCases<RegexCase>("ext/regex_test.go/TestRegex")) {
      expect(celEnv.program(celEnv.compile(testCase.expr)).eval({}).value(), testCase.expr).toBe(
        true,
      );
    }
  });

  it("executes valid RE2 inline flag syntax outside the synchronized fixtures", () => {
    const celEnv = regexEnv();
    expect(
      celEnv
        .program(celEnv.compile(`regex.extract("CaseInsensitive", "(?i)caseinsensitive")`))
        .eval({})
        .value(),
    ).toBe("CaseInsensitive");
  });
});

describe("ext/regex_test.go/TestRegexStaticErrors", () => {
  it("reports every synchronized checker error", () => {
    const celEnv = regexEnv();
    for (const testCase of syncedCases<RegexCase>("ext/regex_test.go/TestRegexStaticErrors")) {
      expect(celEnv.tryCompile(testCase.expr).errors?.toDisplayString(), testCase.expr).toContain(
        testCase.err,
      );
    }
  });
});

describe("ext/regex_test.go/TestRegexRuntimeErrors", () => {
  it("reports every synchronized runtime error", () => {
    const celEnv = regexEnv();
    for (const testCase of syncedCases<RegexCase>("ext/regex_test.go/TestRegexRuntimeErrors")) {
      const result = celEnv.program(celEnv.compile(testCase.expr)).eval({});
      expect(String(result), testCase.expr).toContain(testCase.err);
    }
  });

  it("preserves RE2 diagnostics for other malformed patterns without duplicating prefixes", () => {
    const celEnv = regexEnv();
    for (const [pattern, expected] of [
      ["[", "Err: error parsing regexp: missing closing ]: `[`"],
      ["*", "Err: error parsing regexp: missing argument to repetition operator: `*`"],
    ]) {
      const expression = `regex.extract("input", ${JSON.stringify(pattern)})`;
      expect(String(celEnv.program(celEnv.compile(expression)).eval({})), pattern).toBe(expected);
    }
  });
});

describe("ext/regex_test.go/TestRegexEnvCreationErrors", () => {
  it("requires optional types to be configured before regex", () => {
    expect(() => env({ libraries: [regex()] })).toThrow("requires the optional library");
    expect(() => env({ libraries: [regex(), optionalTypes()] })).toThrow(
      "requires the optional library",
    );
  });
});

describe("ext/regex_test.go/TestRegexVersion", () => {
  it("accepts version zero", () => {
    expect(() => regexEnv(0)).not.toThrow();
  });
});

describe("ext/regex_test.go/TestRegexCosts", () => {
  it("evaluates every synchronized cost expression", () => {
    const celEnv = regexEnv();
    for (const testCase of syncedCases<RegexCase>("ext/regex_test.go/TestRegexCosts")) {
      expect(celEnv.program(celEnv.compile(testCase.expr)).eval({}).value(), testCase.expr).toBe(
        true,
      );
    }
  });
});

describe("ext/regex_test.go/TestRegexProgramSizeLimit", () => {
  it("limits dynamic patterns for every regex extension overload", () => {
    const celEnv = env({
      libraries: [optionalTypes(), regex()],
      regexProgramSizeLimit: 5,
      variables: [variableDecl("pat", StringType)],
    });
    for (const expression of [
      `'a1'.matches(pat)`,
      `regex.extract('a1', pat)`,
      `regex.extractAll('a1', pat)`,
      `regex.replace('a1', pat, 'x')`,
      `regex.replace('a1', pat, 'x', 1)`,
    ]) {
      const program = celEnv.program(celEnv.compile(expression));
      expect(String(program.eval({ pat: "(a|b)*[0-9]+" })), expression).toContain(
        "regex program size 8 exceeds limit of 5",
      );
      expect(String(program.eval({ pat: "a[0-9]" })), expression).not.toContain("exceeds limit");
    }
  });
});

/** regexEnv creates the optional-enabled regular-expression environment. */
function regexEnv(version?: number) {
  return env({
    libraries: [optionalTypes(), regex({ version })],
  });
}
