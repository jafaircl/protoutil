import { describe, expect, it } from "vitest";
import { exprToProto } from "../common/ast/index.js";
import { stringSource } from "../common/source.js";
import { globalMacro, MapMacro, parser } from "./index.js";

describe("parser/helper_test.go", () => {
  describe("TestExprHelperCopy", () => {
    it("parser/helper_test.go/TestExprHelperCopy", () => {
      const src = stringSource(
        `noop([1, 2, 3].map(i, Msg{first: 1 + 2, second: a.b, third: {true: true}}))`,
        "",
      );
      const celParser = parser({
        populateMacroCalls: true,
        macros: new Map([
          ["map:2:true", MapMacro],
          ["noop:1:false", globalMacro("noop", 1, (eh, _target, args) => eh.copy(args[0]!))],
        ]),
      });
      const parsed = celParser.parseSource(src);
      const [macroTarget, found] = parsed.sourceInfo().getMacroCall(27);
      expect(found).toBe(true);
      expect(exprToProto(parsed.expr())).not.toEqual(exprToProto(macroTarget!));
    });
  });
});
