import { describe, expect, it } from "vitest";
import { syncedCases } from "../../spec-helpers.js";
import { resolveSyncedPbExpr, syncedProtoEqual } from "./spec-helpers.js";

describe("common/types/pb/equal_test.go/TestEqual", () => {
  const cases = syncedCases<{
    a: unknown;
    b: unknown;
    name: string;
    out: boolean;
  }>("common/types/pb/equal_test.go/TestEqual");

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(
        syncedProtoEqual(resolveSyncedPbExpr(testCase.a), resolveSyncedPbExpr(testCase.b)),
      ).toBe(testCase.out);
    });
  }
});
