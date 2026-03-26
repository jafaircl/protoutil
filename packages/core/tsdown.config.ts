import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "!src/*.spec.ts",
    "!src/**/*.spec.ts",
    "src/index.ts",
    "src/wkt/index.ts",
    "src/unittest/*.ts",
  ],
  exports: true,
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.json",
});
