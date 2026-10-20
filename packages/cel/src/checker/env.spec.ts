import { describe, expect, it } from "vitest";
import { unwrapAst } from "../cel/env.js";
import { container, defaultContainer } from "../common/containers.js";
import { func, overload } from "../common/decls.js";
import { textSource } from "../common/source.js";
import { standardFunctions } from "../common/stdlib.js";
import { BoolType, StringType } from "../common/types/index.js";
import { registry } from "../common/types/provider.js";
import { parseSource } from "../parser/parser.js";
import { check } from "./checker.js";
import { env } from "./env.js";
import { validatedDeclarations } from "./options.js";

describe("checker/env", () => {
  it("checker/env_test.go/TestOverlappingMacro", () => {
    const e = env(defaultContainer, registry());
    e.addFunctions(...standardFunctions());
    expect(() =>
      e.addFunctions(func("has", { overloads: [overload("has", [StringType], BoolType)] })),
    ).toThrow(/overlapping macro/);
  });

  it("checker/env_test.go/TestCopyDeclarations", () => {
    const source = textSource("1 + 2 != 3 - 4");
    const parsed = unwrapAst(parseSource(source));

    const original = env(defaultContainer, registry());
    original.addFunctions(...standardFunctions());
    const originalResult = check(parsed, source, original);
    expect(originalResult.errors).toBeUndefined();

    const copy = env(container(), registry(), {
      validatedDeclarations: validatedDeclarations(original),
    });
    const copiedResult = check(parsed, source, copy);
    expect(copiedResult.errors).toBeUndefined();
  });
});
