import { describe, expect, it } from "vitest";
import { infoSource, SourceLocation, stringSource, textSourceWithLimit } from "./index.js";

describe("common/source", () => {
  it("common/source_test.go/TestStringSource_Description", () => {
    const contents = "example content\nsecond line";
    const source = stringSource(contents, "description-test");

    expect(source.content()).toBe(contents);
    expect(source.description()).toBe("description-test");
    expect(source.snippet(2)).toEqual(["second line", true]);
    expect(source.snippet(1)).toEqual(["example content", true]);
  });

  it("common/source_test.go/TestStringSource_LocationOffset", () => {
    const contents = "c.d &&\n\t b.c.arg(10) &&\n\t test(10)";
    const source = stringSource(contents, "offset-test");

    expect(source.lineOffsets()).toEqual([7, 24, 35]);

    const [start] = source.locationOffset(new SourceLocation(1, 2));
    const [end] = source.locationOffset(new SourceLocation(3, 2));
    expect(contents.slice(start, end)).toBe("d &&\n\t b.c.arg(10) &&\n\t ");
    expect(source.locationOffset(new SourceLocation(4, 0))[1]).toBe(false);
  });

  it("common/source_test.go/TestStringSource_SnippetMultiline", () => {
    const source = stringSource("hello\nworld\nmy\nbub\n", "four-line-test");
    expect(source.snippet(1)).toEqual(["hello", true]);
    expect(source.snippet(2)).toEqual(["world", true]);
    expect(source.snippet(3)).toEqual(["my", true]);
    expect(source.snippet(4)).toEqual(["bub", true]);
    expect(source.snippet(5)).toEqual(["", true]);
  });

  it("common/source_test.go/TestStringSource_SnippetSingleline", () => {
    const source = stringSource("hello, world", "one-line-test");
    expect(source.snippet(1)).toEqual(["hello, world", true]);
    expect(source.snippet(2)).toEqual(["", false]);
  });

  it("common/source_test.go/TestNewInfoSource_NoPanicOnNil", () => {
    expect(() => infoSource(undefined)).not.toThrow();
  });

  it("common/source_test.go/TestNewTextSourceWithLimit_Exceeded", () => {
    expect(() => textSourceWithLimit("greetings", 5)).toThrow(/size exceeds limit/);
  });

  it("common/source_test.go/TestNewTextSourceWithLimit_MultibyteWithinLimit", () => {
    expect(textSourceWithLimit("🙂🙂", 2).content()).toBe("🙂🙂");
  });
});
