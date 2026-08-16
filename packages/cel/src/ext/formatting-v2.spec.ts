import { file_test_proto3pb_test_all_types } from "@protoutil/testing/cel/proto3";
import { describe, expect, it } from "vitest";
import { env, unwrapAst } from "../cel/env.js";
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

/** FormatCase describes one synchronized version-four string formatting case. */
interface FormatCase {
  /** dynArgs contains native activation values keyed by dynamic variable name. */
  dynArgs?: Record<string, unknown>;
  /** err contains the expected compile-time or runtime error fragment. */
  err?: string;
  /** expectedOutput contains the formatted string. */
  expectedOutput?: string;
  /** format contains the source format string. */
  format: string;
  /** formatArgs contains CEL source expressions separated by commas. */
  formatArgs?: string;
  /** name identifies the upstream table row. */
  name: string;
}

/** HeterogeneousFormatCase describes a synchronized direct CEL formatting expression. */
interface HeterogeneousFormatCase {
  /** expr contains the CEL expression under test. */
  expr: string;
  /** out contains the expected string result. */
  out: string;
}

describe("ext/formatting_v2_test.go/TestStringsWithExtensionV2", () => {
  it("applies the version-four singleton library once", () => {
    const celEnv = env({ libraries: [strings()] }).extend({
      libraries: [strings()],
    });
    expect(
      celEnv
        .program(unwrapAst(celEnv.compile(`"%s".format(["ok"])`)))
        .eval({})
        .value(),
    ).toBe("ok");
  });
});

describe("ext/formatting_v2_test.go/TestStringFormatV2", () => {
  for (const testCase of syncedCases<FormatCase>("ext/formatting_v2_test.go/TestStringFormatV2")) {
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
        libraries: [strings()],
        registry: typeRegistry,
        variables: Object.keys(inputs).map((name) => variable(name, DynType)),
      });
      const expression = `${JSON.stringify(testCase.format)}.format([${
        testCase.formatArgs ?? ""
      }])`;
      const compileResult = celEnv.compile(expression);
      if (testCase.err && compileResult.errors) {
        expect(compileResult.errors.toDisplayString(), testCase.name).toContain(testCase.err);
        return;
      }
      const ast = testCase.err ? unwrapAst(celEnv.parse(expression)) : compileResult.ast;
      const result = celEnv.program(ast).eval(inputs);
      if (testCase.err) {
        expect(String(result), testCase.name).toContain(testCase.err);
      } else {
        expect(result.value(), testCase.name).toBe(testCase.expectedOutput);
      }
    });
  }
});

describe("ext/formatting_v2_test.go/TestStringFormatHeterogeneousLiteralsV2", () => {
  it("formats every synchronized heterogeneous literal", () => {
    const celEnv = env({ libraries: [strings()] });
    for (const testCase of syncedCases<HeterogeneousFormatCase>(
      "ext/formatting_v2_test.go/TestStringFormatHeterogeneousLiteralsV2",
    )) {
      expect(
        celEnv
          .program(unwrapAst(celEnv.compile(testCase.expr)))
          .eval({})
          .value(),
        testCase.expr,
      ).toBe(testCase.out);
    }
  });
});

/** resolveFormattingInputs converts synchronized CEL-Go native values to TypeScript equivalents. */
// biome-ignore lint/suspicious/noExportsInTest: needed for other tests
export function resolveFormattingInputs(values: Record<string, unknown>): Record<string, unknown> {
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
    resolved[name] = resolveInputValue(value);
  }
  return resolved;
}

/** resolveInputValue decodes one synchronized native-value expression. */
function resolveInputValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(resolveInputValue);
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
    return durationOf(parseDuration(duration[1]!));
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

/** parseDuration converts the duration forms used by synchronized formatting rows to nanoseconds. */
function parseDuration(value: string): bigint {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match) {
    throw new Error(`unsupported synchronized duration: ${value}`);
  }
  const seconds =
    BigInt(match[1] ?? 0) * 3600n + BigInt(match[2] ?? 0) * 60n + BigInt(match[3] ?? 0);
  return seconds * 1_000_000_000n;
}
