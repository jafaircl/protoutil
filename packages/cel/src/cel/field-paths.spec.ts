import {
  NestedTestAllTypesSchema,
  TestAllTypesSchema,
} from "@protoutil/testing/cel/conformance/proto3";
import { describe, expect, it } from "vitest";
import { syncedCases } from "../common/spec-helpers.js";
import { fieldPathsForType, objectType, registry } from "../index.js";

describe("cel/fieldpaths_test.go/TestFieldPathsForTestAllTypes", () => {
  it("expands the synced reachable field paths", () => {
    const cases = syncedCases<{
      isLeaf: boolean;
      path: string;
      typeName: string;
    }>("cel/fieldpaths_test.go/TestFieldPathsForTestAllTypes");
    const provider = registry();
    provider.registerDescriptor(TestAllTypesSchema.file);

    const paths = fieldPathsForType({
      identifier: "t",
      provider,
      type: objectType(NestedTestAllTypesSchema.typeName),
    });

    for (const testCase of cases) {
      const path = paths.find((candidate) => candidate.path === testCase.path);

      expect(path, testCase.path).toBeDefined();
      expect(path?.type.toString(), testCase.path).toBe(testCase.typeName);
      expect(path?.isLeaf, testCase.path).toBe(testCase.isLeaf);
    }
  });
});
