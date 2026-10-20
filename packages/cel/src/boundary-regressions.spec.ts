import { create } from "@bufbuild/protobuf";
import { TestAllTypesSchema } from "@protoutil/testing/cel/conformance/proto3";
import { describe, expect, it, vi } from "vitest";
import { retry, timeout } from "./cel/async.js";
import { env, unwrapAst } from "./cel/env.js";
import { astToParsedExpr, checkedExprToAst, parsedExprToAst } from "./cel/io.js";
import { variable } from "./common/decls.js";
import { Err } from "./common/types/err.js";
import { Int } from "./common/types/int.js";
import { DefaultTypeAdapter } from "./common/types/provider.js";
import { parseTimestamp } from "./common/types/timestamp.js";
import { DynType } from "./common/types/types.js";
import { CheckedExprSchema, ReferenceSchema } from "./gen/cel/expr/checked_pb.js";
import { ExprSchema, ParsedExprSchema, SourceInfoSchema } from "./gen/cel/expr/syntax_pb.js";

describe("native and protobuf boundaries", () => {
  const maps = env({ variables: [variable("m", DynType)] });
  const evaluate = (expression: string, m: unknown) =>
    maps.program(unwrapAst(maps.compile(expression))).eval({ m });

  it("excludes inherited record properties without invoking their getters", () => {
    const getter = vi.fn(() => true);
    const inherited = Object.create(Object.defineProperty({}, "admin", { get: getter }));
    expect(evaluate("has(m.admin)", inherited).value()).toBe(false);
    expect(evaluate('"toString" in m', {}).value()).toBe(false);
    expect(evaluate("has(m.__proto__)", {}).value()).toBe(false);
    expect(evaluate("size(m)", inherited).value()).toBe(0n);
    expect(getter).not.toHaveBeenCalled();
    expect(evaluate("m.__proto__", JSON.parse('{"__proto__":true}')).value()).toBe(true);
  });

  it.each(["m[1]", "m[true]"])("rejects non-string record key %s", (expression) => {
    expect(evaluate(expression, { "1": "one", true: "yes" })).toBeInstanceOf(Err);
  });

  it.each(["1 in m", "true in m"])("preserves key types for %s", (expression) => {
    expect(evaluate(expression, { "1": "one", true: "yes" }).value()).toBe(false);
  });

  it("preserves scalar descriptors in protobuf fields and containers", () => {
    const cel = env({ contextProto: TestAllTypesSchema });
    const message = create(TestAllTypesSchema, {
      singleDouble: 1,
      repeatedUint32: [1],
      repeatedUint64: [1n],
      repeatedDouble: [1],
      mapBoolUint32: { true: 1 },
      mapBoolDouble: { true: 1 },
    });
    for (const expression of [
      "type(single_double) == double",
      "repeated_uint32[0] + 1u == 2u",
      "type(repeated_uint64[0]) == uint",
      "type(repeated_double[0]) == double",
      "map_bool_uint32[true] + 1u == 2u",
      "type(map_bool_double[true]) == double",
    ]) {
      expect(
        cel
          .program(unwrapAst(cel.compile(expression)))
          .eval(message)
          .value(),
        expression,
      ).toBe(true);
    }
  });

  it("normalizes native Dates consistently with parsed timestamps", () => {
    const actual = DefaultTypeAdapter.nativeToValue(new Date(-1));
    expect(actual.equal(parseTimestamp("1969-12-31T23:59:59.999Z")).value()).toBe(true);
    expect(DefaultTypeAdapter.nativeToValue(new Date(Number.NaN))).toBeInstanceOf(Err);
  });

  it("excludes inherited protobuf map entries before reading them", () => {
    const getter = vi.fn(() => "yes");
    const message = create(TestAllTypesSchema);
    message.mapStringString = Object.create(Object.defineProperty({}, "admin", { get: getter }));
    const cel = env({ contextProto: TestAllTypesSchema });
    const program = cel.program(unwrapAst(cel.compile("has(map_string_string.admin)")));
    expect(program.eval(message).value()).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    message.mapStringString = JSON.parse('{"__proto__":"yes"}');
    expect(
      cel
        .program(unwrapAst(cel.compile("map_string_string.__proto__ == 'yes'")))
        .eval(message)
        .value(),
    ).toBe(true);
  });

  it("preserves __proto__ when constructing protobuf map fields from CEL", () => {
    const cel = env({ contextProto: TestAllTypesSchema });
    const expression = `${TestAllTypesSchema.typeName}{map_string_string: {'__proto__': 'yes'}}.map_string_string.__proto__ == 'yes'`;
    expect(
      cel
        .program(unwrapAst(cel.compile(expression)))
        .eval({})
        .value(),
    ).toBe(true);
  });
});

describe("protobuf expression IDs", () => {
  const unsafe = 9_007_199_254_740_993n;
  it("rejects unsafe expression IDs instead of rounding them", () => {
    const parsed = create(ParsedExprSchema, { expr: create(ExprSchema, { id: unsafe }) });
    expect(() => parsedExprToAst(parsed)).toThrow("safe integer range");
    parsed.expr!.id = BigInt(Number.MAX_SAFE_INTEGER);
    expect(astToParsedExpr(parsedExprToAst(parsed)).expr!.id).toBe(parsed.expr!.id);
  });

  it("rejects unsafe checked metadata and source IDs", () => {
    expect(() =>
      checkedExprToAst(
        create(CheckedExprSchema, {
          referenceMap: { [String(unsafe)]: create(ReferenceSchema, { name: "x" }) },
        }),
      ),
    ).toThrow("safe integer range");
    expect(() =>
      parsedExprToAst(
        create(ParsedExprSchema, {
          sourceInfo: create(SourceInfoSchema, { positions: { [String(unsafe)]: 0 } }),
        }),
      ),
    ).toThrow("safe integer range");
  });
});

describe("binding timeout cancellation", () => {
  it("does not start a retry operation for an already-cancelled caller", async () => {
    const binding = vi.fn(async () => new Int(1));
    const caller = new AbortController();
    caller.abort();
    expect(await retry({ binding })(caller.signal)).toBeInstanceOf(Err);
    expect(binding).not.toHaveBeenCalled();
  });

  it("settles when the binding synchronously aborts its caller", async () => {
    vi.useFakeTimers();
    try {
      const caller = new AbortController();
      const binding = timeout({
        timeoutMs: 5,
        binding: () => {
          caller.abort();
          return new Promise(() => {});
        },
      });
      const result = binding(caller.signal);
      await vi.advanceTimersByTimeAsync(10);
      expect(await result).toBeInstanceOf(Err);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not invoke a binding for an already-cancelled caller", async () => {
    const binding = vi.fn(async () => new Int(1));
    const caller = new AbortController();
    caller.abort();
    expect(await timeout({ timeoutMs: 5, binding })(caller.signal)).toBeInstanceOf(Err);
    expect(binding).not.toHaveBeenCalled();
  });
});
