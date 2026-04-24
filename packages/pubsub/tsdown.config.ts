import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "!src/*.spec.ts",
    "!src/**/*.spec.ts",
    "!src/test-cases.ts",
    "src/index.ts",
    "src/kafka/index.ts",
    "src/nats/index.ts",
    "src/rabbitmq/index.ts",
  ],
  exports: true,
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.json",
});
