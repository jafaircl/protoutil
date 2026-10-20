import { describe, expect, it } from "vitest";
import {
  AsciiBuffer,
  BasicBuffer,
  bufferAndLineOffsetsWithLimit,
  bufferFromString,
  EmptyBuffer,
  SupplementalBuffer,
} from "./index.js";

describe("common/runes/buffer", () => {
  it("common/runes/buffer_test.go/TestNewBuffer_ASCII", () => {
    const data = "hello world!";
    const buffer = bufferFromString(data);
    expect(buffer.len()).toBe(Array.from(data).length);
    expect(buffer.slice(0, buffer.len())).toBe(data);
    expect(buffer.get(8)).toBe("r".codePointAt(0));
    expect(buffer).toBeInstanceOf(AsciiBuffer);
  });

  it("common/runes/buffer_test.go/TestNewBuffer_Basic", () => {
    const data = "hello w\u04E7rld!";
    const buffer = bufferFromString(data);
    expect(buffer.len()).toBe(Array.from(data).length);
    expect(buffer.slice(0, buffer.len())).toBe(data);
    expect(buffer.get(8)).toBe("r".codePointAt(0));
    expect(buffer).toBeInstanceOf(BasicBuffer);
  });

  it("common/runes/buffer_test.go/TestNewBuffer_Supplemental", () => {
    const data = "hello w🙂rld!";
    const buffer = bufferFromString(data);
    expect(buffer.len()).toBe(Array.from(data).length);
    expect(buffer.slice(0, buffer.len())).toBe(data);
    expect(buffer.get(8)).toBe("r".codePointAt(0));
    expect(buffer).toBeInstanceOf(SupplementalBuffer);
  });

  it("common/runes/buffer_test.go/TestNewBuffer_All", () => {
    const data = "hell\u04E7 w🙂rld!";
    const buffer = bufferFromString(data);
    expect(buffer.len()).toBe(Array.from(data).length);
    expect(buffer.slice(0, buffer.len())).toBe(data);
    expect(buffer.get(8)).toBe("r".codePointAt(0));
    expect(buffer).toBeInstanceOf(SupplementalBuffer);
  });

  it("common/runes/buffer_test.go/TestNewBuffer_Empty", () => {
    const data = "";
    const buffer = bufferFromString(data);
    expect(buffer.len()).toBe(Array.from(data).length);
    expect(buffer.slice(0, buffer.len())).toBe(data);
    expect(buffer).toBeInstanceOf(EmptyBuffer);
  });

  it("common/runes/buffer_test.go/TestNewBufferAndLineOffsetsWithLimit_Exceeded", () => {
    const [, , err] = bufferAndLineOffsetsWithLimit("greetings", 5);
    expect(err?.message).toBe("expression code point size exceeds limit: size: 9, limit 5");
  });

  it("common/runes/buffer_test.go/TestNewBufferAndLineOffsetsWithLimit_MultibyteWithinLimit", () => {
    const data = "🙂🙂";
    const [buffer, offsets, err] = bufferAndLineOffsetsWithLimit(data, 2);
    expect(err).toBeUndefined();
    expect(buffer.len()).toBe(2);
    expect(buffer.slice(0, buffer.len())).toBe(data);
    expect(offsets).toHaveLength(1);
  });
});
