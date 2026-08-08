import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "!src/*.spec.ts",
    "!src/**/*.spec.ts",
    "src/index.ts",
    "src/runtime.ts",
    "src/common/index.ts",
    "src/parser/index.ts",
    "src/parser/macro.ts",
    "src/checker/index.ts",
    "src/interpreter/index.ts",
    "src/composition/index.ts",
    "src/ext/index.ts",
    "src/policy/index.ts",
    "src/gen/cel/expr/**/*.ts",
  ],
  exports: false,
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.json",
});
