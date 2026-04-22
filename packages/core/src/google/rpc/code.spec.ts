import { describe, expect, it } from "vitest";
import { Code } from "../../gen/google/rpc/code_pb.js";
import { assertValidCode, codeFromString, codeToString, isValidCode } from "./code.js";

interface CodeCase {
  value: Code | number;
  expected: Code;
}

interface InvalidCodeCase {
  value: Code | number;
  error: string;
}

interface CodeStringCase {
  input: string;
  expected: Code;
}

describe("google/rpc code helpers", () => {
  it("validates protobuf code enum values", () => {
    const cases: CodeCase[] = [
      { value: Code.OK, expected: Code.OK },
      { value: Code.CANCELLED, expected: Code.CANCELLED },
      { value: Code.UNKNOWN, expected: Code.UNKNOWN },
      { value: Code.INVALID_ARGUMENT, expected: Code.INVALID_ARGUMENT },
      { value: Code.NOT_FOUND, expected: Code.NOT_FOUND },
      { value: Code.PERMISSION_DENIED, expected: Code.PERMISSION_DENIED },
      { value: Code.UNAUTHENTICATED, expected: Code.UNAUTHENTICATED },
      { value: Code.DATA_LOSS, expected: Code.DATA_LOSS },
      { value: 14, expected: Code.UNAVAILABLE },
    ];

    for (const tc of cases) {
      expect(() => assertValidCode(tc.value)).not.toThrow();
      expect(tc.value).toBe(tc.expected);
    }
  });

  it("rejects invalid code enum values", () => {
    const cases: InvalidCodeCase[] = [
      { value: -1, error: "invalid google.rpc.Code value" },
      { value: 17, error: "invalid google.rpc.Code value" },
      { value: 1.5, error: "not an integer" },
    ];

    for (const tc of cases) {
      expect(() => assertValidCode(tc.value)).toThrow(tc.error);
    }
  });

  it("parses and formats canonical code names", () => {
    const cases: CodeStringCase[] = [
      { input: "OK", expected: Code.OK },
      { input: "cancelled", expected: Code.CANCELLED },
      { input: " unknown ", expected: Code.UNKNOWN },
      { input: "INVALID_ARGUMENT", expected: Code.INVALID_ARGUMENT },
      { input: "not_found", expected: Code.NOT_FOUND },
      { input: "unauthenticated", expected: Code.UNAUTHENTICATED },
      { input: "DATA_LOSS", expected: Code.DATA_LOSS },
    ];

    for (const tc of cases) {
      expect(codeFromString(tc.input)).toBe(tc.expected);
      expect(codeToString(tc.expected)).toBe(codeToString(codeFromString(tc.input)));
    }
  });

  it("rejects invalid code strings", () => {
    const cases = ["", "12", "NOTFOUND", "PERMISSION", "CLIENT_CLOSED_REQUEST"];

    for (const tc of cases) {
      expect(() => codeFromString(tc)).toThrow("invalid google.rpc.Code string");
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      { value: Code.INTERNAL, expected: true },
      { value: 17, expected: false },
    ];

    for (const tc of cases) {
      expect(isValidCode(tc.value)).toBe(tc.expected);
    }
  });

  it("validates raw enum values separately from helper string conversion", () => {
    const validCases = [Code.OK, Code.DEADLINE_EXCEEDED, 16];
    const invalidCases = [-1, 17, 99];

    for (const tc of validCases) {
      expect(() => assertValidCode(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidCode(tc)).toBe(false);
    }
  });
});
