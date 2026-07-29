import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { syncedCases } from "../common/spec-helpers.js";
import { isError } from "../common/types/err.js";
import { encoders } from "./encoders.js";

/** EncoderCase describes one synchronized cel-go encoder test row. */
interface EncoderCase {
  /** err contains the expected CEL error fragment. */
  err?: string;
  /** expr contains the CEL source under test. */
  expr: string;
  /** parseOnly evaluates the unchecked AST when the expression is intentionally ill-typed. */
  parseOnly?: boolean;
}

describe("ext/encoders_test.go/TestEncoders", () => {
  it("evaluates every synced encoder case", () => {
    const celEnv = env({ libraries: [encoders()] });
    for (const testCase of syncedCases<EncoderCase>("ext/encoders_test.go/TestEncoders")) {
      const ast = testCase.parseOnly ? celEnv.parse(testCase.expr) : celEnv.compile(testCase.expr);
      const result = celEnv.program(ast).eval({});
      if (testCase.err !== undefined) {
        expect(isError(result), testCase.expr).toBe(true);
        expect(String(result), testCase.expr).toContain(testCase.err);
      } else {
        expect(result.value(), testCase.expr).toBe(true);
      }
    }
  });
});

describe("ext/encoders_test.go/TestEncodersVersion", () => {
  it("gates JSON encoding at version one", () => {
    const versionZero = env({ libraries: [encoders({ version: 0 })] });
    expect(versionZero.tryCompile("base64.encode(b'hello')").errors).toBeUndefined();
    expect(versionZero.tryCompile("json.encode('hello')").errors).toBeDefined();

    const versionOne = env({ libraries: [encoders({ version: 1 })] });
    expect(versionOne.tryCompile("json.encode('hello')").errors).toBeUndefined();
  });
});
