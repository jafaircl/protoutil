import { describe, expect, it, vi } from "vitest";
import { env, unwrapAst } from "../cel/env.js";
import { optionalTypes } from "../cel/library.js";
import { variable } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { Err } from "../common/types/err.js";
import { StringType } from "../common/types/types.js";
import { regex } from "./regex.js";

describe("regex execution safety", () => {
  it("rejects every native overload by default before executing an adversarial pattern", () => {
    const cel = env({
      libraries: [optionalTypes(), regex()],
      variables: [variable("input", StringType), variable("pattern", StringType)],
    });
    const programs = [
      "regex.extract(input, pattern)",
      "regex.extractAll(input, pattern)",
      "regex.replace(input, pattern, 'x')",
      "regex.replace(input, pattern, 'x', 1)",
    ].map((expression) => cel.program(unwrapAst(cel.compile(expression))));
    const pattern = "(a+)+$";
    const exec = RegExp.prototype.exec;
    // Fail immediately if the dangerous matcher is reached, rather than hanging a regression run.
    const spy = vi.spyOn(RegExp.prototype, "exec").mockImplementation(function (
      this: RegExp,
      input,
    ) {
      if (this.source === pattern) {
        throw new Error("unsafe native matcher reached");
      }
      return exec.call(this, input);
    });
    try {
      for (const program of programs) {
        const result = program.eval({ input: `${"a".repeat(100_000)}!`, pattern });
        expect(result).toBeInstanceOf(Err);
        expect((result as Err).message).toContain(
          "native regex extraction and replacement are disabled",
        );
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("continues to execute CEL matches through RE2", () => {
    const cel = env({
      libraries: [optionalTypes(), regex()],
      variables: [variable("input", StringType)],
    });
    const program = cel.program(unwrapAst(cel.compile("input.matches('(a+)+$')")));
    expect(program.eval({ input: `${"a".repeat(100_000)}!` }).value()).toBe(false);
  });

  it("does not restore unsafe native execution from a serialized environment", () => {
    const original = regexEnv();
    const restored = env({
      configuration: {
        config: original.toConfig("trusted"),
        extensions: { regex: { libraries: [regex()] } },
      },
    });
    const result = restored
      .program(unwrapAst(restored.compile("regex.extract('abc', 'a')")))
      .eval({});
    expect(result).toBeInstanceOf(Err);
    expect((result as Err).message).toContain("disabled");
  });
});

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
      expect(
        celEnv
          .program(unwrapAst(celEnv.compile(testCase.expr)))
          .eval({})
          .value(),
        testCase.expr,
      ).toBe(true);
    }
  });

  it("executes valid RE2 inline flag syntax outside the synchronized fixtures", () => {
    const celEnv = regexEnv();
    expect(
      celEnv
        .program(
          unwrapAst(celEnv.compile(`regex.extract("CaseInsensitive", "(?i)caseinsensitive")`)),
        )
        .eval({})
        .value(),
    ).toBe("CaseInsensitive");
  });
});

describe("ext/regex_test.go/TestRegexStaticErrors", () => {
  it("reports every synchronized checker error", () => {
    const celEnv = regexEnv();
    for (const testCase of syncedCases<RegexCase>("ext/regex_test.go/TestRegexStaticErrors")) {
      expect(celEnv.compile(testCase.expr).errors?.toDisplayString(), testCase.expr).toContain(
        testCase.err,
      );
    }
  });
});

describe("ext/regex_test.go/TestRegexRuntimeErrors", () => {
  it("reports every synchronized runtime error", () => {
    const celEnv = regexEnv();
    for (const testCase of syncedCases<RegexCase>("ext/regex_test.go/TestRegexRuntimeErrors")) {
      const result = celEnv.program(unwrapAst(celEnv.compile(testCase.expr))).eval({});
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
      expect(String(celEnv.program(unwrapAst(celEnv.compile(expression))).eval({})), pattern).toBe(
        expected,
      );
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
      expect(
        celEnv
          .program(unwrapAst(celEnv.compile(testCase.expr)))
          .eval({})
          .value(),
        testCase.expr,
      ).toBe(true);
    }
  });
});

describe("ext/regex_test.go/TestRegexProgramSizeLimit", () => {
  it("limits dynamic patterns for every regex extension overload", () => {
    const celEnv = env({
      libraries: [optionalTypes(), regex()],
      regexProgramSizeLimit: 5,
      variables: [variable("pat", StringType)],
    });
    for (const expression of [
      `'a1'.matches(pat)`,
      `regex.extract('a1', pat)`,
      `regex.extractAll('a1', pat)`,
      `regex.replace('a1', pat, 'x')`,
      `regex.replace('a1', pat, 'x', 1)`,
    ]) {
      const program = celEnv.program(unwrapAst(celEnv.compile(expression)));
      expect(String(program.eval({ pat: "(a|b)*[0-9]+" })), expression).toContain(
        "regex program size 8 exceeds limit of 5",
      );
      expect(String(program.eval({ pat: "a[0-9]" })), expression).not.toContain("exceeds limit");
    }
  });
});

/** Run upstream compatibility fixtures with explicitly trusted patterns and inputs. */
function regexEnv(version?: number) {
  return env({
    libraries: [optionalTypes(), regex({ version, allowUnsafeNativeRegex: true })],
  });
}
