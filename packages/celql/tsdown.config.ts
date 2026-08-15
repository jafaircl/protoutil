import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/ansisql/index.ts",
    "src/mongodb/index.ts",
    "src/mysql/index.ts",
    "src/postgresql/index.ts",
    "src/sqlite/index.ts",
  ],
  exports: true,
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.json",
});
