import { describe, expect, it } from "vitest";
import { DocKind } from "../index.js";
import { globalVarArgMacro, receiverVarArgMacro } from "../parser/macro.js";
import { macroKey } from "../parser/options.js";

describe("cel/macro_test.go/TestGlobalVarArgMacro", () => {
  it("creates a global variable-argument macro signature", () => {
    const macro = globalVarArgMacro("varargs", () => undefined);

    expect(macro.argCount).toBe("*");
    expect(macro.function).toBe("varargs");
    expect(macroKey(macro.function, macro.argCount, macro.receiverStyle)).toBe("varargs:*:false");
    expect(macro.receiverStyle).toBe(false);
  });
});

describe("cel/macro_test.go/TestReceiverVarArgMacro", () => {
  it("creates a receiver variable-argument macro signature", () => {
    const macro = receiverVarArgMacro("varargs", () => undefined);

    expect(macro.argCount).toBe("*");
    expect(macro.function).toBe("varargs");
    expect(macroKey(macro.function, macro.argCount, macro.receiverStyle)).toBe("varargs:*:true");
    expect(macro.receiverStyle).toBe(true);
  });
});

describe("cel/macro_test.go/TestDocumentation", () => {
  it("provides macro documentation and examples", () => {
    const macro = receiverVarArgMacro("varargs", () => undefined, {
      description: "convert variable argument lists to a list literal",
      examples: ["fn.varargs(1,2,3) // fn([1, 2, 3])"],
    });
    const documentation = macro.documentation?.();

    expect(documentation?.kind).toBe(DocKind.Macro);
    expect(documentation?.name).toBe(macro.function);
    expect(documentation?.description).toBe("convert variable argument lists to a list literal");
    expect(documentation?.children).toHaveLength(1);
    expect(documentation?.children[0]?.description).toBe("fn.varargs(1,2,3) // fn([1, 2, 3])");
  });
});
