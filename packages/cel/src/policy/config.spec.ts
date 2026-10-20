import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { configFromYAML } from "../common/env/io.js";
import { syncedCases } from "../common/spec-helpers.js";
import { fromConfig } from "./config.js";

/** ConfigErrorCase is one synchronized TestConfigErrors row. */
interface ConfigErrorCase {
  /** config contains an invalid environment configuration. */
  config: string;
  /** err is the expected configuration diagnostic. */
  err: string;
}

describe("policy/config_test.go/TestConfig", () => {
  it("applies a valid policy environment configuration", () => {
    const configured = env().extend(
      fromConfig(
        configFromYAML(`
name: policy
variables:
  - name: request
    type:
      type_name: string
`),
      ),
    );
    expect(configured.variables().map((value) => value.name())).toContain("request");
  });
});

describe("policy/config_test.go/TestConfigErrors", () => {
  for (const testCase of syncedCases<ConfigErrorCase>("policy/config_test.go/TestConfigErrors")) {
    it(testCase.err, () => {
      expect(() => env().extend(fromConfig(configFromYAML(testCase.config)))).toThrow(testCase.err);
    });
  }
});
