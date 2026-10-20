import { describe, expect, it } from "vitest";
import { DocKind } from "../common/doc.js";
import { macroKey, receiverVarArgMacro } from "./index.js";

describe("parser/macro_test.go", () => {
  describe("TestReceiverVarArgMacro", () => {
    it("parser/macro_test.go/TestReceiverVarArgMacro", () => {
      const varArgMacro = receiverVarArgMacro("varargs", () => undefined, {
        description: "convert variable argument lists to a list literal",
        examples: ["varargs(1,2,3) // [1, 2, 3]"],
      });
      expect(varArgMacro.argCount).toBe("*");
      expect(varArgMacro.function).toBe("varargs");
      expect(macroKey(varArgMacro.function, varArgMacro.argCount, varArgMacro.receiverStyle)).toBe(
        "varargs:*:true",
      );
      expect(varArgMacro.receiverStyle).toBe(true);
    });
  });

  describe("TestDocumentation", () => {
    it("parser/macro_test.go/TestDocumentation", () => {
      const varArgMacro = receiverVarArgMacro("varargs", () => undefined, {
        description: "convert variable argument lists to a list literal",
        examples: ["varargs(1,2,3) // [1, 2, 3]"],
      });
      const documentation = varArgMacro.documentation?.();
      expect(documentation?.kind).toBe(DocKind.Macro);
      expect(documentation?.name).toBe(varArgMacro.function);
      expect(documentation?.description).toBe("convert variable argument lists to a list literal");
      expect(documentation?.children).toHaveLength(1);
      expect(documentation?.children[0]?.description).toBe("varargs(1,2,3) // [1, 2, 3]");
    });
  });
});
