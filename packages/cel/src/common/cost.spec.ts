import { describe, expect, it } from "vitest";
import {
  ConstCost,
  ListCreateBaseCost,
  MapCreateBaseCost,
  RegexStringLengthCostFactor,
  SelectAndIdentCost,
  StringTraversalCostFactor,
  StructCreateBaseCost,
} from "./cost.js";

describe("common/cost", () => {
  it("ports the upstream shared cost constants exactly", () => {
    expect(SelectAndIdentCost).toBe(1);
    expect(ConstCost).toBe(0);
    expect(ListCreateBaseCost).toBe(10);
    expect(MapCreateBaseCost).toBe(30);
    expect(StructCreateBaseCost).toBe(40);
    expect(StringTraversalCostFactor).toBe(0.1);
    expect(RegexStringLengthCostFactor).toBe(0.25);
  });
});
