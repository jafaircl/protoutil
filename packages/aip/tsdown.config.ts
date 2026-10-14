import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "!src/*.spec.ts",
    "!src/**/*.spec.ts",
    "src/errors/index.ts",
    "src/etag/index.ts",
    "src/fieldbehavior/index.ts",
    "src/filtering/index.ts",
    "src/orderby/index.ts",
    "src/pagination/index.ts",
    "src/resourcename/index.ts",
    "src/gen/google/api/field_behavior_pb.ts",
  ],
  // Hand-managed so the ./gen/*.js wildcard (used by map_imports in
  // dependent packages) survives a build.
  exports: false,
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.json",
});
