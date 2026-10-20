import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "!src/*.spec.ts",
    "!src/**/*.spec.ts",
    "src/google/rpc/index.ts",
    "src/google/type/index.ts",
    "src/index.ts",
    "src/wkt/index.ts",
    "src/gen/google/rpc/**/*.ts",
  ],
  // Hand-managed so the ./gen/*.js wildcard (used by map_imports in
  // dependent packages) survives a build.
  exports: false,
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.json",
});
