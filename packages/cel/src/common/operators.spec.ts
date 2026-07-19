import { describe, expect, it } from "vitest";
import {
  Add,
  arity,
  Conditional,
  find,
  findReverse,
  findReverseBinaryOperator,
  In,
  Index,
  LogicalNot,
  OldIn,
  precedence,
} from "./operators.js";

describe("common/operators", () => {
  it("finds symbolic operators by text", () => {
    expect(find("+")).toEqual([Add, true]);
    expect(find("in")).toEqual([In, true]);
    expect(find("?")).toEqual(["", false]);
  });

  it("reverses operator symbols back to display names", () => {
    expect(findReverse(Add)).toEqual(["+", true]);
    expect(findReverse(OldIn)).toEqual(["in", true]);
    expect(findReverse(Conditional)).toEqual(["", true]);
    expect(findReverse("missing")).toEqual(["", false]);
  });

  it("returns reverse names only for displayable binary operators", () => {
    expect(findReverseBinaryOperator(Add)).toEqual(["+", true]);
    expect(findReverseBinaryOperator(Index)).toEqual(["", false]);
    expect(findReverseBinaryOperator(LogicalNot)).toEqual(["", false]);
  });

  it("reports precedence and arity using the upstream tables", () => {
    expect(precedence(Conditional)).toBe(8);
    expect(precedence(Add)).toBe(4);
    expect(precedence("missing")).toBe(0);
    expect(arity(Conditional)).toBe(3);
    expect(arity(LogicalNot)).toBe(1);
    expect(arity("missing")).toBe(-1);
  });
});
