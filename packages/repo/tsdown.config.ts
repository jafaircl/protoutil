import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "!src/*.spec.ts",
    "!src/**/*.spec.ts",
    "src/index.ts",
    "src/sqlite/index.ts",
    "src/postgres/index.ts",
    "src/mysql/index.ts",
    "src/mongodb/index.ts",
  ],
  exports: true,
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.json",
});
