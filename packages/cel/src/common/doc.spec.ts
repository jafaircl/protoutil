import { describe, expect, it } from "vitest";
import { parseDescription, parseDescriptions } from "./doc.js";
import { resolveDocKind, resolveNewDoc, syncedCases } from "./spec-helpers.js";

describe("doc", () => {
  it("common/doc_test.go/TestParseDescription", () => {
    const cases = syncedCases<{ in?: string; out?: string }>(
      "common/doc_test.go/TestParseDescription",
    );
    for (const testCase of cases) {
      expect(parseDescription(testCase.in ?? "")).toBe(testCase.out ?? "");
    }
  });

  it("common/doc_test.go/TestParseDescriptions", () => {
    const cases = syncedCases<{ in?: string; out?: string[] }>(
      "common/doc_test.go/TestParseDescriptions",
    );
    for (const testCase of cases) {
      expect(parseDescriptions(testCase.in ?? "")).toEqual(testCase.out ?? []);
    }
  });

  it("common/doc_test.go/TestNewDoc", () => {
    const cases = syncedCases<{
      newDoc: { $expr?: string };
      kind: { $expr?: string };
      name: string;
      desc: string;
      childCount: number;
      celType?: string;
    }>("common/doc_test.go/TestNewDoc");
    for (const testCase of cases) {
      const doc = resolveNewDoc(testCase.newDoc);
      expect(doc.kind).toBe(resolveDocKind(testCase.kind));
      expect(doc.name).toBe(testCase.name);
      expect(doc.description).toBe(testCase.desc);
      expect(doc.children).toHaveLength(testCase.childCount);
      if (testCase.celType) {
        expect(doc.type).toBe(testCase.celType);
      }
    }
  });
});
