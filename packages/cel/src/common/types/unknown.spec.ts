import { describe, expect, it } from "vitest";
import {
  attributeTrail,
  type Bool,
  String as CelString,
  isUnknown,
  maybeMergeUnknowns,
  mergeUnknowns,
  qualifyAttribute,
  unknown,
} from "./index.js";

describe("common/types unknown", () => {
  it("common/types/unknown_test.go/TestIsUnknown", () => {
    expect(isUnknown(unknown(1))).toBe(true);
    expect(isUnknown(new CelString("a") as never)).toBe(false);
  });

  it("common/types/unknown_test.go/TestNewAttribute", () => {
    expect(attributeTrail("")).toBe(attributeTrail(""));
    expect(attributeTrail("v").equal(attributeTrail(""))).toBe(false);
  });

  it("common/types/unknown_test.go/TestAttributeEquals", () => {
    expect(attributeTrail("").equal(attributeTrail(""))).toBe(true);
    expect(attributeTrail("a").equal(attributeTrail(""))).toBe(false);
    expect(
      qualifyAttribute(attributeTrail("a"), "b").equal(qualifyAttribute(attributeTrail("a"), "b")),
    ).toBe(true);
  });

  it("common/types/unknown_test.go/TestAttributeString", () => {
    expect(attributeTrail("").toString()).toBe("<unspecified>");
    expect(attributeTrail("a").toString()).toBe("a");
    expect(qualifyAttribute(attributeTrail("a"), "b").toString()).toBe("a.b");
    expect(qualifyAttribute(attributeTrail("a"), 12).toString()).toBe("a[12]");
  });

  it("common/types/unknown_test.go/TestUnknownContains", () => {
    expect(unknown(1).contains(unknown(1))).toBe(true);
    expect(
      mergeUnknowns(
        unknown(3, qualifyAttribute(attributeTrail("a"), true)),
        unknown(4, qualifyAttribute(attributeTrail("a"), "b")),
      )!.contains(unknown(3, qualifyAttribute(attributeTrail("a"), true))),
    ).toBe(true);
  });

  it("common/types/unknown_test.go/TestUnknownIDs", () => {
    const merged = mergeUnknowns(
      unknown(4, qualifyAttribute(attributeTrail("a"), "b")),
      unknown(3, qualifyAttribute(attributeTrail("a"), true)),
    )!;
    expect(merged.ids()).toEqual([3, 4]);
  });

  it("common/types/unknown_test.go/TestUnknownString", () => {
    expect(unknown(1).toString()).toBe("<unspecified> (1)");
    const merged = mergeUnknowns(
      unknown(3, qualifyAttribute(attributeTrail("a"), true)),
      unknown(4, qualifyAttribute(attributeTrail("a"), "b")),
    )!;
    expect(merged.toString()).toContain("a[true] (3)");
    expect(merged.toString()).toContain("a.b (4)");
  });

  it("common/types/unknown_test.go/TestMaybeMergeUnknowns", () => {
    expect(maybeMergeUnknowns(new CelString(""), undefined)).toEqual([undefined, false]);
    const merged = maybeMergeUnknowns(
      unknown(2, attributeTrail("x")),
      unknown(1, attributeTrail("y")),
    );
    expect(merged[1]).toBe(true);
    expect(
      merged[0]?.contains(
        mergeUnknowns(unknown(2, attributeTrail("x")), unknown(1, attributeTrail("y")))!,
      ),
    ).toBe(true);
  });

  it("extra/unknown equal identity", () => {
    const value = unknown(1);
    expect(value.equal(unknown(2))).toBe(value);
    expect(
      (value.convertToType(new CelString("").type()) as Bool | typeof value).type().typeName(),
    ).toBe("unknown");
  });
});
