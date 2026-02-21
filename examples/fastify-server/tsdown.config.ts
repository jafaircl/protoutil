import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/app.ts", "src/server.ts", "!test/**/*.ts", "!src/*.spec.ts", "!src/**/*.spec.ts"],
  exports: true,
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.json",
});
