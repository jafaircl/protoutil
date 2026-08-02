import { describe, expect, it } from "vitest";
import { variableWithDoc } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { registry } from "../common/types/provider.js";
import { objectType } from "../common/types/types.js";
import { NestedTestAllTypesSchema } from "../gen/cel/expr/conformance/proto3/test_all_types_pb.js";
import { AllMacros } from "../parser/macro.js";
import { env } from "./env.js";
import { authoringPrompt, authoringPromptWithFieldPaths } from "./prompt.js";

describe("cel/prompt_test.go/TestPromptTemplate", () => {
  it("renders basic, macro, and standard environments", () => {
    const cases = syncedCases<{
      name: "basic" | "macros" | "standard_env";
    }>("cel/prompt_test.go/TestPromptTemplate");

    for (const testCase of cases) {
      const celEnv =
        testCase.name === "basic"
          ? env({ standardLibrary: false, macros: { standard: false } })
          : testCase.name === "macros"
            ? env({
                standardLibrary: false,
                macros: { standard: false, custom: AllMacros },
              })
            : env({ macros: { standard: false } });
      const output = authoringPrompt(celEnv).render("<USER_PROMPT>");

      expect(output).toContain("You are a software engineer");
      expect(output).toContain("<USER_PROMPT>");
      if (testCase.name === "basic") {
        expect(output).not.toContain("Only use the following variables");
      } else if (testCase.name === "macros") {
        expect(output).toContain("Macros:\n");
        expect(output).toContain("* has macro");
        expect(output).not.toContain("Functions:\n");
      } else {
        expect(output).toContain("Functions:\n");
        expect(output).toContain("* _+_");
        expect(output).not.toContain("Macros:\n");
      }
    }
  });
});

describe("cel/prompt_test.go/TestPromptTemplateFieldPaths", () => {
  it("includes reachable field paths for structure variables", () => {
    const cases = syncedCases<{ name: string }>("cel/prompt_test.go/TestPromptTemplateFieldPaths");
    const typeRegistry = registry();
    typeRegistry.registerDescriptor(NestedTestAllTypesSchema.file);
    const celEnv = env({
      registry: typeRegistry,
      variables: [
        variableWithDoc(
          "team",
          objectType(NestedTestAllTypesSchema.typeName),
          "A team of gifted youngsters",
        ),
      ],
      macros: { standard: false },
    });

    for (const testCase of cases) {
      const output = authoringPromptWithFieldPaths(celEnv).render("<USER_PROMPT>");
      expect(testCase.name).toBe("standard_env");
      expect(output).toContain("* name: `team`");
      expect(output).toContain("A team of gifted youngsters");
      expect(output).toContain("attributes:\n");
      expect(output).toContain("* path: `team.payload.single_int64`");
    }
  });
});

describe("cel/prompt_test.go/TestRenderSanitizesTemplateDirectives", () => {
  it("renders user input as literal text rather than template syntax", () => {
    const prompt = authoringPrompt(env());
    const cases = syncedCases<{
      input: string;
      name: string;
      wantAbsent?: string;
      wantLiteral: string;
    }>("cel/prompt_test.go/TestRenderSanitizesTemplateDirectives");

    for (const testCase of cases) {
      const output = prompt.render(testCase.input);
      expect(output, testCase.name).toContain(testCase.wantLiteral);
      if (testCase.wantAbsent !== undefined) {
        expect(output.split(testCase.wantAbsent).length, testCase.name).toBeLessThanOrEqual(2);
      }
    }
  });
});
