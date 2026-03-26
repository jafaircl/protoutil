import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "!src/*.spec.ts",
    "!src/**/*.spec.ts",
    "src/index.ts",
    "src/errors/index.ts",
    "src/etag/index.ts",
    "src/fieldbehavior/index.ts",
    "src/filtering/index.ts",
    "src/orderby/index.ts",
    "src/pagination/index.ts",
    "src/resourcename/index.ts",
    "src/unittest/*.ts",
    "src/wkt/index.ts",
  ],
  exports: true,
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.json",
});
