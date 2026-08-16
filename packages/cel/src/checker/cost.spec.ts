import { create } from "@bufbuild/protobuf";
import { TestAllTypesSchema as Proto3TestAllTypesSchema } from "@protoutil/testing/cel/proto3";
import { describe, expect, it } from "vitest";
import { unwrapAst } from "../cel/env.js";
import { defaultContainer } from "../common/containers.js";
import { func, memberOverload } from "../common/decls.js";
import { textSource } from "../common/source.js";
import { syncedCases } from "../common/spec-helpers.js";
import { standardFunctions } from "../common/stdlib.js";
import { BytesType, listType, registry } from "../common/types/index.js";
import { parse } from "../parser/parser.js";
import { check } from "./checker.js";
import { CallEstimate, cost, SizeEstimate, sizeEstimate } from "./cost.js";
import { env } from "./env.js";
import { resolveCostCase, type SyncedCostCase } from "./spec-helpers.js";

function standardEnv(vars: Array<ReturnType<typeof func>> | Array<unknown> = []) {
  const checkerEnv = env(
    defaultContainer,
    registry([create(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema]),
  );
  checkerEnv.addFunctions(
    ...standardFunctions(),
    func("max", {
      overloads: [memberOverload("list_bytes_max", [listType(BytesType)], BytesType)],
    }),
  );
  if (vars.length !== 0) {
    checkerEnv.addIdents(...(vars as Parameters<typeof checkerEnv.addIdents>));
  }
  return checkerEnv;
}

const testEstimator = {
  estimateSize(element: { path(): string[] | undefined; type(): { kind(): number } }) {
    const hints = currentHints;
    const path = element.path();
    if (path) {
      const hinted = hints[path.join(".")];
      if (hinted !== undefined) {
        return new SizeEstimate(0n, BigInt(hinted));
      }
    }
    if (element.type().kind() === 4) {
      return new SizeEstimate(0n, 12n);
    }
    return undefined;
  },
  estimateCallCost(_functionName: string, overloadId: string) {
    if (overloadId === "timestamp_to_year") {
      return new CallEstimate(7n, 7n);
    }
    return undefined;
  },
};

let currentHints: Record<string, number> = {};

describe("functional cost API", () => {
  it("creates a size estimate from an option object", () => {
    const estimate = sizeEstimate(1n, 10n);

    expect(estimate.Min).toBe(1n);
    expect(estimate.Max).toBe(10n);
  });
});

describe("checker/cost_test.go/TestCost", () => {
  for (const [index, testCase] of syncedCases<SyncedCostCase>(
    "checker/cost_test.go/TestCost",
  ).entries()) {
    it(`checker/cost_test.go/TestCost/${testCase.name || index + 1}`, () => {
      const resolved = resolveCostCase(testCase);
      currentHints = resolved.hints;
      const parsed = unwrapAst(parse(resolved.expr));
      const checked = unwrapAst(
        check(parsed, textSource(resolved.expr), standardEnv(resolved.vars)),
      );
      const actual = cost(checked, testEstimator as never, resolved.options);
      expect(actual.Min).toBe(resolved.wanted.Min);
      expect(actual.Max).toBe(resolved.wanted.Max);
    });
  }
});
