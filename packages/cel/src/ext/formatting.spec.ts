import { file_test_proto3pb_test_all_types } from "@protoutil/testing/cel/proto3";
import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { container } from "../common/containers.js";
import { variable } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { True } from "../common/types/bool.js";
import { durationOf } from "../common/types/duration.js";
import { Int } from "../common/types/int.js";
import { refValMap } from "../common/types/map.js";
import { DefaultTypeAdapter, registry } from "../common/types/provider.js";
import type { Val } from "../common/types/ref/index.js";
import { String as CelString } from "../common/types/string.js";
import { DynType, objectType } from "../common/types/types.js";
import { Uint } from "../common/types/uint.js";
import { nativeField, nativeType, nativeTypes } from "./native.js";
import { strings } from "./strings.js";

/** LegacyFormatCase describes one synchronized pre-version-four formatting case. */
interface LegacyFormatCase {
  /** dynArgs contains native activation values. */
  readonly dynArgs?: Record<string, unknown>;
  /** err contains the expected error fragment. */
  readonly err?: string;
  /** expectedOutput contains the formatted output. */
  readonly expectedOutput?: string | { $expr: string };
  /** format contains the format string. */
  readonly format: string;
  /** formatArgs contains comma-separated CEL arguments. */
  readonly formatArgs?: string;
  /** locale selects the legacy numeric locale. */
  readonly locale?: string;
  /** name identifies the upstream row. */
  readonly name: string;
}

/** HeterogeneousFormatCase describes a synchronized formatting expression. */
interface HeterogeneousFormatCase {
  /** expr contains the CEL expression. */
  readonly expr: string;
  /** out contains the expected output. */
  readonly out: string;
}

/** LiteralOutputCase describes a literal round-trip row. */
interface LiteralOutputCase {
  /** expectedType contains the evaluated CEL type name. */
  readonly expectedType: string;
  /** formatLiteral contains the CEL literal. */
  readonly formatLiteral: string;
  /** name identifies the upstream row. */
  readonly name: string;
}

describe("ext/formatting_test.go/TestStringFormat", () => {
  for (const testCase of syncedCases<LegacyFormatCase>("ext/formatting_test.go/TestStringFormat")) {
    it(testCase.name, () => {
      const typeRegistry = registry();
      typeRegistry.registerDescriptor(file_test_proto3pb_test_all_types);
      nativeTypes({
        registry: typeRegistry,
        types: [
          nativeType({
            typeName: "ext.TestAllTypes",
            fields: [
              nativeField({
                celName: "PbVal",
                property: "pbVal",
                type: objectType("google.expr.proto3.test.TestAllTypes"),
              }),
            ],
          }),
        ],
      });
      const inputs = resolveFormattingInputs(testCase.dynArgs ?? {});
      const celEnv = env({
        container: container({ abbrevs: ["google.expr.proto3.test"] }),
        libraries: [strings({ locale: testCase.locale, version: 3 })],
        registry: typeRegistry,
        variables: Object.keys(inputs).map((name) => variable(name, DynType)),
      });
      const expression = `${JSON.stringify(testCase.format)}.format([${
        testCase.formatArgs ?? ""
      }])`;
      const compiled = celEnv.tryCompile(expression);
      if (testCase.err && compiled.errors) {
        expect(compiled.errors.toDisplayString(), testCase.name).toContain(testCase.err);
        return;
      }
      const result = celEnv
        .program(testCase.err ? celEnv.parse(expression) : compiled.ast)
        .eval(inputs);
      if (testCase.err) {
        expect(String(result), testCase.name).toContain(testCase.err);
      } else {
        expect(result.value(), testCase.name).toBe(resolveExpected(testCase.expectedOutput));
      }
    });
  }
});

describe("ext/formatting_test.go/TestStringFormatHeterogeneousLiterals", () => {
  it("formats every synchronized heterogeneous literal", () => {
    const celEnv = env({ libraries: [strings({ version: 3 })] });
    for (const testCase of syncedCases<HeterogeneousFormatCase>(
      "ext/formatting_test.go/TestStringFormatHeterogeneousLiterals",
    )) {
      expect(celEnv.program(celEnv.compile(testCase.expr)).eval({}).value(), testCase.expr).toBe(
        testCase.out,
      );
    }
  });
});

describe("ext/formatting_test.go/TestBadLocale", () => {
  it("rejects an unknown locale", () => {
    expect(() => strings({ locale: "bad-locale", version: 3 })).toThrow("failed to parse locale");
  });
});

describe("ext/formatting_test.go/TestLiteralOutput", () => {
  it("formats synchronized aggregate literals into parseable CEL", () => {
    const celEnv = env({ libraries: [strings({ version: 3 })] });
    for (const testCase of syncedCases<LiteralOutputCase>(
      "ext/formatting_test.go/TestLiteralOutput",
    )) {
      const formatted = celEnv
        .program(celEnv.compile(`"%s".format([${testCase.formatLiteral}])`))
        .eval({})
        .value() as string;
      expect(
        celEnv
          .program(celEnv.compile(`type(${formatted})`))
          .eval({})
          .value(),
        testCase.name,
      ).toBe(testCase.expectedType);
    }
  });
});

/**
 * resolveExpected resolves the generated high-precision fixture expression.
 */
function resolveExpected(value: LegacyFormatCase["expectedOutput"]): string | undefined {
  if (typeof value === "string" || value === undefined) {
    return value;
  }
  if (value.$expr === '"1." + strings.Repeat("0", 200)') {
    return `1.${"0".repeat(200)}`;
  }
  throw new Error(`unsupported formatting expectation: ${value.$expr}`);
}

/**
 * resolveFormattingInputs converts synchronized CEL-Go native values to TypeScript equivalents.
 */
function resolveFormattingInputs(values: Record<string, unknown>): Record<string, unknown> {
  if ("dynMap" in values) {
    return {
      dynMap: refValMap(
        DefaultTypeAdapter,
        new Map<Val, Val>([
          [new Int(6n), durationOf(422_000_000_000n)],
          [new CelString("strKey"), new CelString("x")],
          [True, new Int(42n)],
        ]),
      ),
    };
  }
  const resolved: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    resolved[name] = resolveFormattingInput(value);
  }
  return resolved;
}

/**
 * resolveFormattingInput decodes one synchronized native-value expression.
 */
function resolveFormattingInput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(resolveFormattingInput);
  }
  if (typeof value !== "object" || value === null || !("$expr" in value)) {
    return value;
  }
  const expression = String((value as { $expr: unknown }).$expr);
  const uint = /^uint(?:64)?\((\d+)\)$/.exec(expression);
  if (uint) {
    return new Uint(BigInt(uint[1]!));
  }
  if (expression === "math.Inf(1)") {
    return Infinity;
  }
  if (expression === "math.Inf(-1)") {
    return -Infinity;
  }
  if (expression === "math.NaN()") {
    return Number.NaN;
  }
  if (expression.includes("time.Date(2009")) {
    return new Date("2009-11-10T23:00:00Z");
  }
  const duration = /^mustParseDuration\("([^"]+)"\)$/.exec(expression);
  if (duration) {
    return durationOf(parseFormattingDuration(duration[1]!));
  }
  if (expression.includes("&proto3pb.TestAllTypes")) {
    return {
      $typeName: "google.expr.proto3.test.TestAllTypes",
      singleDouble: 1,
      singleInt32: 2,
    };
  }
  throw new Error(`unsupported synchronized formatting input: ${expression}`);
}

/**
 * parseFormattingDuration converts fixture duration text to nanoseconds.
 */
function parseFormattingDuration(value: string): bigint {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match) {
    throw new Error(`unsupported synchronized duration: ${value}`);
  }
  return (
    (BigInt(match[1] ?? 0) * 3600n + BigInt(match[2] ?? 0) * 60n + BigInt(match[3] ?? 0)) *
    1_000_000_000n
  );
}
